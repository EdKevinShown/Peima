/**
 * P7.10-r11 — shared eligibility helper (extracted from removed onboarding photo preview pool writer).
 */

export function isEligiblePreviewCandidate(
  candidateUserId: string,
  viewerUserId: string,
): boolean {
  return candidateUserId !== viewerUserId && candidateUserId.trim() !== "";
}
