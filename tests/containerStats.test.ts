import { Container } from '../src';

describe('Container statistics', () => {
    it('tracks registrations, singletons, sessions and children', async () => {
        const container = new Container();
        const events: Array<{ reason: string; stats: ReturnType<Container['getStats']> }> = [];

        container.on('stats:change', (payload) => {
            if (payload.containerId === container.getId()) {
                events.push({ reason: payload.reason, stats: payload.stats });
            }
        });

        expect(container.getStats()).toEqual({
            registrations: 0,
            singletonInstances: 0,
            activeSessions: 0,
            childContainers: 0
        });

        class Service {}
        container.register(Service);
        expect(container.getStats().registrations).toBe(1);

        container.resolve(Service);
        expect(container.getStats().singletonInstances).toBe(1);

        const session = container.createSession('scope');
        expect(container.getStats().activeSessions).toBe(1);

        await container.destroySession(session.id);
        expect(container.getStats().activeSessions).toBe(0);

        const child = container.createChild();
        expect(container.getStats().childContainers).toBe(1);
        expect(child.getStats().childContainers).toBe(0);

        await container.clear();
        expect(container.getStats()).toEqual({
            registrations: 0,
            singletonInstances: 0,
            activeSessions: 0,
            childContainers: 1
        });

        const reasons = events.map((event) => event.reason);
        expect(reasons).toEqual([
            'register',
            'singleton:init',
            'session:create',
            'session:destroy',
            'child:create',
            'clear'
        ]);
    });
});
