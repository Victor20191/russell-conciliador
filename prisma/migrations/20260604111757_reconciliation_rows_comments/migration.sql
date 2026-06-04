-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "cutoff" TEXT,
ADD COLUMN     "lastActivity" TEXT,
ADD COLUMN     "materiality" INTEGER NOT NULL DEFAULT 2000000,
ADD COLUMN     "runAt" TEXT,
ADD COLUMN     "runBy" TEXT;

-- CreateTable
CREATE TABLE "ReconciliationRow" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "cont" INTEGER NOT NULL,
    "mod" INTEGER NOT NULL,
    "diff" INTEGER NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "manualStatus" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReconciliationRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationComment" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReconciliationRow" ADD CONSTRAINT "ReconciliationRow_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationComment" ADD CONSTRAINT "ReconciliationComment_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
