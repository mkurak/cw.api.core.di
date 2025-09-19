import 'reflect-metadata';
import { Container, Lifecycle, type ContainerLogEntry } from '../src';
import { jest } from '@jest/globals';
import { logger } from '../src/logger.js';

class DependencyService {}

class RootService {
    constructor(public readonly dependency: DependencyService) {}
}

Reflect.defineMetadata('design:paramtypes', [DependencyService], RootService);

describe('Container events & logging', () => {
    it('yayınlanmış olaylarla çözümleme sürecini izler', () => {
        const container = new Container();
        container.register(DependencyService);
        container.register(RootService);

        const starts: string[] = [];
        const successes: Array<{ token: string; cached: boolean }> = [];
        const instantiates: string[] = [];

        container.on('resolve:start', (payload) => {
            starts.push(payload.path.join(' -> '));
        });
        container.on('resolve:success', (payload) => {
            successes.push({ token: payload.token, cached: payload.cached });
        });
        container.on('instantiate', (payload) => {
            instantiates.push(payload.token);
        });

        const first = container.resolve(RootService);
        expect(first).toBeInstanceOf(RootService);

        expect(starts).toEqual(['RootService', 'RootService -> DependencyService']);
        expect(successes).toEqual([
            { token: 'DependencyService', cached: false },
            { token: 'RootService', cached: false }
        ]);
        expect(instantiates).toEqual(['DependencyService', 'RootService']);

        const second = container.resolve(RootService);
        expect(second).toBe(first);
        expect(successes[successes.length - 1]).toMatchObject({
            token: 'RootService',
            cached: true
        });
    });

    it('hatalı çözümlemelerde resolve:error olayı üretir', () => {
        const container = new Container();
        container.register(RootService);

        const errors: string[] = [];
        container.on('resolve:error', (payload) => {
            errors.push(`${payload.token}:${payload.error.message}`);
        });

        expect(() => container.resolve(RootService)).toThrow(/No registration found for token/);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('RootService');
    });

    it('scoped servisler oturum sonlanınca dispose olayı yayınlar', async () => {
        class ScopedService {}

        const container = new Container();
        container.register(ScopedService, { lifecycle: Lifecycle.Scoped });

        const disposes: Array<{ token: string; sessionId?: string; scope?: string }> = [];
        container.on('dispose', (payload) => {
            disposes.push({
                token: payload.token,
                sessionId: payload.sessionId,
                scope: payload.scope
            });
        });

        await container.runInScope('request', () => {
            const instance = container.resolve(ScopedService);
            expect(instance).toBeInstanceOf(ScopedService);
        });

        expect(disposes).toHaveLength(1);
        expect(disposes[0]).toMatchObject({ token: 'ScopedService', scope: 'request' });
    });

    it('enableEventLogging ile olaylar günlüklenebilir', () => {
        const container = new Container();
        container.register(DependencyService);
        container.register(RootService);

        const entries: ContainerLogEntry[] = [];
        const detach = container.enableEventLogging({ sink: (entry) => entries.push(entry) });

        container.resolve(RootService);
        expect(entries.some((entry) => entry.event === 'resolve:start')).toBe(true);
        detach();

        const loggedCount = entries.length;
        container.resolve(RootService);
        expect(entries).toHaveLength(loggedCount);
    });

    it('default trace sink yazma yollarını tetikler', async () => {
        const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
        const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
        const successSpy = jest.spyOn(logger, 'success').mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
        const container = new Container();
        container.register(DependencyService);
        container.register(RootService);

        const detach = container.enableEventLogging();

        await container.runInScope('default-log', async () => {
            container.resolve(RootService);
        });

        try {
            container.resolve('missing-token');
        } catch {
            // beklenen hata, log kaydını tetikliyor
        }

        detach();

        const totalCalls =
            debugSpy.mock.calls.length +
            infoSpy.mock.calls.length +
            successSpy.mock.calls.length +
            errorSpy.mock.calls.length;

        expect(totalCalls).toBeGreaterThan(0);

        debugSpy.mockRestore();
        infoSpy.mockRestore();
        successSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
