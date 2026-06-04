-- AlterTable
ALTER TABLE "DianForm" ADD COLUMN     "conclusion" TEXT,
ADD COLUMN     "objective" TEXT;

-- CreateTable
CREATE TABLE "DianSection" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'L',
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DianSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DianLine" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "k" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "decl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cont" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DianLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DianMapping" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "sign" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DianMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DianComment" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "isAI" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DianComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DianSection" ADD CONSTRAINT "DianSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DianForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DianLine" ADD CONSTRAINT "DianLine_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DianSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DianMapping" ADD CONSTRAINT "DianMapping_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DianForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DianComment" ADD CONSTRAINT "DianComment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DianForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
