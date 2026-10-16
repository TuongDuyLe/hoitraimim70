-- Additive migration; apply AFTER schema.sql and upgrade-v2.sql. Safe to rerun.
-- Keep every existing order and every payment receipt for reconciliation.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_source_check
  CHECK (payment_source IS NULL OR payment_source IN ('cash','manual','vietqr'));

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  environment varchar(10) NOT NULL CHECK (environment IN ('sandbox','production')),
  reference varchar(13) NOT NULL,
  content varchar(23) NOT NULL,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 1000000000),
  bank_code varchar(12) NOT NULL,
  bank_account varchar(40) NOT NULL,
  virtual_account varchar(40),
  bank_name varchar(120) NOT NULL,
  account_name varchar(120) NOT NULL,
  qr_code text,
  qr_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  UNIQUE (environment,reference)
);
CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY,
  environment varchar(10) NOT NULL CHECK (environment IN ('sandbox','production')),
  transaction_id varchar(200) NOT NULL,
  reference_number varchar(200) NOT NULL,
  order_id uuid REFERENCES orders(id),
  provider_order_id varchar(100) NOT NULL,
  bank_account varchar(40) NOT NULL,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 1000000000),
  transaction_type varchar(1) NOT NULL CHECK (transaction_type IN ('C','D')),
  transaction_time timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash varchar(64) NOT NULL,
  status varchar(10) NOT NULL CHECK (status IN ('confirmed','review','ignored')),
  reason varchar(60),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment,transaction_id),
  UNIQUE (environment,reference_number)
);
CREATE INDEX IF NOT EXISTS payment_receipts_order_idx ON payment_receipts(order_id);
CREATE INDEX IF NOT EXISTS payment_receipts_review_idx ON payment_receipts(status,received_at DESC);
