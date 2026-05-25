const baseUrl = (process.env.DAILY_REMINDER_JOB_URL
  ?? `${process.env.APP_URL ?? process.env.CLIENT_URL ?? 'http://localhost:3001'}/api/jobs/daily-reminders`).replace(/\/+$/, '');
const secret = process.env.JOB_SECRET;

if (!secret) {
  console.error('JOB_SECRET is required to run daily reminders.');
  process.exit(1);
}

const res = await fetch(baseUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-job-secret': secret,
  },
  body: JSON.stringify({}),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Daily reminders failed with ${res.status}: ${body}`);
  process.exit(1);
}

console.log(body);
