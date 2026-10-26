# Settings sync

Melodesk can keep your settings the same on several computers. It has no server and no account of its
own, and you install nothing: Settings → Storage → **Sync settings between computers** offers what this
computer already has, one click each.

- **iCloud Drive** (comes with macOS), **OneDrive** (comes with Windows), **Dropbox**, **Google Drive**:
  if the folder is on this computer, Melodesk makes a `Melodesk` folder in it and keeps one small file,
  `melodesk-sync.json`, there. The computer's own cloud client does the uploading, so Melodesk handles no
  sign-in. Use the same service on each computer.
- **GitHub account**: _Sign in with GitHub_ shows a short code, opens github.com/login/device, and you
  type the code and approve (the way a TV app signs in). Melodesk asks only for the `gist` permission and
  keeps the file in one **secret gist** on your account (a secret gist is not listed, but anyone with
  its address can read it; the file holds preferences, never passwords or tokens). The token is kept in
  the macOS Keychain or Windows Credential Manager, and on Linux in a file only you can read. Sign out
  (Stop syncing) forgets it; you can also revoke it at github.com/settings/applications. This works
  between any computers, whatever they run.
- **The Melodesk sync server** (the only one that syncs **everything**, plugin sign-ins and your music
  server included): a small server you run yourself (`apps/sync-server`, ready for Vercel; see its
  README, five minutes). The first computer picks _Start syncing_ and gets a **sync code** to write
  down; the others pick _I already have a sync code_ and type it. Everything is **encrypted on the
  computer** with a key made from the code before it is sent (AES-GCM, key from PBKDF2), and kept
  under an id that is a hash of the code, so the server and whoever runs it hold unreadable text and
  cannot tell whose it is. The code is kept in the keychain and never leaves the computers; lose it on
  every computer and the data cannot be read again (there is no reset). Two computers writing at the
  same moment cannot overwrite each other: the server refuses a stale write and the app merges again.
- **Any other folder**, including a clone of a private git repository (see below), for Syncthing, a
  network share and so on.

Do the same on each computer, with the same service.

### Setting up GitHub sign-in (for whoever builds Melodesk)

GitHub sign-in needs an OAuth app that is registered once. Its _client id_ is public (there is no secret
to keep), and is built into the app:

1. github.com → Settings → Developer settings → OAuth Apps → New OAuth App. Name `Melodesk`, any
   homepage, callback URL `http://localhost` (not used).
2. Tick **Enable Device Flow**, then register.
3. Copy the **Client ID** and save it as a repository variable named `MELODESK_GITHUB_CLIENT_ID`
   (Settings → Secrets and variables → Actions → Variables). Releases built after that offer the button;
   a local build can set the same variable in the environment. Without it the button is not shown.

## What is synced

Appearance (including custom themes), sound, which features are on, lyrics settings and per-song
lyrics timing, smart playlists, podcast subscriptions and radio stations, and which plugins are on
with their settings.

Not synced, on purpose: folders (paths differ between computers), caches and listening history. With
cloud folders and GitHub, the file can be read by whoever can open that folder or gist, so passwords,
keys and tokens are left out: a plugin's sign-in (a Last.fm session…) and your music server stay on
the computer that made them, and each computer signs in once. With the Melodesk sync server the file
is encrypted, so those sync too. Use **Back up and restore** (same page) to move
those by hand; it never includes passwords either.

## Using GitHub

Make a **private** repository on GitHub, clone it on each computer (any folder), and choose that
folder. When the folder is a git repository Melodesk runs the `git` that is already on the computer:
it pulls before it reads, and commits and pushes after it writes. It uses whatever sign-in git
already has (an SSH key, a credential helper) and never sees or asks for a GitHub password or token;
git cannot prompt there, so a repository that needs a prompt shows an error instead. Only
`melodesk-sync.json` is committed. Needs `git` installed and a remote called `origin`.

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
