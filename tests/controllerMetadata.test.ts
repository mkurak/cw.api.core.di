import 'reflect-metadata';
import {
    Controller,
    Route,
    Injectable,
    ServiceType,
    UseMiddleware,
    getControllerMetadata,
    getActionRoute,
    getActionMiddlewares,
    getContainer,
    resetContainer
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

    it('captures action route metadata and middlewares', () => {
        @Route({ method: 'GET', path: '/' })
        @UseMiddleware('auth.guard')
        @Injectable({ type: ServiceType.Action })
        class ListUsersAction {
            handle() {}
        }

        const route = getActionRoute(ListUsersAction);
        expect(route).toEqual({
            method: 'GET',
            path: '/',
            name: undefined,
            summary: undefined,
            description: undefined
        });

        const middlewares = getActionMiddlewares(ListUsersAction);
        expect(middlewares).toEqual(['auth.guard']);
    });

    it('normalizes controller and route paths', () => {
        @Controller({ basePath: 'accounts' })
        class AccountController {}

        @Route({ method: 'POST', path: 'create' })
        @Injectable({ type: ServiceType.Action })
        class CreateAccountAction {
            handle() {}
        }

        expect(getControllerMetadata(AccountController)?.basePath).toBe('/accounts');
        expect(getActionRoute(CreateAccountAction)?.path).toBe('/create');
    });
});
