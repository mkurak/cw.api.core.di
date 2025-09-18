import {
    RouteMiddleware,
    GlobalMiddleware,
    Injectable,
    UseMiddleware,
    ServiceType,
    Lifecycle,
    getActionMiddlewares,
    getMiddlewareMetadata,
    Controller,
    Route,
    getControllerMetadata
} from '../src';
import { getContainer, resetContainer } from '../src/instance';
import { MiddlewareHandler } from '../src/types';

describe('Middleware decorators', () => {
    beforeEach(async () => {
        await resetContainer();
    });

    it('registers route middleware with metadata and handle contract', () => {
        @RouteMiddleware({ order: 2 })
        class LoggingMiddleware implements MiddlewareHandler {
            handle(): void {}
        }

        const meta = getMiddlewareMetadata(
            LoggingMiddleware as unknown as typeof LoggingMiddleware
        );
        expect(meta).toMatchObject({ scope: 'route', order: 2 });
    });

    it('registers global middleware with explicit order/phase', () => {
        @GlobalMiddleware({ order: 10, phase: 'before' })
        class AuthMiddleware implements MiddlewareHandler {
            handle(): void {}
        }

        const meta = getMiddlewareMetadata(AuthMiddleware as unknown as typeof AuthMiddleware);
        expect(meta).toEqual({ scope: 'global', order: 10, phase: 'before' });
    });

    it('requires phase for global middleware', () => {
        expect(() => {
            @GlobalMiddleware()
            class InvalidMiddleware implements MiddlewareHandler {
                handle(): void {}
            }

            return InvalidMiddleware;
        }).toThrow(/phase/);
    });

    it('throws if middleware lacks handle method', () => {
        expect(() => {
            @RouteMiddleware()
            class BrokenMiddleware {}

            return BrokenMiddleware;
        }).toThrow(/handle method/);
    });

    it('collects route middlewares via decorator and controller options', () => {
        const CONTROLLER_TOKEN = 'controller.middleware';
        const ROUTE_TOKEN = 'route.middleware';

        @Injectable({ type: ServiceType.Middleware, name: CONTROLLER_TOKEN })
        class ControllerMiddleware implements MiddlewareHandler {
            handle(): void {}
        }
        void ControllerMiddleware;

        @Injectable({ type: ServiceType.Middleware, name: ROUTE_TOKEN })
        class RouteSpecificMiddleware implements MiddlewareHandler {
            handle(): void {}
        }
        void RouteSpecificMiddleware;

        @Controller({ basePath: '/demo', middlewares: [CONTROLLER_TOKEN] })
        class DemoController {
            @UseMiddleware(ROUTE_TOKEN)
            @Route({ method: 'GET', path: '/' })
            handler(): void {}
        }

        expect(getControllerMetadata(DemoController)?.middlewares).toEqual([CONTROLLER_TOKEN]);
        expect(getActionMiddlewares(DemoController, 'handler')).toEqual([ROUTE_TOKEN]);
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
