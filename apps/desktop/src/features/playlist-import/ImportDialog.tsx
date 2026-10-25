import { Button, Dialog, inputClass } from '@melodesk/ui';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { Check, FileUp, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { Privacy } from '../../app/dialogs/playlists';
import { navigateTo } from '../../core';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';
import { createFromMatches, matchEntries, type Matched } from './run';
import { nameFromFile, parseImport, type ImportEntry } from './parse';

export const useImportDialog = create<{ open: boolean }>(() => ({ open: false }));
export const openImport = (): void => {
  useImportDialog.setState({ open: true });
};

type Step =
  | { name: 'pick' }
  | { name: 'matching'; entries: ImportEntry[]; done: number; title: string }
  | { name: 'review'; matches: Matched[]; title: string }
  | { name: 'creating'; title: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportHost() {
  const isOpen = useImportDialog((s) => s.open);
  return isOpen ? <ImportDialog /> : null;
}

function ImportDialog() {
  const t = useT();
  const ready = usePlayerStore((s) => s.ready);
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('PRIVATE');
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );
  const close = (): void => {
    useImportDialog.setState({ open: false });
  };

  const choose = async (): Promise<void> => {
    setError(null);
    const picked = await open({
      multiple: false,
      filters: [
        { name: t('import.fileType'), extensions: ['csv', 'tsv', 'm3u', 'm3u8', 'json', 'txt'] },
      ],
    });
    if (typeof picked !== 'string') return;
    try {
      const text = await readTextFile(picked);
      if (text.length > MAX_FILE_BYTES) throw new Error(t('import.tooBig'));
      const entries = parseImport(text, picked);
      if (entries.length === 0) {
        setError(t('import.nothing'));
        return;
      }
      const title = nameFromFile(picked);
      setName(title);
      setStep({ name: 'matching', entries, done: 0, title });
      const matches = await matchEntries(
        entries,
        (done) => {
          setStep((s) => (s.name === 'matching' ? { ...s, done } : s));
        },
        () => stopped.current,
      );
      if (!stopped.current) setStep({ name: 'review', matches, title });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ name: 'pick' });
    }
  };

  const create_ = async (matches: Matched[]): Promise<void> => {
    setStep({ name: 'creating', title: name });
    try {
      const id = await createFromMatches(name.trim() || 'Imported playlist', privacy, matches);
      close();
      navigateTo(`/playlist/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ name: 'review', matches, title: name });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t('import.title')}
      description={t('import.body')}
      className="max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] overflow-hidden"
      closeLabel={t('common.cancel')}
    >
      {step.name === 'pick' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">{t('import.formats')}</p>
          <Button variant="primary" disabled={!ready} onClick={() => void choose()}>
            <FileUp className="size-4" />
            {t('import.choose')}
          </Button>
          {!ready && <p className="text-xs text-fg-subtle">{t('import.notReady')}</p>}
        </div>
      )}
      {step.name === 'matching' && (
        <div className="flex flex-col gap-2" role="status">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            {t('import.matching', { done: step.done, total: step.entries.length })}
          </div>
          <progress
            className="h-2 w-full accent-accent"
            value={step.done}
            max={step.entries.length}
            aria-label={t('import.matching', { done: step.done, total: step.entries.length })}
          />
        </div>
      )}
      {step.name === 'review' && (
        <Review
          matches={step.matches}
          name={name}
          onName={setName}
          privacy={privacy}
          onPrivacy={setPrivacy}
          onCreate={() => void create_(step.matches)}
        />
      )}
      {step.name === 'creating' && (
        <div className="flex items-center gap-2 text-sm" role="status">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          {t('import.creating')}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {t('import.failed', { error })}
        </p>
      )}
    </Dialog>
  );
}

function Review({
  matches,
  name,
  onName,
  privacy,
  onPrivacy,
  onCreate,
}: {
  matches: Matched[];
  name: string;
  onName: (v: string) => void;
  privacy: Privacy;
  onPrivacy: (v: Privacy) => void;
  onCreate: () => void;
}) {
  const t = useT();
  const found = matches.filter((m) => m.videoId).length;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-sm" role="status">
        {t('import.found', { found, total: matches.length })}
      </p>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        {t('import.name')}
        <input
          className={inputClass}
          value={name}
          onChange={(e) => {
            onName(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        {t('import.privacy')}
        <select
          className={inputClass}
          value={privacy}
          onChange={(e) => {
            onPrivacy(e.target.value as Privacy);
          }}
        >
          <option value="PRIVATE">{t('import.privacy.private')}</option>
          <option value="UNLISTED">{t('import.privacy.unlisted')}</option>
          <option value="PUBLIC">{t('import.privacy.public')}</option>
        </select>
      </label>
      <ul className="max-h-56 overflow-y-auto rounded-xl bg-bg-overlay p-2 text-sm">
        {matches.map((m, i) => (
          <li key={`${String(i)}-${m.entry.title}`} className="flex items-start gap-2 px-1 py-1">
            {m.videoId ? (
              <Check
                className="mt-0.5 size-4 shrink-0 text-accent"
                aria-label={t('import.matched')}
              />
            ) : (
              <X
                className="mt-0.5 size-4 shrink-0 text-fg-subtle"
                aria-label={t('import.unmatched')}
              />
            )}
            <span className="min-w-0">
              <span className="block truncate">{m.entry.title}</span>
              <span className="block truncate text-xs text-fg-muted">
                {m.found
                  ? t('import.as', { title: m.found.title, artist: m.found.artist })
                  : t('import.noMatch')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="primary" disabled={found === 0 || !name.trim()} onClick={onCreate}>
          {t('import.create', { count: found })}
        </Button>
      </div>
    </div>
  );
}
