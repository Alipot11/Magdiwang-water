-- SMS notifications (manual sending through an SMSGate phone).
-- Phones are stored as +639XXXXXXXXX. Nothing is ever sent unless a person presses Send.

ALTER TABLE customers ADD COLUMN phone TEXT
  CHECK (phone IS NULL OR phone GLOB '+639[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
ALTER TABLE customers ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (sms_opt_in IN (0,1));

-- One row per message. A bill or a payment can have at most ONE SMS row; a retry updates that row.
CREATE TABLE sms_outbox (
  sms_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  meter_id           INTEGER NOT NULL REFERENCES customers (meter_id),
  phone              TEXT NOT NULL CHECK (phone GLOB '+639[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  kind               TEXT NOT NULL CHECK (kind IN ('bill','payment')),
  bill_id            INTEGER REFERENCES bills (bill_id),
  payment_id         INTEGER REFERENCES payments (payment_id),
  body               TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 480),
  -- pending   = saved here, not yet sent to the gateway
  -- submitted = the gateway accepted it (not yet confirmed delivered)
  -- delivered = confirmed delivered, failed = the gateway reported failure
  -- error     = our call to the gateway failed (bad login, no connection); safe to retry
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','delivered','failed','error')),
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  gateway_message_id TEXT,
  error              TEXT,
  created_by         INTEGER NOT NULL REFERENCES admin_users (user_id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at            TEXT,
  updated_at         TEXT,
  CHECK ((kind = 'bill' AND bill_id IS NOT NULL AND payment_id IS NULL)
      OR (kind = 'payment' AND payment_id IS NOT NULL AND bill_id IS NULL))
);
CREATE UNIQUE INDEX uq_sms_one_per_bill    ON sms_outbox (bill_id)    WHERE bill_id IS NOT NULL;
CREATE UNIQUE INDEX uq_sms_one_per_payment ON sms_outbox (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_sms_status  ON sms_outbox (status, created_at);
CREATE INDEX idx_sms_meter   ON sms_outbox (meter_id);

-- The SMS log is a record: rows can be updated (status) but never deleted.
CREATE TRIGGER trg_sms_no_delete BEFORE DELETE ON sms_outbox
BEGIN SELECT RAISE(ABORT, 'SMS records cannot be deleted.'); END;