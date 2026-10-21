import { Home } from 'lucide-react';
import { defineFeature } from '../../core';
import { HomePage } from './HomePage';

export default defineFeature({
  id: 'home',
  name: 'feature.home.name',
  description: 'feature.home.description',
  icon: Home,
  core: true,
  contributes: {
    routes: [{ path: '/', element: <HomePage /> }],
    nav: [{ id: 'home', to: '/', label: 'nav.home', icon: Home, order: 10, end: true }],
  },
});
