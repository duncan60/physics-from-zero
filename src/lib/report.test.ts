import { expect, it } from 'vitest';
import { stations } from '../content/stations';
import { REPORT_LABEL, REPO_ISSUES_URL, buildReportUrl } from './report';

const input = {
  lessonId: '1-3',
  lessonTitle: '加速度',
  stepId: 'speed-up',
  stepKind: 'number',
  pageUrl: 'https://duncan60.github.io/physics-from-zero/#/lesson/1-3',
};

/** 把網址拆開，看 GitHub 實際會收到的 title、body、labels。 */
function parse(url: string): { title: string | null; body: string | null; labels: string | null; keys: string[] } {
  const { searchParams } = new URL(url);
  return { title: searchParams.get('title'), body: searchParams.get('body'), labels: searchParams.get('labels'), keys: [...searchParams.keys()] };
}

it('指向這個 repo 的「新增 issue」頁面，label 是「題目回報」', () => {
  expect(REPO_ISSUES_URL).toBe('https://github.com/duncan60/physics-from-zero/issues/new');
  expect(REPORT_LABEL).toBe('題目回報');
  const url = buildReportUrl(input);
  expect(url.startsWith(`${REPO_ISSUES_URL}?`)).toBe(true);
  expect(parse(url).labels).toBe('題目回報');
});

it('標題和內容解碼後是預先填好的文字：課程、步驟、題型、網址，加上兩個空白段落', () => {
  const { title, body, keys } = parse(buildReportUrl(input));
  expect(title).toBe('[題目回報] 1-3 加速度・speed-up');
  expect(body).toBe(
    [
      '- 課程：1-3 加速度',
      '- 步驟：speed-up',
      '- 題型：number',
      '- 網址：https://duncan60.github.io/physics-from-zero/#/lesson/1-3',
      '',
      '## 哪裡有問題？',
      '',
      '',
      '## 你覺得應該是？',
      '',
      '',
    ].join('\n'),
  );
  // 只有這三個參數，沒有別的（尤其沒有進度、XP 之類的個人資料）
  expect(keys.sort()).toEqual(['body', 'labels', 'title']);
});

it('中文、括號、井字號、and 符號都正確編碼，解碼後原封不動；網址本身沒有多出來的 # 或 &', () => {
  const tricky = {
    lessonId: '9-9',
    lessonTitle: '力(F) & 加速度 #2 [測試] 100%',
    stepId: 'a&b#c=d?e/f',
    stepKind: 'choice',
    pageUrl: 'https://example.com/physics-from-zero/?x=1&y=2#/lesson/9-9',
  };
  const url = buildReportUrl(tricky);
  const { title, body, keys } = parse(url);
  expect(title).toBe('[題目回報] 9-9 力(F) & 加速度 #2 [測試] 100%・a&b#c=d?e/f');
  expect(body).toContain('- 課程：9-9 力(F) & 加速度 #2 [測試] 100%');
  expect(body).toContain('- 步驟：a&b#c=d?e/f');
  expect(body).toContain('- 網址：https://example.com/physics-from-zero/?x=1&y=2#/lesson/9-9');
  expect(keys.sort()).toEqual(['body', 'labels', 'title']); // 內容裡的 & 沒有把參數切開
  expect(new URL(url).hash).toBe(''); // 內容裡的 # 沒有變成網址的 fragment
  // 網址是純 ASCII，查詢字串裡沒有沒編碼的中文、空白、括號、井字號
  expect(url).toMatch(/^[\x21-\x7e]+$/);
  expect(url.slice(REPO_ISSUES_URL.length + 1)).not.toMatch(/[()#\s]/);
});

it('每個真實課程的每一步（含引導裡的步驟）網址都 < 2000 字元；用最長的課程名稱和步驟 id 也是', () => {
  const lessons = stations.flatMap((station) => station.lessons);
  expect(lessons.length).toBeGreaterThan(0);
  const pageUrl = (lessonId: string) => `https://duncan60.github.io/physics-from-zero/#/lesson/${lessonId}`;
  const longest = (values: string[]) => values.reduce((a, b) => (b.length > a.length ? b : a));

  const ids: string[] = [];
  let count = 0;
  for (const lesson of lessons) {
    for (const step of lesson.steps) {
      const guides = 'guide' in step && step.guide !== undefined ? step.guide : [];
      for (const s of [step, ...guides]) {
        ids.push(s.id);
        count += 1;
        const url = buildReportUrl({ lessonId: lesson.id, lessonTitle: lesson.title, stepId: s.id, stepKind: s.kind, pageUrl: pageUrl(lesson.id) });
        expect(url.length, `${lesson.id} ${s.id}`).toBeLessThan(2000);
      }
    }
  }
  expect(count).toBeGreaterThan(lessons.length);

  // 把最長的課程名稱、最長的課程 id、最長的步驟 id 湊在一起，最糟的情況也不會超過
  const worst = buildReportUrl({
    lessonId: longest(lessons.map((l) => l.id)),
    lessonTitle: longest(lessons.map((l) => l.title)),
    stepId: longest(ids),
    stepKind: 'formula',
    pageUrl: pageUrl(longest(lessons.map((l) => l.id))),
  });
  expect(worst.length).toBeLessThan(2000);
});
