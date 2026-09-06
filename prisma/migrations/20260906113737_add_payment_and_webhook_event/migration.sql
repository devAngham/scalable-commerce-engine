-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_PAYMENT_METHOD', 'REQUIRES_CONFIRMATION', 'REQUIRES_ACTION', 'PROCESSING', 'REQUIRES_CAPTURE', 'CANCELED', 'SUCCEEDED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'DEAD_LETTERED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT_METHOD',
    "providerFeeCents" INTEGER,
    "lastFailureCode" TEXT,
    "lastFailureMessage" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) DEFAULT ((now() AT TIME ZONE 'UTC') + interval '400 days'),
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_stripeEventId_key" ON "WebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_receivedAt_idx" ON "WebhookEvent"("type", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_orderId_idx" ON "WebhookEvent"("orderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- CHECK constraints: not expressible in schema.prisma.
-- ─────────────────────────────────────────────────────────────

-- Amounts are always positive minor units. Refunds are separate rows in a
-- future Refund model, never a negative amount here. Strictly > 0: Stripe
-- never creates a PaymentIntent for nothing.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amountCents_positive" CHECK ("amountCents" > 0);

-- VARCHAR(3) bounds the length; this bounds the character set to Stripe's
-- uppercase ISO 4217 codes.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

-- ─────────────────────────────────────────────────────────────
-- Immutability of received-fact columns, enforced at the database level
-- regardless of which application code path issues the UPDATE.
--
-- NOTE: IS DISTINCT FROM on jsonb compares normalised content, not bytes.
-- A rewrite of payload that only reorders keys will not trip this trigger.
-- Acceptable: we care about content integrity, not byte layout.
--
-- NOTE: Prisma does not track triggers. Renaming any of these five columns
-- in a future migration will not update this function — edit it by hand.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION webhook_event_received_facts_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."stripeEventId"      IS DISTINCT FROM OLD."stripeEventId"
     OR NEW."type"            IS DISTINCT FROM OLD."type"
     OR NEW."payload"         IS DISTINCT FROM OLD."payload"
     OR NEW."stripeCreatedAt" IS DISTINCT FROM OLD."stripeCreatedAt"
     OR NEW."receivedAt"      IS DISTINCT FROM OLD."receivedAt"
  THEN
    RAISE EXCEPTION 'WebhookEvent received-fact columns are immutable (id=%)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Scoped with UPDATE OF so a status or attempts write does not even pay the
-- trigger dispatch cost.
CREATE TRIGGER webhook_event_received_facts_immutable
BEFORE UPDATE OF "stripeEventId", "type", "payload", "stripeCreatedAt", "receivedAt"
ON "WebhookEvent"
FOR EACH ROW
EXECUTE FUNCTION webhook_event_received_facts_immutable();

-- ─────────────────────────────────────────────────────────────
-- Retention guard.
-- expiresAt IS NULL means indefinite retention (legal hold).
-- Otherwise a seven-day margin past expiry, so a bug that sets expiresAt
-- too early is catchable before the evidence is actually gone.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION webhook_event_retention_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."expiresAt" IS NULL
     OR OLD."expiresAt" > (now() AT TIME ZONE 'UTC') - interval '7 days'
  THEN
    RAISE EXCEPTION
      'WebhookEvent row (id=%) is not yet eligible for deletion (expiresAt=%, NULL = indefinite retention)',
      OLD."id", OLD."expiresAt";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_event_retention_guard
BEFORE DELETE ON "WebhookEvent"
FOR EACH ROW
EXECUTE FUNCTION webhook_event_retention_guard();