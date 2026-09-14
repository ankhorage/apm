import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isRecord } from '@ankhorage/utility/object';
import { parse as parseYaml } from 'yaml';

import type {
  ApmManagerInspectionInput,
  ApmManagerLockEvidence,
} from '../../../../types/status-inventory.js';
import { parseYarnLockEvidence } from './parseYarnLockEvidence.js';

/*** Read Yarn Berry v8 lock evidence without loading PnP runtime code. */
export async function readYarnLockEvidenceAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerLockEvidence> {
  const candidate = input.root.lockfileCandidates.find((item) => item.manager === 'yarn');
  if (candidate === undefined) {
    return incompleteYarnLock(input.root.id, 'missing', 'Selected Yarn root has no yarn.lock.');
  }
  const parsed = parseYaml(
    await readFile(path.join(input.root.rootPath, 'yarn.lock'), 'utf8'),
  ) as unknown;
  const metadata = isRecord(parsed) && isRecord(parsed.__metadata) ? parsed.__metadata : undefined;
  const version = metadata?.version;
  if (!isRecord(parsed) || (version !== 8 && version !== '8')) {
    return incompleteYarnLock(
      input.root.id,
      'unsupported',
      'APM status supports Yarn Berry lock metadata version 8; Yarn Classic is inspection-only.',
      candidate.path,
      version,
    );
  }
  return parseYarnLockEvidence({ managerInput: input, lockPath: candidate.path, parsed });
}

/*** Return explicit missing/unsupported Yarn lock evidence with the observed format version. */
function incompleteYarnLock(
  rootId: string,
  state: 'missing' | 'unsupported',
  reason: string,
  lockPath = 'yarn.lock',
  version?: unknown,
): ApmManagerLockEvidence {
  const serializedVersion =
    typeof version === 'string' || typeof version === 'number' ? String(version) : undefined;
  return {
    lockfile: {
      state,
      path: lockPath,
      format: 'yarn-lock',
      ...(serializedVersion === undefined ? {} : { version: serializedVersion }),
      evidence: [lockPath],
    },
    lockedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code:
          state === 'missing'
            ? 'status.lockfile.missing'
            : 'status.lockfile.yarn.unsupported-version',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence:
          serializedVersion === undefined
            ? [lockPath]
            : [`${lockPath}: metadata version ${serializedVersion}`],
        reason,
        nextAction: 'Use a supported Yarn Berry v8 lock or keep status inspection-only.',
      },
    ],
  };
}
