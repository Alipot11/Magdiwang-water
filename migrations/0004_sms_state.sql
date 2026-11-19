-- The gateway's own state for a message (Pending / Processed / Sent / Delivered / Failed).
ALTER TABLE sms_outbox ADD COLUMN gateway_state TEXT;