# Money Representation Audit

> Date: 2026-09-03 · Branch: `docs/money-audit` · Scope: `scalable-commerce-engine`

## Summary

Money is stored consistently as integers in minor units (`priceCents`,
`totalCents`), all typed `Int`. No `Float` or `Decimal` appears anywhere in
the schema. Multiplying a price by an integer quantity is exact, and the
existing payment and order flows are wrapped in transactions with a row
lock on stock.

Three gaps were found. Currency is not modelled at all, which blocks the
ledger work. Conversions between minor units and decimal display are
duplicated inline in four places rather than passing through one boundary.
Order totals are persisted before they are computed — safe today, but only
because of where the transaction boundary happens to sit.

## Background: why minor units

Amounts are stored as integers in the currency's smallest unit — `1999`
rather than `19.99`. IEEE 754 floating point cannot represent most decimal
fractions exactly, so `0.1 + 0.2` evaluates to `0.30000000000000004`.
Repeated across many transactions, that error accumulates into balances
that no longer reconcile against the payment provider.

Integers avoid this. Addition and multiplication by an integer quantity are
exact. Division is the one operation that still needs an explicit decision,
since splitting an amount rarely divides evenly.

The `Cents` suffix on every field name is deliberate: it makes the unit
visible at the call site, so a reader never has to check the schema to know
whether a value has already been scaled.

## Method

Static analysis with `ripgrep` across `src/` and `prisma/`, excluding tests:

| Check | Pattern |
|---|---|
| Numeric types in schema | `Float\|Decimal\|BigInt` |
| Monetary fields | `price\|cents\|amount\|total\|currency` |
| Arithmetic on money | `(cents\|price\|amount\|total)\s*[\*\/]` |
| Manual rounding | `Math\.(round\|floor\|ceil)\|toFixed` |
| Transaction boundaries | `\$transaction\|FOR UPDATE` |

21 monetary lines across 6 files. All were read individually rather than
sampled.

Two checks remain open: where the Stripe currency string is set, and
whether the stock check in `orders.service.ts` happens before or after the
row lock is acquired.

## Findings

| # | Location | Issue | Severity |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | No `currency` column on any monetary field | **High** |
| 2 | `orders.service.ts:40,57,74,79` | Total persisted as `0`, computed after, then updated; returned object patched manually | **Medium** |
| 3 | `ai.service.ts:35,83` | Duplicated display conversion; `$` hardcoded | Low |
| 4 | `search.controller.ts:18-19` | Parsing correct via `Math.round`, but no validation for `NaN`, negatives, or out-of-range values | Low |

### Finding 1 — Currency is not modelled

Every amount is a bare integer with no currency attached. `payment.service.ts:45`
sends `amount: totalCents` to Stripe, which requires a currency, so the value
exists somewhere as a hardcoded string rather than as data.

This is safe only while the system serves a single implicit currency. It
blocks the ledger directly: double-entry requires that all entries within a
transaction share a currency, and that constraint cannot be enforced
without the column. Adding it later, against live data, is a far more
expensive migration than adding it now.

Not every currency has two decimal places. JOD has three, JPY has zero.
Any code assuming a fixed `× 100` scaling is already wrong for those.

### Finding 2 — Order total is written before it is computed

`OrdersService.create` inserts the order with `totalCents: 0`, accumulates
the total in a loop, issues a second write, then patches the in-memory
object on line 79 so the API response carries the real total.

**This is not a correctness bug.** All of it runs inside
`prisma.$transaction`, so the zero-total state is never visible to another
transaction, and a crash before COMMIT rolls the row back entirely. No
concurrent reader can observe an order with a zero total.

The issue is the durability of that correctness. It holds only while the
create and the update stay inside the same transaction boundary — a fact
not visible from reading either statement alone. A future change that moves
the create outside the transaction to shorten lock duration would open a
silent window in which `PaymentService` could read `totalCents: 0` and
charge nothing. The manual patch on line 79 exists precisely because the
persisted object is wrong at that point, which is the signal that the write
ordering is working against the code rather than with it.

**Preferred shape:** compute the total with a `reduce` before the insert,
then create the order once. Two queries instead of three, no manual patch,
and correctness that no longer depends on where the transaction boundary
sits.

### Findings 3 and 4 — Conversions at the boundaries

Four places convert between minor units and decimal representation, each
written inline:

- `search.controller.ts:18-19` parses user input with
  `Math.round(Number(x) * 100)`. The rounding is what makes this correct —
  `Number("19.99") * 100` is `1998.9999999999998` before it. Nothing
  validates the input first, so `NaN`, negative values, and values beyond
  safe integer range all pass through to the Elasticsearch query.
- `ai.service.ts:35` and `:83` format prices for display with
  `(priceCents / 100).toFixed(2)`, duplicated verbatim, with `$` hardcoded.

Each is individually defensible. The problem is that they are four
independent implementations of the same rule, so correctness depends on
every future author remembering it.

## Strengths

- Consistent minor-unit representation across schema, services, and DTOs
- `SELECT ... FOR UPDATE` on stock inside a transaction (`orders.service.ts:49`)
- Payment flows wrapped in transactions (`payment.service.ts:102,166`)
- Field naming carries the unit (`priceCents`, not `price`)

## Open risks

**LLM price hallucination.** `ai.service.ts` injects formatted prices into
an LLM prompt and returns generated text to users. Nothing validates that
prices appearing in the model's output exist in the input set. A
hallucinated discount shown to a customer is a financial and legal
exposure, not a quality issue.

**Payment/database divergence.** If Stripe succeeds and the subsequent
database write fails, the customer has been charged and the system does not
know. Nothing currently detects this class of divergence. This is the
motivating case for the ledger and reconciliation work.

## Decisions

| # | Action | Priority | When |
|---|---|---|---|
| 1 | Add `currency` (ISO 4217) to every monetary field | **High** | Ledger migration |
| 2 | Introduce `src/common/money.ts` as the single conversion boundary | Medium | Today |
| 3 | Reorder `OrdersService.create` to compute before persisting | Medium | This week |
| 4 | Validate LLM-generated prices against the input set | Medium | Backlog |
| 5 | Validate price filter inputs (`NaN`, negative, range) | Low | Backlog |

Decision 1 is a prerequisite for the ledger, not an improvement to it.
Double-entry requires that entries within a transaction share a currency,
and that constraint cannot be enforced without the column.

Decision 2 defines a single module owning every conversion between minor
units and decimal representation. No inline `/100` or `* 100` outside it.