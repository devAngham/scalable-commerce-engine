# ADR-001: Store monetary values as integer cents

## Status
Accepted — 2026-08-11

## Context
Monetary fields (`Product.price`, `Order.total`, `OrderItem.price`) were stored as `Float`. IEEE 754 floating point cannot represent common decimal amounts exactly (e.g. `0.1 * 3 = 0.30000000000000004`), and checkout accumulated totals with float arithmetic. The rounding error surfaces at the payment boundary: the amount displayed to the customer could diverge from the amount sent to Stripe after `Math.round(total * 100)`, producing off-by-one-cent charges. At scale this creates systematic reconciliation mismatches between our database and Stripe settlement reports, and equality checks between "equal" float amounts are unreliable.

## Decision
Store and compute all monetary values as **integers in the smallest currency unit (cents)** across every layer: database → services → API boundary → Stripe. Integer arithmetic is exact, so accumulation and comparison carry zero rounding risk, and Stripe's API is already denominated in cents — the conversion layer disappears entirely (`amount: order.totalCents`, no `Math.round`).

Columns were deliberately renamed to `priceCents` / `totalCents` rather than keeping the old names. The suffix makes misreading the unit syntactically impossible, and the rename turned the TypeScript compiler into the refactor's audit tool: every stale usage became a compile error.

**Why not Prisma `Decimal`:** Decimal is the right tool when fractional-precision math (tax rates, percentage fees) must happen in the database layer. For this system, prices are whole-cent values and all percentage math can round to cents at computation time. Decimal returns `Decimal.js` objects that require handling in serialization and arithmetic throughout the codebase; integer cents are plain `number`s with none of that overhead. Simpler and sufficient wins.

**Migration approach:** Prisma's auto-generated migration would have blindly cast `Float → Integer` (turning `19.99` into `20` — silent data corruption, confirmed by the destructive-cast warning on 26 existing rows). The migration SQL was written by hand using `ALTER COLUMN ... TYPE INTEGER USING ROUND(col * 100)::integer` followed by a rename, converting values instead of truncating them. Verified row-by-row post-migration: all 14 monetary values matched `old × 100` exactly.

## Consequences
- `@Min(1)` on price DTOs: free ($0.00) products are unsupported by conscious decision. If a future feature needs them (samples, gifts), relax to `@Min(0)` with an explicit zero-price check in checkout.
- The entire HTTP boundary speaks cents, including search filters (`minPriceCents`/`maxPriceCents`). Formatting to `$19.99` is exclusively the client's job. One unit everywhere means no per-endpoint conversion bugs.
- The Elasticsearch mapping changed to `integer`; existing indexed documents required reindexing.
- On a live production system this in-place migration would instead be done as expand-contract (new column + dual-write + backfill + switch); acceptable here because the data was development-only.