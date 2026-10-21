import { useId } from 'react';
import { buildReportUrl } from '../lib/report';

// 高度寫在這裡（不放在 CSS），保證點擊範圍至少 44px 高，雖然連結本身是次要的小字。
const LINK_STYLE = { minHeight: 44 };

/**
 * 每一步卡片下方的小連結：在新分頁打開 GitHub 的新增 issue 頁面，標題與內容已經填好這一步的課程、步驟、題型和網頁網址。
 * 次要的（小字、不搶眼），旁邊註明需要 GitHub 帳號。網頁網址是畫面出現當下的網站、路徑和 # 後面（#/lesson/...），
 * 不帶查詢字串：`?` 後面可能是追蹤參數之類，和這一題無關，也不該寫進公開的 issue。
 * 螢幕閱讀器念的是「回報問題（在 GitHub 開新分頁）」，再加上「需要 GitHub 帳號」。
 */
export function ReportLink(props: { lessonId: string; lessonTitle: string; stepId: string; stepKind: string }): React.JSX.Element {
  const { lessonId, lessonTitle, stepId, stepKind } = props;
  const noteId = useId();
  const { origin, pathname, hash } = window.location;
  const href = buildReportUrl({ lessonId, lessonTitle, stepId, stepKind, pageUrl: `${origin}${pathname}${hash}` });
  return (
    <p className="lp-report">
      <a className="lp-report-link" href={href} target="_blank" rel="noopener noreferrer" aria-describedby={noteId} style={LINK_STYLE}>
        回報問題
        <span className="lp-sr-only">（在 GitHub 開新分頁）</span>
      </a>
      <span id={noteId} className="lp-report-note">
        需要 GitHub 帳號
      </span>
    </p>
  );
}
