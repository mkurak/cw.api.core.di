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
  - Nested Containers & Tenant Isolation
  - Observability Recipes (Events, Stats, Logging)
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
