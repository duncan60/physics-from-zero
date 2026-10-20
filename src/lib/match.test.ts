import { describe, expect, it } from 'vitest';
import { isPair, shuffle } from './match';
import type { MatchStep } from './types';

describe('shuffle', () => {
  it('用注入的亂數：亂數永遠給 0，由後往前每個位置都和最前面互換', () => {
    // Fisher–Yates：i=3 → [4,2,3,1]；i=2 → [3,2,4,1]；i=1 → [2,3,4,1]
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it('亂數永遠接近 1：每個位置都和自己互換，順序不變', () => {
    expect(shuffle([1, 2, 3, 4], () => 0.999)).toEqual([1, 2, 3, 4]);
  });

  it('依序取亂數，照著給的數字決定結果', () => {
    const rolls = [0.5, 0.2, 0.9];
    // i=3：floor(0.5×4)=2 → [a,b,d,c]；i=2：floor(0.2×3)=0 → [d,b,a,c]；i=1：floor(0.9×2)=1 → 不動
    expect(shuffle(['a', 'b', 'c', 'd'], () => rolls.shift() ?? 0)).toEqual(['d', 'b', 'a', 'c']);
    expect(rolls).toEqual([]); // n 個元素剛好用掉 n − 1 個亂數
  });

  it('不改動原陣列，而且永遠回傳新的陣列（連順序沒變時也是）', () => {
    const original = ['a', 'b', 'c', 'd'] as const;
    const copy = [...original];
    const result = shuffle(original, () => 0);
    expect(original).toEqual(copy);
    expect(result).not.toBe(original);
    expect(shuffle(original, () => 0.999)).not.toBe(original);
  });

  it('結果是原本元素的排列（不多不少），不論亂數怎麼給', () => {
    let seed = 12345;
    const lcg = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let run = 0; run < 50; run++) expect([...shuffle(items, lcg)].sort((a, b) => a - b)).toEqual(items);
  });

  it('亂數剛好回傳 1 也不會出界（元素不會變成 undefined、也不會少）', () => {
    expect(shuffle([1, 2, 3], () => 1)).toEqual([1, 2, 3]);
  });

  it('空陣列、單一元素：不用亂數', () => {
    const boom = (): number => {
      throw new Error('不該呼叫亂數');
    };
    expect(shuffle([], boom)).toEqual([]);
    expect(shuffle(['x'], boom)).toEqual(['x']);
  });
});

describe('isPair', () => {
  const step: MatchStep = {
    kind: 'match',
    id: 'formulas',
    prompt: '',
    explanation: '',
    pairs: [
      { left: '平均速度', right: '（一開始 + 最後）÷ 2' },
      { left: '加速度', right: '（最後 − 一開始）÷ 時間' },
      { left: '距離', right: '平均速度 × 時間' },
    ],
  };

  it('左右對得上的是一對', () => {
    expect(isPair(step, '平均速度', '（一開始 + 最後）÷ 2')).toBe(true);
    expect(isPair(step, '加速度', '（最後 − 一開始）÷ 時間')).toBe(true);
    expect(isPair(step, '距離', '平均速度 × 時間')).toBe(true);
  });

  it('配錯的不是一對', () => {
    expect(isPair(step, '平均速度', '平均速度 × 時間')).toBe(false);
    expect(isPair(step, '距離', '（一開始 + 最後）÷ 2')).toBe(false);
  });

  it('左右顛倒、不存在的字串、空字串都不是一對', () => {
    expect(isPair(step, '平均速度 × 時間', '距離')).toBe(false);
    expect(isPair(step, '力', '質量 × 加速度')).toBe(false);
    expect(isPair(step, '', '')).toBe(false);
  });
});
