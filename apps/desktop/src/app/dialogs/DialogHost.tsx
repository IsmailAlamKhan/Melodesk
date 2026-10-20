import { Button, Dialog, inputClass, cn } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  editPlaylistDetails,
  fetchAddToPlaylistOptions,
  type Privacy,
} from './playlists';
import { useDialogs, type DialogRequest } from './store';

export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const close = useDialogs((s) => s.close);
  if (!current) return null;
  switch (current.type) {
    case 'createPlaylist':
      return <CreatePlaylistDialog req={current} onClose={close} />;
    case 'editPlaylist':
      return <EditPlaylistDialog req={current} onClose={close} />;
    case 'addToPlaylist':
      return <AddToPlaylistDialog req={current} onClose={close} />;
    case 'confirm':
      return <ConfirmDialog req={current} onClose={close} />;
  }
}

const privacyOptions: { value: Privacy; label: string; hint: string }[] = [
  { value: 'PRIVATE', label: 'Private', hint: 'Only you can see it' },
  { value: 'UNLISTED', label: 'Unlisted', hint: 'Anyone with the link' },
  { value: 'PUBLIC', label: 'Public', hint: 'Anyone can search for it' },
];

function PlaylistForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: { title: string; description: string; privacy: Privacy };
  submitLabel: string;
  onSubmit: (v: { title: string; description: string; privacy: Privacy }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [privacy, setPrivacy] = useState<Privacy>(initial.privacy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        setError(null);
        onSubmit({ title: title.trim(), description: description.trim(), privacy })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          autoFocus
          value={title}
          maxLength={150}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="My playlist"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          value={description}
          maxLength={5000}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(inputClass, 'h-auto py-2')}
          placeholder="Optional"
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Privacy</legend>
        {privacyOptions.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-bg-overlay"
          >
            <input
              type="radio"
              name="privacy"
              value={o.value}
              checked={privacy === o.value}
              onChange={() => setPrivacy(o.value)}
            />
            <span>{o.label}</span>
            <span className="text-xs text-fg-subtle">{o.hint}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CreatePlaylistDialog({
  req,
  onClose,
}: {
  req: Extract<DialogRequest, { type: 'createPlaylist' }>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New playlist"
      description={
        req.videoIds?.length
          ? `${String(req.videoIds.length)} song${req.videoIds.length === 1 ? '' : 's'} will be added.`
          : undefined
      }
    >
      <PlaylistForm
        initial={{ title: '', description: '', privacy: 'PRIVATE' }}
        submitLabel="Create"
        onSubmit={async (v) => {
          const id = await createPlaylist(v.title, v.description, v.privacy, req.videoIds ?? []);
          onClose();
          void navigate(`/playlist/${id}`);
        }}
      />
    </Dialog>
  );
}

function EditPlaylistDialog({
  req,
  onClose,
}: {
  req: Extract<DialogRequest, { type: 'editPlaylist' }>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Edit playlist">
      <PlaylistForm
        initial={{ title: req.title, description: req.description, privacy: req.privacy }}
        submitLabel="Save"
        onSubmit={async (v) => {
          await editPlaylistDetails(req.playlistId, {
            ...(v.title !== req.title ? { title: v.title } : {}),
            ...(v.description !== req.description ? { description: v.description } : {}),
            ...(v.privacy !== req.privacy ? { privacy: v.privacy } : {}),
          });
          onClose();
        }}
      />
    </Dialog>
  );
}

function AddToPlaylistDialog({
  req,
  onClose,
}: {
  req: Extract<DialogRequest, { type: 'addToPlaylist' }>;
  onClose: () => void;
}) {
  const options = useQuery({
    queryKey: ['addToPlaylist', req.videoIds],
    queryFn: () => fetchAddToPlaylistOptions(req.videoIds),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const open = useDialogs((s) => s.open);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save to playlist"
      description={req.label}
    >
      <div className="-mx-2 flex max-h-96 flex-col overflow-y-auto">
        <button
          type="button"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-bg-overlay"
          onClick={() => {
            open({ type: 'createPlaylist', videoIds: req.videoIds });
          }}
        >
          <span className="flex size-10 items-center justify-center rounded-md border border-dashed border-border">
            <Plus className="size-4" />
          </span>
          New playlist
        </button>
        {options.isPending && (
          <div className="px-3 py-2 text-sm text-fg-muted">Loading your playlists…</div>
        )}
        {options.isError && (
          <div className="px-3 py-2 text-sm text-danger">Couldn’t load playlists.</div>
        )}
        {options.data?.map((p) => (
          <button
            key={p.playlistId}
            type="button"
            disabled={busy !== null || p.contains === 'ALL'}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-bg-overlay disabled:opacity-60"
            onClick={() => {
              setBusy(p.playlistId);
              void addToPlaylist(p.playlistId, req.videoIds, p.title)
                .then(onClose)
                .finally(() => {
                  setBusy(null);
                });
            }}
          >
            {p.artworkUrl ? (
              <img src={p.artworkUrl} alt="" className="size-10 rounded-md object-cover" />
            ) : (
              <span className="size-10 rounded-md bg-bg-overlay" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.title}</span>
              <span className="block truncate text-xs text-fg-subtle">
                {[p.privacy ? p.privacy.toLowerCase() : null, p.description]
                  .filter(Boolean)
                  .join(' • ')}
              </span>
            </span>
            {p.contains === 'ALL' && <Check className="size-4 text-fg-subtle" />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function ConfirmDialog({
  req,
  onClose,
}: {
  req: Extract<DialogRequest, { type: 'confirm' }>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={req.title} description={req.body}>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          className={cn(req.danger && 'bg-danger text-white')}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void Promise.resolve(req.onConfirm())
              .then(onClose)
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {req.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export { deletePlaylist };
