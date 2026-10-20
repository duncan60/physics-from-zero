import { isClose } from './answer';
import type { CheckResult } from './answer';
import type { SliderStep } from './types';

/** 在 tolerance（加上和數字題一樣的浮點緩衝）以內就算對；否則依太小或太大給回饋，不直接給答案。 */
export function checkSlider(step: SliderStep, value: number): CheckResult {
  if (Number.isNaN(value)) return { correct: false };
  if (isClose(value, step.answer, step.tolerance)) return { correct: true };
  return { correct: false, feedback: value < step.answer ? step.tooLow : step.tooHigh };
}
