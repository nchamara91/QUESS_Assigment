# Implementation notes

What was built, how it maps to the contract, and how it was verified. This is
the narrative companion to the two other documents:

- [`README.md`](../README.md) — how to run it, in five commands or fewer.
- [`DECISIONS.md`](DECISIONS.md) — the choices, the assumptions and the questions.
- `ASSIGNMENT.md` — the brief, unchanged.

## Repository layout

```
implementation/backend   FastAPI service (the domain we were asked to build)
implementation/web       React client (feed + categories)
docs/                    this file, the decisions log, the brief
contracts/               the two OpenAPI documents, unmodified, source of truth
mock/                    reference mock + transactions upstream (provided)
acceptance/              66 black-box checks (provided)
fixtures/                seeded feed, tokens, system categories (tests only)
```

The assessment package keeps its original paths so `node acceptance/run.mjs`
and the mock's relative import work exactly as shipped.

## What the feature does

An organisation's transaction feed gains a *purpose*: every transaction carries
at most one category, chosen inline, and each organisation has nine immutable
system categories plus up to fifty custom ones. Categories never move money.

## Backend

### Request lifecycle

```
RequestContextMiddleware   correlation id, X-Correlation-Id, one JSON log line
  -> get_claims            HS256 verify; 401 unauthorized on any failure
  -> get_organisation      X-Organization-Id vs the token's orgs; 403 or 400
  -> router                path/body/query validation; 422 map
  -> service               domain rules; the only place that writes
  -> session / upstream    PostgreSQL, and the transactions API on write
```

`app/logging.py` owns the middleware and the JSON formatter, so the id in the
body, the header and the log line is the same value by construction.

### Modules

| Module | Responsibility |
|--------|----------------|
| `app/main.py` | app factory, lifespan (engine + upstream client), routers |
| `app/config.py` | environment-only settings |
| `app/auth.py` | HS256 verification, `Claims` |
| `app/deps.py` | auth, organisation resolution, session, upstream dependency |
| `app/errors.py` | domain errors and the Pydantic → contract 422 map |
| `app/domain/models.py` | two tables and their constraints |
| `app/domain/schemas.py` | request/response models, name and colour rules |
| `app/domain/service.py` | the business rules |
| `app/domain/system_categories.py` | the nine canonical rows and lazy seeding |
| `app/api/*.py` | the six operations |
| `app/upstream/transactions.py` | the 2-second read of the transactions API |

### Data model

```
transaction_categories
  category_id       uuid  pk
  organisation_id   uuid
  kind              'system' | 'custom'
  code              text null            -- system only
  name              text
  name_folded       text                 -- str.casefold(name)
  color             text
  created_at, updated_at
  unique (organisation_id, name_folded)  -- case-insensitive uniqueness
  unique (organisation_id, code)         -- no duplicate system rows

transaction_category_assignments
  organisation_id, transaction_id  pk
  category_id  uuid null  -> transaction_categories on delete cascade
  assigned_at, assigned_by
```

Two invariants are pushed into PostgreSQL rather than guarded in Python:
case-insensitive name uniqueness (the folded column) and "deleting a category
uncategorises everything" (`ON DELETE CASCADE`). The application turns the
resulting `IntegrityError` into `transaction_category_name_taken`, which is why
two concurrent creates yield one 201 and one 409 rather than a race.

### Seeding

`ensure_system_categories` runs at the start of a request and inserts any
missing canonical rows with `ON CONFLICT DO NOTHING` on `(organisation_id,
code)`. The list is therefore never empty from the very first request, whichever
endpoint is hit, and concurrent first requests are safe.

### Contract map

| Operation | Method and path | `error.code`s implemented |
|-----------|-----------------|----------------------------|
| `listTransactionCategories` | `GET /api/v1/app/transaction-categories` | `unauthorized`, `organization_context_forbidden` |
| `createTransactionCategory` | `POST /api/v1/app/transaction-categories` | + `transaction_category_name_taken`, `transaction_category_limit_reached`, 422 |
| `updateTransactionCategory` | `PATCH /api/v1/app/transaction-categories/{category_id}` | + `transaction_category_not_found`, `system_category_immutable` |
| `deleteTransactionCategory` | `DELETE /api/v1/app/transaction-categories/{category_id}` | `204`, `system_category_immutable` |
| `setTransactionCategory` | `PUT /api/v1/app/transactions/{transaction_id}/category` | + `transaction_not_found`, `transactions_unavailable` |
| `lookupTransactionCategoryAssignments` | `GET /api/v1/app/transaction-category-assignments` | 422 on `transaction_id` |

The service's own `/openapi.json` exposes the same six operation ids, paths and
status codes. Success bodies are `{data, correlation_id}`; errors are
`{type, correlation_id, error}` or the field-keyed 422 map.

### Upstream

`setTransactionCategory` reads `GET /api/v1/app/transactions/{id}` on
`TRANSACTIONS_API_URL`, forwarding the caller's `Authorization` and
`X-Organization-Id`, with a two-second timeout. `404` → `transaction_not_found`;
timeout, network failure or 5xx → `transactions_unavailable`; **both happen
before any write**, so a failure leaves the database untouched (proved by test).

## Web client

### Generated API layer

`pnpm generate` runs `@rtk-query/codegen-openapi` over both contracts; the output
in `implementation/web/src/api/generated/` is committed and never hand-edited.
Two RTK Query APIs are built from two empty APIs, one per base URL, so the two
services stay independent.

### Array parameters

RTK Query's `fetchBaseQuery` coerces arrays with `String(...)`, so an array
param becomes `transaction_id=a,b`. The contracts use `explode: true` (repeated
params), so `src/api/baseQuery.ts` appends each value individually. This was a
real bug the MSW test caught, not a theoretical one.

### Feed

Pages of 20, newest first, accumulated as the user loads more. The ids of the
loaded page are the single query argument for the assignments lookup, so the
network tab shows **one** `transaction-category-assignments` request per page
and never one per row. Unknown or unassigned transactions read as
`category_id: null`.

### Chips and colours

`src/lib/colors.ts` maps the eight contract tokens to CSS custom properties; a
token the client does not know falls back to a neutral chip instead of an
unreadable one.

### Optimistic set and clear

`useCategorisation` keeps local overrides on top of the server's assignment map.
A change appears immediately and is deleted again if the request fails, at which
point the row shows a sentence explaining what happened. The control is disabled
while a change is in flight. Both the row and the detail drawer use the same
chip and selector.

### Accessibility and resilience

The inline selector is a native `<select>` with a visually-hidden label, so
keyboard and screen-reader behaviour come from the platform; an axe check runs
against the rendered page. Both APIs have loading, empty and error states, and a
failure shows a Retry button rather than a blank page.

### Manual resilience walkthrough

With the mock in the stack, a proxy or a browser extension can add
`X-Mock-Delay-Ms: 800` to see loading states, or `X-Mock-Fail-Status: 500` to see
the error-and-retry path. The automated equivalents are the MSW component test
(a 503 on assignment) and the fake-upstream backend tests.

## Testing

**Backend** (`pytest`)

- auth and organisation rules at the HTTP boundary (401/403/400, correlation id);
- the 422 map itself (missing, blank, list limits, `non_field_errors`, extra fields);
- upstream mapping and `raise_for` for 404 / 500 / timeout / 200;
- the canonical system-category list and order;
- **database-backed:** two concurrent identical creates → one success, one
  `transaction_category_name_taken`; an unavailable upstream writes no row.

**Web** (`Vitest` + `MSW` + `vitest-axe`)

- paging, colour-token mapping and error-to-message mapping as unit tests;
- the feed component against MSW handlers built from the fixtures: exactly one
  assignments lookup per page, optimistic rollback on a 503, and no axe
  violations.

## Verification

| Check | Result |
|-------|--------|
| `node acceptance/run.mjs` (mock) | 66/66 |
| `CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs` | 66/66, fresh DB and re-run |
| `docker compose up -d --build` | migrations then service healthy |
| backend `ruff check`, `ruff format --check`, `mypy app`, `pytest` | pass, 19 tests |
| web `generate` no-diff, `typecheck`, `lint`, `test`, `build` | pass, 20 tests |

## Known gaps and what is next

- The manage dialog does not restore focus to its trigger on close.
- The `X-Mock-*` failure headers are demonstrated manually, not in an automated
  end-to-end run.
- `assigned_by` longer than 128 characters would fail the database write
  (see `DECISIONS.md`).
- Real pagination for very long feeds (virtualisation, keyed cache merge) is out
  of scope; the current approach matches the brief.
