-- AlterTable
ALTER TABLE "Balance" ADD COLUMN     "auditLog" JSONB,
ADD COLUMN     "diff" JSONB,
ADD COLUMN     "lastUpload" TEXT,
ADD COLUMN     "versionHistory" JSONB;
