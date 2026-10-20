import type { MatchStep } from './types';

/**
 * Fisher–Yates 洗牌，回傳新陣列、不動原陣列。`random` 要像 Math.random 一樣回傳 [0, 1)，
 * 注入它是為了讓測試（與每次進入畫面的順序）可以控制。
 */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    // random() 若剛好給 1，不能讓 j 超出範圍。
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 左邊和右邊是不是題目裡的同一對。 */
export function isPair(step: MatchStep, left: string, right: string): boolean {
  return step.pairs.some((pair) => pair.left === left && pair.right === right);
}
