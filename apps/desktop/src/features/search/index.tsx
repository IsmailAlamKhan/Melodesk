import { Search } from 'lucide-react';
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
    slots: { 'topBar.center': [{ id: 'search-box', order: 10, component: SearchBox }] },
  },
});
