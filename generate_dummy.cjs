const fs = require('fs');
const crypto = require('crypto');

const employerId = "92860506-7e70-4dc3-9001-0c60f43a3394";
let sql = ``;

const jobTitles = ["Frontend Developer", "Backend Engineer", "Data Scientist", "Product Manager", "UX Designer", "DevOps Engineer"];
const expLevels = ["Entry", "Mid", "Senior"];
const locations = ["San Francisco, CA", "New York, NY", "Austin, TX", "London, UK", "Remote"];

for (let i = 1; i <= 30; i++) {
  const id = crypto.randomUUID();
  const title = `[DUMMY] ${jobTitles[i % jobTitles.length]} - ${i}`;
  const desc = `This is a dummy job description for testing pagination. Job number ${i}.`;
  const reqs = JSON.stringify(["React", "Node.js", "TypeScript"]);
  const min = 50000 + (i * 1000);
  const max = min + 30000;
  const loc = locations[i % locations.length];
  const remote = loc === "Remote" ? 1 : 0;
  const exp = expLevels[i % expLevels.length];
  const now = Math.floor(Date.now() / 1000);

  // We need to escape single quotes if any (though there are none in the static strings above)
  sql += `INSERT INTO job_postings (id, employer_id, job_title, description, requirements, salary_min, salary_max, salary_currency, location_city, location_remote, employment_type, experience_level, status, created_at, published_at) VALUES ('${id}', '${employerId}', '${title}', '${desc}', '${reqs}', ${min}, ${max}, 'USD', '${loc}', ${remote}, 'Full-time', '${exp}', 'published', ${now}, ${now});\n`;
}

fs.writeFileSync('seed_dummy_jobs.sql', sql);
console.log('SQL generated.');
