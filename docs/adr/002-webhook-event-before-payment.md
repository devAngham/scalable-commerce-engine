# ADR-002: WebhookEvent before Payment

> Status: Accepted · Date: 2026-09-05 · Supersedes the ordering in the backlog

## Context

The Payment model was designed first, assuming that recording what Stripe
charged is the foundation everything else sits on. Reviewing it surfaced a
dependency that inverts that order.

Payment keeps only current state: its status column is overwritten as an
attempt moves through the Stripe lifecycle, and `updatedAt` is a single
timestamp rather than a transition log. That is the right shape for Payment —
three overlapping append-only logs would be three sources of truth that can
disagree. But it means the intermediate history has to exist somewhere, and
today it exists nowhere.

WebhookEvent is also the correct idempotency boundary. A unique constraint on
Stripe's own event id is enforced by the database and cannot be defeated by
concurrent delivery, unlike the application-level status check that failed in
SCE-002.

## Decision

Build WebhookEvent first. Payment's handler is written on top of it rather
than retrofitted onto it.

## The models, as decided

```prisma
enum WebhookEventStatus {
  PENDING
  PROCESSED
  FAILED        // retryable: attempts still below the cap
  DEAD_LETTERED // terminal: will not be retried
}

model WebhookEvent {
  id               String    @id @default(uuid())

  // Received facts — immutable, enforced by trigger.
  stripeEventId    String    @unique
  type             String
  payload          Json
  stripeCreatedAt  DateTime
  receivedAt       DateTime  @default(now())

  // Retention policy — writable, outside the trigger's lock.
  expiresAt        DateTime? @default(dbgenerated("((now() AT TIME ZONE 'UTC') + interval '400 days')"))

  // Processing state — mutable.
  status           WebhookEventStatus @default(PENDING)
  processedAt      DateTime?
  processingError  String?
  attempts         Int       @default(0)

  // Derived accessor; payload stays authoritative.
  orderId          String?

  @@index([status, receivedAt])
  @@index([type, receivedAt])
  @@index([orderId])
}
```

Payment carries `VARCHAR(3)` currency, `lastFailureCode` and
`lastFailureMessage`, a nullable `settledAt`, and `@@index([status, createdAt])`.

## Consequences

**Retention is 400 days, not 90.** A customer can dispute a charge months
later and the original event is the evidence. A short window would have us
destroying our own defence.

**Immutability is enforced by trigger, not convention.** The boundary is not
mutable versus immutable rows — it is *what Stripe sent* versus *what we did
with it*. Received facts are locked by a `BEFORE UPDATE OF` trigger.
Processing state is state, and state changes. `expiresAt` and `orderId` stay
writable: retention can be extended for a legal hold, and a correction to the
extraction logic should be backfillable without touching the payload.

**Deletion is guarded, not blocked.** `expiresAt IS NULL` means indefinite
retention. Otherwise deletion requires a seven-day margin past expiry, so a
bug that sets `expiresAt` too early is catchable before the evidence is gone.

**A processing failure returns 2xx.** Stripe treats a non-2xx as a delivery
failure and retries, but the event row has already committed, so the retry
would fail on the unique constraint — the dedup gate would block the
legitimate retry as well as the duplicate. Returning 2xx and recording the
error moves retry responsibility entirely to us.

That makes the sweep job a precondition rather than a follow-up. Without it,
a processing failure is silent data loss, which is worse than the duplicate
delivery this design exists to prevent.

**The handler needs a savepoint, not a try/catch.** Postgres aborts the whole
transaction on the first statement error and refuses everything after it, so
writing `processingError` inside the same transaction as a failed effect
would lose the event insert as well. Shape: insert → SAVEPOINT → apply effect
→ on failure ROLLBACK TO SAVEPOINT, record the error → commit. Use
`tx.$executeRaw` for the savepoint statements, since Prisma has no
first-class API for them. This is easy to mistake for needless complexity and
must be commented as such at the call site.

**Exhausted attempts are dead-lettered.** A terminal status makes the sweep
query self-terminating and makes "show me abandoned events" a first-class
condition rather than something reconstructed from `attempts >= N` with the
cap duplicated across every ad-hoc query.

## Payment corrections from the same review

- `currency` is `VARCHAR(3)`, not an enum. ISO 4217 is a large, occasionally
  changing list; an enum would mean a migration per currency.
  `CHECK (currency ~ '^[A-Z]{3}$')` is hand-added to the migration.
  `VARCHAR` rather than `CHAR` because `bpchar` pads with spaces and compares
  equal across the padding.
- `CHECK ("amountCents" > 0)`, hand-added. Strictly greater than zero:
  Stripe never creates a PaymentIntent for nothing.
- `lastFailureCode` and `lastFailureMessage` mirror Stripe's
  `last_payment_error`. Stripe has no FAILED status — a declined attempt
  returns to `REQUIRES_PAYMENT_METHOD` — so without these, a never-attempted
  payment and a declined one are indistinguishable. These are last-failure
  pointers, not a log; the sequence lives in WebhookEvent. The handler must
  clear both when writing a success, or a stale decline reason will sit
  beside a SUCCEEDED status.
- `settledAt` is a nullable timestamp, not a status value. Settlement happens
  at the balance-transaction level, days after `succeeded`. Conflating the
  two would let the system ship goods against money that has not arrived.

## Deferred

Every timestamp column in this schema is `TIMESTAMP(3)` without a zone,
including `stripeCreatedAt`, which arrives from Stripe as a Unix epoch and
loses its zone on the way in. In a system that compares its own clock against
a payment provider's, that is a real exposure. Tracked separately.

`Order.paymentIntentId` and `Order.paymentAttempts` become redundant once
Payment exists — both are derivable from the payments relation. Retire them
after the handler is migrated.

A dedicated low-privilege role owning the DELETE grant would enforce *who*
may delete, where the trigger only enforces *what* may be deleted. The two
compose rather than compete. Deferred as infrastructure work: this deployment
connects with a single role today.
