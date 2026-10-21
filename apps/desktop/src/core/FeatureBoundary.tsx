import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Contains a failing feature: if something a feature contributed throws while rendering, only that
 * piece disappears (and is logged) instead of taking the whole app down.
 */
export class FeatureBoundary extends Component<
  { featureId: string; children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[features] "${this.props.featureId}" crashed while rendering`, error, info);
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
