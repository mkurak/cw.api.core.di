import {
    RouteMiddleware,
    GlobalMiddleware,
    Injectable,
    UseMiddleware,
    ServiceType,
    Lifecycle,
    getActionMiddlewares,
    getMiddlewareMetadata
} from '../src';
import { getContainer, resetContainer } from '../src/instance';
import { MiddlewareHandler } from '../src/types';

describe('Middleware decorators', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('registers route middleware with metadata and handle contract', () => {
        @RouteMiddleware({ order: 2 })
        class LoggingMiddleware implements MiddlewareHandler {
            handle(): void {}
        }

        const meta = getMiddlewareMetadata(
            LoggingMiddleware as unknown as typeof LoggingMiddleware
        );
        expect(meta).toEqual({ scope: 'route', order: 2 });
    });

    it('registers global middleware with explicit order', () => {
        @GlobalMiddleware({ order: 10 })
        class AuthMiddleware implements MiddlewareHandler {
            handle(): void {}
        }

        const meta = getMiddlewareMetadata(AuthMiddleware as unknown as typeof AuthMiddleware);
        expect(meta).toEqual({ scope: 'global', order: 10 });
    });

    it('throws if middleware lacks handle method', () => {
        expect(() => {
            @RouteMiddleware()
            class BrokenMiddleware {}

            return BrokenMiddleware;
        }).toThrow(/handle method/);
    });

    it('collects action middlewares from options and decorator', () => {
        const LOCAL_TOKEN = 'localMiddleware';
        const EXTRA_TOKEN = 'extraMiddleware';

        @Injectable({ type: ServiceType.Middleware, name: LOCAL_TOKEN })
        class LocalMiddleware implements MiddlewareHandler {
            handle(): void {}
        }
        void LocalMiddleware;

        @Injectable({ type: ServiceType.Middleware, name: EXTRA_TOKEN })
        class ExtraMiddleware implements MiddlewareHandler {
            handle(): void {}
        }
        void ExtraMiddleware;

        @UseMiddleware(EXTRA_TOKEN)
        @Injectable({ type: ServiceType.Action, middlewares: [LOCAL_TOKEN] })
        class ActionWithMiddleware {}

        const middlewares = getActionMiddlewares(
            ActionWithMiddleware as unknown as typeof ActionWithMiddleware
        );

        expect(middlewares).toEqual([LOCAL_TOKEN, EXTRA_TOKEN]);
    });

    it('defaults middleware lifecycle to transient', () => {
        const NAME = 'mw-default';

        @RouteMiddleware({ name: NAME })
        class DefaultMiddleware implements MiddlewareHandler {
            handle(): void {}
        }
        void DefaultMiddleware;

        const registration = getContainer()
            .list(ServiceType.Middleware)
            .find((entry) => entry.token === NAME);

        expect(registration?.lifecycle).toBe(Lifecycle.Transient);
    });
});
