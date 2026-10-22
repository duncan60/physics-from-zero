# 第 2 站後半 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把家教紀錄的 2-5～2-7 做成三課，更新第 2 站的重點與複習，順手修掉 `[hidden]` 被蓋掉的問題。

**Architecture:** 課程是 `src/content/lessons/` 底下的獨立檔案，自動讀取，不用改畫面程式碼或 `stations.ts`。複習在 `src/content/reviews/2-force.ts`。內容檢查在 `src/content/content.test.ts`，每課完整玩一遍的整合測試在 `src/App.lessons.test.tsx`，新課會自動被涵蓋。

**Tech Stack:** 沿用現有（Vite、React 19、TypeScript strict、Vitest、Testing Library）。

**Spec:** `docs/superpowers/specs/2026-10-22-station-2-second-half-design.md`

## Global Constraints

- 繁體中文（台灣）、不用 emoji；360px 不得水平捲軸；淺色深色；尊重減少動態效果。
- 不加執行期依賴；不改一般進度與課內存檔的格式與版本；不改畫面程式碼（Task 4 的一條 CSS 除外）。
- 內容規則照 README「新增一課」與 `content.test.ts`；g 寫「g 約 9.8，這裡取 10」，之後用 10。
- 每一課的資料來源只有 `.superpowers/tutoring-log.md` 的對應段落（唯讀，不能修改）；那一段的「上課時不夠精確的說法」照紀錄修正後才寫進課程。
- Vitest 不開 globals；commit 訊息用繁體中文、前綴 `content:` 或 `fix:`，結尾加 `Co-Authored-By: Claude <model> <noreply@anthropic.com>`；不 push；不碰 `.claude/`、`.superpowers/`（除了讀家教紀錄）；不要結束任何不是你啟動的程序。

## Review Focus

1. 物理正確：每個數字、單位、方向（2-5 往下為正）和條件（不考慮空氣阻力、沒有摩擦力、同一直線、「這一題」正向力 = 重力）都對 → Task 1～4。
2. 每個真實答錯的回答都有針對它的回饋，回饋不直接洩漏答案 → Task 1～3。
3. 選項位置／長度規則在主步驟與打開引導時都通過（內容檢查會擋，但不能靠把正確選項寫短來湊）→ Task 1～4。
4. 整合測試能把新課從頭玩到完（拼算式的標示方塊、表格、配對都要能用正確答案過關）→ Task 1～3。
5. 複習的重點每條不超過 60 字元、仍然 3～6 條，且沒有把正向力 = 重力寫成一般規則 → Task 4。

---

### Task 1：2-5 落下的東西

**Files:** Create `src/content/lessons/2-5-falling.ts`；Modify `src/content/content.test.ts`（如需要加這課的專屬檢查）

- 照 spec「2-5」的觀念與「必須」清單寫 5～8 步，至少 3 種題型，其中一題拼算式、一題表格填空（重力幾倍、質量幾倍、加速度幾倍）。
- 數字題 `wrongAnswers` 至少含 spec 指定的 10（第 1 秒平均速度）。
- 在 `content.test.ts` 的「真實錯誤」類檢查（如果有對應的 it.each 表）加上這課的條目；沒有就加一個小測試：2-5 第 1 秒平均速度那題對 10 有回饋。
- 驗證：`npx vitest run src/content src/App.lessons.test.tsx` 全過；`npm run build` 型別通過。
- Commit：`content: 第 2-5 課「落下的東西」（同時落地與自由落體）`

### Task 2：2-6 合力與單位

**Files:** Create `src/content/lessons/2-6-net-force.ts`；Modify `src/content/content.test.ts`（如需要）

- 照 spec「2-6」寫 5～8 步，至少 3 種題型，含一題單位配對（5 對）與一題代號／單位的選擇題。
- 同方向合力題對 10 有「多算一步」的回饋；加一個小測試鎖住它。
- 驗證與 Task 1 相同。
- Commit：`content: 第 2-6 課「合力與單位」`

### Task 3：2-7 平衡與正向力

**Files:** Create `src/content/lessons/2-7-balance-normal-force.ts`；Modify `src/content/content.test.ts`（如需要）

- 照 spec「2-7」寫 5～8 步，至少 3 種題型，含冰上箱子的平衡題、正向力題、「作用在誰身上」的題目與引導、平衡 vs 作用力與反作用力的對照、書拉地球的反作用力。
- 「阻力」與「不同東西上」兩個真實錯誤各有針對的回饋；加一個小測試鎖住「以為是作用力與反作用力」的那個錯誤選項有回饋。
- 驗證與 Task 1 相同。
- Commit：`content: 第 2-7 課「平衡與正向力」`

### Task 4：第 2 站複習、README、`[hidden]`

**Files:** Modify `src/content/reviews/2-force.ts`、`README.md`、`src/styles.css`；相關測試

- 複習照 spec「第 2 站的重點與複習」：`points`、`formulas`、`traps`、`steps` 與檔案開頭註解。
- README「這是什麼」不寫死第 2 站開放幾課。
- `src/styles.css` 開頭的基本樣式區加 `[hidden] { display: none !important; }`，附一行註解說明為什麼（`display: flex` 的元素加了 `hidden` 仍會顯示）。加一個測試：讀 `src/styles.css` 的文字，確認有這條規則（jsdom 不套用樣式表，用文字檢查鎖住）。
- 驗證：`npm test` 全過、`npm run build` 通過。
- Commit：`content: 第 2 站重點與複習涵蓋 2-5～2-7` 與 `fix: 有 hidden 屬性的元素一定不顯示`（兩個 commit）。
