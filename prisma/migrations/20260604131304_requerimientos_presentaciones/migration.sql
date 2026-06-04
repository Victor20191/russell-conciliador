-- CreateTable
CREATE TABLE "ReqPresentation" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "presented" TEXT NOT NULL,
    "preparedBy" TEXT NOT NULL,
    "slides" INTEGER NOT NULL DEFAULT 0,
    "author" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "positives" TEXT[],
    "observed" JSONB,
    "evaluated" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReqPresentation_pkey" PRIMARY KEY ("id")
);
