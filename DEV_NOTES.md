# Developer Notes

## Project Overview
- `cw.api.core.di` is a TypeScript dependency-injection container designed to be the common foundation for API packages and infrastructure modules.
- Key philosophies: minimal external dependencies, deterministic runtime behavior, and explicit control over lifecycles and scope contexts.
- Node >= 18 (ES2020 target) with Jest, ESLint flat config, and Prettier for toolchain; tests live under `tests/` mirroring feature granularity.

## Core Architecture
- `Container`: singleton/scoped/transient resolution, AsyncLocalStorage-based session handling, constructor and property injection, forwardRef/Optional, middleware metadata, controller/action metadata, module registration system.
- Container is singleton across packages via `globalThis` (see `src/instance.ts`); `resetContainer()` clears state (now async-aware).
- Session model: `createSession/runInSession/runInScope` maintain scoped lifecycles with session IDs, automatic cleanup, and AsyncLocalStorage context propagation.
- Decorators (`src/decorators.ts`): `@Injectable`, `@Inject`, `@Optional`, `@Route`, `@UseMiddleware`, `@Controller`, `@RouteMiddleware`, `@GlobalMiddleware`, `ForwardRefInject`; property injection optionality supported via metadata.
- Discovery (`src/discovery.ts`) loads annotated classes through dynamic import; used by downstream packages for auto-registration.
- Module support (`src/module.ts`): `createModule` + `registerModules` handle grouped providers, imports, exports.

## Recent Features (v1 cadence)
- Constructor and property injection with optional dependencies and forwardRef handling.
- Lifecycle enforcement (singleton/scoped/transient), scoped sessions with AsyncLocalStorage.
- Middleware metadata pipeline for route/global scopes with ordered execution and phases.
- Controller/action metadata for future router integrations (method/path/middlewares/tags).
- Module/bundle registration and scope context helper `runInScope`.
- Container events/logging: `resolve:start/success/error`, `instantiate`, `dispose`, now `stats:change`.
- Optional property injection, nested container hierarchy with selective inheritance (include/exclude tokens or class references).
- Statistics tracking: `ContainerStats` with counts for registrations, singleton instances, active sessions, child containers; `stats:change` event emitted on mutations; `getStats()` + `getId()` for introspection.

## Testing & Coverage
- Jest suite spans container behaviors, lifecycles, decorators, discovery, middleware, events, stats, nested containers.
- Coverage thresholds enforced globally (statements/lines ≥ 90%, functions ≥ 80%, branches ≥ 70).
- Hooks/run scripts: `npm test`, `npm run lint`, `npm run test:coverage`; format/lint steps mirror git hook pipeline.

## Build & Tooling
- `package.json`: scripts for build (`tsc --project tsconfig.build.json`), lint, format, test, test:coverage.
- Type definitions exported via `src/index.ts`; `tsconfig.build.json` ensures only `src` compiled for publishing.
- Pre-commit hooks (format → add --all → lint → coverage) enforced via `.githooks`; install via `npm run hooks:install` (prepare script).

## Release Workflow (to adopt going forward)
- Bump `package.json` version reflecting semver (e.g., v1.0.0 for initial release).
- Update `CHANGE_LOG.md` detailing version, highlights, rationale; include noteworthy PRs or modules touched.
- README should track features/API; README groundwork pending (see README plan section once defined).

## Outstanding Opportunities / Ideas
- Enhanced logging/telemetry toggles (env or container options) if deeper observability required.
- Compile-time provider validation, maybe diagnostics around duplicate tokens across child hierarchies.
- Lifecycle disposal improvements (async hooks already integrated, but maybe add `onDispose` events).
- CLI/discovery improvements (e.g., watch mode) for future tooling packages.
- README expansion with API docs, code samples, quick starts (to be handled separately).

## Usage Tips
- Always await `resetContainer()` in tests since it may return a promise when dispose hooks are async.
- For child containers: use `createChild({ include: [...], exclude: [...] })` to scope inherited providers; stats/events help track runtime usage.
- To inspect runtime state, `container.getStats()` plus listening to `stats:change` provides up-to-date metrics (registrations, sessions, etc.).
- Optional property injection: combine `@Optional()` and `@Inject(token)` on properties to allow graceful absence of providers.

## Miscellaneous
- Node’s `console.debug` is polyfilled via `debugSink` for environments without console methods.
- `containerIdCounter` ensures stable IDs for logging/stats events.
- Keep `PLAN.md` updated for future roadmap items; ready for v1 release activities (CHANGE_LOG, README content plan, etc.).
