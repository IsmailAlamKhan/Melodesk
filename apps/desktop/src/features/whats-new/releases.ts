import type { MessageKey } from '../../i18n';

export interface Release {
  /** The version these changes arrived in. */
  version: string;
  /** What is new, as messages (so it can be translated), most notable first. */
  highlights: MessageKey[];
}

/**
 * What each version added, for people reading about it in the app. Newest first. Only things a
 * listener would notice go here; add an entry (and its messages) when you ship a version.
 */
export const RELEASES: readonly Release[] = [
  {
    version: '0.11.0',
    highlights: ['whatsNew.v0_11_0.a', 'whatsNew.v0_11_0.b'],
  },
  {
    version: '0.10.0',
    highlights: [
      'whatsNew.v0_10_0.a',
      'whatsNew.v0_10_0.b',
      'whatsNew.v0_10_0.c',
      'whatsNew.v0_10_0.d',
    ],
  },
  {
    version: '0.9.0',
    highlights: ['whatsNew.v0_9_0.a', 'whatsNew.v0_9_0.b'],
  },
  {
    version: '0.8.0',
    highlights: ['whatsNew.v0_8_0.a', 'whatsNew.v0_8_0.b'],
  },
  {
    version: '0.7.0',
    highlights: [
      'whatsNew.v0_7_0.a',
      'whatsNew.v0_7_0.b',
      'whatsNew.v0_7_0.c',
      'whatsNew.v0_7_0.d',
    ],
  },
  {
    version: '0.6.0',
    highlights: ['whatsNew.v0_6_0.a', 'whatsNew.v0_6_0.b', 'whatsNew.v0_6_0.c'],
  },
  {
    version: '0.5.0',
    highlights: [
      'whatsNew.v0_5_0.a',
      'whatsNew.v0_5_0.b',
      'whatsNew.v0_5_0.c',
      'whatsNew.v0_5_0.d',
    ],
  },
  {
    version: '0.4.0',
    highlights: [
      'whatsNew.v0_4_0.a',
      'whatsNew.v0_4_0.b',
      'whatsNew.v0_4_0.c',
      'whatsNew.v0_4_0.d',
      'whatsNew.v0_4_0.e',
    ],
  },
  {
    version: '0.3.0',
    highlights: ['whatsNew.v0_3_0.a', 'whatsNew.v0_3_0.b'],
  },
];
