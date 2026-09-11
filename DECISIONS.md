# Decisions

One page, as the brief asks: the choice, the alternative, the why. The code and
its tests carry the detail; the brief itself is `docs/ASSIGNMENT.md`.

## Backend

- **Lazy seeding** of the nine system categories, `ON CONFLICT DO NOTHING` on
  `(organisation_id, code)` — never empty, concurrency-safe. *Not* a hook or a job.
- **Name uniqueness lives in the database**, on a `casefold()`ed `name_folded`
  column (not `lower()`); the `IntegrityError` maps back to
  `transaction_category_name_taken`, so concurrent creates give 201 + 409.
- **Assignments `ON DELETE CASCADE`** — one statement uncategorises every holder;
  `SET NULL` would still need a row delete.
- **Clearing deletes the assignment row** — a missing row and a cleared one are
  indistinguishable on the wire.
- **Idempotency is value-based** — re-setting the same category preserves `assigned_at`.
- **The upstream is read before any write** — 404 → `transaction_not_found`,
  timeout/5xx → `transactions_unavailable`, nothing written on failure.
- **422 is a hand-built map** — Pydantic types become the contract's snake_case
  issue codes; model-level problems go under `non_field_errors`.
- **A malformed `X-Organization-Id` is 400 `validation_error`**, not a 422.
- **The published OpenAPI is trimmed to the contract** — FastAPI auto-adds a 422
  that the contract does not declare on two operations; pinned by a test.

## Web

- **A native `<select>` for the inline selector** — keyboard and screen-reader
  semantics come from the platform, not from a re-implementation.
- **Optimistic changes are local overrides** over the server's assignment map;
  rollback is a single deletion and the cache stays authoritative.
- **Array query params are appended one by one** — `fetchBaseQuery` comma-joins
  them, which the `explode: true` contract rejects.
- **One assignments lookup per loaded page** — the page's ids are the query arg.
- **Tests run on happy-dom** — jsdom's `AbortSignal` clashes with undici/MSW.
- **Codegen configs are `.cjs`** — the CLI cannot load a TS config without ts-node.
- **Explicit pagination keeps one page in memory** — it is easier to reconcile,
  bookmark and filter a banking feed than an ever-growing "load more" list; one
  assignments lookup receives exactly the current page's ids.
- **The manage dialog manages focus itself** — in on open, Tab trapped, restored
  on Escape.

## Layout

- All code under `implementation/`; the assessment package stays at the root so
  the brief's `node acceptance/run.mjs` works verbatim. The brief is preserved,
  unedited, as `docs/ASSIGNMENT.md`.

## Assumptions (the contract is silent; our call)

- System ids are UUID4s per organisation; `code` is the cross-org identity.
- The 50-category limit counts custom categories only.
- `assigned_by` stores the bearer `sub` verbatim; a subject longer than 128
  characters would be rejected by the database.
- The token issuer is not verified — no issuer is configured by the environment.
- Any upstream non-2xx that is not a 404 maps to `transactions_unavailable`.
- The category is checked before the upstream read, so its 404 wins if both fail.
- An unknown body field reports `invalid_format` under its own key.
- Web: API URLs default to localhost; an unknown colour renders the neutral chip;
  the generated API files are read-only.

## Questions for the assessors (decision taken in each one's place)

1. `sub` over 128 characters — truncate, reject or widen? We let the DB reject.
2. Upstream 403 and other 4xx — `transactions_unavailable` or passthrough? We map to 503.
3. Should `iss` be verified? We skip it.
4. Issue code for extra request fields? We use `invalid_format`.

## Contract observations (reported, not changed)

1. A malformed `X-Organization-Id` is specified to answer 400 `validation_error`,
   but no operation declares a 400 response.
2. The two contracts duplicate component names (`Envelope`, `ErrorResponse`,
   `ValidationErrorResponse`, `CoreTransactionId`); codegen emits them per module,
   so a consumer importing both must alias.
3. `DELETE …/{category_id}` answers 422 on a malformed id although it declares
   none; we keep the behaviour and match the contract in our document.

## For production

- Real authentication — issuer and audience verification, short token TTLs —
  instead of the shared development secret, plus rate limiting at the edge.
- Retries with jitter and a circuit breaker on the upstream read; ship the JSON
  logs with their correlation ids and alert on the upstream failure rate.
- Seed the system categories where organisations are created, not per request.
- Browser end-to-end tests (Playwright) for the page against both API targets,
  and a vetted dialog primitive instead of the hand-rolled focus trap.
