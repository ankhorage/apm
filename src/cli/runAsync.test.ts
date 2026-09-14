import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { runAsync } from './runAsync.js';

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

test('apply resume reports a missing durable operation as blocked', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-apply-'));
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    const exitCode = await runAsync(
      ['apply', '--resume', 'missing-operation', rootPath, '--json'],
      {
        cwd: rootPath,
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
      },
    );
    const output = stdout.join('');
    expect(exitCode).toBe(2);
    expect(stderr).toEqual([]);
    expect(output).toContain('"operation": "apply"');
    expect(output).toContain('"status": "blocked"');
    expect(output).toContain('"apply.operation-not-found"');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('verify reports a missing durable operation as unverified', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-verify-'));
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    const exitCode = await runAsync(
      ['verify', '--operation', 'missing-operation', rootPath, '--json'],
      {
        cwd: rootPath,
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
      },
    );
    const output = stdout.join('');
    expect(exitCode).toBe(2);
    expect(stderr).toEqual([]);
    expect(output).toContain('"operation": "verify"');
    expect(output).toContain('"verified": false');
    expect(output).toContain('"operation:journal"');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('plan CLI returns a blocked serializable plan without mutating incomplete projects', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-plan-'));
  const manifestPath = path.join(rootPath, 'package.json');
  const manifest = JSON.stringify({ name: 'fixture', packageManager: 'npm@11.6.0' });
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    await writeFile(manifestPath, manifest);
    const exitCode = await runAsync(['plan', rootPath, '--json', '--offline'], {
      cwd: rootPath,
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    });
    const output = stdout.join('');

    expect(exitCode).toBe(2);
    expect(stderr).toEqual([]);
    expect(output).toContain('"operation": "plan"');
    expect(output).toContain('"complete": false');
    expect(output).toContain('"plan.status-incomplete"');
    expect(await readFile(manifestPath, 'utf8')).toBe(manifest);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
