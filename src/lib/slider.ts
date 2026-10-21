import { formatNumber, isClose } from './answer';
import type { CheckResult } from './answer';
import type { SliderStep } from './types';

/** 在 tolerance（加上和數字題一樣的浮點緩衝）以內就算對；否則依太小或太大給回饋，不直接給答案。 */
export function checkSlider(step: SliderStep, value: number): CheckResult {
  if (Number.isNaN(value)) return { correct: false };
  if (isClose(value, step.answer, step.tolerance)) return { correct: true };
  return { correct: false, feedback: value < step.answer ? step.tooLow : step.tooHigh };
}

/**
 * 滑桿題購物車旁邊的那一行：加速度 a = F ÷ m（公尺/秒²）。
 * 除得盡就寫「= 2」；除不盡就四捨五入到小數第 2 位，寫「，約 0.47」。
 */
export function cartAccelerationText(force: number, mass: number): string {
  const exact = force / mass;
  const rounded = Math.round(exact * 100) / 100 || 0; // || 0：不要出現 −0
  const shown = Math.abs(rounded - exact) < 1e-9 ? ` = ${formatNumber(rounded)}` : `，約 ${formatNumber(rounded)}`;
  return `加速度 = ${formatNumber(force)} ÷ ${formatNumber(mass)}${shown} 公尺/秒²`;
}
