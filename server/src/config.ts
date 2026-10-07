import { z } from "zod"

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(20).optional()
)

const optionalEncryptionKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional()
)

const optionalBoolean = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(["true", "false"]).transform((value) => value === "true").optional()
)

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
)

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional()
)

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  CALENDAR_PUBLIC_URL: optionalUrl,
  JWT_SECRET: z.string().min(32),
  SETTINGS_ENCRYPTION_KEY: optionalEncryptionKey,
  ADMIN_EMAILS: z.string().default(""),
  SMTP_ENABLED: optionalBoolean,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: optionalBoolean,
  SMTP_USERNAME: optionalString,
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: optionalString,
  SMTP_FROM_EMAIL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.email().optional()
  ),
  TMDB_ACCESS_TOKEN: optionalSecret,
  TMDB_API_BASE_URL: z.url().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE_URL: z.url().default("https://image.tmdb.org/t/p"),
  TVMAZE_API_BASE_URL: z.url().default("https://api.tvmaze.com"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
  PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  PROVIDER_SEARCH_CACHE_TTL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(300_000),
  PROVIDER_REFRESH_INTERVAL_MS: z.coerce.number().int().min(0).max(604_800_000).default(21_600_000),
  PROVIDER_REFRESH_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
}).superRefine((value, context) => {
  if (value.SMTP_ENABLED && (!value.SMTP_HOST || !value.SMTP_FROM_EMAIL)) {
    context.addIssue({ code: "custom", path: ["SMTP_ENABLED"], message: "Enabled SMTP requires SMTP_HOST and SMTP_FROM_EMAIL" })
  }
})

export type EnvironmentSmtpSettings = {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromName: string
  fromEmail: string
}

export type AppConfig = {
  nodeEnv: "development" | "test" | "production"
  port: number
  webOrigin: string
  calendarPublicUrl: string
  sessionCookieSecure: boolean
  jwtSecret: string
  settingsEncryptionKey: string
  adminEmails: string[]
  smtpEnvironment?: EnvironmentSmtpSettings
  tmdbAccessToken?: string
  tmdbApiBaseUrl: string
  tmdbImageBaseUrl: string
  tvmazeApiBaseUrl: string
  providerTimeoutMs: number
  providerMaxRetries: number
  providerSearchCacheTtlMs: number
  providerRefreshIntervalMs: number
  providerRefreshBatchSize: number
}

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = configSchema.parse(environment)
  const smtpEnvironment = parsed.SMTP_ENABLED === undefined ? undefined : {
    enabled: parsed.SMTP_ENABLED,
    host: parsed.SMTP_HOST ?? "",
    port: parsed.SMTP_PORT,
    secure: parsed.SMTP_SECURE ?? false,
    username: parsed.SMTP_USERNAME ?? "",
    password: parsed.SMTP_PASSWORD ?? "",
    fromName: parsed.SMTP_FROM_NAME ?? "Telly Tracker",
    fromEmail: parsed.SMTP_FROM_EMAIL ?? "",
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    calendarPublicUrl: (parsed.CALENDAR_PUBLIC_URL ?? parsed.WEB_ORIGIN).replace(/\/$/, ""),
    sessionCookieSecure: new URL(parsed.WEB_ORIGIN).protocol === "https:",
    jwtSecret: parsed.JWT_SECRET,
    settingsEncryptionKey: parsed.SETTINGS_ENCRYPTION_KEY ?? parsed.JWT_SECRET,
    adminEmails: parsed.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    smtpEnvironment,
    tmdbAccessToken: parsed.TMDB_ACCESS_TOKEN,
    tmdbApiBaseUrl: parsed.TMDB_API_BASE_URL.replace(/\/$/, ""),
    tmdbImageBaseUrl: parsed.TMDB_IMAGE_BASE_URL.replace(/\/$/, ""),
    tvmazeApiBaseUrl: parsed.TVMAZE_API_BASE_URL.replace(/\/$/, ""),
    providerTimeoutMs: parsed.PROVIDER_TIMEOUT_MS,
    providerMaxRetries: parsed.PROVIDER_MAX_RETRIES,
    providerSearchCacheTtlMs: parsed.PROVIDER_SEARCH_CACHE_TTL_MS,
    providerRefreshIntervalMs: parsed.PROVIDER_REFRESH_INTERVAL_MS,
    providerRefreshBatchSize: parsed.PROVIDER_REFRESH_BATCH_SIZE,
  }
}
