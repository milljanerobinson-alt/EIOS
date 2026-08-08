# Cloudflare Pages staging environment

Tracking issue: #32 — LLND Automate staging environment on Cloudflare Pages.

This runbook configures a non-production staging project only. Do not attach a custom
domain or reuse these settings as a production deployment model.

## Repository compatibility

- Framework: Vite / React
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root
- Staging deployment branch: `main`
- Preview deployments: enabled for all non-production branches and pull requests
- SPA routing: preserve `public/_redirects`; Vite copies it into `dist/_redirects`

The current redirects are:

```text
/oauth/consent  /eios#/oauth/consent  302
/*  /index.html  200
```

The first rule preserves the EIOS OAuth consent boundary. The second provides the
Cloudflare Pages SPA fallback required for direct navigation.

## Cloudflare Pages project settings

Create one Cloudflare Pages project through GitHub integration:

1. Select the `milljanerobinson-alt/EIOS` repository.
2. Select Vite as the framework preset.
3. Set the production branch to `main`. In this project, the Cloudflare
   "production branch" is the **non-production staging source**.
4. Set the build command to `npm run build`.
5. Set the build output directory to `dist`.
6. Leave the root directory at the repository root.
7. Enable automatic deployments for `main`.
8. Enable preview deployments for all other branches and pull requests.
9. Keep the generated `*.pages.dev` hostname.
10. Do not add a custom domain and do not add a Cloudflare Access restriction if
    previews must be publicly reachable for automated browser testing.

A push merged into `main` updates the stable staging URL. Feature branches and pull
requests receive immutable deployment URLs and, where Cloudflare provides them,
branch aliases under the same `pages.dev` project.

A dedicated staging branch is not needed yet. Consider one later only if `main`
begins representing a separately controlled production release line.

## Environment variables

Configure these in Cloudflare Pages for both the staging/production environment
(`main`) and preview environment:

| Variable | Classification | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public Vite/client configuration | Supabase project URL embedded in the browser bundle. |
| `VITE_SUPABASE_ANON_KEY` | Public Vite/client configuration | Supabase publishable/anon key embedded in the browser bundle; database protection must rely on RLS and grants. |

Do not configure or expose these server/test-only values in Cloudflare Pages:

- `SUPABASE_SERVICE_ROLE_KEY`
- Any Supabase secret key
- Any database password
- GitHub tokens, OAuth client secrets, or provider credentials

The repository also contains test-only references to `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `DRY_RUN`. They are not required by the browser
deployment. Never rename a service-role key with a `VITE_` prefix.

Do not commit environment values to Git. Cloudflare values must be entered in the
Pages project settings.

## Supabase Auth configuration

After Cloudflare creates the stable staging hostname, update Supabase Dashboard →
Authentication → URL Configuration:

1. Set **Site URL** to `https://<pages-project>.pages.dev` for this staging phase.
2. Add exact redirect URLs:
   - `https://<pages-project>.pages.dev/`
   - `https://<pages-project>.pages.dev/eios`
3. Add a preview-host redirect pattern matching the Cloudflare-generated preview
   hostnames for this project, for example
   `https://*.<pages-project>.pages.dev/**`.
4. Retain any required localhost redirect URLs while local testing remains active.
5. Do not remove existing authorised URLs until their consumers are confirmed retired.

The application derives OAuth and password-recovery destinations from
`window.location.origin` and the active product boundary:

- LLND Automate: `https://<pages-project>.pages.dev/`
- EIOS: `https://<pages-project>.pages.dev/eios`

For Google or Apple sign-in, the provider console callback normally remains the
Supabase callback URL
`https://<supabase-project-ref>.supabase.co/auth/v1/callback`. Confirm it is still
registered; do not substitute the Pages URL for the provider callback.

Supabase OAuth-server consent continues to enter at `/oauth/consent`, which
Cloudflare redirects to the EIOS hash route.

## Deployment verification

After the first deployment, verify:

- `/` loads LLND Automate and the title is **LLND Automate**.
- `/eios` loads EIOS and the title changes to **EIOS**.
- `/llnd` and `/lln` migrate to the LLND root without loops.
- `/#/llnd-automate/login` loads the LLND login.
- **Back to website** returns to the staging root.
- Direct requests to app paths do not return a Cloudflare 404.
- OAuth and password-recovery links stay on the correct product hostname/path.
- The browser console has no new runtime errors.
- Built assets and page source contain no service-role keys, passwords, tokens, or
  other server credentials.
- A feature branch or PR preview URL is publicly reachable without authentication.

Record the stable staging URL and one verified preview URL on issue #32 after
deployment.
