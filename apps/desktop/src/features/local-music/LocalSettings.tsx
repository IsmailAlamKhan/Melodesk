import { Button } from '@melodesk/ui';
import { FolderPlus, Loader2, RefreshCw, X } from 'lucide-react';
import { useT } from '../../i18n/index';
import { canPlayFile } from './engine';
import { useFolders, useTrackCount } from './hooks';
import { addFolder, removeFolder, rescan, useScanStatus } from './scan';

/** File types the scan finds that this system's webview cannot play. */
const FORMATS = ['mp3', 'm4a', 'aac', 'flac', 'wav', 'aiff', 'ogg', 'opus'];
const cannotPlay = (): string[] => FORMATS.filter((f) => !canPlayFile(`x.${f}`));

export function LocalMusicSection() {
  const t = useT();
  const folders = useFolders();
  const count = useTrackCount();
  const scan = useScanStatus();
  const unsupported = cannotPlay();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="local-music-title">
      <h2 id="local-music-title" className="font-semibold">
        {t('local.settings.title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('local.settings.body')}</p>
      <div className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        {(folders.data ?? []).length === 0 && (
          <p className="text-sm text-fg-muted">{t('local.settings.none')}</p>
        )}
        <ul className="flex flex-col gap-1">
          {(folders.data ?? []).map((folder) => (
            <li key={folder} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={folder}>
                {folder}
              </span>
              <button
                type="button"
                aria-label={t('local.settings.remove', { folder })}
                onClick={() => void removeFolder(folder)}
                className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-bg-overlay hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="ghost" onClick={() => void addFolder()}>
            <FolderPlus className="size-4" />
            {t('local.addFolder')}
          </Button>
          <Button
            variant="ghost"
            disabled={scan.running || (folders.data ?? []).length === 0}
            onClick={() => void rescan()}
          >
            {scan.running ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t('local.rescan')}
          </Button>
          <span className="text-xs text-fg-subtle" role="status">
            {scan.running
              ? t('local.scanning', { found: scan.found })
              : t('local.count', { count: count.data ?? 0 })}
          </span>
        </div>
        {scan.failed > 0 && !scan.running && (
          <p className="text-xs text-fg-subtle">
            {t('local.settings.failed', { count: scan.failed })}
          </p>
        )}
        {scan.error && (
          <p role="alert" className="text-xs text-danger">
            {scan.error}
          </p>
        )}
        {unsupported.length > 0 && (
          <p className="text-xs text-fg-subtle">
            {t('local.settings.formats', { formats: unsupported.map((f) => `.${f}`).join(' ') })}
          </p>
        )}
      </div>
    </section>
  );
}
