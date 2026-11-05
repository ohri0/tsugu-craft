// 三角形の並びを数える：開いた辺（向きを見ない）・面の向きの合わない辺・3 枚以上が共有する辺・形の数・つぶれた三角形
export function topology(p: Float32Array) {
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const edges = new Map<string, number>();
  const parent: number[] = [];
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  let degenerate = 0;
  for (let t = 0; t < p.length; t += 9) {
    const v = [id(t), id(t + 3), id(t + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) degenerate++;
    for (const a of v) if (parent[a] === undefined) parent[a] = a;
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
      parent[find(a)] = find(b);
    }
  }
  let open = 0;
  let flipped = 0;
  let shared = 0;
  for (const [k, n] of edges) {
    const [a, b] = k.split(">");
    const back = edges.get(`${b}>${a}`) ?? 0;
    if (back !== n) flipped++;
    if ((n + back) % 2 === 1) open++;
    if (n > 1) shared++;
  }
  return { open, flipped, shared, degenerate, shells: new Set([...ids.values()].map(find)).size };
}
