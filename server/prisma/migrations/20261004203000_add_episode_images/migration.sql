ALTER TABLE "Episode" ADD COLUMN "image" TEXT NOT NULL DEFAULT '';

-- Force an immediate provider refresh after deployment so existing shows receive episode stills.
UPDATE "Media" SET "metadataSyncedAt" = NULL WHERE "type" = 'SHOW';
