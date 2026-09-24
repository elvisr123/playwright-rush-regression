// Minimal SailPoint ISC (IdentityNow) v3 API client for triggering source
// aggregation programmatically — closes the gap this pipeline has always
// left manual (see AGENTS.md: "SailPoint source aggregation... is a
// separate, not-yet-built phase"). Uses OAuth2 client-credentials, the
// standard auth pattern for SailPoint ISC API clients/Personal Access
// Tokens. Uses Node's built-in fetch (stable since Node 18+) — no new
// dependency, matches nothing else in this codebase using a different HTTP
// client.
//
// IMPORTANT — not verified against live SailPoint API docs: the
// aggregation-trigger path (AGGREGATE_PATH below) and the task-status
// response shape (TaskStatus) are both based on recollection of SailPoint's
// v3 API, not confirmed live. If the first real call 404s or the response
// shape doesn't match, check https://developer.sailpoint.com/docs/api/v3
// (search "load accounts" / "aggregate" under Sources or Accounts) and
// update the constant / types below — everything else in this file
// (auth, source lookup, polling loop) is independent of that one detail.

interface SailPointConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

function config(): SailPointConfig {
  const { SAILPOINT_BASE_URL, SAILPOINT_CLIENT_ID, SAILPOINT_CLIENT_SECRET } = process.env;
  if (!SAILPOINT_BASE_URL || !SAILPOINT_CLIENT_ID || !SAILPOINT_CLIENT_SECRET) {
    throw new Error(
      'Missing SAILPOINT_BASE_URL / SAILPOINT_CLIENT_ID / SAILPOINT_CLIENT_SECRET in .env — required for aggregation automation.'
    );
  }
  return {
    baseUrl: SAILPOINT_BASE_URL.replace(/\/+$/, ''),
    clientId: SAILPOINT_CLIENT_ID,
    clientSecret: SAILPOINT_CLIENT_SECRET,
  };
}

/** Non-throwing check for callers that want to skip aggregation entirely when it isn't set up. */
export function isSailPointConfigured(): boolean {
  const { SAILPOINT_BASE_URL, SAILPOINT_CLIENT_ID, SAILPOINT_CLIENT_SECRET } = process.env;
  return Boolean(SAILPOINT_BASE_URL && SAILPOINT_CLIENT_ID && SAILPOINT_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | undefined;

async function getAccessToken(): Promise<string> {
  // 30s safety margin so a token doesn't expire mid-request.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const { baseUrl, clientId, clientSecret } = config();
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    throw new Error(`SailPoint auth failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl } = config();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`SailPoint API ${init.method || 'GET'} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

const sourceIdCache = new Map<string, string>();

/**
 * Looks up a source's ID by its exact display name (e.g. "Rush Workday",
 * "RUSH Lawson", "Copley Lawson") — works for any source, not just the ones
 * the identity-creation pipeline already supports. Cached in memory per
 * process so a batch of many identities across the same sources doesn't
 * re-look-up the same ID repeatedly.
 */
export async function getSourceIdByName(sourceName: string): Promise<string> {
  const cached = sourceIdCache.get(sourceName);
  if (cached) return cached;

  const filter = encodeURIComponent(`name eq "${sourceName}"`);
  const res = await apiFetch(`/v3/sources?filters=${filter}`);
  const sources = (await res.json()) as Array<{ id: string; name: string }>;
  const match = sources.find((s) => s.name === sourceName);
  if (!match) {
    throw new Error(
      `No SailPoint source found named "${sourceName}" — check the exact name in Admin > Connections > Sources (case-sensitive).`
    );
  }
  sourceIdCache.set(sourceName, match.id);
  return match.id;
}

// See the file-header note — not verified live.
const AGGREGATE_PATH = (sourceId: string) => `/v3/sources/${sourceId}/load-accounts`;

/** Kicks off account aggregation for a source. Returns immediately with a task ID — aggregation itself runs async. */
export async function triggerAggregation(sourceId: string): Promise<string> {
  const res = await apiFetch(AGGREGATE_PATH(sourceId), { method: 'POST', body: JSON.stringify({}) });
  const task = (await res.json()) as { id?: string };
  if (!task.id) {
    throw new Error(`SailPoint aggregation trigger for source ${sourceId} returned no task ID: ${JSON.stringify(task)}`);
  }
  return task.id;
}

interface TaskStatus {
  completed?: string;
  completionStatus?: string;
}

/**
 * Polls a task's status until it reaches a terminal state (a `completed`
 * timestamp, or a `completionStatus` other than pending/in-progress), or
 * the timeout elapses. Throws if the task finishes with anything other
 * than success, or never finishes in time.
 */
export async function waitForAggregationComplete(taskId: string, timeoutMs = 300_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await apiFetch(`/v3/task-status/${taskId}`);
    const status = (await res.json()) as TaskStatus;
    if (status.completed || (status.completionStatus && !/PENDING|IN_PROGRESS/i.test(status.completionStatus))) {
      if (status.completionStatus && !/SUCCESS/i.test(status.completionStatus)) {
        throw new Error(`SailPoint aggregation task ${taskId} finished with status "${status.completionStatus}", not success.`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`SailPoint aggregation task ${taskId} did not complete within ${timeoutMs}ms.`);
}

/** Convenience: trigger + wait, for one source by name. */
export async function aggregateSourceByName(sourceName: string, timeoutMs = 300_000): Promise<void> {
  const sourceId = await getSourceIdByName(sourceName);
  const taskId = await triggerAggregation(sourceId);
  await waitForAggregationComplete(taskId, timeoutMs);
}
