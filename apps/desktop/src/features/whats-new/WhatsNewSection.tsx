import { Button } from '@melodesk/ui';
import { getVersion } from '@tauri-apps/api/app';
import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n/index';
import { releasesUpTo } from './logic';
import { RELEASES } from './releases';
import { useWhatsNew } from './store';

/** In Settings → About: the version, and a way to open what each version added. */
export function WhatsNewSection() {
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="whats-new-title">
      <h2 id="whats-new-title" className="font-semibold">
        {t('whatsNew.title')}
      </h2>
      <p className="text-sm text-fg-muted">
        {version ? t('whatsNew.section.body', { version }) : t('whatsNew.intro')}
      </p>
      <div>
        <Button
          variant="ghost"
          onClick={() => {
            useWhatsNew.getState().show(releasesUpTo(RELEASES, version ?? '999.0.0'), false);
          }}
        >
          <Gift className="size-4" />
          {t('whatsNew.section.open')}
        </Button>
      </div>
    </section>
  );
}
