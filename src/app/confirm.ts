// 帳面や設計を変える操作の前に、確かめの窓を出す（2026-11-05 作者：押した瞬間に変わると怖い）。
// 動画を撮るとき（?rec・?nointro）は窓を出さない。撮る台本が窓で止まらないように

export function askConfirm(message: string): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has("rec") || q.has("nointro")) return true;
  return window.confirm(message);
}
