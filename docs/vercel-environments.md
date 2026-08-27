# Vercel environment separation

PeerSlot deliberately refuses to start in a Vercel Preview deployment unless
`PREVIEW_DATABASE_URL` is configured. The value must point to a Neon branch or
database that is separate from production.

## Vercel variables

Configure these in **Project Settings → Environment Variables**:

- Production: set `DATABASE_URL` to the production Neon connection string.
- Preview: set `PREVIEW_DATABASE_URL` to a preview-only Neon branch. Do not
  expose the production `DATABASE_URL` to Preview deployments.
- Development: use a development branch in `.env.local` as `DATABASE_URL`.
- Optionally set `PRODUCTION_DATABASE_URL` in Preview to make the runtime reject
  an accidentally identical preview URL. Any `DATABASE_URL` visible in Preview
  is also treated as a production comparison guard. Neither comparison value is
  ever used for preview queries.

After changing variables, redeploy existing previews because Vercel injects
environment variables when a deployment is built.

## Protect preview deployments

In **Project Settings → Deployment Protection**, enable Vercel Authentication
for Preview deployments. If reviewers without a Vercel account need access,
use a time-limited protection bypass instead of making all previews public.

## Migration workflow

Run migrations explicitly against the intended branch. Production migrations
should be run from a controlled production environment; do not run them as part
of every preview build. Create or reset a Neon preview branch before applying
the migration set for a preview that needs database changes.
