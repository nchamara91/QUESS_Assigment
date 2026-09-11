# Transaction categories

Implementation of the *transaction categories* feature: a FastAPI service that
implements `contracts/transaction-categories.public.openapi.yaml`, and a React
client that shows the transaction feed with categories on it.

The original assignment brief, unchanged, is kept at
[`docs/ASSIGNMENT.md`](docs/ASSIGNMENT.md).
The contracts under `contracts/` are the source of truth and are never edited.

For a narrative of what was built and how it maps to the contract, see
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md); for the decisions, assumptions
and open questions, see [`DECISIONS.md`](DECISIONS.md).

## Architecture

```
implementation/
  backend/  FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL 16
  web/      React 19 + Vite + RTK Query, types generated from the contracts
docs/       the brief (ASSIGNMENT.md) and the local notes
contracts/  the two OpenAPI documents (unmodified)
mock/       the reference mock / transactions upstream shipped with the brief
acceptance/ 66 black-box checks of the categories contract
fixtures/   seeded feed and token fixtures, used by tests only, never at runtime
```

The assessment package (`contracts/`, `mock/`, `acceptance/`, `fixtures/`) stays
at the repository root, unmodified, so the commands the brief specifies keep
working. Everything written for the feature lives under `implementation/`; the
brief is preserved under `docs/`.

## Run it

Everything runs from the repository root. You need **Docker Desktop** running
and **Node 20+** (the mock, the token minter and the acceptance script are plain
Node). `pnpm` (via `corepack`) and `uv` are only needed for the optional local
development and check commands further down.

```bash
cp .env.example .env
node mock/token.mjs owner-a          # paste the printed token into VITE_ACCESS_TOKEN in .env
docker compose up -d --build
```

Then open **http://localhost:5173**.

| Service | URL |
|---------|-----|
| Web client (nginx) | http://localhost:5173 |
| Categories API (this service) | http://localhost:8081 |
| Mock / transactions API | http://localhost:8080 |

`docker compose down` stops everything and keeps the database; add `-v` to wipe
it. The web client's API URLs are written into `config.js` at container start, so
switching it to the mock's own categories is a restart, not a rebuild:

```bash
VITE_CATEGORIES_API_URL=http://localhost:8080 docker compose up -d web
```

### Verify with the acceptance suite

```bash
node acceptance/run.mjs                                        # 66/66 against the mock
CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs   # 66/66 against this backend
```

## Backend

The service runs in Docker with the rest of the stack. To run its checks locally
(needs `uv`):

```bash
cd implementation/backend
uv sync
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Environment (`.env.example` at the repo root):

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | async SQLAlchemy URL, e.g. `postgresql+asyncpg://postgres:postgres@localhost:5432/categories` |
| `TRANSACTIONS_API_URL` | base URL of the transactions upstream |
| `AUTH_HS256_SECRET` | shared HS256 secret for bearer tokens |
| `PORT` | HTTP port, default `8081` |

## Web

The client is served by the container by default. To run it locally with the
Vite dev server instead (needs `pnpm` via `corepack enable`):

```bash
cd implementation/web
corepack pnpm install
cp .env.example .env        # only for the dev server; set the URLs and the token
corepack pnpm generate      # optional: regenerates src/api/generated from contracts/
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm dev
```

The root `.env` drives the container; `implementation/web/.env` is read only by
the Vite dev server.

The feed supports the transaction filters defined by the existing contract:
search, kind, status, date range and USDC amount range. Results use numbered
pagination with 20 rows per page. Filtering by category remains out of scope per
the assignment.

## Status

The backend implements the contract and passes the acceptance suite
**66/66** against the reference mock as the transactions API, on a fresh
database and on a re-run. The generated API layer is committed and regenerates
with no diff. The web client loads the feed, shows category chips, sets and
clears categories optimistically with rollback, and manages custom categories;
`tsc`, ESLint, Vitest and the axe check pass. See
[`DECISIONS.md`](DECISIONS.md) for the choices taken and
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for how it all fits together.

Known gaps before this is production-ready, tracked here rather than hidden:

- the page is verified against both API targets at the HTTP level (runtime
  `config.js` injection and CORS); there is no automated browser end-to-end run;
- the mock's `X-Mock-Delay-Ms` / `X-Mock-Fail-Status` failure injection is a
  manual walk-through (see `docs/IMPLEMENTATION.md`); the failure paths
  themselves are covered by the MSW component tests and the fake-upstream
  backend tests.
