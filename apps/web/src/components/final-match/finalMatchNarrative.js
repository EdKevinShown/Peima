/**
 * Final Match hero copy (M5.5-UI-R3). Other narrative helpers live in `finalMatchPlainLanguage.js`.
 */

/** M5.5-UI-R1 / R3: fixed hero intro (plain language, no internal path names). */
export function pickHeroMainIntro(displaySourceType) {
  if (displaySourceType === "rrm_top2_bounded_selector") {
    return "系统先筛出基础条件合适的候选人，再结合相处节奏，为你推荐当前对象。";
  }
  return "系统根据你的基础资料、问卷画像和候选人排序，为你推荐当前对象。";
}
