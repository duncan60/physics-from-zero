import { COMBO_XP_CAP } from './game';
import type { RunStats } from './game';

/**
 * 課內存檔：一課（或一站的複習）做到一半時存起來，重新整理、或從地圖再打開同一課時，從那一步接著做。
 * 和一般進度（progress.ts 的 STORAGE_KEY）分開存，有自己的版本號，一般進度的格式完全不變。
 * 每一課最多一份（以課程 id 為 key）。同時開好幾個分頁時以最後寫入的為準，不合併。
 *
 * 儲存的格式：`{ version: RUNS_VERSION, runs: { [課程 id]: SavedRun } }`。
 */
export const RUNS_KEY = 'physics-from-zero:runs';

/** 課內存檔的格式版本。格式改了就加一：讀到別的版本一律當作沒有存檔，從頭開始。 */
export const RUNS_VERSION = 1;

/** 一課做到一半的存檔。 */
export interface SavedRun {
  lessonId: string;
  /** 回來時從哪一步開始（從 0 算起）：按「繼續」進到下一步時是那一步；這一題答錯過時是這一題本身（見 stepMissed）。 */
  nextStep: number;
  /** 存檔時這一課有幾步。課程內容改過（步數不一樣）時，原本的位置可能指到別的步驟，所以從頭開始。 */
  stepCount: number;
  /**
   * nextStep 那一題離開前已經答錯過（之後才有引導、看解答）。回來時這一題重新開始作答（不保存題目裡的半成品），
   * 但不算一次答對；不然離開再回來就能把答錯的題目變成一次答對。
   */
  stepMissed: boolean;
  /** nextStep 之前的題目的作答統計（一次答對數、Combo 等），完成時的 XP、完美、正確率都從這裡接著算。 */
  stats: RunStats;
  /**
   * 到存檔為止，在這一課花了多少時間（毫秒）。回來時從這裡接著算，離開的那段時間不算進「花了多久」。
   * 不存開始的時間點：上課畫面的時鐘（performance.now()）重新整理後會從 0 開始，跨頁面比較沒有意義。
   */
  elapsedMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** 欄位型別不對，或數字互相矛盾（recordQuestion 不可能算出來的組合），都回傳 null。 */
function parseStats(value: unknown): RunStats | null {
  if (!isRecord(value)) return null;
  const { questions, clean, combo, bestCombo, comboXp } = value;
  if (!isCount(questions) || !isCount(clean) || !isCount(combo) || !isCount(bestCombo) || !isCount(comboXp)) return null;
  if (clean > questions || combo > clean || bestCombo < combo || bestCombo > clean || comboXp > COMBO_XP_CAP) return null;
  return { questions, clean, combo, bestCombo, comboXp };
}

/** 驗證一課的存檔；任何一個欄位有問題、或和現在的課程對不上，就回傳 null。 */
function parseRun(value: unknown, lessonId: string, stepCount: number): SavedRun | null {
  if (!isRecord(value) || value.lessonId !== lessonId || value.stepCount !== stepCount) return null;
  const { nextStep, stepMissed, elapsedMs } = value;
  if (!isCount(nextStep) || nextStep >= stepCount) return null;
  if (typeof stepMissed !== 'boolean') return null;
  // 還在第一步、也沒答錯過：沒有什麼好接著做的（不會這樣存，讀到了也不顯示「從上次的第 1 步繼續」）。
  if (nextStep === 0 && !stepMissed) return null;
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const stats = parseStats(value.stats);
  // 做過的題目不會比走過的步驟多
  if (stats === null || stats.questions > nextStep) return null;
  return { lessonId, nextStep, stepCount, stepMissed, stats, elapsedMs };
}

/**
 * 讀出所有課的存檔（還沒逐一驗證）。沒有資料、JSON 壞掉、版本不符，都當作空的。
 * storage.getItem 本身拋出的例外不在這裡處理，由呼叫端吞掉。
 */
function readRuns(storage: Storage): Record<string, unknown> {
  const raw = storage.getItem(RUNS_KEY);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || parsed.version !== RUNS_VERSION || !isRecord(parsed.runs)) return {};
  return { ...parsed.runs };
}

function writeRuns(storage: Storage, runs: Record<string, unknown>): void {
  if (Object.keys(runs).length === 0) storage.removeItem(RUNS_KEY);
  else storage.setItem(RUNS_KEY, JSON.stringify({ version: RUNS_VERSION, runs }));
}

/**
 * 這一課的存檔；沒有的話回傳 null。永遠不拋出例外：沒有 storage、讀不到、資料壞掉、版本不符、
 * nextStep 超出範圍或步數和現在的課程不一樣（課程改過），都回傳 null，從頭開始。
 */
export function loadRun(storage: Storage | null, lessonId: string, stepCount: number): SavedRun | null {
  if (!storage) return null;
  try {
    const runs = readRuns(storage);
    return hasOwn(runs, lessonId) ? parseRun(runs[lessonId], lessonId, stepCount) : null;
  } catch {
    return null;
  }
}

/** 存這一課的存檔（取代這一課原本的，其他課的不動）。原本的檔案壞掉或版本不符時整個換掉。存不進去就算了，照常上課。 */
export function saveRun(storage: Storage | null, run: SavedRun): void {
  if (!storage) return;
  try {
    const runs = readRuns(storage);
    runs[run.lessonId] = run;
    writeRuns(storage, runs);
  } catch {
    // 忽略：只是這次存不下來
  }
}

/** 清掉這一課的存檔（上完這一課、或按了「從頭開始」）。沒有這一課的存檔就什麼都不寫。不拋出例外。 */
export function clearRun(storage: Storage | null, lessonId: string): void {
  if (!storage) return;
  try {
    const runs = readRuns(storage);
    if (!hasOwn(runs, lessonId)) return;
    delete runs[lessonId];
    writeRuns(storage, runs);
  } catch {
    // 忽略
  }
}
