import { z } from 'zod';
import { arr, nav, pickThumb, str, text, thumbnails } from '../../innertube/nav';

export const AccountSchema = z.object({
  name: z.string().nullable(),
  /** Channel handle or email-ish secondary line, as YouTube shows it. */
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** True when the account menu shows a "Switch account" item. */
  canSwitch: z.boolean(),
  signedIn: z.boolean(),
});
export type Account = z.infer<typeof AccountSchema>;

export function parseAccountMenu(response: unknown): Account {
  const popup = nav(response, ['actions', 0, 'openPopupAction', 'popup', 'multiPageMenuRenderer']);
  const header = nav(popup, ['header', 'activeAccountHeaderRenderer']);
  const name = text(nav(header, ['accountName'])) ?? null;
  const handle = text(nav(header, ['channelHandle'])) ?? text(nav(header, ['email'])) ?? null;
  const avatarUrl = pickThumb(thumbnails(nav(header, ['accountPhoto'])), 64);
  const items = arr(nav(popup, ['sections'])).flatMap((s) =>
    arr(nav(s, ['multiPageMenuSectionRenderer', 'items'])),
  );
  const canSwitch = items.some((i) =>
    /switch account/iu.test(text(nav(i, ['compactLinkRenderer', 'title'])) ?? ''),
  );
  return AccountSchema.parse({ name, handle, avatarUrl, canSwitch, signedIn: name !== null });
}

export const AccountChoiceSchema = z.object({
  name: z.string(),
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isSelected: z.boolean(),
  /** Cookie-less account index for `?authuser=N`, and a page id for brand accounts. */
  authUser: z.string().nullable(),
  pageId: z.string().nullable(),
});
export type AccountChoice = z.infer<typeof AccountChoiceSchema>;

/** `account/accounts_list` response. */
export function parseAccountsList(response: unknown): AccountChoice[] {
  const out: AccountChoice[] = [];
  const sections = arr(
    nav(response, [
      'actions',
      0,
      'getMultiPageMenuAction',
      'menu',
      'multiPageMenuRenderer',
      'sections',
    ]),
  );
  for (const s of sections) {
    for (const i of arr(nav(s, ['accountSectionListRenderer', 'contents']))) {
      for (const it of arr(nav(i, ['accountItemSectionRenderer', 'contents']))) {
        const a = nav(it, ['accountItem']);
        if (!a) continue;
        const tokens = arr(
          nav(a, ['serviceEndpoint', 'selectActiveIdentityEndpoint', 'supportedTokens']),
        );
        const authUser =
          tokens
            .map((t) => str(nav(t, ['accountSigninToken', 'signinUrl'])))
            .find(Boolean)
            ?.match(/authuser=(\d+)/u)?.[1] ??
          tokens.map((t) => str(nav(t, ['datasyncIdToken', 'datasyncIdToken']))).find(Boolean) ??
          null;
        const pageId =
          tokens.map((t) => str(nav(t, ['pageIdToken', 'pageId']))).find(Boolean) ?? null;
        out.push(
          AccountChoiceSchema.parse({
            name: text(nav(a, ['accountName'])) ?? '',
            handle: text(nav(a, ['accountByline'])) ?? null,
            avatarUrl: pickThumb(thumbnails(nav(a, ['accountPhoto'])), 64),
            isSelected: nav(a, ['isSelected']) === true,
            authUser,
            pageId,
          }),
        );
      }
    }
  }
  return out;
}
