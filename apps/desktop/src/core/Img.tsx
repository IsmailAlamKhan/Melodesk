import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ImgHTMLAttributes,
} from 'react';

export type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
};

/** Lets a feature (offline artwork) swap the image element used for every cover in the app. */
export const ImgComponentContext = createContext<ComponentType<ImgProps> | null>(null);

/** The image element for remote artwork: a plain <img> unless a feature provides a better one. */
export function Img(props: ImgProps) {
  const Custom = useContext(ImgComponentContext);
  if (Custom) return createElement(Custom, props);
  const { src, onError, onLoad, ...rest } = props;
  return (
    <img
      {...rest}
      src={src ?? undefined}
      // A cover that cannot load leaves the tile's plain background, not the browser's broken-image icon.
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
        onError?.(e);
      }}
      onLoad={(e) => {
        e.currentTarget.style.visibility = '';
        onLoad?.(e);
      }}
    />
  );
}
