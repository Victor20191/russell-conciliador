-- AlterTable
ALTER TABLE "AuditEntry" ADD COLUMN     "ip" TEXT;

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "clientId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
