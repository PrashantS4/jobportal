const fetch = require('node-fetch');
(async () => {
  const loginRes = await fetch('https://recruitnest.prashantsinghstd.workers.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 's@s.com', password: 'password', type: 'employee' })
  });
  const cookies = loginRes.headers.get('set-cookie');
  console.log('Got cookie:', cookies);
  const jobsRes = await fetch('https://recruitnest.prashantsinghstd.workers.dev/jobs', {
    headers: { 'Cookie': cookies }
  });
  const html = await jobsRes.text();
  console.log('HTML contains escHtml?', html.includes('function escHtml'));
  const match = html.match(/data-job-title=\"wdev\".*?data-config=\"(.*?)\"/);
  console.log('wdev data-config:', match ? match[1] : 'not found');
})();
