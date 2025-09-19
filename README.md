# cw.api.core.di

## Table of Contents
- Overview
  - Purpose & Philosophy
  - Feature Highlights
  - When to Use This Package
- Getting Started
  - Installation
  - Quick Start Example
- Architecture Deep Dive
  - Container Lifecycle & Resolution Flow
  - Tokens, Registrations, and Injection Modes
  - Session & Scope Management
  - Module System & Discovery Pipeline
  - Middleware & Routing Metadata
  - Statistics, Events, and Observability
- API Reference
  - Container Class
  - Decorators
    - `@Injectable`
    - `@Inject`
    - `@Optional`
    - `@Route`
    - `@UseMiddleware`
    - `@RouteMiddleware`
    - `@GlobalMiddleware`
    - `ForwardRefInject`
  - Utility Exports
    - Module Helpers (`createModule`, `registerModules`)
    - Discovery Helpers
    - Types & Interfaces
  - Configuration Objects
    - `ResolveOptions`
    - `ChildContainerOptions`
    - `ContainerStats`
- Usage Guides
  - Building a Service Graph from Scratch
  - Optional Dependencies (Constructor & Property)
  - Scoped Lifetimes in HTTP/RPC Contexts
  - Middleware Pipelines for Route Handling
  - Controller & Action Metadata in Practice
  - Modular Architecture Patterns
  - Building a Service Graph from Scratch
  - Optional Dependencies (Constructor & Property)
  - Scoped Lifetimes in HTTP/RPC Contexts
  - Middleware Pipelines for Route Handling
  - Controller & Action Metadata in Practice
  - Modular Architecture Patterns
  - Nested Containers & Tenant Isolation
  - Observability Recipes (Events, Stats, Logging)
  - Integration Patterns (Workers, CLI, Services)
- Advanced Topics
  - Forward References & Circular Dependency Strategies
  - Custom Discovery Strategies
  - Extending or Writing Custom Decorators
  - Integrating with External Frameworks (Express, Fastify, etc.)
  - Testing Techniques & Mock Containers
- Tooling & Workflows
  - Development Scripts & Linting
  - Git Hooks & Validation Pipeline
  - Release Checklist (Versioning, CHANGE_LOG)
- Migration & Version History
  - Semantic Versioning Policy
  - Upgrade Notes by Version
- FAQ
- Contributing Guide
- License

---

## Overview

### Purpose & Philosophy
`cw.api.core.di` is the foundation of the **cw.api** ecosystem: a TypeScript-first dependency injection container that emphasizes predictable lifecycles, explicit configuration, and minimal abstractions. Instead of hiding framework decisions behind heavy decorators or runtime magic, the container keeps responsibility in the hands of the application author—while still offering the ergonomics of modern DI (decorators, metadata, discovery helpers, scoped sessions, etc.).

Key design goals:
- **Deterministic runtime** – every registration, resolution, and lifecycle transition is observable via events and statistics.
- **Composable architecture** – features such as controller/action metadata, middleware descriptors, and module bundles are optional building blocks rather than baked-in opinions.
- **Framework agnostic** – the container ships without HTTP assumptions; it is equally suitable for CLI tooling, workers, or REST gateways.
- **Zero external runtime dependencies** – only the Node.js standard library is required at runtime; Jest/ESLint/Prettier are confined to development.

### Feature Highlights
- Constructor & property injection with optional dependencies and `forwardRef` support for circular graphs.
- Lifecycle management (`singleton`, `scoped`, `transient`) backed by `AsyncLocalStorage` for request/job isolation.
- Module system (`createModule`, `registerModules`) plus discovery helpers for auto-registration workflows.
- Middleware metadata pipeline with ordering, phase control, and controller/action associations for HTTP routers.
- Nested containers that selectively inherit registrations through include/exclude rules, enabling tenant isolation or testing overrides.
- Built-in statistics (`ContainerStats`) and rich event stream (`resolve:*`, `instantiate`, `dispose`, `stats:change`) for observability.
- Async-aware disposal pipeline: `dispose()` methods may return promises; container honors them during session termination and teardown.

### When to Use This Package
Choose `cw.api.core.di` if you need:
- A lightweight DI core for custom frameworks or backend services where you control the runtime.
- Strong lifecycle guarantees (scoped sessions, deterministic teardown) without adopting a full-stack opinionated framework.
- Metadata-rich building blocks (middleware descriptors, controller/action annotations) that you can wire into your own HTTP/router layer.
- A DI container that can power multiple packages within a monorepo, sharing a single instance via `globalThis` when desired.
- Fine-grained observability: per-container stats, change events, and the ability to toggle logging via listeners instead of global instrumentation.

If you prefer a batteries-included framework with routing/config baked in (e.g., NestJS, Adonis), this package might be too low-level. It shines when you want Nest-like ergonomics but with full control over every dependency.

---

## Getting Started

### Installation
Install via npm (or your package manager of choice). The package targets Node.js 18+.

```bash
npm install cw.api.core.di
# or
yarn add cw.api.core.di
# or
pnpm add cw.api.core.di
```

> **TypeScript configuration**: ensure `experimentalDecorators` and `emitDecoratorMetadata` are enabled in your `tsconfig.json`. The repo’s `tsconfig.json` shows a recommended baseline.

### Quick Start Example
A minimal setup registering two services, resolving them, and using a scoped session:

```ts
import 'reflect-metadata';
import { Container, Injectable, Inject, Lifecycle } from 'cw.api.core.di';

// 1. Declare services with decorators.
@Injectable({ lifecycle: Lifecycle.Singleton })
class ConfigService {
  readonly dbUrl = process.env.DB_URL ?? 'postgres://localhost/dev';
}

@Injectable({ lifecycle: Lifecycle.Transient })
class UserRepository {
  constructor(private readonly config: ConfigService) {}

  async findById(id: string) {
    // use config.dbUrl ...
    return { id, email: 'user@example.com' };
  }
}

@Injectable({ lifecycle: Lifecycle.Scoped })
class UserContext {
  constructor(@Inject(UserRepository) private readonly repo: UserRepository) {}

  async loadCurrentUser(userId: string) {
    return this.repo.findById(userId);
  }
}

// 2. Resolve within scoped session (AsyncLocalStorage context).
const container = new Container();

async function handleRequest(userId: string) {
  return container.runInScope('http-request', async () => {
    const ctx = container.resolve(UserContext);
    return ctx.loadCurrentUser(userId);
  });
}

handleRequest('123').then((user) => console.log(user));
```

This example demonstrates:
- `Lifecycle.Singleton` for shared dependencies (`ConfigService`).
- `Lifecycle.Transient` for stateless factories (`UserRepository`).
- `Lifecycle.Scoped` bound to `runInScope`, ensuring per-request instances (`UserContext`).
- Constructor injection via TypeScript metadata with no additional configuration required.

Next sections detail architecture primitives, full API, and advanced usage patterns.

---

## Architecture Deep Dive

### Container Lifecycle & Resolution Flow
The container orchestration follows a deterministic pipeline:

1. **Lookup** – `container.resolve(token)` checks the local registry. If the token is absent, a parent container is consulted when inheritance rules allow it (include/exclude lists on `createChild`).
2. **Lifecycle validation** – the resolver guards against illegal graphs (e.g., singleton → scoped). Circular references without `forwardRef` also surface detailed errors.
3. **Instantiation** – constructor parameters are resolved using emitted metadata (`design:paramtypes`) or explicit decorators (`@Inject`, `@Optional`). Property injection is applied after construction for entries registered via `@Inject` on fields.
4. **Caching** – singletons are memoized in the registration record; scoped instances live inside a per-session map; transients are never cached.
5. **Post-processing** – events (`resolve:start/success/error`, `instantiate`) and statistics updates fire so observers can trace resolution flow.

### Tokens, Registrations, and Injection Modes
- **Tokens**: string identifiers, class constructors, or `forwardRef` wrappers. Strings are ideal for aliases/interfaces, constructors for concrete services.
- **Registrations**: `register(target, options)` records lifecycle, `ServiceType`, optional name, and caches. Duplicate token collisions throw to keep graphs predictable.
- **Injection modes**:
  - Metadata-based (`design:paramtypes`) injected automatically when classes are registered.
  - `@Inject(token)` overrides token resolution per parameter or property, enabling polymorphic bindings.
  - `@Optional()` marks constructor parameters or properties optional; unresolved dependencies return `undefined` instead of throwing.
  - `ForwardRefInject(() => Token)` lazily resolves tokens defined later or participating in cycles.

### Session & Scope Management
- `createSession(scope?)` establishes a scoped context identified by a session ID (and optional human-readable scope).
- `runInSession`/`runInScope` wrap callbacks with `AsyncLocalStorage`, guaranteeing scoped services reuse the same instance for the call chain.
- Scoped registrations cache instances per-session; `destroySession` disposes cached objects (awaiting async `dispose()` when present) and updates stats.
- Scoped lifetimes integrate seamlessly with HTTP requests, background jobs, or multi-step workflows by naming scopes appropriately.

### Module System & Discovery Pipeline
- **Modules**: `createModule({ providers, imports, exports })` groups related providers. `registerModules(container, ...)` executes each module once, respecting imports.
- **Discovery**: `discover({ rootDir, include, exclude })` dynamically imports sources—triggering decorator registration side-effects. Useful for bootstrapping without manually importing every provider.
- Modules and discovery can be combined: discover providers, register them via modules, and compose imports for complex feature sets.

### Middleware & Routing Metadata
- `@RouteMiddleware` / `@GlobalMiddleware` register middleware classes with ordering (`order`) and, for global middleware, execution phase (`before` | `after`).
- `@Controller` annotates classes for routing: `basePath`, shared middleware tokens, tags.
- `@Route` applies to controller methods, capturing HTTP method/path/name/summary/description metadata. `@UseMiddleware` on methods appends action-specific middleware.
- Metadata accessors (`getControllerMetadata`, `getActionRoute`, `getActionMiddlewares`, `getMiddlewareMetadata`) are framework-neutral and fuel Express/Fastify adapters or custom routers.

### Statistics, Events, and Observability
- `ContainerStats` tracks registrations, active singleton instances, live sessions, and child container count. Mutations emit `stats:change` with the reason (e.g., `register`, `singleton:init`, `session:create`, `child:create`, `clear`).
- Event stream: `resolve:start`, `resolve:success`, `resolve:error`, `instantiate`, `dispose`, `stats:change`. Listeners can apply logging, tracing, or metrics emission.
- `enableEventLogging` is an opt-in console logger; production apps can attach structured sinks to push data into metrics platforms.

---

## API Reference

### Container Class
Most applications interact with the singleton exported by `getContainer()`, but the `Container` class can be instantiated directly whenever isolated graphs are needed (tests, feature modules, tenants).

#### Constructor
```ts
const container = new Container(parentContainer?, inheritanceRules?);
```
- `parentContainer` (optional) – enables nested containers; used internally by `createChild`.
- `inheritanceRules` (internal) – computed from `ChildContainerOptions`; controls which tokens inherit from the parent.

Every container receives a unique ID (`container.getId()`).

#### Registration APIs
- `register(target, options?): Registration`
  - `target`: class constructor decorated with `@Injectable` (decorator is optional but recommended for metadata).
  - `options`:
    - `name`: string token (alias)
    - `type`: `ServiceType` (`Service`, `Controller`, `Action`, `Middleware`, etc.)
    - `lifecycle`: `Lifecycle.Singleton | Scoped | Transient`
    - `middlewares`: resolve tokens (used for action/controller metadata)
- `registerModule(module: ModuleRef): void`
- `createChild(options?: ChildContainerOptions): Container`
  - `include`: array of tokens/classes to inherit
  - `exclude`: tokens/classes to block; default behavior inherits everything

#### Resolution APIs
- `resolve<T>(token, options?): T`
  - Options: `sessionId`, `scope` (overrides auto-detected context)
  - Throws with `Token "..." is not available` when parent inheritance rules reject the token
- `list(type?): Registration[]` – returns registrations from current container plus inherited ones after filtering

#### Session & Lifecycle APIs
- `createSession(scope?): SessionInfo`
- `destroySession(sessionId): Promise<void> | void`
- `runInSession(callback, existingSessionId?, scopeName?)`
- `runInScope(scopeName, callback, existingSessionId?)`

#### Statistics & Events
- `getStats(): ContainerStats`
- `enableEventLogging(options?)`
- `on(event, listener)` / `off(event, listener)`
  - Events: `resolve:start`, `resolve:success`, `resolve:error`, `instantiate`, `dispose`, `stats:change`

### Decorators
All decorators live in `src/decorators.ts` and are exported from the package root.

#### `@Injectable(options?)`
Declares a class as injectable. Options mirror registration options (`name`, `type`, `lifecycle`, `middlewares`). If omitted, default lifecycle is `Singleton`.

#### `@Inject(token)`
Overrides constructor parameter or property token. Useful for interface-style injection or when multiple implementations share a base class.

#### `@Optional()`
Marks constructor parameter **or** decorated property as optional. When the dependency is absent, `undefined` is injected instead of throwing.

#### `@Route`, `@UseMiddleware`, `@Controller`
Decorators for HTTP metadata. `@Route` is method-only; `@UseMiddleware` attaches middleware tokens to controller methods; `@Controller` sets `basePath`, shared middleware, and optional tags.

#### Middleware Decorators
- `@RouteMiddleware({ order })`
- `@GlobalMiddleware({ order, phase })`
Ensure middleware classes implement a `handle` method. Metadata can be retrieved via `getMiddlewareMetadata`.

#### `ForwardRefInject(() => Token)`
```ts
@Injectable()
class ServiceA {
  constructor(@ForwardRefInject(() => ServiceB) private readonly getB: () => ServiceB) {}
}

@Injectable()
class ServiceB {
  constructor(private readonly serviceA: ServiceA) {}
}
```
`ForwardRefInject` wraps a function returning the token, enabling circular graphs while maintaining type safety.

### Utility Exports
- `createModule`, `registerModules`
- `discover` (dynamic import/discovery helper)
- Type definitions (`ContainerStats`, `ResolveOptions`, `ChildContainerOptions`, etc.)

### Configuration Objects
- `ResolveOptions`: `sessionId`, `scope`
- `ChildContainerOptions`: `include`/`exclude` token arrays for child inheritance
- `ContainerStats`: shape of stats returned by `getStats`


## Usage Guides

### Building a Service Graph from Scratch
This guide walks through composing modules, lifecycles, and constructor injection in a clean and testable way.

```ts
import 'reflect-metadata';
import {
  Container,
  Injectable,
  Inject,
  Lifecycle,
  createModule,
  registerModules
} from 'cw.api.core.di';

@Injectable({ lifecycle: Lifecycle.Singleton })
class Logger {
  info(message: string) {
    console.log(`[info] ${message}`);
  }
}

@Injectable({ lifecycle: Lifecycle.Transient })
class Mailer {
  constructor(private readonly logger: Logger) {}

  send(to: string, subject: string) {
    this.logger.info(`Sending mail to ${to} (${subject})`);
  }
}

@Injectable({ lifecycle: Lifecycle.Scoped })
class UserService {
  constructor(
    private readonly mailer: Mailer,
    @Inject(Logger) private readonly logger: Logger
  ) {}

  async onboardUser(email: string) {
    this.logger.info(`Onboarding user ${email}`);
    this.mailer.send(email, 'Welcome!');
  }
}

const CoreModule = createModule({
  name: 'CoreModule',
  providers: [Logger]
});

const FeatureModule = createModule({
  name: 'FeatureModule',
  imports: [CoreModule],
  providers: [Mailer, UserService]
});

const container = new Container();
registerModules(container, FeatureModule);

await container.runInScope('onboarding', async () => {
  const userService = container.resolve(UserService);
  await userService.onboardUser('alice@example.com');
});
```

**Highlights**
- Modules encapsulate provider groups and can import other modules.
- Logger is singleton, Mailer transient, UserService scoped—showcasing mixed lifecycles.
- `runInScope` keeps scoped instances alive for the duration of the onboarding workflow.
- Constructor injection combines implicit metadata and explicit `@Inject` overrides.

### Optional Dependencies (Constructor & Property)
Optional dependencies prevent hard failures when tokens are absent. Combine `@Optional()` with `@Inject(token)` or rely on metadata when appropriate.

```ts
@Injectable()
class CacheAdapter {
  get(key: string) { /* ... */ }
}

@Injectable({ lifecycle: Lifecycle.Singleton })
class SearchService {
  constructor(@Optional() private readonly cache?: CacheAdapter) {}

  async query(term: string) {
    if (this.cache) {
      const cached = this.cache.get(term);
      if (cached) return cached;
    }
    // otherwise perform an expensive search
  }
}
```

Optional property injection works similarly:

```ts
@Injectable({ name: 'metrics' })
class Metrics {}

@Injectable()
class ReportService {
  @Inject('metrics')
  @Optional()
  metrics?: Metrics;

  generate() {
    this.metrics?.record('report.generated');
  }
}
```

If `metrics` is not registered, the property stays `undefined`; registering a metrics implementation later allows the container to populate the property automatically.

### Scoped Lifetimes in HTTP/RPC Contexts
Scoped lifetimes shine in request/response pipelines:

1. Instantiate the container once during application bootstrap.
2. For each request/job, call `runInScope(scopeName, async () => { ... })`.
3. Resolve scoped services inside the callback; they are unique per scope and cleaned up afterwards.

Express-style middleware example:

```ts
const container = getContainer();

app.use(async (req, res, next) => {
  await container.runInScope('http', async () => {
    res.locals.container = container;
    await next();
  });
});

app.get('/me', async (req, res) => {
  const ctx = res.locals.container.resolve(UserContext);
  res.json(await ctx.loadCurrentUser(req.user.id));
});
```

### Middleware Pipelines for Route Handling
Controller/action metadata remains framework-neutral, allowing adapters to target Express, Fastify, or other routers.

```ts
@RouteMiddleware({ name: 'auth', order: 10 })
class AuthMiddleware {
  async handle(req, res, next) {
    // authenticate request...
    return next();
  }
}

@Controller({ basePath: '/users', middlewares: ['auth'] })
class UserController {
  @Route({ method: 'GET', path: '/' })
  async list() { /* ... */ }

  @UseMiddleware('audit')
  @Route({ method: 'POST', path: '/' })
  async create() { /* ... */ }
}

function wireExpressRoutes(container: Container, router: express.Router) {
  const controllers = container.list(ServiceType.Controller);

  for (const registration of controllers) {
    const meta = getControllerMetadata(registration.target);
    if (!meta) continue;

    const instance = container.resolve(registration.target);
    const routes = getControllerRoutes(registration.target);

    for (const { propertyKey, route } of routes) {
      const tokens = [
        ...(meta.middlewares ?? []),
        ...(getActionMiddlewares(registration.target, propertyKey) ?? [])
      ];
      const middlewares = tokens.map((token) => container.resolve(token));

      const handler = instance[propertyKey].bind(instance);
      (router as any)[route.method.toLowerCase()](
        meta.basePath + route.path,
        ...middlewares.map((mw) => mw.handle.bind(mw)),
        handler
      );
    }
  }
}
```

### Controller & Action Metadata in Practice
Use metadata accessors to drive documentation or routing:
- `getControllerMetadata`, `getControllerRoutes`
- `getActionRoute`, `getActionMiddlewares`
- Combine with `discover` to automatically import and register controllers/actions at startup.

### Modular Architecture Patterns
Modules allow feature-centric organization:

```ts
const AuthModule = createModule({
  name: 'AuthModule',
  providers: [AuthService, AuthMiddleware]
});

const UserModule = createModule({
  name: 'UserModule',
  imports: [AuthModule],
  providers: [UserController, UserService]
});

registerModules(container, UserModule);
```

Modules execute once even if registered multiple times, making them safe to aggregate in different bootstraps (tests, CLI, services).

### Nested Containers & Tenant Isolation
Child containers can inherit or override providers selectively:

```ts
const root = getContainer();
root.register(ConfigService, { name: 'config' });

const tenantA = root.createChild({ include: ['config'], exclude: ['payment-gateway'] });
tenantA.register(MockPaymentGateway, { name: 'payment-gateway' });

const tenantB = root.createChild({ include: [PaymentGateway] });

tenantA.resolve('payment-gateway'); // returns MockPaymentGateway
tenantB.resolve(PaymentGateway);    // falls back to root registration
```

### Observability Recipes (Events, Stats, Logging)
Leverage event hooks and stats to feed telemetry pipelines:

```ts
const container = getContainer();

container.on('resolve:success', ({ token, duration }) => {
  metrics.observe('container.resolve.duration', duration, { token });
});

container.on('stats:change', ({ stats, reason }) => {
  logger.debug('container stats updated', { reason, stats });
});

container.enableEventLogging();
```

### Integration Patterns (Workers, CLI, Services)
- **Workers:** create a child container per worker or job execution; include shared infrastructure, override per-job resources.
- **CLI tools:** register command handlers as transient services; resolve per command invocation.
- **Microservices:** keep shared modules (config/logger) in the root container; create tenant-specific child containers with targeted overrides (e.g., payment gateways, feature flags).


## Advanced Topics

### Forward References & Circular Dependency Strategies
- Prefer constructor injection with `ForwardRefInject` when two services call each other.
- If only one direction needs runtime access, use property injection with a setter method to avoid cycles.
- Break structural cycles by splitting responsibilities into interfaces and letting modules bind concrete implementations.

```ts
@Injectable()
class ServiceA {
  constructor(@ForwardRefInject(() => ServiceB) private readonly getB: () => ServiceB) {}
}

@Injectable()
class ServiceB {
  constructor(private readonly serviceA: ServiceA) {}
}
```

### Custom Discovery Strategies
The built-in `discover` helper loads files based on glob patterns. For finer control:
- Implement your own loader that reads metadata (e.g., from manifest files) and dynamically imports modules.
- Combine with `registerModules` to ensure side effects only run once.
- Useful in monorepos where packages expose a discovery contract rather than relying on file-system scanning.

### Extending or Writing Custom Decorators
Decorators are plain functions operating on metadata utilities. To add new semantics:
- Use `Reflect.defineMetadata`/`getMetadata` alongside `metadata.ts` helpers.
- Create a new decorator that writes metadata, then read it within framework adapters or `Container` extensions.
- Ensure decorators do not execute heavy logic at definition time; defer to runtime when resolving or wiring modules.

### Integrating with External Frameworks
- **Express/Fastify**: build adapters that read controller/middleware metadata and map to router methods (see Usage Guides).
- **GraphQL**: treat resolvers as actions; controller metadata can store SDL tags or GraphQL type info via custom metadata keys.
- **Job queues**: map queues to scopes (`runInScope('queue-worker', ...)`) and register worker handlers as scoped services.

### Testing Techniques & Mock Containers
- For unit tests, instantiate a fresh `Container` or use `createChild` to override providers with mocks.
- Use `resetContainer()` in Jest `beforeEach` when relying on the global singleton; it respects async disposals.
- Inspect container stats (`getStats()`) in tests to assert registration/cleanup expectations.

## Tooling & Workflows

### Development Scripts & Linting
- `npm run build` – compiles TypeScript using `tsconfig.build.json` (emits `dist/` without tests).
- `npm run lint` – ESLint flat config over `src/**/*.ts` and `tests/**/*.ts`.
- `npm run format` / `npm run format:check` – Prettier formatting enforcement.
- `npm test` – Jest test suite; respects coverage thresholds when used with the pre-commit hook.
- `npm run test:coverage` – produces HTML/terminal coverage reports.

### Git Hooks & Validation Pipeline
- `.githooks/pre-commit` runs `format`, stages updates, then executes `lint` and `test:coverage`. Install via `npm run hooks:install` (or automatically via `prepare`).
- Hooks ensure every commit maintains formatting, lint hygiene, and coverage ≥ configured thresholds (90/80/90 for statements/functions/lines).
- The hook is async-aware: coverage or lint failures block the commit with clear console output.

### Release Checklist (Versioning, CHANGE_LOG)
1. Bump `package.json` version following SemVer (e.g., `1.0.0` for GA, `1.0.1` for hotfixes, `1.1.0` for feature increments).
2. Update `CHANGE_LOG.md` with a new entry summarizing key changes, motivations, and any migration notes.
3. Update README (if applicable) with new APIs or patterns.
4. Run `npm run lint` + `npm run test:coverage` to verify green pipeline.
5. Publish (e.g., `npm publish`) and tag the release in VCS with the same version number.

> Tip: keep `DEV_NOTES.md` in sync after major changes so future sessions (or teammates) can resume context quickly.

## Migration & Version History

### Semantic Versioning Policy
The project follows SemVer:
- **MAJOR** – breaking API changes (e.g., altering decorator contracts, changing module behavior).
- **MINOR** – backward-compatible feature additions or significant improvements.
- **PATCH** – bug fixes, documentation updates, or tooling adjustments with no API impact.

### Upgrade Notes by Version
- **v1.0.0** (initial release)
  - Complete DI core with constructor/property injection, lifecycle enforcement, and AsyncLocalStorage sessions.
  - Module and discovery helpers for modular architecture.
  - Middleware, controller/action metadata for HTTP adapters.
  - Nested container support with include/exclude inheritance rules.
  - Container statistics, event hooks, and async-aware disposal pipeline.
- For future releases, document migrations here (e.g., new required options, behavior changes, deprecations).

## FAQ

**Q: Do I need to enable TypeScript experimental decorators?**
A: Yes. The package relies on `@Injectable` and other decorators; enable `experimentalDecorators` and `emitDecoratorMetadata` in `tsconfig.json`.

**Q: Can I use this without decorators?**
A: Mostly yes. You can call `container.register` manually and use string tokens. Decorators provide nicer ergonomics and metadata for discovery, but they are optional for basic DI graphs.

**Q: How do I reset the global container between tests?**
A: Call `await resetContainer()` before each test. This ensures async disposals complete and statistics reset.

**Q: How do I build nested graphs (tenant-specific overrides)?**
A: Use `createChild({ include, exclude })` to inherit specific tokens and override others. The child container falls back to the parent according to these rules.

**Q: What happens if dispose throws or returns a promise?**
A: The container catches exceptions and ignores them (to avoid breaking the app), but awaits promises so cleanup completes before sessions/containers close.

## Contributing Guide

1. Fork the repository and create a feature branch.
2. Run `npm install` in the package directory (`cw.api.core.di`).
3. Implement changes with accompanying tests and update README/CHANGE_LOG when applicable.
4. Run `npm run lint`, `npm run test:coverage`, and ensure the git hook passes.
5. Submit a pull request describing the rationale and testing performed.

Coding style follows the ESLint/Prettier configuration in the repo. Keep contributions focused; large features should start with a design discussion in issues.

## License

MIT License © 2025 Mert Kurak. See `LICENSE` for details.
