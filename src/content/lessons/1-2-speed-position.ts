// 1-2 速度與位置。課程內容採用 CC BY-SA 4.0，見 ../LICENSE.md。
import type { Lesson } from '../../lib/types';

const speedPosition: Lesson = {
  id: '1-2',
  title: '速度與位置',
  steps: [
    {
      kind: 'concept',
      id: 'distance',
      title: '走了多遠？',
      body: [
        '每秒走 10 公尺，走 2 秒，就走了 20 公尺。',
        '寫成算式（速度不變時）：距離 = 速度 × 時間',
        '速度的單位「公尺/秒」，意思就是「每秒走幾公尺」。',
      ],
    },
    {
      kind: 'number',
      id: 'ten-by-one',
      prompt: '速度是每秒 10 公尺，走了 1 秒。總共走了幾公尺？',
      answer: 10,
      unit: '公尺',
      wrongAnswers: [
        { value: 11, feedback: '你用上了速度和時間，方向沒錯。不過要用乘的，不是加的：距離 = 速度 × 時間。' },
      ],
      explanation: '距離 = 速度 × 時間 = 10 × 1 = 10 公尺。這正是上一課，球在空中 1 秒往前走的距離。',
    },
    {
      kind: 'number',
      id: 'six-by-three',
      prompt: '腳踏車每秒騎 6 公尺，騎了 3 秒。總共騎了幾公尺？',
      answer: 18,
      unit: '公尺',
      wrongAnswers: [
        { value: 9, feedback: '兩個數字都用上了。不過 6 + 3 是把速度和時間加在一起。每秒騎 6 公尺、騎了 3 秒，就是 3 個 6 公尺。' },
        { value: 2, feedback: '你想到要把速度和時間放在一起算，這沒錯。不過騎得越久，應該走得越遠，用除的反而變少了。' },
      ],
      explanation: '距離 = 速度 × 時間 = 6 × 3 = 18 公尺。每秒 6 公尺，3 秒就是 6 + 6 + 6。',
    },
    {
      kind: 'choice',
      id: 'faster-ahead',
      prompt: '兩台車在同一條直路上，往同一個方向開。速度比較快就一定在前面嗎？',
      options: [
        {
          id: 'always',
          label: '一定，比較快的那台一定在前面',
          feedback: '如果兩台車從同一個地方出發，你說得沒錯，就像上一課的球和你。可是起點不一樣呢？假設 B 車一開始在 A 車前方 100 公尺，A 車每秒 10 公尺，B 車每秒 2 公尺。1 秒後，誰在前面？',
        },
        { id: 'not-always', label: '不一定' },
      ],
      answer: 'not-always',
      explanation: '位置要看起點，也要看走了多遠。像 A 車從 0 公尺處出發、每秒 10 公尺，B 車從 100 公尺處出發、每秒 2 公尺：1 秒後 A 車在 10 公尺處，B 車在 102 公尺處，比較慢的 B 車反而在前面。',
    },
    {
      kind: 'concept',
      id: 'compute-position',
      title: '位置要算出來',
      body: [
        '速度只說每秒走多遠，沒說從哪裡出發。',
        '想知道誰在前面，要先找出起點，再加上走了多遠：',
        '現在的位置 = 起點 + 走了多遠',
        '實際算出來，不要憑感覺猜。',
      ],
    },
  ],
};

export default speedPosition;
