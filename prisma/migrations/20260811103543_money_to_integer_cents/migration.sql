-- SCE-001: Convert money from Float (dollars) to Int (cents), preserving data.
-- ROUND(x * 100) converts dollars to cents; ::integer casts the result.

ALTER TABLE "Product"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price" * 100)::integer;
ALTER TABLE "Product" RENAME COLUMN "price" TO "priceCents";

ALTER TABLE "Order"
  ALTER COLUMN "total" TYPE INTEGER USING ROUND("total" * 100)::integer;
ALTER TABLE "Order" ALTER COLUMN "total" SET DEFAULT 0;
ALTER TABLE "Order" RENAME COLUMN "total" TO "totalCents";

ALTER TABLE "OrderItem"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price" * 100)::integer;
ALTER TABLE "OrderItem" RENAME COLUMN "price" TO "priceCents";