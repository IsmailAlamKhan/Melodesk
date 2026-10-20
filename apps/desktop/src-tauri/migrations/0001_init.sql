CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  artwork_url TEXT,
  duration_seconds INTEGER,
  played_at INTEGER NOT NULL,
  listened_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS history_played_at ON history (played_at);
CREATE INDEX IF NOT EXISTS history_video_id ON history (video_id);
