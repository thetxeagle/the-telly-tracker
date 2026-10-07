ALTER TABLE "AppSettings"
ADD COLUMN "setupComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpHost" TEXT,
ADD COLUMN "smtpPort" INTEGER,
ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpUsername" TEXT,
ADD COLUMN "smtpPasswordEncrypted" TEXT,
ADD COLUMN "smtpFromName" TEXT,
ADD COLUMN "smtpFromEmail" TEXT;

UPDATE "AppSettings"
SET "setupComplete" = true
WHERE EXISTS (SELECT 1 FROM "User");

UPDATE "User"
SET "isAdmin" = true
WHERE "id" = (
  SELECT "id"
  FROM "User"
  ORDER BY "createdAt" ASC, "id" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isAdmin" = true);
