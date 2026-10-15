import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import clientRoutes from './routes/clients.js';
import workRoutes from './routes/work.js';
import { startScheduler } from './services/recurrence.js';
import { seedIfEmpty } from './seed.js';

const PORT = process.env.PORT || 4000;

async function connect() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    // No database configured: run an in-memory MongoDB so the app works out of the box.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri('karbon');
    console.log('⚠  MONGODB_URI not set — using a temporary in-memory MongoDB (data resets on restart).');
  }
  await mongoose.connect(uri);
  console.log('✓ MongoDB connected');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, peopleRoutes, clientRoutes, workRoutes);

// Serve the built client in production
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
});

await connect();
await seedIfEmpty();
startScheduler();
app.listen(PORT, () => console.log(`✓ API on http://localhost:${PORT}`));
