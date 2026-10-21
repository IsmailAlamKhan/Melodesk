/**
 * Navigation without importing the router: the router registers itself at startup, and features
 * (palette commands, menu entries) just call `navigateTo`. A number goes back or forward in history.
 */
let navigator: ((to: string | number) => void) | null = null;

export function setNavigator(fn: (to: string | number) => void): void {
  navigator = fn;
}

export function navigateTo(to: string | number): void {
  navigator?.(to);
}
