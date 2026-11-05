// 「自分の技を組み立て直す」の記録を、このブラウザに残す。
// 文（手がかり・案・結果）は store.ts と同じく localStorage に、技ごとの鍵で。
// 写真は重いので、動画と同じ置き場（IndexedDB。src/app/video-store.ts）に。localStorage は全部で数 MB しかなく、写真で埋めると帳面の保存まで黙って失敗するため。
// store.ts の put は「残せなくても画面は動く」だが、ここの記録は職人が手で集めたものなので、残せなかったら必ず知らせる。
import { readProject, type PhotoFile, type RestoreProject } from "../rebuild/restore";
import { getVideo, putVideo, removeVideo } from "./video-store";

/** localStorage のうち、ここで使う所（テストでは偽物に差し替える） */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const KEY = /^tsugu\.restore\.([A-Za-z0-9_-]+)\.v1$/;
const projectKey = (id: string) => `tsugu.restore.${id}.v1`;
const draftKey = (id: string) => `tsugu.restoreDraft.${id}.v1`;

export const SAVE_FAILED = "このブラウザに保存できませんでした（置き場が足りないか、保存が止められています）。";

function defaultStorage(): StorageLike | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function newProjectId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function saveProject(p: RestoreProject, s: StorageLike | null = defaultStorage()): { ok: true } | { ok: false; error: string } {
  try {
    if (!s) throw new Error("no storage");
    s.setItem(projectKey(p.id), JSON.stringify(p));
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export function loadProject(id: string, s: StorageLike | null = defaultStorage()): RestoreProject | null {
  try {
    const raw = s?.getItem(projectKey(id));
    return raw ? readProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 残してある技（新しく直した順） */
export function listProjects(s: StorageLike | null = defaultStorage()): RestoreProject[] {
  if (!s) return [];
  const out: RestoreProject[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const m = KEY.exec(s.key(i) ?? "");
      if (!m) continue;
      const p = loadProject(m[1], s);
      if (p) out.push(p);
    }
  } catch {
    return out;
  }
  return out.sort((a, b) => (a.updated === b.updated ? (a.id < b.id ? 1 : -1) : a.updated < b.updated ? 1 : -1));
}

export function removeProject(id: string, s: StorageLike | null = defaultStorage()): void {
  try {
    s?.removeItem(projectKey(id));
    s?.removeItem(draftKey(id));
  } catch {
    // 消せなくても画面は動く
  }
}

/** 足す前の手がかりの下書き（読み直しても、書いた文が消えないように） */
export interface ClueDraft {
  kind: string;
  title: string;
  text: string;
  source: string;
}

export function saveDraft(id: string, d: ClueDraft | null, s: StorageLike | null = defaultStorage()): void {
  try {
    if (d && (d.title || d.text || d.source)) s?.setItem(draftKey(id), JSON.stringify(d));
    else s?.removeItem(draftKey(id));
  } catch {
    // 下書きは残せなくても、足した手がかりは別に残る
  }
}

export function loadDraft(id: string, s: StorageLike | null = defaultStorage()): ClueDraft | null {
  try {
    const raw = s?.getItem(draftKey(id));
    const d = raw ? (JSON.parse(raw) as Partial<ClueDraft>) : null;
    return d ? { kind: String(d.kind ?? ""), title: String(d.title ?? ""), text: String(d.text ?? ""), source: String(d.source ?? "") } : null;
  } catch {
    return null;
  }
}

// ---- 写真 ----

/** 残す写真の長い辺（px）。Claude には、これをそのまま渡す（石の写真やデザインの絵と同じ大きさ） */
export const PHOTO_MAX_PX = 1024;

const photoKey = (projectId: string, clueId: string) => `restore:${projectId}:${clueId}`;

/** 写真を小さくして JPEG にする。読めない形式なら投げる */
export async function shrinkPhoto(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; // すけた所が黒くならないように
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("写真を作れませんでした");
  return { blob, w: c.width, h: c.height };
}

export const putPhoto = (projectId: string, clueId: string, blob: Blob) => putVideo(photoKey(projectId, clueId), blob);
export const getPhoto = (projectId: string, clueId: string) => getVideo(photoKey(projectId, clueId));
export const removePhoto = (projectId: string, clueId: string) => removeVideo(photoKey(projectId, clueId)).catch(() => undefined);

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function photoFileToBlob(f: PhotoFile): Blob {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: f.media });
}
