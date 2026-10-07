import helmet, { type HelmetOptions } from "helmet"

export function createHelmetOptions(secureOrigin: boolean, tmdbImageBaseUrl: string): HelmetOptions {
  const tmdbImageOrigin = new URL(tmdbImageBaseUrl).origin
  const directives = {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    "img-src": ["'self'", "data:", tmdbImageOrigin, "https://www.themoviedb.org", "https://static.tvmaze.com"],
    ...(secureOrigin ? {} : { "upgrade-insecure-requests": null }),
  }

  return {
    contentSecurityPolicy: { directives },
    ...(secureOrigin ? {} : { strictTransportSecurity: false }),
  }
}
