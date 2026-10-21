import { createMemoryRouter, RouterProvider } from 'react-router';
import { FeatureRoutes, setNavigator } from '../core';
import { Layout } from './Layout';

// Memory history: a desktop app has no URL bar, and the player webview owns the real URLs.
// Dev aid: VITE_DEV_ROUTE=/playlist/… opens the app on that route (there is no URL bar to type into).
const initialEntries = [
  import.meta.env.DEV && typeof import.meta.env.VITE_DEV_ROUTE === 'string'
    ? import.meta.env.VITE_DEV_ROUTE
    : '/',
];

// The shell is fixed; every page comes from a feature (see core/FeatureRoutes).
export const router = createMemoryRouter(
  [
    {
      path: '/',
      element: <Layout />,
      // The index route is needed as well: a splat alone does not match the bare "/".
      children: [
        { index: true, element: <FeatureRoutes /> },
        { path: '*', element: <FeatureRoutes /> },
      ],
    },
  ],
  { initialEntries },
);

setNavigator((to) => void (typeof to === 'number' ? router.navigate(to) : router.navigate(to)));

export function AppRouter() {
  return <RouterProvider router={router} />;
}
