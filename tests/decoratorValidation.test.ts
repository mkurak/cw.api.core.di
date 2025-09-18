import 'reflect-metadata';
import {
    Controller,
    Route,
    UseMiddleware,
    getActionMiddlewares,
    getActionRoute,
    getControllerRoutes
} from '../src';
import { resetContainer } from '../src/instance';

describe('Decorator validation', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('@UseMiddleware requires a valid method name', () => {
        const decorator = UseMiddleware('token');
        expect(() =>
            decorator(
                { constructor: class MockController {} } as never,
                undefined as never,
                {
                    value(): void {}
                } as PropertyDescriptor
            )
        ).toThrow(/methods/);
    });

    it('@UseMiddleware rejects non-function descriptors', () => {
        const decorator = UseMiddleware('token');
        expect(() =>
            decorator({ constructor: class MockController {} } as never, 'handler', {
                value: 42
            } as unknown as PropertyDescriptor)
        ).toThrow(/instance methods/);
    });

    it('@Route enforces method decorators with callable descriptors', () => {
        const decorator = Route({ method: 'GET', path: '/' });

        expect(() =>
            decorator(
                { constructor: class MockController {} } as never,
                undefined as never,
                {
                    value(): void {}
                } as PropertyDescriptor
            )
        ).toThrow(/controller methods/);

        expect(() =>
            decorator({ constructor: class MockController {} } as never, 'handler', {
                value: 42
            } as unknown as PropertyDescriptor)
        ).toThrow(/instance methods/);
    });

    it('skips middleware metadata when no tokens are provided', () => {
        @Controller({ basePath: '/demo' })
        class DemoController {
            @UseMiddleware()
            @Route({ method: 'GET', path: '/' })
            handler(): void {}
        }

        expect(getActionMiddlewares(DemoController, 'handler')).toBeUndefined();
    });

    it('returns empty route list for controllers without routes', () => {
        @Controller({ basePath: '/demo' })
        class EmptyController {}

        expect(getControllerRoutes(EmptyController)).toEqual([]);
        expect(getActionRoute(EmptyController, 'missing')).toBeUndefined();
    });
});
