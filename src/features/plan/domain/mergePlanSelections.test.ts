import { expect, test } from 'bun:test';

import type { ApmPlanPackageSelection, ApmPlanPolicy } from '../../../types/plan.js';
import { mergePlanSelections } from './mergePlanSelections.js';

const BASE_POLICY: ApmPlanPolicy = {
  dependencyUpdates: 'safe',
  selections: [],
  repairInstallations: true,
  repairProjections: true,
  maxGeneratorIterations: 4,
};

const REQUIRED_SELECTION: ApmPlanPackageSelection = {
  selector: { name: '@framework/core', installRootId: '.', ownerPath: 'package.json' },
  target: { kind: 'version', version: '2.0.0', manifestRange: '^2.0.0' },
};

test('adds one owner-required selection and then converges on the same requirement', () => {
  const first = mergePlanSelections(BASE_POLICY, [REQUIRED_SELECTION]);
  const second = mergePlanSelections(first.policy, [REQUIRED_SELECTION]);

  expect(first.changed).toBe(true);
  expect(first.blockers).toEqual([]);
  expect(first.policy.selections).toEqual([REQUIRED_SELECTION]);
  expect(second.changed).toBe(false);
  expect(second.blockers).toEqual([]);
});

test('blocks owner requirements that conflict with an explicit existing target', () => {
  const existing: ApmPlanPackageSelection = {
    ...REQUIRED_SELECTION,
    target: { kind: 'version', version: '1.9.0', manifestRange: '^1.9.0' },
  };
  const result = mergePlanSelections({ ...BASE_POLICY, selections: [existing] }, [
    REQUIRED_SELECTION,
  ]);

  expect(result.changed).toBe(false);
  expect(result.blockers.map(({ code }) => code)).toEqual(['plan.generator-selection-conflict']);
});

test('blocks package-owned dependency requirements when dependency updates are disabled', () => {
  const result = mergePlanSelections({ ...BASE_POLICY, dependencyUpdates: 'none' }, [
    REQUIRED_SELECTION,
  ]);

  expect(result.changed).toBe(false);
  expect(result.blockers.map(({ code }) => code)).toEqual(['plan.generator-selection-conflict']);
});
