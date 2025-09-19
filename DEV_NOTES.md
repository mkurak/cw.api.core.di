# Developer Notes

> Reference sheet for future sessions when context is limited.

## Project Overview
- `cw.api.core.di` is the shared dependency-injection container for the cw API ecosystem.
- Design goals: minimal external dependencies, deterministic behaviour, explicit lifecycle and scope control.
- Requires Node.js 18+; source is TypeScript targeting ES2020 with Jest/ESLint/Prettier for tooling.

## Core Architecture
- **Container**: resolves registrations across singleton/scoped/transient lifecycles, manages AsyncLocalStorage-backed sessions, supports constructor and property injection, optional dependencies, forward references, and middleware/controller metadata.
- **Singleton access**: stored on `globalThis` (`src/instance.ts`). `resetContainer()` is async-aware.
- **Sessions**: `createSession`, `runInSession`, `runInScope` provide per-request scoping with automatic cleanup.
- **Decorators** (`src/decorators.ts`): `@Injectable`, `@Inject`, `@Optional`, `@Route`, `@UseMiddleware`, `@Controller`, `@RouteMiddleware`, `@GlobalMiddleware`, `ForwardRefInject`.
- **Discovery** (`src/discovery.ts`): dynamic import helpers for auto-registration flows.
- **Modules** (`src/module.ts`): `createModule` / `registerModules` group providers and handle imports/exports.

## Recent Capabilities
- Optional property injection and forward reference support.
- Middleware metadata with ordered execution phases for global and route scopes.
- Controller/action metadata for routing integrations.
- Nested container hierarchy with include/exclude inheritance rules.
- Container statistics (`getStats`, `stats:change` event) tracking registrations, instances, sessions, child containers.
- Async disposal pipeline awaiting promise-based `dispose()` hooks.

## Logging
- All logging funnels through `cw.helper.colored.console` (`src/logger.ts`) to produce consistent ANSI output.
- Runtime diagnostics (`enableEventLogging`), release tooling, smoke tests, and hook setup scripts reuse the shared logger theme.

## Testing & Coverage
- Jest suites cover container behaviour, lifecycles, decorators, discovery, middleware, stats, and nested containers.
- Coverage thresholds: statements/lines ≥ 90%, functions ≥ 80%, branches ≥ 70%.
- Use `npm run test`, `npm run test:coverage`, `npm run lint`; the pre-commit hook enforces format → add --all → lint → coverage.

## Build & Tooling
- `tsconfig.build.json` compiles only `src/` and emits declarations/maps under `dist/`.
- ESLint 9 flat config (`eslint.config.mjs`) + Prettier (`.prettierrc.json`).
- `npm run prepare` performs `build` then installs hooks (`scripts/setup-hooks.mjs`).
- Smoke test (`scripts/smoke.mjs`) validates published exports.
- Release helper (`scripts/release.mjs`) wraps `npm version` with commit/tag automation.

## Release Workflow
1. Update code/docs and ensure a clean working tree.
2. Edit `CHANGE_LOG.md` and other docs as needed.
3. Bump the version via `npm run release -- <type>` (defaults to `chore: release v%s` commit message).
4. Script pushes commits and tags automatically.
5. Publishing uses `npm publish --provenance` via the GitHub workflow (requires `NPM_TOKEN`).

## Publishing Notes
- `publishConfig.provenance: true`; local publishing requires `npm publish --no-provenance` or `NPM_CONFIG_PROVENANCE=false`.
- GitHub workflow `.github/workflows/publish.yml` targets an environment named `npm-publish`.

## ESM Reminders
- Always import local modules with `.js` extensions (`moduleResolution: 'Bundler'` handles TS resolution).
- Jest uses `ts-jest/presets/default-esm`, `extensionsToTreatAsEsm`, and path mappers.
- Node scripts live in `.mjs` form and rely on the shared colored logger.

## Usage Tips
- Await `resetContainer()` in tests (async disposal).
- Use `createChild` with include/exclude filters for scoped inheritance.
- Listen to `stats:change` for live metrics, or call `getStats()` manually.
- Combine `@Optional()` and `@Inject(token)` on properties to tolerate missing providers.

## Miscellaneous
- `containerIdCounter` provides stable IDs for logging and stats events.
- Keep `PLAN.md`, `CHANGE_LOG.md`, and `DEV_NOTES.md` current alongside code changes.
