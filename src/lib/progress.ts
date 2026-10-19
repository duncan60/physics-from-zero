export interface Progress {
  version: 1;
  completed: string[];
  xp: number;
  streak: number;
  lastActiveDay: string | null;
}

export const STORAGE_KEY = 'physics-from-zero:progress';
export const XP_PER_LESSON = 10;
export const XP_PER_FIRST_TRY = 5;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function emptyProgress(): Progress {
  return { version: 1, completed: [], xp: 0, streak: 0, lastActiveDay: null };
}

/** 存取 window.localStorage 本身就可能拋出例外（例如被瀏覽器封鎖），這時回傳 null。 */
export function getStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 驗證從儲存空間讀回來的資料；欄位型別有任何問題就回傳 null。 */
function parseProgress(value: unknown): Progress | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const { completed, xp, streak, lastActiveDay } = value;
  if (!Array.isArray(completed) || !completed.every((id) => typeof id === 'string')) return null;
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) return null;
  if (typeof streak !== 'number' || !Number.isInteger(streak) || streak < 0) return null;
  if (lastActiveDay !== null && !(typeof lastActiveDay === 'string' && DAY_PATTERN.test(lastActiveDay))) return null;
  return { version: 1, completed: [...(completed as string[])], xp, streak, lastActiveDay };
}

/** 永遠不拋出例外：沒有 storage、沒資料、JSON 壞掉、版本或欄位型別不符，都回傳空進度。 */
export function loadProgress(storage: Storage | null): Progress {
  if (!storage) return emptyProgress();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return emptyProgress();
    return parseProgress(JSON.parse(raw)) ?? emptyProgress();
  } catch {
    return emptyProgress();
  }
}

/** 儲存空間滿了、被停用等情況都吞掉：進度只是存不下來，網站仍要能用。 */
export function saveProgress(storage: Storage | null, p: Progress): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 忽略
  }
}

/** 本機時間的 'YYYY-MM-DD'。 */
export function localDayKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** 前一天的 'YYYY-MM-DD'；用本機時間的日期運算，避免 UTC 轉換造成差一天。 */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d - 1));
}

/** 回傳新物件，不改動傳入的 p。同一課重上不重複記錄，但 XP 照加。 */
export function completeLesson(p: Progress, lessonId: string, xpGained: number, today: string): Progress {
  const completed = p.completed.includes(lessonId) ? [...p.completed] : [...p.completed, lessonId];
  let streak: number;
  if (p.lastActiveDay === today) streak = p.streak;
  else if (p.lastActiveDay === previousDay(today)) streak = p.streak + 1;
  else streak = 1;
  return { version: 1, completed, xp: p.xp + xpGained, streak, lastActiveDay: today };
}

/** 畫面上要顯示的連續天數：今天或昨天有學過才算數（今天還來得及延續），否則歸零。 */
export function displayedStreak(p: Progress, today: string): number {
  if (p.lastActiveDay === today || p.lastActiveDay === previousDay(today)) return p.streak;
  return 0;
}

/** 第一課永遠解鎖；其餘要前一課完成。不存在的課程回傳 false。 */
export function isLessonUnlocked(orderedLessonIds: string[], completed: string[], lessonId: string): boolean {
  const index = orderedLessonIds.indexOf(lessonId);
  if (index === -1) return false;
  if (index === 0) return true;
  return completed.includes(orderedLessonIds[index - 1]);
}
