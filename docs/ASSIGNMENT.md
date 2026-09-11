# Test assignment: transaction categories

The client is a business banking product. An organisation holds one USDC wallet, funds it over ACH, wire or SEPA, pays out to recipients, and reads everything that happened in a transaction feed. The feed exists and is in production. What it lacks is a way to say *what* a transaction was for. That is the feature we ask you to build: **transaction categories**.

We chose it because it is real (it is on our roadmap as-is), self-contained (a new domain that reads the feed and never writes money), and small enough to finish well in a few days. It still touches everything we care about: a contract, a persistent domain with invariants, an upstream you do not own, tenant isolation, and a UI that has to survive slow and failing calls.

Estimated effort: two to three working days for two people. Please deliver within seven calendar days of receiving this package.

## The feature

As a member of an organisation I can:

1. **See** the category of every transaction in the feed, as a coloured chip on the row and in the detail view.
2. **Set or clear** the category of a transaction inline, from the row and from the detail view, without leaving the page.
3. **Manage** the organisation's categories: nine system categories that every organisation has (Income, Payroll, Suppliers, Taxes, Fees, Software, Travel, Internal transfer, Other) and up to fifty custom ones that I can create, rename, recolour and delete.

Rules that matter (the contract is the source of truth; this is the short version):

- A transaction carries at most one category. Any transaction may be categorised, including pending and failed ones.
- Category names are trimmed, 1–40 characters, unique within the organisation case-insensitively, system names included.
- System categories are immutable. Deleting a custom category uncategorises every transaction that carried it.
- Everything is scoped to the organisation the caller acts in. Another organisation's category or transaction is a 404, never a 403: existence is not leaked across tenants.
- Before assigning, the service confirms the transaction is visible to the organisation by asking the transactions API. If that API is down, nothing is written and the caller gets a 503.

Out of scope, please do not build: bulk selection and bulk assignment, filtering the feed by category, reports and budgets, automatic categorisation rules, a mobile client, a login flow.

## What is in this package

```
contracts/
  transactions.public.openapi.yaml            the feed you read (excerpt of the production client contract)
  transaction-categories.public.openapi.yaml  the domain you build
  openapi-common.yaml                         shared envelope, error and security components
mock/
  server.mjs      reference mock: the feed + an in-memory reference implementation of categories
  token.mjs       mints the bearer tokens; the same file is imported by the acceptance run
  README.md       ports, organisations, tokens, failure injection
acceptance/
  run.mjs         66 black-box checks of the categories contract; passes against the mock
fixtures/
  transactions.org-a.json, transactions.org-b.json   the seeded feed, for unit tests
  categories.org-*.system.json                       the nine system categories as the mock lists them
  tokens.json                                        the three demo subjects with their tokens
redocly.yaml      lint configuration for the contracts (npx @redocly/cli lint contracts/*.yaml)
```

Start the mock and see it work:

```bash
node mock/server.mjs
node acceptance/run.mjs            # 66/66 against the mock's own reference implementation
```

Conventions you will meet in the contracts, shared by every client API:

- Every success body is `{ "data": …, "correlation_id": "<uuid>" }`; the same id is in the `X-Correlation-Id` response header.
- Every domain error is `{ "type", "correlation_id", "error": { "code", "message", "data"? } }` with a stable snake_case `code`.
- Every 422 is a map from field name to a list of `{ "code", "message" }` issues; form-level problems live under `non_field_errors`.
- Authentication is a bearer JWT. The organisation a request acts in comes from `X-Organization-Id`, which must be one the subject is a member of; without the header the subject's first organisation is used.
- Amounts are integers in minor units (`amount_minor`); USDC has six decimals, so `1 250 000` is 1.25 USDC.
- Ids are opaque strings with a pattern: `txn_<32 hex>` for transactions, UUIDs for categories and organisations.

## What we ask you to build

Two parts. A full-stack team delivers both. A team applying for one discipline delivers that part and uses the mock's reference implementation for the other side; say so in your README.

### Part 1: the categories backend

A service that implements `contracts/transaction-categories.public.openapi.yaml` exactly, path for path, code for code.

- **Stack:** Python 3.12 or newer, FastAPI, SQLAlchemy 2 (async) with Alembic migrations, PostgreSQL 16, `uv` or `poetry`, `ruff`, a strict type checker (`pyrefly` or `mypy --strict`), `pytest`. This is our stack; fluency in it is part of what we are assessing.
- **Auth:** verify the HS256 bearer with the shared secret from `AUTH_HS256_SECRET`; reject a missing, malformed, expired or badly signed token with `401 unauthorized`. Resolve the organisation from `X-Organization-Id` and the token's `orgs` claim as the contract says.
- **The transactions API is an upstream you do not own.** Read it over HTTP at `TRANSACTIONS_API_URL`, forwarding the caller's bearer and `X-Organization-Id`. A 404 there is `404 transaction_not_found` here; a timeout (use two seconds) or 5xx there is `503 transactions_unavailable` here and nothing is written. Do not import the mock's data or look at the fixtures at runtime.
- **Configuration** by environment only: `DATABASE_URL`, `TRANSACTIONS_API_URL`, `AUTH_HS256_SECRET`, `PORT`. A `docker compose up` that starts PostgreSQL, runs the migrations, starts your service on `:8081` and the mock on `:8080` is the expected way to run it.
- **Persistence:** the schema comes from migrations. Name uniqueness per organisation is enforced by the database (a unique index on the case-folded name), not only in application code. Assignments reference categories with the delete behaviour you chose; write down why.
- **Seeding** of the nine system categories per organisation is your design decision: on first request, on demand, lazily, as long as the list is never empty and the ids are stable for the organisation.

### Part 2: the web client

A page that shows the feed with categories on it, built against the two contracts.

- **Stack:** TypeScript 5 or newer, React 19, Vite, RTK Query with types generated from the contracts by `@rtk-query/codegen-openapi` (or `openapi-typescript` with a typed fetch, if you prefer), Vitest with Testing Library, MSW for tests. Hand-written API types are not accepted: the generator must run from a `package.json` script and its output must be committed unedited.
- **Configuration:** `VITE_TRANSACTIONS_API_URL`, `VITE_CATEGORIES_API_URL`, `VITE_ACCESS_TOKEN`. No login screen; the token comes from the environment.
- **Feed:** pages of 20, "load more" or infinite scroll, newest first, with kind, direction, status, counterparty, amount in USDC and date. One assignments lookup per page, never one per row.
- **Category on the row:** a chip using the eight colour tokens, and an inline selector to set or clear the category. The change is optimistic; on any error it rolls back and tells the user what happened. Disabled while a change is in flight. Usable from the keyboard and labelled for a screen reader.
- **Detail view:** a drawer or panel for one transaction with the same selector.
- **Manage categories:** a dialog listing system categories read-only and custom ones editable; create, rename, recolour, delete. A `409 transaction_category_name_taken` or `transaction_category_limit_reached` is shown where the user is looking, next to the field, with the server's message.
- **Resilience:** loading, empty and error states for both APIs. Prove them with the mock's `X-Mock-Delay-Ms` and `X-Mock-Fail-Status` headers: a 500 from either API shows a retry, never a blank page.

## Definition of done

The assignment is done when every box below is ticked. We check them in this order and stop at the first unticked one that the README does not explain.

**Both parts**

- [ ] A private git repository we are invited to, with a README that gets a reviewer from clone to a running system in five commands or fewer. Commit history in English, in commits a reviewer can read one by one.
- [ ] `DECISIONS.md`, one page at most: the choices you made where the contract left room, the trade-offs, and what you would do differently for production. Questions you asked us and how we answered, or, when we did not answer in time, the decision you took instead.
- [ ] Nothing in the repository talks to anything outside `localhost`. No secret other than the shared development secret. No copy of the fixtures used at runtime.
- [ ] The contract was not changed. If you found a defect in it, it is reported in `DECISIONS.md` with the behaviour you implemented; a changed contract is an immediate stop.

**Backend**

- [ ] `CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs` reports **66/66** against your service with the mock as the transactions API, on a fresh database and again on the same database without a reset.
- [ ] Your service's own OpenAPI document (`/openapi.json` or equivalent) has the same six operation ids, paths, status codes and error codes as the contract; responses carry no fields the contract does not declare.
- [ ] Upstream failures are covered by tests against a fake transactions API: a 404 maps to `transaction_not_found`, a timeout and a 500 map to `transactions_unavailable`, and in the failure cases the database is untouched.
- [ ] Two concurrent creates of the same name yield one 201 and one 409, proven by a test, not by reasoning.
- [ ] `ruff check`, `ruff format --check`, the strict type checker and `pytest` all pass in CI or in a documented one-line command. Every function parameter and return is typed; no `Any` where a shape can be named; no ignore comments without a reason next to them.
- [ ] Structured JSON logs, one line per request, carrying the `correlation_id` that the response body and `X-Correlation-Id` header carry.

**Web client**

- [ ] `pnpm generate` (or equivalent) regenerates the API layer from `contracts/*.yaml` with no diff against what is committed.
- [ ] The page runs against the mock alone, and against the mock plus your backend, by changing two environment variables.
- [ ] The browser's network tab shows exactly one `transaction-category-assignments` request per loaded page of the feed.
- [ ] The category chip renders all eight colour tokens; a category whose colour the client does not know still renders legibly.
- [ ] Optimistic set/clear rolls back visibly on a 404 or 503, and the user is told why in words, not in a status code.
- [ ] The inline selector and the manage dialog work with keyboard only (Tab, arrows, Enter, Escape) and have accessible names; an automated a11y check (axe via `vitest-axe` or Playwright) reports no critical violation on the page.
- [ ] Vitest: unit tests for the models (paging, chip colour mapping, error-to-message mapping) and component tests with MSW handlers whose response bodies are taken from the contracts or the fixtures. `tsc --noEmit` and ESLint pass; no `any`; no `@ts-ignore`.

## How we evaluate

| Weight | What we look at |
|-------:|-----------------|
| 35 | Correctness against the contract: the acceptance run, the tenant rules, the upstream mapping, the a11y and resilience checks above |
| 25 | Code we could merge: typing, naming, module boundaries, migrations, no accidental complexity |
| 20 | Tests that would catch a regression: the concurrency test, the fake upstream, the MSW component tests |
| 10 | Product judgement in the small decisions the contract leaves open, and in the UI states |
| 10 | Communication: `DECISIONS.md`, commit messages, the questions you asked |

Immediate stops: hand-written API types, a changed contract, secrets or external calls in the repository, an acceptance run below 60/66 without an explanation in `DECISIONS.md`.

## Questions

Ask in writing, in one message per batch. We answer within one business day. If the answer does not arrive in time for you to keep moving, take the decision that seems right, write it in `DECISIONS.md`, and keep going; we will not hold an unanswered question against you.
