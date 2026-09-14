import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { runAsync } from './runAsync.js';

describe('runAsync', () => {
  test('runs real status and returns incomplete when lock evidence is absent', async () => {
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
      const output = stdout.join('');

      expect(exitCode).toBe(2);
      expect(stderr).toEqual([]);
      expect(output).toContain('"operation": "status"');
      expect(output).toContain('"complete": false');
      expect(output).toContain('"status.lockfile.missing"');
      expect(output).toContain('"npm"');
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
