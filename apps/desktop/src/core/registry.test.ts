import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contributions, Feature } from './feature';
import { computeActive, dependentsOf, useFeatures, validateFeatures } from './registry';

const f = (id: string, extra: Partial<Feature> = {}): Feature => ({
  id,
  name: 'nav.home',
  description: 'nav.home',
  ...extra,
});

const ids = (list: Feature[]): string[] => list.map((x) => x.id);

describe('computeActive', () => {
  it('everything is on by default, and core features cannot be turned off', () => {
    const all = [f('a'), f('b', { core: true })];
    expect(ids(computeActive(all, {}, null))).toEqual(['a', 'b']);
    expect(ids(computeActive(all, { a: false, b: false }, null))).toEqual(['b']);
  });

  it('honours defaultEnabled and explicit choices', () => {
    const all = [f('off', { defaultEnabled: false }), f('on')];
    expect(ids(computeActive(all, {}, null))).toEqual(['on']);
    expect(ids(computeActive(all, { off: true, on: false }, null))).toEqual(['off']);
  });

  it('a feature is inactive when anything it depends on is, all the way down', () => {
    const all = [f('a'), f('b', { dependsOn: ['a'] }), f('c', { dependsOn: ['b'] })];
    expect(ids(computeActive(all, { a: false }, null))).toEqual([]);
    expect(ids(computeActive(all, { b: false }, null))).toEqual(['a']);
  });

  it('needs the native modules it requires, unless they are unknown', () => {
    const all = [f('discord', { requires: ['discord'] }), f('plain')];
    expect(ids(computeActive(all, {}, new Set()))).toEqual(['plain']);
    expect(ids(computeActive(all, {}, new Set(['discord'])))).toEqual(['discord', 'plain']);
    expect(ids(computeActive(all, {}, null))).toEqual(['discord', 'plain']);
  });
});

describe('dependentsOf', () => {
  it('lists everything that would go down with a feature', () => {
    const all = [f('a'), f('b', { dependsOn: ['a'] }), f('c', { dependsOn: ['b'] }), f('d')];
    expect(ids(dependentsOf('a', all))).toEqual(['b', 'c']);
    expect(dependentsOf('d', all)).toEqual([]);
  });
});

describe('validateFeatures', () => {
  it('accepts a sound set', () => {
    expect(validateFeatures([f('a'), f('b', { dependsOn: ['a'] })])).toEqual([]);
  });

  it('reports duplicates, bad ids, unknown and circular dependencies', () => {
    expect(validateFeatures([f('a'), f('a')]).join()).toContain('duplicate');
    expect(validateFeatures([f('Bad_Id')]).join()).toContain('kebab-case');
    expect(validateFeatures([f('a', { dependsOn: ['nope'] })]).join()).toContain('unknown');
    const cycle = validateFeatures([f('a', { dependsOn: ['b'] }), f('b', { dependsOn: ['a'] })]);
    expect(cycle.join()).toContain('dependency cycle: a -> b -> a');
  });

  it('reports a core feature that needs an optional one', () => {
    expect(
      validateFeatures([f('opt'), f('core', { core: true, dependsOn: ['opt'] })]).join(),
    ).toContain('optional');
  });

  it('reports the same route path from two features', () => {
    const route = (path: string): Contributions => ({ routes: [{ path, element: null }] });
    const problems = validateFeatures([
      f('a', { contributes: route('/x') }),
      f('b', { contributes: route('/x') }),
    ]);
    expect(problems.join()).toContain('"/x"');
  });
});

describe('the registry store', () => {
  beforeEach(() => {
    useFeatures.setState({ features: [], overrides: {}, native: null, active: [], loaded: false });
  });

  it('starts features that are active and stops them when they are switched off', () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    useFeatures.getState().register([f('x', { start })]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(ids(useFeatures.getState().active)).toEqual(['x']);

    useFeatures.getState().setEnabled('x', false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(useFeatures.getState().active).toEqual([]);

    useFeatures.getState().setEnabled('x', true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('switching a feature off also stops the ones that depend on it, and back on revives them', () => {
    const stopB = vi.fn();
    useFeatures.getState().register([f('a'), f('b', { dependsOn: ['a'], start: () => stopB })]);
    useFeatures.getState().setEnabled('a', false);
    expect(useFeatures.getState().active).toEqual([]);
    expect(stopB).toHaveBeenCalledTimes(1);
    useFeatures.getState().setEnabled('a', true);
    expect(ids(useFeatures.getState().active)).toEqual(['a', 'b']);
  });

  it('refuses to switch off a core feature', () => {
    useFeatures.getState().register([f('core', { core: true })]);
    useFeatures.getState().setEnabled('core', false);
    expect(ids(useFeatures.getState().active)).toEqual(['core']);
  });

  it('a feature that throws while starting does not stop the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    useFeatures.getState().register([
      f('bad', {
        start: () => {
          throw new Error('boom');
        },
      }),
      f('good', { start: ok }),
    ]);
    expect(ok).toHaveBeenCalled();
    error.mockRestore();
  });
});
