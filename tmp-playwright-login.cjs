const { readFileSync } = require("node:fs");

module.exports = async (page) => {
  const token = readFileSync("/tmp/russell-session.txt", "utf8").trim();
  await page.context().addCookies([
    {
      name: "session",
      value: token,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("http://localhost:3000/config/reportes-ejecutivos");
  await page.waitForLoadState("networkidle");
  return page.url();
};
