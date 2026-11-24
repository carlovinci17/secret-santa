'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const store = require('./lib/store');
const { draw } = require('./lib/draw');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_DAYS = 7;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD not set. Using the default "changeme". Set it before going live.');
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer'); // keep link tokens out of referrers
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Load fresh data for API calls, and persist any changes before the response goes out.
app.use('/api', async (req, res, next) => {
  try {
    await store.hydrate();
  } catch (err) {
    return next(err);
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    store.flush().then(() => json(body), (err) => {
      console.error('Failed to save data', err);
      res.status(500);
      json({ error: 'Could not save. Please try again.' });
    });
    return res;
  };
  next();
});

const PUBLIC = path.join(__dirname, 'public');
const newId = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(18).toString('base64url');
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

/* ---------------- Admin auth (signed cookie, no extra deps) ---------------- */

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAdmin(req) {
  const raw = readCookie(req, 'ss_admin');
  if (!raw) return false;
  const [expires, sig] = raw.split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Please log in.' });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const loginAttempts = new Map(); // ip -> { count, until }

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > Date.now()) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  if (!safeEqual(req.body?.password ?? '', ADMIN_PASSWORD)) {
    rec.count += 1;
    if (rec.count >= 5) Object.assign(rec, { count: 0, until: Date.now() + 5 * 60 * 1000 });
    loginAttempts.set(ip, rec);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  loginAttempts.delete(ip);
  const expires = String(Date.now() + SESSION_DAYS * 864e5);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `ss_admin=${expires}.${sign(expires)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ss_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

/* ---------------- Admin API ---------------- */

const admin = express.Router();
admin.use(requireAdmin);

function stateFor(db) {
  return {
    event: db.event,
    drawnAt: db.drawnAt,
    assignments: db.assignments,
    participants: db.participants.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      exclusions: p.exclusions,
      viewedAt: p.viewedAt,
    })),
  };
}

/** Any change to the group or rules invalidates an existing draw. */
function clearDraw(db) {
  db.assignments = null;
  db.drawnAt = null;
  for (const p of db.participants) p.viewedAt = null;
}

admin.get('/state', (req, res) => res.json(stateFor(store.load())));

admin.put('/event', (req, res) => {
  const db = store.update((db) => {
    db.event = {
      name: clean(req.body.name, 80) || 'Secret Santa',
      budget: clean(req.body.budget, 40),
      date: clean(req.body.date, 40),
      message: clean(req.body.message, 1000),
    };
    return db;
  });
  res.json(stateFor(db));
});

admin.post('/participants', (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const db = store.load();
  if (db.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: `${name} is already in the group.` });
  }
  store.update((db) => {
    db.participants.push({ id: newId(), name, token: newToken(), exclusions: [], viewedAt: null, createdAt: new Date().toISOString() });
    clearDraw(db);
  });
  res.json(stateFor(store.load()));
});

function findParticipant(db, id, res) {
  const p = db.participants.find((x) => x.id === id);
  if (!p) res.status(404).json({ error: 'Person not found.' });
  return p;
}

admin.patch('/participants/:id', (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const db = store.load();
  const p = findParticipant(db, req.params.id, res);
  if (!p) return;
  if (db.participants.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: `${name} is already in the group.` });
  }
  store.update(() => { p.name = name; }); // renaming keeps the draw
  res.json(stateFor(db));
});

admin.delete('/participants/:id', (req, res) => {
  const db = store.load();
  if (!findParticipant(db, req.params.id, res)) return;
  store.update((db) => {
    db.participants = db.participants.filter((p) => p.id !== req.params.id);
    for (const p of db.participants) p.exclusions = p.exclusions.filter((x) => x !== req.params.id);
    clearDraw(db);
  });
  res.json(stateFor(store.load()));
});

admin.post('/participants/:id/new-link', (req, res) => {
  const db = store.load();
  const p = findParticipant(db, req.params.id, res);
  if (!p) return;
  store.update(() => { p.token = newToken(); p.viewedAt = null; });
  res.json(stateFor(db));
});

// Toggle one exclusion. mutual=true applies it both ways (handy for couples).
admin.post('/exclusions', (req, res) => {
  const { from, to, excluded, mutual } = req.body || {};
  const db = store.load();
  const a = db.participants.find((p) => p.id === from);
  const b = db.participants.find((p) => p.id === to);
  if (!a || !b || a.id === b.id) return res.status(400).json({ error: 'Invalid people.' });
  const set = (giver, receiver) => {
    const s = new Set(giver.exclusions);
    excluded ? s.add(receiver.id) : s.delete(receiver.id);
    giver.exclusions = [...s];
  };
  store.update((db) => {
    set(a, b);
    if (mutual) set(b, a);
    clearDraw(db);
  });
  res.json(stateFor(db));
});

admin.post('/draw', (req, res) => {
  const db = store.load();
  const result = draw(db.participants);
  if (!result.ok) return res.status(422).json({ error: result.error });
  store.update((db) => {
    db.assignments = result.assignments;
    db.drawnAt = new Date().toISOString();
    for (const p of db.participants) p.viewedAt = null;
  });
  res.json(stateFor(db));
});

admin.delete('/draw', (req, res) => {
  store.update(clearDraw);
  res.json(stateFor(store.load()));
});

app.use('/api/admin', admin);

/* ---------------- Participant reveal ---------------- */

app.get('/api/reveal/:token', (req, res) => {
  const db = store.load();
  const me = db.participants.find((p) => p.token === req.params.token);
  if (!me) return res.status(404).json({ error: "This link isn't valid. Ask the organiser for a new one." });

  const base = { name: me.name, event: db.event, drawn: Boolean(db.assignments) };
  if (!db.assignments) return res.json(base);

  const receiver = db.participants.find((p) => p.id === db.assignments[me.id]);
  if (!me.viewedAt) store.update(() => { me.viewedAt = new Date().toISOString(); });
  res.json({ ...base, receiver: receiver ? receiver.name : null });
});

/* ---------------- Pages ---------------- */

app.get('/',(req, res) => res.redirect('/admin'));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));
app.get('/s/:token', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(path.join(PUBLIC, 'reveal.html'));
});
app.use(express.static(PUBLIC, { index: false }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`🎅 Secret Santa running on http://localhost:${PORT}/admin`));
}

module.exports = app;
