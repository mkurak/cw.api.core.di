import { Container, Lifecycle, ServiceType } from '../src';

class RootService {
    value = 'root';
}

class ChildOverrideService extends RootService {
    value = 'child';
}

describe('Nested container hierarchy', () => {
    it('falls back to parent registrations when missing locally', () => {
        const parent = new Container();
        parent.register(RootService);

        const child = parent.createChild();
        const resolved = child.resolve(RootService);

        expect(resolved).toBeInstanceOf(RootService);
        expect(resolved.value).toBe('root');
        expect(resolved).toBe(parent.resolve(RootService));
    });

    it('allows overriding parent registration in child', () => {
        const parent = new Container();
        parent.register(RootService, { name: 'service' });

        const child = parent.createChild();
        child.register(ChildOverrideService, { name: 'service' });

        const childResolved = child.resolve<RootService>('service');
        expect(childResolved).toBeInstanceOf(ChildOverrideService);
        expect(childResolved.value).toBe('child');

        const parentResolved = parent.resolve<RootService>('service');
        expect(parentResolved).toBeInstanceOf(RootService);
        expect(parentResolved.value).toBe('root');
    });

    it('merges list results with child overriding parent tokens', () => {
        const parent = new Container();
        parent.register(RootService, { name: 'service' });

        const child = parent.createChild();
        child.register(ChildOverrideService, { name: 'service' });

        const services = child.list(ServiceType.Service);
        const names = services.map((s) => s.target);
        expect(names).toContain(ChildOverrideService);
        expect(names).not.toContain(RootService);
    });

    it('propagates events to parent listeners', () => {
        const parent = new Container();
        parent.register(RootService);
        const child = parent.createChild();

        const calls: string[] = [];
        parent.on('resolve:start', (payload) => {
            calls.push(payload.token);
        });

        child.resolve(RootService);

        expect(calls).toEqual(['RootService']);
    });

    it('supports child-only registrations with scoped lifecycle', async () => {
        const parent = new Container();
        const child = parent.createChild();

        class ScopedService {
            id = Math.random();
        }

        child.register(ScopedService, { lifecycle: Lifecycle.Scoped, name: 'scoped-service' });

        const session = child.createSession();
        const a = child.resolve<ScopedService>('scoped-service', { sessionId: session.id });
        const b = child.resolve<ScopedService>('scoped-service', { sessionId: session.id });
        expect(a).toBe(b);
        await child.destroySession(session.id);
    });

    it('honours include allow list when falling back to parent', () => {
        const parent = new Container();
        parent.register(RootService, { name: 'root-service' });
        parent.register(ChildOverrideService, { name: 'secondary' });

        const child = parent.createChild({ include: ['root-service'] });

        const resolved = child.resolve<RootService>('root-service');
        expect(resolved.value).toBe('root');

        expect(() => child.resolve('secondary')).toThrow(/not available/);
    });

    it('blocks excluded tokens from parent fallback', () => {
        const parent = new Container();

        class DbConnection {
            connect(): void {}
        }

        class CacheService {}

        parent.register(DbConnection, { name: 'db' });
        parent.register(CacheService, { name: 'cache' });

        const child = parent.createChild({ exclude: ['db'] });

        expect(child.resolve('cache')).toBeInstanceOf(CacheService);
        expect(() => child.resolve('db')).toThrow(/not available/);
    });

    it('filters parent list results based on inheritance rules', () => {
        const parent = new Container();

        class MetricsService {}

        parent.register(RootService, { name: 'root-service' });
        parent.register(MetricsService, { name: 'metrics' });

        const child = parent.createChild({ include: ['metrics'], exclude: ['root-service'] });

        const services = child.list(ServiceType.Service);
        const tokens = services.map((registration) => registration.token);
        expect(tokens).toContain('metrics');
        expect(tokens).not.toContain('root-service');
    });
});
