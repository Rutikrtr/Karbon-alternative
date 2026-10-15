// Create (or promote) a Super Admin directly in the database.
// Usage: npm run create-admin -- --email you@firm.com --name "Your Name" --password "S3cret-pass"
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/index.js';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg('email'); const name = arg('name') || 'Super Admin'; const password = arg('password');

if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI in server/.env first.'); process.exit(1); }
if (!email || !password || password.length < 8) { console.error('Usage: npm run create-admin -- --email you@firm.com --name "Your Name" --password "at-least-8-chars"'); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI);
const passwordHash = await bcrypt.hash(password, 10);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { $set: { role: 'super_admin', active: true, passwordHash }, $setOnInsert: { name, title: 'Owner' } },
  { upsert: true, new: true },
);
console.log(`✓ Super Admin ready: ${user.name} <${user.email}>`);
await mongoose.disconnect();
