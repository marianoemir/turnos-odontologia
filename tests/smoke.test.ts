import { FOUNDATION_PLACEHOLDER } from '../src/index';

describe('foundation smoke', () => {
  it('carga la base del proyecto', () => {
    expect(FOUNDATION_PLACEHOLDER).toBe('c-01-foundation-setup');
  });
});
