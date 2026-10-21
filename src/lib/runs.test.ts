import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMBO_XP_CAP } from './game';
import type { RunStats } from './game';
import { STORAGE_KEY } from './progress';
import { RUNS_KEY, RUNS_VERSION, clearRun, loadRun, saveRun } from './runs';
import type { SavedRun } from './runs';

// 課內存檔：一課（或一站的複習）做到一半時存起來，重新整理或再打開時從那一步接著做。

const stats: RunStats = { questions: 2, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 };

/** 1-1 共 8 步，做完前 3 步，下一步是第 4 步（索引 3）。 */
function run(overrides: Partial<SavedRun> = {}): SavedRun {
  return { lessonId: '1-1', nextStep: 3, stepCount: 8, stepMissed: false, stats, elapsedMs: 42_000, ...overrides };
}

/** 直接寫進儲存空間的原始資料（模擬舊版、壞掉或被改過的存檔）。 */
function writeRaw(value: unknown): void {
  window.localStorage.setItem(RUNS_KEY, typeof value === 'string' ? value : JSON.stringify(value));
}

function rawFile(): unknown {
  const raw = window.localStorage.getItem(RUNS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('saveRun／loadRun', () => {
  it('存進去再讀出來一模一樣；存在自己的 key，不碰一般進度', () => {
    saveRun(window.localStorage, run());
    expect(loadRun(window.localStorage, '1-1', 8)).toEqual(run());
    expect(rawFile()).toEqual({ version: RUNS_VERSION, runs: { '1-1': run() } });
    expect(RUNS_KEY).toBe('physics-from-zero:runs');
    expect(RUNS_KEY).not.toBe(STORAGE_KEY);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('每一課各有一份；同一課再存一次只取代那一課的', () => {
    saveRun(window.localStorage, run());
    saveRun(window.localStorage, run({ lessonId: 'review-1', nextStep: 1, stepCount: 5, stats: { questions: 1, clean: 1, combo: 1, bestCombo: 1, comboXp: 0 } }));
    saveRun(window.localStorage, run({ nextStep: 5, stats: { questions: 3, clean: 3, combo: 3, bestCombo: 3, comboXp: 1 } }));
    expect(loadRun(window.localStorage, '1-1', 8)).toMatchObject({ nextStep: 5, stats: { questions: 3, comboXp: 1 } });
    expect(loadRun(window.localStorage, 'review-1', 5)).toMatchObject({ lessonId: 'review-1', nextStep: 1 });
  });

  it('沒存過、或存的是別一課：null', () => {
    expect(loadRun(window.localStorage, '1-1', 8)).toBeNull();
    saveRun(window.localStorage, run());
    expect(loadRun(window.localStorage, '1-2', 8)).toBeNull();
  });

  it('這一題答錯過（stepMissed）時，第一步也可以存：回來重做這一題，也不算一次答對', () => {
    saveRun(window.localStorage, run({ nextStep: 0, stepMissed: true, stats: { questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 } }));
    expect(loadRun(window.localStorage, '1-1', 8)).toMatchObject({ nextStep: 0, stepMissed: true });
  });

  it('不會被 Object 原型上的名字騙到', () => {
    saveRun(window.localStorage, run());
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(loadRun(window.localStorage, id, 8), id).toBeNull();
  });

  it('沒有 storage（null）：讀到 null，存和清都什麼都不做', () => {
    expect(loadRun(null, '1-1', 8)).toBeNull();
    expect(() => saveRun(null, run())).not.toThrow();
    expect(() => clearRun(null, '1-1')).not.toThrow();
  });
});

describe('loadRun：壞掉、版本不符、課程改過，一律當作沒有存檔（null），不拋出例外', () => {
  const broken: [string, unknown][] = [
    ['不是 JSON', '{not json'],
    ['JSON 是 null', null],
    ['JSON 是陣列', [run()]],
    ['沒有版本號', { runs: { '1-1': run() } }],
    ['版本不符（以後的版本）', { version: RUNS_VERSION + 1, runs: { '1-1': run() } }],
    ['版本是字串', { version: String(RUNS_VERSION), runs: { '1-1': run() } }],
    ['runs 不是物件', { version: RUNS_VERSION, runs: [run()] }],
    ['這一課的存檔不是物件', { version: RUNS_VERSION, runs: { '1-1': 'oops' } }],
    ['lessonId 和 key 對不上', { version: RUNS_VERSION, runs: { '1-1': run({ lessonId: '1-2' }) } }],
    ['nextStep 超出範圍（等於步數）', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: 8 }) } }],
    ['nextStep 超出範圍（太大）', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: 99 }) } }],
    ['nextStep 是負數', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: -1 }) } }],
    ['nextStep 是小數', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: 2.5 }) } }],
    ['nextStep 是字串', { version: RUNS_VERSION, runs: { '1-1': { ...run(), nextStep: '3' } } }],
    ['課程改過：步數不一樣', { version: RUNS_VERSION, runs: { '1-1': run({ stepCount: 9 }) } }],
    ['第一步、也沒答錯過：沒有什麼好接著做的', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: 0, stats: { questions: 0, clean: 0, combo: 0, bestCombo: 0, comboXp: 0 } }) } }],
    ['stepMissed 不是布林值', { version: RUNS_VERSION, runs: { '1-1': { ...run(), stepMissed: 'no' } } }],
    ['elapsedMs 是負數', { version: RUNS_VERSION, runs: { '1-1': run({ elapsedMs: -1 }) } }],
    ['elapsedMs 不是數字', { version: RUNS_VERSION, runs: { '1-1': { ...run(), elapsedMs: '42000' } } }],
    ['elapsedMs 是 null（JSON 存不了 Infinity、NaN）', { version: RUNS_VERSION, runs: { '1-1': { ...run(), elapsedMs: null } } }],
    ['沒有 stats', { version: RUNS_VERSION, runs: { '1-1': { ...run(), stats: undefined } } }],
    ['stats 少了欄位', { version: RUNS_VERSION, runs: { '1-1': { ...run(), stats: { questions: 2, clean: 1, combo: 1, bestCombo: 1 } } } }],
    ['stats 有負數', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { ...stats, clean: -1 } }) } }],
    ['stats 有小數', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { ...stats, questions: 1.5 } }) } }],
    ['一次答對的比做過的題目多', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { ...stats, clean: 3 } }) } }],
    ['做過的題目比走過的步驟多', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { questions: 4, clean: 4, combo: 4, bestCombo: 4, comboXp: 2 } }) } }],
    ['連續答對比一次答對的題數多', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { ...stats, combo: 2, bestCombo: 2 } }) } }],
    ['最長連續答對比目前的連續答對短', { version: RUNS_VERSION, runs: { '1-1': run({ stats: { ...stats, bestCombo: 0 } }) } }],
    ['Combo 加分超過上限', { version: RUNS_VERSION, runs: { '1-1': run({ nextStep: 7, stats: { questions: 7, clean: 7, combo: 7, bestCombo: 7, comboXp: COMBO_XP_CAP + 1 } }) } }],
  ];

  for (const [name, value] of broken) {
    it(name, () => {
      writeRaw(value);
      expect(() => loadRun(window.localStorage, '1-1', 8)).not.toThrow();
      expect(loadRun(window.localStorage, '1-1', 8)).toBeNull();
    });
  }

  it('getItem 拋出例外（儲存空間被封鎖）', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(loadRun(window.localStorage, '1-1', 8)).toBeNull();
  });

  it('同一個檔案裡別一課的存檔壞掉，不影響這一課', () => {
    writeRaw({ version: RUNS_VERSION, runs: { '1-1': run(), '1-2': 'oops' } });
    expect(loadRun(window.localStorage, '1-1', 8)).toEqual(run());
    expect(loadRun(window.localStorage, '1-2', 8)).toBeNull();
  });
});

describe('saveRun：存不進去也不拋出例外', () => {
  it('setItem 拋出例外（空間滿了）', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveRun(window.localStorage, run())).not.toThrow();
  });

  it('getItem 拋出例外', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => saveRun(window.localStorage, run())).not.toThrow();
  });

  it('原本的檔案壞掉或版本不符：換成只有這一課的新檔案', () => {
    for (const value of ['{not json', { version: RUNS_VERSION + 1, runs: { '1-2': run({ lessonId: '1-2' }) } }]) {
      writeRaw(value);
      saveRun(window.localStorage, run());
      expect(rawFile()).toEqual({ version: RUNS_VERSION, runs: { '1-1': run() } });
    }
  });
});

describe('clearRun', () => {
  it('只清掉這一課的；最後一份也清掉時，整個 key 拿掉', () => {
    saveRun(window.localStorage, run());
    saveRun(window.localStorage, run({ lessonId: '1-2' }));
    clearRun(window.localStorage, '1-1');
    expect(loadRun(window.localStorage, '1-1', 8)).toBeNull();
    expect(loadRun(window.localStorage, '1-2', 8)).toEqual(run({ lessonId: '1-2' }));
    clearRun(window.localStorage, '1-2');
    expect(window.localStorage.getItem(RUNS_KEY)).toBeNull();
  });

  it('沒有這一課的存檔：什麼都不寫', () => {
    saveRun(window.localStorage, run());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    clearRun(window.localStorage, '1-2');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('寫入拋出例外也不拋出', () => {
    saveRun(window.localStorage, run());
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => clearRun(window.localStorage, '1-1')).not.toThrow();
  });
});
