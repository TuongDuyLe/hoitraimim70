-- Additive, repeatable upgrade. Run after schema.sql inside the setup transaction.
-- Existing users, hashes, sessions, products and order price snapshots stay intact.
ALTER TABLE users ALTER COLUMN username TYPE varchar(50);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','cashier','sales','drinks','seller'));
ALTER TABLE users ADD CONSTRAINT users_check CHECK ((role='seller' AND seller_id IS NOT NULL) OR (role<>'seller' AND seller_id IS NULL));
ALTER TABLE products ADD COLUMN IF NOT EXISTS department varchar(10);
UPDATE products SET department=CASE
  WHEN lower(category || ' ' || name) ~ '(handmade|thủ công|thu cong|móc|moc khoa|vòng|vong tay)' THEN 'handmade'
  WHEN lower(category || ' ' || name) ~ '(đồ uống|do uong|nước|nuoc|trà|tra dao|cà phê|ca phe|giải khát|giai khat|drink|coffee|juice|soda)' THEN 'drinks'
  ELSE 'food' END WHERE department IS NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_department_check;
ALTER TABLE products ADD CONSTRAINT products_department_check CHECK (department IS NULL OR department IN ('food','handmade','drinks'));
ALTER TABLE orders ALTER COLUMN seller_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status varchar(10) NOT NULL DEFAULT 'none';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (fulfillment_status IN ('none','queued','preparing','ready','delivered'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_source_check CHECK (payment_source IS NULL OR payment_source IN ('cash','manual','vietqr'));

-- Add department/stall metadata without changing historical quantity or price.
UPDATE orders o SET items=(
  SELECT jsonb_agg(entry.item || jsonb_build_object(
    'department', COALESCE(entry.item->>'department', p.department,
      CASE WHEN lower(entry.item->>'name') ~ '(handmade|thủ công|móc|vòng)' THEN 'handmade'
           WHEN lower(entry.item->>'name') ~ '(nước|trà|cà phê|coffee|soda)' THEN 'drinks' ELSE 'food' END),
    'sellerId', COALESCE(entry.item->>'sellerId',p.seller_id::text,o.seller_id::text),
    'sellerName', COALESCE(entry.item->>'sellerName',s.name,o.seller_name)
  ) ORDER BY entry.ordinality)
  FROM jsonb_array_elements(o.items) WITH ORDINALITY AS entry(item,ordinality)
  LEFT JOIN products p ON p.id::text=entry.item->>'productId'
  LEFT JOIN sellers s ON s.id=p.seller_id
) WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) AS entry(item)
  WHERE entry.item->>'department' IS NULL OR entry.item->>'sellerId' IS NULL OR entry.item->>'sellerName' IS NULL);

-- Dispatch historical paid orders exactly once, using preserved item snapshots.
INSERT INTO preparation_tasks(id,order_id,department,items,order_code,customer_name,note)
SELECT md5(o.id::text || ':' || bucket.department)::uuid,o.id,bucket.department,bucket.items,o.code,o.customer_name,o.note
FROM orders o CROSS JOIN LATERAL (
  SELECT item->>'department' AS department,jsonb_agg(item ORDER BY ordinality) AS items
  FROM jsonb_array_elements(o.items) WITH ORDINALITY AS entry(item,ordinality)
  GROUP BY item->>'department'
) bucket WHERE o.payment_status='paid' AND bucket.department IN ('food','handmade','drinks')
ON CONFLICT(order_id,department) DO NOTHING;
UPDATE orders o SET fulfillment_status=CASE
  WHEN NOT EXISTS(SELECT 1 FROM preparation_tasks t WHERE t.order_id=o.id) THEN 'none'
  WHEN NOT EXISTS(SELECT 1 FROM preparation_tasks t WHERE t.order_id=o.id AND t.status<>'delivered') THEN 'delivered'
  WHEN NOT EXISTS(SELECT 1 FROM preparation_tasks t WHERE t.order_id=o.id AND t.status NOT IN ('ready','delivered')) THEN 'ready'
  WHEN EXISTS(SELECT 1 FROM preparation_tasks t WHERE t.order_id=o.id AND t.status<>'queued') THEN 'preparing'
  ELSE 'queued' END;
