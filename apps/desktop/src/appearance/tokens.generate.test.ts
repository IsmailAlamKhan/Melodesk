import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { colorVars, cssBlock, DEFAULT_SEED, type ThemeName } from './material';

const cssPath = fileURLToPath(
  new URL('../../../../packages/ui/src/styles/tokens.css', import.meta.url),
);

function region(css: string, theme: ThemeName): [number, number] {
  const start = css.indexOf(`/* material:${theme}:start */`);
  const end = css.indexOf(`/* material:${theme}:end */`);
  if (start < 0 || end < 0) throw new Error(`markers for ${theme} are missing in tokens.css`);
  return [start + `/* material:${theme}:start */`.length, end];
}

/** Regenerate with UPDATE_TOKENS=1; otherwise the committed blocks must match the generator. */
it('the generated colour blocks in tokens.css match the Material scheme for the default seed', () => {
  let css = readFileSync(cssPath, 'utf8');
  const update = process.env['UPDATE_TOKENS'] === '1';
  for (const theme of ['dark', 'light', 'amoled'] as const) {
    const wanted = `\n${cssBlock(colorVars(DEFAULT_SEED, theme))}\n  `;
    const [from, to] = region(css, theme);
    if (update) css = css.slice(0, from) + wanted + css.slice(to);
    else
      expect(css.slice(from, to), `${theme} block is stale; run with UPDATE_TOKENS=1`).toBe(wanted);
  }
  if (update) writeFileSync(cssPath, css);
});
