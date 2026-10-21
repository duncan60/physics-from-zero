// 2-3 作用力與反作用力。課程內容採用 CC BY-SA 4.0，見 ../LICENSE.md。
// 穿直排輪推牆、在小船上丟球：你推東西，東西同時推你（牛頓第三定律）。
// 兩個力一樣大、方向相反、同時出現，推在不同的東西上，所以不會抵消；力一樣大時，質量小的加速度大（a = F ÷ m）。
import type { Lesson } from '../../lib/types';

const actionReaction: Lesson = {
  id: '2-3',
  title: '作用力與反作用力',
  steps: [
    {
      kind: 'choice',
      id: 'skate-wall',
      prompt: '你穿著直排輪，站在一面牆前面，用手推牆。你會怎樣？',
      options: [
        {
          id: 'stay',
          label: '還在原地，因為輪子光滑、摩擦力小，而牆壁不會動',
          feedback:
            '牆壁不會動、輪子的摩擦力小，這兩點你都說對了。不過摩擦力小，代表腳下的地面擋不住你。地面擋不住的時候，你是比較容易站穩，還是比較容易被推動？',
        },
        {
          id: 'forward',
          label: '往前，貼到牆上',
          feedback: '你用力往前推，覺得身體會跟著往前，這很自然。不過牆不會動，你的手推不過去。用力推的那一下，你的手掌有什麼感覺？',
        },
        { id: 'back', label: '往後滑' },
      ],
      answer: 'back',
      explanation: '你會往後滑。輪子的摩擦力小，地面擋不住你，所以反而更容易被推動。',
    },
    {
      kind: 'choice',
      id: 'who-pushed',
      prompt: '你往後滑了。是誰把你往後推的？',
      options: [
        {
          id: 'friction',
          label: '摩擦力',
          feedback:
            '你想到要找一個力，這個方向對了。不過這裡的摩擦力只會擋住你滑動，讓你慢下來，不會把你推走。要把你往後推，得有東西碰著你。剛剛你碰到了什麼？',
        },
        {
          id: 'self',
          label: '我自己',
          feedback: '力確實是你出的，這點沒錯。不過你的力推在牆上，不是推在自己身上。那推在你身上的力，是從哪裡來的？',
        },
        { id: 'wall', label: '牆' },
      ],
      answer: 'wall',
      explanation: '是牆。你推牆的同時，牆也推你，所以你往後滑。',
    },
    {
      kind: 'concept',
      id: 'third-law',
      title: '作用力與反作用力',
      body: [
        '你推牆，是作用力；牆同時推你，是反作用力。',
        '這兩個力一樣大、方向相反，而且同時出現、同時消失。',
        '它們推在不同的東西上：一個在牆上，一個在你身上，所以不會互相抵消。',
        '這叫做牛頓第三定律。',
      ],
    },
    {
      kind: 'choice',
      id: 'cancel',
      prompt: '你推牆的力和牆推你的力，一樣大、方向相反。這兩個力會互相抵消嗎？',
      options: [
        {
          id: 'yes',
          label: '會',
          feedback:
            '一樣大、方向相反，這兩點你都看對了。不過要互相抵消，兩個力得推在同一個東西上。你推牆的力推在誰身上？牆推你的力又推在誰身上？',
        },
        { id: 'no', label: '不會' },
      ],
      answer: 'no',
      explanation: '不會。你推牆的力在牆上，牆推你的力在你身上，推在不同的東西上，所以不會抵消，你才會往後滑。',
    },
    {
      kind: 'choice',
      id: 'boat-throw',
      prompt: '你坐在靜止水面上的小船裡，用力把一顆球往前丟出去。船會怎樣？',
      options: [
        {
          id: 'wobble',
          label: '會因為水面的水波，小船搖晃',
          feedback: '小船可能真的會晃一晃，你觀察得很仔細。不過水波不是主角。想想剛學的：你推東西的時候，那個東西也同時推你。丟球時，你推了誰？',
        },
        {
          id: 'still',
          label: '船不會動',
          feedback: '船比球重很多，看起來好像不會動，這很自然。不過丟球時你用力推了球。用剛學的想一想：球有沒有也推你？',
        },
        {
          id: 'forward',
          label: '跟著球往前',
          feedback: '丟球時身體會往前傾，很容易覺得船也會往前。不過你的手是把球往前推。球被推的同時，也在推你的手：往哪個方向？',
        },
        { id: 'backward', label: '往後移動' },
      ],
      answer: 'backward',
      explanation: '你的手把球往前推，球同時把手往後推，你和船就一起往後移動。',
      guide: [
        {
          kind: 'choice',
          id: 'boat-ball-pushes',
          prompt: '先只看手和球。手把球往前推的時候，球推手往哪裡？',
          options: [
            {
              id: 'forward',
              label: '往前',
              feedback: '球往前飛，這點沒錯。不過那是手推球的方向。反過來，球推手的力，和手推球的力方向一樣，還是相反？',
            },
            { id: 'backward', label: '往後' },
          ],
          answer: 'backward',
          explanation: '手推球往前，球同時推手往後。這就是作用力與反作用力。',
        },
        {
          kind: 'choice',
          id: 'boat-direction',
          prompt: '球把你的手往後推。你和船連在一起，船會往哪裡動？',
          options: [
            { id: 'opposite', label: '往反方向移動，也就是往後' },
            {
              id: 'with-ball',
              label: '和球一樣往前',
              feedback: '往前飛的是球。推在你身上的，是球推手的那個力。它往哪個方向，你和船就會往哪裡動。',
            },
          ],
          answer: 'opposite',
          explanation: '球推手往後，你和船一起往後移動，方向和球相反。',
        },
      ],
    },
    {
      kind: 'choice',
      id: 'ball-vs-boat',
      prompt: '球和船受到的力一樣大。為什麼球飛得很快，船卻只往後動一點點？',
      options: [
        {
          id: 'mass-and-drag',
          label: '因為球的質量小、阻力小',
          feedback: '質量小，這點你說對了，這正是關鍵。不過阻力不是主要的原因。想想看：就算完全沒有阻力，球會不會還是比船快很多？',
        },
        {
          id: 'bigger-force',
          label: '其實球受到的力比較大',
          feedback: '球飛得快，很容易讓人覺得它被推得比較用力。不過作用力與反作用力一樣大。力一樣大的時候，2-1 學過要看什麼？',
        },
        { id: 'mass', label: '因為球的質量比船小很多' },
      ],
      answer: 'mass',
      explanation: '力一樣大，質量小的加速度大：a = F ÷ m。就算完全沒有阻力，球還是比船快很多。',
      guide: [
        {
          kind: 'concept',
          id: 'ball-vs-boat-mass',
          title: '力一樣大，看質量',
          body: [
            '2-1 學過：一樣的力，質量越大，加速度越小。',
            '寫成 a = F ÷ m：力除以質量，就是加速度。',
            '阻力不是主要的原因：就算完全沒有阻力，質量小的那個還是快很多。',
          ],
        },
        {
          kind: 'number',
          id: 'ball-vs-boat-accel',
          prompt: '假設球和船各受到 10 N 的力。球是 1 公斤，船和你加起來是 100 公斤。船的加速度是多少？',
          answer: 0.1,
          unit: '公尺/秒²',
          wrongAnswers: [
            {
              value: 1000,
              feedback: '力和質量都用上了。不過 10 × 100 是相乘：船比球重那麼多，加速度反而變大了嗎？a = F ÷ m，再算一次。',
            },
            { value: 10, feedback: '10 公尺/秒² 是球的加速度：10 ÷ 1 = 10。這題問的是船：船和你加起來是幾公斤？' },
          ],
          explanation: '船是 10 ÷ 100 = 0.1 公尺/秒²，球是 10 ÷ 1 = 10 公尺/秒²，球是船的 100 倍。所以球飛得快，船只動一點點。',
        },
      ],
    },
  ],
};

export default actionReaction;
