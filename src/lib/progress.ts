export interface Progress {
  version: 2;
  completed: string[];
  /** 拿過完美（所有題目都一次答對）的課；只增不減，用來讓那一課變金色。 */
  perfect: string[];
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  soundOn: boolean;
}

export const STORAGE_KEY = 'physics-from-zero:progress';
export const XP_PER_LESSON = 10;
export const XP_PER_FIRST_TRY = 5;
export const PERFECT_BONUS_XP = 5;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function emptyProgress(): Progress {
  return { version: 2, completed: [], perfect: [], xp: 0, streak: 0, lastActiveDay: null, soundOn: true };
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** 版本 1 和版本 2 共有的欄位；任何一個型別有問題就回傳 null。 */
function parseSharedFields(value: Record<string, unknown>): Pick<Progress, 'completed' | 'xp' | 'streak' | 'lastActiveDay'> | null {
  const { completed, xp, streak, lastActiveDay } = value;
  if (!isStringArray(completed)) return null;
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) return null;
  if (typeof streak !== 'number' || !Number.isInteger(streak) || streak < 0) return null;
  if (lastActiveDay !== null && !(typeof lastActiveDay === 'string' && DAY_PATTERN.test(lastActiveDay))) return null;
  return { completed: [...completed], xp, streak, lastActiveDay };
}

/**
 * 驗證從儲存空間讀回來的資料；欄位型別有任何問題就回傳 null。
 * 版本 1 的舊存檔（還沒有完美課程和音效設定）先轉成版本 2：完成的課、XP、連續天數原樣保留，
 * 完美清單從空的開始、音效預設開啟。其他版本一律不認得。
 */
function parseProgress(value: unknown): Progress | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return null;
  const shared = parseSharedFields(value);
  if (shared === null) return null;
  if (value.version === 1) return { version: 2, completed: shared.completed, perfect: [], xp: shared.xp, streak: shared.streak, lastActiveDay: shared.lastActiveDay, soundOn: true };
  const { perfect, soundOn } = value;
  if (!isStringArray(perfect) || typeof soundOn !== 'boolean') return null;
  return { version: 2, completed: shared.completed, perfect: [...perfect], xp: shared.xp, streak: shared.streak, lastActiveDay: shared.lastActiveDay, soundOn };
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

/**
 * 回傳新物件，不改動傳入的 p。同一課重上不重複記錄，但 XP 照加。
 * perfect 為 true（這一課所有題目都一次答對）才把這一課加進完美清單，不重複；已經在清單裡的永遠不會被移除。
 * xpGained 由呼叫端算好（完美的加分 PERFECT_BONUS_XP 也在裡面），這裡只負責記錄。
 */
export function completeLesson(p: Progress, lessonId: string, xpGained: number, today: string, perfect = false): Progress {
  const completed = p.completed.includes(lessonId) ? [...p.completed] : [...p.completed, lessonId];
  const perfectLessons = perfect && !p.perfect.includes(lessonId) ? [...p.perfect, lessonId] : [...p.perfect];
  let streak: number;
  if (p.lastActiveDay === today) streak = p.streak;
  else if (p.lastActiveDay === previousDay(today)) streak = p.streak + 1;
  else streak = 1;
  return { version: 2, completed, perfect: perfectLessons, xp: p.xp + xpGained, streak, lastActiveDay: today, soundOn: p.soundOn };
}

/** 回傳新物件，不改動傳入的 p。 */
export function setSoundOn(p: Progress, on: boolean): Progress {
  return { ...p, completed: [...p.completed], perfect: [...p.perfect], soundOn: on };
}

/**
 * 合併兩份進度（例如這個分頁記得的，和別的分頁剛存進儲存空間的），兩邊做過的都留下：
 * 完成的課、完美的課都取聯集（完美只增不減），XP 取大的（XP 只會增加），
 * 連續天數跟著最後學習日比較晚的那一份，同一天就取大的。音效開關取 a 的（呼叫端傳這個分頁目前的設定）。
 * 回傳新物件，不改動傳入的物件。
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const completed = [...a.completed, ...b.completed.filter((id) => !a.completed.includes(id))];
  const perfect = [...a.perfect, ...b.perfect.filter((id) => !a.perfect.includes(id))];
  const xp = Math.max(a.xp, b.xp);
  const soundOn = a.soundOn;
  // 'YYYY-MM-DD' 照字串比就是照日期比；沒學過（null）比任何一天都早。
  const aDay = a.lastActiveDay ?? '';
  const bDay = b.lastActiveDay ?? '';
  if (aDay === bDay) return { version: 2, completed, perfect, xp, streak: Math.max(a.streak, b.streak), lastActiveDay: a.lastActiveDay, soundOn };
  const later = aDay > bDay ? a : b;
  return { version: 2, completed, perfect, xp, streak: later.streak, lastActiveDay: later.lastActiveDay, soundOn };
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
