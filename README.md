# Transaction categories

Implementation of the *transaction categories* feature: a FastAPI service that
implements `contracts/transaction-categories.public.openapi.yaml`, and a React
client that shows the transaction feed with categories on it.

The original assignment brief, unchanged, is kept at
[`docs/ASSIGNMENT.md`](docs/ASSIGNMENT.md).
The contracts under `contracts/` are the source of truth and are never edited.

For a narrative of what was built and how it maps to the contract, see
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md); for the decisions, assumptions
and open questions, see [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Architecture

```
implementation/
  backend/  FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL 16
  web/      React 19 + Vite + RTK Query, types generated from the contracts
docs/       the brief, the decisions log and the implementation notes
contracts/  the two OpenAPI documents (unmodified)
mock/       the reference mock / transactions upstream shipped with the brief
acceptance/ 66 black-box checks of the categories contract
fixtures/   seeded feed and token fixtures, used by tests only, never at runtime
```

The assessment package (`contracts/`, `mock/`, `acceptance/`, `fixtures/`) stays
at the repository root, unmodified, so the commands the brief specifies keep
working. Everything written for the feature lives under `implementation/`, and
the writing about it under `docs/`.

## Run it

Requirements: Docker (with Compose), Node 20+, pnpm, Python 3.12+ with `uv`.

```bash
docker compose up -d --build
node acceptance/run.mjs            # 66/66 with CATEGORIES_URL defaulting to http://localhost:8080
```

To run the acceptance suite against *this* backend instead of the mock's
reference implementation:

```bash
docker compose up -d --build
CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs   # 66/66
```

Start the web client against the mock alone, or the mock plus this backend:

```bash
pnpm --dir implementation/web install
pnpm --dir implementation/web generate
pnpm --dir implementation/web dev
```

`implementation/web/.env` controls which APIs the client talks to:

```
VITE_TRANSACTIONS_API_URL=http://localhost:8080
VITE_CATEGORIES_API_URL=http://localhost:8081   # or :8080 for the mock-only path
VITE_ACCESS_TOKEN=<token from `node mock/token.mjs owner-a`>
```

## Backend

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

```bash
cd implementation/web
pnpm install
pnpm generate        # regenerates src/api/generated from contracts/
pnpm typecheck
pnpm lint
pnpm test
```

## Status

The backend implements the contract and passes the acceptance suite
**66/66** against the reference mock as the transactions API, on a fresh
database and on a re-run. The generated API layer is committed and regenerates
with no diff. The web client loads the feed, shows category chips, sets and
clears categories optimistically with rollback, and manages custom categories;
`tsc`, ESLint, Vitest and the axe check pass. See
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the choices taken and
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for how it all fits together.

Known gaps before this is production-ready, tracked here rather than hidden:

- the manage dialog does not yet restore focus to its trigger on close;
- the mock's `X-Mock-Delay-Ms` / `X-Mock-Fail-Status` headers are not yet wired
  into a documented manual resilience walk-through (the failure paths are
  covered by the MSW component test and the fake-upstream unit tests).
