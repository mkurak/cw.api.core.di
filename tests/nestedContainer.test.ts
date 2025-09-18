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
});
