// Creates the FIRST administrator for a new (production or staging) database.
//   node scripts/create-admin.mjs <username> "<Full Name>"
// Prints SQL to run with wrangler. The password is asked for here and never stored in a file.
import { createInterface } from 'node:readline';
import { hashPassword, passwordProblem } from '../src/lib/password.js';

const [username, fullName] = process.argv.slice(2);
if (!username || !fullName) {
  console.error('Usage: node scripts/create-admin.mjs <username> "<Full Name>"');
  process.exit(1);
}
if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) { console.error('Username: 3-50 letters, numbers, . _ -'); process.exit(1); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = process.env.ADMIN_PASSWORD || await new Promise((res) => rl.question('Password (12+ chars, upper, lower, number, symbol): ', res));
rl.close();
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(1); }

const q = (s) => `'${s.replace(/'/g, "''")}'`;
console.log('\nRun this (add --env staging for staging, --local for local dev):\n');
console.log(`npx wrangler d1 execute DB --remote --command "INSERT INTO admin_users (username, password_hash, full_name, role) VALUES (${q(username)}, ${q(await hashPassword(password))}, ${q(fullName)}, 'admin');"`);
