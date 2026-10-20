# Translating Melodesk

English is the source of truth. Every other language is an optional JSON file that can be
partial: anything you do not translate falls back to English, so a half-finished translation
is still useful and safe to merge.

## Add a language

```bash
pnpm i18n:new fr          # creates apps/desktop/src/i18n/locales/fr.json (a copy of en.json)
```

Use a [BCP 47](https://www.rfc-editor.org/info/bcp47) code (`fr`, `pt-BR`, `zh-CN`). Translate the
values, keep the keys. Delete entries you do not want to translate yet. The language then
appears in Settings → Appearance → Language, named in its own language, and "System default"
picks it automatically when the computer's language matches.

Then run the checker:

```bash
pnpm i18n:check
```

It fails on mistakes that would break the UI and only reports the rest:

| Reported as | What                                                                  |
| ----------- | --------------------------------------------------------------------- |
| error       | invalid JSON, empty or non-string value                               |
| error       | a key that is not in `en.json` (typo, or the string was removed)      |
| error       | `{placeholders}` that differ from English                             |
| note        | missing keys (they fall back to English) and entries still in English |

## Writing messages

- **Placeholders** look like `{name}` and are replaced at runtime. Keep them exactly as in
  English; you may move them within the sentence.
- **Plurals** use one entry per plural category, chosen with the browser's CLDR rules for your
  language: `stats.plays_one`, `stats.plays_other`, and for languages that need them
  `_zero`, `_two`, `_few`, `_many`. English only has `_one` and `_other`; add the extra
  categories your language uses and the checker accepts them.
- **Context**: keys are grouped by where they appear (`player.*` in the bottom bar, `settings.*`
  in Settings, `toast.*` for short notifications). Search the source for the key to see the UI.
- **Length**: translations are often longer than English. Test with the pseudo-locales (below).
- Do not translate product names (Melodesk, YouTube Music) or the legal disclaimer wording
  beyond what is needed for it to read correctly.

## Not translated

- Text that comes from YouTube Music itself (shelf titles, playlist names, menu items from the
  site) is shown as YouTube sends it.
- Status messages that plugins produce at runtime (for example "Scrobbled …") are English for
  now. Plugin names, descriptions and setting labels are translatable (`plugin.<id>.*`).
- The standard macOS menus provided by the OS toolkit (Hide, Quit …) follow the toolkit.
  Melodesk's own tray and Playback menu are translated.

## Testing layout and missing strings

In a development build (`pnpm dev`) two pseudo-locales appear in the language list:

- **Pseudo (accented, longer text)**: every translated string becomes `[Ƥĺàý ~~~]`, about 35%
  longer. Any English text that is _not_ bracketed has not been moved into the locale file.
- **Pseudo (right-to-left)**: switches the interface to right-to-left with mirrored text, to
  check layout in languages such as Arabic or Hebrew.

You can also force text direction independently in Settings → Appearance. Seek bars and
transport controls stay left-to-right in every language, as in other media apps.

For a quick preview without changing saved settings, start the dev server with
`VITE_DEV_APPEARANCE='{"language":"en-XA"}'`.

## For developers

```tsx
const t = useT(); // in components; re-renders on language change
t('player.play'); // typed: unknown keys fail to compile
t('stats.plays', { count: 3 }); // plural group addressed by its base name
t('welcome.bridgeConnected', { version });
```

Outside React (toasts, native labels) import `t` from `i18n`. Add the English text to
`locales/en.json` first; the key type is derived from that file.
