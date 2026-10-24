// Kết nối SQLite bằng module có sẵn của Node (node:sqlite) – không cần cài thêm driver.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'neu-events.db');

let db = null;

// Nâng cấp CSDL cũ (tạo từ phiên bản trước) – thêm cột mới nếu chưa có
const NEW_COLUMNS = [
  ['events', 'level', "TEXT NOT NULL DEFAULT 'khoa'"],
  ['events', 'points', 'INTEGER NOT NULL DEFAULT 0'],
  ['registrations', 'checked_out_at', 'TEXT'],
  ['registrations', 'checkout_method', 'TEXT'],
  ['registrations', 'points_awarded', 'INTEGER'],
  ['attendance_sessions', 'kind', "TEXT NOT NULL DEFAULT 'checkin'"],
  ['reviews', 'is_anonymous', 'INTEGER NOT NULL DEFAULT 0'],
];
function migrate(d) {
  for (const [table, col, def] of NEW_COLUMNS) {
    const cols = d.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.length && !cols.find((c) => c.name === col)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

function open() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

// Tiện ích truy vấn ngắn gọn
const q = {
  get: (sql, ...p) => open().prepare(sql).get(...p),
  all: (sql, ...p) => open().prepare(sql).all(...p),
  run: (sql, ...p) => {
    const r = open().prepare(sql).run(...p);
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  },
  // Chạy nhiều lệnh trong 1 transaction
  tx(fn) {
    const d = open();
    d.exec('BEGIN');
    try { const out = fn(); d.exec('COMMIT'); return out; }
    catch (e) { d.exec('ROLLBACK'); throw e; }
  },
};

function close() { if (db) { db.close(); db = null; } }

module.exports = { open, close, q, DB_PATH };
