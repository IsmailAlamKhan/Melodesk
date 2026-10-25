-- Loudness data from the files' ReplayGain tags, to even out the volume between songs.
ALTER TABLE local_tracks ADD COLUMN rg_gain REAL;
ALTER TABLE local_tracks ADD COLUMN rg_peak REAL;
-- Songs already indexed have not been read for it: make the next scan read them again.
UPDATE local_tracks SET mtime = 0;
