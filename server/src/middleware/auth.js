import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Account inactive' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this' });

/** Wrap async handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
