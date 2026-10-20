import { describe, expect, it } from 'vitest';
import { blankCells } from '../lib/answer';
import { checkFormula, evaluateFormula, parseFormula, sameFormula } from '../lib/formula';
import { isLessonUnlocked } from '../lib/progress';
import { checkSlider } from '../lib/slider';
import type { ConceptStep, FormulaStep, GuideStep, Lesson, MatchStep, NumberStep, QuestionStep, SliderStep, Step } from '../lib/types';
import { findLesson, orderedLessonIds, stations } from './stations';

const lessons = stations.flatMap((s) => s.lessons);

/** 主步驟加上每個主步驟 guide 裡的步驟，依出現順序。 */
function withGuides(lesson: Lesson): (Step | GuideStep)[] {
  return lesson.steps.flatMap((s) => [s, ...('guide' in s && s.guide ? s.guide : [])]);
}

/** 要作答的步驟：QuestionCard 的題目，加上配對題。觀念卡和模擬不算。 */
type Answerable = QuestionStep | MatchStep;

// 新增一種步驟時，這裡少了 case 就會編譯失敗，不會漏掉檢查。
function isQuestion(s: Step | GuideStep): s is Answerable {
  switch (s.kind) {
    case 'choice':
    case 'number':
    case 'table':
    case 'formula':
    case 'slider':
    case 'match':
      return true;
    case 'concept':
    case 'sim':
      return false;
  }
}

function allQuestions(lesson: Lesson): Answerable[] {
  return withGuides(lesson).filter(isQuestion);
}

function allConcepts(lesson: Lesson): ConceptStep[] {
  return withGuides(lesson).filter((s): s is ConceptStep => s.kind === 'concept');
}

// 和 answer.ts 的判斷一致：在容許誤差（加上浮點緩衝）以內就算對。
const EPSILON = 1e-9;

/** 磚塊只能是數字或畫面上的符號；減號是 U+2212，不是半形的 '-'。 */
const TILE = /^([0-9]+(\.[0-9]+)?|[+−×÷()])$/;

/** 「空白隔開的算式」→ 磚塊序列，例如 '( 18 − 0 ) ÷ 6'。 */
const tokens = (formula: string): string[] => formula.split(' ');

/** `tokens` 裡有哪些磚塊是 `tiles` 給不出來的（每一塊磚只能用一次，所以要算數量）。 */
function missingTiles(tokens: string[], tiles: string[]): string[] {
  const left = [...tiles];
  const missing: string[] = [];
  for (const token of tokens) {
    const at = left.indexOf(token);
    if (at === -1) missing.push(token);
    else left.splice(at, 1);
  }
  return missing;
}

/** 數字題和拼算式第 2 步的已知錯誤答案，不能被判為正確。 */
function assertWrongAnswers(s: NumberStep | FormulaStep): void {
  expect(Number.isFinite(s.answer), `${s.id}：answer 不是有限數`).toBe(true);
  for (const wrong of s.wrongAnswers ?? []) {
    const sameAsAnswer = Math.abs(wrong.value - s.answer) <= (s.tolerance ?? 0) + EPSILON;
    expect(sameAsAnswer, `${s.id}：wrongAnswers 的 ${wrong.value} 會被判為正確`).toBe(false);
  }
}

function assertFormula(s: FormulaStep): void {
  assertWrongAnswers(s);
  for (const tile of s.tiles) expect(tile, `${s.id}：磚塊「${tile}」不是數字或 + − × ÷ ( )`).toMatch(TILE);
  expect(s.accepted.length, `${s.id}：沒有可接受的寫法`).toBeGreaterThan(0);
  for (const accepted of s.accepted) {
    const shown = accepted.join(' ');
    expect(missingTiles(accepted, s.tiles), `${s.id}：「${shown}」用到題目沒給的磚塊`).toEqual([]);
    const value = evaluateFormula(accepted);
    expect(value, `${s.id}：「${shown}」不是合法的算式`).not.toBeNull();
    const matches = value !== null && Math.abs(value - s.answer) <= (s.tolerance ?? 0) + EPSILON;
    expect(matches, `${s.id}：「${shown}」算出來是 ${value}，不是 answer ${s.answer}`).toBe(true);
  }
  // 陷阱磚塊 = 磚塊總數 − 第一個可接受寫法（看解答時顯示的那個）用掉的磚塊
  const traps = s.tiles.length - s.accepted[0].length;
  expect(traps, `${s.id}：陷阱磚塊有 ${traps} 個`).toBeGreaterThanOrEqual(2);
  expect(traps, `${s.id}：陷阱磚塊有 ${traps} 個`).toBeLessThanOrEqual(4);

  const wrongForms = s.wrongForms ?? [];
  for (const [i, wrong] of wrongForms.entries()) {
    const shown = wrong.tokens.join(' ');
    // 不合法的拼法永遠配不到，那則回饋就不會出現；用到題目沒給的磚塊，學習者也拼不出來。
    expect(parseFormula(wrong.tokens), `${s.id}：已知錯誤算式「${shown}」不合法，永遠配不到`).not.toBeNull();
    expect(missingTiles(wrong.tokens, s.tiles), `${s.id}：已知錯誤算式「${shown}」用到題目沒給的磚塊`).toEqual([]);
    expect(wrong.feedback.trim(), `${s.id}：「${shown}」的回饋是空的`).not.toBe('');
    for (const accepted of s.accepted) {
      expect(sameFormula(wrong.tokens, accepted), `${s.id}：已知錯誤算式「${shown}」和可接受的「${accepted.join(' ')}」是同一個算式`).toBe(false);
    }
    for (const earlier of wrongForms.slice(0, i)) {
      expect(sameFormula(wrong.tokens, earlier.tokens), `${s.id}：已知錯誤算式「${shown}」重複，後面那則回饋不會出現`).toBe(false);
    }
  }
}

/** 數字前後不能緊接著別的數字或小數點，才不會把 2 當成 20 的一部分。 */
function mentionsNumber(text: string, value: number): boolean {
  return new RegExp(`(?<![0-9.])${String(value).replace('.', '\\.')}(?![0-9.])`).test(text);
}

function assertSlider(s: SliderStep): void {
  expect(s.step, `${s.id}：step 要大於 0`).toBeGreaterThan(0);
  expect(s.min, `${s.id}：min 要小於 max`).toBeLessThan(s.max);
  const onGrid = (value: number) => {
    const steps = (value - s.min) / s.step;
    return value >= s.min - EPSILON && value <= s.max + EPSILON && Math.abs(steps - Math.round(steps)) <= EPSILON;
  };
  expect(onGrid(s.answer), `${s.id}：answer ${s.answer} 不在 [${s.min}, ${s.max}] 或不在 step 上，拉不到`).toBe(true);
  expect(onGrid(s.initial), `${s.id}：initial ${s.initial} 不在 [${s.min}, ${s.max}] 或不在 step 上`).toBe(true);
  expect(checkSlider(s, s.answer).correct, `${s.id}：拉到 answer 不算對`).toBe(true);
  expect(checkSlider(s, s.initial).correct, `${s.id}：一開始的位置就是答案，不用拉就答對`).toBe(false);
  for (const [name, text] of [['tooLow', s.tooLow], ['tooHigh', s.tooHigh]] as const) {
    expect(text.trim(), `${s.id}：${name} 是空的`).not.toBe('');
    expect(mentionsNumber(text, s.answer), `${s.id}：${name} 直接說出了答案 ${s.answer}`).toBe(false);
  }
}

function assertMatch(s: MatchStep): void {
  expect(s.pairs.length, `${s.id}：配對至少要 3 對`).toBeGreaterThanOrEqual(3);
  const lefts = s.pairs.map((p) => p.left);
  const rights = s.pairs.map((p) => p.right);
  expect(new Set(lefts).size, `${s.id}：左邊有重複`).toBe(lefts.length);
  expect(new Set(rights).size, `${s.id}：右邊有重複`).toBe(rights.length);
  for (const text of [...lefts, ...rights]) expect(text.trim(), `${s.id}：有一塊是空的`).not.toBe('');
}

function assertAnswerable(s: Answerable): void {
  switch (s.kind) {
    case 'choice': {
      const ids = s.options.map((o) => o.id);
      expect(new Set(ids).size, `${s.id}：選項 id 重複`).toBe(ids.length);
      expect(ids, `${s.id}：answer 不是任何一個選項`).toContain(s.answer);
      break;
    }
    case 'number':
      assertWrongAnswers(s);
      break;
    case 'table': {
      for (const row of s.rows) expect(row.cells, `${s.id}：「${row.label}」的格數和欄數不同`).toHaveLength(s.columns.length);
      const blanks = blankCells(s);
      expect(blanks.length, `${s.id}：表格沒有空格`).toBeGreaterThan(0);
      for (const blank of blanks) expect(Number.isFinite(blank.answer), `${s.id}：空格答案不是有限數`).toBe(true);
      break;
    }
    case 'formula':
      assertFormula(s);
      break;
    case 'slider':
      assertSlider(s);
      break;
    case 'match':
      assertMatch(s);
      break;
  }
}

function findStep(lessonId: string, stepId: string): Step | undefined {
  return findLesson(lessonId)?.steps.find((s) => s.id === stepId);
}

it('有 7 站，第 1 站有 5 課', () => {
  expect(stations).toHaveLength(7);
  expect(stations[0].lessons.map((l) => l.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
});

it('第 2 站有 1 課', () => {
  expect(stations[1].lessons.map((l) => l.id)).toEqual(['2-1']);
});

it('各站的 id 和標題依照 spec 的順序，只有第 1、2 站有課程', () => {
  expect(stations.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(stations.map((s) => s.title)).toEqual(['運動', '力與牛頓定律', '能量與動量', '波動、聲音與熱', '電與磁', '光', '近代物理']);
  expect(stations.slice(2).every((s) => s.lessons.length === 0)).toBe(true);
});

it('第 1 站的課程標題', () => {
  expect(stations[0].lessons.map((l) => l.title)).toEqual(['慣性', '速度與位置', '加速度', '往上丟的球', '球飛了多高']);
});

it('第 2 站的課程標題', () => {
  expect(stations[1].lessons.map((l) => l.title)).toEqual(['力與加速度']);
});

it('orderedLessonIds 與各站課程一致', () => expect(orderedLessonIds).toEqual(lessons.map((l) => l.id)));

it('跨站也依序解鎖：第 1 站最後一課完成，才解鎖第 2 站的第一課', () => {
  const station1 = stations[0].lessons.map((l) => l.id);
  const lastOfStation1 = station1[station1.length - 1];
  const firstOfStation2 = stations[1].lessons[0].id;
  expect(orderedLessonIds.indexOf(firstOfStation2)).toBe(orderedLessonIds.indexOf(lastOfStation1) + 1);
  expect(isLessonUnlocked(orderedLessonIds, station1.slice(0, -1), firstOfStation2)).toBe(false);
  expect(isLessonUnlocked(orderedLessonIds, station1, firstOfStation2)).toBe(true);
});

it('課程 id 不重複', () => expect(new Set(orderedLessonIds).size).toBe(orderedLessonIds.length));

it('findLesson 用 id 找到課程，找不到時回傳 undefined', () => {
  expect(findLesson('1-3')?.title).toBe('加速度');
  expect(findLesson('9-9')).toBeUndefined();
  expect(findLesson('')).toBeUndefined();
});

it('1-1 的公車與球模擬緊接在急煞車題之後，讓學習者動手驗證兩題', () => {
  const steps = findLesson('1-1')?.steps ?? [];
  const brakeIndex = steps.findIndex((s) => s.id === 'brake');
  expect(brakeIndex).toBeGreaterThan(0);
  expect(steps.filter((s) => s.kind === 'sim')).toHaveLength(1);
  expect(steps[brakeIndex + 1]?.kind).toBe('sim');
});

// spec 3.1～3.3：哪幾題改成新題型。
it.each([
  ['1-3', 'scooter-from-rest', 'formula'],
  ['1-3', 'scooter-6-to-18', 'formula'],
  ['1-5', 'scooter-average', 'formula'],
  ['1-5', 'bus-slide', 'formula'],
  ['1-5', 'formula-match', 'match'],
  ['2-1', 'full-cart-accel', 'formula'],
  ['2-1', 'empty-cart-force', 'slider'],
] as const)('%s 的 %s 是 %s 題', (lessonId, stepId, kind) => {
  expect(findStep(lessonId, stepId)?.kind).toBe(kind);
});

// spec 3.1 的表：正確算式，以及上課時真的寫錯過的算式。錯誤算式都要認得出來、給針對那一步的回饋。
it.each([
  ['1-3', 'scooter-from-rest', '( 18 − 0 ) ÷ 6', ['( 0 + 18 ) ÷ 6']],
  ['1-3', 'scooter-6-to-18', '( 18 − 6 ) ÷ 4', ['( 6 + 18 ) ÷ 4']],
  ['1-5', 'scooter-average', '( 6 + 18 ) ÷ 2', ['( 6 + 18 ) ÷ 3', '( 18 − 6 ) ÷ 2']],
  ['1-5', 'bus-slide', '( 10 + 0 ) ÷ 2 × 5', ['( 10 − 0 ) ÷ 2 × 5', '10 × 5']],
  ['2-1', 'full-cart-accel', '20 ÷ 20', ['20 × 20']],
] as const)('%s 的 %s：正確算式是 %s，認得真的寫錯過的算式', (lessonId, stepId, correct, wrongs) => {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'formula') throw new Error(`${stepId} 不是拼算式`);
  // 看解答顯示的是第一個寫法，要和 spec 一樣
  expect(sameFormula(step.accepted[0], tokens(correct)), `看解答顯示的是「${step.accepted[0].join(' ')}」`).toBe(true);
  for (const wrong of wrongs) {
    expect(step.wrongForms?.some((w) => sameFormula(w.tokens, tokens(wrong))), `「${wrong}」沒有對應的回饋`).toBe(true);
  }
});

// 只省略「+ 0」或「− 0」的寫法是正確的物理，要算對（不懲罰正確的想法）；上課時真的寫錯的算式仍然是錯的，給那則回饋。
it.each([
  ['1-3', 'scooter-from-rest', '18 ÷ 6'],
  ['1-5', 'bus-slide', '10 ÷ 2 × 5'],
  ['1-5', 'bus-slide', '5 × 10 ÷ 2'],
  ['1-5', 'bus-slide', '10 × 5 ÷ 2'],
] as const)('%s 的 %s：省略 0 的「%s」也算對', (lessonId, stepId, formula) => {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'formula') throw new Error(`${stepId} 不是拼算式`);
  expect(checkFormula(step, tokens(formula))).toEqual({ correct: true });
});

it.each([
  ['1-3', 'scooter-from-rest', '( 0 + 18 ) ÷ 6'],
  ['1-5', 'bus-slide', '( 10 − 0 ) ÷ 2 × 5'],
] as const)('%s 的 %s：真的寫錯過的「%s」仍然是錯的，而且有回饋', (lessonId, stepId, formula) => {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'formula') throw new Error(`${stepId} 不是拼算式`);
  expect(checkFormula(step, tokens(formula))).toMatchObject({ correct: false, feedback: expect.stringMatching(/\S/) });
});

// bus-slide 有好幾種順序都算對（先算平均速度、先乘時間、省略 + 0），回饋不能假設學習者拼的是哪一種。
it('1-5 bus-slide 拼成「10 − 0」：回饋不稱讚學習者不一定拼過的順序，也不直接說出要用「+」', () => {
  const step = findStep('1-5', 'bus-slide');
  if (step?.kind !== 'formula') throw new Error('bus-slide 不是拼算式');
  for (const formula of ['( 10 − 0 ) ÷ 2 × 5', '5 × ( 10 − 0 ) ÷ 2']) {
    const result = checkFormula(step, tokens(formula));
    const feedback = result.correct ? '' : (result.feedback ?? '');
    expect(feedback, formula).toMatch(/\S/);
    expect(feedback, formula).not.toMatch(/順序/);
    expect(feedback, formula).not.toMatch(/加上 0|\+ 0/);
  }
});

it('1-5 bus-slide 第 2 步答 50、2 的回饋：不引用某一種算式，也不說「先…再…」', () => {
  const step = findStep('1-5', 'bus-slide');
  if (step?.kind !== 'formula') throw new Error('bus-slide 不是拼算式');
  for (const value of [50, 2]) {
    const feedback = step.wrongAnswers?.find((wrong) => wrong.value === value)?.feedback ?? '';
    expect(feedback, String(value)).toMatch(/\S/);
    expect(feedback, String(value)).not.toMatch(/\(\s*10/);
    expect(feedback, String(value)).not.toMatch(/先.*再/);
  }
});

it('1-5 scooter-average 的引導：題目和說明寫的是同一個順序 (6 + 18)', () => {
  const step = findStep('1-5', 'scooter-average');
  const count = step?.kind === 'formula' ? step.guide?.find((g) => g.id === 'scooter-average-count') : undefined;
  if (count?.kind !== 'number') throw new Error('找不到 scooter-average-count');
  expect(count.prompt).toContain('(6 + 18)');
  expect(count.explanation).toContain('(6 + 18)');
  expect(`${count.prompt}${count.explanation}`).not.toContain('(18 + 6)');
});

it('1-5 最後一步是公式配對，三對照 spec', () => {
  const steps = findLesson('1-5')?.steps ?? [];
  expect(steps).toHaveLength(8);
  const last = steps[steps.length - 1];
  expect(last.id).toBe('formula-match');
  expect(last.kind === 'match' && last.pairs).toEqual([
    { left: '平均速度', right: '（一開始 + 最後）÷ 2' },
    { left: '加速度', right: '（最後 − 一開始）÷ 時間' },
    { left: '距離', right: '平均速度 × 時間' },
  ]);
});

it('2-1 推空購物車的滑桿：0 到 40 N、間距 1、從 0 開始、答案 20 N、播放購物車動畫', () => {
  expect(findStep('2-1', 'empty-cart-force')).toMatchObject({
    kind: 'slider',
    quantity: '推力',
    unit: 'N',
    min: 0,
    max: 40,
    step: 1,
    initial: 0,
    answer: 20,
    anim: 'cart',
  });
});

describe.each(lessons.map((l) => [l.id, l] as const))('課程 %s', (_id, lesson) => {
  it('5 到 8 個步驟', () => {
    expect(lesson.steps.length).toBeGreaterThanOrEqual(5);
    expect(lesson.steps.length).toBeLessThanOrEqual(8);
  });

  it('步驟 id 不重複（包含引導裡的步驟）', () => {
    const ids = lesson.steps.flatMap((s) => [s.id, ...(('guide' in s && s.guide) ? s.guide.map((g) => g.id) : [])]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每一題都可以答', () => {
    for (const s of allQuestions(lesson)) assertAnswerable(s);
  });

  it('每一題都有說明', () => {
    for (const s of allQuestions(lesson)) expect(s.explanation.trim(), `${s.id}：explanation 是空的`).not.toBe('');
  });

  it('觀念卡不超過 150 字元', () => {
    for (const s of allConcepts(lesson)) expect(s.body.join('').length, `${s.id}：觀念卡太長`).toBeLessThanOrEqual(150);
  });

  it('引導裡的步驟不會再有引導', () => {
    for (const s of lesson.steps) {
      if (!('guide' in s) || !s.guide) continue;
      for (const g of s.guide) {
        const nested = 'guide' in g ? g.guide : undefined;
        expect(nested ?? [], `${s.id} → ${g.id}：引導裡又有引導`).toHaveLength(0);
      }
    }
  });

  // 表格的空格是 inputMode="decimal" 的輸入框，iPhone 的小數鍵盤沒有負號鍵，學習者打不出負數。
  // 答案需要負數時改用數字題（數字題旁邊有「±」按鈕）；給定的格子（字串）可以是負數。
  it('表格空格的答案都不是負數', () => {
    for (const s of allQuestions(lesson)) {
      if (s.kind !== 'table') continue;
      for (const blank of blankCells(s)) {
        expect(blank.answer, `${s.id}：第 ${blank.row + 1} 列第 ${blank.col + 1} 格的答案是負數`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('不會教「負號就代表減速」', () => {
    expect(JSON.stringify(lesson)).not.toMatch(/負號就?代表減速/);
  });

  it('沒有 emoji', () => {
    expect(JSON.stringify(lesson)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
