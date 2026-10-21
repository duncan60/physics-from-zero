import { describe, expect, it } from 'vitest';
import { blankCells, checkChoice, checkNumber, checkTable, hasUnitAfterNumber, parseNumberInput } from './answer';
import type { ChoiceStep, NumberStep, TableStep } from './types';

describe('parseNumberInput', () => {
  it.each([
    ['18', 18], [' 18 ', 18], ['１８', 18], ['-2', -2], ['－2', -2], ['−2', -2], ['+3', 3], ['2.5', 2.5], ['０．５', 0.5],
  ])('%s → %s', (raw, n) => expect(parseNumberInput(raw)).toBe(n));
  it.each(['', '  ', 'abc', '1,000', '--2', '2-'])('無法解析：%s', (raw) => expect(parseNumberInput(raw)).toBeNull());

  // 簡單的分數 a/b：a、b 都是一般的數字寫法（整數或小數、全形也可以），正負號寫在整個分數前面，值是 a ÷ b。
  it.each([
    ['1/2', 0.5], ['3/4', 0.75], ['0.5/2', 0.25], ['1/0.5', 2], ['10/4', 2.5],
    ['−1/2', -0.5], ['-1/2', -0.5], ['－1/2', -0.5], ['+1/2', 0.5],
    ['１／２', 0.5], ['−１／２', -0.5], ['３／４', 0.75], ['０．５／２', 0.25], [' 1/2 ', 0.5], ['1 / 2', 0.5], ['1／ 2', 0.5],
  ])('分數 %s → %s', (raw, n) => expect(parseNumberInput(raw)).toBe(n));
  it('分數的值是 a ÷ b（1/3 不是 0.33）', () => expect(parseNumberInput('1/3')).toBeCloseTo(1 / 3, 12));
  it.each([
    '1/0', '1/0.0', '1/00', '−1/0', // 除以 0 算不出數字
    '1/', '/2', '/', '1//2', '1/2/3', '1／／2', '1/ /2', // 只能有一條斜線，兩邊都要有數字
    '1/-2', '1/+2', '1/−2', '-1/-2', '1/ -2', // 正負號只能寫在整個分數前面
    '1.5.2/3', '1/2.', '1,000/2', '1/2公尺', 'a/2', '1/b', '(1/2)', '1 2/3', '1/2 3',
  ])('分數無法解析：%s', (raw) => expect(parseNumberInput(raw)).toBeNull());
});

describe('parseNumberInput：不接受分數（拼算式的第 2 步，要自己算出答案）', () => {
  const NO_FRACTION = { allowFraction: false };
  it.each(['18/6', '1/2', '１８／６', '−1/2', '0.5/2', '1 / 2'])('分數不算數字：%s', (raw) => expect(parseNumberInput(raw, NO_FRACTION)).toBeNull());
  it.each([['3', 3], [' 18 ', 18], ['１８', 18], ['-2', -2], ['−2', -2], ['+3', 3], ['2.5', 2.5], ['０．５', 0.5]])('一般的數字照常：%s → %s', (raw, n) =>
    expect(parseNumberInput(raw, NO_FRACTION)).toBe(n));
  it('預設（沒給選項、或 allowFraction: true）仍然接受分數', () => {
    expect(parseNumberInput('1/2')).toBe(0.5);
    expect(parseNumberInput('1/2', {})).toBe(0.5);
    expect(parseNumberInput('1/2', { allowFraction: true })).toBe(0.5);
  });
});

describe('hasUnitAfterNumber（數字後面多打了單位）', () => {
  it.each(['10公尺', '10 公尺', '2 m/s', '-10 公尺/秒', '−2m/s²', '１０公尺', '3 秒後', '9.8m/s2', '10.公尺', '25°', '25 ℃'])('算：%s', (raw) =>
    expect(hasUnitAfterNumber(raw)).toBe(true),
  );
  // 千分位這類「看起來像數字」的輸入不算：提示「不用寫單位」反而會讓人更困惑。分數（1/2、１／２）也一樣：斜線不是單位。
  it.each(['', '10', ' 10 ', '-2', 'abc', '公尺', '公尺 10', '1,000', '2/3', '2-', '--2', '2.5.3', '1/2', '−1/2', '１／２', '0.5/2', '1/0', '1/', '/2', '1//2', '1/2/3'])(
    '不算：%s',
    (raw) => expect(hasUnitAfterNumber(raw)).toBe(false),
  );
  it('分數後面多打了單位（1/2 公尺）算：這時 parseNumberInput 不接受，要提示只要填數字', () => {
    expect(hasUnitAfterNumber('1/2 公尺')).toBe(true);
    expect(hasUnitAfterNumber('１／２m')).toBe(true);
    expect(parseNumberInput('1/2 公尺')).toBeNull();
  });
  it('多打了單位的輸入，parseNumberInput 仍然不接受（單位對不對交給學習者自己看）', () => expect(parseNumberInput('10公尺')).toBeNull());
});

describe('checkNumber', () => {
  const step: NumberStep = { kind: 'number', id: 'q', prompt: '', answer: 3, explanation: '', wrongAnswers: [{ value: 6, feedback: '用了相加' }] };
  it('答對', () => expect(checkNumber(step, '３')).toEqual({ correct: true }));
  it('已知錯誤給對應回饋', () => expect(checkNumber(step, '6')).toEqual({ correct: false, feedback: '用了相加' }));
  it('其他錯誤沒有回饋', () => expect(checkNumber(step, '5')).toEqual({ correct: false }));
  it('空白或無法解析的輸入回傳 invalid', () => expect(checkNumber(step, '')).toBe('invalid'));
  it('容許誤差', () => expect(checkNumber({ ...step, answer: 9.8, tolerance: 0.2 }, '10')).toEqual({ correct: true }));
  it('分數也能作答：6/2 = 3；1/3 在容許誤差內算對', () => {
    expect(checkNumber(step, '6/2')).toEqual({ correct: true });
    expect(checkNumber(step, '６／２')).toEqual({ correct: true });
    expect(checkNumber({ ...step, answer: 0.33, tolerance: 0.01 }, '1/3')).toEqual({ correct: true });
    expect(checkNumber({ ...step, answer: 0.5, wrongAnswers: [] }, '1/0')).toBe('invalid');
  });
  it('allowFraction: false：18/6 不算數字（invalid），不能跳過計算；3 和 3.0 照常算對，其他仍然判錯', () => {
    const answer18 = { ...step, answer: 3, wrongAnswers: [{ value: 6, feedback: '用了相加' }] };
    const NO_FRACTION = { allowFraction: false };
    expect(checkNumber(answer18, '18/6', NO_FRACTION)).toBe('invalid');
    expect(checkNumber(answer18, '１８／６', NO_FRACTION)).toBe('invalid');
    expect(checkNumber(answer18, '3', NO_FRACTION)).toEqual({ correct: true });
    expect(checkNumber(answer18, '3.0', NO_FRACTION)).toEqual({ correct: true });
    expect(checkNumber(answer18, '6', NO_FRACTION)).toEqual({ correct: false, feedback: '用了相加' });
    expect(checkNumber(answer18, '5', NO_FRACTION)).toEqual({ correct: false });
    expect(checkNumber(answer18, '18/6')).toEqual({ correct: true }); // 沒給選項：數字題照舊接受分數
  });
  it('容許誤差的兩端都算對（1 ± 0.1）', () => {
    const s = { ...step, answer: 1, tolerance: 0.1 };
    expect(checkNumber(s, '0.9')).toEqual({ correct: true });
    expect(checkNumber(s, '1.1')).toEqual({ correct: true });
  });
  it('容許誤差的兩端都算對（9.8 ± 0.2），超出就錯', () => {
    const s = { ...step, answer: 9.8, tolerance: 0.2 };
    expect(checkNumber(s, '9.6')).toEqual({ correct: true });
    expect(checkNumber(s, '10')).toEqual({ correct: true });
    expect(checkNumber(s, '9.5')).toEqual({ correct: false });
  });
});

describe('checkChoice', () => {
  const step: ChoiceStep = { kind: 'choice', id: 'q', prompt: '', answer: 'c', explanation: '', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', feedback: '推理對了，最後一步再看一次' }, { id: 'c', label: 'C' }] };
  it('答對', () => expect(checkChoice(step, 'c')).toEqual({ correct: true }));
  it('錯誤選項的回饋', () => expect(checkChoice(step, 'b')).toEqual({ correct: false, feedback: '推理對了，最後一步再看一次' }));
});

describe('checkTable', () => {
  const step: TableStep = { kind: 'table', id: 't', prompt: '', explanation: '', columns: ['0 秒', '1 秒', '2 秒'], rows: [{ label: '速度', cells: ['10', { answer: 8 }, { answer: 6 }] }] };
  it('列出空格', () => expect(blankCells(step).map((c) => c.col)).toEqual([1, 2]));
  it('全對', () => expect(checkTable(step, ['8', '6'])).toEqual({ result: { correct: true }, cellCorrect: [true, true] }));
  it('表格空格的容許誤差兩端都算對', () => {
    const tol: TableStep = { ...step, rows: [{ label: '速度', cells: [{ answer: 4.8, tolerance: 0.1 }] }], columns: ['1 秒'] };
    expect(checkTable(tol, ['4.9'])).toEqual({ result: { correct: true }, cellCorrect: [true] });
    expect(checkTable(tol, ['4.7'])).toEqual({ result: { correct: true }, cellCorrect: [true] });
  });
  it('部分錯', () => expect(checkTable(step, ['6', '6'])).toEqual({ result: { correct: false }, cellCorrect: [false, true] }));
  it('有空格沒填就是 invalid', () => expect(checkTable(step, ['8', ''])).toBe('invalid'));
});
