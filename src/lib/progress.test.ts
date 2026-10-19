import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY,
  XP_PER_FIRST_TRY,
  XP_PER_LESSON,
  completeLesson,
  displayedStreak,
  emptyProgress,
  getStorage,
  isLessonUnlocked,
  loadProgress,
  localDayKey,
  previousDay,
  saveProgress,
} from './progress';

it('localDayKey 補零', () => expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05'));
it('previousDay 跨月、跨年', () => { expect(previousDay('2026-03-01')).toBe('2026-02-28'); expect(previousDay('2026-01-01')).toBe('2025-12-31'); });
it('previousDay 閏年', () => expect(previousDay('2028-03-01')).toBe('2028-02-29'));

it('XP 常數', () => { expect(XP_PER_LESSON).toBe(10); expect(XP_PER_FIRST_TRY).toBe(5); });

describe('emptyProgress', () => {
  it('每次回傳新物件（不共用陣列）', () => {
    const a = emptyProgress();
    const b = emptyProgress();
    expect(a).toEqual({ version: 1, completed: [], xp: 0, streak: 0, lastActiveDay: null });
    expect(a).not.toBe(b);
    expect(a.completed).not.toBe(b.completed);
  });
});

describe('completeLesson', () => {
  it('第一次完成', () => expect(completeLesson(emptyProgress(), '1-1', 20, '2026-10-19')).toEqual({ version: 1, completed: ['1-1'], xp: 20, streak: 1, lastActiveDay: '2026-10-19' }));
  it('同一天再完成不會重複加連續天數', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-19').streak).toBe(1); });
  it('隔天完成，連續天數 +1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-20').streak).toBe(2); });
  it('中斷超過一天就重設為 1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-22').streak).toBe(1); });
  it('重上同一課不會重複記錄，但 XP 照加', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); const q = completeLesson(p, '1-1', 10, '2026-10-19'); expect(q.completed).toEqual(['1-1']); expect(q.xp).toBe(20); });
  it('跨月、跨年的隔天也算連續', () => {
    const p = { ...emptyProgress(), streak: 4, lastActiveDay: '2025-12-31' };
    expect(completeLesson(p, '1-1', 10, '2026-01-01').streak).toBe(5);
  });
  it('不改動原本的物件', () => {
    const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19');
    const snapshot = structuredClone(p);
    const q = completeLesson(p, '1-2', 15, '2026-10-20');
    expect(p).toEqual(snapshot);
    expect(q).not.toBe(p);
    expect(q.completed).not.toBe(p.completed);
    // 重上同一課也要回傳新的 completed 陣列，不能與舊物件共用
    const r = completeLesson(p, '1-1', 10, '2026-10-19');
    expect(r.completed).not.toBe(p.completed);
    expect(p).toEqual(snapshot);
  });
});

describe('displayedStreak', () => {
  const p = { ...emptyProgress(), streak: 3, lastActiveDay: '2026-10-19' };
  it('今天', () => expect(displayedStreak(p, '2026-10-19')).toBe(3));
  it('昨天（今天還來得及）', () => expect(displayedStreak(p, '2026-10-20')).toBe(3));
  it('前天以前就是 0', () => expect(displayedStreak(p, '2026-10-21')).toBe(0));
  it('從沒學過就是 0', () => expect(displayedStreak(emptyProgress(), '2026-10-19')).toBe(0));
});

describe('loadProgress', () => {
  const fake = (value: string | null): Storage => ({ getItem: () => value } as unknown as Storage);
  const valid = { version: 1, completed: ['1-1'], xp: 10, streak: 1, lastActiveDay: '2026-10-19' };
  it('沒有 storage', () => expect(loadProgress(null)).toEqual(emptyProgress()));
  it('沒有資料', () => expect(loadProgress(fake(null))).toEqual(emptyProgress()));
  it('JSON 壞掉', () => expect(loadProgress(fake('{oops'))).toEqual(emptyProgress()));
  it('版本不符', () => expect(loadProgress(fake('{"version":2}'))).toEqual(emptyProgress()));
  it('欄位型別不對', () => expect(loadProgress(fake('{"version":1,"completed":"x","xp":1,"streak":1,"lastActiveDay":null}'))).toEqual(emptyProgress()));
  it('getItem 拋出例外', () => expect(loadProgress({ getItem: () => { throw new Error('denied'); } } as unknown as Storage)).toEqual(emptyProgress()));
  it('正常資料可以來回存取', () => { const store = new Map<string, string>(); const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage; const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); saveProgress(s, p); expect(loadProgress(s)).toEqual(p); });
  it('saveProgress 吞掉例外', () => expect(() => saveProgress({ setItem: () => { throw new Error('full'); } } as unknown as Storage, emptyProgress())).not.toThrow());

  it('讀寫都用 STORAGE_KEY', () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    const s = { getItem, setItem } as unknown as Storage;
    loadProgress(s);
    saveProgress(s, emptyProgress());
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(emptyProgress()));
  });
  it('saveProgress 沒有 storage 也不會拋出例外', () => expect(() => saveProgress(null, emptyProgress())).not.toThrow());

  it('完整合法資料原樣讀回', () => expect(loadProgress(fake(JSON.stringify(valid)))).toEqual(valid));
  it('lastActiveDay 可以是 null', () => expect(loadProgress(fake(JSON.stringify({ ...valid, lastActiveDay: null })))).toEqual({ ...valid, lastActiveDay: null }));
  it('忽略多餘欄位', () => expect(loadProgress(fake(JSON.stringify({ ...valid, extra: 'x' })))).toEqual(valid));

  it.each([
    ['null', 'null'],
    ['陣列', '[]'],
    ['字串', '"hello"'],
    ['數字', '42'],
    ['缺 version', JSON.stringify({ ...valid, version: undefined })],
    ['completed 含非字串', JSON.stringify({ ...valid, completed: ['1-1', 2] })],
    ['xp 不是數字', JSON.stringify({ ...valid, xp: '10' })],
    ['xp 為負數', JSON.stringify({ ...valid, xp: -1 })],
    ['xp 不是有限數字', '{"version":1,"completed":[],"xp":1e999,"streak":0,"lastActiveDay":null}'],
    ['streak 不是整數', JSON.stringify({ ...valid, streak: 1.5 })],
    ['streak 為負數', JSON.stringify({ ...valid, streak: -2 })],
    ['streak 缺漏', JSON.stringify({ ...valid, streak: undefined })],
    ['lastActiveDay 不是字串或 null', JSON.stringify({ ...valid, lastActiveDay: 20261019 })],
    ['lastActiveDay 格式不對', JSON.stringify({ ...valid, lastActiveDay: 'yesterday' })],
    ['lastActiveDay 缺漏', JSON.stringify({ ...valid, lastActiveDay: undefined })],
  ])('驗證失敗就回傳空進度：%s', (_name, raw) => expect(loadProgress(fake(raw))).toEqual(emptyProgress()));
});

describe('getStorage', () => {
  afterEach(() => vi.restoreAllMocks());
  it('正常時回傳 window.localStorage', () => expect(getStorage()).toBe(window.localStorage));
  it('存取 localStorage 拋出例外時回傳 null', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(getStorage()).toBeNull();
  });
});

describe('isLessonUnlocked', () => {
  const order = ['1-1', '1-2', '1-3'];
  it('第一課永遠解鎖', () => expect(isLessonUnlocked(order, [], '1-1')).toBe(true));
  it('前一課完成才解鎖', () => { expect(isLessonUnlocked(order, [], '1-2')).toBe(false); expect(isLessonUnlocked(order, ['1-1'], '1-2')).toBe(true); });
  it('不存在的課程', () => expect(isLessonUnlocked(order, ['1-1'], '9-9')).toBe(false));
  it('只看前一課，不看更早的課', () => { expect(isLessonUnlocked(order, ['1-1'], '1-3')).toBe(false); expect(isLessonUnlocked(order, ['1-2'], '1-3')).toBe(true); });
});
