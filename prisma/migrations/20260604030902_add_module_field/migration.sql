-- CreateTable
CREATE TABLE "ModuleField" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "hint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModuleField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleField_moduleId_key_key" ON "ModuleField"("moduleId", "key");

-- AddForeignKey
ALTER TABLE "ModuleField" ADD CONSTRAINT "ModuleField_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
