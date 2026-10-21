// 2-4 質量和重量。課程內容採用 CC BY-SA 4.0，見 ../LICENSE.md。
// 質量（公斤）帶到哪裡都不變；重量（N）是地球或月球拉它的力，W = m × g。
// 地球的 g 約 9.8，這裡取 10 公尺/秒²（和 1-4 一樣）；月球的 g 用約略值 1.6（精確約 1.62，大約是地球的 1/6）。
// 水平推只看質量，這只在沒有摩擦力時成立，所以題目都保留「沒有摩擦力」這個條件。
import type { Lesson } from '../../lib/types';

const massAndWeight: Lesson = {
  id: '2-4',
  title: '質量和重量',
  steps: [
    {
      kind: 'choice',
      id: 'moon-mass',
      prompt: '一顆 1 公斤的鐵球，從地球帶到月球上。它的質量會改變嗎？',
      options: [
        {
          id: 'changes',
          label: '會有改變，因為在月球上感覺比較輕',
          feedback: '在月球上拿起來比較輕，你的感覺沒錯。不過「感覺多重」量的是月球拉它的力，不是鐵球有多少料。鐵球帶到月球，有少掉一塊嗎？',
        },
        {
          id: 'zero',
          label: '會變成 0，因為月球上沒有重力',
          feedback: '月球上的東西跳得比較高、掉得比較慢，看起來好像沒有重力。不過月球也會拉東西，只是拉得比地球小。而且質量是鐵球有多少料：帶到月球，料會不見嗎？',
        },
        { id: 'same', label: '不會，還是 1 公斤' },
      ],
      answer: 'same',
      explanation: '質量是鐵球有多少「料」，帶到哪裡都不變，還是 1 公斤。在月球上感覺比較輕的，是重量。',
      guide: [
        {
          kind: 'concept',
          id: 'moon-mass-feel',
          title: '感覺比較輕的是什麼？',
          body: [
            '拿起來覺得多重，是地球或月球把它往下拉的力，叫做重量。',
            '月球拉東西的力比地球小，所以在月球上感覺比較輕。',
            '鐵球的「料」沒有少，質量還是 1 公斤。',
          ],
        },
        {
          kind: 'choice',
          id: 'moon-mass-which',
          prompt: '在月球上感覺比較輕，是哪一個變小了？',
          options: [
            { id: 'weight', label: '重量：月球把它往下拉的力' },
            {
              id: 'mass',
              label: '質量：鐵球有多少料',
              feedback: '感覺確實變輕了。不過鐵球從地球帶到月球，一塊都沒少。料沒變，那變小的會是什麼？',
            },
          ],
          answer: 'weight',
          explanation: '變小的是重量，也就是月球拉它的力。質量是有多少料，還是 1 公斤。',
        },
      ],
    },
    {
      kind: 'concept',
      id: 'mass-and-weight',
      title: '質量和重量',
      body: [
        '質量 m：東西有多少料，單位是公斤，帶到哪裡都不變。',
        '重量 W：地球或月球拉它的力，單位是 N。W = m × g。',
        'g 叫做重力加速度。地球的 g 約 9.8，這裡取 10 公尺/秒²；月球的 g 約 1.6 公尺/秒²，大約是地球的 1/6。',
      ],
    },
    {
      kind: 'formula',
      id: 'moon-weight',
      prompt: '同一顆 1 公斤的鐵球在月球上，重量是幾 N？月球的 g 約 1.6 公尺/秒²。',
      tiles: ['1', '1.6', '10', '+', '×', '÷'],
      // 10 沒有寫在題目裡，是觀念卡上地球的 g（陷阱），標出來才知道它是什麼。
      tileLabels: ['質量', '月球 g', '地球 g', undefined, undefined, undefined],
      accepted: [['1', '×', '1.6']],
      wrongForms: [
        {
          tokens: ['1', '×', '10'],
          feedback: '你用了 W = m × g，這步對了。不過 10 是地球的 g，算出來的是鐵球在地球上的重量。這題在月球上：g 要換成多少？',
        },
        {
          tokens: ['1.6', '÷', '1'],
          feedback: '算出來的數字碰巧對，因為質量是 1，除以 1 不會改變數字。不過 W = m × g，m 和 g 中間是什麼符號？換成 2 公斤的鐵球就會算錯。',
        },
        { tokens: ['1', '÷', '1.6'], feedback: '質量和月球的 g 都用上了，這點沒錯。不過 W = m × g，m 和 g 中間是什麼符號？' },
        { tokens: ['1', '+', '1.6'], feedback: '質量和月球的 g 都放進去了。不過重量不是把兩個加起來：W = m × g，中間是什麼符號？' },
        {
          tokens: ['1.6', '×', '10'],
          feedback: '1.6 是月球的 g，這個你記對了。不過 W = m × g 只要一個 g，10 是地球的 g。另一個要放的，是鐵球的什麼？',
        },
        {
          tokens: ['1.6'],
          feedback: '數字碰巧一樣，因為質量是 1。不過 1.6 是月球的 g，是加速度，不是重量：W = m × g，把鐵球的質量也拼進去。',
        },
      ],
      answer: 1.6,
      unit: 'N',
      wrongAnswers: [
        { value: 16, feedback: '算式拼對了。不過小數點跑掉了：1 個 1.6 是多少？' },
        { value: 10, feedback: '10 N 是鐵球在地球上的重量。拼好的算式是 1 × 1.6，用的是月球的 g，再算一次。' },
      ],
      explanation: '月球上 W = m × g = 1 × 1.6 = 1.6 N，大約是地球上 10 N 的 1/6。月球的 g 精確一點約 1.62，這裡用 1.6 就好。',
      guide: [
        {
          kind: 'number',
          id: 'moon-weight-earth',
          prompt: '先算地球：地球的 g 約 9.8，這裡取 10 公尺/秒²。1 公斤的鐵球在地球上，重量 W = m × g 是幾 N？',
          answer: 10,
          unit: 'N',
          wrongAnswers: [
            { value: 1, feedback: '1 是鐵球的質量，單位是公斤。重量是地球拉它的力，W = m × g：還要乘上什麼？' },
            { value: 11, feedback: '質量和 g 都用上了。不過 W = m × g 是相乘，不是相加。' },
          ],
          explanation: 'W = 1 × 10 = 10 N。月球也一樣用 W = m × g，只是 g 換成月球的 1.6。',
        },
      ],
    },
    {
      kind: 'choice',
      id: 'push-earth-moon',
      prompt: '地球和月球上，各有一個完全沒有摩擦力的平面。把同一顆 1 公斤的鐵球放在上面水平推動，哪一邊比較容易？',
      options: [
        {
          id: 'moon',
          label: '月球比較容易，因為摩擦力小',
          feedback: '同樣的地面搬到月球上，摩擦力確實會比較小，你想得沒錯。不過再看一次題目：兩邊都完全沒有摩擦力，摩擦力不是差別。水平推的時候，還剩下什麼讓鐵球難推？',
        },
        {
          id: 'earth',
          label: '地球比較容易',
          feedback: '你注意到兩邊的重力不一樣，這點沒錯。不過重力往下拉，被平面撐住了，而且兩邊都沒有摩擦力。水平推的時候，要對抗的是鐵球的什麼？它在兩邊有不一樣嗎？',
        },
        { id: 'same', label: '一樣容易' },
      ],
      answer: 'same',
      explanation: '兩邊都沒有摩擦力，水平推時要對抗的是改變速度有多難，也就是質量。質量在兩邊一樣，所以一樣容易。',
      guide: [
        {
          kind: 'concept',
          id: 'push-earth-moon-condition',
          title: '先看清楚條件',
          body: [
            '題目說兩邊都完全沒有摩擦力，所以摩擦力不是差別。',
            '重量往下拉，被平面撐住了，不會擋住水平推。',
            '水平推的時候，要對抗的是改變速度有多難，也就是質量。',
          ],
        },
        {
          kind: 'choice',
          id: 'push-earth-moon-mass',
          prompt: '這顆鐵球的質量，在地球和月球上一樣嗎？',
          options: [
            { id: 'same', label: '一樣，都是 1 公斤' },
            {
              id: 'moon-smaller',
              label: '月球上比較小',
              feedback: '在月球上感覺比較輕，這沒錯。不過第一題說過，感覺比較輕的是重量。鐵球帶到月球，料有變少嗎？',
            },
          ],
          answer: 'same',
          explanation: '質量帶到哪裡都不變，兩邊都是 1 公斤。質量一樣，水平推起來就一樣容易。',
        },
      ],
    },
    {
      kind: 'number',
      id: 'moon-push-force',
      prompt: '在月球那個沒有摩擦力的平面上，想讓這顆 1 公斤的鐵球水平加速，加速度是 2 公尺/秒²，要用幾 N 的力推？',
      answer: 2,
      unit: 'N',
      wrongAnswers: [
        {
          value: 3.2,
          feedback: '你用了 F = m × a 的乘法，這點對了。不過 1.6 是月球的 g，是往下拉的加速度。水平推的時候，m 要放的是鐵球的什麼？',
        },
        {
          value: 20,
          feedback: '你記得用乘的，這點對了。不過 10 是地球的 g，也是鐵球在地球上的重量 10 N，都不是質量。F = m × a 的 m 要放什麼？',
        },
        { value: 0.5, feedback: '質量和加速度都用上了。不過 1 ÷ 2 是相除。F = m × a，m 和 a 中間是什麼符號？' },
      ],
      explanation: 'F = m × a = 1 × 2 = 2 N，和在地球上一樣。m 和 a 都沒變，F 就不變，水平推和 g 沒有關係。',
      guide: [
        {
          kind: 'concept',
          id: 'moon-push-earth',
          title: '先在地球上算',
          body: [
            '先在地球那個沒有摩擦力的平面上算：一樣讓這顆 1 公斤的鐵球有 2 公尺/秒² 的加速度。',
            'F = m × a = 1 × 2 = 2 N。',
            '這個式子裡沒有 g。到了月球，只要問：m 和 a 有沒有變？',
          ],
        },
        {
          kind: 'choice',
          id: 'moon-push-mass',
          prompt: '在月球上，這顆鐵球的質量 m 是多少？',
          options: [
            { id: 'one', label: '還是 1 公斤' },
            {
              id: 'smaller',
              label: '比 1 公斤小，因為月球上質量小',
              feedback: '你知道要先找 m，這步對了。不過第一題說過，在月球上感覺比較輕的是重量。鐵球帶到月球，料有變少嗎？',
            },
            {
              id: 'moon-g',
              label: '1.6 公斤',
              feedback: '你記得月球的 1.6，不過那是月球的 g，單位是公尺/秒²，是加速度，不是質量。鐵球本身有多少料？',
            },
          ],
          answer: 'one',
          explanation: '質量帶到哪裡都不變，還是 1 公斤。m 和 a 都和地球上一樣，F 也一樣。',
        },
      ],
    },
    {
      kind: 'concept',
      id: 'horizontal-push',
      title: '水平推，看質量',
      body: [
        '在沒有摩擦力的平面上水平推，只看質量，和 g 沒有關係。',
        '所以在地球和月球上，水平推同一顆鐵球，一樣容易。',
        '有摩擦力時就不一樣了：摩擦力和壓在地面上的力有關，同樣的地面，月球上的摩擦力會比較小。',
      ],
    },
    {
      kind: 'match',
      id: 'unit-match',
      prompt: '這一課的三個量：先點一個名稱，再點它的單位，配成一對。',
      pairs: [
        { left: '質量', right: '公斤' },
        { left: '重量', right: 'N（牛頓）' },
        { left: '重力加速度 g', right: '公尺/秒²' },
      ],
      explanation: '質量用公斤；重量是一種力，用牛頓（N）。重力加速度 g 和其他加速度一樣，用公尺/秒²。',
    },
  ],
};

export default massAndWeight;
