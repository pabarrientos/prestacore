-- CreateTable
CREATE TABLE "BackupExecutionLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "durationMs" INTEGER,
    "backupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupExecutionLog_createdAt_idx" ON "BackupExecutionLog"("createdAt");

-- CreateIndex
CREATE INDEX "BackupExecutionLog_type_idx" ON "BackupExecutionLog"("type");
