// この工房の職人の帳面を、途切れた技の案のために読む。読むだけで、書き換えない。
// 使っている帳面の職人の決まりと、はじめの工房なら、技の頁（覆輪留め・槌目など）の職人の決まりも。
import { readBook, type Book, type BookSource } from "../rebuild/book";
import { TECH_IDS, TECHS } from "../rules/techniques";
import { MAIN } from "../rules/workshops";
import { store } from "./store";

export function workshopBook(): Book {
  const sources: BookSource[] = [{ craft: "指輪の石留め", ledger: store.ledger() }];
  // 技の頁の帳面は、はじめの工房のもの。ほかの工房の帳面を使っているときは混ぜない
  if (store.workshops().active === MAIN) for (const id of TECH_IDS) sources.push({ craft: TECHS[id].name, ledger: store.techLedger(id) });
  return readBook(sources);
}
