import { describe, expect, test } from 'bun:test';

import { createCliProvider } from './createCliProvider.js';

describe('createCliProvider', () => {
  test('publishes all APM command paths through one thin provider', () => {
    const provider = createCliProvider('0.0.0');

    expect(provider.id).toBe('@ankhorage/apm');
    expect(provider.category).toBe('apm');
    expect(provider.commands.map((command) => command.path.join(' '))).toEqual([
      'status',
      'plan',
      'apply',
      'verify',
    ]);
    expect(provider.handlers).toHaveLength(4);
  });
});
