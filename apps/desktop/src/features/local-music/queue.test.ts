import { describe, expect, it } from 'vitest';
import {
  addToQueue,
  emptyQueue,
  moveItem,
  nextIndex,
  previousStep,
  removeItem,
  setShuffle,
  shuffled,
  startQueue,
} from './queue';

const off = { shuffle: false, repeat: 'off' as const };
/** A repeatable "random": always picks the last remaining slot, so a shuffle reverses. */
const rng = () => 0.999;

describe('startQueue', () => {
  it('plays the list from the chosen song', () => {
    const q = startQueue(['a', 'b', 'c'], 1, off);
    expect(q.items).toEqual(['a', 'b', 'c']);
    expect(q.index).toBe(1);
  });
  it('with shuffle plays the chosen song first, then the rest mixed', () => {
    const q = startQueue(['a', 'b', 'c', 'd'], 2, { shuffle: true, repeat: 'off' }, rng);
    expect(q.items[0]).toBe('c');
    expect(q.items.slice(1).sort()).toEqual(['a', 'b', 'd']);
    expect(q.index).toBe(0);
    expect(q.original).toEqual(['a', 'b', 'c', 'd']);
  });
  it('is empty for no songs, and clamps a start outside the list', () => {
    expect(startQueue([], 0, off).index).toBe(-1);
    expect(startQueue(['a', 'b'], 9, off).index).toBe(1);
  });
  it('shuffled keeps every song', () => {
    expect(shuffled([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('shuffle on and off', () => {
  it('mixes only what comes after the current song, and restores the order', () => {
    const q = startQueue(['a', 'b', 'c', 'd', 'e'], 1, off);
    const on = setShuffle(q, true, rng);
    expect(on.items.slice(0, 2)).toEqual(['a', 'b']);
    expect(on.items.slice(2).sort()).toEqual(['c', 'd', 'e']);
    expect(on.index).toBe(1);
    const back = setShuffle({ ...on, index: 3 }, false);
    expect(back.items).toEqual(['a', 'b', 'c', 'd', 'e']);
    // Whatever was playing is still the one playing.
    expect(back.items[back.index]).toBe(on.items[3]);
  });
  it('keeps songs added while shuffled', () => {
    const on = setShuffle(startQueue(['a', 'b'], 0, off), true, rng);
    const added = addToQueue(on, ['z'], 'end');
    expect(setShuffle(added, false).items).toEqual(['a', 'b', 'z']);
  });
});

describe('next and previous', () => {
  it('goes on, stops at the end, or wraps when repeating all', () => {
    const q = startQueue(['a', 'b'], 0, off);
    expect(nextIndex(q)).toBe(1);
    expect(nextIndex({ ...q, index: 1 })).toBeNull();
    expect(nextIndex({ ...q, index: 1, repeat: 'all' })).toBe(0);
    expect(nextIndex(emptyQueue())).toBeNull();
  });
  it('restarts a song that has been playing, otherwise steps back', () => {
    const q = { ...startQueue(['a', 'b', 'c'], 1, off) };
    expect(previousStep(q, 10)).toEqual({ type: 'restart' });
    expect(previousStep(q, 1)).toEqual({ type: 'go', index: 0 });
    expect(previousStep({ ...q, index: 0 }, 1)).toEqual({ type: 'restart' });
    expect(previousStep({ ...q, index: 0, repeat: 'all' }, 1)).toEqual({ type: 'go', index: 2 });
  });
});

describe('editing the queue', () => {
  it('moves songs and keeps the current one current', () => {
    const q = startQueue(['a', 'b', 'c', 'd'], 1, off); // b is playing
    expect(moveItem(q, 1, 3)).toMatchObject({ items: ['a', 'c', 'd', 'b'], index: 3 });
    expect(moveItem(q, 0, 2)).toMatchObject({ items: ['b', 'c', 'a', 'd'], index: 0 });
    expect(moveItem(q, 3, 0)).toMatchObject({ items: ['d', 'a', 'b', 'c'], index: 2 });
    expect(moveItem(q, 2, 3).index).toBe(1);
    expect(moveItem(q, 0, 9)).toBe(q);
  });
  it('removes songs, saying when it was the playing one', () => {
    const q = startQueue(['a', 'b', 'c'], 1, off);
    expect(removeItem(q, 0)).toMatchObject({
      queue: { items: ['b', 'c'], index: 0 },
      removedCurrent: false,
    });
    expect(removeItem(q, 2)).toMatchObject({
      queue: { items: ['a', 'b'], index: 1 },
      removedCurrent: false,
    });
    expect(removeItem(q, 1)).toMatchObject({
      queue: { items: ['a', 'c'], index: 1 },
      removedCurrent: true,
    });
    const last = removeItem({ ...q, index: 2 }, 2);
    expect(last.queue.index).toBe(1);
    expect(last.removedCurrent).toBe(true);
    expect(removeItem(q, 9).queue).toBe(q);
  });
  it('adds songs next or at the end', () => {
    const q = startQueue(['a', 'b', 'c'], 0, off);
    expect(addToQueue(q, ['x'], 'next').items).toEqual(['a', 'x', 'b', 'c']);
    expect(addToQueue(q, ['x', 'y'], 'end').items).toEqual(['a', 'b', 'c', 'x', 'y']);
    expect(addToQueue(emptyQueue(), ['x'], 'next')).toMatchObject({ items: ['x'], index: 0 });
  });
});
