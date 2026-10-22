import { describe, expect, it } from 'vitest';
import { blankCells } from '../lib/answer';
import { acceptedNote, checkFormula, evaluateFormula, formulaTiles, parseFormula, sameFormula } from '../lib/formula';
import { isLessonUnlocked } from '../lib/progress';
import { checkSlider } from '../lib/slider';
import type { ChoiceStep, ConceptStep, FormulaStep, GuideStep, Lesson, MatchStep, NumberStep, QuestionStep, SliderStep, Step, StationReview, VtGraph } from '../lib/types';
import { findLesson, isLastLessonOfStation, orderedLessonIds, reviewAsLesson, reviewLessonId, reviewOf, reviewStationOf, stationOf, stations } from './stations';

const lessons = stations.flatMap((s) => s.lessons);

/** 有複習的站的複習，依站號排序。 */
const reviews: StationReview[] = stations.flatMap((s) => {
  const review = reviewOf(s.id);
  return review === undefined ? [] : [review];
});

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

/** 數字磚塊（不是 + − × ÷ ( )）。 */
const NUMBER_TILE = /^[0-9]+(\.[0-9]+)?$/;

/**
 * 拼算式的方塊標示（tileLabels）有什麼問題，沒有問題時是空陣列：
 * 長度要和 tiles 一樣；標示不能是空白；只有數字磚塊可以有標示；標示裡不能有「|」（算式裡寫成「數值|標示」），
 * 也不能有半形括號「(」「)」（會和括號方塊搞混）；
 * 同一題裡數值相同的數字磚塊一定都要有標示，而且標示都不一樣（才分得出是哪一塊）；標示不能直接寫出答案。
 */
function tileLabelProblems(s: Pick<FormulaStep, 'id' | 'tiles' | 'tileLabels' | 'answer'>): string[] {
  const problems: string[] = [];
  const labels = s.tileLabels;
  if (labels !== undefined && labels.length !== s.tiles.length) {
    problems.push(`${s.id}：tileLabels 有 ${labels.length} 個，tiles 有 ${s.tiles.length} 個`);
  }
  for (const [i, label] of (labels ?? []).entries()) {
    if (label === undefined) continue;
    if (label.trim() === '') problems.push(`${s.id}：第 ${i + 1} 塊「${s.tiles[i]}」的標示是空白`);
    else if (!NUMBER_TILE.test(s.tiles[i] ?? '')) problems.push(`${s.id}：第 ${i + 1} 塊「${s.tiles[i]}」不是數字，不能有標示`);
    else if (label.includes('|')) problems.push(`${s.id}：第 ${i + 1} 塊「${s.tiles[i]}」的標示「${label}」不能有「|」（算式裡用它隔開數值和標示）`);
    else if (/[()]/.test(label)) problems.push(`${s.id}：第 ${i + 1} 塊「${s.tiles[i]}」的標示「${label}」不能有「(」「)」（會和括號方塊搞混）`);
    else if (mentionsNumber(label, s.answer)) problems.push(`${s.id}：第 ${i + 1} 塊「${s.tiles[i]}」的標示「${label}」寫出了答案 ${s.answer}`);
  }
  const byValue = new Map<string, number[]>();
  for (const [i, tile] of s.tiles.entries()) {
    if (NUMBER_TILE.test(tile)) byValue.set(tile, [...(byValue.get(tile) ?? []), i]);
  }
  for (const [value, indexes] of byValue) {
    if (indexes.length < 2) continue;
    const named = indexes.map((i) => labels?.[i]?.trim() ?? '');
    if (named.some((label) => label === '')) problems.push(`${s.id}：有 ${indexes.length} 塊「${value}」，每一塊都要有標示`);
    else if (new Set(named).size !== named.length) problems.push(`${s.id}：${indexes.length} 塊「${value}」的標示要不一樣`);
  }
  return problems;
}

function assertFormula(s: FormulaStep): void {
  assertWrongAnswers(s);
  expect(tileLabelProblems(s)).toEqual([]);
  for (const tile of s.tiles) expect(tile, `${s.id}：磚塊「${tile}」不是數字或 + − × ÷ ( )`).toMatch(TILE);
  expect(s.accepted.length, `${s.id}：沒有可接受的寫法`).toBeGreaterThan(0);
  for (const accepted of s.accepted) {
    const shown = accepted.join(' ');
    // 有標示的磚塊要寫成「數值|標示」（formulaTiles）：寫成只有數值、或標示寫錯，都拼不出來
    expect(missingTiles(accepted, formulaTiles(s)), `${s.id}：「${shown}」用到題目沒給的磚塊`).toEqual([]);
    const value = evaluateFormula(accepted);
    expect(value, `${s.id}：「${shown}」不是合法的算式`).not.toBeNull();
    const matches = value !== null && Math.abs(value - s.answer) <= (s.tolerance ?? 0) + EPSILON;
    expect(matches, `${s.id}：「${shown}」算出來是 ${value}，不是 answer ${s.answer}`).toBe(true);
  }
  // 陷阱磚塊 = 磚塊總數 − 第一個可接受寫法（看解答時顯示的那個）用掉的磚塊
  const traps = s.tiles.length - s.accepted[0].length;
  expect(traps, `${s.id}：陷阱磚塊有 ${traps} 個`).toBeGreaterThanOrEqual(2);
  expect(traps, `${s.id}：陷阱磚塊有 ${traps} 個`).toBeLessThanOrEqual(4);

  // 算對、但寫法省略了什麼（例如省略「+ 0」）時的提醒：必須是 accepted 裡的某一種寫法，而且不能是正式寫法（accepted 的第一個）。
  // 否則提醒永遠不會出現，或是正式寫法也被提醒「正式寫法是……」。
  const notes = s.acceptedNotes ?? [];
  for (const [i, { tokens: noteTokens, note }] of notes.entries()) {
    const shown = noteTokens.join(' ');
    expect(parseFormula(noteTokens), `${s.id}：提醒的算式「${shown}」不合法`).not.toBeNull();
    expect(missingTiles(noteTokens, formulaTiles(s)), `${s.id}：提醒的算式「${shown}」用到題目沒給的磚塊`).toEqual([]);
    expect(
      s.accepted.some((accepted) => sameFormula(noteTokens, accepted)),
      `${s.id}：提醒的算式「${shown}」不是 accepted 裡的任何一種寫法，提醒永遠不會出現`,
    ).toBe(true);
    expect(sameFormula(noteTokens, s.accepted[0]), `${s.id}：提醒的算式「${shown}」就是正式寫法（accepted 的第一個），不需要提醒`).toBe(false);
    expect(note.trim(), `${s.id}：「${shown}」的提醒是空的`).not.toBe('');
    for (const earlier of notes.slice(0, i)) {
      expect(sameFormula(noteTokens, earlier.tokens), `${s.id}：提醒的算式「${shown}」重複，後面那則提醒不會出現`).toBe(false);
    }
  }

  const wrongForms = s.wrongForms ?? [];
  for (const [i, wrong] of wrongForms.entries()) {
    const shown = wrong.tokens.join(' ');
    // 不合法的拼法永遠配不到，那則回饋就不會出現；用到題目沒給的磚塊，學習者也拼不出來。
    expect(parseFormula(wrong.tokens), `${s.id}：已知錯誤算式「${shown}」不合法，永遠配不到`).not.toBeNull();
    expect(missingTiles(wrong.tokens, formulaTiles(s)), `${s.id}：已知錯誤算式「${shown}」用到題目沒給的磚塊`).toEqual([]);
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
  // 購物車畫面要標示質量、用 a = F ÷ m 算加速度：質量一定要有，而且和題目裡說的一樣
  if (s.anim === 'cart') {
    expect(s.cartMass, `${s.id}：購物車滑桿要有 cartMass`).toBeGreaterThan(0);
    expect(s.prompt, `${s.id}：cartMass ${s.cartMass} 和題目裡的質量不一樣`).toContain(`${s.cartMass} 公斤`);
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

// 課程是自動從 lessons/ 讀進來的，新增一課不用改這裡；以下只檢查「至少有」哪些課，不寫死總共有幾課。
it('有 7 站，id 和標題依照 spec 的順序', () => {
  expect(stations.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(stations.map((s) => s.title)).toEqual(['運動', '力與牛頓定律', '能量與動量', '波動、聲音與熱', '電與磁', '光', '近代物理']);
});

it('第 1 站至少有 1-1～1-6，依序排在最前面', () => {
  expect(stations[0].lessons.map((l) => l.id).slice(0, 6)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']);
});

it('第 2 站至少有 2-1～2-4，依序排在最前面', () => {
  expect(stations[1].lessons.map((l) => l.id).slice(0, 4)).toEqual(['2-1', '2-2', '2-3', '2-4']);
});

it('每一站的課程 id 都是「站號-課號」，課號從 1 開始連續；沒有課程的站就是空的（地圖上顯示即將推出）', () => {
  for (const station of stations) {
    expect(station.lessons.map((l) => l.id), `第 ${station.id} 站`).toEqual(station.lessons.map((_, i) => `${station.id}-${i + 1}`));
  }
});

it('第 1 站的課程標題（前 6 課）', () => {
  expect(stations[0].lessons.slice(0, 6).map((l) => l.title)).toEqual(['慣性', '速度與位置', '加速度', '往上丟的球', '球飛了多高', '速度–時間圖']);
});

it('第 2 站的課程標題（前 4 課）', () => {
  expect(stations[1].lessons.slice(0, 4).map((l) => l.title)).toEqual(['力與加速度', '東西為什麼會停下來', '作用力與反作用力', '質量和重量']);
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

it('stationOf：每一課都回傳它所在的那一站，找不到這一課時回傳 undefined', () => {
  for (const station of stations) {
    for (const lesson of station.lessons) expect(stationOf(lesson.id), lesson.id).toBe(station.id);
  }
  expect(stationOf('1-3')).toBe(1);
  expect(stationOf('2-1')).toBe(2);
  expect(stationOf('9-9')).toBeUndefined();
  expect(stationOf('')).toBeUndefined();
});

it('isLastLessonOfStation：只有每一站的最後一課是 true，找不到這一課時是 false', () => {
  for (const station of stations) {
    for (const [index, lesson] of station.lessons.entries()) {
      expect(isLastLessonOfStation(lesson.id), lesson.id).toBe(index === station.lessons.length - 1);
    }
  }
  expect(isLastLessonOfStation('1-1')).toBe(false);
  expect(isLastLessonOfStation('9-9')).toBe(false);
  expect(isLastLessonOfStation('')).toBe(false);
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
  ['2-1', 'full-cart-accel', '20|力 ÷ 20|滿車質量', ['20|力 × 20|滿車質量']], // 有標示的磚塊寫成「數值|標示」
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

// 省略 0 的寫法算對，但要輕輕提醒正式寫法是什麼、為什麼這題可以省略；正式寫法（含 + 兩側對調）不需要提醒。
it.each([
  ['1-3', 'scooter-from-rest', '18 ÷ 6', '( 18 − 0 ) ÷ 6'],
  ['1-5', 'bus-slide', '10 ÷ 2 × 5', '( 10 + 0 ) ÷ 2 × 5'],
  ['1-5', 'bus-slide', '5 × 10 ÷ 2', '( 10 + 0 ) ÷ 2 × 5'],
  ['1-5', 'bus-slide', '10 × 5 ÷ 2', '( 10 + 0 ) ÷ 2 × 5'],
] as const)('%s 的 %s：省略 0 的「%s」有提醒，說明正式寫法是「%s」', (lessonId, stepId, formula, formal) => {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'formula') throw new Error(`${stepId} 不是拼算式`);
  const note = acceptedNote(step, tokens(formula));
  expect(note, `「${formula}」沒有提醒`).not.toBeNull();
  // 提醒裡寫的是正式寫法的樣子：磚塊用空白隔開，提醒裡的數字和符號用一般的寫法（括號貼著數字）。
  expect(note, formula).toContain(formal.replace('( ', '(').replace(' )', ')'));
  expect(note, formula).toMatch(/\+ 0|− 0|省略/);
  expect(acceptedNote(step, tokens(formal))).toBeNull();
});

it.each([
  ['1-3', 'scooter-from-rest', '( 18 − 0 ) ÷ 6'],
  ['1-5', 'bus-slide', '( 10 + 0 ) ÷ 2 × 5'],
  ['1-5', 'bus-slide', '( 0 + 10 ) ÷ 2 × 5'],
  ['1-5', 'bus-slide', '5 × ( 10 + 0 ) ÷ 2'],
  ['1-5', 'bus-slide', '( 10 + 0 ) × 5 ÷ 2'],
] as const)('%s 的 %s：正式寫法「%s」不需要提醒', (lessonId, stepId, formula) => {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'formula') throw new Error(`${stepId} 不是拼算式`);
  expect(checkFormula(step, tokens(formula))).toEqual({ correct: true });
  expect(acceptedNote(step, tokens(formula))).toBeNull();
});

it('1-motion 複習的 pitch-height：省略 + 0 的寫法算對，有提醒，正式寫法是 (30 + 0) ÷ 2 × 3', () => {
  const step = reviewOf(1)?.steps.find((s) => s.id === 'pitch-height');
  if (step?.kind !== 'formula') throw new Error('pitch-height 不是拼算式');
  for (const formula of ['30 ÷ 2 × 3', '3 × 30 ÷ 2', '30 × 3 ÷ 2']) {
    expect(checkFormula(step, tokens(formula)), formula).toEqual({ correct: true });
    expect(acceptedNote(step, tokens(formula)), formula).toContain('(30 + 0) ÷ 2 × 3');
  }
  for (const formula of ['( 30 + 0 ) ÷ 2 × 3', '3 × ( 30 + 0 ) ÷ 2', '( 0 + 30 ) ÷ 2 × 3']) {
    expect(checkFormula(step, tokens(formula)), formula).toEqual({ correct: true });
    expect(acceptedNote(step, tokens(formula)), formula).toBeNull();
  }
});

// accepted 裡寫出 0 的寫法是完整的寫法，不需要提醒；省略 0 的寫法一個都不能漏掉提醒。
it('1-3 scooter-from-rest、1-5 bus-slide、1-motion pitch-height：省略 0 的寫法一個都沒漏掉提醒', () => {
  const steps = [findStep('1-3', 'scooter-from-rest'), findStep('1-5', 'bus-slide'), reviewOf(1)?.steps.find((s) => s.id === 'pitch-height')];
  for (const step of steps) {
    if (step?.kind !== 'formula') throw new Error('不是拼算式');
    for (const accepted of step.accepted) {
      const dropsZero = !accepted.includes('0');
      expect(acceptedNote(step, accepted) !== null, `${step.id}：「${accepted.join(' ')}」${dropsZero ? '省略了 0，要有提醒' : '是完整的寫法，不該有提醒'}`).toBe(dropsZero);
    }
  }
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

it('1-5 bus-slide 第 2 步答 50、2、5 的回饋：不引用某一種算式，也不說「先…再…」', () => {
  const step = findStep('1-5', 'bus-slide');
  if (step?.kind !== 'formula') throw new Error('bus-slide 不是拼算式');
  for (const value of [50, 2, 5]) {
    const feedback = step.wrongAnswers?.find((wrong) => wrong.value === value)?.feedback ?? '';
    expect(feedback, String(value)).toMatch(/\S/);
    expect(feedback, String(value)).not.toContain('(10 + 0) ÷ 2');
    expect(feedback, String(value)).not.toMatch(/\(\s*10/);
    expect(feedback, String(value)).not.toMatch(/先.*再/);
  }
  // 答 5：只算到平均速度。物理的提示要留著：還要乘上時間
  expect(step.wrongAnswers?.find((wrong) => wrong.value === 5)?.feedback).toMatch(/還要乘上時間/);
});

it('1-5 scooter-average 的引導：題目和說明寫的是同一個順序 (6 + 18)', () => {
  const step = findStep('1-5', 'scooter-average');
  const count = step?.kind === 'formula' ? step.guide?.find((g) => g.id === 'scooter-average-count') : undefined;
  if (count?.kind !== 'number') throw new Error('找不到 scooter-average-count');
  expect(count.prompt).toContain('(6 + 18)');
  expect(count.explanation).toContain('(6 + 18)');
  expect(`${count.prompt}${count.explanation}`).not.toContain('(18 + 6)');
});

// 1-6：上課時真的答了「10、10」：等速 10 公尺/秒的平線，斜率和加速度都答成線的高度（速度）。回饋只說方向，不說出答案 0。
it('1-6 flat-line：高度 10 的平線，加速度答案 0；真的答過的 10 有回饋（10 是線的高度、速度大不代表加速度大），不說出答案，答錯後有引導', () => {
  const step = findStep('1-6', 'flat-line');
  if (step?.kind !== 'number') throw new Error('flat-line 不是數字題');
  expect(step.answer).toBe(0);
  expect(step.unit).toBe('公尺/秒²');
  const points = step.graph?.lines[0]?.points ?? [];
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (const [, v] of points) expect(v).toBe(10);
  const feedback = step.wrongAnswers?.find((wrong) => wrong.value === 10)?.feedback ?? '';
  expect(feedback).toContain('線的高度');
  expect(feedback).toContain('變了');
  expect(feedback).toContain('速度大，不代表加速度大');
  expect(feedback).not.toMatch(/(斜率|加速度)(就)?是 ?0(?![0-9.])|= 0(?![0-9.])/);
  expect(step.guide?.length ?? 0).toBeGreaterThan(0);
});

// 上課時表格第二行的高是另一個數，學習者抄了第一行的高（寫成 2*10 = 20）。同樣的結構：第一行已填好，第二行的高不一樣，
// 抄第一行的高算出來的數字是錯的。表格題沒有針對單一答案的回饋，所以答錯後的引導先問「高要用哪一個數」，對抄來的高有回饋。
it('1-6 frame-table：第一行已填好、第二行的高不一樣；抄第一行的高算出來是錯的，引導對抄來的高有回饋，不說出答案', () => {
  const step = findStep('1-6', 'frame-table');
  if (step?.kind !== 'table') throw new Error('frame-table 不是表格題');
  const [first, second] = step.rows;
  expect(first.cells.every((cell) => typeof cell === 'string'), '第一行要全部填好').toBe(true);
  const [width, height] = second.cells.slice(0, 2).map(Number);
  const firstHeight = Number(first.cells[1]);
  expect(height).not.toBe(firstHeight);
  const blanks = blankCells(step);
  expect(blanks).toHaveLength(1);
  expect(blanks[0]).toMatchObject({ row: 1, answer: width * height });
  const copied = width * firstHeight;
  expect(copied).not.toBe(width * height);

  const guide = step.guide?.[0];
  if (guide?.kind !== 'number') throw new Error('frame-table 的引導第一步不是數字題');
  expect(guide.answer).toBe(height);
  const feedback = guide.wrongAnswers?.find((wrong) => wrong.value === firstHeight)?.feedback ?? '';
  expect(feedback).toContain('第一行');
  expect(feedback).toContain('第二行自己的高');
  for (const text of [feedback, guide.prompt, guide.explanation]) expect(mentionsNumber(text, width * height), text).toBe(false);
  expect(guide.wrongAnswers?.some((wrong) => wrong.value === copied)).toBe(true);
});

// 「÷ 2 從哪裡來」：陷阱選項「因為時間剛好是 2 秒」要留著，例子也剛好 2 秒；回饋呼應 1-5 的 ÷ 3（3 秒也是 ÷ 2），不說出答案。
it('1-6 where-half：÷ 2 是因為三角形是長方形的一半；「因為時間剛好是 2 秒」的回饋說 3 秒也是 ÷ 2、呼應 1-5 的 ÷ 3，不說出答案', () => {
  const step = findStep('1-6', 'where-half');
  if (step?.kind !== 'choice') throw new Error('where-half 不是選擇題');
  expect(step.options.find((o) => o.id === step.answer)?.label).toBe('因為三角形是長方形的一半');
  const points = step.graph?.lines[0]?.points ?? [];
  expect(points[0]).toEqual([0, 0]);
  expect(points[points.length - 1]?.[0], '例子要剛好 2 秒').toBe(2);
  const trap = step.options.find((o) => o.label === '因為時間剛好是 2 秒');
  const feedback = trap?.feedback ?? '';
  expect(feedback).toContain('3 秒');
  expect(feedback).toContain('不是 ÷ 3');
  expect(feedback).toContain('1-5');
  expect(feedback).not.toContain('一半');
});

// 質量是 1 公斤，1.6 ÷ 1 和只放 1.6 算出來碰巧也是 1.6，但不是 W = m × g，要給回饋而不是算對。
it('2-4 月球上的重量拼成 1 × 1.6；碰巧算對的 1.6 ÷ 1、1.6 仍然是錯的，而且有回饋', () => {
  const step = findStep('2-4', 'moon-weight');
  if (step?.kind !== 'formula') throw new Error('moon-weight 不是拼算式');
  // 有標示的磚塊在算式裡寫成「數值|標示」
  const mass = '1|質量';
  const moon = '1.6|月球 g';
  const earth = '10|地球 g';
  expect(sameFormula(step.accepted[0], [mass, '×', moon])).toBe(true);
  expect(checkFormula(step, [moon, '×', mass])).toEqual({ correct: true });
  for (const formula of [[moon, '÷', mass], [moon], [mass, '×', earth]]) {
    expect(checkFormula(step, formula), formula.join(' ')).toMatchObject({ correct: false, feedback: expect.stringMatching(/\S/) });
  }
});

// 有標示之後照用途判斷：兩塊 20 一塊是力、一塊是滿車質量。質量 ÷ 力算出來碰巧也是 1，但順序反了。
it('2-1 full-cart-accel：力 ÷ 滿車質量算對；滿車質量 ÷ 力是錯的，回饋說明順序是力 ÷ 質量（a = F ÷ m）', () => {
  const step = findStep('2-1', 'full-cart-accel');
  if (step?.kind !== 'formula') throw new Error('full-cart-accel 不是拼算式');
  expect(checkFormula(step, ['20|力', '÷', '20|滿車質量'])).toEqual({ correct: true });
  const reversed = checkFormula(step, ['20|滿車質量', '÷', '20|力']);
  expect(reversed.correct).toBe(false);
  const feedback = reversed.correct ? '' : (reversed.feedback ?? '');
  expect(feedback).toContain('力 ÷ 質量');
  expect(feedback).toContain('a = F ÷ m');
  // − 兩邊不能對調，所以兩種順序都要認得；× 可以對調
  for (const formula of [['20|力', '−', '20|滿車質量'], ['20|滿車質量', '−', '20|力'], ['20|滿車質量', '×', '20|力']]) {
    expect(checkFormula(step, formula), formula.join(' ')).toMatchObject({ correct: false, feedback: expect.stringMatching(/\S/) });
  }
  // 質量 ÷ 質量：兩種順序都要認得，回饋說兩個都是質量、要用力去除（a = F ÷ m）
  for (const formula of [['20|滿車質量', '÷', '10|空車質量'], ['10|空車質量', '÷', '20|滿車質量']]) {
    const result = checkFormula(step, formula);
    expect(result.correct, formula.join(' ')).toBe(false);
    const text = result.correct ? '' : (result.feedback ?? '');
    expect(text, formula.join(' ')).toContain('兩個都是質量');
    expect(text, formula.join(' ')).toContain('a = F ÷ m');
  }
});

// 上課時真的答了 10：把 1 秒最後那一刻的速度當成平均速度。回饋只說方向，不說出答案 5。
it('2-5 第 1 秒的平均速度：答案 5；真的答過的 10 有回饋（10 是最後那一刻的速度），不說出答案，答錯後有引導', () => {
  const step = findStep('2-5', 'first-second-average');
  if (step?.kind !== 'number') throw new Error('first-second-average 不是數字題');
  expect(step.answer).toBe(5);
  const feedback = step.wrongAnswers?.find((wrong) => wrong.value === 10)?.feedback ?? '';
  expect(feedback).toContain('最後那一刻');
  expect(feedback).toContain('大部分時間都比 10 慢');
  expect(mentionsNumber(feedback, 5)).toBe(false);
  expect(step.guide?.length ?? 0).toBeGreaterThan(0);
});

// 兩塊 2 一塊是取平均、一塊是時間：對調之後數字碰巧一樣，但用途反了。
it('2-5 two-second-distance：(0 + 20) ÷ 2 × 2 算對；兩塊 2 對調、(20 − 0) 碰巧算對但是錯的，有回饋', () => {
  const step = findStep('2-5', 'two-second-distance');
  if (step?.kind !== 'formula') throw new Error('two-second-distance 不是拼算式');
  expect(sameFormula(step.accepted[0], ['(', '0|一開始速度', '+', '20|最後速度', ')', '÷', '2|取平均', '×', '2|時間'])).toBe(true);
  expect(checkFormula(step, ['2|時間', '×', '(', '0|一開始速度', '+', '20|最後速度', ')', '÷', '2|取平均'])).toEqual({ correct: true });
  for (const formula of [
    ['(', '0|一開始速度', '+', '20|最後速度', ')', '÷', '2|時間', '×', '2|取平均'],
    ['(', '20|最後速度', '−', '0|一開始速度', ')', '÷', '2|取平均', '×', '2|時間'],
    ['20|最後速度', '×', '2|時間'],
  ]) {
    expect(checkFormula(step, formula), formula.join(' ')).toMatchObject({ correct: false, feedback: expect.stringMatching(/\S/) });
  }
});

// 上課時真的寫了「(30+20)÷ 5 = 10N」：相加對了，但多除了質量，算出來的是加速度。回饋說多算了一步，不說出答案 50。
it('2-6 同方向的合力：答案 50 N；真的答過的 10 有「多算了一步」的回饋（再 ÷ 質量是加速度），不說出答案，答錯後有引導', () => {
  const step = findStep('2-6', 'same-direction-net');
  if (step?.kind !== 'number') throw new Error('same-direction-net 不是數字題');
  expect(step.answer).toBe(50);
  expect(step.unit).toBe('N');
  const feedback = step.wrongAnswers?.find((wrong) => wrong.value === 10)?.feedback ?? '';
  expect(feedback).toContain('多算了一步');
  expect(feedback).toContain('算到 N 就停');
  expect(feedback).toContain('加速度');
  expect(mentionsNumber(feedback, 50)).toBe(false);
  expect(step.guide?.length ?? 0).toBeGreaterThan(0);
});

// F = m × a 的 F 是合力：只用一個人的力、把反方向的力相加都不對；少了括號、碰巧算出 2 的 30 ÷ (20 − 5) 也要有回饋。
it('2-6 opposite-accel：(30 − 20) ÷ 5 算對；只用一個人的力、反方向相加、少了括號、碰巧算對的 30 ÷ (20 − 5) 都是錯的，有回饋', () => {
  const step = findStep('2-6', 'opposite-accel');
  if (step?.kind !== 'formula') throw new Error('opposite-accel 不是拼算式');
  // 有標示的磚塊寫成「數值|標示」
  const right = '30|小明往右';
  const left = '20|小華往左';
  const mass = '5|質量';
  expect(sameFormula(step.accepted[0], ['(', right, '−', left, ')', '÷', mass])).toBe(true);
  for (const formula of [
    [right, '÷', mass],
    ['(', right, '+', left, ')', '÷', mass],
    [right, '−', left, '÷', mass],
    [right, '÷', '(', left, '−', mass, ')'],
  ]) {
    expect(checkFormula(step, formula), formula.join(' ')).toMatchObject({ correct: false, feedback: expect.stringMatching(/\S/) });
  }
});

it('2-6 的購物車題都說明沒有摩擦力；單位配對是距離、速度、加速度、力、質量五對', () => {
  for (const id of ['which-way', 'opposite-net', 'opposite-accel', 'same-direction-net', 'ten-unit']) {
    const step = findStep('2-6', id);
    expect(step && 'prompt' in step ? step.prompt : '', id).toContain('沒有摩擦力');
  }
  const match = findStep('2-6', 'unit-match');
  expect(match?.kind === 'match' && match.pairs).toEqual([
    { left: '距離', right: '公尺' },
    { left: '速度', right: '公尺/秒' },
    { left: '加速度', right: '公尺/秒²' },
    { left: '力', right: 'N' },
    { left: '質量', right: '公斤' },
  ]);
});

// 上課時真的答了「不同東西上？」：只看到一樣大、方向相反，就以為重力和正向力是作用力與反作用力。
// 回饋先分清楚誰施力、作用在誰身上，不說出答案（同一個東西上）。
it('2-7 acts-on：重力和正向力作用在同一個東西上；以為是作用力與反作用力的選項有回饋（誰施力、作用在誰身上），不說出答案，答錯後有引導', () => {
  const step = findStep('2-7', 'acts-on');
  if (step?.kind !== 'choice') throw new Error('acts-on 不是選擇題');
  expect(step.answer).toBe('same-object');
  const option = step.options.find((o) => o.id === 'action-reaction');
  expect(option?.label).toContain('不同的東西');
  const feedback = option?.feedback ?? '';
  expect(feedback).toContain('誰施力');
  expect(feedback).toContain('作用在誰身上');
  expect(feedback).not.toContain('同一個東西');
  expect(step.guide?.length ?? 0).toBeGreaterThan(0);
});

// 上課時真的答了「阻力、手、往上」。回饋不把阻力寫成定義，也不直接說出是桌子；正向力 = 重力只寫成「這一題」。
it('2-7 upward-force 的「阻力」選項有回饋，不說出答案也不下阻力的定義；normal-size 說明寫「這一題」正向力和重力一樣大', () => {
  const step = findStep('2-7', 'upward-force');
  if (step?.kind !== 'choice') throw new Error('upward-force 不是選擇題');
  expect(step.answer).toBe('table');
  const feedback = step.options.find((o) => o.id === 'drag')?.feedback ?? '';
  expect(feedback).toContain('不叫阻力');
  expect(feedback).not.toContain('桌子');
  expect(JSON.stringify(findLesson('2-7'))).not.toMatch(/阻力(就)?是/);
  const size = findStep('2-7', 'normal-size');
  if (size?.kind !== 'number') throw new Error('normal-size 不是數字題');
  expect(size.answer).toBe(10);
  expect(size.explanation).toContain('這一題正向力和重力一樣大');
});

it('第 2 站複習 bus-brake-size：質量 × 加速度大小算對（× 可以對調）；用了地球 g 是錯的，有回饋', () => {
  const step = reviewOf(2)?.steps.find((s) => s.id === 'bus-brake-size');
  if (step?.kind !== 'formula') throw new Error('bus-brake-size 不是拼算式');
  expect(checkFormula(step, ['6000|質量', '×', '2|加速度大小'])).toEqual({ correct: true });
  expect(checkFormula(step, ['2|加速度大小', '×', '6000|質量'])).toEqual({ correct: true });
  expect(checkFormula(step, ['6000|質量', '×', '10|地球 g'])).toMatchObject({ correct: false, feedback: expect.stringContaining('地球的 g') });
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

it('2-1 推空購物車的滑桿：0 到 40 N、間距 1、從 0 開始、答案 20 N、播放購物車動畫（購物車 10 公斤）', () => {
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
    cartMass: 10,
  });
});

it('第 2 站複習的月球購物車滑桿：購物車 15 公斤', () => {
  expect(reviewOf(2)?.steps.find((s) => s.id === 'moon-cart-force')).toMatchObject({ kind: 'slider', anim: 'cart', cartMass: 15, answer: 30 });
});

// 第 2 站複習涵蓋 2-5～2-7：重點、公式都留著條件（不考慮空氣阻力、同一條直線、正向力 = 重力只是「這一題」）。
it('第 2 站重點與公式涵蓋 2-5～2-7：平衡、這一題的正向力、落下的加速度 g；合力只算同一條直線上的力', () => {
  const review = reviewOf(2);
  const points = review?.points ?? [];
  expect(points.find((p) => p.includes('平衡'))).toContain('合力是 0');
  expect(points.find((p) => p.includes('正向力'))).toContain('這一題');
  expect(points.find((p) => p.includes('落下的加速度'))).toContain('不考慮空氣阻力');
  const formulas = review?.formulas ?? [];
  expect(formulas.find((f) => f.name.startsWith('合力'))?.name).toContain('同一條直線');
  expect(formulas.find((f) => f.name.startsWith('落下的加速度'))?.name).toContain('不考慮空氣阻力');
});

// 2-5～2-7 上課時真的犯過的錯：陷阱裡都有；多除了質量、把重力當成正向力的反作用力，也做成複習題的回饋，不說出答案。
it('第 2 站複習留下 2-5～2-7 真的犯過的錯：四對陷阱；friction-net 的 3、floor-reaction 的「地球往下拉」有回饋，不說出答案', () => {
  const review = reviewOf(2);
  const wrongs = review?.traps.map((t) => t.wrong).join('\n') ?? '';
  expect(wrongs).toContain('平均速度是 10');
  expect(wrongs).toContain('(30 + 20) ÷ 5 = 10 N');
  expect(wrongs).toContain('單位是 F');
  expect(wrongs).toContain('正向力一樣大、方向相反，所以是一對作用力與反作用力');

  const net = review?.steps.find((s) => s.id === 'friction-net');
  if (net?.kind !== 'number') throw new Error('friction-net 不是數字題');
  expect(net.answer).toBe(30);
  expect(net.prompt).toContain('同一條直線');
  const extraStep = net.wrongAnswers?.find((wrong) => wrong.value === 3)?.feedback ?? '';
  expect(extraStep).toContain('多算了一步');
  expect(mentionsNumber(extraStep, 30)).toBe(false);

  const reaction = review?.steps.find((s) => s.id === 'floor-reaction');
  if (reaction?.kind !== 'choice') throw new Error('floor-reaction 不是選擇題');
  expect(reaction.answer).toBe('press-down');
  expect(reaction.prompt).toContain('沒有別的力往上或往下壓');
  expect(reaction.explanation).toContain('這一題');
  const weight = reaction.options.find((o) => o.id === 'weight')?.feedback ?? '';
  expect(weight).toContain('作用在米袋上');
  expect(weight).not.toContain('壓地板');
});

it('第 2 站複習 fall-numbers：平均速度 5 公尺/秒和 1 秒時的速度 10 公尺/秒分開配；題目寫明不考慮空氣阻力、往下為正', () => {
  const step = reviewOf(2)?.steps.find((s) => s.id === 'fall-numbers');
  if (step?.kind !== 'match') throw new Error('fall-numbers 不是配對題');
  expect(step.pairs).toEqual(
    expect.arrayContaining([
      { left: '5 公尺/秒', right: '平均速度' },
      { left: '10 公尺/秒', right: '1 秒時的速度' },
      { left: '10 公尺/秒²', right: '加速度' },
    ]),
  );
  expect(step.prompt).toContain('不考慮空氣阻力');
  expect(step.prompt).toContain('往下當成正的');
});

// ---- 拼算式的方塊標示：數值相同的方塊一定分得出來 ----

describe('tileLabelProblems（方塊標示的內容檢查）', () => {
  const base = { id: 'demo', answer: 1 };
  it('沒有重複的數字、沒有標示：沒問題', () => {
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'] })).toEqual([]);
  });
  it('符號重複不需要標示', () => {
    expect(tileLabelProblems({ ...base, tiles: ['(', '6', ')', '(', '2', ')'] })).toEqual([]);
  });
  it('兩塊「20」沒有標示、只標了一塊、標示一樣：都不行', () => {
    expect(tileLabelProblems({ ...base, tiles: ['20', '20', '÷'] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['20', '20', '÷'], tileLabels: ['力', undefined, undefined] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['20', '20', '÷'], tileLabels: ['力', '力', undefined] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['20', '20', '÷'], tileLabels: ['力', ' ', undefined] })).not.toEqual([]);
  });
  it('兩塊「20」標示不同：沒問題', () => {
    expect(tileLabelProblems({ ...base, tiles: ['20', '20', '÷'], tileLabels: ['力', '質量', undefined] })).toEqual([]);
  });
  it('tileLabels 的長度要和 tiles 一樣', () => {
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: ['力'] })).toHaveLength(1);
  });
  it('只有數字磚塊可以有標示，標示裡不能有「|」', () => {
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: [undefined, undefined, '先算'] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: ['力|質量', undefined, undefined] })).toHaveLength(1);
  });
  it('標示裡不能有半形括號「(」「)」：會和括號方塊搞混', () => {
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: ['力(N)', undefined, undefined] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: ['(力', undefined, undefined] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: [undefined, '質量)', undefined] })).toHaveLength(1);
  });
  it('標示不能是空白，也不能寫出答案', () => {
    expect(tileLabelProblems({ ...base, tiles: ['10', '20', '÷'], tileLabels: ['', undefined, undefined] })).toHaveLength(1);
    expect(tileLabelProblems({ ...base, answer: 2, tiles: ['10', '20', '÷'], tileLabels: ['答案是 2', undefined, undefined] })).toHaveLength(1);
  });
});

/** 某一題拼算式每一塊的標示（沒有標示的是 undefined），依 tiles 的順序，和數值配成一對。 */
function labelledTiles(step: Step | undefined): [string, string | undefined][] {
  if (step?.kind !== 'formula') throw new Error('不是拼算式');
  return step.tiles.map((tile, i) => [tile, step.tileLabels?.[i]]);
}

it('2-1 full-cart-accel：兩塊「20」分別標示「力」和「滿車質量」，陷阱「10」標示「空車質量」', () => {
  expect(labelledTiles(findStep('2-1', 'full-cart-accel'))).toEqual([
    ['10', '空車質量'],
    ['20', '力'],
    ['20', '滿車質量'],
    ['−', undefined],
    ['×', undefined],
    ['÷', undefined],
  ]);
});

it('2-4 moon-weight：1 是質量、1.6 是月球 g、10 是地球 g', () => {
  expect(labelledTiles(findStep('2-4', 'moon-weight'))).toEqual([
    ['1', '質量'],
    ['1.6', '月球 g'],
    ['10', '地球 g'],
    ['+', undefined],
    ['×', undefined],
    ['÷', undefined],
  ]);
});

it('2-5 two-second-distance：兩塊「2」分別標示「取平均」和「時間」，其他數字也標出是什麼', () => {
  expect(labelledTiles(findStep('2-5', 'two-second-distance')).filter(([, label]) => label !== undefined)).toEqual([
    ['0', '一開始速度'],
    ['2', '取平均'],
    ['2', '時間'],
    ['5', '第 1 秒落下'],
    ['20', '最後速度'],
  ]);
});

it('第 2 站複習 bus-brake-size：題目沒寫到的「10」標示「地球 g」，其他數字也標出是什麼', () => {
  expect(labelledTiles(reviewOf(2)?.steps.find((s) => s.id === 'bus-brake-size'))).toEqual([
    ['2', '加速度大小'],
    ['10', '地球 g'],
    ['6000', '質量'],
    ['+', undefined],
    ['×', undefined],
    ['÷', undefined],
  ]);
});

// ---- 選擇題的正確答案不能靠位置或長度猜到（spec 第 3 批 1） ----
// 每個課程／複習檔裡：
// 1. 正確答案是最後一個選項的題目不超過一半；
// 2. 不能連續三題選擇題的正確答案在同一個位置（第幾個相同，或選項數不同但都是最後一個）；
// 3. 正確選項是最長（字數嚴格最多）的那一個的題目不超過一半，只算有 3 個以上選項的題目。
// 引導裡的選擇題要答錯、按「一步一步來」才會出現，所以規則 1、2 兩種走法都檢查：
// 只走主步驟（每題都答對），和打開每一個引導（引導裡的題目緊接在它的主步驟後面，依 withGuides 的順序）。
// 規則 3 只看主步驟：引導是答錯之後一步一步帶到答案的鷹架，正確選項常要把話說完整
// （例如 1-4「都不是：那一瞬間速度剛好是 0」）；選項長度只能靠改文字調整，重新排列解決不了。

type ChoiceLike = Pick<ChoiceStep, 'id' | 'options' | 'answer'>;

const isChoice = (s: Step | GuideStep): s is ChoiceStep => s.kind === 'choice';

/** 學習者會依序遇到的選擇題：[走法, 題目]。 */
function choicePaths(lesson: Lesson): [string, ChoiceStep[]][] {
  return [
    ['只走主步驟', lesson.steps.filter(isChoice)],
    ['打開每一個引導', withGuides(lesson).filter(isChoice)],
  ];
}

/** 正確答案是第幾個選項，從 0 開始。 */
const answerIndex = (s: ChoiceLike): number => s.options.findIndex((o) => o.id === s.answer);

const answerIsLast = (s: ChoiceLike): boolean => answerIndex(s) === s.options.length - 1;

/** 正確選項的字數比其他每一個選項都多（一樣長不算）。 */
function answerIsLongest(s: ChoiceLike): boolean {
  const length = (label: string) => [...label].length;
  const correct = s.options[answerIndex(s)];
  return correct !== undefined && s.options.every((o) => o === correct || length(o.label) < length(correct.label));
}

/** 規則 1：正確答案是最後一個選項的題目超過一半時，回傳問題。 */
function lastAnswerProblems(choices: ChoiceLike[]): string[] {
  const last = choices.filter(answerIsLast);
  if (last.length * 2 <= choices.length) return [];
  return [`${choices.length} 題選擇題裡有 ${last.length} 題正確答案是最後一個（${last.map((s) => s.id).join('、')}），不能超過一半`];
}

/** 規則 2：連續三題正確答案在同一個位置（第幾個相同，或都是最後一個）。 */
function samePositionRunProblems(choices: ChoiceLike[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i + 3 <= choices.length; i++) {
    const run = choices.slice(i, i + 3);
    const ids = run.map((s) => s.id).join('、');
    if (run.every(answerIsLast)) problems.push(`連續三題正確答案都是最後一個：${ids}`);
    else if (run.every((s) => answerIndex(s) === answerIndex(run[0]))) problems.push(`連續三題正確答案都是第 ${answerIndex(run[0]) + 1} 個：${ids}`);
  }
  return problems;
}

/** 規則 3：有 3 個以上選項的題目裡，正確選項是最長的那一個超過一半時，回傳問題。 */
function longestAnswerProblems(choices: ChoiceLike[]): string[] {
  const counted = choices.filter((s) => s.options.length >= 3);
  const longest = counted.filter(answerIsLongest);
  if (longest.length * 2 <= counted.length) return [];
  return [`${counted.length} 題 3 個以上選項的選擇題裡有 ${longest.length} 題正確選項最長（${longest.map((s) => s.id).join('、')}），不能超過一半`];
}

describe('選擇題位置與長度的檢查', () => {
  /** 一題選擇題：選項依序是 labels，正確答案是第 at 個（從 0 開始）。 */
  const q = (id: string, labels: string[], at: number): ChoiceLike => ({
    id,
    options: labels.map((label, i) => ({ id: `o${i}`, label })),
    answer: `o${at}`,
  });
  const abc = ['甲', '乙', '丙'];

  it('最後一個：剛好一半可以，超過一半不行；只有一題時不能是最後一個；沒有選擇題沒問題', () => {
    expect(lastAnswerProblems([q('a', abc, 2), q('b', abc, 0)])).toEqual([]);
    expect(lastAnswerProblems([q('a', abc, 2), q('b', abc, 0), q('c', ['是', '否'], 1)])).toHaveLength(1);
    expect(lastAnswerProblems([q('a', abc, 2)])).toHaveLength(1);
    expect(lastAnswerProblems([q('a', abc, 1)])).toEqual([]);
    expect(lastAnswerProblems([])).toEqual([]);
  });

  it('連續三題：第幾個相同不行，選項數不同但都是最後一個也不行；中間隔一題不同就可以', () => {
    expect(samePositionRunProblems([q('a', abc, 0), q('b', ['是', '否'], 0), q('c', abc, 0)])).toHaveLength(1);
    expect(samePositionRunProblems([q('a', ['是', '否'], 1), q('b', abc, 2), q('c', [...abc, '丁'], 3)])).toHaveLength(1);
    expect(samePositionRunProblems([q('a', abc, 1), q('b', abc, 1), q('c', abc, 0), q('d', abc, 1)])).toEqual([]);
    expect(samePositionRunProblems([q('a', abc, 1), q('b', abc, 1)])).toEqual([]);
  });

  it('最長：只算 3 個以上選項；一樣長不算最長；剛好一半可以，超過一半不行', () => {
    const longAnswer = q('long', ['短', '短', '比較長'], 2);
    const tie = q('tie', ['一樣長', '一樣長', '短'], 0);
    const short = q('short', ['比較長', '短', '短'], 1);
    expect(longestAnswerProblems([longAnswer, short])).toEqual([]);
    expect(longestAnswerProblems([longAnswer, longAnswer, short])).toHaveLength(1);
    expect(longestAnswerProblems([longAnswer, tie])).toEqual([]);
    // 2 個選項的題目不算進分子，也不算進分母
    expect(longestAnswerProblems([short, q('two', ['短', '比較長'], 1)])).toEqual([]);
    expect(longestAnswerProblems([longAnswer, q('two', ['比較長', '短'], 1)])).toHaveLength(1);
  });
});

// ---- 速度–時間圖：觀念卡、選擇題、數字題、表格題可以帶一張（graph），引導裡的也一樣 ----

/**
 * 一張速度–時間圖有什麼問題，沒有問題時是空陣列：
 * tMax、vMax、vStep 都要大於 0；時間軸固定每 1 秒一格，所以 tMax 是整數、最多 VT_MAX_SECONDS 秒（兩位數的數字才不會擠在一起）；
 * vMax 是 vStep 的整數倍（最上面那一格才有數字），最多 VT_MAX_SPEED_CELLS 格（每一格才有 20 的間距，見 VtGraphView）；
 * 一到 VT_MAX_LINES 條線（線的顏色只有 3 種），每條線至少 2 個點、時間嚴格遞增，每個點都在 0～tMax 秒、0～vMax 公尺/秒以內；
 * 線的標籤（有的話）不能是空白、最多 VT_MAX_LABEL 個字（寫在最後一個點的右上方，太長會被切掉）；
 * 虛線長方形（有的話）的 t、v 都大於 0、不超過 tMax、vMax；caption 不能是空的。
 */
const VT_MAX_SECONDS = 10;
const VT_MAX_SPEED_CELLS = 11;
const VT_MAX_LINES = 3;
const VT_MAX_LABEL = 6;

function vtGraphProblems(id: string, g: VtGraph): string[] {
  const problems: string[] = [];
  for (const [name, value] of [['tMax', g.tMax], ['vMax', g.vMax], ['vStep', g.vStep]] as const) {
    if (!(Number.isFinite(value) && value > 0)) problems.push(`${id}：${name} 要大於 0（現在是 ${value}）`);
  }
  if (Number.isFinite(g.tMax) && (!Number.isInteger(g.tMax) || g.tMax > VT_MAX_SECONDS)) {
    problems.push(`${id}：tMax 要是整數、最多 ${VT_MAX_SECONDS} 秒（現在是 ${g.tMax}）：時間軸每 1 秒一格`);
  }
  if (g.vMax > 0 && g.vStep > 0) {
    const cells = g.vMax / g.vStep;
    const whole = Math.abs(cells - Math.round(cells)) <= EPSILON;
    if (!whole || Math.round(cells) > VT_MAX_SPEED_CELLS) {
      problems.push(`${id}：vMax ${g.vMax} 要是 vStep ${g.vStep} 的整數倍、最多 ${VT_MAX_SPEED_CELLS} 格（現在是 ${cells} 格）`);
    }
  }
  if (g.lines.length > VT_MAX_LINES) problems.push(`${id}：最多 ${VT_MAX_LINES} 條線（現在有 ${g.lines.length} 條），第 ${VT_MAX_LINES + 1} 條會和第 1 條同色`);
  const inT = (t: number): boolean => Number.isFinite(t) && t >= 0 && t <= g.tMax;
  const inV = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= g.vMax;
  const range = `0～${g.tMax} 秒、0～${g.vMax} 公尺/秒`;
  if (g.lines.length === 0) problems.push(`${id}：圖上沒有線`);
  for (const [i, line] of g.lines.entries()) {
    const where = `${id}：第 ${i + 1} 條線`;
    if (line.points.length < 2) problems.push(`${where}只有 ${line.points.length} 個點，至少要 2 個`);
    for (const [j, [t, v]] of line.points.entries()) {
      if (!inT(t) || !inV(v)) problems.push(`${where}的點 (${t}, ${v}) 超出 ${range}`);
      if (j > 0 && !(t > line.points[j - 1][0])) problems.push(`${where}的時間沒有遞增：${line.points[j - 1][0]} 秒之後是 ${t} 秒`);
    }
    if (line.label !== undefined && line.label.trim() === '') problems.push(`${where}的標籤是空白`);
    else if (line.label !== undefined && [...line.label].length > VT_MAX_LABEL) problems.push(`${where}的標籤「${line.label}」超過 ${VT_MAX_LABEL} 個字`);
  }
  if (g.box !== undefined) {
    const { t, v } = g.box;
    if (!(inT(t) && t > 0 && inV(v) && v > 0)) problems.push(`${id}：虛線長方形 (${t}, ${v}) 要在 ${range} 以內，t、v 都大於 0`);
  }
  if (g.caption.trim() === '') problems.push(`${id}：caption 是空的`);
  return problems;
}

/** 這一課裡每一張速度–時間圖：[步驟 id, 圖]，包含引導裡的步驟。 */
function graphsOf(lesson: Lesson): [string, VtGraph][] {
  return withGuides(lesson).flatMap((s): [string, VtGraph][] => ('graph' in s && s.graph !== undefined ? [[s.id, s.graph]] : []));
}

describe('vtGraphProblems（速度–時間圖的內容檢查）', () => {
  const good: VtGraph = {
    tMax: 3,
    vMax: 10,
    vStep: 2,
    lines: [
      { points: [[0, 0], [2, 10]], label: '加速', shadeBelow: true },
      { points: [[0, 6], [3, 6]] },
    ],
    box: { t: 2, v: 10 },
    caption: '一條線從 0 升到 10，另一條一直是 6。',
  };
  const withLine = (points: [number, number][]): VtGraph => ({ ...good, lines: [{ points }] });

  it('範圍內、時間遞增、有 caption：沒問題（點剛好在軸的兩端也可以）', () => {
    expect(vtGraphProblems('demo', good)).toEqual([]);
    expect(vtGraphProblems('demo', withLine([[0, 0], [3, 10]]))).toEqual([]);
  });
  it('點超出範圍：時間超過 tMax、速度超過 vMax、負的都不行', () => {
    expect(vtGraphProblems('demo', withLine([[0, 0], [4, 10]]))).toHaveLength(1);
    expect(vtGraphProblems('demo', withLine([[0, 0], [2, 12]]))).toHaveLength(1);
    expect(vtGraphProblems('demo', withLine([[0, -2], [2, 10]]))).toHaveLength(1);
    expect(vtGraphProblems('demo', withLine([[-1, 0], [2, 10]]))).toHaveLength(1);
  });
  it('時間沒有遞增：倒退、或兩個點同一秒都不行', () => {
    expect(vtGraphProblems('demo', withLine([[2, 10], [0, 0]]))).toHaveLength(1);
    expect(vtGraphProblems('demo', withLine([[0, 0], [1, 5], [1, 8]]))).toHaveLength(1);
  });
  it('每條線至少 2 個點，至少要有一條線', () => {
    expect(vtGraphProblems('demo', withLine([[1, 5]]))).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, lines: [] })).toHaveLength(1);
  });
  it('tMax、vMax、vStep 都要大於 0', () => {
    expect(vtGraphProblems('demo', { ...good, vStep: 0 })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, vStep: -2 })).toHaveLength(1);
    // vMax、tMax 不大於 0 時，原本範圍內的點也跟著超出範圍，所以不只一個問題
    expect(vtGraphProblems('demo', { ...good, vMax: 0 }).join('\n')).toContain('vMax 要大於 0');
    expect(vtGraphProblems('demo', { ...good, tMax: 0 }).join('\n')).toContain('tMax 要大於 0');
  });
  it('虛線長方形要在範圍內，t、v 都大於 0', () => {
    expect(vtGraphProblems('demo', { ...good, box: { t: 4, v: 10 } })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, box: { t: 2, v: 11 } })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, box: { t: 0, v: 10 } })).toHaveLength(1);
  });
  it('caption 和線的標籤不能是空白', () => {
    expect(vtGraphProblems('demo', { ...good, caption: ' ' })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, lines: [{ points: [[0, 0], [2, 10]], label: '' }] })).toHaveLength(1);
  });
  // 時間軸固定每 1 秒一格：tMax 不是整數，最後一格沒有數字；超過 10 秒，兩位數的數字會擠在一起
  it('tMax 是整數，最多 10 秒', () => {
    expect(vtGraphProblems('demo', { ...good, tMax: 10 })).toEqual([]);
    expect(vtGraphProblems('demo', { ...good, tMax: 2.5, box: undefined, lines: [{ points: [[0, 0], [2.5, 10]] }] })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, tMax: 11 })).toHaveLength(1);
  });
  // vMax 不是 vStep 的整數倍，最上面那一格沒有數字；超過 11 格，數字會擠在一起
  it('vMax 是 vStep 的整數倍，最多 11 格（小數的格子也可以）', () => {
    expect(vtGraphProblems('demo', { ...good, vMax: 0.6, vStep: 0.2, box: undefined, lines: [{ points: [[0, 0.2], [2, 0.6]] }] })).toEqual([]);
    expect(vtGraphProblems('demo', { ...good, vMax: 11, vStep: 1 })).toEqual([]);
    expect(vtGraphProblems('demo', { ...good, vMax: 10, vStep: 4 })).toHaveLength(1);
    expect(vtGraphProblems('demo', { ...good, vMax: 12, vStep: 1 })).toHaveLength(1);
  });
  // 線的顏色有 3 種，第 4 條會和第 1 條同色
  it('最多 3 條線', () => {
    const line = { points: [[0, 1], [3, 1]] as [number, number][] };
    expect(vtGraphProblems('demo', { ...good, lines: [line, line, line] })).toEqual([]);
    expect(vtGraphProblems('demo', { ...good, lines: [line, line, line, line] })).toHaveLength(1);
  });
  // 標籤寫在最後一個點的右上方，太長會被切掉
  it('線的標籤最多 6 個字', () => {
    const labelled = (label: string): VtGraph => ({ ...good, lines: [{ points: [[0, 0], [2, 10]], label }] });
    expect(vtGraphProblems('demo', labelled('往上丟的球車'))).toEqual([]);
    expect(vtGraphProblems('demo', labelled('往上丟出去的球'))).toHaveLength(1);
  });
  it('graphsOf 找得到主步驟和引導裡的圖', () => {
    const lesson: Lesson = {
      id: 'demo',
      title: '示範',
      steps: [
        { kind: 'concept', id: 'look', body: ['看圖。'], graph: good },
        {
          kind: 'choice',
          id: 'ask',
          prompt: '哪一條？',
          options: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }],
          answer: 'a',
          explanation: '甲。',
          guide: [{ kind: 'number', id: 'ask-guide', prompt: '多高？', answer: 6, explanation: '6。', graph: withLine([[0, 6], [3, 6]]) }],
        },
      ],
    };
    expect(graphsOf(lesson).map(([id]) => id)).toEqual(['look', 'ask-guide']);
  });
});

/** 每一課都要通過的內容檢查。每站的複習包裝成一課（reviewAsLesson）之後，也套用同一套。 */
function lessonContentChecks(lesson: Lesson): void {
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

  it('速度–時間圖（含引導裡的）：點在軸的範圍內、時間遞增、每條至少 2 點，虛線長方形在範圍內，caption 不是空的', () => {
    for (const [id, graph] of graphsOf(lesson)) expect(vtGraphProblems(id, graph)).toEqual([]);
  });

  describe('選擇題的正確答案不能靠位置或長度猜到', () => {
    for (const [path, choices] of choicePaths(lesson)) {
      it(`${path}：正確答案是最後一個選項的題目不超過一半`, () => expect(lastAnswerProblems(choices)).toEqual([]));
      it(`${path}：不會連續三題正確答案在同一個位置`, () => expect(samePositionRunProblems(choices)).toEqual([]));
    }
    it('主步驟裡 3 個以上選項的題目，正確選項是最長的不超過一半', () => {
      expect(longestAnswerProblems(lesson.steps.filter(isChoice))).toEqual([]);
    });
  });
}

describe.each(lessons.map((l) => [l.id, l] as const))('課程 %s', (_id, lesson) => lessonContentChecks(lesson));

// ---- 每站的重點總結與複習：reviews/ 底下的檔案自動讀進來，不算進課程順序，也不影響解鎖 ----

it('第 1 站和第 2 站都有複習', () => {
  expect(reviewOf(1)?.stationId).toBe(1);
  expect(reviewOf(2)?.stationId).toBe(2);
});

it('有複習的站一定有課程（沒有課程的站，地圖上不會有「本站重點與複習」）', () => {
  for (const review of reviews) {
    expect(stations.find((s) => s.id === review.stationId)?.lessons.length, `第 ${review.stationId} 站`).toBeGreaterThan(0);
  }
});

it('reviewOf：沒有這一站時回傳 undefined', () => {
  expect(reviewOf(0)).toBeUndefined();
  expect(reviewOf(99)).toBeUndefined();
});

it('reviewLessonId：複習的 id 是「review-站號」', () => {
  expect(reviewLessonId(1)).toBe('review-1');
  expect(reviewLessonId(2)).toBe('review-2');
});

it('reviewAsLesson：id 是 review-站號，標題是「第 N 站複習」，步驟就是複習題', () => {
  for (const review of reviews) {
    const lesson = reviewAsLesson(review);
    expect(lesson.id).toBe(`review-${review.stationId}`);
    expect(lesson.title).toBe(`第 ${review.stationId} 站複習`);
    expect(lesson.steps).toBe(review.steps);
  }
});

it('findLesson 也找得到複習：回傳的就是 reviewAsLesson 的結果；沒有複習的站找不到', () => {
  for (const review of reviews) expect(findLesson(reviewLessonId(review.stationId))).toEqual(reviewAsLesson(review));
  expect(findLesson('review-99')).toBeUndefined();
  expect(findLesson('review-')).toBeUndefined();
});

it('複習不在 orderedLessonIds 裡：課程的解鎖順序不變', () => {
  for (const review of reviews) expect(orderedLessonIds).not.toContain(reviewLessonId(review.stationId));
  expect(orderedLessonIds.some((id) => id.startsWith('review-'))).toBe(false);
});

it('reviewStationOf：複習的 id 對回它那一站；一般的課、不存在的複習都是 undefined', () => {
  for (const review of reviews) expect(reviewStationOf(reviewLessonId(review.stationId))).toBe(review.stationId);
  for (const id of orderedLessonIds) expect(reviewStationOf(id), id).toBeUndefined();
  expect(reviewStationOf('review-99')).toBeUndefined();
  expect(reviewStationOf('review-')).toBeUndefined();
  expect(reviewStationOf('')).toBeUndefined();
});

it('複習不是任何一站的最後一課（完成複習時不會再出現「看本站重點」）', () => {
  for (const review of reviews) expect(isLastLessonOfStation(reviewLessonId(review.stationId))).toBe(false);
});

it('複習的 id 和課程的 id 不會撞在一起', () => {
  const ids = [...orderedLessonIds, ...reviews.map((r) => reviewLessonId(r.stationId))];
  expect(new Set(ids).size).toBe(ids.length);
});

describe.each(reviews.map((r) => [r.stationId, r] as const))('第 %i 站的重點與複習', (_id, review) => {
  it('3 到 6 個重點，每個不超過 60 字元', () => {
    expect(review.points.length).toBeGreaterThanOrEqual(3);
    expect(review.points.length).toBeLessThanOrEqual(6);
    for (const point of review.points) {
      expect(point.trim(), '重點是空的').not.toBe('');
      expect(point.length, `重點太長：${point}`).toBeLessThanOrEqual(60);
    }
  });

  it('至少 2 條公式，名稱和公式都不是空的，名稱不重複', () => {
    expect(review.formulas.length).toBeGreaterThanOrEqual(2);
    for (const { name, formula } of review.formulas) {
      expect(name.trim(), '公式名稱是空的').not.toBe('');
      expect(formula.trim(), `「${name}」的公式是空的`).not.toBe('');
    }
    const names = review.formulas.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('至少 3 對常見陷阱，錯的想法和正確的想法都不是空的', () => {
    expect(review.traps.length).toBeGreaterThanOrEqual(3);
    for (const { wrong, right } of review.traps) {
      expect(wrong.trim(), '錯的想法是空的').not.toBe('');
      expect(right.trim(), `「${wrong}」的正確想法是空的`).not.toBe('');
    }
  });

  // 觀念放在總結頁（重點、公式、陷阱），複習本身全部是題目。
  it('5 到 8 題，每一步都是要作答的題目', () => {
    expect(review.steps.length).toBeGreaterThanOrEqual(5);
    expect(review.steps.length).toBeLessThanOrEqual(8);
    for (const step of review.steps) expect(isQuestion(step), `${step.id} 是 ${step.kind}，不是題目`).toBe(true);
  });

  it('至少用到兩種題型', () => {
    expect(new Set(review.steps.map((s) => s.kind)).size).toBeGreaterThanOrEqual(2);
  });

  it('重點、公式和陷阱也不放 emoji，也不教「負號就代表減速」', () => {
    const text = JSON.stringify(review);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/負號就?代表減速/);
  });

  // 複習題沿用課程的檢查：可作答、說明、觀念卡長度、拼算式與滑桿的規則、引導不巢狀、表格不填負數等。
  describe('複習題套用課程的內容檢查', () => lessonContentChecks(reviewAsLesson(review)));
});

// 「平均速度 × 時間」只有在速度平均地（均勻地）變化時才成立，公式列的名稱不能寫成「速度一直在變」就都適用。
it('第 1 站複習：「距離 = 平均速度 × 時間」那一列的名稱說明是「速度平均地變化時」', () => {
  const row = reviewOf(1)?.formulas.find((f) => f.formula === '距離 = 平均速度 × 時間');
  expect(row, '找不到「距離 = 平均速度 × 時間」那一列').toBeDefined();
  expect(row?.name).toContain('平均地變化');
});

// 第 1 站複習涵蓋 1-6：公式、陷阱（上課時真的答過的「10、10」），加上一題帶速度–時間圖的混合題。線底下的面積 = 走了多遠，條件要留著。
it('第 1 站複習涵蓋 1-6：速度–時間圖的公式（斜率 = 加速度、線底下的面積 = 走了多遠）、把線的高度當成斜率的陷阱、一題帶圖的混合題', () => {
  const review = reviewOf(1);
  const row = review?.formulas.find((f) => f.name.includes('速度–時間圖'));
  expect(row?.formula).toContain('斜率 = 加速度');
  expect(row?.formula).toContain('線底下的面積 = 走了多遠');
  expect(row?.formula).toContain('一路往同一個方向');
  const trap = review?.traps.find((t) => t.wrong.includes('平線'));
  expect(trap?.wrong).toContain('都是 10');
  expect(trap?.right).toContain('線的高度');
  expect(trap?.right).toContain('速度大，不代表加速度大');

  const step = review?.steps.find((s) => s.id === 'car-scooter-graph');
  if (step?.kind !== 'number') throw new Error('car-scooter-graph 不是數字題');
  expect(step.graph?.lines).toHaveLength(2);
  expect(step.answer).toBe(16);
  // 只算了機車（24）、只算了汽車（40）、把機車當成整整 4 秒都是 12（8）：都有回饋，不說出答案
  for (const value of [24, 40, 8]) {
    const feedback = step.wrongAnswers?.find((wrong) => wrong.value === value)?.feedback ?? '';
    expect(feedback, String(value)).toMatch(/\S/);
    expect(mentionsNumber(feedback, 16), String(value)).toBe(false);
  }
  expect(mentionsNumber(step.graph?.caption ?? '', 16)).toBe(false);
});

// ---- 外部回饋的物理措辭：F = m × a 的 F 是合力、算式題假設沒有摩擦力、g 約 9.8 取 10、平均速度先下定義、速率 ----

/** 主步驟裡的觀念卡內文（接成一個字串）；找不到或不是觀念卡就丟錯。 */
function conceptText(lessonId: string, stepId: string): string {
  const step = findStep(lessonId, stepId);
  if (step?.kind !== 'concept') throw new Error(`${lessonId} 的 ${stepId} 不是觀念卡`);
  return step.body.join('');
}

it('2-1 牛頓第二定律的觀念卡：F 是合力，說明合力是所有力加起來、方向相反的要相減（不說「抵消」，免得讀成完全消掉）', () => {
  const text = conceptText('2-1', 'newton-second');
  expect(text).toContain('合力 = 質量 × 加速度');
  expect(text).toContain('F 是合力');
  expect(text).toContain('方向相反的要相減');
  expect(text).not.toContain('抵消');
  expect(text).not.toMatch(/(?<!合)力 = 質量 × 加速度/);
});

it('2-1 的購物車題（兩題倍數題、滑桿、拼算式）都說明假設沒有摩擦力', () => {
  for (const id of ['double-mass', 'match-accel', 'empty-cart-force', 'full-cart-accel']) {
    const step = findStep('2-1', id);
    expect(step && 'prompt' in step ? step.prompt : '', id).toContain('沒有摩擦力');
  }
});

it('2-1 的 F = 0 題：題目和說明都包含「各個力互相抵消（合力是 0）」，答案和選項不變', () => {
  const step = findStep('2-1', 'zero-force');
  if (step?.kind !== 'choice') throw new Error('zero-force 不是選擇題');
  expect(step.answer).toBe('inertia');
  expect(step.options.map((o) => o.id)).toEqual(['inertia', 'top-of-throw', 'slows-down']);
  for (const text of [step.prompt, step.explanation]) {
    expect(text).toContain('互相抵消');
    expect(text).toContain('合力是 0');
  }
});

it('慣性（1-1 觀念卡、第 1 站重點）和第一定律（第 2 站重點）都包含「力互相抵消」的情況', () => {
  expect(conceptText('1-1', 'inertia')).toContain('互相抵消');
  expect(reviewOf(1)?.points.find((p) => p.startsWith('慣性'))).toContain('互相抵消');
  const firstLaw = reviewOf(2)?.points.find((p) => p.startsWith('第一定律'));
  expect(firstLaw).toContain('合力是 0');
  expect(firstLaw).toContain('抵消');
});

it('第 2 站複習：牛頓第二定律的公式寫「合力」，F = m × a 說的方向是合力的方向', () => {
  const review = reviewOf(2);
  expect(review?.formulas.find((f) => f.name === '牛頓第二定律')?.formula).toBe('F = m × a（合力 = 質量 × 加速度）');
  expect(JSON.stringify(review)).not.toMatch(/(?<!合)力和加速度(的方向一樣|同方向)/);
});

it('地球的 g：說約 9.8、這裡取 10，課程和複習都不說「地球的 g 是 10」', () => {
  for (const lesson of lessons) expect(JSON.stringify(lesson), lesson.id).not.toMatch(/地球的 ?g 是 10|地球 10 公尺/);
  for (const review of reviews) expect(JSON.stringify(review), `第 ${review.stationId} 站複習`).not.toMatch(/地球的 ?g 是 10|地球 10 公尺/);
  expect(conceptText('2-4', 'mass-and-weight')).toContain('約 9.8，這裡取 10');
  expect(reviewOf(2)?.formulas.find((f) => f.name === '重力加速度 g')?.formula).toContain('約 9.8（這裡取 10）');
});

it('1-5 平均速度的觀念卡：先下定義「走了多遠 ÷ 花了多久」，再說速度均勻地變時才是（一開始 + 最後）÷ 2', () => {
  const text = conceptText('1-5', 'average-speed');
  expect(text).toContain('走了多遠 ÷ 花了多久');
  expect(text).toContain('一路往同一個方向'); // 轉彎、折返時平均速度不是這樣算
  expect(text).toContain('每一秒都變一樣多');
  expect(text.indexOf('走了多遠')).toBeLessThan(text.indexOf('（一開始的速度 + 最後的速度）÷ 2'));
});

it('1-5「為什麼是 ÷ 2」的頭尾配對，寫明是因為速度每一秒變一樣多', () => {
  expect(conceptText('1-5', 'why-half')).toContain('每一秒變一樣多');
});

it('1-4 介紹正負號的重力觀念卡，也說明速度和速率的差別；1-4 仍然是 8 步', () => {
  expect(conceptText('1-4', 'gravity')).toContain('速率');
  expect(findLesson('1-4')?.steps).toHaveLength(8);
});

it('2-2 購物車停下來的主角：選項 id 仍然是 friction，選項字數和其他選項差不多（不靠長度猜答案），輪軸的詳細說法放在說明裡', () => {
  const step = findStep('2-2', 'which-force');
  if (step?.kind !== 'choice') throw new Error('which-force 不是選擇題');
  expect(step.answer).toBe('friction');
  const correct = step.options.find((o) => o.id === 'friction');
  expect(correct?.label).toBe('輪子受到的摩擦');
  const longestOther = Math.max(...step.options.filter((o) => o.id !== 'friction').map((o) => o.label.length));
  expect(correct?.label.length ?? Infinity).toBeLessThanOrEqual(longestOther * 2);
  expect(step.explanation).toContain('輪子和地面、輪軸之間的摩擦和阻力');
});

it('2-1 的兩題倍數題只加了「假設沒有摩擦力」：答案、單位、順序都沒變', () => {
  const steps = findLesson('2-1')?.steps ?? [];
  const ids = steps.map((s) => s.id);
  expect(ids.indexOf('double-mass')).toBeGreaterThan(ids.indexOf('mass'));
  expect(ids.indexOf('match-accel')).toBe(ids.indexOf('double-mass') + 1);
  for (const [id, answer] of [['double-mass', 0.5], ['match-accel', 2]] as const) {
    const step = findStep('2-1', id);
    if (step?.kind !== 'number') throw new Error(`${id} 不是數字題`);
    expect(step.answer, id).toBe(answer);
    expect(step.unit, id).toBe('倍');
  }
});
