import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERFECT_BONUS_XP,
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
  mergeProgress,
  previousDay,
  saveProgress,
  setSoundOn,
} from './progress';

it('localDayKey 補零', () => expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05'));
it('previousDay 跨月、跨年', () => { expect(previousDay('2026-03-01')).toBe('2026-02-28'); expect(previousDay('2026-01-01')).toBe('2025-12-31'); });
it('previousDay 閏年', () => expect(previousDay('2028-03-01')).toBe('2028-02-29'));

it('XP 常數', () => { expect(XP_PER_LESSON).toBe(10); expect(XP_PER_FIRST_TRY).toBe(5); expect(PERFECT_BONUS_XP).toBe(5); });

describe('emptyProgress', () => {
  it('每次回傳新物件（不共用陣列）', () => {
    const a = emptyProgress();
    const b = emptyProgress();
    expect(a).toEqual({ version: 2, completed: [], perfect: [], xp: 0, streak: 0, lastActiveDay: null, soundOn: true });
    expect(a).not.toBe(b);
    expect(a.completed).not.toBe(b.completed);
    expect(a.perfect).not.toBe(b.perfect);
  });
});

describe('completeLesson', () => {
  it('第一次完成', () => expect(completeLesson(emptyProgress(), '1-1', 20, '2026-10-19')).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 20, streak: 1, lastActiveDay: '2026-10-19', soundOn: true }));
  it('同一天再完成不會重複加連續天數', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-19').streak).toBe(1); });
  it('隔天完成，連續天數 +1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-20').streak).toBe(2); });
  it('中斷超過一天就重設為 1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-22').streak).toBe(1); });
  it('重上同一課不會重複記錄，但 XP 照加', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); const q = completeLesson(p, '1-1', 10, '2026-10-19'); expect(q.completed).toEqual(['1-1']); expect(q.xp).toBe(20); });
  it('跨月、跨年的隔天也算連續', () => {
    const p = { ...emptyProgress(), streak: 4, lastActiveDay: '2025-12-31' };
    expect(completeLesson(p, '1-1', 10, '2026-01-01').streak).toBe(5);
  });
  it('沒有拿到完美（省略或 false）不會加進 perfect', () => {
    expect(completeLesson(emptyProgress(), '1-1', 10, '2026-10-19').perfect).toEqual([]);
    expect(completeLesson(emptyProgress(), '1-1', 10, '2026-10-19', false).perfect).toEqual([]);
  });
  it('拿到完美才加進 perfect，同時照常記錄完成、XP 和連續天數', () => {
    expect(completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true)).toEqual({
      version: 2, completed: ['1-1'], perfect: ['1-1'], xp: 15, streak: 1, lastActiveDay: '2026-10-19', soundOn: true,
    });
  });
  it('perfect 不重複：同一課再拿完美不會多一筆', () => {
    const p = completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true);
    expect(completeLesson(p, '1-1', 15, '2026-10-19', true).perfect).toEqual(['1-1']);
  });
  it('perfect 永遠不移除：變金色之後重上沒拿到完美，仍然是金色', () => {
    const p = completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true);
    expect(completeLesson(p, '1-1', 10, '2026-10-20').perfect).toEqual(['1-1']);
    expect(completeLesson(p, '1-1', 10, '2026-10-20', false).perfect).toEqual(['1-1']);
    expect(completeLesson(p, '1-2', 10, '2026-10-20', true).perfect).toEqual(['1-1', '1-2']);
  });
  it('soundOn 不受完成課程影響', () => {
    const muted = setSoundOn(emptyProgress(), false);
    expect(completeLesson(muted, '1-1', 10, '2026-10-19', true).soundOn).toBe(false);
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
  it('不改動原本的物件：perfect 也不共用陣列', () => {
    const p = completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true);
    const snapshot = structuredClone(p);
    const q = completeLesson(p, '1-2', 15, '2026-10-20', true);
    const r = completeLesson(p, '1-1', 10, '2026-10-20');
    expect(p).toEqual(snapshot);
    expect(q.perfect).not.toBe(p.perfect);
    expect(r.perfect).not.toBe(p.perfect);
  });
});

describe('setSoundOn', () => {
  it('回傳新物件，只改 soundOn，不改動傳入的物件', () => {
    const p = completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true);
    const snapshot = structuredClone(p);
    const off = setSoundOn(p, false);
    expect(off).not.toBe(p);
    expect(off).toEqual({ ...snapshot, soundOn: false });
    expect(off.completed).not.toBe(p.completed);
    expect(off.perfect).not.toBe(p.perfect);
    expect(p).toEqual(snapshot);
    expect(setSoundOn(off, true)).toEqual(snapshot);
  });
  it('已經是那個狀態也回傳新物件', () => {
    const p = emptyProgress();
    expect(setSoundOn(p, true)).not.toBe(p);
    expect(setSoundOn(p, true)).toEqual(p);
  });
});

describe('mergeProgress（兩個分頁各自的進度合在一起）', () => {
  const day = '2026-10-19';
  it('完成的課取聯集，不重複，原本的順序在前', () => {
    const a = { ...emptyProgress(), completed: ['1-1', '1-2'] };
    const b = { ...emptyProgress(), completed: ['1-1', '1-3'] };
    expect(mergeProgress(a, b).completed).toEqual(['1-1', '1-2', '1-3']);
  });
  it('XP 只會增加，取大的', () => {
    expect(mergeProgress({ ...emptyProgress(), xp: 20 }, { ...emptyProgress(), xp: 35 }).xp).toBe(35);
    expect(mergeProgress({ ...emptyProgress(), xp: 35 }, { ...emptyProgress(), xp: 20 }).xp).toBe(35);
  });
  it('連續天數跟著最後學習日比較晚的那一份', () => {
    const older = { ...emptyProgress(), streak: 5, lastActiveDay: '2026-10-10' };
    const newer = { ...emptyProgress(), streak: 1, lastActiveDay: day };
    expect(mergeProgress(older, newer)).toMatchObject({ streak: 1, lastActiveDay: day });
    expect(mergeProgress(newer, older)).toMatchObject({ streak: 1, lastActiveDay: day });
  });
  it('最後學習日同一天，連續天數取大的', () => {
    const a = { ...emptyProgress(), streak: 2, lastActiveDay: day };
    const b = { ...emptyProgress(), streak: 3, lastActiveDay: day };
    expect(mergeProgress(a, b)).toMatchObject({ streak: 3, lastActiveDay: day });
  });
  it('沒學過的一份（lastActiveDay 是 null）不會蓋掉有學過的', () => {
    const studied = { ...emptyProgress(), completed: ['1-1'], xp: 15, streak: 1, lastActiveDay: day };
    expect(mergeProgress(emptyProgress(), studied)).toEqual(studied);
    expect(mergeProgress(studied, emptyProgress())).toEqual(studied);
  });
  it('perfect 取聯集，不重複，第一份的順序在前', () => {
    const a = { ...emptyProgress(), completed: ['1-1', '1-2'], perfect: ['1-1', '1-2'] };
    const b = { ...emptyProgress(), completed: ['1-1', '1-3'], perfect: ['1-1', '1-3'] };
    expect(mergeProgress(a, b).perfect).toEqual(['1-1', '1-2', '1-3']);
    expect(mergeProgress(b, a).perfect).toEqual(['1-1', '1-3', '1-2']);
  });
  it('只有一邊拿過完美，合併後仍然是完美', () => {
    const golden = { ...emptyProgress(), completed: ['1-1'], perfect: ['1-1'] };
    const plain = { ...emptyProgress(), completed: ['1-1'] };
    expect(mergeProgress(plain, golden).perfect).toEqual(['1-1']);
    expect(mergeProgress(golden, plain).perfect).toEqual(['1-1']);
  });
  it('soundOn 取第一份的，不管最後學習日誰比較晚', () => {
    const off = { ...emptyProgress(), soundOn: false, lastActiveDay: '2026-10-10' };
    const on = { ...emptyProgress(), soundOn: true, lastActiveDay: '2026-10-19' };
    expect(mergeProgress(off, on).soundOn).toBe(false);
    expect(mergeProgress(on, off).soundOn).toBe(true);
    // 最後學習日相同時也一樣
    expect(mergeProgress({ ...off, lastActiveDay: day }, { ...on, lastActiveDay: day }).soundOn).toBe(false);
  });
  it('不改動傳入的物件，也不共用 completed、perfect 陣列', () => {
    const a = { ...emptyProgress(), completed: ['1-1'], perfect: ['1-1'] };
    const b = { ...emptyProgress(), completed: ['1-2'], perfect: ['1-2'] };
    const merged = mergeProgress(a, b);
    expect(merged.completed).not.toBe(a.completed);
    expect(merged.perfect).not.toBe(a.perfect);
    expect(merged.perfect).not.toBe(b.perfect);
    expect(a).toEqual({ ...emptyProgress(), completed: ['1-1'], perfect: ['1-1'] });
    expect(b).toEqual({ ...emptyProgress(), completed: ['1-2'], perfect: ['1-2'] });
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
  const valid = { version: 2, completed: ['1-1'], perfect: ['1-1'], xp: 10, streak: 1, lastActiveDay: '2026-10-19', soundOn: false };
  const validV1 = { version: 1, completed: ['1-1'], xp: 10, streak: 1, lastActiveDay: '2026-10-19' };
  it('沒有 storage', () => expect(loadProgress(null)).toEqual(emptyProgress()));
  it('沒有資料', () => expect(loadProgress(fake(null))).toEqual(emptyProgress()));
  it('JSON 壞掉', () => expect(loadProgress(fake('{oops'))).toEqual(emptyProgress()));
  it('版本 3 或不認得的版本 → 空進度', () => {
    expect(loadProgress(fake(JSON.stringify({ ...valid, version: 3 })))).toEqual(emptyProgress());
    expect(loadProgress(fake(JSON.stringify({ ...valid, version: 0 })))).toEqual(emptyProgress());
    expect(loadProgress(fake(JSON.stringify({ ...valid, version: '2' })))).toEqual(emptyProgress());
    expect(loadProgress(fake(JSON.stringify({ ...valid, version: null })))).toEqual(emptyProgress());
  });
  it('欄位型別不對', () => expect(loadProgress(fake('{"version":1,"completed":"x","xp":1,"streak":1,"lastActiveDay":null}'))).toEqual(emptyProgress()));
  it('getItem 拋出例外', () => expect(loadProgress({ getItem: () => { throw new Error('denied'); } } as unknown as Storage)).toEqual(emptyProgress()));
  it('正常資料可以來回存取', () => { const store = new Map<string, string>(); const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage; const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); saveProgress(s, p); expect(loadProgress(s)).toEqual(p); });
  it('版本 2 來回存取：perfect 和 soundOn 都保留', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    const p = setSoundOn(completeLesson(completeLesson(emptyProgress(), '1-1', 15, '2026-10-19', true), '1-2', 10, '2026-10-19'), false);
    expect(p).toMatchObject({ version: 2, perfect: ['1-1'], soundOn: false });
    saveProgress(s, p);
    expect(loadProgress(s)).toEqual(p);
  });
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

  describe('版本 1 的舊存檔自動轉成版本 2', () => {
    it('版本 1 的存檔會轉成版本 2，資料都保留', () => {
      const v1 = { version: 1, completed: ['1-1', '1-2'], xp: 45, streak: 3, lastActiveDay: '2026-10-19' };
      expect(loadProgress(fake(JSON.stringify(v1)))).toEqual({ version: 2, completed: ['1-1', '1-2'], perfect: [], xp: 45, streak: 3, lastActiveDay: '2026-10-19', soundOn: true });
    });
    it('lastActiveDay 是 null、什麼都還沒完成的舊存檔也能轉', () => {
      const v1 = { version: 1, completed: [], xp: 0, streak: 0, lastActiveDay: null };
      expect(loadProgress(fake(JSON.stringify(v1)))).toEqual(emptyProgress());
    });
    it('舊存檔裡多餘的欄位（包括長得像新欄位的）不會被帶進來', () => {
      const v1 = { ...validV1, perfect: ['1-1'], soundOn: false, extra: 'x' };
      expect(loadProgress(fake(JSON.stringify(v1)))).toEqual({ version: 2, completed: ['1-1'], perfect: [], xp: 10, streak: 1, lastActiveDay: '2026-10-19', soundOn: true });
    });
    it('轉換後的進度存回去就是版本 2，再讀回來一樣', () => {
      const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify(validV1)]]);
      const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
      const migrated = loadProgress(s);
      saveProgress(s, migrated);
      expect(JSON.parse(store.get(STORAGE_KEY) as string)).toMatchObject({ version: 2, completed: ['1-1'], perfect: [], xp: 10, streak: 1, soundOn: true });
      expect(loadProgress(s)).toEqual(migrated);
    });
    it('轉換後可以接著上課：連續天數和 XP 照舊累加', () => {
      const migrated = loadProgress(fake(JSON.stringify({ ...validV1, xp: 45, streak: 3 })));
      expect(completeLesson(migrated, '1-2', 15, '2026-10-20', true)).toEqual({
        version: 2, completed: ['1-1', '1-2'], perfect: ['1-2'], xp: 60, streak: 4, lastActiveDay: '2026-10-20', soundOn: true,
      });
    });
  });

  // 欄位驗證：版本 1 和版本 2 共用的欄位，兩個版本都要擋；任何一個壞掉就回傳空進度（不是只丟掉壞的那一格）。
  describe.each([
    ['版本 1', validV1],
    ['版本 2', valid],
  ])('驗證失敗就回傳空進度（%s）', (_version, base) => {
    it.each([
      ['缺 version', { ...base, version: undefined }],
      ['completed 不是陣列', { ...base, completed: 'x' }],
      ['completed 含非字串', { ...base, completed: ['1-1', 2] }],
      ['completed 缺漏', { ...base, completed: undefined }],
      ['xp 不是數字', { ...base, xp: '10' }],
      ['xp 為負數', { ...base, xp: -1 }],
      ['xp 缺漏', { ...base, xp: undefined }],
      ['streak 不是整數', { ...base, streak: 1.5 }],
      ['streak 為負數', { ...base, streak: -2 }],
      ['streak 缺漏', { ...base, streak: undefined }],
      ['lastActiveDay 不是字串或 null', { ...base, lastActiveDay: 20261019 }],
      ['lastActiveDay 格式不對', { ...base, lastActiveDay: 'yesterday' }],
      ['lastActiveDay 缺漏', { ...base, lastActiveDay: undefined }],
    ])('%s', (_name, value) => expect(loadProgress(fake(JSON.stringify(value)))).toEqual(emptyProgress()));
    it('xp 不是有限數字', () => expect(loadProgress(fake(`{"version":${base.version},"completed":[],"perfect":[],"soundOn":true,"xp":1e999,"streak":0,"lastActiveDay":null}`))).toEqual(emptyProgress()));
  });

  it.each([
    ['null', 'null'],
    ['陣列', '[]'],
    ['字串', '"hello"'],
    ['數字', '42'],
  ])('不是物件就回傳空進度：%s', (_name, raw) => expect(loadProgress(fake(raw))).toEqual(emptyProgress()));

  it.each([
    ['perfect 不是陣列', { ...valid, perfect: '1-1' }],
    ['perfect 是物件', { ...valid, perfect: { '1-1': true } }],
    ['perfect 含非字串', { ...valid, perfect: ['1-1', 2] }],
    ['perfect 缺漏', { ...valid, perfect: undefined }],
    ['perfect 是 null', { ...valid, perfect: null }],
    ['soundOn 不是布林（字串）', { ...valid, soundOn: 'true' }],
    ['soundOn 不是布林（數字）', { ...valid, soundOn: 1 }],
    ['soundOn 缺漏', { ...valid, soundOn: undefined }],
    ['soundOn 是 null', { ...valid, soundOn: null }],
  ])('perfect 或 soundOn 型別不對 → 空進度：%s', (_name, value) => expect(loadProgress(fake(JSON.stringify(value)))).toEqual(emptyProgress()));
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
