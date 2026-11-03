// 職人の決まりに、職人本人の声を添える。録った声はこのブラウザの中（IndexedDB）だけに残し、外には送らない。
// 赤い所（作れない所）を押したり、問題の札の「職人の声で聞く」を押したりすると、その決まりの声が流れる。
const DB = "tsugu.voices";
const STORE = "voices";
/** 1 つの声の長さの上限（秒）。理由を一言で話してもらう */
export const MAX_SECONDS = 30;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const putVoice = (ruleId: string, blob: Blob) => run("readwrite", (s) => s.put(blob, ruleId)).then(() => undefined);
export const getVoice = (ruleId: string) => run<Blob | undefined>("readonly", (s) => s.get(ruleId)).then((b) => b ?? null, () => null);
export const deleteVoice = (ruleId: string) => run("readwrite", (s) => s.delete(ruleId)).then(() => undefined);
/** 声のある決まりの id の一覧 */
export const voiceIds = () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((k) => new Set(k.map(String)), () => new Set<string>());

/** 録音を始める。返す関数を呼ぶと止まり、録った声を返す（上限の秒数で自動で止まる） */
export async function startRecording(onAutoStop: () => void): Promise<() => Promise<Blob>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // iPhone の Safari は webm を録れないので、録れる形を選ぶ
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }));
    };
  });
  rec.start();
  const timer = setTimeout(() => {
    if (rec.state === "recording") {
      rec.stop();
      onAutoStop();
    }
  }, MAX_SECONDS * 1000);
  return () => {
    clearTimeout(timer);
    if (rec.state === "recording") rec.stop();
    return done;
  };
}

let playing: HTMLAudioElement | null = null;
/** 決まりの声を流す。なければ false */
export async function playVoice(ruleId: string): Promise<boolean> {
  const blob = await getVoice(ruleId);
  if (!blob) return false;
  playing?.pause();
  const url = URL.createObjectURL(blob);
  playing = new Audio(url);
  playing.onended = () => URL.revokeObjectURL(url);
  await playing.play().catch(() => undefined);
  return true;
}
