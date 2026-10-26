# Melodesk sync server

The small server behind Melodesk's optional **Melodesk sync server** option for syncing settings
between computers. It has no accounts and can read nothing: the app encrypts everything with a code only
the person's own computers know (it never leaves them), and the server stores the encrypted text under
an id that is a hash of that code.

- `GET /v1/health`
- `GET|HEAD|PUT /v1/blob/:id` (see `src/handler.ts`)

It is one function, `handle(request, store)`, so it runs anywhere that speaks `Request`/`Response`.
This folder is set up for **Vercel**.

## Deploy on Vercel

This is run once, by the project owner, for every Melodesk user: the app comes with its address
(`https://melodesk.ismailalam.com`, set in `src-tauri/src/server.rs`), so users deploy nothing and type
nothing. A fork can run its own and point builds at it with the `MELODESK_SYNC_URL` variable.

1. From this folder: `npx vercel@63.1.2 login`, then `npx vercel@63.1.2 deploy --prod` (or import the
   repository at vercel.com/new with **Root Directory** `apps/sync-server`, preset _Other_). No build
   or install is needed (`vercel.json` says so).
2. **Storage** tab of the project → _Create Database_ → _Upstash Redis_ (the free plan is plenty: a
   settings file is a few kilobytes) → connect it to the project. This sets `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`); the server reads either. Redeploy so they apply.
3. **Domains** tab → add `melodesk.ismailalam.com`, and at your DNS provider add the record Vercel shows
   (a `CNAME` for `melodesk` pointing to `cname.vercel-dns.com`).
4. Check `https://melodesk.ismailalam.com/api/v1/health`: it should say
   `{"ok":true,"name":"melodesk-sync","protocol":1}`. If Vercel asks to log in, turn off _Vercel
   Authentication_ for Production under Settings → Deployment Protection.

Without storage connected the server still answers but forgets everything when it restarts, so connect it.

## Privacy

The server sees the encrypted text, its size, when it was written and the connecting address (Vercel
logs requests like any host). It never sees the sync code or anything readable. Blobs nobody writes to
for 400 days are dropped. See [docs/settings-sync.md](../../docs/settings-sync.md).
