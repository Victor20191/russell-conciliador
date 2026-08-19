async (page) => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJTdXBlcmFkbWluaXN0cmFkb3IiLCJzZXNzaW9uVmVyc2lvbiI6MCwiZXhwaXJlc0F0IjoiMjAyNi0wOC0xOVQwMjowODo1My4xNjhaIiwiaWF0IjoxNzg3MTAxNzMzLCJleHAiOjE3ODc3MDY1MzN9.BDm5VDsvmr7SleUuWdKGN55g3gZl-c_polrQrlUmR_4';
  await page.context().addCookies([{ name: 'session', value: token, url: 'http://localhost:3000', httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('http://localhost:3000/config/reportes-ejecutivos');
  await page.waitForLoadState('networkidle');
  return page.url();
}
