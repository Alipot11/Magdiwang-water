-- Views: balances are always derived from non-voided payments.

CREATE VIEW bill_balances AS
SELECT b.bill_id, b.meter_id, b.billing_period, b.pre_reading, b.curr_reading, b.tcmeter,
       b.amount, b.surcharge, b.bill_amount, b.duedate, b.created_at,
       COALESCE(p.total_paid, 0) AS total_paid,
       MAX(b.bill_amount - COALESCE(p.total_paid, 0), 0) AS balance,
       CASE WHEN COALESCE(p.total_paid, 0) >= b.bill_amount THEN 'PAID'
            WHEN COALESCE(p.total_paid, 0) > 0 THEN 'PARTIALLY PAID'
            ELSE 'UNPAID' END AS status
FROM bills b
LEFT JOIN (SELECT bill_id, SUM(amount_paid) AS total_paid FROM payments WHERE voided_at IS NULL GROUP BY bill_id) p
       ON p.bill_id = b.bill_id;

CREATE VIEW payment_details AS
SELECT p.payment_id, p.receipt_no, p.payment_date, p.amount_paid, p.created_at, p.created_by,
       u.full_name AS received_by, p.voided_at, p.void_reason,
       b.bill_id, b.billing_period, b.meter_id, b.pre_reading, b.curr_reading, b.tcmeter,
       b.amount, b.surcharge, b.bill_amount, b.duedate,
       c.first_name, c.last_name, c.barangay, c.sitio
FROM payments p
JOIN bills b ON b.bill_id = p.bill_id
JOIN customers c ON c.meter_id = b.meter_id
JOIN admin_users u ON u.user_id = p.created_by;

-- Audit trail written by the database itself so no code path can skip it.

CREATE TRIGGER trg_bills_audit AFTER INSERT ON bills
BEGIN
  INSERT INTO audit_logs (user_id, meter_id, owner_first_name, owner_last_name, action, table_name, record_id, description)
  SELECT NEW.posted_by, c.meter_id, c.first_name, c.last_name, 'CREATE', 'bills', NEW.bill_id,
         'Bill #' || NEW.bill_id || ' (' || NEW.billing_period || ') posted for meter ' || c.meter_id || ': ₱' || NEW.bill_amount
  FROM customers c WHERE c.meter_id = NEW.meter_id;
END;

CREATE TRIGGER trg_payments_audit AFTER INSERT ON payments
BEGIN
  INSERT INTO audit_logs (user_id, meter_id, owner_first_name, owner_last_name, action, table_name, record_id, description)
  SELECT NEW.created_by, c.meter_id, c.first_name, c.last_name, 'CREATE', 'payments', NEW.payment_id,
         'Receipt ' || NEW.receipt_no || ': ₱' || NEW.amount_paid || ' paid for bill #' || b.bill_id || ' (' || b.billing_period || '), meter ' || c.meter_id
  FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.bill_id = NEW.bill_id;
END;

CREATE TRIGGER trg_payments_void_audit AFTER UPDATE OF voided_at ON payments
WHEN OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
BEGIN
  INSERT INTO audit_logs (user_id, meter_id, owner_first_name, owner_last_name, action, table_name, record_id, description)
  SELECT NEW.voided_by, c.meter_id, c.first_name, c.last_name, 'VOID', 'payments', NEW.payment_id,
         'Receipt ' || NEW.receipt_no || ' (₱' || NEW.amount_paid || ') voided. Reason: ' || substr(NEW.void_reason, 1, 300)
  FROM bills b JOIN customers c ON c.meter_id = b.meter_id WHERE b.bill_id = NEW.bill_id;
END;

-- Integrity guards: money records are corrected by voiding, never by editing or deleting.

CREATE TRIGGER trg_payments_no_delete BEFORE DELETE ON payments
BEGIN SELECT RAISE(ABORT, 'Payments cannot be deleted. Void the payment instead.'); END;

CREATE TRIGGER trg_payments_no_edit BEFORE UPDATE OF receipt_no, bill_id, payment_date, amount_paid, created_by ON payments
BEGIN SELECT RAISE(ABORT, 'Payments cannot be edited. Void the payment instead.'); END;

CREATE TRIGGER trg_payments_no_unvoid BEFORE UPDATE OF voided_at ON payments
WHEN OLD.voided_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'A voided payment cannot be restored.'); END;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Audit logs are read-only.'); END;

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Audit logs are read-only.'); END;
