# 09 — Sound for local audio

## Goal

Equalizer, even volume (ReplayGain), crossfade, gapless playback and visuals that follow the real sound,
for the music Melodesk plays itself (YouTube's audio cannot be processed on macOS/Linux webviews).

## Needs

8.

## Constraints

- Applies to local/remote sources only. Preferences are shared (`src/audio/store.ts`, kv `audio:prefs`).
- Never boost a song past clipping.

## Build

- Web Audio graph per deck (`features/local-music/dsp.ts`): `element → per-song level gain → fade gain →
bus → preamp → 10 EQ bands (peaking) → analyser → output`. `replayGainFactor(gainDb, peak, preampDb)`.
- Two `Audio` decks alternate. **Read-ahead**: the next song's bytes are loaded into the idle deck.
  **Gapless** (crossfade off): start the next about 30 ms before the end. **Crossfade**
  (`crossfadeSeconds`, `MAX_CROSSFADE_SECONDS`): fade the next in over the end of the current.
- `src/audio/presets.ts` (EQ presets), `audio/store.ts` (`eqEnabled`, `gainsDb[10]`, `normalize`,
  `crossfadeSeconds`…), `features/sound` (`EqualizerPanel`, Settings → Sound, Now Playing Equalizer tab).
- Visuals: `features/local-music/levels.ts` registers an analyser-backed **level source** on the core
  `levels` stack (`setLevelSource`), `core/spectrum.ts` (`levelsFromSpectrum`, `bandEdges`, beat state);
  the visualizer uses simulated levels when no real source is active (YouTube on macOS/Linux).
- The bridge's own `audio.ts` EQ for the web player exists in the `audio-engine` feature (not on macOS/Linux).

## Acceptance

- `audio.test.ts`, `dsp.test.ts`, `spectrum.test.ts`, `visualizer/simulated.test.ts`.
- e2e: EQ gains and "even out volume" persist and are applied; crossfade setting persists.

## Known limits

- Gapless/crossfade timing and EQ sound were never heard on real hardware here.
