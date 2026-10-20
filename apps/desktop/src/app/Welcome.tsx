import { Button } from '@melodesk/ui';
import { ExternalLink, Link } from 'lucide-react';
import { useState } from 'react';
import { sendCommand, setPlayerVisible } from '../player/ipc';
import { toPlayerPath } from '../player/links';
import { usePlayerStore } from '../player/store';

/** Shown on Home while signed out: Melodesk shows only your own account's data once you sign in. */
export function Welcome() {
  const ready = usePlayerStore((s) => s.ready);
  const bridgeVersion = usePlayerStore((s) => s.bridgeVersion);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const openLink = (): void => {
    const path = toPlayerPath(link);
    if (!path) {
      setLinkError('Paste a music.youtube.com or youtube.com link.');
      return;
    }
    setLinkError(null);
    setLink('');
    void sendCommand({ type: 'navigate', path });
  };
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome to Melodesk</h1>
        <p className="mt-2 text-fg-muted">
          Melodesk shows your own YouTube Music: your home feed, mixes, library and history, exactly
          as on the website. Sign in with Google in the player window; nothing about your account
          passes through Melodesk.
        </p>
      </header>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!ready} onClick={() => void setPlayerVisible(true)}>
          <ExternalLink className="size-4" />
          Open player to sign in
        </Button>
        <span className="text-xs text-fg-subtle">
          {ready ? `Bridge connected (v${bridgeVersion ?? '?'})` : 'Connecting to the player…'}
        </span>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          openLink();
        }}
      >
        <label htmlFor="open-link" className="text-sm text-fg-muted">
          Or open a YouTube Music link
        </label>
        <div className="flex gap-2">
          <input
            id="open-link"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
            }}
            placeholder="https://music.youtube.com/watch?v=…"
            aria-invalid={linkError !== null}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <Button type="submit" disabled={!ready}>
            <Link className="size-4" />
            Open
          </Button>
        </div>
        {linkError && (
          <p role="alert" className="text-xs text-danger">
            {linkError}
          </p>
        )}
      </form>
      <p className="text-xs text-fg-subtle">
        Not affiliated with Google or YouTube. YouTube Music is a trademark of Google LLC.
      </p>
    </section>
  );
}
