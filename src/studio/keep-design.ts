// 今の設計を、このタブの間だけ残す（sessionStorage）。読み直しても、帳面へ行って戻っても、設計が消えないように。
// タブを閉じれば消える。作品として残すのは「記録」の役目。画面には依存しない（入れ物は外から受け取る）。
import type { Point } from "../geometry/polygon";
import type { StoneOutline } from "../geometry/measure";
import type { Metal } from "../claude/tools";
import type { Band } from "./band";
import type { RingState } from "./session";

const DESIGN_KEY = "tsugu.studio.design.v1";
/** 写真は大きいので別に置く（入らなくても設計は残る） */
const PHOTO_KEY = "tsugu.studio.photo.v1";
/** 最初の見せ場を見たか */
const INTRO_KEY = "tsugu.studio.introSeen.v1";

type Box = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 石（写真そのものは別。写真の上の座標は、残した写真の大きさに合わせてある） */
export interface KeptStone {
  label: string;
  depthMm: number;
  shapeName: string;
  cornerIdx: { index: number; angle: number }[];
  measured: StoneOutline;
  outlinePx: Point[];
  color: { r: number; g: number; b: number };
  colorless: boolean;
  photoWidth: number;
  photoHeight: number;
}

export interface KeptDesign {
  kind: "solitaire" | "band";
  mode: string;
  /** よくある形から選んだ石なら、その名札 */
  presetId?: string;
  stone: KeptStone;
  state: RingState;
  band: Band;
  bandMetal: Metal;
}

/** 設計を残す。入らなくても画面は止めない */
export function saveDesign(box: Box, d: KeptDesign): boolean {
  try {
    box.setItem(DESIGN_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** 残した設計を読む。なければ、または形が読めなければ null（はじめの設計から始める） */
export function loadDesign(box: Box): KeptDesign | null {
  try {
    const d = JSON.parse(box.getItem(DESIGN_KEY) ?? "null") as KeptDesign | null;
    if (!d || (d.kind !== "solitaire" && d.kind !== "band")) return null;
    if (!Array.isArray(d.stone?.measured?.outlineMm) || !d.stone.measured.outlineMm.length || !Array.isArray(d.stone.outlinePx)) return null;
    if (!(d.stone.measured.longMm > 0) || !(d.stone.depthMm > 0)) return null;
    if (typeof d.state?.gou !== "number" || !d.state.metal || !d.band?.top) return null;
    return d;
  } catch {
    return null;
  }
}

/** 写真（data URL）を残す。入らなければ消して false（写真がなくても設計は戻せる） */
export function savePhoto(box: Box, dataUrl: string): boolean {
  try {
    box.setItem(PHOTO_KEY, dataUrl);
    return true;
  } catch {
    try {
      box.removeItem(PHOTO_KEY);
    } catch {
      // 残せなくても画面は動く
    }
    return false;
  }
}

export function loadPhotoUrl(box: Box): string {
  try {
    return box.getItem(PHOTO_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 残した設計を消す（見せ場を見たことは消さない） */
export function clearDesign(box: Box): void {
  try {
    box.removeItem(DESIGN_KEY);
    box.removeItem(PHOTO_KEY);
  } catch {
    // 残せなくても画面は動く
  }
}

export function introSeen(box: Box): boolean {
  try {
    return box.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(box: Box): void {
  try {
    box.setItem(INTRO_KEY, "1");
  } catch {
    // 残せなくても画面は動く
  }
}

/** sessionStorage（使えないブラウザでは、入れても残らない入れ物） */
export function tabBox(): Box {
  try {
    return window.sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}
