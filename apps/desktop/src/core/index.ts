export { defineFeature } from './feature';
export type {
  Contributions,
  Feature,
  MenuContext,
  MenuContribution,
  NavItem,
  PaletteCommand,
  Panel,
  SettingsSection,
  SlotItem,
  SlotMap,
  SlotName,
} from './feature';
export { FeatureBoundary } from './FeatureBoundary';
export { FeatureRoutes } from './FeatureRoutes';
export {
  useActiveFeatures,
  useCommands,
  useContribution,
  useFeatureActive,
  useFeatureRoutes,
  useSlot,
  useWindowComponent,
} from './hooks';
export { discoverFeatures } from './discover';
export { computeActive, dependentsOf, useFeatures, validateFeatures } from './registry';
export { Slot } from './Slot';
export { registerAction, runAction, useHasAction } from './actions';
export { AppProviders } from './AppProviders';
export { Img, ImgComponentContext } from './Img';
export type { ImgProps } from './Img';
export { createRegistry, lyricsSources } from './services';
export type { LyricsSource } from './services';
