import { describe, expect, it } from 'vitest';
import { blankCells, checkChoice, checkNumber, checkTable, hasUnitAfterNumber, parseNumberInput } from './answer';
import type { ChoiceStep, NumberStep, TableStep } from './types';

describe('parseNumberInput', () => {
  it.each([
    ['18', 18], [' 18 ', 18], ['１８', 18], ['-2', -2], ['－2', -2], ['−2', -2], ['+3', 3], ['2.5', 2.5], ['０．５', 0.5],
  ])('%s → %s', (raw, n) => expect(parseNumberInput(raw)).toBe(n));
  it.each(['', '  ', 'abc', '1,000', '--2', '2-'])('無法解析：%s', (raw) => expect(parseNumberInput(raw)).toBeNull());
});

describe('hasUnitAfterNumber（數字後面多打了單位）', () => {
  it.each(['10公尺', '10 公尺', '2 m/s', '-10 公尺/秒', '−2m/s²', '１０公尺', '3 秒後', '9.8m/s2', '10.公尺', '25°', '25 ℃'])('算：%s', (raw) =>
    expect(hasUnitAfterNumber(raw)).toBe(true),
  );
  // 分數、千分位這類「看起來像數字」的輸入不算：提示「不用寫單位」反而會讓人更困惑。
  it.each(['', '10', ' 10 ', '-2', 'abc', '公尺', '公尺 10', '1,000', '2/3', '2-', '--2', '2.5.3'])('不算：%s', (raw) =>
    expect(hasUnitAfterNumber(raw)).toBe(false),
  );
  it('多打了單位的輸入，parseNumberInput 仍然不接受（單位對不對交給學習者自己看）', () => expect(parseNumberInput('10公尺')).toBeNull());
});

describe('checkNumber', () => {
  const step: NumberStep = { kind: 'number', id: 'q', prompt: '', answer: 3, explanation: '', wrongAnswers: [{ value: 6, feedback: '用了相加' }] };
  it('答對', () => expect(checkNumber(step, '３')).toEqual({ correct: true }));
  it('已知錯誤給對應回饋', () => expect(checkNumber(step, '6')).toEqual({ correct: false, feedback: '用了相加' }));
  it('其他錯誤沒有回饋', () => expect(checkNumber(step, '5')).toEqual({ correct: false }));
  it('空白或無法解析的輸入回傳 invalid', () => expect(checkNumber(step, '')).toBe('invalid'));
  it('容許誤差', () => expect(checkNumber({ ...step, answer: 9.8, tolerance: 0.2 }, '10')).toEqual({ correct: true }));
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
