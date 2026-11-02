// 入口のページの、ゆっくり回る見本の指輪。エディターと同じ形の処理（buildRing）と同じ 3D（Viewer）を使う。
// 見本：ラウンドの石（よくある例の大きさ）・爪留め・標準の高さ・11 号。
// スマホでは軽い形（preview）だけ。PC では軽い形を先に出し、あとで細かい形（final）に替える。
import { buildRing, type RingDesign } from "../geometry/ring";
import type { SolidQuality } from "../geometry/setting";
import { PRESETS, presetOutline } from "../studio/presets";
import { Viewer } from "../ui/viewer";

const LOOK = { color: { r: 240, g: 240, b: 245 }, colorless: true };

export const SAMPLE = PRESETS.find((p) => p.id === "round") ?? PRESETS[0];
export const SAMPLE_GOU = 11;

function sampleRing(quality: SolidQuality): RingDesign {
  const p = SAMPLE;
  return buildRing({
    stone: { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm },
    setting: { style: "prong", height: "standard", vAtCorners: false, solid: true, solidQuality: quality },
    shank: { gou: SAMPLE_GOU },
  });
}

export function startHero(host: HTMLElement, light: boolean): void {
  const viewer = new Viewer(host);
  viewer.setDark(true);
  viewer.setRing(sampleRing("preview"), LOOK, []);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = true;
  const spin = () => viewer.setAutoRotate(visible && !still && !document.hidden);
  spin();
  // 見えていない間は回さない（電池のため）
  new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting);
    spin();
  }).observe(host);
  document.addEventListener("visibilitychange", spin);

  // ページを読む邪魔をしない：ホイールはページのスクロールに回す。スマホでは指で回さない（縦のスクロールを止めないため）
  host.addEventListener("wheel", (e) => e.stopPropagation(), { capture: true });
  const canvas = host.querySelector("canvas");
  if (canvas && matchMedia("(pointer: coarse)").matches) canvas.style.pointerEvents = "none";

  if (!light) setTimeout(() => viewer.setRing(sampleRing("final"), LOOK, []), 1200);
}
