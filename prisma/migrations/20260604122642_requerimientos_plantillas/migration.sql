-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activeVersion" TEXT NOT NULL,
    "families" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TEXT NOT NULL,
    "lastUpdatedBy" TEXT NOT NULL,

    CONSTRAINT "ReqTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqTemplateHeader" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "firmName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "noteGeneric" TEXT NOT NULL,
    "closing" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" TEXT NOT NULL,
    "signatoryFooter" TEXT NOT NULL,
    "consecutivePrefix" TEXT NOT NULL,
    "contactEmails" TEXT[],

    CONSTRAINT "ReqTemplateHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqFamily" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReqFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqItem" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqSubmission" (
    "id" TEXT NOT NULL,
    "consec" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReqSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReqTemplateHeader_templateId_key" ON "ReqTemplateHeader"("templateId");

-- AddForeignKey
ALTER TABLE "ReqTemplateHeader" ADD CONSTRAINT "ReqTemplateHeader_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReqTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqFamily" ADD CONSTRAINT "ReqFamily_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReqTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqItem" ADD CONSTRAINT "ReqItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ReqFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
