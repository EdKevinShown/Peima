/**
 * Shared runtime/build configuration helpers.
 * Wire env parsing and defaults here in later iterations.
 */

export function getNodeEnv(): string {
  return process.env.NODE_ENV ?? "development";
}
