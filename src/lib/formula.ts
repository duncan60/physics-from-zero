import type { CheckResult } from './answer';
import type { FormulaStep } from './types';

export type FormulaOp = '+' | '−' | '×' | '÷'; // 減號是 U+2212，和磚塊上的一樣
export type FormulaNode =
  | { type: 'num'; text: string; value: number }
  | { type: 'op'; op: FormulaOp; left: FormulaNode; right: FormulaNode };

const NUMBER = /^[0-9]+(\.[0-9]+)?$/;

/**
 * 有標示的磚塊（FormulaStep.tileLabels）在算式裡寫成「數值|標示」，例如兩塊 20 是 '20|力' 和 '20|滿車質量'。
 * 算值的時候當作那個數字；比對算式的時候連標示一起比，所以判斷的是「用了哪一塊」，不只是數值：
 * 20|滿車質量 ÷ 20|力 算出來碰巧也是 1，但和 20|力 ÷ 20|滿車質量 不是同一個算式。沒有標示的磚塊照舊只寫數值。
 */
const LABEL_SEPARATOR = '|';

/** 標示有沒有內容（undefined 和空白都當作沒有標示）。 */
export function hasTileLabel(label: string | undefined): label is string {
  return label !== undefined && label.trim() !== '';
}

/** 一塊磚在算式裡的寫法：有標示是「數值|標示」，沒有就是數值（或符號）本身。 */
export function tileToken(value: string, label: string | undefined): string {
  return hasTileLabel(label) ? `${value}${LABEL_SEPARATOR}${label}` : value;
}

/** tileToken 的反向：拆回數值和標示，沒有標示時 label 是 undefined。 */
export function splitTileToken(token: string): { value: string; label: string | undefined } {
  const at = token.indexOf(LABEL_SEPARATOR);
  return at === -1 ? { value: token, label: undefined } : { value: token.slice(0, at), label: token.slice(at + 1) };
}

/** 題目每一塊磚在算式裡的寫法，依 tiles 的順序（答案列上放的是 tiles 的索引，用這個換成算式）。 */
export function formulaTiles(step: Pick<FormulaStep, 'tiles' | 'tileLabels'>): string[] {
  return step.tiles.map((value, i) => tileToken(value, step.tileLabels?.[i]));
}

/** 數字磚塊（可以帶標示）的數值；不是數字磚塊時回傳 null。 */
function numberValue(token: string): number | null {
  const { value, label } = splitTileToken(token);
  if (!NUMBER.test(value)) return null;
  if (label !== undefined && (label.trim() === '' || label.includes(LABEL_SEPARATOR))) return null;
  return Number(value);
}

function isAdditive(token: string | undefined): token is '+' | '−' {
  return token === '+' || token === '−';
}

function isMultiplicative(token: string | undefined): token is '×' | '÷' {
  return token === '×' || token === '÷';
}

/**
 * 把磚塊序列解析成運算樹。`×` `÷` 比 `+` `−` 先算，同級由左到右，支援括號。
 *   expression := term (('+' | '−') term)*
 *   term       := factor (('×' | '÷') factor)*
 *   factor     := 數字 | '(' expression ')'
 * 空的、算符開頭或結尾、兩個算符或兩個數字連在一起、括號沒配好，都回傳 null（不拋出）。
 * 只認磚塊上的符號：半形的 '-'、'*'、'/' 和負數都不合法。數字可以帶標示（「20|力」，見 tileToken），符號不行。
 */
export function parseFormula(tokens: string[]): FormulaNode | null {
  let pos = 0;

  function factor(): FormulaNode | null {
    const token = tokens[pos];
    if (token === undefined) return null;
    if (token === '(') {
      pos += 1;
      const inner = expression();
      if (inner === null || tokens[pos] !== ')') return null;
      pos += 1;
      return inner;
    }
    const value = numberValue(token);
    if (value === null) return null;
    pos += 1;
    return { type: 'num', text: token, value }; // text 保留標示：比對算式時分得出是哪一塊
  }

  function term(): FormulaNode | null {
    let left = factor();
    while (left !== null) {
      const op = tokens[pos];
      if (!isMultiplicative(op)) break;
      pos += 1;
      const right = factor();
      if (right === null) return null;
      left = { type: 'op', op, left, right };
    }
    return left;
  }

  function expression(): FormulaNode | null {
    let left = term();
    while (left !== null) {
      const op = tokens[pos];
      if (!isAdditive(op)) break;
      pos += 1;
      const right = term();
      if (right === null) return null;
      left = { type: 'op', op, left, right };
    }
    return left;
  }

  const root = expression();
  return root !== null && pos === tokens.length ? root : null;
}

function evaluate(node: FormulaNode): number | null {
  if (node.type === 'num') return node.value;
  const left = evaluate(node.left);
  const right = evaluate(node.right);
  if (left === null || right === null) return null;
  switch (node.op) {
    case '+':
      return left + right;
    case '−':
      return left - right;
    case '×':
      return left * right;
    case '÷':
      return right === 0 ? null : left / right; // 除以零算不出數字
  }
}

/** 算式的值。拼法不合法、或中途除以零時回傳 null。 */
export function evaluateFormula(tokens: string[]): number | null {
  const root = parseFormula(tokens);
  return root === null ? null : evaluate(root);
}

/** 連續的 `+`（或連續的 `×`）攤平成一串運算元，因為 (a + b) + c 與 a + (b + c) 是同一件事。 */
function operands(node: FormulaNode, op: '+' | '×'): FormulaNode[] {
  return node.type === 'op' && node.op === op ? [...operands(node.left, op), ...operands(node.right, op)] : [node];
}

/**
 * 正規化成字串，運算樹相同才會得到相同的字串。只有 `+` 和 `×` 會被正規化（攤平、運算元排序）；
 * `−` 和 `÷` 左右不能對調，所以保持原樣。括號只影響運算樹的形狀，多餘的括號不會留下痕跡。
 */
function normalize(node: FormulaNode): string {
  if (node.type === 'num') return node.text;
  if (node.op === '+' || node.op === '×') {
    return `(${node.op} ${operands(node, node.op).map(normalize).sort().join(' ')})`;
  }
  return `(${node.op} ${normalize(node.left)} ${normalize(node.right)})`;
}

/** 不合法的拼法回傳 null。 */
function formulaKey(tokens: string[]): string | null {
  const root = parseFormula(tokens);
  return root === null ? null : normalize(root);
}

/**
 * 兩個磚塊序列是不是「同一個算式」：運算樹相同，`+` 與 `×` 可以交換、結合，`−` 與 `÷` 不行。
 * 只是算出來的數字一樣不算：(10 − 0) ÷ 2 和 (10 + 0) ÷ 2 的值相同，但不是同一個算式。
 * 有標示的數字連標示一起比：20|力 和 20|質量 是不同的運算元。
 * 任何一邊不合法都是 false。
 */
export function sameFormula(a: string[], b: string[]): boolean {
  const keyA = formulaKey(a);
  return keyA !== null && keyA === formulaKey(b);
}

/**
 * 符合 `accepted` 任一寫法 → 對。否則看是不是 `wrongForms` 列出的已知錯誤算式，有就帶上那則回饋；
 * 不認得的錯誤算式、不合法的拼法，都是答錯、沒有回饋。
 */
export function checkFormula(step: FormulaStep, tokens: string[]): CheckResult {
  const key = formulaKey(tokens);
  if (key === null) return { correct: false };
  if (step.accepted.some((accepted) => formulaKey(accepted) === key)) return { correct: true };
  const known = step.wrongForms?.find((wrong) => formulaKey(wrong.tokens) === key);
  return known ? { correct: false, feedback: known.feedback } : { correct: false };
}

/**
 * 算對、而且是 `acceptedNotes` 列出的寫法（省略了什麼的非正式寫法）時，回傳那則提醒；其他情況都是 null。
 * 一樣用 `sameFormula` 比對，所以 × 兩邊對調、多餘的括號都算同一個寫法。
 * 提醒只是多一句話，不改變對錯：算對與否仍然只看 `checkFormula`；沒算對的算式就算列在 acceptedNotes 裡也不會有提醒。
 */
export function acceptedNote(step: FormulaStep, tokens: string[]): string | null {
  if (!checkFormula(step, tokens).correct) return null;
  return step.acceptedNotes?.find((entry) => sameFormula(tokens, entry.tokens))?.note ?? null;
}
