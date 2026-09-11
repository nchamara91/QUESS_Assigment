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

## Process

- **The implementation lives under `implementation/`; the assessment package
  stays at the repository root.** *Alternative:* move `contracts/`, `mock/`,
  `acceptance/` and `fixtures/` into a `docs/`/`assignment/` folder too. We did
  not, because `acceptance/run.mjs` imports `../mock/token.mjs` and the brief
  specifies `node acceptance/run.mjs` verbatim; moving the package would break
  that command. Separating the code keeps the two concerns visually distinct
  without changing anything the reviewer runs.
- **The brief's README was preserved as `ASSIGNMENT.md`** so the repository
  could carry its own delivery README without editing the source material.
  The contracts, fixtures, mock and acceptance run are untouched.

## Open questions to the assessors

- _none yet._
