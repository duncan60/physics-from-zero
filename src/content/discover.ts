import type { Lesson, StationReview } from '../lib/types';

/** `lessons/` 底下的檔案名稱：站-課-英文名稱.ts，例如 1-6-my-lesson.ts。 */
const LESSON_FILE = /^(\d+)-(\d+)-[a-z0-9-]+\.ts$/;

export interface Discovered {
  /** 每一站的課程，依課號排序。沒有任何課程的站不會出現。 */
  byStation: Map<number, Lesson[]>;
  /** 每一則是一句話，開頭是有問題的檔名（或站），可以直接顯示給人看。空的代表沒有問題。 */
  problems: string[];
}

interface Found {
  file: string;
  station: number;
  number: number;
  lesson: Lesson;
}

/**
 * 把 `import.meta.glob('./lessons/*.ts', { eager: true })` 讀到的課程檔，依站分組、依課號排序，
 * 並檢查檔名和課程 id 對得上、每一站的課號從 1 開始連續、id 不重複。有問題的檔案不會出現在 byStation。
 * `stationIds`：有給的話，不在清單裡的站也算問題。
 */
export function collectLessons(modules: Record<string, { default: Lesson }>, stationIds?: readonly number[]): Discovered {
  const problems: string[] = [];
  const found: Found[] = [];

  for (const [path, module] of Object.entries(modules)) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    const name = LESSON_FILE.exec(file);
    if (name === null) {
      problems.push(`${file}：檔名要是「站-課-英文名稱.ts」，英文名稱只能用小寫英文、數字和連字號，例如 1-6-my-lesson.ts`);
      continue;
    }
    // 還在用具名匯出的檔案，default 是 undefined。
    const lesson = (module as Partial<typeof module>).default;
    if (lesson === undefined) {
      problems.push(`${file}：沒有 export default。課程檔要用 export default 匯出一個 Lesson`);
      continue;
    }
    const station = Number(name[1]);
    const number = Number(name[2]);
    if (lesson.id !== `${station}-${number}`) {
      problems.push(`${file}：檔名開頭是 ${station}-${number}，但課程 id 是 ${lesson.id}，兩邊要一樣`);
    }
    if (stationIds !== undefined && !stationIds.includes(station)) {
      problems.push(`${file}：沒有第 ${station} 站（站有 ${stationIds.join('、')}）`);
      continue;
    }
    found.push({ file, station, number, lesson });
  }

  found.sort((a, b) => a.station - b.station || a.number - b.number || a.file.localeCompare(b.file));

  const fileOfId = new Map<string, string>();
  for (const { file, lesson } of found) {
    const earlier = fileOfId.get(lesson.id);
    if (earlier === undefined) fileOfId.set(lesson.id, file);
    else problems.push(`${file}：課程 id ${lesson.id} 重複，${earlier} 已經用了`);
  }

  const byStation = new Map<number, Lesson[]>();
  for (const entry of found) {
    const lessons = byStation.get(entry.station) ?? [];
    lessons.push(entry.lesson);
    byStation.set(entry.station, lessons);
  }

  const numbersByStation = new Map<number, number[]>();
  for (const { station, number } of found) numbersByStation.set(station, [...(numbersByStation.get(station) ?? []), number]);
  for (const [station, numbers] of numbersByStation) {
    if (numbers.every((n, i) => n === i + 1)) continue;
    const have = numbers.map((n) => `${station}-${n}`).join('、');
    const missing: string[] = [];
    for (let n = 1; n <= numbers[numbers.length - 1]; n++) if (!numbers.includes(n)) missing.push(`${station}-${n}`);
    const lacking = missing.length > 0 ? `，缺 ${missing.join('、')}` : '';
    problems.push(`第 ${station} 站的課號要從 1 開始、連續不跳號：現在有 ${have}${lacking}`);
  }

  return { byStation, problems };
}

/** `reviews/` 底下的檔案名稱：站號-英文名稱.ts，例如 1-motion.ts。英文名稱用小寫英文開頭，才不會和課程檔（1-1-…）搞混。 */
const REVIEW_FILE = /^(\d+)-[a-z][a-z0-9-]*\.ts$/;

export interface DiscoveredReviews {
  /** 每一站的複習。沒有複習的站不會出現。 */
  byStation: Map<number, StationReview>;
  /** 每一則是一句話，開頭是有問題的檔名，可以直接顯示給人看。空的代表沒有問題。 */
  problems: string[];
}

/**
 * 把 `import.meta.glob('./reviews/*.ts', { eager: true })` 讀到的複習檔依站整理，
 * 並檢查檔名格式、檔名開頭的站號和 stationId 一樣、一站只有一個複習檔。有問題的檔案不會出現在 byStation。
 * `stationIds`：有給的話，不在清單裡的站也算問題。
 */
export function collectReviews(modules: Record<string, { default: StationReview }>, stationIds?: readonly number[]): DiscoveredReviews {
  const problems: string[] = [];
  const byStation = new Map<number, StationReview>();
  const fileOfStation = new Map<number, string>();

  // 依檔名排序，重複時保留哪一個、回報哪一個，每次都一樣。
  const entries = Object.entries(modules)
    .map(([path, module]) => [path.slice(path.lastIndexOf('/') + 1), module] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [file, module] of entries) {
    const name = REVIEW_FILE.exec(file);
    if (name === null) {
      problems.push(`${file}：檔名要是「站號-英文名稱.ts」，英文名稱用小寫英文開頭，只能用小寫英文、數字和連字號，例如 3-energy.ts`);
      continue;
    }
    const review = (module as Partial<typeof module>).default;
    if (review === undefined) {
      problems.push(`${file}：沒有 export default。複習檔要用 export default 匯出一個 StationReview`);
      continue;
    }
    const station = Number(name[1]);
    if (review.stationId !== station) {
      problems.push(`${file}：檔名開頭是 ${station}，但 stationId 是 ${review.stationId}，兩邊要一樣`);
      continue;
    }
    if (stationIds !== undefined && !stationIds.includes(station)) {
      problems.push(`${file}：沒有第 ${station} 站（站有 ${stationIds.join('、')}）`);
      continue;
    }
    const earlier = fileOfStation.get(station);
    if (earlier !== undefined) {
      problems.push(`${file}：第 ${station} 站已經有複習檔 ${earlier}，一站只能有一個複習檔`);
      continue;
    }
    fileOfStation.set(station, file);
    byStation.set(station, review);
  }

  return { byStation, problems };
}
