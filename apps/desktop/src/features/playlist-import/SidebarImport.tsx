import { FileUp } from 'lucide-react';
import { useT } from '../../i18n/index';
import { openImport } from './ImportDialog';

/** A small button under the playlists in the sidebar. */
export function SidebarImport() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={openImport}
      className="mx-3 mt-1 flex h-9 items-center gap-2 rounded-lg px-2 text-xs text-fg-muted hover:bg-bg-overlay hover:text-fg"
    >
      <FileUp className="size-4" />
      {t('import.open')}
    </button>
  );
}
