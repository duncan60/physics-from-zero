# 題目維護與每站總結複習 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加上回報問題連結、自動讀取課程、本機預覽頁、每站重點總結與複習，並修掉上一批留下的三個小問題。

**Architecture:** 課程與每站複習都用 `import.meta.glob` 自動讀取；複習在執行時包裝成一個 `Lesson`（id `review-站號`），沿用現有的上課流程與進度清單，不改存檔版本。新路由：`#/review/站號`（總結頁）與只在開發模式存在的 `#/preview`。

**Tech Stack:** 沿用現有（Vite、React 19、TypeScript strict、Vitest、Testing Library）。不加執行期依賴。

**Spec:** `docs/superpowers/specs/2026-10-21-maintenance-and-station-review-design.md`（前兩份設計的目標、非目標、反目標仍然有效）

## Global Constraints

- 繁體中文（台灣）、不用 emoji；360px 不得水平捲軸；可點的東西 ≥ 44px；淺色深色；尊重減少動態效果。
- 不得有愛心、扣命、倒數計時、排行榜、答錯扣分；複習不影響下一站的解鎖。
- 不改存檔版本（仍是版本 2）；複習的完成與完美記在既有的 `completed`／`perfect`。
- 正式建置不能包含預覽頁。
- 回報網址只帶課程 id、步驟 id、題型、頁面網址，不帶個人資料；`target="_blank" rel="noopener noreferrer"`。
- 每課 5–8 步、觀念卡 ≤ 150 字元、表格空格 ≥ 0、永遠不寫「負號就代表減速」。
- Vitest 不開 globals；回傳型別用 `React.JSX.Element`；commit 結尾加 `Co-Authored-By: Claude <model> <noreply@anthropic.com>`；不 push；不碰 `.claude/worktrees/` 和 `.superpowers/tutoring-log.md`。

## Review Focus

1. **課程檔命名錯誤**：檔名開頭和 id 不一致、某一站課號跳號、id 重複，測試要失敗並清楚指出是哪個檔案 → Task 1。
2. **回報網址的編碼**：中文標題、括號、`#` 都要正確編碼；網址總長合理（< 2000 字元）；不含任何進度或個人資料 → Task 2。
3. **複習的解鎖**：該站課程全部完成才解鎖；直接打開未解鎖複習的網址顯示「還沒解鎖」畫面；做不做複習都不影響下一站 → Task 4。
4. **預覽頁不能出現在正式網站**：正式建置中 `#/preview` 視為一般的地圖；建置出來的 JS 裡找不到預覽頁的文字 → Task 5。
5. **舊存檔與新節點**：已經有進度的人，地圖上的複習節點狀態正確（課程都完成 → 可以做）；做完複習後重新整理，狀態保留 → Task 4。

---

### Task 1：自動讀取課程

**Files:** Modify `src/content/stations.ts`、`src/content/lessons/*.ts`（匯出方式）、`src/content/content.test.ts`、`README.md`

**Interfaces:**
- 每個課程檔 `export default` 一個 `Lesson`（檔名 `站-課-英文名稱.ts`）。
- Produces（`stations.ts`）：`stations: Station[]`（7 站，標題不變，課程依課號排序）、`orderedLessonIds: string[]`、`findLesson(id)`（不變的介面）、新增 `stationOf(lessonId: string): number | undefined`、`isLastLessonOfStation(lessonId: string): boolean`。
- 純函式 `src/content/discover.ts`：`collectLessons(modules: Record<string, { default: Lesson }>): { byStation: Map<number, Lesson[]>; problems: string[] }` — 回報檔名與 id 不符、跳號、重複等問題（`stations.ts` 有問題時直接拋出，讓建置失敗；測試直接驗證 `problems`）。

- [ ] **Step 1：寫失敗的測試**（`discover.test.ts`：正常資料排序正確；`2-3-x.ts` 裡 id 是 `2-4` → 問題訊息含檔名；第 2 站有 1、3 沒有 2 → 跳號問題；重複 id → 問題）
- [ ] **Step 2：實作 `discover.ts`、改 `stations.ts` 用 `import.meta.glob('./lessons/*.ts', { eager: true })`、課程檔改成 default export**
- [ ] **Step 3：`content.test.ts` 拿掉寫死的課程清單**，改成：7 站標題、第 1 站至少有 1-1～1-5、第 2 站至少有 2-1～2-4，其他檢查照舊套在所有自動讀到的課程上。
- [ ] **Step 4：README「新增一課」改成只要新增一個檔案**
- [ ] **Step 5：** `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 6：Commit** — `refactor: 自動讀取課程檔，新增一課只要一個檔案`

---

### Task 2：回報問題連結

**Files:** Create `src/lib/report.ts`、`src/components/ReportLink.tsx` 與測試；Modify `src/components/LessonPlayer.tsx`、`src/styles.css`

**Interfaces:**
```ts
export const REPO_ISSUES_URL = 'https://github.com/duncan60/physics-from-zero/issues/new';
export const REPORT_LABEL = '題目回報';
export function buildReportUrl(input: { lessonId: string; lessonTitle: string; stepId: string; stepKind: string; pageUrl: string }): string;
export function ReportLink(props: { lessonId: string; lessonTitle: string; stepId: string; stepKind: string }): React.JSX.Element;
```
- 標題：`[題目回報] {lessonId} {lessonTitle}・{stepId}`；內容：課程、步驟、題型、網址，以及「哪裡有問題？」「你覺得應該是？」兩個空白段落。
- 連結文字「回報問題」，旁邊一行小字「需要 GitHub 帳號」；放在每一步卡片的下方（觀念卡、題目、動畫、配對、引導裡的步驟都要有）；點擊範圍 ≥ 44px 高。

- [ ] **Step 1：失敗的測試**：網址以 `REPO_ISSUES_URL` 開頭，`title`、`body`、`labels` 參數解碼後內容正確；中文與 `()#&` 正確編碼；總長 < 2000；連結有 `target="_blank"` 與 `rel="noopener noreferrer"`；上課畫面每一步都找得到「回報問題」連結，而且帶的是那一步的 id。
- [ ] **Step 2–4：** 實作 → `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 5：Commit** — `feat: 每一步都有「回報問題」連結`

---

### Task 3：每站總結與複習的內容

**Files:** Modify `src/lib/types.ts`、`src/content/stations.ts`；Create `src/content/reviews/1-motion.ts`、`src/content/reviews/2-force.ts`；Modify `src/content/content.test.ts`

**Interfaces:**
```ts
export interface StationReview { stationId: number; points: string[]; formulas: { name: string; formula: string }[]; traps: { wrong: string; right: string }[]; steps: Step[] }
// stations.ts
export function reviewOf(stationId: number): StationReview | undefined;
export function reviewLessonId(stationId: number): string;      // 'review-1'
export function reviewAsLesson(review: StationReview): Lesson;   // id review-N，title「第 N 站複習」
// findLesson('review-1') 也要找得到（回傳 reviewAsLesson）
```
- 自動讀取 `src/content/reviews/*.ts`（default export），檔名開頭的站號要等於 `stationId`。
- 內容規則（`content.test.ts` 檢查）：重點 3–6 個、每個 ≤ 60 字元；公式 ≥ 2 條；陷阱 ≥ 3 對；複習題 5–8 題、至少兩種題型、全部套用既有的課程檢查（可作答、觀念卡長度、拼算式規則等）。
- **內容來源**：已上線的 1-1～1-5、2-1～2-4 課程與 `.superpowers/tutoring-log.md`（唯讀）。陷阱優先用 Duncan 真的犯過的錯（例如：平均速度用減的、以為最高點加速度是 0、以為沒有力就會停、減速的力往前、把重量當質量、反作用力會抵消）。複習題要「混合」：每題用到的觀念最好跨兩課以上，不是把原題照抄。

- [ ] **Step 1：失敗的內容檢查** → **Step 2：型別、讀取、兩站內容** → **Step 3：** `npm test && npx tsc --noEmit && npm run build` → **Step 4：Commit** — `content: 第 1、2 站的重點總結與複習題`

---

### Task 4：總結頁、複習流程與地圖節點

**Files:** Create `src/components/StationSummary.tsx` 與測試；Modify `src/lib/router.ts`、`src/App.tsx`、`src/components/PathMap.tsx`、`src/components/LessonPlayer.tsx`、`src/styles.css`、相關測試

**Interfaces:**
- `Route` 增加 `{ name: 'review'; stationId: number }`，hash `#/review/1`。
- `canOpenReview(progress, stationId): boolean` — 該站所有課程都在 `completed`（放在 `src/lib/progress.ts` 或 `PathMap` 現有 `canOpenLesson` 旁，擇一並說明）。
- `LessonPlayer` 新增可選 prop `onShowStationSummary?: () => void`；有值時完成畫面多一個按鈕「看本站重點」。App 只在「這一課是該站最後一課、而且該站有複習」時傳入。
- `StationSummary(props: { review: StationReview; stationTitle: string; onStart: () => void; onBack: () => void })`：標題「第 N 站重點：{站名}」、三個區塊「重點」「公式」「常見陷阱」（錯的想法 / 正確的想法）、按鈕「開始複習」與「回到地圖」。
- 複習本身：導到 `#/lesson/review-1`，用 `reviewAsLesson` 的結果交給 `LessonPlayer`，完成時照一般課程 `completeLesson`（XP、完美都一樣）。
- 地圖：每站（有課程且有複習）的路線最後一個節點「本站重點與複習」，狀態沿用課程節點（鎖住／可以上／已完成／完美）；點了到 `#/review/站號`。未解鎖時直接開 `#/review/1` 或 `#/lesson/review-1` 顯示既有的「還沒解鎖」畫面。

- [ ] **Step 1：失敗的測試**：路由解析；未完成整站時節點鎖住、直接開網址顯示鎖住畫面；完成整站後可以進總結頁、按「開始複習」進入複習、做完後節點變「已完成」，全對變「完美」；做不做複習，下一站第一課都照原規則解鎖；完成某站最後一課時出現「看本站重點」並能進入總結頁；舊存檔（只有課程完成紀錄）載入後節點狀態正確。
- [ ] **Step 2–4：** 實作 → `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 5：瀏覽器檢查**（375px、桌機、深色）：完成第 1 站 → 看重點 → 複習 → 地圖節點變化。關掉伺服器。
- [ ] **Step 6：Commit** — `feat: 每站重點總結與複習`

---

### Task 5：本機預覽頁

**Files:** Create `src/components/PreviewPage.tsx` 與測試；Modify `src/lib/router.ts`、`src/App.tsx`、`src/components/LessonPlayer.tsx`

**Interfaces:**
- `Route` 增加 `{ name: 'preview' }` 與 `{ name: 'preview-run'; lessonId: string; step: number }`（hash `#/preview`、`#/preview/1-3/4`），**只有** `import.meta.env.DEV` 為 true 時 `parseHash` 才會回傳它們，否則一律是地圖。
- `LessonPlayer` 新增可選 prop `startAt?: number`（從第幾步開始，預設 0）。
- 預覽執行：不檢查解鎖、`onComplete` 與 `onExit` 都只回預覽頁，不存進度、不加 XP；畫面上方顯示「預覽模式：不會存進度」。
- `PreviewPage`：依站列出每課每步（步驟編號、id、題型），每步一個「從這裡開始」按鈕；也列出每站複習。

- [ ] **Step 1：失敗的測試**：DEV 為 false 時 `parseHash('#/preview')` 是地圖；DEV 為 true 時能進預覽頁並從指定步驟開始；預覽完成後 localStorage 沒有被改。
- [ ] **Step 2–4：** 實作 → `npm test && npx tsc --noEmit && npm run build`，並確認 `dist/` 的 JS 裡找不到「預覽模式」字樣。
- [ ] **Step 5：Commit** — `feat: 本機開發用的預覽頁`

---

### Task 6：上一批留下的小修正

**Files:** Modify `src/components/LessonPlayer.tsx`、`src/components/QuestionCard.tsx`（或拼算式狀態所在處）、`src/styles.css`、`src/content/lessons/1-5-how-high.ts` 與相關測試

- 拼算式第 2 步答錯 → 一步一步來 → 回到原題時，保留已拼好的算式並直接停在第 2 步；這一題仍然不算一次答對。
- 390px、「12 天」「480 XP」時頁首維持一行（用文字較短的計數或更緊的間距；360px 仍可換行但不得水平捲軸）。
- 1-5 `bus-slide` 第 2 步數值 5 的回饋不引用「(10 + 0) ÷ 2」。

- [ ] **Step 1：失敗的測試**（回到原題時第 2 步直接可作答、算式磚塊仍在答案列；回饋文字不含「(10 + 0) ÷ 2」）→ **Step 2–3：** 實作 → `npm test && npx tsc --noEmit && npm run build` → **Step 4：瀏覽器檢查 390px** → **Step 5：Commit** — `fix: 引導後不用重拼算式、手機頁首、1-5 回饋用字`
