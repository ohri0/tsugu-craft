// 声で書く：ブラウザの日本語の音声の聞き取りで、話した言葉を入力欄に入れる。
// 聞き取りを持たないブラウザでは、ボタンを出さない（書いて送れる）。
interface Alt { transcript: string }
interface Result { isFinal: boolean; 0: Alt; length: number }
interface RecEvent { resultIndex: number; results: ArrayLike<Result> }
interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => Recognizer;

function speechCtor(): Ctor | undefined {
  const w = window as unknown as { webkitSpeechRecognition?: Ctor; SpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canListen = () => speechCtor() !== undefined;

/**
 * ボタンを押すと聞き始め、もう一度押すと止める。話している間は入力欄に途中の言葉も出す。
 * 止めたら onDone（入力欄の最後の文字）を呼ぶ。
 */
export function bindVoice(btn: HTMLButtonElement, field: HTMLTextAreaElement | HTMLInputElement, opts: { onDone?: (text: string) => void; onError?: (msg: string) => void } = {}): { stop(): void } {
  const Speech = speechCtor();
  if (!Speech) {
    btn.hidden = true;
    return { stop: () => undefined };
  }
  let rec: Recognizer | null = null;
  const label = btn.innerHTML;
  btn.addEventListener("click", () => {
    if (rec) {
      rec.stop();
      return;
    }
    const before = field.value ? `${field.value} ` : "";
    let finals = "";
    rec = new Speech();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;
    btn.classList.add("listening");
    btn.setAttribute("aria-pressed", "true");
    btn.innerHTML = `<span class="dot"></span>聞いています`;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      field.value = before + finals + interim;
    };
    rec.onerror = (e) => opts.onError?.(e.error === "not-allowed" ? "マイクが使えません。書いて送ってください。" : "聞き取れませんでした。もう一度話すか、書いて送ってください。");
    rec.onend = () => {
      rec = null;
      btn.classList.remove("listening");
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = label;
      opts.onDone?.(field.value.trim());
    };
    try {
      rec.start();
    } catch {
      rec = null;
      btn.innerHTML = label;
    }
  });
  return { stop: () => rec?.stop() };
}
