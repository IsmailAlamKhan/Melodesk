import { z } from 'zod';

export const PluginPermissionSchema = z.enum([
  'playback:read',
  'playback:control',
  'network:fetch',
  'storage:plugin',
  'notifications',
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
  /** Disabled by default unless true; integrations that send data stay opt-in. */
  enabledByDefault: z.boolean().default(false),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/** What a plugin author writes (defaults optional); the host parses it into a `PluginManifest`. */
export type PluginManifestInput = z.input<typeof PluginManifestSchema>;
