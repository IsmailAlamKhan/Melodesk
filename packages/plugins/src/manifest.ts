import { z } from 'zod';

export const PluginPermissionSchema = z.enum([
  'playback:read',
  'playback:control',
  'network:fetch',
  'storage:plugin',
  'notifications',
  'open:link',
  'native:discord',
]);
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/u),
  name: z.string().min(1).max(64),
  version: z.string().max(32),
  description: z.string().max(512),
  permissions: z.array(PluginPermissionSchema),
  /** Hosts the plugin may fetch from (exact hostnames). Required with `network:fetch`. */
  hosts: z.array(z.string().max(253)).default([]),
  /** Hosts whose https links the plugin may open in the user's browser. Required with `open:link`. */
  linkHosts: z.array(z.string().max(253)).default([]),
  /** What the plugin adds to the app besides its own card: `lyrics` makes it a lyrics source, `identify` a helper that works out which song a track really is. */
  provides: z.array(z.enum(['lyrics', 'identify'])).default([]),
  /** Disabled by default unless true; integrations that send data stay opt-in. */
  enabledByDefault: z.boolean().default(false),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/** What a plugin author writes (defaults optional); the host parses it into a `PluginManifest`. */
export type PluginManifestInput = z.input<typeof PluginManifestSchema>;
