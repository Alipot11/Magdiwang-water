-- Sitio becomes optional (NULL = no sitio).
-- The table is NOT rebuilt (other tables point to it). Only the sitio column is swapped.

-- A view that mentions c.sitio blocks dropping the column, so drop it and recreate it at the end.
DROP VIEW payment_details;

ALTER TABLE customers ADD COLUMN sitio_new TEXT CHECK (sitio_new IS NULL OR length(sitio_new) BETWEEN 1 AND 100);
UPDATE customers SET sitio_new = sitio;
ALTER TABLE customers DROP COLUMN sitio;
ALTER TABLE customers RENAME COLUMN sitio_new TO sitio;

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