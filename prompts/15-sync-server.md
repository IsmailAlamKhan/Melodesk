# 15 — The sync server

## Goal

A tiny, accountless server that stores opaque encrypted text under an id, so the Melodesk sync (14) works
without the user running anything. It knows nothing about its contents.

## Needs

14 (the client), 01.

## Constraints

- It never parses, logs or inspects blob contents. Ids are 64 hex characters (a hash of the user's
  secret code), so they identify no one.
- Limits: a blob ≤ 1 000 000 characters (413 beyond), JSON bodies only, no CORS needed (the app calls it
  from Rust). Blobs nobody writes to for 400 days are dropped.
- Free-tier friendly: one Redis command per read; the compare-and-swap write is one Lua `EVAL`.

## Build

`apps/sync-server` (own `package.json`, TypeScript, Vitest):

- `src/handler.ts`: `handle(request, store)` is a plain `Request → Response` function (runs on Vercel,
  Cloudflare, Deno, Bun, Node). A leading `/api` is accepted. Routes: `GET /v1/health` →
  `{"ok":true,"name":"melodesk-sync","protocol":1}`; `GET|HEAD /v1/blob/:id` → `{version,data}` (404 none;
  HEAD gives `x-version`); `PUT /v1/blob/:id {data, ifVersion?}` → `{version}` or **409** `{version}` when
  `ifVersion` ≠ current (0 = "must not exist yet"). `cache-control: no-store`.
- `src/store.ts`: `Store {get, put}`; `memoryStore()` (tests, and the server's fallback when no database is
  connected: it then forgets on restart); `upstashStore(url, token, fetch)` over the **Upstash REST API**
  with plain `fetch`: `GET` for reads, one `EVAL` Lua script for the atomic compare-and-swap with
  `SET … EX KEEP_SECONDS` (keys `melodesk:sync:<id>`).
- `src/vercel.ts`: the classic Vercel function style `(req, res)`: builds a `Request` from Node's
  (`https://<host><url>`, body from Vercel's already-parsed `req.body`), runs `handle`, writes status,
  headers and body back (no body for HEAD); storage failure → 502 JSON. Environment:
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`_TOKEN`.
- `api/v1/health.ts`, `api/v1/blob/[id].ts` re-export the handler. **Relative imports need `.js`
  extensions** (Vercel runs native ESM). `vercel.json`: `installCommand`/`buildCommand` echo,
  `outputDirectory: "public"`; `public/index.html` is a one-paragraph page.

**Deployment as it was done** (record, not a secret): Vercel CLI `63.1.2` via `npx`; scope
`md-ismail-alam-khans-projects` (the account also has a team, so `--scope` is required); project
`melodesk-sync`, connected to the GitHub repo with **Root Directory `apps/sync-server`** and an
**Ignored Build Step** `git diff HEAD^ HEAD --quiet -- .` (so other commits skip it instead of failing);
storage: marketplace `upstash/upstash-kv` named `melodesk-sync-redis`, **plan `free`, `autoUpgrade=false`,
`prodPack=false`** (terms were accepted once in the browser); it sets the `KV_*`/`REDIS_URL` variables for
all environments, then redeploy. Domain `melodesk.ismailalam.com` added to the project; DNS is at
Cloudflare: `CNAME melodesk → 251c36432dbf64b3.vercel-dns-017.com`, **proxy off**. Limits checked at the
time: Upstash free 500 000 commands/month, 10 GB bandwidth; Vercel Hobby 1 000 000 invocations, 4 h Active
CPU, 300 s max duration. Deploy from the repo root (not from the folder, once the Root Directory is set).

## Acceptance

- `apps/sync-server/tests/handler.test.ts` (12): health with/without `/api`; none-then-saved; stale write
  409 and unchanged data; separate ids; bad requests (short id, unknown path, DELETE, non-JSON, wrong
  type, too big); the Redis store sends the right commands with the bearer token, reads answers, reports a
  refused write, fails loudly when storage is down; the Vercel adapter (parsed body, text body, 409,
  HEAD, 502).
- Live check after any deploy: `/api/v1/health` is 200; a PUT with `ifVersion:0` returns version 1, the
  same PUT again 409, a GET returns the data.

## Known limits

- The domain's DNS: a resolver that cached "does not exist" before the record was added (an ISP's, reached
  through Tailscale) keeps saying so until its negative cache expires (about 80 minutes here). New
  subdomains should be created before they are announced.
