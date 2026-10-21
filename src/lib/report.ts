/** 學習者回報題目問題的地方：這個 repo 的 GitHub「新增 issue」頁面。 */
export const REPO_ISSUES_URL = 'https://github.com/duncan60/physics-from-zero/issues/new';

/** 預先選好的 label（要先在 repo 建立）。 */
export const REPORT_LABEL = '題目回報';

export interface ReportInput {
  lessonId: string;
  lessonTitle: string;
  stepId: string;
  /** 步驟的 kind：concept、choice、number、table、formula、slider、match、sim。 */
  stepKind: string;
  /** 回報當下的網頁網址（含 # 後面），維護的人點得開。 */
  pageUrl: string;
}

/**
 * 預先填好的 GitHub 新增 issue 網址。標題和內容只放識別資料（課程、步驟、題型、網頁網址），
 * 沒有進度、XP 或任何個人資料；後面留兩段空白讓回報的人自己填。
 * 用 URLSearchParams 組查詢字串，中文、括號、# 和 & 都會正確編碼。
 */
export function buildReportUrl(input: ReportInput): string {
  const { lessonId, lessonTitle, stepId, stepKind, pageUrl } = input;
  const title = `[${REPORT_LABEL}] ${lessonId} ${lessonTitle}・${stepId}`;
  const body = [
    `- 課程：${lessonId} ${lessonTitle}`,
    `- 步驟：${stepId}`,
    `- 題型：${stepKind}`,
    `- 網址：${pageUrl}`,
    '',
    '## 哪裡有問題？',
    '',
    '',
    '## 你覺得應該是？',
    '',
    '',
  ].join('\n');
  const params = new URLSearchParams({ title, body, labels: REPORT_LABEL });
  return `${REPO_ISSUES_URL}?${params.toString()}`;
}
