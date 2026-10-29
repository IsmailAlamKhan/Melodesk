# 16 — Release pipeline

## Goal

Every push is checked on three operating systems; merging one pull request publishes signed installers
for macOS (universal) and Windows with an auto-update feed. Fully automatic after that merge.

## Needs

1.

## Constraints

- Conventional Commits drive versions. The repo is public. Commits carry no co-author trailer.
- Binary signing: updater signing key is required; Apple signing is optional (without it the app is
  ad-hoc signed, which Apple Silicon needs to run at all); Windows is unsigned (SmartScreen warns).

## Build

**CI** (`.github/workflows/ci.yml`, on every push, concurrency-cancelled per ref):

1. `web` "Typecheck, lint, unit tests" (pnpm install `--frozen-lockfile`, typecheck, lint, i18n check,
   unit tests, features-removable).
2. `e2e` "End-to-end tests (UI against a mocked Tauri backend)" (Playwright, traces on failure).
3. `rust` "Clippy, rustfmt, Rust tests (macos-14 / windows-2022 / ubuntu-24.04)" using the pinned
   toolchain; Linux installs the webview dependencies; runs `fmt:rust`, `clippy` (bare and with modules,
   `-D warnings`) and `test:rust`.

**Release** (`.github/workflows/release.yml`, on push to `main`): job `release-please` (config
`release-please-config.json`, type `node`, **extra-files** keep `apps/desktop/package.json`,
`src-tauri/tauri.conf.json` and `Cargo.toml` versions in step) opens/updates the release PR; when it is
merged a `build` matrix (macos-14 with `--target universal-apple-darwin`, windows-2022) runs
`tauri-apps/tauri-action` (installs toolchain 1.99.1 with both macOS targets) and attaches to the GitHub
release: `Melodesk_<v>_universal.dmg`, `Melodesk_universal.app.tar.gz(.sig)`, `Melodesk_<v>_x64-setup.exe(.sig)`,
`Melodesk_<v>_x64_en-US.msi(.sig)`, `latest.json`. A `tag` dispatch input rebuilds a tag.
Updater endpoint (`tauri.conf.json`):
`https://github.com/IsmailAlamKhan/Melodesk/releases/latest/download/latest.json`.

**Secrets** (repository settings): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
(required); optional `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. The signing settings are exported
only when the secrets exist (an empty identity makes the build fail); otherwise `APPLE_SIGNING_IDENTITY=-`.
**Variables**: `MELODESK_GITHUB_CLIENT_ID` (shows "Sign in with GitHub"), `MELODESK_SYNC_URL` (forks only).
Repo setting required once: Actions → "Allow GitHub Actions to create and approve pull requests" (the
agent cannot change this or set secrets; the owner runs `gh secret set` / the `gh api` call).

**Doing a release** (the loop used for every version): push to `main` → find the CI run **for that commit's
SHA** (the release PR's own run shows `action_required` and is not the one to watch) → wait for all five
jobs → `gh pr merge <release PR> --merge` → watch the Release run → check the asset list. Docs in
`docs/releasing.md`; first-launch instructions for unsigned apps are in the README (macOS: right-click →
Open, or Privacy & Security → Open Anyway; Windows: More info → Run anyway).

**Version history**: 0.2.0 first automated release; 0.3.0 local music; 0.4.0 sound and tag editor; 0.5.0
playlists/backup/smart/control API; 0.6.0 server/podcasts/radio; 0.7.0 MusicBrainz, AI playlists,
floating lyrics; 0.8.0 What's new; 0.9.0 settings sync (folders); 0.10.0 YouTube off-switch, Skip ad,
plugin sync; 0.11.0 cloud folders and GitHub sign-in; 0.12.0 (git address, later removed); 0.13.0 Melodesk
sync server; 0.13.1 built-in server address; 0.13.2 single address; 0.13.3 video and Skip ad fixes.

## Acceptance

- A merged release PR produces a published release with all seven assets and a `latest.json` the app's
  updater accepts; Settings → Updates → "Check for updates" finds it.
- CI is green on all five jobs for the merged commit.

## Known limits

- Windows and Linux were only ever built and unit-tested in CI, never used. Nothing is notarized unless the
  Apple secrets exist (they do not today).
