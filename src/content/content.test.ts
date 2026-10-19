import { describe, expect, it } from 'vitest';
import { blankCells } from '../lib/answer';
import type { ConceptStep, GuideStep, Lesson, QuestionStep, Step } from '../lib/types';
import { findLesson, orderedLessonIds, stations } from './stations';

const lessons = stations.flatMap((s) => s.lessons);

/** 主步驟加上每個主步驟 guide 裡的步驟，依出現順序。 */
function withGuides(lesson: Lesson): (Step | GuideStep)[] {
  return lesson.steps.flatMap((s) => [s, ...('guide' in s && s.guide ? s.guide : [])]);
}

function isQuestion(s: Step | GuideStep): s is QuestionStep {
  return s.kind === 'choice' || s.kind === 'number' || s.kind === 'table';
}

function allQuestions(lesson: Lesson): QuestionStep[] {
  return withGuides(lesson).filter(isQuestion);
}

function allConcepts(lesson: Lesson): ConceptStep[] {
  return withGuides(lesson).filter((s): s is ConceptStep => s.kind === 'concept');
}

// 和 answer.ts 的判斷一致：在容許誤差（加上浮點緩衝）以內就算對。
const EPSILON = 1e-9;

function assertAnswerable(s: QuestionStep): void {
  if (s.kind === 'choice') {
    const ids = s.options.map((o) => o.id);
    expect(new Set(ids).size, `${s.id}：選項 id 重複`).toBe(ids.length);
    expect(ids, `${s.id}：answer 不是任何一個選項`).toContain(s.answer);
  } else if (s.kind === 'number') {
    expect(Number.isFinite(s.answer), `${s.id}：answer 不是有限數`).toBe(true);
    for (const wrong of s.wrongAnswers ?? []) {
      const sameAsAnswer = Math.abs(wrong.value - s.answer) <= (s.tolerance ?? 0) + EPSILON;
      expect(sameAsAnswer, `${s.id}：wrongAnswers 的 ${wrong.value} 會被判為正確`).toBe(false);
    }
  } else {
    for (const row of s.rows) expect(row.cells, `${s.id}：「${row.label}」的格數和欄數不同`).toHaveLength(s.columns.length);
    const blanks = blankCells(s);
    expect(blanks.length, `${s.id}：表格沒有空格`).toBeGreaterThan(0);
    for (const blank of blanks) expect(Number.isFinite(blank.answer), `${s.id}：空格答案不是有限數`).toBe(true);
  }
}

it('有 7 站，第 1 站有 4 課', () => {
  expect(stations).toHaveLength(7);
  expect(stations[0].lessons.map((l) => l.id)).toEqual(['1-1', '1-2', '1-3', '1-4']);
});

it('各站的 id 和標題依照 spec 的順序，只有第 1 站有課程', () => {
  expect(stations.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(stations.map((s) => s.title)).toEqual(['運動', '力與牛頓定律', '能量與動量', '波動、聲音與熱', '電與磁', '光', '近代物理']);
  expect(stations.slice(1).every((s) => s.lessons.length === 0)).toBe(true);
});

it('第 1 站的課程標題', () => {
  expect(stations[0].lessons.map((l) => l.title)).toEqual(['慣性', '速度與位置', '加速度', '往上丟的球']);
});

it('orderedLessonIds 與各站課程一致', () => expect(orderedLessonIds).toEqual(lessons.map((l) => l.id)));

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

  it('不會教「負號就代表減速」', () => {
    expect(JSON.stringify(lesson)).not.toMatch(/負號就?代表減速/);
  });

  it('沒有 emoji', () => {
    expect(JSON.stringify(lesson)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
