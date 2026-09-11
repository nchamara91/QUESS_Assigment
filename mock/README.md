# Reference mock

Plain Node (≥ 20), no dependencies, HTTP on port 8080.

```bash
node mock/server.mjs                 # start
MOCK_PORT=9090 node mock/server.mjs  # another port
node mock/server.mjs --dump fixtures # write the seeded feed as JSON and exit
node mock/token.mjs                  # print the three demo bearer tokens
```

What it serves:

| Surface | Contract | Notes |
|---------|----------|-------|
| `GET /api/v1/app/transactions`, `GET /api/v1/app/transactions/{id}` | `contracts/transactions.public.openapi.yaml` | Every filter of the production feed, same 422 rules |
| `/api/v1/app/transaction-categories*`, `PUT /api/v1/app/transactions/{id}/category`, `GET /api/v1/app/transaction-category-assignments` | `contracts/transaction-categories.public.openapi.yaml` | In-memory reference implementation of the domain you are building |
| `POST /mock/reset` | – | Re-seed everything (no auth) |
| `GET /healthz` | – | Liveness |

Two organisations are seeded deterministically (same ids and transactions on every start):

| Organisation | `organization_id` | Transactions | Members |
|--------------|-------------------|--------------|---------|
| Acme Robotics (A) | `3f9c2a1e-6b7d-4e8f-9a0b-1c2d3e4f5a61` | 140 over 90 days | `owner-a`, `advisor` |
| Bluefin Studio (B) | `b7e1d4c2-0a9f-4c3b-8d5e-6f7a8b9c0d12` | 36 over 90 days | `owner-b`, `advisor` |

Bearer tokens are HS256 JWTs signed with `assignment-dev-secret` (override with `MOCK_JWT_SECRET`). Claims: `sub`, `email`, `orgs`, `iat`, `exp`, `iss: assignment-mock`. `advisor` is a member of both organisations, so `X-Organization-Id` chooses which one a request acts in; the other two subjects have a single organisation and may omit the header.

CORS is open to any origin with credentials, so a Vite dev server on another port can call the mock directly.

Failure injection, per request:

| Header | Effect |
|--------|--------|
| `X-Mock-Delay-Ms: 800` | Hold the response for that long (max 10 s) |
| `X-Mock-Fail-Status: 500` | Answer with that status and `error.code = mock_failure` |

Categories and assignments created through the mock are lost on restart or `POST /mock/reset`. The transactions never change: there is no way to create, confirm or fail one through the mock, and that is deliberate.
