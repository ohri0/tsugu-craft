// 帳面・学ぶ・技の入口：合言葉のあとで画面を読む
import { openGate } from "./gate";

void openGate().then(() => import("./main"));
