import { readFile } from 'node:fs/promises';

import { isMissingPathError, pathExists, writeJsonFileAtomic } from '@ankhorage/utility/node/fs';

import type { ApmApplyJournalPort } from '../../../../types/apply.js';
import { parseApplyJournal } from '../../domain/parseApplyJournal.js';
import { applyStatePaths } from '../../utils/applyStatePaths.js';

/*** Create the Node durable journal adapter backed by project-local `.apm/operations`. */
export function createNodeApplyJournalPort(): ApmApplyJournalPort {
  return {
    createAsync: async (journal) => {
      const { journalPath } = applyStatePaths(journal.rootPath, journal.operationId);
      if (await pathExists(journalPath)) {
        throw new Error(`Apply journal already exists for operation '${journal.operationId}'.`);
      }
      await writeJsonFileAtomic(journalPath, journal);
    },
    readAsync: readJournalAsync,
    writeAsync: async (journal) => {
      const { journalPath } = applyStatePaths(journal.rootPath, journal.operationId);
      await writeJsonFileAtomic(journalPath, journal);
    },
  };
}

/*** Read and validate one durable journal without trusting arbitrary JSON from disk. */
async function readJournalAsync(rootPath: string, operationId: string) {
  const { journalPath } = applyStatePaths(rootPath, operationId);
  try {
    const content = await readFile(journalPath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    return parseApplyJournal(parsed);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
