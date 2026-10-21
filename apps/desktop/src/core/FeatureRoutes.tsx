import { Navigate, useRoutes } from 'react-router';
import { useFeatureRoutes } from './hooks';

/**
 * The pages, assembled from the active features. A route whose feature is switched off simply stops
 * existing, and anyone standing on it falls through to the home page.
 */
export function FeatureRoutes() {
  const routes = useFeatureRoutes();
  return useRoutes([...routes, { path: '*', element: <Navigate to="/" replace /> }]);
}
