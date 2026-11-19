import { Hono } from 'hono';
import { sessionMiddleware } from './middleware.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import customers from './routes/customers.js';
import bills from './routes/bills.js';
import payments from './routes/payments.js';
import portal from './routes/portal.js';
import complaints from './routes/complaints.js';
import analytics from './routes/analytics.js';
import reports from './routes/reports.js';
import audit from './routes/audit.js';
import backup from './routes/backup.js';
import sms from './routes/sms.js';

const app = new Hono();

app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});
app.use('/api/*', sessionMiddleware);

app.get('/api/env', (c) => c.json({ environment: c.env.ENVIRONMENT || 'production' }));

app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/customers', customers);
app.route('/api/bills', bills);
app.route('/api/payments', payments);
app.route('/api/portal', portal);
app.route('/api/complaints', complaints);
app.route('/api/analytics', analytics);
app.route('/api/reports', reports);
app.route('/api/audit', audit);
app.route('/api/backup', backup);
app.route('/api/sms', sms);

app.notFound((c) => c.json({ success: false, message: 'Not found.' }, 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ success: false, message: 'Something went wrong. Please try again.' }, 500);
});

export default app;
