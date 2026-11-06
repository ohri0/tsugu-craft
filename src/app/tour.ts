// 撮影用の見本（app.html?rec&mihon）：毛彫りの流れを、決まった順に 1 歩ずつ見せる。
// 進め方：右矢印かスペースのキー、または window.tsuguTour.next()（撮る台本から）。自動では進まない（読める速さは撮る側で決める）。
// 言葉はすべて作り話の例（src/app/mihon.ts）。Claude は呼ばない。
import { MIHON_UNKNOWN } from "./mihon";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 出るまで待つ */
async function el<T extends HTMLElement = HTMLElement>(selector: string, ms = 6000): Promise<T> {
  const end = performance.now() + ms;
  for (;;) {
    const found = [...document.querySelectorAll<T>(selector)].find((e) => e.offsetParent !== null);
    if (found) return found;
    if (performance.now() > end) throw new Error(`見つかりません：${selector}`);
    await sleep(50);
  }
}

const go = async (hash: string) => {
  location.hash = hash;
  await sleep(150);
};

/** 人が打つくらいの速さで字を入れる */
async function typeIn(field: HTMLTextAreaElement, text: string) {
  field.scrollIntoView({ block: "center" });
  field.value = "";
  for (const c of text) {
    field.value += c;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(45);
  }
}

async function press(selector: string) {
  const b = await el(selector);
  b.scrollIntoView({ block: "center" });
  await sleep(120);
  b.click();
}

/** 聞き取りに、作り話の例を打って案にする */
async function answerInterview() {
  const field = await el<HTMLTextAreaElement>(".iv-root textarea");
  const example = await el<HTMLButtonElement>(".iv-root .use-example");
  example.click();
  const text = field.value;
  await typeIn(field, text);
  await sleep(250);
  await press(".iv-root .make");
  await el(".iv-root .proposal");
}

async function askLearner(question: string) {
  const field = await el<HTMLTextAreaElement>(".composer textarea");
  await typeIn(field, question);
  await sleep(250);
  await press(".composer .send");
  await el(".thread .a:last-child .a-short");
}

/** 決まった順（ここ 1 か所）。名前は撮る台本が読む */
const STEPS: { name: string; run(): Promise<void> }[] = [
  { name: "技の一覧", run: () => go("#waza") },
  { name: "毛彫りを開く", run: () => go("#waza/kebori") },
  { name: "職人が答える", run: answerInterview },
  { name: "帳面に残る", run: () => press('.iv-root [data-a="ok"]') },
  { name: "手本を開く", run: () => press('.fl-go[data-step="model"]') },
  { name: "手本を残す", run: () => press(".use-mihon-model") },
  { name: "学ぶを開く", run: () => go("#learn/kebori") },
  { name: "学ぶ人が聞く", run: () => askLearner("毛彫りの深さは？") },
  { name: "帳面にない質問", run: () => askLearner(MIHON_UNKNOWN) },
  { name: "手の動きを開く", run: () => go("#learn/hands/kebori") },
  {
    name: "手の動きを比べる",
    run: async () => {
      await press(".try-sample");
      await el(".result .verdict");
    },
  },
  { name: "職人へ戻る", run: () => go("#waza/kebori?step=answer") },
  { name: "届いた質問に答える", run: answerInterview },
  { name: "質問の答えが残る", run: () => press('.iv-root [data-a="ok"]') },
  {
    name: "同じ質問に答えられる",
    run: async () => {
      await go("#learn/kebori");
      await askLearner(MIHON_UNKNOWN);
    },
  },
  { name: "育った技の一覧", run: () => go("#waza") },
];

export function startTour(): void {
  let at = -1;
  let running = false;
  const next = async (): Promise<string | null> => {
    if (running || at >= STEPS.length - 1) return null;
    running = true;
    at++;
    try {
      await STEPS[at].run();
    } finally {
      running = false;
    }
    return STEPS[at].name;
  };
  (window as unknown as { tsuguTour: unknown }).tsuguTour = { next, names: STEPS.map((s) => s.name), at: () => at };
  window.addEventListener("keydown", (e) => {
    if ((e.key === "ArrowRight" || e.key === " ") && !(e.target as HTMLElement).closest("textarea, input, select")) {
      e.preventDefault();
      void next();
    }
  });
}
