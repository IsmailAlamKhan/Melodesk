# Settings sync

Melodesk can keep your settings the same on several computers. It has no server and no account: you
pick a folder that something else already keeps in step (iCloud Drive, Dropbox, OneDrive, Google
Drive for desktop, Syncthing, a network share) and Melodesk reads and writes one small file in it,
`melodesk-sync.json`.

Settings → Storage → **Sync settings between computers** → **Choose a folder**. Do the same on each
computer, with the same synced folder.

## What is synced

Appearance (including custom themes), sound, which features are on, lyrics settings and per-song
lyrics timing, smart playlists, podcast subscriptions and radio stations.

Not synced, on purpose: folders (paths differ between computers), music servers, passwords, keys and
tokens, plugin settings, caches and listening history. Use **Back up and restore** (same page) to move
those by hand; it never includes passwords either.

## How two copies are merged

Each synced setting is stored with the time it last changed. When a computer syncs it reads the
file, and for each setting the newer change wins; anything newer on this computer is written back.
So changes made on two computers at different times both survive, and no computer is "the main one".
It syncs when the app starts, a few seconds after a change, when you come back to the window, and when
the file in the folder changes (checked every minute).

Things to know:

- The times come from each computer's clock, so keep clocks right.
- A setting that was deleted on one computer is not deleted on the others.
- Settings from another computer are applied in the database right away, but the running app has the
  old ones in memory: it offers **Reload now**. Until then nothing changes on screen.
- If the folder is unavailable (a drive that is unplugged), sync reports it and tries again later.
  If the sync file is not ours it is left alone.

## How it works

`src-tauri/src/sync.rs` can only read and write that one file in the chosen folder (written through
a temporary file and a rename, so another computer never reads half of it). The merge itself
(`features/settings-sync/snapshot.ts`, `engine.ts`) is plain TypeScript with unit tests that run two
computers against real SQLite.
