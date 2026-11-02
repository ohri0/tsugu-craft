// 手の記録（1 本の動画から作る、残して後で比べられる記録）。画面に依存しない。
// 動画そのものは入れない（重いので）。手の点は間引いて入れ、数字はいつでも出し直せる。
import { analyzeMotion, type HandObservation, type MotionInput, type MotionMetrics } from "./motion";

export const RECORD_VERSION = 1;

export interface SkillNote {
  /** 動画の中の時刻（秒） */
  t: number;
  /** 職人の言葉（話したこと・書いたこと） */
  text: string;
}

/** 間引いた手の点。1 本の手は [x0, y0, x1, y1, … x20, y20]（0〜1、小数 3 けた） */
export interface SampledLandmarks {
  fps: number;
  aspect: number;
  frames: { t: number; hands: number[][] }[];
}

export interface SkillRecord {
  version: number;
  id: string;
  /** 何の仕事か（例：鏨で線を彫る） */
  title: string;
  /** 誰の手か */
  craftsman: string;
  /** YYYY-MM-DD */
  date: string;
  videoName: string;
  durationS: number;
  notes: SkillNote[];
  metrics: MotionMetrics;
  landmarksSampled: SampledLandmarks;
}

/** 残すときの、1 秒あたりのこま数 */
export const SAMPLE_FPS = 10;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 手の点を、決まった間隔に間引いて小さくする */
export function sampleLandmarks(input: MotionInput, fps = SAMPLE_FPS): SampledLandmarks {
  const step = 1 / fps;
  const frames: SampledLandmarks["frames"] = [];
  let next = -Infinity;
  for (const f of input.frames.slice().sort((a, b) => a.t - b.t)) {
    if (f.t + 1e-6 < next) continue;
    next = (frames.length === 0 ? f.t : next) + step;
    frames.push({
      t: round3(f.t),
      hands: f.hands.filter((h) => h.landmarks?.length >= 21).map((h) => h.landmarks.slice(0, 21).flatMap((p) => [round3(p.x), round3(p.y)])),
    });
  }
  return { fps, aspect: round3(input.aspect), frames };
}

/** 間引いた手の点を、数字を出す形に戻す */
export function inputFromSampled(s: SampledLandmarks, durationS?: number): MotionInput {
  return {
    aspect: s.aspect,
    durationS,
    frames: s.frames.map((f) => ({
      t: f.t,
      hands: f.hands.map(
        (flat): HandObservation => ({
          landmarks: Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i], y: flat[2 * i + 1] })),
        }),
      ),
    })),
  };
}

export interface NewRecord {
  title: string;
  craftsman: string;
  videoName: string;
  date?: string;
  notes?: SkillNote[];
  id?: string;
}

const newId = () => `rec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/** 読んだ手の点から記録を作る（数字は読んだときの全部のこまから出す） */
export function createRecord(input: MotionInput, info: NewRecord): SkillRecord {
  const metrics = analyzeMotion(input);
  return {
    version: RECORD_VERSION,
    id: info.id ?? newId(),
    title: info.title.trim() || "手の記録",
    craftsman: info.craftsman.trim(),
    date: info.date ?? new Date().toLocaleDateString("sv-SE"),
    videoName: info.videoName,
    durationS: metrics.durationS,
    notes: sortNotes(info.notes ?? []),
    metrics,
    landmarksSampled: sampleLandmarks(input),
  };
}

const sortNotes = (n: SkillNote[]) => n.slice().sort((a, b) => a.t - b.t);

/** 動画のその時刻に、職人の言葉を足す */
export function addNote(r: SkillRecord, t: number, text: string): SkillRecord {
  const s = text.trim();
  if (!s) return r;
  return { ...r, notes: sortNotes([...r.notes, { t: Math.max(0, round3(t)), text: s }]) };
}

export function removeNote(r: SkillRecord, index: number): SkillRecord {
  return { ...r, notes: r.notes.filter((_, i) => i !== index) };
}

/** JSON に書き出す */
export function exportRecord(r: SkillRecord): string {
  return JSON.stringify(r);
}

export class RecordFormatError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON（文字か、読んだ物）から記録を読む。数字がなければ手の点から出し直す */
export function importRecord(src: string | unknown): SkillRecord {
  let v: unknown = src;
  if (typeof src === "string") {
    try {
      v = JSON.parse(src);
    } catch {
      throw new RecordFormatError("JSON として読めませんでした。");
    }
  }
  if (!isObj(v)) throw new RecordFormatError("手の記録の形ではありません。");
  const lm = v.landmarksSampled;
  if (!isObj(lm) || !Array.isArray(lm.frames) || typeof lm.aspect !== "number") {
    throw new RecordFormatError("手の点（landmarksSampled）がありません。");
  }
  const notes = Array.isArray(v.notes)
    ? v.notes.filter((n): n is SkillNote => isObj(n) && typeof n.t === "number" && typeof n.text === "string").map((n) => ({ t: n.t, text: n.text }))
    : [];
  const landmarksSampled: SampledLandmarks = {
    fps: typeof lm.fps === "number" ? lm.fps : SAMPLE_FPS,
    aspect: lm.aspect,
    frames: (lm.frames as unknown[]).filter(isObj).map((f) => ({
      t: Number(f.t),
      hands: Array.isArray(f.hands) ? (f.hands as unknown[]).filter((h): h is number[] => Array.isArray(h) && h.length >= 42 && h.every((x) => typeof x === "number")) : [],
    })),
  };
  const durationS = typeof v.durationS === "number" ? v.durationS : undefined;
  const metrics = isObj(v.metrics) && Array.isArray(v.metrics.hands) ? (v.metrics as unknown as MotionMetrics) : analyzeMotion(inputFromSampled(landmarksSampled, durationS));
  const str = (x: unknown, d: string) => (typeof x === "string" ? x : d);
  return {
    version: typeof v.version === "number" ? v.version : RECORD_VERSION,
    id: str(v.id, newId()),
    title: str(v.title, "手の記録"),
    craftsman: str(v.craftsman, ""),
    date: str(v.date, ""),
    videoName: str(v.videoName, ""),
    durationS: durationS ?? metrics.durationS,
    notes: sortNotes(notes),
    metrics,
    landmarksSampled,
  };
}
