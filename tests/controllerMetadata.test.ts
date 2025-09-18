import 'reflect-metadata';
import {
    Controller,
    Route,
    UseMiddleware,
    getControllerMetadata,
    getActionRoute,
    getActionMiddlewares,
    getControllerRoutes,
    getContainer,
    resetContainer,
    ServiceType
} from '../src';

describe('Controller and route metadata', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('captures controller metadata and registers controller', () => {
        @Controller({ basePath: '/users', tags: ['Users'], middlewares: ['auth.guard'] })
        class UserController {}

        const container = getContainer();
        const controllerReg = container
            .list(ServiceType.Controller)
            .find((reg) => reg.target === UserController);
        expect(controllerReg).toBeDefined();

        const meta = getControllerMetadata(UserController);
        expect(meta).toEqual({ basePath: '/users', middlewares: ['auth.guard'], tags: ['Users'] });
    });

    it('captures route metadata and method-scoped middlewares', () => {
        @Controller({ basePath: '/users' })
        class UserController {
            @UseMiddleware('auth.guard')
            @Route({ method: 'GET', path: '/' })
            listUsers(): void {}
        }

        const route = getActionRoute(UserController, 'listUsers');
        expect(route).toEqual({
            method: 'GET',
            path: '/',
            name: undefined,
            summary: undefined,
            description: undefined
        });

        const middlewares = getActionMiddlewares(UserController, 'listUsers');
        expect(middlewares).toEqual(['auth.guard']);

        const routes = getControllerRoutes(UserController);
        expect(routes).toEqual([
            {
                propertyKey: 'listUsers',
                route: {
                    method: 'GET',
                    path: '/',
                    name: undefined,
                    summary: undefined,
                    description: undefined
                }
            }
        ]);
    });

    it('normalizes controller and route paths', () => {
        @Controller({ basePath: 'accounts' })
        class AccountController {
            @Route({ method: 'POST', path: 'create' })
            createAccount(): void {}
        }

        expect(getControllerMetadata(AccountController)?.basePath).toBe('/accounts');
        expect(getActionRoute(AccountController, 'createAccount')?.path).toBe('/create');
    });

    it('throws when reading route metadata from a non-controller class', () => {
        class PlainClass {
            @Route({ method: 'GET', path: '/' })
            handler(): void {}
        }

        expect(() => getActionRoute(PlainClass as unknown as typeof PlainClass, 'handler')).toThrow(
            /@Controller/
        );
    });
});
