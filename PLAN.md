### Plan

1. Scaffold the package: init npm, TypeScript, Jest, ESLint/Prettier.
2. Design DI container API ensuring singleton behaviour across consumers.
3. Implement decorators, lifecycle handling (singleton/scoped/transient), session management, registration lists, discovery.
4. Build tests covering registration, resolution, scoped sessions, discovery, and integration scenario (entities/controllers).

### Upcoming Enhancements

1. ✅ Add scope context API (`runInScope`, named scopes) to streamline scoped lifecycle usage.
2. ✅ Introduce module/bundle registration system for grouping related services.
3. ✅ Extend controller/action metadata with route definitions (auto router wiring will live in Express pkg).
4. Provide container events/logging for resolution traces and debugging.
5. Support async `dispose` when tearing down scoped/singleton services.
6. Allow property injection to be marked optional similar to constructor parameters.
7. Explore nested (child) containers for hierarchical overrides.
