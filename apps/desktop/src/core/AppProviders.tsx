import type { ReactNode } from 'react';
import { FeatureBoundary } from './FeatureBoundary';
import { useContribution } from './hooks';

/** Wraps `children` in the providers contributed by active features (earlier order is outermost). */
export function AppProviders({ children }: { children: ReactNode }) {
  const providers = useContribution('providers');
  return providers.reduceRight<ReactNode>(
    (inner, { id, featureId, component: Provider }) => (
      <FeatureBoundary key={`${featureId}:${id}`} featureId={featureId} fallback={inner}>
        <Provider>{inner}</Provider>
      </FeatureBoundary>
    ),
    children,
  );
}
