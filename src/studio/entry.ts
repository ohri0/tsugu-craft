// 設計の入口：合言葉のあとで画面を読む
import { openGate } from "../app/gate";

void openGate().then(() => import("./main"));
