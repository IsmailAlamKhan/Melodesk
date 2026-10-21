/**
 * Dev-only fixture capture. With `VITE_CAPTURE_FIXTURES=1` (and `MELODESK_FIXTURE_DIR` set for
 * the Rust side, which writes the files), the app requests a standard set of InnerTube pages
 * once the bridge is ready so contributors can refresh adapter fixtures in one run.
 * Signed-in captures contain personal data: scrub them before committing.
 */
import { innertube } from '../player/data';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';

const CAPTURE_SET: [string, Record<string, unknown>][] = [
  ['browse', { browseId: 'FEmusic_home' }],
  ['browse', { browseId: 'FEmusic_explore' }],
  ['browse', { browseId: 'FEmusic_new_releases' }],
  ['browse', { browseId: 'FEmusic_charts' }],
  ['browse', { browseId: 'FEmusic_moods_and_genres' }],
  ['search', { query: 'daft punk' }],
  ['music/get_search_suggestions', { input: 'daft p' }],
  ['browse', { browseId: 'UC_kRDKYrUlrbtrSiyu5Tflg' }], // artist (Daft Punk)
  ['browse', { browseId: 'MPREb_oF5n1ZVsd4u' }], // album (Daft Punk — Random Access Memories)
  ['browse', { browseId: 'VLRDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs' }], // playlist
  ['next', { videoId: 'dQw4w9WgXcQ' }],
  ['account/account_menu', {}],
  // Signed-in only (empty/redirect responses when logged out)
  ['browse', { browseId: 'FEmusic_library_landing' }],
  ['browse', { browseId: 'FEmusic_liked_playlists' }],
  ['browse', { browseId: 'FEmusic_liked_videos' }],
  ['browse', { browseId: 'FEmusic_liked_albums' }],
  ['browse', { browseId: 'FEmusic_library_corpus_track_artists' }],
  ['browse', { browseId: 'FEmusic_library_corpus_artists' }],
  ['browse', { browseId: 'FEmusic_library_non_music_audio_list' }],
  ['browse', { browseId: 'FEmusic_library_privately_owned_tracks' }],
  ['browse', { browseId: 'FEmusic_history' }],
  ['browse', { browseId: 'VLLM' }],
  ['account/accounts_list', { requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER' }],
  ['browse', { browseId: 'VLPLOYAXcXseMvMk9n2R72mp69whLmWaYcwB' }], // one of the account's own (editable) playlists
  ['playlist/get_add_to_playlist', { videoIds: ['khnokW3Mw24'], excludeWatchLater: true }],
  ['browse', { browseId: 'MPLYt_6AEOVn4k62q' }], // lyrics for dQw4w9WgXcQ
  ['next', { videoId: 'khnokW3Mw24', enablePersistentPlaylistPanel: true, isAudioOnly: true }],
];

export function startFixtureCapture(): void {
  let done = false;
  usePlayerStore.subscribe((s) => {
    if (done || !s.ready) return;
    done = true;
    void (async () => {
      for (const [endpoint, body] of CAPTURE_SET) {
        try {
          const res = await innertube(endpoint, body);
          console.warn(
            '[capture] ok',
            endpoint,
            JSON.stringify(body),
            JSON.stringify(res).length,
            'chars',
          );
        } catch (err) {
          console.warn('[capture] failed', endpoint, JSON.stringify(body), String(err));
        }
      }
      // Lyrics for the last  above: follow its Lyrics tab browse id.
      try {
        const nextRes = (await innertube('next', {
          videoId: 'khnokW3Mw24',
          enablePersistentPlaylistPanel: true,
          isAudioOnly: true,
        })) as {
          contents?: {
            singleColumnMusicWatchNextResultsRenderer?: {
              tabbedRenderer?: {
                watchNextTabbedResultsRenderer?: {
                  tabs?: {
                    tabRenderer?: {
                      title?: string;
                      endpoint?: { browseEndpoint?: { browseId?: string } };
                    };
                  }[];
                };
              };
            };
          };
        };
        const tabs =
          nextRes.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
            ?.watchNextTabbedResultsRenderer?.tabs ?? [];
        const lyricsId = tabs.find((t) => t.tabRenderer?.title === 'Lyrics')?.tabRenderer?.endpoint
          ?.browseEndpoint?.browseId;
        if (lyricsId) {
          const res = await innertube('browse', { browseId: lyricsId });
          console.warn(
            '[capture] ok browse(lyrics)',
            lyricsId,
            JSON.stringify(res).length,
            'chars',
          );
        }
      } catch (err) {
        console.warn('[capture] lyrics failed', String(err));
      }
      if (import.meta.env.VITE_CAPTURE_PLAYBACK === '1') {
        // End-to-end playback self-test: hand a watch endpoint to the page, then add to queue.
        console.warn('[capture] playback test: watch endpoint');
        await sendCommand({
          type: 'endpoint',
          endpoint: { watchEndpoint: { videoId: 'dQw4w9WgXcQ' } },
          mode: 'navigate',
        });
        await new Promise((r) => setTimeout(r, 6000));
        console.warn('[capture] playback test: queueAdd (play next)');
        await sendCommand({
          type: 'queueAdd',
          target: { videoId: 'khnokW3Mw24' },
          position: 'next',
        });
        await new Promise((r) => setTimeout(r, 2000));
        await sendCommand({ type: 'setShuffle', enabled: true });
        await sendCommand({ type: 'setRepeat', mode: 'one' });
        await new Promise((r) => setTimeout(r, 1000));
        await sendCommand({ type: 'pause' });
        console.warn('[capture] playback test done');
      }
    })();
  });
}

/**
 * Dev-only audio check (`VITE_AUDIO_SELFTEST=1`): plays one song quietly, switches the equalizer and
 * leveling on and off, and restores the previous volume. Results appear in the bridge log
 * ("audio: ..." lines) on the Rust side's stderr.
 */
export async function startAudioSelfTest(): Promise<void> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (!usePlayerStore.getState().ready) await wait(500);
  await wait(3000);
  const previous = usePlayerStore.getState().state?.volume ?? 1;
  const flat = new Array<number>(10).fill(0);
  const say = (m: string) => console.warn('[audio-selftest]', m);
  await sendCommand({ type: 'setVolume', volume: 0.12 });
  await sendCommand({
    type: 'endpoint',
    endpoint: { watchEndpoint: { videoId: 'dQw4w9WgXcQ' } },
    mode: 'navigate',
  });
  await wait(8000);
  say(`baseline playing=${String(usePlayerStore.getState().state?.playing)}`);
  say('eq on (bass +8)');
  await sendCommand({
    type: 'setAudio',
    config: {
      eq: { enabled: true, preampDb: 0, gainsDb: [8, 8, 6, 3, 0, 0, 0, 0, 0, 0] },
      normalize: false,
    },
  });
  await wait(8000);
  say(
    `status=${JSON.stringify(usePlayerStore.getState().audio)} playing=${String(usePlayerStore.getState().state?.playing)}`,
  );
  say('leveling on, eq flat');
  await sendCommand({
    type: 'setAudio',
    config: { eq: { enabled: false, preampDb: 0, gainsDb: flat }, normalize: true },
  });
  await wait(8000);
  say(`status=${JSON.stringify(usePlayerStore.getState().audio)}`);
  say('volume 0.06, check level follows the element volume');
  await sendCommand({ type: 'setVolume', volume: 0.06 });
  await wait(4000);
  say('all off');
  await sendCommand({
    type: 'setAudio',
    config: { eq: { enabled: false, preampDb: 0, gainsDb: flat }, normalize: false },
  });
  await wait(3000);
  await sendCommand({ type: 'pause' });
  await sendCommand({ type: 'setVolume', volume: previous });
  say(`done; volume restored to ${previous.toFixed(2)}`);
}
