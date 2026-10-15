import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { requireAuth, ah, JWT_SECRET } from '../middleware/auth.js';
import { audit, userTeamIds } from '../services/access.js';

const r = Router();

r.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+passwordHash');
  if (!user || !user.active || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  const token = jwt.sign({ sub: String(user._id) }, JWT_SECRET, { expiresIn: '12h' });
  audit(user, 'auth.login', { entity: 'User', entityId: user._id, summary: `${user.name} signed in` });
  const { passwordHash, ...safe } = user.toObject();
  res.json({ token, user: safe });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ user: req.user, teamIds: await userTeamIds(req.user._id) });
}));

export default r;
