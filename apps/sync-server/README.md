# Melodesk sync server

The small server behind Melodesk's optional **Melodesk sync server** option for syncing settings
between computers. It has no accounts and can read nothing: the app encrypts everything with a code only
the person's own computers know (it never leaves them), and the server stores the encrypted text under
an id that is a hash of that code.

- `GET /v1/health`
- `GET|HEAD|PUT /v1/blob/:id` (see `src/handler.ts`)

It is one function, `handle(request, store)`, so it runs anywhere that speaks `Request`/`Response`.
This folder is set up for **Vercel**.

## Deploy on Vercel (about five minutes)

1. vercel.com → **Add New… → Project** → import the Melodesk repository.
2. **Root Directory**: `apps/sync-server`. Framework preset: _Other_. No build command is needed.
3. Open the project's **Storage** tab → **Create** → _Upstash Redis_ (Marketplace; the free plan is
   plenty: a settings file is a few kilobytes). Connect it to the project. This sets
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`);
   the server reads either.
4. Deploy. Open `https://<your-project>.vercel.app/api/v1/health`: it should say
   `{"ok":true,"name":"melodesk-sync","protocol":1}`.
5. Tell Melodesk the address: either type `https://<your-project>.vercel.app` in Settings → Storage →
   _Melodesk sync server_, or make it the built-in default by saving it as the repository variable
   `MELODESK_SYNC_URL` (Settings → Secrets and variables → Actions → Variables) before a release.

Without storage connected the server still answers but forgets everything when it restarts, so connect it.

## Privacy

The server sees the encrypted text, its size, when it was written and the connecting address (Vercel
logs requests like any host). It never sees the sync code or anything readable. Blobs nobody writes to
for 400 days are dropped. See [docs/settings-sync.md](../../docs/settings-sync.md).
