/**
 * Final Match hero copy (M5.5-UI-R3 / R4). Other narrative helpers live in `finalMatchPlainLanguage.js`.
 */

/** M5.5-UI-R4: `true` when relationship rhythm influenced who is shown (finalScore stays baseline-only). */
export function pickHeroMainIntro(isRrmDisplay) {
  if (isRrmDisplay) {
    return "系统先筛出基础条件合适的候选人，再结合相处节奏，为你展示当前对象。";
  }
  return "系统根据你的基础资料、问卷画像和候选人排序，为你推荐当前对象。";
}
