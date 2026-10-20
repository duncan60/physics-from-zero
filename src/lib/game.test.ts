import { describe, expect, it } from 'vitest';
import {
  COMBO_START,
  COMBO_XP_CAP,
  accuracy,
  emptyStats,
  formatDuration,
  isPerfect,
  lessonXp,
  recordQuestion,
  type RunStats,
} from './game';
import { PERFECT_BONUS_XP, XP_PER_FIRST_TRY, XP_PER_LESSON } from './progress';

/** 依序餵入一串「是否一次答對」，回傳最後的統計。 */
function run(...results: boolean[]): RunStats {
  return results.reduce(recordQuestion, emptyStats());
}

const repeat = (clean: boolean, n: number): boolean[] => Array.from({ length: n }, () => clean);

describe('emptyStats', () => {
  it('一開始全部是 0', () => {
    expect(emptyStats()).toEqual({ questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 });
  });

  it('每次回傳新的物件，不會互相影響', () => {
    expect(emptyStats()).not.toBe(emptyStats());
  });
});

describe('recordQuestion', () => {
  it('常數：連續 3 題起算，每課上限 5 XP', () => {
    expect(COMBO_START).toBe(3);
    expect(COMBO_XP_CAP).toBe(5);
  });

  it('連續 3 題一次答對：comboXp 1；5 題：3；8 題：5（上限）', () => {
    expect(run(...repeat(true, 2)).comboXp).toBe(0);
    expect(run(...repeat(true, 3)).comboXp).toBe(1);
    expect(run(...repeat(true, 5)).comboXp).toBe(3);
    expect(run(...repeat(true, 8)).comboXp).toBe(5);
    // 超過上限後不會再增加
    expect(run(...repeat(true, 12)).comboXp).toBe(COMBO_XP_CAP);
  });

  it('答錯讓 combo 歸零，但不扣 comboXp', () => {
    const before = run(...repeat(true, 4));
    expect(before.combo).toBe(4);
    expect(before.comboXp).toBe(2);

    const after = recordQuestion(before, false);
    expect(after.combo).toBe(0);
    expect(after.comboXp).toBe(2);
    expect(after.bestCombo).toBe(4);
    expect(after.questions).toBe(5);
    expect(after.clean).toBe(4);
  });

  it('答錯之後要重新累積到 3 才再加 comboXp', () => {
    const s = run(true, true, true, false, true, true);
    expect(s.combo).toBe(2);
    expect(s.comboXp).toBe(1);
    expect(recordQuestion(s, true).comboXp).toBe(2);
  });

  it('追蹤 bestCombo：不會因為答錯或之後較短的連對而下降', () => {
    const s = run(true, true, true, true, false, true, true);
    expect(s.bestCombo).toBe(4);
    expect(s.combo).toBe(2);
  });

  it('questions 與 clean 的計數', () => {
    const s = run(true, false, true, false, false);
    expect(s.questions).toBe(5);
    expect(s.clean).toBe(2);
  });

  it('不會修改傳進來的物件', () => {
    const before = emptyStats();
    const snapshot = { ...before };
    const after = recordQuestion(before, true);
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
  });
});

describe('isPerfect', () => {
  it('完美：全部一次答對才算；沒有題目不算完美', () => {
    expect(isPerfect(emptyStats())).toBe(false);
    expect(isPerfect(run(true))).toBe(true);
    expect(isPerfect(run(true, true, true, true))).toBe(true);
    expect(isPerfect(run(true, true, false, true))).toBe(false);
    expect(isPerfect(run(false))).toBe(false);
  });
});

describe('accuracy', () => {
  it('accuracy：3/4 → 75；2/3 → 67', () => {
    expect(accuracy(run(true, true, true, false))).toBe(75);
    expect(accuracy(run(true, true, false))).toBe(67);
  });

  it('沒有題目時是 100；全對 100；全錯 0', () => {
    expect(accuracy(emptyStats())).toBe(100);
    expect(accuracy(run(true, true))).toBe(100);
    expect(accuracy(run(false, false))).toBe(0);
  });
});

describe('lessonXp', () => {
  it('lessonXp：4 題全對、combo 2 → 10 + 20 + 2 + 5 = 37', () => {
    const s = run(true, true, true, true);
    expect(s.comboXp).toBe(2);
    expect(lessonXp(s)).toBe(37);
    // 用常數再算一次，確保公式與 progress.ts 的常數一致
    expect(lessonXp(s)).toBe(XP_PER_LESSON + 4 * XP_PER_FIRST_TRY + 2 + PERFECT_BONUS_XP);
  });

  it('沒有完美就沒有完美加分', () => {
    // 3 題一次答對 + 1 題答錯：10 + 3 × 5 + comboXp 1 = 26
    const s = run(true, true, true, false);
    expect(lessonXp(s)).toBe(XP_PER_LESSON + 3 * XP_PER_FIRST_TRY + 1);
    expect(lessonXp(s)).toBe(26);
  });

  it('全部答錯也能拿到上完一課的基本 XP', () => {
    expect(lessonXp(run(false, false, false))).toBe(XP_PER_LESSON);
  });

  it('沒有題目：只有基本 XP，沒有完美加分', () => {
    expect(lessonXp(emptyStats())).toBe(XP_PER_LESSON);
  });

  it('comboXp 達到上限時整課最多多拿 5', () => {
    const s = run(...repeat(true, 10));
    expect(lessonXp(s)).toBe(XP_PER_LESSON + 10 * XP_PER_FIRST_TRY + COMBO_XP_CAP + PERFECT_BONUS_XP);
  });
});

describe('formatDuration', () => {
  it('formatDuration：65000 → 1 分 5 秒；9000 → 9 秒', () => {
    expect(formatDuration(65000)).toBe('1 分 5 秒');
    expect(formatDuration(9000)).toBe('9 秒');
  });

  it('整分鐘仍顯示「X 分 0 秒」', () => {
    expect(formatDuration(60000)).toBe('1 分 0 秒');
    expect(formatDuration(120000)).toBe('2 分 0 秒');
  });

  it('不足一秒的部分無條件捨去', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(999)).toBe('0 秒');
    expect(formatDuration(59999)).toBe('59 秒');
    expect(formatDuration(65999)).toBe('1 分 5 秒');
  });

  it('不合理的輸入（負數、NaN）當成 0 秒', () => {
    expect(formatDuration(-5000)).toBe('0 秒');
    expect(formatDuration(Number.NaN)).toBe('0 秒');
  });
});
