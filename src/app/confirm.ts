// 帳面や設計を変える操作の前に、確かめの窓を出す（2026-11-05 作者：押した瞬間に変わると怖い）。
// 動画を撮るとき（?rec・?nointro）は窓を出さない。撮る台本が窓で止まらないように

/** 動画や写真を撮っているか（?rec・?nointro）。撮る台本が前提にしている動きを変えないために見る */
export function filming(): boolean {
  const q = new URLSearchParams(location.search);
  return q.has("rec") || q.has("nointro");
}

export function askConfirm(message: string): boolean {
  if (filming()) return true;
  return window.confirm(message);
}
