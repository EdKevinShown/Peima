-- CreateTable
CREATE TABLE "user_friendships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "matchResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_friendships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_friendships_userId_friendUserId_key" ON "user_friendships"("userId", "friendUserId");

-- CreateIndex
CREATE INDEX "user_friendships_userId_createdAt_idx" ON "user_friendships"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_friendUserId_fkey" FOREIGN KEY ("friendUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
