import { Navigate, useRoutes } from 'react-router';
import { useContribution, useFeatureRoutes } from './hooks';

/**
 * The pages, assembled from the active features. A route whose feature is switched off simply stops
 * existing, and anyone standing on it falls through to the landing page: the home page if there is
 * one, else the first page in the sidebar (home goes away with YouTube Music).
 */
export function FeatureRoutes() {
  const routes = useFeatureRoutes();
  const nav = useContribution('nav');
  const hasHome = routes.some((r) => r.path === '/');
  const landing = hasHome ? '/' : nav[0]?.to;
  return useRoutes([
    ...routes,
    { path: '*', element: landing ? <Navigate to={landing} replace /> : null },
  ]);
}
