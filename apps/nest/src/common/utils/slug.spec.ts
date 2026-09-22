import { createSlug } from './slug';

describe('createSlug', () => {
  it('normalizes an ASCII name', () => {
    expect(createSlug('My Vue App', 'project')).toBe('my-vue-app');
  });

  it('uses a random fallback when the name has no ASCII characters', () => {
    expect(createSlug('中文项目', 'project')).toMatch(/^project-[a-f0-9]{6}$/);
  });
});
