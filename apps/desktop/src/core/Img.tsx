import { supportsCors } from './imageHosts';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ImgHTMLAttributes,
} from 'react';

export type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
};

const RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Covers come in bursts (a page of forty), and Google's image hosts answer a burst with the odd
 * "429 try later". Reload a cover that failed after a pause rather than leaving a hole. `key` is
 * for the <img>, so it is created afresh; `retry` goes in its onError.
 */
export function useImageRetry(src: string | null | undefined): { key: string; retry: () => void } {
  const [state, setState] = useState<{ src: string | null | undefined; n: number }>({ src, n: 0 });
  const n = state.src === src ? state.n : 0;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(
      () => {
        setPending(false);
        setState({ src, n: n + 1 });
      },
      RETRY_DELAY_MS * (n + 1),
    );
    return () => window.clearTimeout(timer);
  }, [pending, src, n]);
  return { key: `${src ?? ''}:${String(n)}`, retry: () => setPending(n < RETRIES) };
}

/** Lets a feature (offline artwork) swap the image element used for every cover in the app. */
export const ImgComponentContext = createContext<ComponentType<ImgProps> | null>(null);

/** The image element for remote artwork: a plain <img> unless a feature provides a better one. */
export function Img(props: ImgProps) {
  const Custom = useContext(ImgComponentContext);
  if (Custom) return createElement(Custom, props);
  return createElement(PlainImg, props);
}

function PlainImg({ src, onError, onLoad, ...rest }: ImgProps) {
  const { key, retry } = useImageRetry(src);
  return (
    <img
      {...rest}
      key={key}
      src={src ?? undefined}
      // CORS mode where the host allows it, like the offline cache's and the colour sampler's
      // requests for the same cover, so all three share one cached download. Other hosts do not send
      // CORS headers and would fail in this mode.
      crossOrigin={supportsCors(src) ? 'anonymous' : undefined}
      // No Referer: Google's image hosts answer 429 to some (the dev server's localhost), and a
      // cover request has no business telling them which page it was for.
      referrerPolicy="no-referrer"
      // A cover that cannot load leaves the tile's plain background, not the browser's broken-image icon.
      onError={(e) => {
        if (import.meta.env.DEV) console.warn('[img] failed to load', src);
        e.currentTarget.style.visibility = 'hidden';
        retry();
        onError?.(e);
      }}
      onLoad={(e) => {
        e.currentTarget.style.visibility = '';
        onLoad?.(e);
      }}
    />
  );
}
