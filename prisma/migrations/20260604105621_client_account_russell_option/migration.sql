-- CreateTable
CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "russellCode" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RussellOption" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT,

    CONSTRAINT "RussellOption_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccount_clientName_code_key" ON "ClientAccount"("clientName", "code");
