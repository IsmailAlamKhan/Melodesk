-- The index of the user's own music files. Rebuilt from the folders by a rescan, so it can be
-- thrown away at any time; nothing here is the only copy of anything.
CREATE TABLE IF NOT EXISTS local_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  album_artist TEXT,
  track_no INTEGER,
  disc_no INTEGER,
  year INTEGER,
  genre TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  has_art INTEGER NOT NULL DEFAULT 0,
  lyrics TEXT,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_tracks_artist ON local_tracks (artist);
CREATE INDEX IF NOT EXISTS local_tracks_album ON local_tracks (album);
