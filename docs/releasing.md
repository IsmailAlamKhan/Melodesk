# Releasing

1. Commits on `main` follow Conventional Commits. release-please keeps a release PR open with
   the changelog and version bumps.
2. Merging the release PR creates the tag and GitHub release; `release.yml` then builds and
   uploads, on a macOS runner only:
   - macOS: universal `.dmg` (notarized when the Apple secrets are set)
   - `latest.json` for the in-app updater

   Windows and Linux are not built by CI. To add them, put `windows-2022` / `ubuntu-24.04` back
   in the build matrix of `release.yml` (Linux also needs the webview packages from `ci.yml`).

3. The updater verifies every package against the public key in `tauri.conf.json`
   (`plugins.updater.pubkey`). The matching private key lives only in the
   `TAURI_SIGNING_PRIVATE_KEY` repository secret; never commit it.

## Secrets

| Secret                                                                                                                                                        | Needed for                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`                                                                                                                                   | updater artifacts (required) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`                                                                                                                          | if the key has a password    |
| `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | macOS signing + notarization |

The updater endpoint in `tauri.conf.json` points at this repository's "latest" release;
change the owner/name if the project moves.
