# 14 — Settings sync

## Goal

Keep the user's configuration the same on all their computers with **nothing to install and no account of
ours**, in four ways, from simplest to most capable. A computer that is not syncing is unaffected.

## Needs

03, 10 (backup rules), 11 (`server:config`), 12 (plugin settings), 15 (the server).

## Constraints

- Opt-in; nothing is sent until the user starts it. Settings → Storage → "Sync settings between computers".
- **Secrets**: through a cloud folder, a GitHub gist or any folder the file is readable by whoever can open
  it, so passwords, keys, tokens, the music server and plugin sign-ins are **left out**. Only the
  end-to-end encrypted Melodesk sync carries them.
- Folder paths, caches, listening history and `sync:*` keys are never synced (history has Back up and
  restore, 10).
- A git-repository option (paste an SSH/HTTPS address) was built and **removed on request**; do not
  re-add it.

## Build

**What is synced** (`features/settings-sync/snapshot.ts`): keys matching `appearance:prefs`, `audio:prefs`,
`features:overrides`, `lyrics:prefs`, `lyrics:offset:*`, `local:smart`, `podcasts:feeds`,
`radio:stations`, `plugin:<id>:enabled`, `plugin:<id>:settings`; with `full` (encrypted) also
`server:config`. In non-full mode plugin settings pass through `withoutSecrets` (fields named like
`key|secret|token|password|passwd|credential` dropped); applying incoming plugin settings keeps this
computer's own secret fields (`keepingSecrets`).

**File** `{app:'melodesk', kind:'sync', format:1, device, exportedAt, entries:{[key]:{value, updatedAt}}}`;
`parseSyncFile` drops unsynced/malformed entries and refuses other kinds/formats. **Merge**
(`mergeEntries`): per key the newer `updatedAt` wins; equal values need nothing; a time tie goes by value
so both computers converge; keys only one side has are taken/offered. Deletions do not propagate.
**Engine** (`engine.ts`): `syncOnce(db, io, device, now, full)` reads the file, collects local rows
(`SELECT key,value,updated_at FROM settings`), merges, writes remote winners to SQLite **keeping their
timestamps** (so they are not sent round again), rewrites the file only if this side had something newer,
returns `{applied, wrote}`; a file that is not ours throws `not-melodesk-sync-file` and is left alone.

**Controller** (`controller.ts`, Zustand `useSync`): modes `off | folder | github | server`, persisted in
kv `sync:mode`, `sync:folder`, `sync:account`, `sync:server-url`, `sync:device` (random id), `sync:last`.
Syncs at start, 4 s after a synced key changes (`onKvChange`), on window focus, and when a 60 s stamp
check shows the other side changed. One round at a time; a write conflict re-reads and merges up to 3
times. Applying settings from another computer shows the **Reload banner** (the running app still holds
the old values).

**1. Cloud folder** (`src-tauri/src/cloud.rs`): `sync_cloud_options` detects iCloud Drive
(`~/Library/Mobile Documents/com~apple~CloudDocs`), OneDrive (env `OneDriveConsumer|OneDrive|
OneDriveCommercial`, `~/Library/CloudStorage/OneDrive*`, `~/OneDrive`), Dropbox
(`~/Library/CloudStorage/Dropbox*`, `~/Dropbox`), Google Drive (`CloudStorage/GoogleDrive*/My Drive`,
`~/Google Drive`, `~/My Drive`); `sync_use_cloud(id)` makes a `Melodesk` folder inside and uses it. One
button per detected service. The computer's own cloud client uploads; Melodesk handles no sign-in.
**Any other folder**: `sync_set_folder(path)` (picked with the dialog), for Syncthing/shares.
`src-tauri/src/sync.rs`: `sync_read/write/stamp` read/write only `melodesk-sync.json` in the chosen folder
(≤ 20 MB, written through a temp file + rename, folder must be writable).

**2. GitHub account** (`src-tauri/src/github.rs`): OAuth **device flow** with only the `gist` scope: the
UI shows the user code and opens `github.com/login/device`; polls `sync_github_poll` every `interval` s
(`slow_down` adds 5 s); on approval the token goes to the keychain (`vault.rs`, name
`github-settings-sync`) and the file lives in **one secret gist** (description fixed, file
`melodesk-sync.json`; found by listing up to 10 pages; recreated if deleted; `updated_at` hashed as the
stamp; `Truncated` content fetched from `raw_url`). A 401 forgets the token. **The button is hidden unless
the build has `MELODESK_GITHUB_CLIENT_ID`**, which needs a one-time OAuth app on GitHub with Device Flow
enabled (not registered yet, so it is hidden in shipped builds). Stop syncing signs out.

**3. Melodesk sync (encrypted, everything)**: nothing to set up. `controller.connectServer(url,
code?)`: `sync_server_check` (health must say `name: "melodesk-sync"`), then without a code a new **sync
code** is made (`generateCode`: 20 chars from `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`, shown as `XXXX-XXXX-…`
once, with Copy and "I have saved it"); with a typed code it must already have data on the server
(`no-such-code` otherwise). `crypto.ts`: PBKDF2-SHA-256, 200 000 iterations, salt `melodesk-sync-v1`,
512 bits → first 32 bytes are an HMAC key that signs `melodesk-id` (hex = the blob id the server sees),
last 32 bytes are the AES-GCM key; `seal` = JSON `{v:1, iv, ct}` (fresh 12-byte nonce); `open` returns
null on a wrong key/tamper. The code is kept in the keychain (`vault.rs`, name `sync-server-code`) and
never sent. `src-tauri/src/server.rs`: `sync_server_default` (`OFFICIAL_URL`
`https://melodesk.ismailalam.com`, overridable at build with `MELODESK_SYNC_URL` for forks),
`sync_server_check`, `sync_server_use(url, code?)`, `get/put(id, data, ifVersion)` (409 → `ok:false`),
`version` (HEAD), `forget`. Only https (http for localhost), no credentials in the URL, answers ≤ 2 MB.
`ifVersion` makes writes compare-and-swap. "Show my sync code" re-reads it from the keychain. "Use my
own server instead" shows an address box. Losing the code on every computer makes the data unreadable
(no reset, by design).

`vault.rs`: `load/save/clear(name)` in the macOS Keychain / Windows Credential Manager (`keyring`, service
`Melodesk`); elsewhere a `0600` file in the app data folder.

## Acceptance

- Unit (`settings-sync`): `snapshot.test.ts` (what is synced, merge cases, file parsing), `engine.test.ts`
  (two computers on real SQLite through a shared fake folder: first writes, second applies keeping times;
  newer wins per key; nothing new → no write; empty computer writes nothing; foreign file refused;
  plugin secrets never in the file and never overwritten; the encrypted kind carries sign-ins and the music
  server), `crypto.test.ts` (code format, same id for same code, wrong code opens nothing, tamper refused).
- Rust: `sync`, `cloud` (detection against fake home folders), `github` (parsing of device-flow answers,
  gist picking, bodies, only `gist` scope), `server` (address and code normalization, id format, answers).
- e2e `settings-sync.e2e.ts` (choose folder writes; newer remote settings applied + reload banner; foreign
  file left alone; cloud button; GitHub code flow and sign-out; Melodesk sync start, code shown, **nothing
  readable in what is sent**, join validation, own-server toggle).

## Known limits

- **Never run across two real computers, against real iCloud/OneDrive/Dropbox/Google Drive, or against
  GitHub.** The Melodesk server path was exercised against the real deployed server only by hand-made
  requests (15), not by the app.
- Clocks decide "newer"; deletions do not sync.
