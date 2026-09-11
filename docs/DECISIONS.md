# Decisions

One page, kept current as the build progresses. Each entry: the choice, the
alternative, and why.

## Backend

- **Seeding of the nine system categories is lazy.** `ensure_system_categories`
  runs at the start of every request and inserts any missing canonical rows with
  `ON CONFLICT DO NOTHING` on `(organisation_id, code)`. *Alternative:* a
  first-request hook or a background job. Lazy seeding guarantees the list is
  never empty from the very first request whichever endpoint is hit, and the
  conflict clause makes concurrent first requests idempotent.
- **Name uniqueness is enforced by the database on a folded name.** We store a
  `name_folded` column (`str.casefold()`) and put a unique index on
  `(organisation_id, name_folded)`. *Alternative:* `lower(name)` in an
  expression index. `casefold()` gives Unicode-correct folding (`Zürich` /
  `ZÜRICH`, `ß` / `ss`), which the acceptance run exercises. The application
  maps the resulting `IntegrityError` back to `transaction_category_name_taken`,
  so two concurrent creates yield one 201 and one 409.
- **Assignments reference categories `ON DELETE CASCADE`.** Deleting a custom
  category uncategorises every transaction that carried it in the same
  statement, exactly as the contract requires, with no application-side loop.
  *Alternative:* `SET NULL` — we would still have to delete the row to make
  `assigned_at`/`assigned_by` null, so cascade plus row deletion is simpler.
- **Clearing an assignment deletes the row** rather than storing
  `category_id = NULL`. A missing row and a cleared assignment are
  indistinguishable on the wire and the table stays free of dead rows.
- **Idempotency is value-based.** Setting the same non-null `category_id` twice
  returns the stored row unchanged, preserving `assigned_at`; clearing is
  always idempotent.
- **The upstream is consulted before any write.** Category existence is checked
  locally first (cheap), then the transactions API is read and mapped
  (404 → `transaction_not_found`, timeout/network/5xx → `transactions_unavailable`).
  The write happens only after that check succeeds.
- **422 is a hand-built map.** FastAPI's default validation body is not the
  contract's map, so a `RequestValidationError` handler rewrites Pydantic error
  types into the snake_case issue codes (`required`, `blank`, `too_long`,
  `invalid_choice`, `invalid_format`, `too_many_items`, `empty`) and routes
  model-level problems to `non_field_errors`.
- **A malformed `X-Organization-Id` is `400 validation_error`,** not a 422:
  it is a domain error on a header, not a request body field.
- **The published OpenAPI is trimmed to the contract.** FastAPI adds a `422`
  response to every operation with validated parameters, including the two where
  the contract declares none (list and delete). A small `openapi()` override
  strips those two so our document matches the contract operation for operation;
  runtime behaviour is unchanged and pinned by `tests/test_openapi.py`.

## Web

- **The inline selector is a native `<select>`.** *Alternative:* a custom
  combobox. The native control already has the keyboard, screen-reader and
  focus semantics the assignment asks to prove, with no re-implementation to
  get wrong; the a11y test runs axe against it.
- **Optimistic changes are local overrides over the server's assignment map.**
  A change is applied immediately as an override and deleted again if the
  request fails; the underlying RTK Query cache is left untouched. *Alternative:*
  patching the lookup cache in `onQueryStarted`. The override approach keeps the
  rollback to a single deletion and the settled state authoritative.
- **Array query params are serialized explicitly.** RTK Query's `fetchBaseQuery`
  coerces arrays with `String(...)`, producing `transaction_id=a,b`; the contract
  is `explode: true` (repeated params), so `src/api/baseQuery.ts` appends them one
  by one. This is a genuine defect the MSW test caught.
- **One assignments lookup per loaded page.** The page's transaction ids are the
  query arg; appending a page changes the arg once, so the network tab shows one
  request per page and never one per row.
- **Tests run on happy-dom, not jsdom.** jsdom provides its own `AbortSignal`,
  which undici's `Request` (used by MSW) rejects; happy-dom shares the Node
  globals. *Alternative:* polyfilling `AbortSignal` in the setup file.
- **Codegen configs are `.cjs`.** The `rtk-query-codegen-openapi` CLI loads a
  TypeScript config only when `ts-node`/`esbuild-runner` is present; a CommonJS
  config removes that dependency. The generator is run from `pnpm generate` and
  its output is committed unedited.
- **One `tsconfig`, no project references.** `tsconfig.node.json` only added
  build-mode complexity; `tsc --noEmit` over `src` is the single check, with
  `vite.config.ts` linted separately without type information.
- **Loaded pages are merged and de-duplicated by `transaction_id`.** The feed can
  shift between fetches (a new transaction pushes page 2 down); collapsing
  repeats keeps a row from appearing twice. The merge lives in
  `src/lib/paging.ts` and is unit-tested.
- **The manage dialog manages focus itself:** on open it remembers the trigger
  and focuses its close button, Tab is trapped inside, and Escape closes and
  returns focus to the trigger. All controls are native elements, so the rest of
  the keyboard behaviour is the platform's.

## Process

- **The implementation lives under `implementation/`; the assessment package
  stays at the repository root.** *Alternative:* move `contracts/`, `mock/`,
  `acceptance/` and `fixtures/` into a `docs/`/`assignment/` folder too. We did
  not, because `acceptance/run.mjs` imports `../mock/token.mjs` and the brief
  specifies `node acceptance/run.mjs` verbatim; moving the package would break
  that command. Separating the code keeps the two concerns visually distinct
  without changing anything the reviewer runs.
- **The brief was preserved as `docs/ASSIGNMENT.md`** so the repository could
  carry its own delivery README without editing the source material. The
  contracts, fixtures, mock and acceptance run are untouched.

## Assumptions

Where the contract is silent, these are the calls we made. All are exercised by
the acceptance run or by a test unless marked otherwise.

**Backend**

- System category ids are UUID4s minted per organisation at first seed; only
  `code` is treated as the cross-organisation identity. The contract requires
  stability per organisation, not a global id.
- The 50-category limit counts custom categories only; the nine system ones are
  always in addition.
- `assigned_by` stores the bearer `sub` verbatim. The contract caps the field at
  128 characters, so we assume subjects fit; a longer one would currently be
  rejected by the database.
- The token issuer is **not** verified. We check the HS256 signature, `exp`,
  `sub` and a non-empty `orgs`; the environment the brief names has no issuer
  setting. *(Not covered by a test.)*
- Every upstream non-2xx that is not a 404 (including 401/403 and other 4xx) maps
  to `transactions_unavailable`. The contract names only 404, timeout and 5xx.
- Category existence is checked before the upstream visibility read, so when both
  the category and the transaction are invalid the category 404 is returned. The
  contract fixes neither order.
- An unknown body field is reported under its own key with issue code
  `invalid_format`. The contract lists the allowed issue codes but does not say
  which one an extra field carries.
- `updated_at` uses the database clock (`onupdate=now()`); custom categories with
  equal folded names fall back to `created_at`. *(Name ties are not covered by a
  test.)*

**Web**

- The API URLs default to `localhost:8080`/`:8081`, so the app runs with an empty
  `.env`; the `VITE_*` variables override.
- A failure shows one sentence and reverts the selector; the server's assignment
  is authoritative once the request settles.
- Only the loaded page's ids are looked up, so the batch is never larger than the
  100 the contract allows (a page is 20).
- A colour token outside the eight renders the neutral fallback chip, never the
  raw token.
- The generated API files are read-only; the array-parameter fix lives in
  `implementation/web/src/api/baseQuery.ts`, not in generated output.

## Questions for the assessors

We did not block on these: each has the decision we took in its place, as the
brief allows.

1. **`assigned_by` length.** If a subject's `sub` exceeds 128 characters, should
   the service truncate, reject, or widen the column? We let the database reject
   it today.
2. **Upstream 403/other 4xx.** Is `transactions_unavailable` the intended mapping,
   or should a non-404 client error pass through? We map everything except 404
   to `503`.
3. **Token issuer.** Should `iss` be verified? No issuer is configured by the
   environment the brief specifies, so we skip it.
4. **Extra request fields.** Which issue code should an unknown body field carry?
   We use `invalid_format`.

## Contract observations

Reported, not changed; the behaviour we implemented is next to each.

1. **Malformed `X-Organization-Id` returns `400 validation_error`** (stated in
   the parameter description) but no operation declares a `400` response, so the
   generated client has no type for it. We implement the `400`; the generated
   types simply do not model it.
2. **Duplicate component names across the two contracts** (`Envelope`,
   `ErrorResponse`, `ValidationErrorResponse`, `CoreTransactionId`). Codegen
   emits them into separate modules, so there is no runtime collision; a consumer
   that imports both must alias them. We did not touch the contracts.
3. **`DELETE /transaction-categories/{category_id}` with a malformed id answers
   422** under the shared validation conventions, but the operation declares no
   422 response (its sibling PATCH does). We keep the behaviour, omit the 422
   from our published OpenAPI to match the contract, and report the gap here.
