#!/usr/bin/env node
/** Auditoría estática. Ejecutar desde la raíz: node <ruta>/inventario-modulos.cjs > grafo-modulos.json
 * No importa módulos de la aplicación, no lee .env ni abre conexiones de datos.
 * Incluye cambios nuevos no ignorados. El informe usa únicamente rutas relativas.
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const detailed = process.argv.includes('--detalle');
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const requireProject = createRequire(path.join(root, 'package.json'));
const ts = requireProject('typescript');
const files = [...new Set(cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].filter(f => fs.existsSync(path.join(root, f))).sort();
const source = files.filter(f => /\.(?:[cm]?ts|tsx|jsx|[cm]?js)$/.test(f) && !f.endsWith('.d.ts') && !/^(docs|output|outputs)\//.test(f));
const sourceSet = new Set(source);
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const graph = new Map(source.map(f => [f, new Set()]));
const graphRuntime = new Map(source.map(f => [f, new Set()]));
const incoming = new Map();
const packages = new Map();
const dynamic = [];
const unresolvedLocal = [];
const assetImports = [];
const serverOnly = new Set();
const hashes = {};
const importEdges = [];
function add(from, spec, typeOnly, line) {
  if (spec === 'server-only' && !typeOnly) serverOnly.add(from);
  const resolved = ts.resolveModuleName(spec, path.join(root, from), options, ts.sys).resolvedModule;
  const local = spec.startsWith('.') || spec.startsWith('@/');
  if (!local) {
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!packages.has(name)) packages.set(name, new Set());
    packages.get(name).add(from);
  }
  if (!resolved) {
    if (local) {
      const asset = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(root, path.dirname(from), spec);
      if (fs.existsSync(asset)) assetImports.push({ file: from, line, asset: path.relative(root, asset) });
      else unresolvedLocal.push({ file: from, line, specifier: spec });
    }
    return;
  }
  const target = path.relative(root, resolved.resolvedFileName);
  if (!sourceSet.has(target)) return;
  graph.get(from).add(target);
  if (!typeOnly) graphRuntime.get(from).add(target);
  if (!incoming.has(target)) incoming.set(target, new Set());
  incoming.get(target).add(from);
  importEdges.push({ from, to: target, typeOnly });
}
for (const file of source) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  hashes[file] = crypto.createHash('sha256').update(text).digest('hex');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function walk(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      let typeOnly = Boolean(n.isTypeOnly || n.importClause?.isTypeOnly);
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamedImports(named) && !n.importClause.name && named.elements.length > 0 && named.elements.every(e => e.isTypeOnly)) typeOnly = true;
      add(file, n.moduleSpecifier.text, typeOnly, sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
    }
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      if (n.arguments[0] && ts.isStringLiteral(n.arguments[0])) add(file, n.arguments[0].text, false, line);
      else dynamic.push({ file, line });
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
}
function reachable(roots, edges = graph) {
  const seen = new Set();
  function visit(f) { if (seen.has(f)) return; seen.add(f); for (const next of edges.get(f) || []) visit(next); }
  roots.forEach(visit); return seen;
}
const tests = source.filter(f => /\.(test|spec)\./.test(f) || f.includes('/__fixtures__/'));
const entries = source.filter(f => /^src\/app\/(?:.*\/)?(?:page|layout|route|loading|error|global-error|not-found|default|template|forbidden|unauthorized|sitemap|robots|manifest|icon|apple-icon|opengraph-image|twitter-image)\.[tj]sx?$/.test(f) || /^src\/(?:proxy|middleware|instrumentation|instrumentation-client)\.[tj]s$/.test(f));
const scripts = source.filter(f => /^(scripts|prisma)\//.test(f));
const appReach = reachable(entries);
const scriptReach = reachable(scripts);
const testReach = reachable(tests);
const disconnected = source.filter(f => f.startsWith('src/') && !tests.includes(f) && !appReach.has(f));
const scriptServerOnly = [];
for (const script of scripts) {
  const seen = new Set();
  function visit(f, route) {
    if (seen.has(f)) return; seen.add(f);
    const chain = [...route, f];
    if (serverOnly.has(f)) scriptServerOnly.push({ script, markedModule: f, chain });
    for (const next of graphRuntime.get(f) || []) visit(next, chain);
  }
  visit(script, []);
}
const versions = Object.fromEntries(['next', 'eslint-config-next', 'prisma', '@prisma/client', '@prisma/adapter-pg', 'vitest', 'typescript'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version]));
console.log(JSON.stringify({
  method: 'TypeScript AST; project import resolution; Next implicit entries; operation/test roots separated; files tracked plus new nonignored source; excludes docs and report artifacts',
  baselineCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  versions,
  summary: { sourceModules: source.length, testAndFixtureModules: tests.length, nextEntries: entries.length, appReachableSourceModules: appReach.size, operationalRoots: scripts.length, operationReachableSourceModules: scriptReach.size, disconnectedSourceModules: disconnected.length },
  entries, scripts,
  disconnected: disconnected.map(file => ({ file, incoming: [...(incoming.get(file) || [])].sort(), operational: scriptReach.has(file), tested: testReach.has(file) })),
  scriptServerOnly, unresolvedLocal, assetImports, nonliteralImports: dynamic,
  importsByPackage: [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, refs]) => ({ name, moduleCount: refs.size, ...(detailed ? { files: [...refs].sort() } : { examples: [...refs].sort().slice(0, 3) }) })),
  ...(detailed ? { importEdges, sourceHashesSha256: hashes } : {}),
}, null, 2));
