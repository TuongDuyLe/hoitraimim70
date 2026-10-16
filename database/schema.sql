-- Safe to rerun. This migration never deletes orders or resets passwords.
CREATE TABLE IF NOT EXISTS sellers (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  description varchar(300) NOT NULL DEFAULT '',
  color varchar(7) NOT NULL DEFAULT '#f97316',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username varchar(50) UNIQUE NOT NULL,
  name varchar(120) NOT NULL,
  email varchar(120),
  password_hash text NOT NULL,
  role varchar(10) NOT NULL CHECK (role IN ('admin', 'cashier', 'sales', 'drinks', 'seller')),
  seller_id uuid REFERENCES sellers(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role <> 'seller' AND seller_id IS NULL) OR (role = 'seller' AND seller_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash varchar(64) PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  window_started timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES sellers(id),
  name varchar(120) NOT NULL,
  category varchar(60) NOT NULL,
  department varchar(10) CHECK (department IS NULL OR department IN ('food', 'handmade', 'drinks')),
  price integer NOT NULL CHECK (price > 0 AND price <= 1000000000),
  stock integer CHECK (stock IS NULL OR stock >= 0),
  emoji varchar(20) NOT NULL DEFAULT '🍽️',
  color varchar(7) NOT NULL DEFAULT '#f97316',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_seller_idx ON products(seller_id);
CREATE TABLE IF NOT EXISTS settings (
  id integer PRIMARY KEY CHECK (id = 1),
  event_name varchar(120) NOT NULL DEFAULT 'Hội trại',
  bank_bin varchar(6) NOT NULL DEFAULT '',
  bank_name varchar(120) NOT NULL DEFAULT '',
  account_number varchar(40) NOT NULL DEFAULT '',
  account_name varchar(120) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  code varchar(20) UNIQUE NOT NULL,
  seller_id uuid REFERENCES sellers(id),
  seller_name varchar(120) NOT NULL,
  customer_name varchar(120) NOT NULL DEFAULT 'Khách lẻ',
  note varchar(500) NOT NULL DEFAULT '',
  items jsonb NOT NULL,
  total integer NOT NULL CHECK (total > 0 AND total <= 1000000000),
  payment_method varchar(10) NOT NULL CHECK (payment_method IN ('cash', 'transfer')),
  payment_status varchar(10) NOT NULL CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  cash_received integer CHECK (cash_received IS NULL OR cash_received BETWEEN 0 AND 1000000000),
  bank_details jsonb,
  payment_source varchar(10) CHECK (payment_source IS NULL OR payment_source IN ('cash', 'manual', 'vietqr')),
  fulfillment_status varchar(10) NOT NULL DEFAULT 'none' CHECK (fulfillment_status IN ('none', 'queued', 'preparing', 'ready', 'delivered')),
  created_by uuid NOT NULL REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  idempotency_key varchar(100) NOT NULL,
  request_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (created_by, idempotency_key),
  CHECK ((payment_status = 'paid' AND paid_at IS NOT NULL) OR (payment_status <> 'paid' AND paid_at IS NULL)),
  CHECK (payment_method <> 'cash' OR payment_status <> 'paid' OR (cash_received IS NOT NULL AND cash_received >= total))
);
CREATE INDEX IF NOT EXISTS orders_seller_date_idx ON orders(seller_id, created_at DESC);
CREATE TABLE IF NOT EXISTS order_audit (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  actor_id uuid REFERENCES users(id),
  action varchar(30) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_audit_order_idx ON order_audit(order_id);
CREATE TABLE IF NOT EXISTS preparation_tasks (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  department varchar(10) NOT NULL CHECK (department IN ('food', 'handmade', 'drinks')),
  status varchar(10) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'preparing', 'ready', 'delivered')),
  items jsonb NOT NULL,
  order_code varchar(20) NOT NULL,
  customer_name varchar(120) NOT NULL,
  note varchar(500) NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id),
  updated_by_name varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,department)
);
CREATE INDEX IF NOT EXISTS preparation_department_status_idx ON preparation_tasks(department,status,created_at);
CREATE TABLE IF NOT EXISTS order_messages (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  department varchar(10) CHECK (department IS NULL OR department IN ('food', 'handmade', 'drinks')),
  author_id uuid NOT NULL REFERENCES users(id),
  author_name varchar(120) NOT NULL,
  author_role varchar(10) NOT NULL CHECK (author_role IN ('admin', 'cashier', 'sales', 'drinks', 'seller')),
  message varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_order_created_idx ON order_messages(order_id,created_at);
