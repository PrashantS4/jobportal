import { execSync } from 'child_process';
try {
  const key = process.env.BREVO_API_KEY || '';
  execSync('npx wrangler secret put BREVO_API_KEY', { 
    input: key,
    stdio: 'inherit'
  });
  console.log('BREVO_API_KEY secret set successfully!');
} catch (e) {
  console.error(e);
}
