import { Injectable, Inject, Optional } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle } from '../src/types';

describe('Constructor injection', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('auto-resolves dependencies by constructor types', () => {
        @Injectable()
        class Repository {
            id = Math.random();
        }

        @Injectable()
        class Service {
            constructor(public repo: Repository) {}
        }

        const container = getContainer();
        const service = container.resolve(Service);
        expect(service).toBeInstanceOf(Service);
        expect(service.repo).toBeInstanceOf(Repository);
        expect(service.repo).toBe(container.resolve(Repository));
    });

    it('uses @Inject overrides for custom tokens', () => {
        const TOKEN = 'custom-repo';

        @Injectable({ name: TOKEN })
        class CustomRepository {}

        @Injectable()
        class ServiceWithOverride {
            constructor(@Inject(TOKEN) public repo: CustomRepository) {}
        }

        const container = getContainer();
        const service = container.resolve(ServiceWithOverride);
        expect(service.repo).toBeInstanceOf(CustomRepository);
    });

    it('propagates session info to dependencies', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped })
        class ScopedRepo {}

        @Injectable({ lifecycle: Lifecycle.Scoped })
        class ScopedService {
            constructor(public repo: ScopedRepo) {}
        }

        const container = getContainer();
        const session = container.createSession();
        const serviceA = container.resolve<ScopedService>(ScopedService, {
            sessionId: session.id
        });
        const repoA = container.resolve<ScopedRepo>(ScopedRepo, { sessionId: session.id });
        expect(serviceA.repo).toBe(repoA);
        container.destroySession(session.id);
    });

    it('throws when dependency cannot be inferred', () => {
        @Injectable()
        class MissingDependency {}

        @Injectable()
        class Consumer {
            constructor(
                public value: unknown,
                private dep: MissingDependency
            ) {}
        }

        const container = getContainer();
        expect(() => container.resolve(Consumer)).toThrow('Cannot resolve constructor parameter');
    });

    it('allows optional parameters to resolve as undefined', () => {
        class OptionalDependency {}

        @Injectable({ lifecycle: Lifecycle.Transient })
        class OptionalService {
            constructor(@Optional() public dep?: OptionalDependency) {}
        }

        const container = getContainer();
        const service = container.resolve(OptionalService);
        expect(service.dep).toBeUndefined();

        container.register(OptionalDependency as unknown as typeof OptionalDependency, {
            lifecycle: Lifecycle.Singleton
        });
        const serviceWithDep = container.resolve(OptionalService);
        expect(serviceWithDep.dep).toBeInstanceOf(OptionalDependency);
    });

    it('injects properties decorated with @Inject', () => {
        const TOKEN = 'logger';

        @Injectable({ name: TOKEN })
        class Logger {}

        @Injectable()
        class Controller {
            @Inject(TOKEN)
            public logger!: Logger;
        }

        const container = getContainer();
        const controller = container.resolve(Controller);
        expect(controller.logger).toBeInstanceOf(Logger);
    });
});
