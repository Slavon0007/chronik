# Organizer form service

The form is built into Chronik. The Cloudflare Worker stores submissions in D1 and exposes their public fields to the existing daily collection workflow. GitHub Issue submissions already in the catalogue can still be imported.

1. In a Cloudflare account with Workers and D1 enabled, create a D1 database named `chronik-organizer` and put its database ID in `wrangler.toml`.
2. From this directory, apply `wrangler d1 execute chronik-organizer --remote --file schema.sql`, then run `wrangler deploy`. Use an authenticated Wrangler session.
3. In the Chronik repository's Actions variables, set `CHRONIK_ORGANIZER_API_URL` to the HTTPS Worker URL. The Pages workflow uses it both to read submissions and to enable the form in the build.
4. Deploy Pages and verify the form using an actual event or a non-production deployment. The public `/events` endpoint returns the current entries and a pagination cursor.

For local testing, use an isolated local D1 database with `wrangler d1 execute chronik-organizer --local --file schema.sql`. Run `wrangler dev --port 8790 --var SITE_ORIGIN:http://127.0.0.1:4173`, then build Chronik with `VITE_ORGANIZER_API_URL=http://127.0.0.1:8790` and serve it at `http://127.0.0.1:4173`.

## Artisan directory

Apply schema.sql to the existing D1 database before deploying the Worker. GET /artisans returns the public directory and POST /artisans publishes a profile. Both craft types store the selected city. Only workshops store a public address and an explicit map pin. Online shops always use the city centre from the generated GeoNames index.

In production the Worker reads city records from the site's /chronik/ base path. For a local static build set SITE_BASE_URL=http://127.0.0.1:4173/ in the Worker environment.
