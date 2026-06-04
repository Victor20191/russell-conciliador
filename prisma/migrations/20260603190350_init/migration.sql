-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Auditor Junior',
    "initials" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "erp" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientModule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ClientModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "erp" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardAccount" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "nature" TEXT NOT NULL,
    "parent" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StandardAccount_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientNit" TEXT,
    "period" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Única',
    "complete" INTEGER NOT NULL DEFAULT 100,
    "sums" JSONB,
    "validations" JSONB,
    "breakdown" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DianForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "periodicity" TEXT NOT NULL,
    "icon" TEXT NOT NULL,

    CONSTRAINT "DianForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DianPeriod" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filed" TEXT,
    "formId" TEXT NOT NULL,

    CONSTRAINT "DianPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientModule_clientId_moduleId_key" ON "ClientModule"("clientId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_clientName_period_version_key" ON "Balance"("clientName", "period", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DianPeriod_formId_periodKey_key" ON "DianPeriod"("formId", "periodKey");

-- AddForeignKey
ALTER TABLE "ClientModule" ADD CONSTRAINT "ClientModule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientModule" ADD CONSTRAINT "ClientModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DianPeriod" ADD CONSTRAINT "DianPeriod_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DianForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
