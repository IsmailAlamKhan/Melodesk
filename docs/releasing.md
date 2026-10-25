# Releasing

1. Commits on `main` follow Conventional Commits. release-please keeps a release PR open with
   the changelog and version bumps.
2. Merging the release PR creates the tag and GitHub release; `release.yml` then builds and
   uploads:
   - macOS: universal `.dmg` (notarized when the Apple secrets are set)
   - Windows: `.msi` and NSIS `.exe` (unsigned for now, so SmartScreen warns on first run)
   - `latest.json` for the in-app updater

   Linux is not built by CI. To add it, put `ubuntu-24.04` in the build matrix of `release.yml`
   (it also needs the webview packages installed, as in `ci.yml`).

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
