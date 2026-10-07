# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog.

## [Unreleased]

### Added

- Added a GitHub Actions publisher for version, main, and immutable SHA application images on GitHub Container Registry.
- Added a confirmed Upcoming-page action that marks all unwatched episodes and movies released during the last 14 days through today as watched while leaving future releases unchanged.
- Added reusable full-wordmark and app-mark SVG assets, and displayed the full Telly Tracker logo above the sign-in card when the desktop introduction is hidden.
- Redesigned Upcoming as a responsive release-card grid with a bounded four-week All releases calendar and a complete Unwatched backlog spanning past, today, and future while keeping the Home preview future-only.
- Added private per-user internet calendar subscriptions for future tracked episodes and movie releases, with direct `webcal` attachment, URL copying, and Account-page management.
- Added user-scoped duplicate-library cleanup that keeps the strongest provider-backed record, merges entry state, transfers matching episode history, and skips groups whose history cannot be mapped safely.
- Added an explicitly unconfirmed long-hiatus warning for shows whose latest released episode is more than two years old without a definitive ended or canceled provider status.
- Added browser-side JSON title-list imports with recognized movie/show wrappers, deduplication, ranked TMDB match review, editable per-title searches, and explicit tracking confirmation.
- Added a ready-to-upload example JSON library file and linked format guidance.
- Added show lifecycle and schedule status to Library covers and detail views, including exact next-air dates with relative day/week timing.
- Added whole-show aired-episode watched updates, per-season released-episode selection, and Library sorting by newest aired episodes.
- Added Shift-click range selection for released episode checkboxes, including range deselection and an inline usage hint.
- Added a searchable Library poster catalog with All, TV shows, and Movies filters, title and release-date sorting, responsive cover cards, and dedicated title detail views.
- Persisted TMDB portrait posters separately from wide backdrops while retaining TVmaze episode schedules and exact IMDb title links.
- Added IMDb navigation using exact stored title identifiers after import and IMDb title search links in provider results.
- Added confirmed, user-scoped title removal that retains episode watch history for later re-addition.
- Added accessible episode multi-selection with bulk watched and not-watched actions in batches of up to 500 released episodes, allowing larger selections to continue across multiple requests.
- Added user-scoped authenticator-app TOTP with QR enrollment, replay-resistant login challenges, one-use recovery codes, recovery-code replacement, self-service disable, and administrator-assisted reset for other users.
- Added deployment-managed SMTP environment variables with explicit environment-over-database precedence and read-only status in setup and Administration.
- Redesigned Administration around a compact operational summary and focused Access, Email, and Users workspaces, including per-user 2FA visibility.
- Added media-type and release-year filters with live result counts to TMDB discovery search.
- Added a first-launch owner wizard for creating the first administrator, choosing registration access, and optionally configuring SMTP.
- Added encrypted SMTP configuration, test delivery, and direct invitation email delivery to the Admin portal.
- Added a standalone `compose.dev.yml` for local source builds while keeping `compose.yml` image-only for normal deployments.
- Added an administrator portal for reviewing users, selecting Open, Invite only, or Closed registration, and issuing or revoking expiring email invitations.
- Added `ADMIN_EMAILS` bootstrap administration so trusted existing accounts are promoted on their next sign-in.
- Added an administrator-run PostgreSQL role configuration script and deployment guidance for existing database servers, DBeaver, role connection limits, and Prisma pool sizing.
- Added documented private-registry deployment, upgrade, HTTPS-origin, environment, and PostgreSQL volume-backup guidance for self-hosted servers.
- Documented server-side TMDB and TVmaze environment configuration for the planned dual-provider metadata integration.
- Passed provider configuration through Docker Compose without exposing the TMDB token to the frontend bundle.
- Added validated runtime configuration and typed TMDB/TVmaze clients with response validation, request timeouts, and bounded retry handling.
- Added provider contract tests covering authentication, stable-ID lookup, throttling, timeouts, and invalid responses.
- Added database fields and uniqueness constraints for TMDB, TVmaze, IMDb, and TheTVDB identities plus metadata and episode synchronization state.
- Added deterministic media identity resolution that respects TMDB namespaces and rejects cross-record or cross-type provider conflicts.
- Added transactional TMDB catalog import and refresh services with TVmaze episode enrichment, persisted sync failures, and progress-preserving episode updates.
- Added authenticated provider search, import, and manual-refresh APIs with a configurable in-memory TMDB search cache.
- Added bounded, non-overlapping scheduled refreshes for stale provider-backed titles with configurable interval and batch size.
- Added responsive provider discovery, add-to-plan, manual synchronization states, remote artwork, and required TMDB/TVmaze credits to the dashboard.
- Added an opt-in PostgreSQL integration harness that proves metadata refreshes retain existing episode-progress relations.

### Changed

- Changed the deployment example and environment template to pull the public `ghcr.io/thetxeagle/the-telly-tracker:v0.1.0` image by default.
- Renamed Upcoming to Release Calendar with a matching `#release-calendar` address, moved Account, Administration, and Log out into the user profile menu, and removed the redundant global dashboard search while retaining Library and Discover search.
- Streamlined the README around features and quick-start deployment, added project and build-status shields, and renamed the checked-in Compose files to distinguish the copyable deployment example from the development stack.
- Removed the JSON import title-count ceiling and changed TMDB review to user-controlled batches of 25 titles.
- Rebalanced the Library search and filter toolbar spacing across desktop, tablet, and phone layouts.
- Moved movie watch controls, favorites, removal, synopsis, and television episode bulk actions into focused Library title pages.
- Combined the React frontend and Express API into one application image and Compose service. Express now serves the compiled SPA and API while PostgreSQL remains separate.
- The first account on an empty installation now becomes administrator automatically; existing installations with no administrator promote their oldest account during migration.
- Refocused the dashboard on release tracking: complete episode lists now show air dates and watched state, recent releases can be updated directly, movies expose release-aware watched controls, and Upcoming lists future tracked releases.
- Bounded each Compose API instance to five PostgreSQL connections by default, with configurable connection-limit and pool-timeout environment settings.
- Made the combined Compose application image configurable through `APP_IMAGE` and pinned its default to the published `v0.1.0` package, while local development retains source builds.
- Made fictional catalog/demo-account seeding explicitly opt-in with `DEMO_SEED_DATA=true`; normal container startup now runs migrations without inserting demo records.

### Fixed

- Prevented the Administration tab bar's active underline from creating a one-pixel vertical scrollbar on desktop and mobile layouts.
- Paginated the complete Unwatched release backlog into server-side pages of 48 items so large episode libraries no longer inflate the dashboard response or exhaust the application container.
- Allowed internet-calendar subscription and event links to use a dedicated public domain through `CALENDAR_PUBLIC_URL` instead of inheriting a LAN-only `WEB_ORIGIN`.
- Made TMDB discovery and JSON-import results derive their tracked state from the signed-in user's persisted library, including legacy records matched by title, media type, and release year.
- Replaced repeated, tightly cropped show backdrops in release timelines with TVmaze episode stills when available, retaining show artwork as the fallback.
- Normalized summary-card padding and tightened the Home summary-to-provider-credit spacing so the dashboard footer reads as one balanced section.
- Reworked library summary cards into a stable label, prominent metric, and helper-text hierarchy at desktop and phone widths.
- Allowed the configured TMDB image CDN and official TMDB attribution host through the production Content Security Policy so posters and provider branding render in unified-container deployments.
- Prevented HTTP LAN deployments from upgrading same-origin frontend assets to unavailable HTTPS URLs, which previously produced a blank white screen after the single-container migration.
- Removed hardcoded demo credentials from the sign-in form and allowed successful registration to enter the new user's dashboard on configured HTTP LAN origins while retaining secure cookies for HTTPS origins.
- Replaced decorative dashboard anchors with persistent Home, Library, Discover, and Upcoming views, including usable mobile navigation and full tracked-title views.

### Security

- Calendar feeds use signed purpose-scoped bearer URLs with per-user versions; regenerating or disabling a feed immediately invalidates the prior subscription without storing its raw token.
- Duplicate cleanup is restricted to the authenticated user's library and leaves any duplicate group unchanged when watched history cannot be transferred safely.
- Bulk episode updates are atomic and reject unreleased episodes or episodes outside the authenticated user's library; title removal can delete only that user's library entry.
- TOTP secrets are encrypted at rest, login challenges expire after five minutes and five attempts, accepted TOTP time steps cannot be replayed, and recovery codes are stored only as keyed hashes.
- SMTP passwords are encrypted at rest with AES-256-GCM and are never returned through the administration API.
- Stored only SHA-256 invitation token hashes, limited invitations to one use and one email address, and enforced every administration route against the persisted server-side administrator role.
- Restricted episode watched-state updates to released episodes in the authenticated user's library.

## [0.1.0] - 2026-09-25

### Added

- Responsive React and shadcn dashboard for current, completed, planned, favorite, and upcoming titles.
- Multi-user registration and cookie-based authentication with bcrypt password hashing.
- PostgreSQL/Prisma models for users, media, episodes, libraries, and episode progress.
- Catalog discovery, favorites, planned-title actions, and episode-level watched controls.
- Fictional demo catalog and account for local evaluation.
- Docker Compose stack with PostgreSQL, Express API, and nginx-hosted frontend.
- Setup documentation and an initial responsive design foundation.

### Security

- User-scoped API mutations derive identity from verified HTTP-only session cookies.
- Prisma was pinned to `6.12.0` to avoid the reported `deepmerge-ts` configuration vulnerability.

[Unreleased]: https://github.com/thetxeagle/the-telly-tracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thetxeagle/the-telly-tracker/releases/tag/v0.1.0
