/** Ids of local songs in the player store: `local:` and the row number in the library. YouTube ids never contain a colon. */
export const LOCAL_ID_PREFIX = 'local:';

export const isLocalId = (id: string | null | undefined): boolean =>
  !!id && id.startsWith(LOCAL_ID_PREFIX);

export const localIdOf = (id: string): number => Number(id.slice(LOCAL_ID_PREFIX.length));
