import type { UserImage } from "@peima/database";

/** User-facing UserImage row (no internal reviewNote). */
export type UserImagePublicDto = Omit<UserImage, "reviewNote">;

export function toUserImagePublicDto(row: UserImage): UserImagePublicDto {
  const { reviewNote: _reviewNote, ...rest } = row;
  return rest;
}

export function toUserImagePublicDtoList(
  rows: UserImage[],
): UserImagePublicDto[] {
  return rows.map(toUserImagePublicDto);
}
