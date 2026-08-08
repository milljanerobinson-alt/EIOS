import { describe, expect, it } from 'vitest';
import { isEiosRoute, isLlndRoute } from '../lib/productContext';

describe('LLND Automate product boundary', () => {
  it.each([
    '#/home',
    '#/pricing',
    '#/signup',
    '#/llnd-automate/login',
    '#/assessment/dashboard',
    '#/trainer/dashboard',
    '#/platform/dashboard',
  ])('classifies %s as LLND', (route) => {
    expect(isLlndRoute(route)).toBe(true);
    expect(isEiosRoute(route)).toBe(false);
  });

  it.each(['#/login', '#/oauth/consent', '#/engineering/mission-control'])(
    'classifies %s as EIOS',
    (route) => {
      expect(isEiosRoute(route)).toBe(true);
      expect(isLlndRoute(route)).toBe(false);
    },
  );
});
