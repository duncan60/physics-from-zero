import { describe, expect, it } from 'vitest';
import { checkFormula, evaluateFormula, parseFormula, sameFormula } from './formula';
import type { FormulaStep } from './types';

const M = '−'; // U+2212，磚塊上的減號

describe('sameFormula（正規化後相同）', () => {
  it('交換律：(6 + 18) ÷ 2 等於 (18 + 6) ÷ 2', () =>
    expect(sameFormula(['(', '6', '+', '18', ')', '÷', '2'], ['(', '18', '+', '6', ')', '÷', '2'])).toBe(true));

  it('數字一樣、方法錯：(10 − 0) ÷ 2 × 5 不等於 (10 + 0) ÷ 2 × 5', () => {
    const wrong = ['(', '10', M, '0', ')', '÷', '2', '×', '5'];
    const right = ['(', '10', '+', '0', ')', '÷', '2', '×', '5'];
    expect(evaluateFormula(wrong)).toBe(evaluateFormula(right)); // 算出來一樣（都是 25）……
    expect(sameFormula(wrong, right)).toBe(false); // ……但不是同一個算式
  });

  it('減法不能交換：(18 − 6) ÷ 4 不等於 (6 − 18) ÷ 4', () =>
    expect(sameFormula(['(', '18', M, '6', ')', '÷', '4'], ['(', '6', M, '18', ')', '÷', '4'])).toBe(false));

  it('先乘除後加減：6 + 18 ÷ 2 不等於 (6 + 18) ÷ 2', () =>
    expect(sameFormula(['6', '+', '18', '÷', '2'], ['(', '6', '+', '18', ')', '÷', '2'])).toBe(false));

  it('多餘的括號不影響：6 + 18 ÷ 2 等於 6 + (18 ÷ 2)，也等於 ((6) + (18 ÷ 2))', () => {
    const plain = ['6', '+', '18', '÷', '2'];
    expect(sameFormula(plain, ['6', '+', '(', '18', '÷', '2', ')'])).toBe(true);
    expect(sameFormula(plain, ['(', '(', '6', ')', '+', '(', '18', '÷', '2', ')', ')'])).toBe(true);
  });

  it('除法不能交換：20 ÷ 4 不等於 4 ÷ 20', () => expect(sameFormula(['20', '÷', '4'], ['4', '÷', '20'])).toBe(false));

  it('乘法可以交換：20 × 4 等於 4 × 20', () => expect(sameFormula(['20', '×', '4'], ['4', '×', '20'])).toBe(true));

  it('+ 和 × 可以結合：6 + 18 + 2 等於 2 + (18 + 6)；2 × 3 × 4 等於 4 × (3 × 2)', () => {
    expect(sameFormula(['6', '+', '18', '+', '2'], ['2', '+', '(', '18', '+', '6', ')'])).toBe(true);
    expect(sameFormula(['2', '×', '3', '×', '4'], ['4', '×', '(', '3', '×', '2', ')'])).toBe(true);
  });

  it('括號位置不同也一樣：(6 + 18) + 2 等於 6 + (18 + 2)；(2 × 3) × 4 等於 2 × (3 × 4)；四個運算元也行', () => {
    expect(sameFormula(['(', '6', '+', '18', ')', '+', '2'], ['6', '+', '(', '18', '+', '2', ')'])).toBe(true);
    expect(sameFormula(['(', '2', '×', '3', ')', '×', '4'], ['2', '×', '(', '3', '×', '4', ')'])).toBe(true);
    expect(sameFormula(['1', '+', '2', '+', '3', '+', '4'], ['(', '4', '+', '2', ')', '+', '(', '3', '+', '1', ')'])).toBe(true);
  });

  it('+ 和 × 混在一起不會亂攤平：2 + 3 × 4 不等於 (2 + 3) × 4，也不等於 2 × 3 + 4', () => {
    expect(sameFormula(['2', '+', '3', '×', '4'], ['(', '2', '+', '3', ')', '×', '4'])).toBe(false);
    expect(sameFormula(['2', '+', '3', '×', '4'], ['2', '×', '3', '+', '4'])).toBe(false);
    expect(sameFormula(['2', '+', '3', '×', '4'], ['4', '×', '3', '+', '2'])).toBe(true);
  });

  it('− 和 ÷ 不能結合：8 − 3 − 2 不等於 8 − (3 − 2)；8 ÷ 4 ÷ 2 不等於 8 ÷ (4 ÷ 2)', () => {
    expect(sameFormula(['8', M, '3', M, '2'], ['8', M, '(', '3', M, '2', ')'])).toBe(false);
    expect(sameFormula(['8', '÷', '4', '÷', '2'], ['8', '÷', '(', '4', '÷', '2', ')'])).toBe(false);
  });

  it('運算符號不同、數字不同都不算同一個算式：20 ÷ 20 vs 20 × 20、(6 + 18) ÷ 2 vs (6 + 18) ÷ 3', () => {
    expect(sameFormula(['20', '÷', '20'], ['20', '×', '20'])).toBe(false);
    expect(sameFormula(['(', '6', '+', '18', ')', '÷', '2'], ['(', '6', '+', '18', ')', '÷', '3'])).toBe(false);
  });

  it('不合法的拼法（任何一邊）都不算相同，連兩邊都不合法也不算', () => {
    expect(sameFormula(['6', '+'], ['6', '+'])).toBe(false);
    expect(sameFormula(['6', '+'], ['6'])).toBe(false);
    expect(sameFormula([], [])).toBe(false);
  });
});

describe('parseFormula / evaluateFormula 遇到不合法的拼法', () => {
  it.each([
    [[]],
    [['+', '÷', '2']], // 算符開頭
    [['(', '6', '+', '18']], // 括號沒關
    [['6', '18']], // 兩個數字連在一起
    [['÷']],
    [['6', '+']], // 算符結尾
    [['6', '+', '×', '2']], // 兩個算符連在一起
    [['(', ')']], // 空括號
    [['(', '6', '+', '18', ')', ')']], // 多一個右括號
    [[')', '6', '(']],
    [['6', '(', '2', ')']], // 數字直接接括號（不能省略乘號）
    [['(', '6', ')', '(', '2', ')']],
    [[M, '5']], // 負數不是磚塊
    [['6', '-', '2']], // 半形減號不是磚塊
    [['6', '*', '2']],
    [['abc']],
    [['6', '+', '']],
  ])('不合法的拼法回傳 null、不拋出：%j', (t) => {
    expect(parseFormula(t)).toBeNull();
    expect(evaluateFormula(t)).toBeNull();
  });

  it('除以零的拼法算不出數字，回傳 null（包含在括號裡的除以零）', () => {
    expect(evaluateFormula(['5', '÷', '0'])).toBeNull();
    expect(evaluateFormula(['5', '÷', '(', '3', M, '3', ')'])).toBeNull();
    expect(evaluateFormula(['0', '×', '(', '1', '÷', '0', ')'])).toBeNull();
    expect(parseFormula(['5', '÷', '0'])).not.toBeNull(); // 拼法本身是合法的
  });
});

describe('evaluateFormula', () => {
  it('(10 + 0) ÷ 2 × 5 = 25；20 ÷ 20 = 1', () => {
    expect(evaluateFormula(['(', '10', '+', '0', ')', '÷', '2', '×', '5'])).toBe(25);
    expect(evaluateFormula(['20', '÷', '20'])).toBe(1);
  });

  it('先乘除後加減：6 + 18 ÷ 2 = 15；(6 + 18) ÷ 2 = 12', () => {
    expect(evaluateFormula(['6', '+', '18', '÷', '2'])).toBe(15);
    expect(evaluateFormula(['(', '6', '+', '18', ')', '÷', '2'])).toBe(12);
  });

  it('同級由左到右：8 − 3 − 2 = 3；8 ÷ 4 ÷ 2 = 1；2 + 3 × 4 − 5 = 9', () => {
    expect(evaluateFormula(['8', M, '3', M, '2'])).toBe(3);
    expect(evaluateFormula(['8', '÷', '4', '÷', '2'])).toBe(1);
    expect(evaluateFormula(['2', '+', '3', '×', '4', M, '5'])).toBe(9);
  });

  it('括號可以巢狀、單獨一個數字也是算式；(18 − 0) ÷ 6 = 3', () => {
    expect(evaluateFormula(['(', '18', M, '0', ')', '÷', '6'])).toBe(3);
    expect(evaluateFormula(['(', '(', '2', '+', '3', ')', '×', '4', ')', M, '1'])).toBe(19);
    expect(evaluateFormula(['7'])).toBe(7);
  });

  it('小數磚塊：0.5 × 4 = 2', () => expect(evaluateFormula(['0.5', '×', '4'])).toBe(2));
});

describe('checkFormula', () => {
  // 取自 spec 的 1-5 `bus-slide`
  const step: FormulaStep = {
    kind: 'formula',
    id: 'bus-slide',
    prompt: '',
    tiles: ['10', '0', '2', '5', '+', M, '×', '÷', '(', ')'],
    accepted: [['(', '10', '+', '0', ')', '÷', '2', '×', '5']],
    wrongForms: [
      { tokens: ['(', '10', M, '0', ')', '÷', '2', '×', '5'], feedback: '末速度是 0，要用「一開始 + 最後」，不是相減' },
      { tokens: ['(', '0', '+', '18', ')', '÷', '6'], feedback: '少了一半' },
      { tokens: ['10', '×', '5'], feedback: '10 是開始的速度，滑行中會越來越慢，要用平均速度' },
    ],
    answer: 25,
    explanation: '',
  };

  it('可接受的寫法 → 對', () => expect(checkFormula(step, ['(', '10', '+', '0', ')', '÷', '2', '×', '5'])).toEqual({ correct: true }));

  it('+ 兩側對調也算對：(0 + 10) ÷ 2 × 5', () =>
    expect(checkFormula(step, ['(', '0', '+', '10', ')', '÷', '2', '×', '5'])).toEqual({ correct: true }));

  it('accepted 有多個寫法時，符合任何一個都對', () => {
    const many: FormulaStep = { ...step, accepted: [...step.accepted, ['5', '×', '(', '10', '+', '0', ')', '÷', '2']] };
    expect(checkFormula(many, ['5', '×', '(', '0', '+', '10', ')', '÷', '2'])).toEqual({ correct: true });
  });

  it('認得的錯誤算式 → 答錯，給對應的回饋（算出來的數字和正確答案一樣也不算對）', () => {
    expect(evaluateFormula(step.wrongForms![0].tokens)).toBe(step.answer);
    expect(checkFormula(step, ['(', '10', M, '0', ')', '÷', '2', '×', '5'])).toStrictEqual({
      correct: false,
      feedback: '末速度是 0，要用「一開始 + 最後」，不是相減',
    });
    expect(checkFormula(step, ['10', '×', '5'])).toStrictEqual({
      correct: false,
      feedback: '10 是開始的速度，滑行中會越來越慢，要用平均速度',
    });
  });

  it('錯誤算式也允許 + 對調：(18 + 0) ÷ 6 對到 (0 + 18) ÷ 6 的回饋', () =>
    expect(checkFormula(step, ['(', '18', '+', '0', ')', '÷', '6'])).toStrictEqual({ correct: false, feedback: '少了一半' }));

  it('不認得的錯誤算式 → 答錯，沒有回饋', () => {
    expect(checkFormula(step, ['(', '10', '+', '0', ')', '÷', '2'])).toStrictEqual({ correct: false });
    expect(checkFormula(step, ['10', '+', '0', '÷', '2', '×', '5'])).toStrictEqual({ correct: false });
  });

  it('沒有列 wrongForms 的題目：答錯就是沒有回饋', () => {
    const { wrongForms: _unused, ...bare } = step;
    expect(checkFormula(bare, ['10', '×', '5'])).toStrictEqual({ correct: false });
  });

  it('不合法的拼法是答錯、沒有回饋（空的、括號沒關、算符結尾、兩個數字連在一起）', () => {
    for (const tokens of [[], ['(', '10', '+', '0', ')', '÷', '2', '×'], ['(', '10', '+', '0', '÷', '2'], ['10', '5']]) {
      expect(checkFormula(step, tokens)).toStrictEqual({ correct: false });
    }
  });

  it('不合法的拼法不會因為「碰巧」等於某個寫法而過關：accepted 裡寫壞的算式不會配到任何東西', () => {
    const broken: FormulaStep = { ...step, accepted: [['6', '+']], wrongForms: [{ tokens: ['6', '+'], feedback: '不該出現' }] };
    expect(checkFormula(broken, ['6', '+'])).toStrictEqual({ correct: false });
  });
});
