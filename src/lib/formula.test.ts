import { describe, expect, it } from 'vitest';
import { acceptedNote, checkFormula, evaluateFormula, formulaTiles, parseFormula, sameFormula, splitTileToken, tileToken } from './formula';
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

describe('acceptedNote（算對、但寫法省略了什麼時的提醒）', () => {
  const informal = ['10', '÷', '2', '×', '5'];
  const step: FormulaStep = {
    kind: 'formula',
    id: 'bus-slide',
    prompt: '',
    tiles: ['10', '0', '2', '5', '+', M, '×', '÷', '(', ')'],
    accepted: [['(', '10', '+', '0', ')', '÷', '2', '×', '5'], informal],
    acceptedNotes: [{ tokens: informal, note: '正式寫法是 (10 + 0) ÷ 2 × 5' }],
    answer: 25,
    explanation: '',
  };

  it('算對、而且是列了提醒的寫法 → 回傳那則提醒', () => expect(acceptedNote(step, informal)).toBe('正式寫法是 (10 + 0) ÷ 2 × 5'));

  it('正式寫法（accepted 的第一個）沒有提醒', () =>
    expect(acceptedNote(step, ['(', '10', '+', '0', ')', '÷', '2', '×', '5'])).toBeNull());

  it('提醒也用 sameFormula 比對：× 兩邊對調、多餘的括號都一樣', () => {
    const swapped: FormulaStep = { ...step, accepted: [...step.accepted, ['5', '×', '10', '÷', '2']], acceptedNotes: [{ tokens: ['5', '×', '10', '÷', '2'], note: '提醒' }] };
    expect(acceptedNote(swapped, ['10', '×', '5', '÷', '2'])).toBe('提醒');
    expect(acceptedNote(swapped, ['(', '5', '×', '10', ')', '÷', '2'])).toBe('提醒');
  });

  it('沒有算對的算式不會有提醒：就算 acceptedNotes 列了它（內容寫壞了，也不能因此變成「答對了」）', () => {
    const wrong = ['10', '×', '5'];
    const broken: FormulaStep = { ...step, acceptedNotes: [{ tokens: wrong, note: '不該出現' }] };
    expect(checkFormula(broken, wrong)).toStrictEqual({ correct: false });
    expect(acceptedNote(broken, wrong)).toBeNull();
  });

  it('不合法的拼法、空的拼法都沒有提醒', () => {
    for (const tokens of [[], ['10', '÷', '2', '×'], ['10', '5']]) expect(acceptedNote(step, tokens)).toBeNull();
  });

  it('沒有列 acceptedNotes 的題目：沒有提醒，算對的結果也不變', () => {
    const { acceptedNotes: _unused, ...bare } = step;
    expect(acceptedNote(bare, informal)).toBeNull();
    expect(checkFormula(bare, informal)).toEqual({ correct: true });
  });

  it('有提醒的寫法一樣算對、不帶回饋（只是多一則提醒，不改變對錯）', () => expect(checkFormula(step, informal)).toStrictEqual({ correct: true }));
});

// ---- 有標示的磚塊：算式裡寫成「數值|標示」，照用途判斷，不只看數值 ----

describe('有標示的磚塊（數值|標示）', () => {
  it('tileToken：有標示時是「數值|標示」，沒有標示（或標示是空白）就是數值', () => {
    expect(tileToken('20', '力')).toBe('20|力');
    expect(tileToken('1.6', '月球 g')).toBe('1.6|月球 g');
    expect(tileToken('20', undefined)).toBe('20');
    expect(tileToken('20', ' ')).toBe('20');
    expect(tileToken('÷', undefined)).toBe('÷');
  });

  it('splitTileToken：拆回數值和標示；沒有標示時 label 是 undefined', () => {
    expect(splitTileToken('20|力')).toEqual({ value: '20', label: '力' });
    expect(splitTileToken('1.6|月球 g')).toEqual({ value: '1.6', label: '月球 g' });
    expect(splitTileToken('20')).toEqual({ value: '20', label: undefined });
    expect(splitTileToken('÷')).toEqual({ value: '÷', label: undefined });
  });

  it('formulaTiles：每一塊磚在算式裡的寫法（有標示的帶標示），依 tiles 的順序', () => {
    expect(formulaTiles({ tiles: ['10', '20', '20', '÷'], tileLabels: ['空車質量', '力', '質量', undefined] })).toEqual(['10|空車質量', '20|力', '20|質量', '÷']);
    expect(formulaTiles({ tiles: ['10', '20', '÷'] })).toEqual(['10', '20', '÷']);
  });

  it('parseFormula / evaluateFormula：「數值|標示」當作那個數字', () => {
    expect(evaluateFormula(['20|力', '÷', '20|質量'])).toBe(1);
    expect(evaluateFormula(['1|質量', '×', '1.6|月球 g'])).toBe(1.6);
    expect(evaluateFormula(['(', '6000|質量', '+', '2', ')', '×', '10|地球 g'])).toBe(60020);
  });

  it.each([[['20|']], [['|力']], [['÷|力']], [['(|先算', '6', ')']], [['abc|力']], [['20|力|質量']]])('不合法的「數值|標示」回傳 null：%j', (t) => {
    expect(parseFormula(t)).toBeNull();
    expect(evaluateFormula(t)).toBeNull();
  });

  it('sameFormula：同一塊磚（同樣的標示）在 + × 兩邊對調還是同一個算式；標示不同就不是', () => {
    expect(sameFormula(['20|力', '×', '2'], ['2', '×', '20|力'])).toBe(true);
    expect(sameFormula(['20|力', '×', '20|質量'], ['20|質量', '×', '20|力'])).toBe(true);
    expect(sameFormula(['20|力', '÷', '20|質量'], ['20|質量', '÷', '20|力'])).toBe(false);
    expect(sameFormula(['20|力'], ['20|質量'])).toBe(false);
    expect(sameFormula(['20|力'], ['20'])).toBe(false);
  });

  // 兩塊 20：一塊是力、一塊是質量。數值一樣，但用途不同。
  const labelled: FormulaStep = {
    kind: 'formula',
    id: 'cart',
    prompt: '',
    tiles: ['10', '20', '20', '×', '÷'],
    tileLabels: ['空車質量', '力', '質量', undefined, undefined],
    accepted: [['20|力', '÷', '20|質量']],
    wrongForms: [
      { tokens: ['20|質量', '÷', '20|力'], feedback: '順序反了：a = F ÷ m。' },
      { tokens: ['20|力', '×', '20|質量'], feedback: '要用除的。' },
    ],
    answer: 1,
    explanation: '',
  };

  it('checkFormula：力 ÷ 質量算對；質量 ÷ 力算出來碰巧一樣也是錯的，給那則回饋', () => {
    expect(checkFormula(labelled, ['20|力', '÷', '20|質量'])).toEqual({ correct: true });
    expect(checkFormula(labelled, ['20|質量', '÷', '20|力'])).toEqual({ correct: false, feedback: '順序反了：a = F ÷ m。' });
    expect(checkFormula(labelled, ['20|質量', '×', '20|力'])).toEqual({ correct: false, feedback: '要用除的。' }); // × 可以對調
    expect(checkFormula(labelled, ['20|力', '÷', '10|空車質量'])).toEqual({ correct: false });
  });

  it('沒有標示的題目照舊：兩塊 20 分不出來，20 ÷ 20 怎麼放都算對', () => {
    const bare: FormulaStep = { ...labelled, tileLabels: undefined, accepted: [['20', '÷', '20']], wrongForms: [] };
    expect(checkFormula(bare, ['20', '÷', '20'])).toEqual({ correct: true });
    expect(formulaTiles(bare)).toEqual(bare.tiles);
  });
});
