# Changelog

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
