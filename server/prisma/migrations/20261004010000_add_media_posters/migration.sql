ALTER TABLE "Media" ADD COLUMN "poster" TEXT NOT NULL DEFAULT '';

UPDATE "Media" SET "poster" = "backdrop" WHERE "poster" = '';

ALTER TABLE "Media" ALTER COLUMN "poster" DROP DEFAULT;
