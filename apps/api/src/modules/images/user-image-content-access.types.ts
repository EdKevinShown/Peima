export type UserImageContentVariant = "clear" | "blurred";

export type UserImageContentAccessResult =
  | { allowed: false; httpStatus: 403 | 404; message: string }
  | { allowed: true; variant: UserImageContentVariant };
