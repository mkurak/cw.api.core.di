import * as api from '../src';

describe('Public API surface', () => {
    it('exposes expected exports', () => {
        expect(typeof api.Injectable).toBe('function');
        expect(typeof api.Inject).toBe('function');
        expect(typeof api.Optional).toBe('function');
        expect(typeof api.RouteMiddleware).toBe('function');
        expect(typeof api.GlobalMiddleware).toBe('function');
        expect(typeof api.UseMiddleware).toBe('function');
        expect(typeof api.ForwardRefInject).toBe('function');
        expect(typeof api.getActionMiddlewares).toBe('function');
        expect(typeof api.getControllerRoutes).toBe('function');
        expect(typeof api.getMiddlewareMetadata).toBe('function');
        expect(typeof api.forwardRef).toBe('function');
        expect(Object.values(api.ServiceType)).toContain('entity');
        expect(Object.values(api.ServiceType)).toContain('middleware');
    });
});
