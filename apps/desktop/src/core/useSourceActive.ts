import { useSyncExternalStore } from 'react';

/** Whether an opt-in source (a plugin the user switches on) is on, following it as it changes. */
export function useSourceActive(
  source: { isActive: () => boolean; subscribe: (onChange: () => void) => () => void } | undefined,
): boolean {
  return useSyncExternalStore(
    (onChange) => source?.subscribe(onChange) ?? (() => undefined),
    () => source?.isActive() ?? false,
  );
}
