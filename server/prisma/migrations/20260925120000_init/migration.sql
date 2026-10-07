CREATE TYPE "MediaType" AS ENUM ('MOVIE', 'SHOW');
CREATE TYPE "LibraryStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'WATCHED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Media" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "MediaType" NOT NULL,
  "synopsis" TEXT NOT NULL,
  "releaseDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "totalSeasons" INTEGER,
  "totalEpisodes" INTEGER,
  "backdrop" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Episode" (
  "id" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "season" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "airDate" TIMESTAMP(3) NOT NULL,
  "runtime" INTEGER NOT NULL,
  CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "status" "LibraryStatus" NOT NULL DEFAULT 'PLANNED',
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EpisodeProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "watched" BOOLEAN NOT NULL DEFAULT true,
  "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EpisodeProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Media_sourceId_key" ON "Media"("sourceId");
CREATE UNIQUE INDEX "Episode_mediaId_season_number_key" ON "Episode"("mediaId", "season", "number");
CREATE INDEX "Episode_airDate_idx" ON "Episode"("airDate");
CREATE UNIQUE INDEX "LibraryEntry_userId_mediaId_key" ON "LibraryEntry"("userId", "mediaId");
CREATE INDEX "LibraryEntry_userId_status_idx" ON "LibraryEntry"("userId", "status");
CREATE UNIQUE INDEX "EpisodeProgress_userId_episodeId_key" ON "EpisodeProgress"("userId", "episodeId");
CREATE INDEX "EpisodeProgress_userId_watched_idx" ON "EpisodeProgress"("userId", "watched");

ALTER TABLE "Episode" ADD CONSTRAINT "Episode_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EpisodeProgress" ADD CONSTRAINT "EpisodeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EpisodeProgress" ADD CONSTRAINT "EpisodeProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
