import { Page, test } from '@playwright/test';
import { runRegressionCase } from '../helpers/run_regression_case';
import { TestCase } from '../config/testcases';
import { LifecycleState, lifecycleLabel } from '../config/lifecycles';

const RUN_TIMEOUT_MS = 600_000;

export async function runSourceLifecycle(
  page: Page,
  sourceName: string,
  lifecycle: LifecycleState,
  stageKey: string,
  rest: Omit<TestCase, 'scenarioName' | 'sources' | 'lifecycle'> = {}
) {
  test.setTimeout(RUN_TIMEOUT_MS);
  test.skip(!stageKey.trim(), `Set STAGE_KEY at the top of this file to run ${sourceName} ${lifecycle}.`);

  await runRegressionCase(page, {
    scenarioName: `${stageKey}_${lifecycleLabel(lifecycle)}`,
    lifecycle,
    sources: [{ name: sourceName, stageKey }],
    ...rest,
  });
}
