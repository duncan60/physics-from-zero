import { PERFECT_BONUS_XP, XP_PER_FIRST_TRY, XP_PER_LESSON } from './progress';

/** 連續一次答對到第幾題起，開始有 Combo 加分。 */
export const COMBO_START = 3;
/** 每一課 Combo 加分的上限（XP）。 */
export const COMBO_XP_CAP = 5;

/** 一次上課（一次遊玩）的作答統計。只算題目，觀念卡和動畫步驟不算。 */
export interface RunStats {
  /** 已作答完畢的題數 */
  questions: number;
  /** 其中一次答對的題數 */
  clean: number;
  /** 目前連續一次答對的題數 */
  combo: number;
  /** 這一課出現過的最長連續一次答對 */
  bestCombo: number;
  /** 累積的 Combo 加分 XP（上限 COMBO_XP_CAP，答錯不會扣） */
  comboXp: number;
}

export function emptyStats(): RunStats {
  return { questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 };
}

/**
 * 記錄一題的結果，回傳新的統計（不修改傳入的物件）。
 * - 一次答對：combo + 1；新的 combo 達到 COMBO_START 時 comboXp + 1（上限 COMBO_XP_CAP）。
 * - 否則：combo 歸零，comboXp 不變。
 */
export function recordQuestion(s: RunStats, clean: boolean): RunStats {
  if (!clean) {
    return { ...s, questions: s.questions + 1, combo: 0 };
  }
  const combo = s.combo + 1;
  const comboXp = combo >= COMBO_START ? Math.min(COMBO_XP_CAP, s.comboXp + 1) : s.comboXp;
  return {
    questions: s.questions + 1,
    clean: s.clean + 1,
    combo,
    bestCombo: Math.max(s.bestCombo, combo),
    comboXp,
  };
}

/** 完美：有題目，而且每一題都一次答對。 */
export function isPerfect(s: RunStats): boolean {
  return s.questions > 0 && s.clean === s.questions;
}

/** 正確率（一次答對的題數 ÷ 題目數），四捨五入成整數百分比；沒有題目時是 100。 */
export function accuracy(s: RunStats): number {
  if (s.questions === 0) return 100;
  return Math.round((s.clean / s.questions) * 100);
}

/** 這一課總共拿到的 XP：基本 + 每個一次答對 + Combo 加分 + 完美加分。 */
export function lessonXp(s: RunStats): number {
  return (
    XP_PER_LESSON +
    s.clean * XP_PER_FIRST_TRY +
    s.comboXp +
    (isPerfect(s) ? PERFECT_BONUS_XP : 0)
  );
}

/** 「X 分 Y 秒」；不到一分鐘只顯示「Y 秒」。不足一秒的部分捨去。 */
export function formatDuration(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}
