# EIOS — Engineering Intelligence Operating System

EIOS is a governed engineering platform for managing assessment workflows,
engineering work orders (EWOs), autonomous execution pipelines, and
engineering intelligence across the software development lifecycle.

## Architecture

EIOS is a single-page React application backed by Supabase (PostgreSQL,
Auth, Edge Functions) and integrates with GitHub for governed code
execution and with OpenAI/Codex for AI-assisted engineering.

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **AI**: OpenAI / Codex integration via edge functions
- **Execution**: GitHub-native autonomous execution pipeline

## Local Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npx vitest run
```

## Type Check

```bash
npx tsc --noEmit
```

## Lint

```bash
npx eslint src/ --max-warnings 0
```

## Project Structure

- `src/` — Application source (pages, components, lib)
- `src/pages/ecc/` — Engineering Control Centre pages
- `src/lib/` — Services and business logic
- `src/lib/atdConnect/` — ATD Connect MCP integration
- `src/lib/codex/` — Codex execution provider
- `supabase/functions/` — Supabase Edge Functions (Deno)
- `supabase/migrations/` — Database migrations
- `public/` — Static assets
- `.github/workflows/` — GitHub Actions workflows
- `scripts/` — Operational and test scripts

## Environment Setup

Create a `.env` file with the following keys (values not included):

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Edge function secrets are managed through the Supabase dashboard and are
not stored in the repository.

## Canonical Branch

The canonical branch is `main`. All governed changes flow through
engineering work orders (EWOs) and are verified by the
`ewo-verify.yml` GitHub Actions workflow before merging.

## Governed Contribution

EIOS uses a governed execution model:

1. Engineering work orders (EWOs) are registered and tracked
2. Changes are executed through the governed pipeline
3. Verification (type-check, build, tests) runs automatically
4. Product Owner acceptance is required for closeout

## License

Proprietary. All rights reserved.
