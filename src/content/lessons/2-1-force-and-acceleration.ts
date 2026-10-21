// 2-1 力與加速度。課程內容採用 CC BY-SA 4.0，見 ../LICENSE.md。
// 第 2 站的第一課：從推購物車的手感出發，帶出質量和牛頓第二定律 F = m × a。
// 重力加速度和第 1 站一樣用 10 公尺/秒²，往上為正。
import type { Lesson } from '../../lib/types';

// full-cart-accel 有標示的磚塊：算式裡寫成「數值|標示」，照用途判斷（力 ÷ 滿車質量才對，反過來數值碰巧一樣也不算）。
const FORCE = '20|力';
const FULL_MASS = '20|滿車質量';
const EMPTY_MASS = '10|空車質量';
const BOTH_TWENTIES_SUBTRACTED =
  '力和質量兩個 20 都用上了，這點沒錯。不過 20 − 20 = 0，等於說推了速度也不會變。一直有 20 N 在推，滿車真的不會越來越快嗎？';
const MASS_DIVIDED_BY_MASS = '想到要用除的，很好。不過滿車質量和空車質量，兩個都是質量。加速度要用力去除以質量：a = F ÷ m。';

const forceAndAcceleration: Lesson = {
  id: '2-1',
  title: '力與加速度',
  steps: [
    {
      kind: 'choice',
      id: 'push-carts',
      prompt: '超市裡有兩台購物車，一台是空的，一台裝滿了水和米。你用一樣大的力推它們，哪一台的速度增加得比較快？',
      options: [
        {
          id: 'same',
          label: '一樣快',
          feedback: '兩台車受到的力一樣大，這點你說得對。不過車上裝的東西差很多。一樣用力推，兩台推起來的感覺會一樣嗎？',
        },
        { id: 'empty', label: '空的那台' },
        {
          id: 'full',
          label: '裝滿的那台',
          feedback: '你注意到兩台車不一樣重，這正是關鍵。想像真的去推：裝滿水和米的車，是比較容易推動，還是比較難推動？',
        },
      ],
      answer: 'empty',
      explanation: '空車比較輕，一樣的力推下去，速度增加得比較快。精確地說，不只是「速度比較快」，而是「速度增加得比較快」，也就是加速度比較大。',
    },
    {
      kind: 'concept',
      id: 'mass',
      title: '質量',
      body: [
        '裝滿的購物車，比空的難推動。',
        '東西有多難被推動，叫做質量，單位是公斤。',
        '一樣的力，質量越大，加速度越小。',
      ],
    },
    {
      kind: 'number',
      id: 'double-mass',
      prompt: '滿車的質量是空車的 2 倍，用一樣大的力推（假設沒有摩擦力），滿車的加速度是空車的幾倍？',
      answer: 0.5,
      unit: '倍',
      wrongAnswers: [
        {
          value: 2,
          feedback: '你看出質量會影響加速度，這點對了。不過質量變大，反而更難推動。滿車的加速度應該比空車大，還是比空車小？',
        },
        {
          value: 1,
          feedback: '兩台車受到的力一樣大，這點沒錯。不過滿車的質量比較大，比較難推動。它的加速度還會和空車一樣嗎？',
        },
      ],
      explanation: '滿車可以想成兩台空車綁在一起。一樣的力要推動 2 倍的質量，加速度只剩一半，也就是 0.5 倍。',
    },
    {
      kind: 'number',
      id: 'match-accel',
      prompt: '想讓滿車的加速度和空車一樣大（假設沒有摩擦力），推的力要變成原來的幾倍？',
      answer: 2,
      unit: '倍',
      wrongAnswers: [
        {
          value: 0.5,
          feedback: '0.5 倍是上一題滿車的加速度，你記得很清楚。不過這題問的是力：滿車比較難推動，要用比較大的力，還是比較小的力？',
        },
        {
          value: 1,
          feedback: '你想讓兩台的加速度一樣，目標對了。不過力不變的話，上一題算過，滿車的加速度只有空車的一半。要追上空車，力要怎麼變？',
        },
      ],
      explanation: '質量變成 2 倍，力也要變成 2 倍，加速度才會和空車一樣。就像兩台空車綁在一起，要用兩份的力來推。',
    },
    {
      kind: 'concept',
      id: 'newton-second',
      title: '牛頓第二定律',
      body: [
        '把前面的發現寫成一句話：合力 = 質量 × 加速度。',
        '合力是物體受到的所有力加起來，方向相反的要相減。',
        '這一課假設購物車沒有摩擦力，前後只有推力，推力就是合力。',
        '寫成 F = m × a：F 是合力，m 是質量，a 是加速度。',
        '力的單位是牛頓（N）：1 N 讓 1 公斤產生 1 公尺/秒² 的加速度。',
      ],
    },
    {
      kind: 'slider',
      id: 'empty-cart-force',
      prompt: '空購物車質量 10 公斤，假設沒有摩擦力。想讓它的加速度是 2 公尺/秒²，要用多少力推？拉動滑桿，調到剛好的推力。',
      quantity: '推力',
      unit: 'N',
      min: 0,
      max: 40,
      step: 1,
      initial: 0,
      answer: 20,
      // 上課時真的有人算成 10 ÷ 2 和 10 + 2，兩個都推得太小。回饋只說方向，不說答案。
      tooLow:
        '推力不夠：這樣推，購物車的加速度還不到 2 公尺/秒²。如果你是把 10 和 2 相除或相加，再看一次 F = m × a：m 和 a 中間是什麼符號？',
      tooHigh: '推力太大了：這樣推，購物車的加速度會超過 2 公尺/秒²。再看一次 F = m × a，把質量 10 公斤和加速度 2 公尺/秒² 放進去算算看。',
      explanation: 'F = m × a = 10 × 2 = 20 N，購物車的速度每秒增加 2 公尺/秒。力常寫成大寫的 F，單位牛頓寫成大寫的 N，不寫成小寫的 n。',
      anim: 'cart',
    },
    {
      kind: 'formula',
      id: 'full-cart-accel',
      prompt: '滿車質量 20 公斤，假設沒有摩擦力，一樣用 20 N 推，加速度是多少？',
      tiles: ['10', '20', '20', '−', '×', '÷'],
      // 兩塊 20 一個是力、一個是滿車的質量；10 是前一題空車的質量（陷阱）。
      tileLabels: ['空車質量', '力', '滿車質量', undefined, undefined, undefined],
      accepted: [[FORCE, '÷', FULL_MASS]],
      wrongForms: [
        {
          tokens: [FULL_MASS, '÷', FORCE],
          feedback:
            '力和滿車質量都用上了，也想到要用除的，很好。不過順序反了：加速度 = 力 ÷ 質量（a = F ÷ m），是用力去除以質量。這題兩個都是 20，算出來碰巧一樣，換一台車就不一樣了。',
        },
        {
          tokens: [FORCE, '×', FULL_MASS],
          feedback: '你想到用 F = m × a，方向對了。不過 20 × 20 是把力和質量乘在一起，算出來的不是加速度。這題已經知道力和質量，要找的是加速度：先把 20 N 和 20 公斤放進式子裡對應的位置。',
        },
        // − 兩邊不能對調，兩種順序都要認得
        { tokens: [FORCE, '−', FULL_MASS], feedback: BOTH_TWENTIES_SUBTRACTED },
        { tokens: [FULL_MASS, '−', FORCE], feedback: BOTH_TWENTIES_SUBTRACTED },
        { tokens: [FORCE, '÷', EMPTY_MASS], feedback: '用力除以質量，這個想法很好。不過 10 公斤是空車的質量，這題推的是滿車：滿車是幾公斤？' },
        // 質量 ÷ 質量：÷ 兩邊不能對調，兩種順序都要認得
        { tokens: [FULL_MASS, '÷', EMPTY_MASS], feedback: MASS_DIVIDED_BY_MASS },
        { tokens: [EMPTY_MASS, '÷', FULL_MASS], feedback: MASS_DIVIDED_BY_MASS },
      ],
      answer: 1,
      unit: '公尺/秒²',
      wrongAnswers: [
        { value: 400, feedback: '400 是 20 × 20。拼好的算式是 20 ÷ 20，用的是除，不是乘：20 裡面有幾個 20？' },
        {
          value: 0,
          feedback: '加速度是 0，代表推了速度也不會變。一直有 20 N 在推，滿車真的不會越來越快嗎？再算一次拼好的 20 ÷ 20。',
        },
      ],
      explanation: '加速度 = 力 ÷ 質量 = 20 ÷ 20 = 1 公尺/秒²，也就是 20 = 20 × a 裡的 a。剛好是空車 2 公尺/秒² 的一半，和前面算的「滿車的加速度是空車的 0.5 倍」一致。',
      guide: [
        {
          kind: 'concept',
          id: 'full-cart-accel-solve',
          title: '知道兩個，找第三個',
          body: [
            'F = m × a 裡有三個量：力、質量、加速度。知道其中兩個，就能找出第三個。',
            '這題的力 F 是 20 N，質量 m 是 20 公斤，放進去變成 20 = 20 × a。',
            '接著問自己：20 乘上多少，會等於 20？',
          ],
        },
        {
          kind: 'number',
          id: 'full-cart-accel-equation',
          prompt: '20 = 20 × a，a 是多少？',
          answer: 1,
          unit: '公尺/秒²',
          wrongAnswers: [
            { value: 400, feedback: '20 × 20 是 400，不是 20。要找的是：哪一個數乘上 20，剛好等於 20？' },
            { value: 0, feedback: '20 × 0 是 0，不是 20。要找的是：哪一個數乘上 20，剛好等於 20？' },
          ],
          explanation: '20 × 1 = 20，所以 a = 1。反過來想，「20 乘上多少會等於 20」就是 20 ÷ 20：加速度 = 力 ÷ 質量。回到原題，就照這樣拼出算式。',
        },
      ],
    },
    {
      kind: 'choice',
      id: 'zero-force',
      prompt: '如果一個物體沒有受到力，或各個力互相抵消（合力是 0，F = 0），它的加速度是 0。這和第 1 站的哪一個觀念是同一件事？',
      options: [
        { id: 'inertia', label: '慣性：原本靜止就繼續靜止，原本在動就一直等速前進' },
        {
          id: 'top-of-throw',
          label: '球往上丟到最高點的那一瞬間',
          feedback: '合力是 0 時加速度是 0，這點你抓對了。不過球在最高點時，重力還在拉它，沒有別的力抵消，合力不是 0，所以加速度一直是 −10 公尺/秒²。最高點只是「速度」剛好是 0；1-4 學過，速度是 0 不等於加速度是 0。',
        },
        {
          id: 'slows-down',
          label: '物體會慢慢停下來',
          feedback: '生活中推出去的東西，最後確實會停下來，你觀察得沒錯。不過停下來代表速度在變小，那是有加速度；沒有受到力，或各個力互相抵消的時候，速度不會變。生活中的東西會停，是因為地面和空氣在擋它，那也是力。',
        },
      ],
      answer: 'inertia',
      explanation: '沒有受到力，或各個力互相抵消（合力是 0），加速度就是 0，速度不會變：靜止的繼續靜止，在動的一直等速前進。牛頓第一定律（慣性）就是第二定律在合力是 0 時的特例。',
      guide: [
        {
          kind: 'concept',
          id: 'zero-force-top',
          title: '最高點有沒有力？',
          body: [
            '球在最高點那一瞬間，速度剛好是 0。',
            '可是重力一直在拉球，在最高點也沒有停，又沒有別的力抵消，所以合力 F 不是 0。',
            '合力不是 0 就有加速度：最高點的加速度一直是 −10 公尺/秒²。',
            '速度是 0，不等於加速度是 0。',
          ],
        },
        {
          kind: 'choice',
          id: 'zero-force-gravity',
          prompt: '球在最高點時，有沒有力在拉它？',
          options: [
            { id: 'gravity', label: '有，重力' },
            {
              id: 'none',
              label: '沒有',
              feedback: '那一瞬間球好像停在空中，看起來確實像沒有力。不過它下一刻就往下掉了：是什麼把它往下拉？',
            },
          ],
          answer: 'gravity',
          explanation: '重力一直在拉球，最高點也一樣，又沒有別的力抵消，所以合力 F 不是 0。F = 0 要找的，是沒有受到力，或各個力互相抵消（合力是 0）、速度一直不變的情況。',
        },
      ],
    },
  ],
};

export default forceAndAcceleration;
