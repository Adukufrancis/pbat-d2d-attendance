// Data layer: Postgres when DATABASE_URL is set (production), otherwise a local SQLite file.
import path from 'node:path';

const SCHEMA = (big, idDef) => `
  CREATE TABLE IF NOT EXISTS venues (
    id          ${idDef},
    name        TEXT NOT NULL,
    created_at  ${big} NOT NULL
  );
  -- The venue's WiFi as seen from the internet: an IPv4 address, or an IPv6 /64 prefix.
  CREATE TABLE IF NOT EXISTS venue_networks (
    id          ${idDef},
    venue_id    INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    address     TEXT NOT NULL,
    created_at  ${big} NOT NULL,
    UNIQUE (venue_id, address)
  );
  CREATE TABLE IF NOT EXISTS people (
    id          ${idDef},
    name        TEXT NOT NULL,
    member_no   TEXT NOT NULL UNIQUE,
    created_at  ${big} NOT NULL
  );
  -- A phone that has registered: its cookie token (hashed) belongs to one person.
  CREATE TABLE IF NOT EXISTS devices (
    token_hash  TEXT PRIMARY KEY,
    person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    created_at  ${big} NOT NULL,
    user_agent  TEXT
  );
  CREATE INDEX IF NOT EXISTS devices_person_idx ON devices(person_id);
  CREATE TABLE IF NOT EXISTS attendance (
    id          ${idDef},
    person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    venue_id    INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    at          ${big} NOT NULL,
    ip          TEXT,
    new_device  INTEGER NOT NULL DEFAULT 0,
    checkout_at ${big},
    UNIQUE (person_id, venue_id, day)
  );
  CREATE INDEX IF NOT EXISTS attendance_day_idx ON attendance(day, venue_id);
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const Q = {
  venues: `SELECT v.id, v.name, v.created_at,
             (SELECT COUNT(*) FROM venue_networks n WHERE n.venue_id = v.id) AS networks
           FROM venues v ORDER BY v.id`,
  venue: 'SELECT id, name, created_at FROM venues WHERE id = $1',
  addVenue: 'INSERT INTO venues (name, created_at) VALUES ($1, $2) RETURNING id',
  renameVenue: 'UPDATE venues SET name = $2 WHERE id = $1',
  deleteVenue: 'DELETE FROM venues WHERE id = $1',

  networks: 'SELECT id, venue_id, address, created_at FROM venue_networks WHERE venue_id = $1 ORDER BY id',
  allNetworks: 'SELECT venue_id, address FROM venue_networks',
  addNetwork: `INSERT INTO venue_networks (venue_id, address, created_at) VALUES ($1, $2, $3)
               ON CONFLICT (venue_id, address) DO NOTHING`,
  deleteNetwork: 'DELETE FROM venue_networks WHERE id = $1 AND venue_id = $2',

  personByNumber: 'SELECT id, name, member_no, listed, created_at FROM people WHERE member_no = $1',
  personByDevice: `SELECT p.id, p.name, p.member_no, p.listed, p.created_at FROM devices d
                   JOIN people p ON p.id = d.person_id WHERE d.token_hash = $1`,
  addPerson: 'INSERT INTO people (name, member_no, created_at) VALUES ($1, $2, $3) RETURNING id',
  addListed: 'INSERT INTO people (name, member_no, created_at, listed) VALUES ($1, $2, $3, 1) RETURNING id',
  updateListed: 'UPDATE people SET name = $2, listed = 1 WHERE id = $1',
  setListed: 'UPDATE people SET listed = $2 WHERE id = $1',
  listedCount: 'SELECT COUNT(*) AS n FROM people WHERE listed = 1',
  renamePerson: 'UPDATE people SET name = $2 WHERE id = $1',
  deletePerson: 'DELETE FROM people WHERE id = $1',
  addDevice: 'INSERT INTO devices (token_hash, person_id, created_at, user_agent) VALUES ($1, $2, $3, $4)',
  deviceCount: 'SELECT COUNT(*) AS n FROM devices WHERE person_id = $1',
  clearDevices: 'DELETE FROM devices WHERE person_id = $1',
  people: `SELECT p.id, p.name, p.member_no, p.listed, p.created_at,
             (SELECT COUNT(*) FROM devices d WHERE d.person_id = p.id) AS devices,
             (SELECT COUNT(*) FROM attendance a WHERE a.person_id = p.id) AS days,
             (SELECT MAX(a.at) FROM attendance a WHERE a.person_id = p.id) AS last_seen
           FROM people p ORDER BY p.name`,

  checkedIn: 'SELECT at, checkout_at FROM attendance WHERE person_id = $1 AND venue_id = $2 AND day = $3',
  checkOut: `UPDATE attendance SET checkout_at = $4
             WHERE person_id = $1 AND venue_id = $2 AND day = $3 AND checkout_at IS NULL`,
  checkIn: `INSERT INTO attendance (person_id, venue_id, day, at, ip, new_device) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (person_id, venue_id, day) DO NOTHING`,
  attendanceFor: `SELECT a.id, a.at, a.checkout_at, a.day, a.new_device, a.venue_id, v.name AS venue, p.id AS person_id, p.name, p.member_no
                  FROM attendance a JOIN people p ON p.id = a.person_id JOIN venues v ON v.id = a.venue_id
                  WHERE a.day >= $1 AND a.day <= $2 AND ($3 = 0 OR a.venue_id = $3)
                  ORDER BY a.day DESC, a.at ASC`,
  countToday: 'SELECT COUNT(*) AS n, COUNT(checkout_at) AS out FROM attendance WHERE venue_id = $1 AND day = $2',
  getSetting: 'SELECT value FROM settings WHERE key = $1',
  setSetting: `INSERT INTO settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  deleteSetting: 'DELETE FROM settings WHERE key = $1',
  deleteAttendance: 'DELETE FROM attendance WHERE id = $1',
};

const NUMERIC = new Set(['id', 'venue_id', 'person_id', 'created_at', 'at', 'networks', 'devices', 'days',
  'last_seen', 'n', 'out', 'new_device', 'checkout_at', 'listed']);
const fix = (r) => { for (const k of Object.keys(r)) if (NUMERIC.has(k) && r[k] != null) r[k] = Number(r[k]); return r; };

async function postgres(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 5,
    ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false } });
  await pool.query('ALTER TABLE people RENAME COLUMN phone TO member_no').catch(() => {});   // older versions
  await pool.query(SCHEMA('BIGINT', 'SERIAL PRIMARY KEY'));
  await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_at BIGINT');   // check-out (added later)
  await pool.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS listed INTEGER NOT NULL DEFAULT 0');   // office list
  return { kind: 'postgres', q: async (name, params = []) => (await pool.query(Q[name], params)).rows.map(fix) };
}

async function sqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  try { db.exec('ALTER TABLE people RENAME COLUMN phone TO member_no'); } catch {}       // older versions
  db.exec(SCHEMA('INTEGER', 'INTEGER PRIMARY KEY AUTOINCREMENT'));
  try { db.exec('ALTER TABLE attendance ADD COLUMN checkout_at INTEGER'); } catch {}     // check-out (added later)
  try { db.exec('ALTER TABLE people ADD COLUMN listed INTEGER NOT NULL DEFAULT 0'); } catch {}   // office list
  const cache = {};
  return {
    kind: 'sqlite',
    q: async (name, params = []) => {
      const sql = Q[name].replace(/\$(\d+)/g, '?$1');
      const st = (cache[name] ??= db.prepare(sql));
      if (/^\s*SELECT|RETURNING/i.test(sql)) return st.all(...params).map((r) => fix({ ...r }));
      st.run(...params); return [];
    },
  };
}

export async function createDb() {
  const raw = process.env.DATABASE_URL ? await postgres(process.env.DATABASE_URL)
    : await sqlite(process.env.DB_PATH || path.join(process.cwd(), 'attendance.db'));
  const one = async (name, params) => (await raw.q(name, params))[0];
  return { kind: raw.kind, q: raw.q, one };
}
