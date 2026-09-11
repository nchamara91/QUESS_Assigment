.PHONY: up down acceptance backend-check web-check token

up: ## start the whole stack
	cp -n .env.example .env 2>/dev/null || true
	docker compose up -d --build

down:
	docker compose down

acceptance: ## run the 66 contract checks against the local backend
	CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs

backend-check:
	cd implementation/backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest

web-check:
	cd implementation/web && pnpm generate && git diff --exit-code src/api/generated && pnpm typecheck && pnpm lint && pnpm test

token: ## print a demo bearer token for implementation/web/.env
	node mock/token.mjs owner-a
