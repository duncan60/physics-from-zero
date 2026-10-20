# 從零開始學物理（physics-from-zero）

Duolingo 風格的物理入門網站。從零開始，一題一題學，答錯也沒關係，網站會一步一步帶你想通。

線上網址：<https://duncan60.github.io/physics-from-zero/>

由 duncan60 與 Claude 一起製作，課程來自真實的學習過程

## 這是什麼

- 一張有 7 站的路線地圖：運動、力與牛頓定律、能量與動量、「波動、聲音與熱」、電與磁、光、近代物理。目前開放第 1 站「運動」，其他站即將推出。
- 每課約 5 到 8 個步驟，一次只出現一個，完成前一課才會解鎖下一課。
- 答錯不扣分、不限時。你會先看到針對這個錯誤的回饋，再進入分步引導，最後回到原題重答。想直接看解答也可以。
- 進度、經驗值和連續學習天數都存在你的瀏覽器裡，不用註冊帳號。

這個網站最在意的一點：**題目和答錯時的引導，都來自真實的學習過程。** 學習時實際踩過的陷阱，像是「速度比較快就一定在前面」，會變成答錯時的回饋和引導。如果你也踩過類似的坑，歡迎把它寫成新的一課。

## 在本機執行

需要 Node.js 22.13 以上（建議用 22 LTS）。

```bash
npm install     # 安裝套件
npm run dev     # 開發模式，照著畫面上的網址用瀏覽器打開
npm test        # 執行測試（包含檢查每一課的內容）
npm run build   # 檢查型別並打包到 dist/
```

推送到 `main` 分支後，GitHub Actions 會自動建置並部署到 GitHub Pages；`npm test` 沒有通過就不會部署。

## 新增一課

課程都是 `src/content/lessons/` 底下的 TypeScript 檔案，不用改畫面的程式碼。

1. 在 `src/content/lessons/` 新增一個檔案，例如 `1-6-my-lesson.ts`，匯出一個 `Lesson`（可以參考 `1-2-speed-position.ts`）。
2. 在 `src/content/stations.ts` 匯入它，放進對應那一站的 `lessons`。
3. 執行 `npm test`。`src/content/content.test.ts` 會幫你檢查：
   - 每課 5 到 8 個步驟，步驟 id 不重複。
   - 每一題都答得出來（選擇題的答案是其中一個選項，數字題的錯誤答案不會被判成正確）。
   - 每一題都有說明，觀念卡不超過 150 個字元。
   - 引導裡面不能再有引導，表格的空格答案不能是負數（需要負數就改用數字題）。
   - 不放 emoji。
4. 測試裡有幾項寫死了目前有哪些課（站數、第 1 站的課程 id 與標題、其他站都是空的）。新增一課時，把 `content.test.ts` 裡對應的期望值一起改掉。

### 步驟的種類

| `kind` | 用途 |
| --- | --- |
| `concept` | 觀念卡：幾句話的小說明，按「繼續」往下 |
| `choice` | 選擇題：單選，每個錯誤選項都可以有自己的 `feedback` |
| `number` | 數字題：填一個數字，可以設 `unit`、`tolerance`，用 `wrongAnswers` 針對特定的錯誤答案給回饋 |
| `table` | 表格題：用 `{ answer: 8 }` 標出要填的格子，其他格子寫字串 |
| `sim` | 互動模擬：目前只有 `bus-ball`（公車與球），新增模擬需要寫畫面的程式碼 |

選擇題、數字題和表格題都可以加 `guide`，是答錯之後的分步引導（一串小問題或觀念卡）。

### 一個小例子

```ts
import type { Lesson } from '../../lib/types';

export const example: Lesson = {
  id: '1-6',
  title: '走了多遠',
  steps: [
    {
      kind: 'concept',
      id: 'intro',
      title: '先記住一件事',
      body: ['每秒走 10 公尺，走 2 秒，就走了 20 公尺。', '距離 = 速度 × 時間'],
    },
    {
      kind: 'choice',
      id: 'faster',
      prompt: '速度比較快，就一定在前面嗎？',
      options: [
        {
          id: 'always',
          label: '一定',
          feedback: '如果大家從同一個地方出發，你說得沒錯。可是起點不一樣呢？',
        },
        { id: 'not-always', label: '不一定' },
      ],
      answer: 'not-always',
      explanation: '位置要看起點，也要看走了多遠。',
    },
    {
      kind: 'number',
      id: 'six-by-three',
      prompt: '腳踏車每秒騎 6 公尺，騎了 3 秒。總共騎了幾公尺？',
      answer: 18,
      unit: '公尺',
      wrongAnswers: [
        { value: 9, feedback: '兩個數字都用上了，不過 6 + 3 是加在一起。每秒 6 公尺、騎 3 秒，是 3 個 6 公尺。' },
      ],
      explanation: '距離 = 速度 × 時間 = 6 × 3 = 18 公尺。',
      guide: [
        {
          kind: 'number',
          id: 'one-second',
          prompt: '先只看 1 秒：每秒騎 6 公尺，騎 1 秒是幾公尺？',
          answer: 6,
          unit: '公尺',
          explanation: '1 秒騎 6 公尺。3 秒就是 3 個 6。',
        },
      ],
    },
  ],
};
```

這個例子只示範寫法，所以只有 3 個步驟；真正的一課要有 5 到 8 個步驟，`npm test` 會檢查。匯出的名稱（這裡是 `example`）可以自己取，在 `stations.ts` 匯入的就是這個名稱。

### 寫回饋的小訣竅

現有的課程大多這樣寫答錯回饋：先說「你這部分想對了」，再指出卡住的那一步，最後丟一個小問題把人帶回來，而不是直接公布答案。真實學習時答錯的答案，就是最好的 `wrongAnswers` 和 `feedback`。

## 授權

- 程式碼採用 MIT 授權，見 [`LICENSE`](LICENSE)。`src/content/` 裡的程式也是：測試檔 `content.test.ts`，以及 `stations.ts` 裡的程式邏輯（例如 `findLesson`、`orderedLessonIds`）。
- 課程內容採用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hant)，見 [`src/content/LICENSE.md`](src/content/LICENSE.md)。課程內容指的是 `src/content/lessons/` 底下的每一課，以及 `stations.ts` 裡的站名和課程順序。引用或改編時請標示出處，並以相同方式分享。
