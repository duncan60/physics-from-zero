import type { ChoiceStep, NumberStep, TableStep } from './types';

export type CheckResult = { correct: true } | { correct: false; feedback?: string };

const DEFAULT_TOLERANCE = 1e-9;

/** 把全形數字、句點、正負號轉成半形（U+2212「−」也視為負號）。 */
function toHalfWidth(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/．/g, '.')
    .replace(/＋/g, '+')
    .replace(/[－−]/g, '-');
}

/** 解析使用者輸入的數字；無法解析時回傳 null。 */
export function parseNumberInput(raw: string): number | null {
  const text = toHalfWidth(raw).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function isClose(value: number, answer: number, tolerance: number = DEFAULT_TOLERANCE): boolean {
  return Math.abs(value - answer) <= tolerance;
}

export function checkChoice(step: ChoiceStep, optionId: string): CheckResult {
  if (optionId === step.answer) return { correct: true };
  const feedback = step.options.find((option) => option.id === optionId)?.feedback;
  return feedback === undefined ? { correct: false } : { correct: false, feedback };
}

export function checkNumber(step: NumberStep, raw: string): CheckResult | 'invalid' {
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
      blanks.push({ row: rowIndex, col: colIndex, answer: cell.answer, tolerance: cell.tolerance ?? DEFAULT_TOLERANCE });
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
