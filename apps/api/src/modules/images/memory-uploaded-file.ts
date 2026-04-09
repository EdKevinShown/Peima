/**
 * Multer memory-storage shape used by FileInterceptor.
 * Declared locally so we do not rely on Express.Multer (breaks with @types/express v5 alone).
 */
export type MemoryUploadedFile = {
  mimetype: string;
  buffer: Buffer;
};
