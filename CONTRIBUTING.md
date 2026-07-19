# Contributing to ScopeForge

Thanks for taking the time to contribute. This guide covers local setup and what a
good pull request looks like.

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
npm run dev
```

`npm run dev` installs dependencies for both apps, applies database migrations,
checks your environment, and starts the API and web servers together. The app
runs in mock mode by default, so no external keys are needed to develop.

To run the pieces separately, see the "Run the API and web app separately"
section in the [README](README.md#getting-started).

## Branch naming

Use short, descriptive branch names with a type prefix:

- `feat/…` — new functionality
- `fix/…` — bug fixes
- `docs/…` — documentation only
- `chore/…` — tooling, dependencies, or maintenance

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): a type,
an optional scope, and a concise summary — for example `fix(api): guard usage
plaque against IP counter`.

## Before you open a pull request

Run the checks that CI runs:

```bash
# Frontend
npm run lint:web
npm run typecheck:web
npm run build:web

# Backend
cd apps/api
pytest
```

## Pull request expectations

- Keep changes focused; unrelated refactors belong in a separate PR.
- Describe what changed and why, and how you verified it.
- Update documentation when behavior or configuration changes.
- Do not commit secrets, `.env` files, or local database files.
