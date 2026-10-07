ALTER TABLE "User"
ADD COLUMN "totpSecretEncrypted" TEXT,
ADD COLUMN "totpPendingSecretEncrypted" TEXT,
ADD COLUMN "totpPendingCreatedAt" TIMESTAMP(3),
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastUsedStep" INTEGER;

CREATE TABLE "TotpRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TotpRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TotpRecoveryCode_userId_codeHash_key" ON "TotpRecoveryCode"("userId", "codeHash");
CREATE INDEX "TotpRecoveryCode_userId_usedAt_idx" ON "TotpRecoveryCode"("userId", "usedAt");
CREATE UNIQUE INDEX "LoginChallenge_tokenHash_key" ON "LoginChallenge"("tokenHash");
CREATE INDEX "LoginChallenge_userId_expiresAt_idx" ON "LoginChallenge"("userId", "expiresAt");
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

ALTER TABLE "TotpRecoveryCode"
ADD CONSTRAINT "TotpRecoveryCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginChallenge"
ADD CONSTRAINT "LoginChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
