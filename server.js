import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { page, PAGES } from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_NAME = process.env.APP_NAME || 'PBAT D2D Office Attendance';
const TZ = process.env.TIMEZONE || 'Africa/Lagos';        // the day (and the daily code) changes at midnight here

// SECRET signs the daily QR codes and the admin login. Keep it fixed: changing it changes today's code.
let SECRET = process.env.SECRET;
if (!SECRET) {
  SECRET = 'dev-secret-change-me';
  if (IS_PROD) console.warn('WARNING: SECRET is not set. Set a long random SECRET so codes and logins are safe.');
}
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = IS_PROD ? crypto.randomBytes(9).toString('base64url') : 'admin';
  console.warn(`NOTE: ADMIN_PASSWORD is not set. For now the admin password is: ${ADMIN_PASSWORD}`);
}

const db = await createDb();

// ---- Helpers ------------------------------------------------------------------
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (t = Date.now()) => dayFmt.format(new Date(t));              // YYYY-MM-DD in TZ
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Today's code for a venue: changes every day, can't be guessed without SECRET. */
const codeFor = (venueId, day = dayOf()) => hmac(`qr:${venueId}:${day}`).slice(0, 12);

/**
 * Everyone on the same WiFi reaches the internet through the same router, so they share its public
 * address: one IPv4 address, or (for IPv6) the same /64 network prefix.
 */
function networkOf(ip = '') {
  ip = String(ip).replace(/^::ffff:/i, '').split('%')[0];
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return `${full.slice(0, 4).map((x) => parseInt(x || '0', 16).toString(16)).join(':')}::/64`;
}

/**
 * The visitor's real internet address. Render sits behind Cloudflare, which sets CF-Connecting-IP
 * itself (a visitor can't fake it). Set CLIENT_IP_HEADER to use a different header if your host needs it.
 */
function clientIp(req) {
  const pick = (name) => String(req.get(name) || '').split(',')[0].trim();
  if (process.env.CLIENT_IP_HEADER) return pick(process.env.CLIENT_IP_HEADER) || req.ip;
  return pick('cf-connecting-ip') || pick('true-client-ip') || req.ip;
}

/** PBAT-D2D membership number: case and spaces don't matter ("pbat-d2d 0012" = "PBAT-D2D0012"). */
function normalizeNumber(raw) {
  const n = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/[–—_]/g, '-');
  return /^[A-Z0-9][A-Z0-9\-\/.]{1,29}$/.test(n) && /\d/.test(n) ? n : null;
}

const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

// ---- App ----------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);              // Render sits behind one proxy: req.ip is the visitor's real address
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0 }));

// State-changing API calls must be JSON (blocks cross-site form posts).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'Expected JSON.' });
  res.set('Cache-Control', 'no-store');
  next();
});

// ---- Admin login ----------------------------------------------------------------
const ADMIN_COOKIE = 'adm';
const ADMIN_DAYS = 30;
const adminToken = () => { const exp = Date.now() + ADMIN_DAYS * 864e5; return `${exp}.${hmac(`admin:${exp}`)}`; };
const isAdmin = (req) => {
  const [exp, sig] = String(req.cookies[ADMIN_COOKIE] || '').split('.');
  return Number(exp) > Date.now() && safeEqual(sig, hmac(`admin:${exp}`));
};
const needAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Please log in.' }));

const loginTries = new Map();
app.post('/api/admin/login', (req, res) => {
  const now = Date.now();
  const tries = (loginTries.get(clientIp(req)) || []).filter((t) => now - t < 15 * 60e3);
  if (tries.length >= 10) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' });
  if (!safeEqual(sha256(String(req.body.password || '')), sha256(ADMIN_PASSWORD))) {
    tries.push(now); loginTries.set(clientIp(req), tries);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  loginTries.delete(clientIp(req));
  res.cookie(ADMIN_COOKIE, adminToken(), { httpOnly: true, secure: IS_PROD, sameSite: 'strict', maxAge: ADMIN_DAYS * 864e5, path: '/' });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie(ADMIN_COOKIE, { path: '/' }); res.json({ ok: true }); });

// ---- Admin: venues and their WiFi ------------------------------------------------
app.get('/api/admin/state', needAdmin, h(async (req, res) => {
  const here = networkOf(clientIp(req)), today = dayOf();
  const venues = await db.q('venues');
  for (const v of venues) {
    v.networks = (await db.q('networks', [v.id])).map((n) => ({ id: n.id, address: n.address, here: n.address === here }));
    v.today = (await db.one('countToday', [v.id, today])).n;
  }
  res.json({ appName: APP_NAME, here: here, today, timezone: TZ, venues });
}));

app.post('/api/admin/venues', needAdmin, h(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Give the office a name.' });
  const { id } = await db.one('addVenue', [name, Date.now()]);
  if (req.body.useThisNetwork) await db.q('addNetwork', [id, networkOf(clientIp(req)), Date.now()]);
  res.json({ id });
}));
app.post('/api/admin/venues/:id/rename', needAdmin, h(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Give the office a name.' });
  await db.q('renameVenue', [Number(req.params.id), name]); res.json({ ok: true });
}));
app.post('/api/admin/venues/:id/delete', needAdmin, h(async (req, res) => {
  await db.q('deleteVenue', [Number(req.params.id)]); res.json({ ok: true });
}));
// "Use this network": save the WiFi the admin is connected to right now.
app.post('/api/admin/venues/:id/networks', needAdmin, h(async (req, res) => {
  const v = await db.one('venue', [Number(req.params.id)]);
  if (!v) return res.status(404).json({ error: 'Office not found.' });
  await db.q('addNetwork', [v.id, networkOf(clientIp(req)), Date.now()]);
  res.json({ ok: true, address: networkOf(clientIp(req)) });
}));
app.post('/api/admin/venues/:id/networks/:nid/delete', needAdmin, h(async (req, res) => {
  await db.q('deleteNetwork', [Number(req.params.nid), Number(req.params.id)]); res.json({ ok: true });
}));

// Today's QR for the venue screen.
app.get('/api/admin/venues/:id/qr', needAdmin, h(async (req, res) => {
  const v = await db.one('venue', [Number(req.params.id)]);
  if (!v) return res.status(404).json({ error: 'Office not found.' });
  const day = dayOf();
  const url = `${baseUrl(req)}/c/${v.id}/${codeFor(v.id, day)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#06492a', light: '#ffffff' } });
  const count = (await db.one('countToday', [v.id, day])).n;
  const networks = (await db.q('networks', [v.id])).length;
  res.json({ name: v.name, day, url, svg, count, networks, appName: APP_NAME });
}));

// What the server sees of this connection (to check the WiFi detection after deploying).
app.get('/api/admin/whoami', needAdmin, (req, res) => res.json({
  used: clientIp(req), network: networkOf(clientIp(req)), reqIp: req.ip,
  headers: Object.fromEntries(['cf-connecting-ip', 'true-client-ip', 'x-forwarded-for', 'x-real-ip'].map((k) => [k, req.get(k) || null])),
}));

// ---- Admin: attendance and people --------------------------------------------------
async function attendanceRows(q) {
  const today = dayOf();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : from;
  return { from, to, rows: await db.q('attendanceFor', [from, to, Number(q.venue) || 0]) };
}
app.get('/api/admin/attendance', needAdmin, h(async (req, res) => res.json(await attendanceRows(req.query))));
app.post('/api/admin/attendance/:id/delete', needAdmin, h(async (req, res) => {
  await db.q('deleteAttendance', [Number(req.params.id)]); res.json({ ok: true });
}));
app.get('/admin/attendance.csv', h(async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin');
  const { from, to, rows } = await attendanceRows(req.query);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const lines = [['Date', 'Time', 'Name', 'PBAT-D2D number', 'Office', 'Note'].map(cell).join(',')]
    .concat(rows.map((r) => [r.day, time.format(new Date(r.at)), r.name, r.member_no, r.venue, r.new_device ? 'New phone' : ''].map(cell).join(',')));
  res.set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="attendance-${from}${to !== from ? `-to-${to}` : ''}.csv"`)
    .send(`﻿${lines.join('\r\n')}`);
}));
app.get('/api/admin/people', needAdmin, h(async (req, res) => res.json({ people: await db.q('people') })));
app.post('/api/admin/people/:id/rename', needAdmin, h(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Enter a name.' });
  await db.q('renamePerson', [Number(req.params.id), name]); res.json({ ok: true });
}));
app.post('/api/admin/people/:id/reset-devices', needAdmin, h(async (req, res) => {
  await db.q('clearDevices', [Number(req.params.id)]); res.json({ ok: true });
}));
app.post('/api/admin/people/:id/delete', needAdmin, h(async (req, res) => {
  await db.q('deletePerson', [Number(req.params.id)]); res.json({ ok: true });
}));

// ---- Check-in (attendee's phone) ---------------------------------------------------
const DEVICE_COOKIE = 'dev';
const DEVICE_MAX_AGE = 400 * 864e5;

app.post('/api/checkin', h(async (req, res) => {
  const venue = await db.one('venue', [Number(req.body.venue) || 0]);
  if (!venue) return res.status(404).json({ reason: 'invalid', error: "This QR code isn't one of ours." });

  // 1. The code must be today's.
  const today = dayOf(), code = String(req.body.code || '');
  if (!safeEqual(code, codeFor(venue.id, today))) {
    const old = Array.from({ length: 60 }, (_, i) => addDays(today, -(i + 1))).some((d) => safeEqual(code, codeFor(venue.id, d)));
    return res.status(400).json(old
      ? { reason: 'expired', venue: venue.name, error: "This QR code is from another day. Scan today's code at the office." }
      : { reason: 'invalid', error: "This QR code isn't valid. Scan the code shown at the office." });
  }

  // 2. The phone must be on the venue's WiFi.
  const here = networkOf(clientIp(req));
  const nets = await db.q('networks', [venue.id]);
  if (!nets.length) return res.status(409).json({ reason: 'setup', venue: venue.name, error: "This office's WiFi hasn't been set up yet. Please tell the office admin." });
  if (!nets.some((n) => n.address === here)) {
    return res.status(403).json({ reason: 'network', venue: venue.name,
      error: `Connect to the ${venue.name} WiFi to check in. Turn off mobile data, join the WiFi, then tap Try again.` });
  }

  // 3. Who is this? Known phone (device cookie), or register now.
  const token = req.cookies[DEVICE_COOKIE];
  let person = token && (await db.one('personByDevice', [sha256(token)]));
  let newDevice = 0;
  if (!person) {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const number = normalizeNumber(req.body.number);
    if (!req.body.name && !req.body.number) return res.json({ status: 'register', venue: venue.name });
    const fields = {};
    if (name.length < 2) fields.name = 'Enter your full name.';
    if (!number) fields.number = 'Enter your PBAT-D2D number as it appears on your ID card.';
    if (Object.keys(fields).length) return res.status(400).json({ status: 'register', fields, error: 'Please fix the highlighted fields.' });

    person = await db.one('personByNumber', [number]);
    if (person) {
      // Same PBAT-D2D number from a different phone: allowed, but flagged for the admin.
      newDevice = (await db.one('deviceCount', [person.id])).n > 0 ? 1 : 0;
    } else {
      const { id } = await db.one('addPerson', [name, number, Date.now()]);
      person = { id, name, member_no: number };
    }
    const fresh = crypto.randomBytes(32).toString('base64url');
    await db.q('addDevice', [sha256(fresh), person.id, Date.now(), String(req.get('user-agent') || '').slice(0, 200)]);
    res.cookie(DEVICE_COOKIE, fresh, { httpOnly: true, secure: IS_PROD, sameSite: 'lax', maxAge: DEVICE_MAX_AGE, path: '/' });
  }

  // 4. Record attendance once per person, venue and day.
  const now = Date.now();
  await db.q('checkIn', [person.id, venue.id, today, now, clientIp(req), newDevice]);
  const row = await db.one('checkedIn', [person.id, venue.id, today]);
  res.json({ status: 'ok', name: person.name, number: person.member_no, venue: venue.name, at: row.at, already: row.at !== now, timezone: TZ });
}));

// ---- Pages -------------------------------------------------------------------------
const send = (res, html) => res.set('Cache-Control', 'no-store').type('html').send(html);
app.get('/', (req, res) => send(res, page(PAGES.home, { appName: APP_NAME })));
app.get('/c/:venue/:code', (req, res) => send(res, page(PAGES.checkin, { appName: APP_NAME,
  venue: req.params.venue, code: req.params.code })));
app.get('/admin', (req, res) => send(res, page(isAdmin(req) ? PAGES.admin : PAGES.login, { appName: APP_NAME })));
app.get('/admin/display/:id', (req, res) => (isAdmin(req)
  ? send(res, page(PAGES.display, { appName: APP_NAME, venue: req.params.id })) : res.redirect('/admin')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.listen(PORT, () => console.log(`${APP_NAME} running at http://localhost:${PORT} (db: ${db.kind}, timezone: ${TZ})`));
