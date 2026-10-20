# Plugin developer guide (draft)

Plugins are Phase 3. The manifest contract in `packages/plugins/src/index.ts` is the only
stable piece today: a plugin declares an id, name, version, and the permissions it needs.
Runtime sandboxing, the typed SDK surface, and the settings UI are documented here as they land.
