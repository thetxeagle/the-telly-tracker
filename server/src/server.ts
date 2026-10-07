import { PrismaClient, type LibraryStatus, type Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import cors from "cors"
import express, { type NextFunction, type Request, type Response } from "express"
import helmet from "helmet"
import jwt from "jsonwebtoken"
import { createHash, randomBytes } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import { PrismaCatalogRepository } from "./catalog/catalog-repository.js"
import { CatalogService } from "./catalog/catalog-service.js"
import { ProviderRefreshScheduler } from "./catalog/refresh-scheduler.js"
import {
  buildCalendarFeed,
  calendarFeedUrl,
  createCalendarToken,
  verifyCalendarToken,
  type CalendarFeedItem,
} from "./calendar-feed.js"
import {
  MediaIdentityConflictError,
  MediaIdentityTypeConflictError,
} from "./catalog/media-identity.js"
import { findDuplicateLibraryGroups, markTrackedSearchResults } from "./library-matching.js"
import { bulkEpisodeLimit, bulkProgressSchema, progressSchema } from "./episode-progress.js"
import { parseConfig } from "./config.js"
import { ProviderHttpError, ProviderResponseError } from "./providers/http-client.js"
import { TmdbClient } from "./providers/tmdb-client.js"
import { TvmazeClient } from "./providers/tvmaze-client.js"
import {
  compareReleaseOrder,
  decodeReleaseCursor,
  encodeReleaseCursor,
  unwatchedReleasePageSize,
} from "./release-pagination.js"
import { isInReleaseWindow } from "./release-window.js"
import { shouldGrantAdministrator } from "./registration-policy.js"
import { createHelmetOptions } from "./security-headers.js"
import { encryptSmtpPassword, publicSmtpSettings, sendSmtpMail, verifySmtp } from "./smtp.js"
import {
  createLoginChallenge,
  createTotpEnrollment,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  hashLoginChallenge,
  hashRecoveryCode,
  validateTotpToken,
} from "./totp.js"

const prisma = new PrismaClient()
export const app = express()
const config = parseConfig(process.env)
const catalogService = config.tmdbAccessToken
  ? new CatalogService({
      repository: new PrismaCatalogRepository(prisma),
      tmdb: new TmdbClient({
        accessToken: config.tmdbAccessToken,
        baseUrl: config.tmdbApiBaseUrl,
        timeoutMs: config.providerTimeoutMs,
        maxRetries: config.providerMaxRetries,
      }),
      tvmaze: new TvmazeClient({
        baseUrl: config.tvmazeApiBaseUrl,
        timeoutMs: config.providerTimeoutMs,
        maxRetries: config.providerMaxRetries,
      }),
      tmdbImageBaseUrl: config.tmdbImageBaseUrl,
      searchCacheTtlMs: config.providerSearchCacheTtlMs,
    })
  : null
const refreshScheduler = catalogService
  ? new ProviderRefreshScheduler({
      service: catalogService,
      intervalMs: config.providerRefreshIntervalMs,
      batchSize: config.providerRefreshBatchSize,
      onResult: ({ attempted, succeeded, failed }) => {
        if (attempted > 0) console.log(`Provider refresh: ${succeeded} succeeded, ${failed} failed`)
      },
      onError: (error) => console.error("Provider refresh failed", error),
    })
  : null

app.use(helmet(createHelmetOptions(config.sessionCookieSecure, config.tmdbImageBaseUrl)))
app.use(
  cors({
    origin: config.webOrigin,
    credentials: true,
  })
)
app.use(express.json({ limit: "32kb" }))
app.use(cookieParser())

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
})
const libraryStatusRank = {
  PLANNED: 0,
  IN_PROGRESS: 1,
  WATCHED: 2,
} satisfies Record<LibraryStatus, number>
const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(60),
  inviteToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
})
const registrationModeSchema = z.object({ mode: z.enum(["OPEN", "INVITE_ONLY", "CLOSED"]) })
const invitationSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  sendEmail: z.boolean().default(false),
})
const smtpSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(253).default(""),
  port: z.number().int().min(1).max(65_535).default(587),
  secure: z.boolean().default(false),
  username: z.string().trim().max(255).default(""),
  password: z.string().max(1_024).default(""),
  fromName: z.string().trim().max(100).default("Telly Tracker"),
  fromEmail: z.union([z.email(), z.literal("")]).default(""),
}).refine((value) => !value.enabled || Boolean(value.host && value.port && value.fromEmail), {
  message: "Enabled SMTP requires a host, port, and sender email",
})
const setupSchema = z.object({
  mode: z.enum(["OPEN", "INVITE_ONLY", "CLOSED"]),
  smtp: smtpSettingsSchema.optional(),
})
const factorCodeSchema = z.string().trim().min(6).max(20)
const loginChallengeSchema = z.object({
  challengeToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: factorCodeSchema,
})
const totpCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) })
const protectedFactorSchema = z.object({
  password: z.string().min(8).max(72),
  code: factorCodeSchema,
})
const librarySchema = z.object({
  favorite: z.boolean().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "WATCHED"]).optional(),
})
const providerSearchSchema = z.object({ q: z.string().trim().min(2).max(100) })
const unwatchedReleaseQuerySchema = z.object({
  cursor: z.string().max(2_048).optional(),
  q: z.string().trim().max(100).optional().default(""),
})
const providerImportSchema = z.object({
  type: z.enum(["MOVIE", "SHOW"]),
  tmdbId: z.number().int().positive(),
})
const calendarTokenSchema = z.string().min(32).max(2_048).regex(/^[A-Za-z0-9._-]+$/)

function setSession(response: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" })
  response.cookie("telly_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.sessionCookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  })
}

function calendarStatus(user: { id: string; calendarFeedEnabled: boolean; calendarFeedVersion: number }) {
  if (!user.calendarFeedEnabled || user.calendarFeedVersion < 1) {
    return { enabled: false, url: null }
  }
  const token = createCalendarToken(user.id, user.calendarFeedVersion, config.jwtSecret)
  return { enabled: true, url: calendarFeedUrl(config.calendarPublicUrl, token) }
}

function authenticate(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies.telly_session as string | undefined
  if (!token) {
    response.status(401).json({ error: "Authentication required" })
    return
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Invalid session payload")
    }
    response.locals.userId = payload.sub
    next()
  } catch {
    response.clearCookie("telly_session", { path: "/" })
    response.status(401).json({ error: "Session expired" })
  }
}

async function requireAdmin(_request: Request, response: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: response.locals.userId as string },
    select: { isAdmin: true },
  })
  if (!user?.isAdmin) {
    response.status(403).json({ error: "Administrator access required" })
    return
  }
  next()
}

async function getRegistrationMode() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "global" }, select: { registrationMode: true } })
  return settings?.registrationMode ?? "OPEN"
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

type FactorUser = {
  id: string
  totpSecretEncrypted: string | null
  totpLastUsedStep: number | null
}

async function consumeUserFactor(transaction: Prisma.TransactionClient, user: FactorUser, code: string) {
  if (!user.totpSecretEncrypted) return false
  if (/^\d{6}$/.test(code)) {
    const secret = decryptTotpSecret(user.totpSecretEncrypted, config.settingsEncryptionKey)
    const step = validateTotpToken(secret, code)
    if (step === null || (user.totpLastUsedStep !== null && step <= user.totpLastUsedStep)) return false
    const consumed = await transaction.user.updateMany({
      where: {
        id: user.id,
        totpSecretEncrypted: { not: null },
        OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
      },
      data: { totpLastUsedStep: step },
    })
    return consumed.count === 1
  }
  const codeHash = hashRecoveryCode(user.id, code, config.settingsEncryptionKey)
  const consumed = await transaction.totpRecoveryCode.updateMany({
    where: { userId: user.id, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  })
  return consumed.count === 1
}

class RegistrationPolicyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function getAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  })
}

function smtpSettingsData(settings: z.infer<typeof smtpSettingsSchema>) {
  return {
    smtpEnabled: settings.enabled,
    smtpHost: settings.host || null,
    smtpPort: settings.port,
    smtpSecure: settings.secure,
    smtpUsername: settings.username || null,
    smtpFromName: settings.fromName || null,
    smtpFromEmail: settings.fromEmail || null,
    ...(settings.password ? { smtpPasswordEncrypted: encryptSmtpPassword(settings.password, config.settingsEncryptionKey) } : {}),
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" })
})

app.get("/api/registration", async (_request, response) => {
  response.json({ mode: await getRegistrationMode() })
})

app.get("/api/setup/status", async (_request, response) => {
  const [firstUser, settings] = await Promise.all([
    prisma.user.findFirst({ select: { id: true } }),
    getAppSettings(),
  ])
  response.json({
    requiresOwner: !firstUser,
    setupComplete: Boolean(firstUser) && settings.setupComplete,
    smtp: {
      source: config.smtpEnvironment ? "environment" : "database",
      enabled: config.smtpEnvironment?.enabled ?? settings.smtpEnabled,
    },
  })
})

app.post("/api/auth/register", async (request, response) => {
  const parsed = registerSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a name, valid email, and password of at least 8 characters" })
    return
  }
  const bootstrapAdmin = config.adminEmails.includes(parsed.data.email)
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  try {
    const user = await prisma.$transaction(async (transaction) => {
      await transaction.appSettings.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } })
      await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AppSettings" WHERE "id" = 'global' FOR UPDATE`
      const [settings, existingUser, firstUser] = await Promise.all([
        transaction.appSettings.findUniqueOrThrow({ where: { id: "global" } }),
        transaction.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } }),
        transaction.user.findFirst({ select: { id: true } }),
      ])
      if (existingUser) throw new RegistrationPolicyError("An account already uses that email", 409)
      const firstAccount = !firstUser
      let invitation: { id: string } | null = null
      if (!firstAccount) {
        if (settings.registrationMode === "CLOSED") throw new RegistrationPolicyError("New account registration is closed", 403)
        if (parsed.data.inviteToken) {
          const candidate = await transaction.invitation.findUnique({
            where: { tokenHash: hashInvitationToken(parsed.data.inviteToken) },
            select: { id: true, email: true, expiresAt: true, usedAt: true },
          })
          if (!candidate || candidate.email !== parsed.data.email || candidate.usedAt || candidate.expiresAt <= new Date()) {
            throw new RegistrationPolicyError("Invitation is invalid, expired, or belongs to another email", 403)
          }
          invitation = candidate
        } else if (settings.registrationMode === "INVITE_ONLY" && !bootstrapAdmin) {
          throw new RegistrationPolicyError("A valid invitation is required", 403)
        }
      }
      const created = await transaction.user.create({
        data: { name: parsed.data.name, email: parsed.data.email, passwordHash, isAdmin: shouldGrantAdministrator(firstAccount, bootstrapAdmin) },
        select: { id: true, name: true, email: true, isAdmin: true },
      })
      if (invitation) await transaction.invitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } })
      return created
    })
    setSession(response, user.id)
    response.status(201).json({ user })
  } catch (error) {
    if (error instanceof RegistrationPolicyError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    throw error
  }
})

app.post("/api/auth/login", async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email and password" })
    return
  }
  let user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    response.status(401).json({ error: "Email or password is incorrect" })
    return
  }
  if (!user.isAdmin && config.adminEmails.includes(user.email)) {
    user = await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } })
  }
  if (user.totpSecretEncrypted && user.totpEnabledAt) {
    const challenge = createLoginChallenge()
    await prisma.$transaction([
      prisma.loginChallenge.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lte: new Date() } }] } }),
      prisma.loginChallenge.create({
        data: { userId: user.id, tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt },
      }),
    ])
    response.json({ requiresTwoFactor: true, challengeToken: challenge.token, expiresAt: challenge.expiresAt })
    return
  }
  setSession(response, user.id)
  response.json({ requiresTwoFactor: false, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } })
})

app.post("/api/auth/login/totp", async (request, response) => {
  const parsed = loginChallengeSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid authenticator or recovery code" })
    return
  }
  const tokenHash = hashLoginChallenge(parsed.data.challengeToken)
  const result = await prisma.$transaction(async (transaction) => {
    const challenge = await transaction.loginChallenge.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, name: true, email: true, isAdmin: true, totpSecretEncrypted: true, totpLastUsedStep: true } } },
    })
    if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      if (challenge) await transaction.loginChallenge.delete({ where: { id: challenge.id } })
      return { authenticated: false as const }
    }
    const accepted = await consumeUserFactor(transaction, challenge.user, parsed.data.code)
    if (!accepted) {
      if (challenge.attempts + 1 >= 5) await transaction.loginChallenge.delete({ where: { id: challenge.id } })
      else await transaction.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } })
      return { authenticated: false as const }
    }
    await transaction.loginChallenge.delete({ where: { id: challenge.id } })
    return { authenticated: true as const, user: challenge.user }
  })
  if (!result.authenticated) {
    response.status(401).json({ error: "That code is invalid, expired, or has already been used" })
    return
  }
  setSession(response, result.user.id)
  response.json({ user: { id: result.user.id, name: result.user.name, email: result.user.email, isAdmin: result.user.isAdmin } })
})

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie("telly_session", { path: "/" })
  response.status(204).end()
})

app.get("/api/auth/me", authenticate, async (_request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: response.locals.userId as string },
    select: { id: true, name: true, email: true, isAdmin: true },
  })
  response.json({ user })
})

app.get("/api/calendar/:token.ics", async (request, response) => {
  const parsed = calendarTokenSchema.safeParse(request.params.token)
  const token = parsed.success ? verifyCalendarToken(parsed.data, config.jwtSecret) : null
  if (!token) {
    response.status(404).json({ error: "Calendar feed not found" })
    return
  }

  const startDate = new Date()
  startDate.setUTCHours(0, 0, 0, 0)
  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: {
      id: true,
      name: true,
      calendarFeedEnabled: true,
      calendarFeedVersion: true,
      library: {
        select: {
          media: {
            select: {
              id: true,
              title: true,
              type: true,
              releaseDate: true,
              episodes: {
                where: { airDate: { gte: startDate } },
                orderBy: [{ airDate: "asc" }, { season: "asc" }, { number: "asc" }],
                select: { id: true, season: true, number: true, title: true, airDate: true },
              },
            },
          },
        },
      },
    },
  })
  if (!user?.calendarFeedEnabled || user.calendarFeedVersion !== token.version) {
    response.status(404).json({ error: "Calendar feed not found" })
    return
  }

  const items: CalendarFeedItem[] = []
  for (const entry of user.library) {
    const media = entry.media
    const titleUrl = new URL(`/#library/${media.id}`, config.calendarPublicUrl).toString()
    if (media.type === "MOVIE" && media.releaseDate >= startDate) {
      items.push({
        uid: `movie-${media.id}@telly-tracker`,
        startDate: media.releaseDate,
        summary: `${media.title} — movie release`,
        description: `Tracked movie release for ${media.title}.`,
        url: titleUrl,
      })
    }
    if (media.type === "SHOW") {
      for (const episode of media.episodes) {
        const episodeCode = `S${episode.season.toString().padStart(2, "0")}E${episode.number.toString().padStart(2, "0")}`
        items.push({
          uid: `episode-${episode.id}@telly-tracker`,
          startDate: episode.airDate,
          summary: `${media.title} — ${episodeCode}: ${episode.title}`,
          description: `${media.title}, season ${episode.season}, episode ${episode.number}.`,
          url: titleUrl,
        })
      }
    }
  }
  items.sort((left, right) => left.startDate.getTime() - right.startDate.getTime() || left.summary.localeCompare(right.summary))

  const feed = buildCalendarFeed(`${user.name}'s Telly Tracker`, items)
  response.set({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="telly-tracker.ics"',
    "Cache-Control": "private, no-store",
  })
  response.send(feed)
})

app.get("/api/account/security", authenticate, async (_request, response) => {
  const userId = response.locals.userId as string
  const [user, recoveryCodesRemaining] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, totpEnabledAt: true, calendarFeedEnabled: true, calendarFeedVersion: true },
    }),
    prisma.totpRecoveryCode.count({ where: { userId, usedAt: null } }),
  ])
  response.json({
    totpEnabled: Boolean(user.totpEnabledAt),
    totpEnabledAt: user.totpEnabledAt,
    recoveryCodesRemaining,
    calendarFeed: calendarStatus(user),
  })
})

app.post("/api/account/calendar", authenticate, async (_request, response) => {
  const user = await prisma.user.update({
    where: { id: response.locals.userId as string },
    data: { calendarFeedEnabled: true, calendarFeedVersion: { increment: 1 } },
    select: { id: true, calendarFeedEnabled: true, calendarFeedVersion: true },
  })
  response.json({ calendarFeed: calendarStatus(user) })
})

app.delete("/api/account/calendar", authenticate, async (_request, response) => {
  await prisma.user.update({
    where: { id: response.locals.userId as string },
    data: { calendarFeedEnabled: false, calendarFeedVersion: { increment: 1 } },
  })
  response.status(204).end()
})

app.post("/api/account/totp/enrollment", authenticate, async (_request, response) => {
  const userId = response.locals.userId as string
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, totpEnabledAt: true },
  })
  if (user.totpEnabledAt) {
    response.status(409).json({ error: "Two-factor authentication is already enabled" })
    return
  }
  const enrollment = await createTotpEnrollment(user.email)
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpPendingSecretEncrypted: encryptTotpSecret(enrollment.secret, config.settingsEncryptionKey),
      totpPendingCreatedAt: new Date(),
    },
  })
  response.json({ secret: enrollment.secret, uri: enrollment.uri, qrCodeDataUrl: enrollment.qrCodeDataUrl })
})

app.post("/api/account/totp/confirm", authenticate, async (request, response) => {
  const parsed = totpCodeSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter the 6-digit code from your authenticator" })
    return
  }
  const userId = response.locals.userId as string
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpPendingSecretEncrypted: true, totpPendingCreatedAt: true, totpEnabledAt: true },
  })
  if (user.totpEnabledAt) {
    response.status(409).json({ error: "Two-factor authentication is already enabled" })
    return
  }
  if (!user.totpPendingSecretEncrypted || !user.totpPendingCreatedAt || user.totpPendingCreatedAt.getTime() < Date.now() - 10 * 60 * 1_000) {
    await prisma.user.update({ where: { id: userId }, data: { totpPendingSecretEncrypted: null, totpPendingCreatedAt: null } })
    response.status(410).json({ error: "That setup expired. Start again to get a new QR code" })
    return
  }
  const secret = decryptTotpSecret(user.totpPendingSecretEncrypted, config.settingsEncryptionKey)
  const step = validateTotpToken(secret, parsed.data.code)
  if (step === null) {
    response.status(400).json({ error: "That authenticator code is not valid" })
    return
  }
  const recoveryCodes = generateRecoveryCodes()
  const enabled = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, totpPendingSecretEncrypted: user.totpPendingSecretEncrypted, totpEnabledAt: null },
      data: {
        totpSecretEncrypted: user.totpPendingSecretEncrypted,
        totpPendingSecretEncrypted: null,
        totpPendingCreatedAt: null,
        totpEnabledAt: new Date(),
        totpLastUsedStep: step,
      },
    })
    if (updated.count !== 1) return false
    await transaction.totpRecoveryCode.deleteMany({ where: { userId } })
    await transaction.totpRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code, config.settingsEncryptionKey) })),
    })
    return true
  })
  if (!enabled) {
    response.status(409).json({ error: "Two-factor setup changed. Start again" })
    return
  }
  response.json({ recoveryCodes })
})

app.post("/api/account/totp/recovery-codes", authenticate, async (request, response) => {
  const parsed = protectedFactorSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter your password and current authenticator or recovery code" })
    return
  }
  const userId = response.locals.userId as string
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    response.status(401).json({ error: "Password is incorrect" })
    return
  }
  const recoveryCodes = generateRecoveryCodes()
  const accepted = await prisma.$transaction(async (transaction) => {
    const verified = await consumeUserFactor(transaction, user, parsed.data.code)
    if (!verified) return false
    await transaction.totpRecoveryCode.deleteMany({ where: { userId } })
    await transaction.totpRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code, config.settingsEncryptionKey) })),
    })
    return true
  })
  if (!accepted) {
    response.status(401).json({ error: "That authenticator or recovery code is invalid or already used" })
    return
  }
  response.json({ recoveryCodes })
})

app.delete("/api/account/totp", authenticate, async (request, response) => {
  const parsed = protectedFactorSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter your password and current authenticator or recovery code" })
    return
  }
  const userId = response.locals.userId as string
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    response.status(401).json({ error: "Password is incorrect" })
    return
  }
  const disabled = await prisma.$transaction(async (transaction) => {
    const verified = await consumeUserFactor(transaction, user, parsed.data.code)
    if (!verified) return false
    await transaction.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: null,
        totpPendingSecretEncrypted: null,
        totpPendingCreatedAt: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
      },
    })
    await transaction.totpRecoveryCode.deleteMany({ where: { userId } })
    await transaction.loginChallenge.deleteMany({ where: { userId } })
    return true
  })
  if (!disabled) {
    response.status(401).json({ error: "That authenticator or recovery code is invalid or already used" })
    return
  }
  response.status(204).end()
})

app.get("/api/admin/overview", authenticate, requireAdmin, async (_request, response) => {
  const [settings, users, invitations] = await Promise.all([
    getAppSettings(),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, isAdmin: true, createdAt: true, totpEnabledAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.invitation.findMany({
      select: { id: true, email: true, expiresAt: true, usedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])
  response.json({
    currentUserId: response.locals.userId as string,
    registrationMode: settings.registrationMode,
    setupComplete: settings.setupComplete,
    smtp: publicSmtpSettings(settings, config.smtpEnvironment),
    users,
    invitations,
  })
})

app.patch("/api/admin/settings", authenticate, requireAdmin, async (request, response) => {
  const parsed = registrationModeSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Choose a valid registration mode" })
    return
  }
  const settings = await prisma.appSettings.upsert({
    where: { id: "global" },
    update: { registrationMode: parsed.data.mode },
    create: { id: "global", registrationMode: parsed.data.mode },
  })
  response.json({ registrationMode: settings.registrationMode })
})

app.post("/api/admin/setup", authenticate, requireAdmin, async (request, response) => {
  const parsed = setupSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Choose registration access and provide valid SMTP settings" })
    return
  }
  if (!config.smtpEnvironment && !parsed.data.smtp) {
    response.status(400).json({ error: "Provide valid SMTP settings" })
    return
  }
  const smtpData = !config.smtpEnvironment && parsed.data.smtp ? smtpSettingsData(parsed.data.smtp) : {}
  const settings = await prisma.appSettings.upsert({
    where: { id: "global" },
    update: { registrationMode: parsed.data.mode, setupComplete: true, ...smtpData },
    create: { id: "global", registrationMode: parsed.data.mode, setupComplete: true, ...smtpData },
  })
  response.json({ setupComplete: settings.setupComplete, registrationMode: settings.registrationMode, smtp: publicSmtpSettings(settings, config.smtpEnvironment) })
})

app.put("/api/admin/smtp", authenticate, requireAdmin, async (request, response) => {
  if (config.smtpEnvironment) {
    response.status(409).json({ error: "SMTP is managed by environment variables for this deployment" })
    return
  }
  const parsed = smtpSettingsSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Provide valid SMTP settings" })
    return
  }
  const data = smtpSettingsData(parsed.data)
  const settings = await prisma.appSettings.upsert({
    where: { id: "global" },
    update: data,
    create: { id: "global", ...data },
  })
  response.json({ smtp: publicSmtpSettings(settings) })
})

app.post("/api/admin/smtp/test", authenticate, requireAdmin, async (_request, response) => {
  const [settings, user] = await Promise.all([
    getAppSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: response.locals.userId as string }, select: { email: true } }),
  ])
  try {
    await verifySmtp(settings, config.settingsEncryptionKey, config.smtpEnvironment)
    await sendSmtpMail(settings, config.settingsEncryptionKey, {
      to: user.email,
      subject: "Telly Tracker SMTP test",
      text: "SMTP is configured correctly. Telly Tracker can now deliver invitation emails.",
      html: "<p>SMTP is configured correctly. Telly Tracker can now deliver invitation emails.</p>",
    }, config.smtpEnvironment)
    response.json({ sent: true, recipient: user.email })
  } catch {
    response.status(502).json({ error: "SMTP connection or test delivery failed" })
  }
})

app.post("/api/admin/invitations", authenticate, requireAdmin, async (request, response) => {
  const parsed = invitationSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email and an expiration between 1 and 30 days" })
    return
  }
  const smtpSettings = parsed.data.sendEmail ? await getAppSettings() : null
  if (smtpSettings && !publicSmtpSettings(smtpSettings, config.smtpEnvironment).enabled) {
    response.status(400).json({ error: "Enable SMTP before sending invitations by email" })
    return
  }
  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })
  if (existingUser) {
    response.status(409).json({ error: "That email already has an account" })
    return
  }
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
  const invitation = await prisma.$transaction(async (transaction) => {
    await transaction.invitation.deleteMany({ where: { email: parsed.data.email, usedAt: null } })
    return transaction.invitation.create({
      data: {
        email: parsed.data.email,
        tokenHash: hashInvitationToken(token),
        createdById: response.locals.userId as string,
        expiresAt,
      },
      select: { id: true, email: true, expiresAt: true, usedAt: true, createdAt: true },
    })
  })
  let emailDelivery: "NOT_REQUESTED" | "SENT" | "FAILED" = "NOT_REQUESTED"
  if (smtpSettings) {
    const inviteUrl = new URL(config.webOrigin)
    inviteUrl.searchParams.set("invite", token)
    try {
      await sendSmtpMail(smtpSettings, config.settingsEncryptionKey, {
        to: parsed.data.email,
        subject: "You are invited to Telly Tracker",
        text: `You have been invited to Telly Tracker. Create your account: ${inviteUrl.toString()}`,
        html: `<p>You have been invited to Telly Tracker.</p><p><a href="${inviteUrl.toString()}">Create your account</a></p><p>This invitation is single-use and expires ${expiresAt.toUTCString()}.</p>`,
      }, config.smtpEnvironment)
      emailDelivery = "SENT"
    } catch {
      emailDelivery = "FAILED"
    }
  }
  response.status(201).json({ invitation, token, emailDelivery })
})

app.delete("/api/admin/invitations/:invitationId", authenticate, requireAdmin, async (request, response) => {
  const invitationId = request.params.invitationId
  if (typeof invitationId !== "string") {
    response.status(400).json({ error: "Invalid invitation identifier" })
    return
  }
  const deleted = await prisma.invitation.deleteMany({ where: { id: invitationId, usedAt: null } })
  if (deleted.count === 0) {
    response.status(404).json({ error: "Active invitation not found" })
    return
  }
  response.status(204).end()
})

app.delete("/api/admin/users/:userId/totp", authenticate, requireAdmin, async (request, response) => {
  const userId = request.params.userId
  const administratorId = response.locals.userId as string
  if (typeof userId !== "string" || userId === administratorId) {
    response.status(400).json({ error: "Use your Account security page to change your own two-factor settings" })
    return
  }
  const reset = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, totpEnabledAt: { not: null } },
      data: {
        totpSecretEncrypted: null,
        totpPendingSecretEncrypted: null,
        totpPendingCreatedAt: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
      },
    })
    if (updated.count !== 1) return false
    await transaction.totpRecoveryCode.deleteMany({ where: { userId } })
    await transaction.loginChallenge.deleteMany({ where: { userId } })
    return true
  })
  if (!reset) {
    response.status(404).json({ error: "That user does not have two-factor authentication enabled" })
    return
  }
  response.status(204).end()
})

app.get("/api/dashboard", authenticate, async (_request, response) => {
  const userId = response.locals.userId as string
  const [user, entries, watchedEpisodes, catalog] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, isAdmin: true } }),
    prisma.libraryEntry.findMany({
      where: { userId },
      include: { media: { include: { episodes: { orderBy: [{ season: "asc" }, { number: "asc" }] } } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.episodeProgress.findMany({ where: { userId, watched: true }, select: { episodeId: true } }),
    prisma.media.findMany({ orderBy: { releaseDate: "desc" }, take: 12 }),
  ])

  const now = new Date()
  const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const watchedIds = new Set(watchedEpisodes.map(({ episodeId }) => episodeId))
  const library = entries.map((entry) => {
    const episodes = entry.media.episodes
    const watchedCount = episodes.filter((episode) => watchedIds.has(episode.id)).length

    return {
      id: entry.media.id,
      title: entry.media.title,
      type: entry.media.type,
      synopsis: entry.media.synopsis,
      releaseDate: entry.media.releaseDate,
      endDate: entry.media.endDate,
      productionStatus: entry.media.productionStatus,
      poster: entry.media.poster,
      backdrop: entry.media.backdrop,
      imdbId: entry.media.imdbId,
      favorite: entry.favorite,
      status: entry.status,
      watchedCount,
      totalEpisodes: episodes.length,
      episodes: episodes.map((episode) => ({ ...episode, watched: watchedIds.has(episode.id) })),
    }
  })

  const episodeReleases = entries.flatMap((entry) => entry.media.episodes.map((episode) => ({ entry, episode })))
  const upcoming = [
    ...episodeReleases.filter(({ episode }) => isInReleaseWindow(episode.airDate, now)).map(({ entry, episode }) => ({
      id: episode.id,
      mediaId: entry.mediaId,
      title: entry.media.title,
      date: episode.airDate,
      detail: `S${episode.season} E${episode.number} · ${episode.title}`,
      backdrop: episode.image || entry.media.backdrop,
      favorite: entry.favorite,
      kind: "EPISODE" as const,
      watched: watchedIds.has(episode.id),
    })),
    ...entries.filter((entry) => entry.media.type === "MOVIE" && isInReleaseWindow(entry.media.releaseDate, now)).map((entry) => ({
      id: entry.mediaId,
      mediaId: entry.mediaId,
      title: entry.media.title,
      date: entry.media.releaseDate,
      detail: "Movie release",
      backdrop: entry.media.backdrop,
      favorite: entry.favorite,
      kind: "MOVIE" as const,
      watched: entry.status === "WATCHED",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  const newReleases = [
    ...episodeReleases
      .filter(({ episode }) => episode.airDate >= recentCutoff && episode.airDate <= now)
      .map(({ entry, episode }) => ({
        id: episode.id,
        mediaId: entry.mediaId,
        kind: "EPISODE" as const,
        title: entry.media.title,
        date: episode.airDate,
        detail: `S${episode.season} E${episode.number} · ${episode.title}`,
        backdrop: episode.image || entry.media.backdrop,
        favorite: entry.favorite,
        watched: watchedIds.has(episode.id),
      })),
    ...entries
      .filter((entry) => entry.media.type === "MOVIE" && entry.media.releaseDate >= recentCutoff && entry.media.releaseDate <= now)
      .map((entry) => ({
        id: entry.mediaId,
        mediaId: entry.mediaId,
        kind: "MOVIE" as const,
        title: entry.media.title,
        date: entry.media.releaseDate,
        detail: "Movie release",
        backdrop: entry.media.backdrop,
        favorite: entry.favorite,
        watched: entry.status === "WATCHED",
      })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 24)

  const duplicateLibraryGroups = findDuplicateLibraryGroups(entries.map((entry) => ({
    id: entry.id,
    mediaId: entry.mediaId,
    title: entry.media.title,
    type: entry.media.type,
    releaseDate: entry.media.releaseDate,
    tmdbId: entry.media.tmdbId,
    tvmazeId: entry.media.tvmazeId,
    imdbId: entry.media.imdbId,
    thetvdbId: entry.media.thetvdbId,
    episodeCount: entry.media.episodes.length,
    addedAt: entry.addedAt,
  })))
  const summary = {
    trackedShows: entries.filter((entry) => entry.media.type === "SHOW").length,
    trackedMovies: entries.filter((entry) => entry.media.type === "MOVIE").length,
    watchedEpisodes: episodeReleases.filter(({ episode }) => watchedIds.has(episode.id)).length,
    watchedMovies: entries.filter((entry) => entry.media.type === "MOVIE" && entry.status === "WATCHED").length,
    favorites: entries.filter((entry) => entry.favorite).length,
    duplicateGroups: duplicateLibraryGroups.length,
    duplicateEntries: duplicateLibraryGroups.reduce((count, group) => count + group.duplicates.length, 0),
  }

  const libraryMediaIds = new Set(entries.map((entry) => entry.mediaId))
  const discover = catalog.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    synopsis: item.synopsis,
    releaseDate: item.releaseDate,
    poster: item.poster,
    backdrop: item.backdrop,
    imdbId: item.imdbId,
    inLibrary: libraryMediaIds.has(item.id),
    providerBacked: item.tmdbId !== null,
    metadataSyncedAt: item.metadataSyncedAt,
    syncError: item.syncError,
  }))

  response.json({ user, library, newReleases, upcoming, summary, discover })
})

app.get("/api/releases/unwatched", authenticate, async (request, response) => {
  const parsed = unwatchedReleaseQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid unwatched release page request" })
    return
  }

  const cursor = parsed.data.cursor ? decodeReleaseCursor(parsed.data.cursor) : null
  if (parsed.data.cursor && !cursor) {
    response.status(400).json({ error: "Invalid unwatched release cursor" })
    return
  }

  const userId = response.locals.userId as string
  const titleFilter: Prisma.MediaWhereInput = parsed.data.q
    ? { title: { contains: parsed.data.q, mode: "insensitive" } }
    : {}
  const episodeBaseWhere: Prisma.EpisodeWhereInput = {
    media: { ...titleFilter, library: { some: { userId } } },
    progress: { none: { userId, watched: true } },
  }
  const episodeCursorWhere: Prisma.EpisodeWhereInput = !cursor
    ? {}
    : cursor.kind === "EPISODE"
      ? { OR: [{ airDate: { gt: cursor.date } }, { airDate: cursor.date, id: { gt: cursor.id } }] }
      : { airDate: { gt: cursor.date } }
  const movieBaseWhere: Prisma.LibraryEntryWhereInput = {
    userId,
    status: { not: "WATCHED" },
    media: { ...titleFilter, type: "MOVIE" },
  }
  const movieCursorWhere: Prisma.LibraryEntryWhereInput = !cursor
    ? {}
    : cursor.kind === "EPISODE"
      ? { media: { releaseDate: { gte: cursor.date } } }
      : {
          OR: [
            { media: { releaseDate: { gt: cursor.date } } },
            { media: { releaseDate: cursor.date }, mediaId: { gt: cursor.id } },
          ],
        }

  const [episodes, movies, episodeTotal, movieTotal] = await Promise.all([
    prisma.episode.findMany({
      where: { AND: [episodeBaseWhere, episodeCursorWhere] },
      orderBy: [{ airDate: "asc" }, { id: "asc" }],
      take: unwatchedReleasePageSize + 1,
      select: {
        id: true,
        mediaId: true,
        title: true,
        airDate: true,
        image: true,
        season: true,
        number: true,
        media: {
          select: {
            title: true,
            backdrop: true,
            library: { where: { userId }, take: 1, select: { favorite: true } },
          },
        },
      },
    }),
    prisma.libraryEntry.findMany({
      where: { AND: [movieBaseWhere, movieCursorWhere] },
      orderBy: [{ media: { releaseDate: "asc" } }, { mediaId: "asc" }],
      take: unwatchedReleasePageSize + 1,
      select: {
        mediaId: true,
        favorite: true,
        media: { select: { title: true, releaseDate: true, backdrop: true } },
      },
    }),
    prisma.episode.count({ where: episodeBaseWhere }),
    prisma.libraryEntry.count({ where: movieBaseWhere }),
  ])

  const merged = [
    ...episodes.map((episode) => ({
      id: episode.id,
      mediaId: episode.mediaId,
      title: episode.media.title,
      date: episode.airDate,
      detail: `S${episode.season} E${episode.number} · ${episode.title}`,
      backdrop: episode.image || episode.media.backdrop,
      favorite: episode.media.library[0]?.favorite ?? false,
      kind: "EPISODE" as const,
      watched: false,
    })),
    ...movies.map((entry) => ({
      id: entry.mediaId,
      mediaId: entry.mediaId,
      title: entry.media.title,
      date: entry.media.releaseDate,
      detail: "Movie release",
      backdrop: entry.media.backdrop,
      favorite: entry.favorite,
      kind: "MOVIE" as const,
      watched: false,
    })),
  ].sort(compareReleaseOrder)
  const items = merged.slice(0, unwatchedReleasePageSize)
  const lastItem = items.at(-1)

  response.json({
    items,
    total: episodeTotal + movieTotal,
    nextCursor: merged.length > unwatchedReleasePageSize && lastItem
      ? encodeReleaseCursor({ date: lastItem.date, kind: lastItem.kind, id: lastItem.id })
      : null,
  })
})

app.get("/api/media", authenticate, async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : ""
  const media = await prisma.media.findMany({
    where: query ? { title: { contains: query, mode: "insensitive" } } : undefined,
    orderBy: { releaseDate: "desc" },
    take: 20,
  })
  response.json({ media })
})

app.get("/api/providers/search", authenticate, async (request, response) => {
  if (!catalogService) {
    response.status(503).json({ error: "TMDB is not configured" })
    return
  }
  const parsed = providerSearchSchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: "Search query must contain between 2 and 100 characters" })
    return
  }

  const results = await catalogService.search(parsed.data.q)
  const userId = response.locals.userId as string
  const tracked = await prisma.libraryEntry.findMany({
    where: { userId },
    select: {
      media: {
        select: { tmdbId: true, type: true, title: true, releaseDate: true },
      },
    },
  })
  response.json({
    results: markTrackedSearchResults(results, tracked.map(({ media }) => media)),
    source: "TMDB",
  })
})

app.post("/api/providers/import", authenticate, async (request, response) => {
  if (!catalogService) {
    response.status(503).json({ error: "TMDB is not configured" })
    return
  }
  const parsed = providerImportSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a valid TMDB media type and identifier" })
    return
  }

  const result = await catalogService.importTmdb(parsed.data.type, parsed.data.tmdbId)
  const userId = response.locals.userId as string
  await prisma.libraryEntry.upsert({
    where: { userId_mediaId: { userId, mediaId: result.id } },
    update: {},
    create: { userId, mediaId: result.id, status: "PLANNED" },
  })
  response
    .status(result.created ? 201 : 200)
    .json({ ...result, inLibrary: true, sources: ["TMDB", "TVmaze"] })
})

app.post("/api/media/:mediaId/refresh", authenticate, async (request, response) => {
  if (!catalogService) {
    response.status(503).json({ error: "TMDB is not configured" })
    return
  }
  const mediaId = request.params.mediaId
  if (typeof mediaId !== "string") {
    response.status(400).json({ error: "Invalid media identifier" })
    return
  }

  const result = await catalogService.refresh(mediaId)
  response.json({ ...result, sources: ["TMDB", "TVmaze"] })
})

app.patch("/api/library/:mediaId", authenticate, async (request, response) => {
  const parsed = librarySchema.safeParse(request.body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Provide a favorite or status change" })
    return
  }
  const userId = response.locals.userId as string
  const mediaId = request.params.mediaId
  if (typeof mediaId !== "string") {
    response.status(400).json({ error: "Invalid media identifier" })
    return
  }
  const entry = await prisma.libraryEntry.upsert({
    where: { userId_mediaId: { userId, mediaId } },
    update: parsed.data,
    create: {
      userId,
      mediaId,
      favorite: parsed.data.favorite ?? false,
      status: parsed.data.status ?? "PLANNED",
    },
  })
  response.json({ entry })
})

app.delete("/api/library/duplicates", authenticate, async (_request, response) => {
  const userId = response.locals.userId as string
  const result = await prisma.$transaction(async (transaction) => {
    const entries = await transaction.libraryEntry.findMany({
      where: { userId },
      select: {
        id: true,
        mediaId: true,
        status: true,
        favorite: true,
        addedAt: true,
        media: {
          select: {
            title: true,
            type: true,
            releaseDate: true,
            tmdbId: true,
            tvmazeId: true,
            imdbId: true,
            thetvdbId: true,
            episodes: {
              select: {
                id: true,
                season: true,
                number: true,
                progress: {
                  where: { userId, watched: true },
                  select: { watchedAt: true },
                },
              },
            },
          },
        },
      },
    })
    const groups = findDuplicateLibraryGroups(entries.map((entry) => ({
      id: entry.id,
      mediaId: entry.mediaId,
      title: entry.media.title,
      type: entry.media.type,
      releaseDate: entry.media.releaseDate,
      tmdbId: entry.media.tmdbId,
      tvmazeId: entry.media.tvmazeId,
      imdbId: entry.media.imdbId,
      thetvdbId: entry.media.thetvdbId,
      episodeCount: entry.media.episodes.length,
      addedAt: entry.addedAt,
    })))
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
    let removedEntries = 0
    let skippedGroups = 0
    let transferredEpisodes = 0

    for (const group of groups) {
      const keeper = entriesById.get(group.keeper.id)
      if (!keeper) continue
      const duplicates = group.duplicates.flatMap((candidate) => {
        const entry = entriesById.get(candidate.id)
        return entry ? [entry] : []
      })
      const mergedEntries = [keeper, ...duplicates]
      const mergedStatus = mergedEntries.reduce<LibraryStatus>(
        (current, entry) => libraryStatusRank[entry.status] > libraryStatusRank[current] ? entry.status : current,
        "PLANNED"
      )
      const keeperEpisodes = new Map(
        keeper.media.episodes.map((episode) => [`${episode.season}:${episode.number}`, episode.id])
      )
      const hasUnmatchedWatchHistory = duplicates.some((duplicate) =>
        duplicate.media.episodes.some((episode) =>
          episode.progress.length > 0 && !keeperEpisodes.has(`${episode.season}:${episode.number}`)
        )
      )
      if (hasUnmatchedWatchHistory) {
        skippedGroups += 1
        continue
      }
      await transaction.libraryEntry.update({
        where: { id: keeper.id },
        data: {
          favorite: mergedEntries.some((entry) => entry.favorite),
          status: mergedStatus,
        },
      })
      for (const duplicate of duplicates) {
        for (const episode of duplicate.media.episodes) {
          const watchedAt = episode.progress[0]?.watchedAt
          const keeperEpisodeId = keeperEpisodes.get(`${episode.season}:${episode.number}`)
          if (!watchedAt || !keeperEpisodeId) continue
          await transaction.episodeProgress.upsert({
            where: { userId_episodeId: { userId, episodeId: keeperEpisodeId } },
            update: { watched: true },
            create: { userId, episodeId: keeperEpisodeId, watched: true, watchedAt },
          })
          transferredEpisodes += 1
        }
      }

      const duplicateIds = duplicates.map(({ id }) => id)
      if (duplicateIds.length > 0) {
        const removed = await transaction.libraryEntry.deleteMany({
          where: { userId, id: { in: duplicateIds } },
        })
        removedEntries += removed.count
      }
    }

    return { groups: groups.length, removedEntries, skippedGroups, transferredEpisodes }
  })

  response.json(result)
})

app.delete("/api/library/:mediaId", authenticate, async (request, response) => {
  const userId = response.locals.userId as string
  const mediaId = request.params.mediaId
  if (typeof mediaId !== "string") {
    response.status(400).json({ error: "Invalid media identifier" })
    return
  }
  const result = await prisma.libraryEntry.deleteMany({ where: { userId, mediaId } })
  if (result.count === 0) {
    response.status(404).json({ error: "Title not found in your library" })
    return
  }
  response.status(204).end()
})

app.patch("/api/episodes", authenticate, async (request, response) => {
  const parsed = bulkProgressSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: `Provide 1 to ${bulkEpisodeLimit} episode identifiers and a watched state` })
    return
  }
  const userId = response.locals.userId as string
  const episodeIds = [...new Set(parsed.data.episodeIds)]
  const episodes = await prisma.episode.findMany({
    where: {
      id: { in: episodeIds },
      airDate: { lte: new Date() },
      media: { library: { some: { userId } } },
    },
    select: { id: true },
  })
  if (episodes.length !== episodeIds.length) {
    response.status(404).json({ error: "One or more released episodes were not found in your library" })
    return
  }

  const watchedAt = new Date()
  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.episodeProgress.findMany({
      where: { userId, episodeId: { in: episodeIds } },
      select: { episodeId: true },
    })
    const existingIds = new Set(existing.map((progress) => progress.episodeId))
    await transaction.episodeProgress.updateMany({
      where: { userId, episodeId: { in: episodeIds } },
      data: { watched: parsed.data.watched, watchedAt },
    })
    await transaction.episodeProgress.createMany({
      data: episodeIds
        .filter((episodeId) => !existingIds.has(episodeId))
        .map((episodeId) => ({ userId, episodeId, watched: parsed.data.watched, watchedAt })),
    })
  })
  response.json({ updated: episodeIds.length, watched: parsed.data.watched })
})

app.patch("/api/episodes/:episodeId", authenticate, async (request, response) => {
  const parsed = progressSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a watched state" })
    return
  }
  const userId = response.locals.userId as string
  const episodeId = request.params.episodeId
  if (typeof episodeId !== "string") {
    response.status(400).json({ error: "Invalid episode identifier" })
    return
  }
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, airDate: { lte: new Date() }, media: { library: { some: { userId } } } },
    select: { id: true },
  })
  if (!episode) {
    response.status(404).json({ error: "Released episode not found in your library" })
    return
  }
  const progress = await prisma.episodeProgress.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    update: { watched: parsed.data.watched, watchedAt: new Date() },
    create: { userId, episodeId, watched: parsed.data.watched },
  })
  response.json({ progress })
})

const webDistDir = process.env.WEB_DIST_DIR?.trim()
if (webDistDir) {
  app.use(express.static(webDistDir))
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path === "/api" || request.path.startsWith("/api/")) {
      next()
      return
    }
    response.sendFile(path.join(webDistDir, "index.html"))
  })
}

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  void next
  console.error(error)
  if (error instanceof MediaIdentityConflictError || error instanceof MediaIdentityTypeConflictError) {
    response.status(409).json({ error: "Provider identifiers conflict with the existing catalog" })
    return
  }
  if (error instanceof ProviderHttpError || error instanceof ProviderResponseError) {
    response.status(502).json({ error: "A metadata provider request failed" })
    return
  }
  response.status(500).json({ error: "Something went wrong" })
})

export function startServer(port = config.port) {
  return app.listen(port, () => {
    console.log(`Telly Tracker listening on ${port}`)
    refreshScheduler?.start()
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer()

process.on("SIGTERM", async () => {
  await refreshScheduler?.stop()
  await prisma.$disconnect()
  process.exit(0)
})
