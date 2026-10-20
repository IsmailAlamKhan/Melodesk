/**
 * Plugin SDK (Phase 3). Only the manifest shape is defined now so first-party plugins can be
 * sketched against a stable contract. Runtime sandboxing is designed in docs/architecture.md.
 */
import { z } from 'zod';

export const PluginPermissionSchema = z.enum([
  'playback:read',
  'playback:control',
  'network:fetch',
  'storage:plugin',
  'notifications',
]);
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/u),
  name: z.string().min(1).max(64),
  version: z.string().max(32),
  description: z.string().max(512),
  permissions: z.array(PluginPermissionSchema),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
