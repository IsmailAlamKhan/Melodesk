import { Disc3 } from 'lucide-react';
import { defineFeature } from '../../core';
import { DetailPage } from './DetailPage';

export default defineFeature({
  id: 'detail',
  name: 'feature.detail.name',
  description: 'feature.detail.description',
  icon: Disc3,
  core: true,
  contributes: {
    routes: [
      { path: '/artist/:id', element: <DetailPage kind="artist" /> },
      { path: '/album/:id', element: <DetailPage kind="album" /> },
      { path: '/playlist/:id', element: <DetailPage kind="playlist" /> },
    ],
  },
});
