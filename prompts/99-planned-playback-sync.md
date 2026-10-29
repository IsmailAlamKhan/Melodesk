# 99 — Planned: playback sync across devices (NOT BUILT)

## Goal

Three things, in this order of build: (1) **see** the user's other computers and what they play and
continue there ("Play here"); (2) **control** another computer from this one; (3) **listen together**: several
computers play the same thing in time, one leading. Also the choice to play individually or all at once.

## Needs

04 (backends), 14 (sync code and the Melodesk server), 08/11 (sources), 07 (ads).

## Constraints

- Opt-in, off by default, and **requires Melodesk sync (encrypted)** so the server sees only unreadable
  text. No telemetry. Each computer plays through its own official player and account; only **references**
  (YouTube video id, server track key, radio URL, title/artist/duration) travel, never audio or YouTube
  page data, and never a YouTube `endpoint` object (the receiver builds its own from the id).
- Remote messages are a fixed list (`play`, `pause`, `next`, `previous`, `seek`, `playRef`, `setQueue`,
  `setShuffle`, `setRepeat`, `leave`) validated by schema; nothing else is executed.
- Stay inside the free tiers (Upstash 500 000 commands/month, Vercel Hobby 1 000 000 invocations): one
  Redis command per poll; poll adaptively.

## Build

1. **Server** (`apps/sync-server`): an append-log API per channel id (hash of the sync code + a label):
   `POST /v1/log/:id {data}` → `{seq}` (one `EVAL`: `RPUSH` + `LTRIM` to 50 + `EXPIRE` 1 h) and
   `GET /v1/log/:id?after=<seq>` → `{messages:[{seq,data}]}`; plus `GET /v1/time` → `{now}` for clock offset.
   Cap message size (4 KB). Keep the transport behind an interface so a WebSocket service (Cloudflare
   Durable Objects) can replace polling later.
2. **Protocol** (`features/playback-sync/protocol.ts`, Zod): envelope `{v, from, to|'*', seq, sentAt,
kind, body}` sealed with the existing `seal/open` (AES-GCM) under keys derived with a second label
   from the sync code. `kind`: `presence` (device name, platform, idle/playing, current ref, position at
   `sampledAt`, queue refs ≤ 20, source id), `command`, `join`/`leave`. Replay protection: per-sender
   monotonic `seq`, reject old or beyond ±2 min of the shared clock.
3. **Device identity**: the existing `sync:device` id plus an editable name (default from the OS).
4. **Presence**: write on change and every 10 s while playing, 60 s while idle and the app is open; read
   the channel every 30 s idle, **3 s while playing or controlling**, 1.5 s during "together".
5. **Remote backend** `remote:<deviceId>` registered with `registerBackend`: `handles` the transport
   commands, `send` posts a `command` envelope; its state comes from the target's `presence` and is written
   into `usePlayerStore` with `source: 'remote:<id>'`, so the player bar, queue and shortcuts control the
   other computer unchanged. `starts` is false; "Play here" hands off instead.
6. **Handoff** ("Play here"): translate the ref locally (YouTube: `endpoint {watchEndpoint:{videoId}}` +
   seek to `position + (now − sampledAt)`; server/radio/podcast: the same `RemoteSong`; local file: match
   by title+artist+album+duration in this library, else "not on this computer"), start it, then send
   `pause`/`leave` to the other computer. Default policy (decision pending): starting playback on a second
   computer pauses the first.
7. **Together**: the leader publishes state on change plus a 10 s heartbeat. A follower computes the
   leader position as `pos + (serverNow − sampledAt)` using a clock offset measured against `/v1/time`
   (midpoint of the round trip, median of 5). Drift correction: YouTube → seek when |drift| > 1.5 s;
   local engine → playback-rate nudge ±2 % for drift ≤ 1 s, seek beyond. A follower in an ad waits until
   it ends, then rejoins; per-device volume stays local. Target accuracy ~0.5 s (different rooms); same-room
   tightness is **not** promised with YouTube.
8. **UI**: a Devices button in the player bar (popover: devices, state, actions Play here / Control /
   Listen together / Leave), a "Continue on this computer" Home card, Settings section (on/off, device
   name, a usage meter for commands used this month), What's new entry.
9. **Docs/privacy**: what is sent (encrypted presence: track, position, device name), when, and that the
   server sees only size and timing.

## Acceptance

- Unit: protocol parsing and replay rejection; clock offset (median, bad samples); position extrapolation;
  drift decisions (seek vs nudge vs wait); ref translation per source; routing of the remote backend.
- Integration with **two simulated devices** sharing an in-process fake server (two Playwright pages with
  a shared node-side store): presence appears, Play here moves the track and pauses the other, remote
  commands arrive, together follows a seek, an ad on the follower pauses and rejoins.
- Server tests for the log API (append, read after, cap, expiry).
- Cost test: a simulated hour of playing on two devices stays under the budgeted commands (≈ 1 560/h per
  playing device).

## Known limits

- Real audio timing, YouTube seek/buffer behaviour, ads, Bluetooth latency and real networks cannot be
  verified here; the first real test is on two of the owner's computers.
- Decisions still open: build order (1–3 before together), accuracy target, default when a second device
  starts playing.
