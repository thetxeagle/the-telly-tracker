ALTER TABLE "Media"
ADD COLUMN "tmdbId" INTEGER,
ADD COLUMN "tvmazeId" INTEGER,
ADD COLUMN "imdbId" TEXT,
ADD COLUMN "thetvdbId" INTEGER,
ADD COLUMN "metadataSyncedAt" TIMESTAMP(3),
ADD COLUMN "episodesSyncedAt" TIMESTAMP(3),
ADD COLUMN "syncError" TEXT;

ALTER TABLE "Episode"
ADD COLUMN "tmdbId" INTEGER,
ADD COLUMN "tvmazeId" INTEGER,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Episode" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "Media_type_tmdbId_key" ON "Media"("type", "tmdbId");
CREATE UNIQUE INDEX "Media_tvmazeId_key" ON "Media"("tvmazeId");
CREATE UNIQUE INDEX "Media_imdbId_key" ON "Media"("imdbId");
CREATE UNIQUE INDEX "Media_thetvdbId_key" ON "Media"("thetvdbId");
CREATE INDEX "Media_metadataSyncedAt_idx" ON "Media"("metadataSyncedAt");
CREATE UNIQUE INDEX "Episode_tmdbId_key" ON "Episode"("tmdbId");
CREATE UNIQUE INDEX "Episode_tvmazeId_key" ON "Episode"("tvmazeId");

ALTER TABLE "Media"
ADD CONSTRAINT "Media_tmdbId_positive" CHECK ("tmdbId" IS NULL OR "tmdbId" > 0),
ADD CONSTRAINT "Media_tvmazeId_positive" CHECK ("tvmazeId" IS NULL OR "tvmazeId" > 0),
ADD CONSTRAINT "Media_thetvdbId_positive" CHECK ("thetvdbId" IS NULL OR "thetvdbId" > 0);

ALTER TABLE "Episode"
ADD CONSTRAINT "Episode_tmdbId_positive" CHECK ("tmdbId" IS NULL OR "tmdbId" > 0),
ADD CONSTRAINT "Episode_tvmazeId_positive" CHECK ("tvmazeId" IS NULL OR "tvmazeId" > 0);
