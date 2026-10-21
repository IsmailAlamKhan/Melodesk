import { Search } from 'lucide-react';
import { t } from '../../i18n';
import { defineFeature } from '../../core';
import { SearchBox } from './SearchBox';
import { SearchPage } from './SearchPage';

export default defineFeature({
  id: 'search',
  name: 'feature.search.name',
  description: 'feature.search.description',
  icon: Search,
  core: true,
  contributes: {
    routes: [{ path: '/search', element: <SearchPage /> }],
    menus: [
      {
        menu: 'go',
        order: 90,
        entries: () => [
          {
            key: 'search',
            label: t('ctx.search'),
            icon: <Search />,
            hint: `${document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+'}F`,
            run: () => document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(),
          },
        ],
      },
    ],
    slots: { 'topBar.center': [{ id: 'search-box', order: 10, component: SearchBox }] },
  },
});
