// 数のつまみ：つまみ（指でも押さえやすい太さ）・その場で打てる数の欄・−／＋ の 1 目盛りのボタン。
// スマホ（とくに iPhone の Safari）で、細いつまみを指で合わせにくいという作者の声から（2026-11-03）。
// 形を作る処理は重いので、つまみを動かしている間は数の表示だけ変え、指を離したとき・数を打ち終えたとき・−／＋ を押したときに決める。

export interface SliderSpec {
  /** 見分けるための名前（class にも使う） */
  cls: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
}

/** 目盛りの小数の桁 */
function decimals(step: number): number {
  const s = String(step);
  return s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
}

/** 打った数・ボタンの数を、範囲の中の、いちばん近い目盛りにそろえる。数として読めなければ null */
export function snapValue(raw: number | string, min: number, max: number, step: number): number | null {
  let v = raw as number;
  if (typeof raw === "string") {
    // 日本語の入力で打った全角の数（０．８）も読む
    const half = raw.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^\d.\-]/g, "");
    if (half === "" || half === "." || half === "-") return null;
    v = Number(half);
  }
  if (!Number.isFinite(v)) return null;
  const c = Math.min(max, Math.max(min, v));
  const n = Math.round((c - min) / step);
  const out = Math.min(max, min + n * step);
  return Number(out.toFixed(decimals(step)));
}

/** 数の表示（目盛りの桁で） */
export function formatValue(v: number, step: number): string {
  return v.toFixed(decimals(step));
}

export function sliderHtml(s: SliderSpec): string {
  const v = formatValue(s.value, s.step);
  return `<div class="slider" data-s="${s.cls}">
    <span class="sl-name">${s.label}</span>
    <button type="button" class="sl-step" data-d="-1" aria-label="${s.label}を 1 目盛り小さく">−</button>
    <input type="range" class="${s.cls}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" aria-label="${s.label}">
    <button type="button" class="sl-step" data-d="1" aria-label="${s.label}を 1 目盛り大きく">＋</button>
    <label class="sl-num"><input type="text" inputmode="decimal" enterkeyhint="done" value="${v}" aria-label="${s.label}の数"><small>${s.unit.trim()}</small></label>
  </div>`;
}

/**
 * つまみを動くようにする。onCommit は値が決まったときだけ呼ぶ（同じ値なら呼ばない）。
 * onLive を渡すと、つまみを動かしている間も呼ぶ（軽い形のとき）
 */
export function bindSlider(box: HTMLElement, s: SliderSpec, onCommit: (v: number) => void, onLive?: (v: number) => void): void {
  const root = box.querySelector<HTMLElement>(`.slider[data-s="${s.cls}"]`);
  if (!root) return;
  const range = root.querySelector<HTMLInputElement>('input[type="range"]')!;
  const num = root.querySelector<HTMLInputElement>(".sl-num input")!;
  let current = s.value;
  const show = (v: number) => {
    range.value = formatValue(v, s.step);
    if (document.activeElement !== num) num.value = formatValue(v, s.step);
  };
  const commit = (raw: number | string) => {
    const v = snapValue(raw, s.min, s.max, s.step);
    if (v === null) return show(current);
    show(v);
    num.value = formatValue(v, s.step);
    if (Math.abs(v - current) < 1e-9) return;
    current = v;
    onCommit(v);
  };
  range.addEventListener("input", () => {
    const v = Number(range.value);
    num.value = formatValue(v, s.step);
    onLive?.(v);
  });
  range.addEventListener("change", () => commit(range.value));
  root.querySelectorAll<HTMLButtonElement>(".sl-step").forEach((b) =>
    b.addEventListener("click", () => commit(Number(range.value) + Number(b.dataset.d) * s.step)),
  );
  // 数の欄：押すと全部選ばれて、そのまま打ち替えられる。Enter か、欄の外を押すと決まる
  num.addEventListener("focus", () => num.select());
  num.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      num.blur();
    }
    if (e.key === "Escape") {
      num.value = formatValue(current, s.step);
      num.blur();
    }
  });
  num.addEventListener("blur", () => commit(num.value));
}
