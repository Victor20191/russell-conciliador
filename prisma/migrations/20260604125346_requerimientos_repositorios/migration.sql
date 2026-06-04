-- CreateTable
CREATE TABLE "ReqRepository" (
    "id" TEXT NOT NULL,
    "consec" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "cutoff" TEXT NOT NULL,
    "sentAt" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "daysLeft" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "overdue" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,

    CONSTRAINT "ReqRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqRepoFamily" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReqRepoFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqRepoItem" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "doc" TEXT NOT NULL,
    "due" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "file" TEXT,
    "size" TEXT,
    "by" TEXT,
    "at" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReqRepoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqRepoActivity" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReqRepoActivity_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReqRepoFamily" ADD CONSTRAINT "ReqRepoFamily_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "ReqRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRepoItem" ADD CONSTRAINT "ReqRepoItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ReqRepoFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRepoActivity" ADD CONSTRAINT "ReqRepoActivity_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "ReqRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
