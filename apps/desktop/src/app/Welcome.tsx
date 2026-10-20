import { Button } from '@melodesk/ui';
import { ExternalLink, Link } from 'lucide-react';
import { useState } from 'react';
import { sendCommand, setPlayerVisible } from '../player/ipc';
import { toPlayerPath } from '../player/links';
import { usePlayerStore } from '../player/store';

export function Welcome() {
  const ready = usePlayerStore((s) => s.ready);
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const playerVisible = usePlayerStore((s) => s.playerVisible);
  const bridgeVersion = usePlayerStore((s) => s.bridgeVersion);
  const playerPath = usePlayerStore((s) => s.playerPath);
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
        <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome</h1>
        <p className="mt-2 text-fg-muted">
          Melodesk drives the official YouTube Music web player, which runs in its own window. Sign
          in there with Google; nothing about your account ever passes through Melodesk.
        </p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
        <dt className="text-fg-subtle">Bridge</dt>
        <dd>{ready ? `connected (v${bridgeVersion ?? '?'})` : 'waiting for player…'}</dd>
        <dt className="text-fg-subtle">Account</dt>
        <dd>{!ready ? '—' : loggedIn ? 'signed in' : 'signed out'}</dd>
        <dt className="text-fg-subtle">Player page</dt>
        <dd className="truncate">{playerPath}</dd>
      </dl>

      <div className="flex gap-3">
        <Button variant="primary" onClick={() => void setPlayerVisible(!playerVisible)}>
          <ExternalLink className="size-4" />
          {playerVisible
            ? 'Hide player window'
            : loggedIn
              ? 'Show player window'
              : 'Open player to sign in'}
        </Button>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          openLink();
        }}
      >
        <label htmlFor="open-link" className="text-sm text-fg-muted">
          Open a YouTube Music link
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
