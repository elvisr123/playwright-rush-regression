import { Page, test } from '@playwright/test';
import { runRegressionCase } from '../helpers/run_regression_case';
import { TestCase } from '../config/testcases';
import { LifecycleState, lifecycleLabel } from '../config/lifecycles';
import { resolveUploadFolderUrl } from '../config/batch';

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

  // Reports for the 2026-11-06 batch go to the single Evidence_Nov_11_2026
  // folder the user gave, instead of uploadReportForSource's per-source
  // subfolder routing. Resolved here rather than per-spec so all 16 specs
  // pick it up without a further edit each, and it returns undefined — i.e.
  // normal routing — for any run that isn't part of the batch.
  const uploadFolderUrl = resolveUploadFolderUrl(sourceName, lifecycle);

  await runRegressionCase(
    page,
    {
      scenarioName: `${stageKey}_${lifecycleLabel(lifecycle)}`,
      lifecycle,
      sources: [{ name: sourceName, stageKey }],
      ...rest,
    },
    undefined, // no creation evidence — sandbox screenshots only, per the user
    uploadFolderUrl
  );
}
