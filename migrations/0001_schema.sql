-- Magdiwang Water Supply System: schema (Cloudflare D1 / SQLite)
-- Money = whole pesos (INTEGER). Dates = 'YYYY-MM-DD' text. Timestamps = UTC 'YYYY-MM-DD HH:MM:SS'.

CREATE TABLE customers (
  meter_id        INTEGER PRIMARY KEY CHECK (meter_id BETWEEN 1 AND 2147483647),
  first_name      TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  last_name       TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 100),
  first_name_norm TEXT NOT NULL,   -- lowercase, accent-free copy used for portal matching + search
  last_name_norm  TEXT NOT NULL,
  barangay        TEXT NOT NULL CHECK (barangay IN ('agutay','agsao','ipil','ambulong','poblacion','jao-asan','dulangan','tampayan','silum')),
  sitio           TEXT NOT NULL CHECK (length(sitio) BETWEEN 1 AND 100),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_barangay ON customers (barangay);
CREATE INDEX idx_customers_names ON customers (last_name_norm, first_name_norm);

CREATE TABLE admin_users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  role          TEXT NOT NULL CHECK (role IN ('admin','treasurer','staff')),
  barangay      TEXT CHECK (barangay IS NULL OR barangay IN ('agutay','agsao','ipil','ambulong','poblacion','jao-asan','dulangan','tampayan','silum')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- admins see every barangay; treasurers/staff belong to exactly one
  CHECK ((role = 'admin' AND barangay IS NULL) OR (role IN ('treasurer','staff') AND barangay IS NOT NULL))
);
-- exactly one ACTIVE treasurer per barangay; any number of backup staff
CREATE UNIQUE INDEX uq_one_active_treasurer ON admin_users (barangay) WHERE role = 'treasurer' AND is_active = 1;

CREATE TABLE bills (
  bill_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  meter_id       INTEGER NOT NULL REFERENCES customers (meter_id),
  billing_period TEXT NOT NULL CHECK (billing_period GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]' AND substr(billing_period, 6, 2) BETWEEN '01' AND '12'),
  pre_reading    INTEGER NOT NULL CHECK (pre_reading >= 0),
  curr_reading   INTEGER NOT NULL CHECK (curr_reading >= 0),
  tcmeter        INTEGER NOT NULL CHECK (tcmeter >= 0),
  amount         INTEGER NOT NULL CHECK (amount >= 0),
  surcharge      INTEGER NOT NULL DEFAULT 0 CHECK (surcharge >= 0),
  bill_amount    INTEGER NOT NULL CHECK (bill_amount >= 0),
  duedate        TEXT NOT NULL CHECK (duedate GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  posted_by      INTEGER NOT NULL REFERENCES admin_users (user_id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (curr_reading >= pre_reading),
  CHECK (tcmeter = curr_reading - pre_reading),
  CHECK (bill_amount = amount + surcharge),
  UNIQUE (meter_id, billing_period)          -- one bill per meter per month (of a given year)
);
CREATE INDEX idx_bills_period ON bills (billing_period);
CREATE INDEX idx_bills_due ON bills (duedate);

CREATE TABLE receipt_counters (
  year    INTEGER PRIMARY KEY,
  last_no INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  payment_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no   TEXT NOT NULL UNIQUE,         -- OR-2026-000001
  bill_id      INTEGER NOT NULL REFERENCES bills (bill_id),
  payment_date TEXT NOT NULL CHECK (payment_date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  amount_paid  INTEGER NOT NULL CHECK (amount_paid > 0),
  created_by   INTEGER NOT NULL REFERENCES admin_users (user_id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at    TEXT,
  voided_by    INTEGER REFERENCES admin_users (user_id),
  void_reason  TEXT,
  CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
    (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(void_reason) >= 3)
  )
);
CREATE INDEX idx_payments_bill ON payments (bill_id);
CREATE INDEX idx_payments_date ON payments (payment_date);
CREATE INDEX idx_payments_creator ON payments (created_by);

CREATE TABLE audit_logs (
  audit_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES admin_users (user_id),
  meter_id         INTEGER,
  owner_first_name TEXT,
  owner_last_name  TEXT,
  action           TEXT NOT NULL,
  table_name       TEXT NOT NULL,
  record_id        INTEGER,
  description      TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs (created_at);
CREATE INDEX idx_audit_meter ON audit_logs (meter_id);

CREATE TABLE complaints (
  complaint_id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  barangay     TEXT NOT NULL CHECK (barangay IN ('agutay','agsao','ipil','ambulong','poblacion','jao-asan','dulangan','tampayan','silum')),
  meter_id     INTEGER NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('no_water','leak','billing','meter','other')),
  message      TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  matched      INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0,1)),   -- 1 = meter + name matched a registered customer
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  admin_notes  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT,
  updated_by   INTEGER REFERENCES admin_users (user_id)
);
CREATE INDEX idx_complaints_status ON complaints (status, created_at);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,                 -- SHA-256 of the cookie token
  user_id    INTEGER NOT NULL REFERENCES admin_users (user_id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,                 -- unix seconds
  last_seen  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
