import { describe, expect, it } from 'vitest';
import { checkSlider } from './slider';
import type { SliderStep } from './types';

// 取自 spec 的 2-1 `empty-cart-force`：10 公斤、目標加速度 2 公尺/秒² → 20 牛頓
const step: SliderStep = {
  kind: 'slider',
  id: 'empty-cart-force',
  prompt: '',
  quantity: '推力',
  unit: 'N',
  min: 0,
  max: 40,
  step: 1,
  initial: 0,
  answer: 20,
  tooLow: '推力不夠，購物車加速得比目標慢',
  tooHigh: '推力太大，購物車加速得比目標快',
  explanation: '',
  anim: 'cart',
};

describe('checkSlider', () => {
  it('剛好', () => expect(checkSlider(step, 20)).toEqual({ correct: true }));

  it('太小 → 答錯，給 tooLow', () => {
    expect(checkSlider(step, 19)).toStrictEqual({ correct: false, feedback: step.tooLow });
    expect(checkSlider(step, 0)).toStrictEqual({ correct: false, feedback: step.tooLow });
  });

  it('太大 → 答錯，給 tooHigh', () => {
    expect(checkSlider(step, 21)).toStrictEqual({ correct: false, feedback: step.tooHigh });
    expect(checkSlider(step, 40)).toStrictEqual({ correct: false, feedback: step.tooHigh });
  });

  it('沒有 tolerance 就要剛好：差 0.5 也不算對（不會因為四捨五入而放過）', () => {
    expect(checkSlider(step, 19.5)).toStrictEqual({ correct: false, feedback: step.tooLow });
    expect(checkSlider(step, 20.5)).toStrictEqual({ correct: false, feedback: step.tooHigh });
  });

  it('容許誤差：邊界上算對，超過一點點就不算', () => {
    const loose: SliderStep = { ...step, tolerance: 2 };
    expect(checkSlider(loose, 18)).toEqual({ correct: true });
    expect(checkSlider(loose, 22)).toEqual({ correct: true });
    expect(checkSlider(loose, 17)).toStrictEqual({ correct: false, feedback: step.tooLow });
    expect(checkSlider(loose, 23)).toStrictEqual({ correct: false, feedback: step.tooHigh });
    expect(checkSlider(loose, 22.001)).toStrictEqual({ correct: false, feedback: step.tooHigh });
  });

  it('浮點誤差的緩衝（1e-9）：|9.6 − 9.8| 的邊界不會被浮點誤差判錯，緩衝之外就是錯', () => {
    const precise: SliderStep = { ...step, min: 9, max: 10, step: 0.1, initial: 9, answer: 9.8, tolerance: 0.2 };
    expect(Math.abs(9.6 - 9.8)).toBeGreaterThan(0.2); // 0.20000000000000107：直接比較會判錯
    expect(checkSlider(precise, 9.6)).toEqual({ correct: true });
    expect(checkSlider(precise, 10)).toEqual({ correct: true });
    expect(checkSlider(precise, 9.6 - 1e-6)).toStrictEqual({ correct: false, feedback: step.tooLow });
  });

  it('負的目標值也一樣：太小是更負、太大是更接近 0', () => {
    const negative: SliderStep = { ...step, min: -10, max: 10, initial: 0, answer: -4 };
    expect(checkSlider(negative, -4)).toEqual({ correct: true });
    expect(checkSlider(negative, -5)).toStrictEqual({ correct: false, feedback: step.tooLow });
    expect(checkSlider(negative, -3)).toStrictEqual({ correct: false, feedback: step.tooHigh });
  });

  it('不是數字（NaN）：答錯、沒有「太小／太大」的回饋', () => expect(checkSlider(step, Number.NaN)).toStrictEqual({ correct: false }));
});
