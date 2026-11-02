// リポジトリの research/<技>/runs/*.json に置いた、Claude が実際に組み立てた記録を読む（組み立て直すの画面で「書き出す」で出したもの）。
import { pickPublished, type Run } from "./runs";

const files = import.meta.glob<unknown>("../../research/*/runs/*.json", { eager: true, import: "default" });

export const PUBLISHED_RUNS: Run[] = pickPublished(Object.values(files));
