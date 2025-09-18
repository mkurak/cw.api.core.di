import { getContainer } from '../src/instance';

describe('Singleton container', () => {
    it('returns same instance across calls', () => {
        const a = getContainer();
        const b = getContainer();
        expect(a).toBe(b);
    });
});
