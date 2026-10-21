import type { ChoiceStep, NumberStep, TableStep } from './types';

export type CheckResult = { correct: true } | { correct: false; feedback?: string };

// 浮點誤差的緩衝：避免 |9.6 - 9.8| 算成 0.20000000000000107 而在邊界上被判錯。
const EPSILON = 1e-9;

/** 把全形數字、句點、正負號、斜線轉成半形（U+2212「−」也視為負號）。 */
function toHalfWidth(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/．/g, '.')
    .replace(/＋/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/／/g, '/');
}

const UNSIGNED_NUMBER = String.raw`\d+(?:\.\d+)?`;
// 正負號只寫在最前面（整個數字或整個分數）；分數是兩個不帶正負號的數字，中間一條斜線（兩側可以有空白）。
const NUMBER_OR_FRACTION = new RegExp(String.raw`^([+-]?)(${UNSIGNED_NUMBER})(?:\s*/\s*(${UNSIGNED_NUMBER}))?$`);

/**
 * 解析使用者輸入的數字；無法解析時回傳 null。
 * 接受整數、小數（全形也可以），以及簡單的分數 a/b（例如「1/2」「−１／２」「0.5/2」），值是 a ÷ b。
 * 分母是 0 算不出數字，也是 null。
 */
export function parseNumberInput(raw: string): number | null {
  const match = NUMBER_OR_FRACTION.exec(toHalfWidth(raw).trim());
  if (match === null) return null;
  const [, sign, numerator, denominator] = match;
  let magnitude = Number(numerator);
  if (denominator !== undefined) {
    const divisor = Number(denominator);
    if (divisor === 0) return null;
    magnitude /= divisor;
  }
  return sign === '-' ? -magnitude : magnitude;
}

/**
 * 數字後面多打了單位（例如「10公尺」「2 m/s」）。parseNumberInput 不接受這種輸入，
 * 這時要告訴學習者「只要填數字」，而不是「請先輸入數字」（他明明打了數字）。
 * 不直接把單位去掉當作答對：打錯單位（速度題打「10秒」）也會被當成對的。
 * 只有數字後面出現文字或度數符號才算；「1,000」「1/0」這類看起來像數字的輸入不算，
 * 分數「1/2」也不算（斜線不是單位；它本來就能作答，「1/2 公尺」才是多打了單位）。
 */
export function hasUnitAfterNumber(raw: string): boolean {
  const match = /^[+-]?\d+(\.\d+)?\s*(.+)$/.exec(toHalfWidth(raw).trim());
  return match !== null && /[\p{L}°℃]/u.test(match[2]);
}

export function isClose(value: number, answer: number, tolerance = 0): boolean {
  return Math.abs(value - answer) <= tolerance + EPSILON;
}

export function checkChoice(step: ChoiceStep, optionId: string): CheckResult {
  if (optionId === step.answer) return { correct: true };
  const feedback = step.options.find((option) => option.id === optionId)?.feedback;
  return feedback === undefined ? { correct: false } : { correct: false, feedback };
}

/** 拼算式的第 2 步也用這個判斷，所以只要求數字題判斷會用到的欄位（FormulaStep 也有）。 */
export function checkNumber(step: Pick<NumberStep, 'answer' | 'tolerance' | 'wrongAnswers'>, raw: string): CheckResult | 'invalid' {
  const value = parseNumberInput(raw);
  if (value === null) return 'invalid';
  if (isClose(value, step.answer, step.tolerance)) return { correct: true };
  const known = step.wrongAnswers?.find((wrong) => isClose(value, wrong.value));
  return known ? { correct: false, feedback: known.feedback } : { correct: false };
}

/** 表格中需要填寫的空格，以列為主的順序。 */
export function blankCells(step: TableStep): { row: number; col: number; answer: number; tolerance: number }[] {
  const blanks: { row: number; col: number; answer: number; tolerance: number }[] = [];
  step.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, colIndex) => {
      if (typeof cell === 'string') return;
      blanks.push({ row: rowIndex, col: colIndex, answer: cell.answer, tolerance: cell.tolerance ?? 0 });
    });
  });
  return blanks;
}

/**
 * `raws` 依 `blankCells` 的順序，一格一個輸入。
 * 任何一格空白、無法解析，或數量與空格數不符，都回傳 'invalid'。
 */
export function checkTable(step: TableStep, raws: string[]): { result: CheckResult; cellCorrect: boolean[] } | 'invalid' {
  const blanks = blankCells(step);
  if (raws.length !== blanks.length) return 'invalid';
  const cellCorrect: boolean[] = [];
  for (const [i, blank] of blanks.entries()) {
    const value = parseNumberInput(raws[i]);
    if (value === null) return 'invalid';
    cellCorrect.push(isClose(value, blank.answer, blank.tolerance));
  }
  const result: CheckResult = cellCorrect.every(Boolean) ? { correct: true } : { correct: false };
  return { result, cellCorrect };
}
