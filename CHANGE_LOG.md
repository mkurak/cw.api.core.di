# Changelog

## [1.1.6] - 2025-09-21
### Changed
- Removed the npm `release` script and updated developer notes to recommend `npm version <type>` followed by `git push --follow-tags`.

## [1.1.3] - 2025-09-19
### Changed
- Switched the internal logger to `createCwLogger` from `cw.helper.colored.console/themes/cw` for consistent theming.
- Updated dependency to consume the latest console helper release with theme presets.

## [1.1.0] - 2025-09-19
### Added
- Shared `cw.helper.colored.console` logger surfaced via `src/logger.ts` for consistent ANSI output.
- ESM-based Git hook, release, and smoke scripts now use the colored logger for status reporting.

### Changed
- Container trace sink logs (`enableEventLogging`) now emit through the shared colored console.
- Updated developer notes and tests to reflect the new logging integration.

## [1.0.0] - 2025-09-17
### Added
- Initial public release of `cw.api.core.di` providing the shared DI core for the cw.api ecosystem.
- Constructor and property injection with optional dependencies, `@Inject`, `@Optional`, and `ForwardRefInject` for circular graphs.
- Lifecycle management (`Singleton`, `Scoped`, `Transient`) with AsyncLocalStorage-based session utilities (`createSession`, `runInScope`, etc.).
- Middleware, controller, and action decorators capturing routing metadata for framework adapters.
- Module system (`createModule`, `registerModules`) plus discovery helpers for auto-registration workflows.
- Nested container support with include/exclude inheritance rules and container statistics/event stream (`stats:change`).
- Async-aware disposal pipeline honoring synchronous and promise-returning `dispose()` methods.

### Tooling
- Pre-commit hook running format → lint → coverage to ensure consistent quality.
- Comprehensive README, developer notes, and test coverage (Jest + ESLint + Prettier).
