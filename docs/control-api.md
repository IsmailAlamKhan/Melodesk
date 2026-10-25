# Control API

Other programs on your computer (a Stream Deck, Home Assistant, Raycast, a script) can ask Melodesk
what is playing and send it simple commands. **It is off until you switch it on** in Settings →
General → "Control from other programs".

## Safety

- It listens on `127.0.0.1` only: nothing on your network can reach it.
- Every request needs the secret token in an `Authorization: Bearer …` header. Settings shows it (and can
  make a new one); treat it like a password.
- Web pages are refused (a request with an `Origin` header gets 403), and so is any request whose `Host`
  is not `127.0.0.1:<port>` or `localhost:<port>` (this stops DNS-rebinding tricks).
- It can only play, pause, skip and change the volume, and report the title and artist. It cannot read
  your account, your library or any file.

## Endpoints

All under `http://127.0.0.1:<port>/v1` (the default port is 7733). Answers are JSON.

| Method and path  | What it does                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| `GET /now`       | `{source, title, artist, playing, videoId}`; `source` is `youtube` or `local` |
| `POST /play`     | play                                                                          |
| `POST /pause`    | pause                                                                         |
| `POST /toggle`   | play or pause                                                                 |
| `POST /next`     | next song                                                                     |
| `POST /previous` | previous song                                                                 |
| `POST /mute`     | mute or unmute                                                                |
| `POST /volume`   | body `{"volume": 0.5}`, a number from 0 to 1                                  |

Commands go to whichever source is playing (YouTube Music or a local song), exactly as the tray menu
and media keys do. Errors: `401` wrong or missing token, `403` a browser or another host, `400` a bad
body, `404`/`405` no such endpoint or wrong method.

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7733/v1/now
curl -H "Authorization: Bearer $TOKEN" -X POST http://127.0.0.1:7733/v1/next
curl -H "Authorization: Bearer $TOKEN" -X POST -d '{"volume":0.4}' http://127.0.0.1:7733/v1/volume
```

## How it works

`src-tauri/src/control.rs` is a small HTTP server on `std::net`, with no extra dependency. The request
handling (`route`) is a pure function and is tested without a network; the server loop only reads a
request, calls it, writes the answer and runs the command through the same path as the tray
(`player::dispatch`). The UI side (`features/control-api`) keeps the on/off switch, port and token in the
local database and starts the server when the app starts.
