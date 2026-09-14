import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { runAsync } from './runAsync.js';

describe('runAsync', () => {
  test('runs the real status operation and renders JSON', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-status-'));
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      await writeFile(
        path.join(rootPath, 'package.json'),
        JSON.stringify({ name: 'fixture', packageManager: 'npm@11.6.0' }),
      );
      const exitCode = await runAsync(['status', rootPath, '--json'], {
        cwd: rootPath,
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout.join('')).toContain('"operation": "status"');
      expect(stdout.join('')).toContain('"npm"');
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  test('returns a distinct non-success exit code for reserved operations', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runAsync(['plan', '--json'], {
      cwd: '.',
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    });

    expect(exitCode).toBe(3);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('"status": "unavailable"');
  });
});
