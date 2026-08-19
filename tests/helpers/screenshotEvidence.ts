import { Page } from '@playwright/test';

export async function highlightFields(page: Page, labels: string[]): Promise<Record<string, string[]>> {
  return await page.evaluate((labels) => {
    const normalizedLabels = labels.map(l => l.toLowerCase());
    const elements = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const text = el.textContent?.trim().toLowerCase() || '';
        return normalizedLabels.includes(text) && el.children.length === 0;
      });
    // A label can legitimately appear more than once on a page (e.g. a top-level
    // "Status" badge plus a separate "Status" attribute in the grid below) — so
    // every match's value is collected into an array rather than overwriting
    // a single slot, which would silently drop one of the two occurrences.
    const values: Record<string, string[]> = {};
    elements.forEach(el => {
      (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
      const valueEl = el.nextElementSibling as HTMLElement | null;
      if (valueEl) {
        valueEl.style.setProperty('background-color', 'yellow', 'important');
      }
      const label = el.textContent?.trim() || '';
      const value = valueEl?.textContent?.trim() ?? '';
      if (!values[label]) values[label] = [];
      values[label].push(value);
    });
    return values;
  }, labels);
}

// Re-colors an already-highlighted field to red instead of yellow — used for
// fields that failed an expected-value assertion, so a failure is visible
// directly in the screenshot rather than only in the report's text summary.
// Uses the same exact-match logic as highlightFields so it recolors the
// identical element(s), and must be called AFTER highlightFields for that
// label (and before the screenshot is taken) to actually override the color.
export async function highlightFieldRed(page: Page, label: string): Promise<void> {
  await page.evaluate((label) => {
    const normalized = label.toLowerCase();
    const elements = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent?.trim().toLowerCase() || '';
      return text === normalized && el.children.length === 0;
    });
    elements.forEach(el => {
      (el as HTMLElement).style.setProperty('background-color', '#FF4D4D', 'important');
      const valueEl = el.nextElementSibling as HTMLElement | null;
      if (valueEl) {
        valueEl.style.setProperty('background-color', '#FF4D4D', 'important');
      }
    });
  }, label);
}

export async function highlightSearchInput(page: Page, testId: string) {
  await page.evaluate((testId) => {
    const input = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    const textWidth = ctx.measureText(input.value).width;

    const paddingLeft = parseFloat(style.paddingLeft || '0');

    const overlay = document.createElement('div');
    overlay.setAttribute('data-highlight-overlay', 'true');
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left + paddingLeft}px`;
    overlay.style.top = `${rect.top + 2}px`;
    overlay.style.height = `${rect.height - 4}px`;
    overlay.style.width = `${textWidth + 4}px`;
    overlay.style.backgroundColor = 'yellow';
    overlay.style.opacity = '0.55';
    overlay.style.zIndex = '9999';
    overlay.style.pointerEvents = 'none';
    overlay.style.borderRadius = '3px';
    document.body.appendChild(overlay);
  }, testId);
}

export async function removeHighlightOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-highlight-overlay]').forEach(el => el.remove());
  });
}

export async function highlightTabCount(page: Page, tabLabel: string) {
  const tab = page.getByRole('button', { name: new RegExp(`^${tabLabel}`) }).first();
  await tab.evaluate(
    (el) => {
      (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
    },
    undefined,
    { timeout: 5000 }
  ).catch(() => {
    console.log(`Could not find tab button for "${tabLabel}" — skipping highlight.`);
  });
}

export async function highlightPageTitle(page: Page, sourceName: string) {
  await page.evaluate((sourceName) => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const heading = headings.find(h => h.textContent?.includes(sourceName));
    if (heading) {
      (heading as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
    }
  }, sourceName);
}

export async function highlightNavItem(page: Page, name: string) {
  const navLink = page.getByRole('link', { name, exact: true });
  await navLink.evaluate((el) => {
    (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
  }).catch(() => {});
}

// Highlights any leaf element whose text contains the given substring, rather
// than matching a specific field label. Useful for values like a Distinguished
// Name where the exact on-screen field label isn't confirmed, but a recognizable
// substring within the value (e.g. "OU=") is what actually matters.
export async function highlightValuesContaining(page: Page, substring: string): Promise<string[]> {
  return await page.evaluate((substring) => {
    const matches: string[] = [];
    const elements = Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0);
    elements.forEach(el => {
      const text = el.textContent || '';
      if (text.includes(substring)) {
        (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
        matches.push(text.trim());
      }
    });
    return matches;
  }, substring);
}

export async function highlightAccountRowStatus(page: Page, sourceName: string) {
  await page.evaluate((sourceName) => {
    const sourceEl = Array.from(document.querySelectorAll('*')).find(
      el => el.textContent?.trim() === sourceName && el.children.length === 0
    );
    if (!sourceEl) return;

    let row: Element | null = sourceEl;
    for (let i = 0; i < 6 && row; i++) {
      row = row.parentElement;
      if (!row) break;
      const text = row.textContent || '';
      if (text.includes('Enabled') || text.includes('Disabled')) break;
    }
    if (!row) return;

    const statusEl = Array.from(row.querySelectorAll('*')).find(el => {
      const t = el.textContent?.trim();
      return (t === 'Enabled' || t === 'Disabled') && el.children.length === 0;
    });
    if (statusEl) {
      (statusEl as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
    }
  }, sourceName);
}

export async function highlightMultipleAccountRows(page: Page, sourceNames: string[]) {
  for (const sourceName of sourceNames) {
    await highlightAccountRowStatus(page, sourceName);
  }
}

export async function highlightIdentityLink(page: Page, identityName: string) {
  await page.evaluate((identityName) => {
    const el = Array.from(document.querySelectorAll('*')).find(
      e => e.textContent?.trim() === identityName && e.children.length === 0
    );
    if (el) {
      (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
    }
  }, identityName);
}

/** Yellow-highlight every leaf whose text exactly matches one of the given labels. */
export async function highlightExactTexts(page: Page, texts: string[]) {
  for (const text of texts) {
    await page.evaluate((text) => {
      const normalized = text.toLowerCase();
      const elements = Array.from(document.querySelectorAll('*')).filter((el) => {
        const t = el.textContent?.trim().toLowerCase() || '';
        return t === normalized && el.children.length === 0;
      });
      elements.forEach((el) => {
        (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
      });
    }, text);
  }
}

export async function getIdentityNameFromSearchResult(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));

    for (const a of allLinks) {
      let row: Element | null = a;
      let matchedRow: Element | null = null;
      for (let i = 0; i < 6 && row; i++) {
        row = row.parentElement;
        if (!row) break;
        if (/disabled|enabled/i.test(row.textContent || '')) {
          matchedRow = row;
          break;
        }
      }
      if (matchedRow) {
        const rowLinks = Array.from(matchedRow.querySelectorAll('a'));
        // Prefer a link whose text contains a space — real names have spaces, account IDs/usernames don't
        const nameLink = rowLinks.find(l => /\s/.test(l.textContent?.trim() || ''));
        if (nameLink) {
          return nameLink.textContent?.trim() || null;
        }
        // Fallback: last link in the row (often the identity column comes after account name)
        const fallback = rowLinks[rowLinks.length - 1];
        return fallback?.textContent?.trim() || null;
      }
    }
    return null;
  });
}

export async function markAccountRowLink(page: Page, sourceName: string, markerId: string): Promise<boolean> {
  return await page.evaluate(({ sourceName, markerId }) => {
    const sourceEl = Array.from(document.querySelectorAll('*')).find(
      el => el.textContent?.trim() === sourceName && el.children.length === 0
    );
    if (!sourceEl) return false;

    let row: Element | null = sourceEl;
    for (let i = 0; i < 6 && row; i++) {
      row = row.parentElement;
      if (!row) break;
      const text = row.textContent || '';
      if (text.includes('Enabled') || text.includes('Disabled')) break;
    }
    if (!row) return false;

    const accountLink = row.querySelector('a');
    if (accountLink) {
      accountLink.setAttribute('data-marker', markerId);
      return true;
    }
    return false;
  }, { sourceName, markerId });
}

// Reads every account row on the identity's Accounts tab and returns each
// row's Source Name — not just the sources a given TestCase names, so the
// caller can drill into accounts that weren't explicitly configured (e.g.
// IdentityNow, ServiceNow SaaS, TEST RUSH AD).
//
// Row-detection anchor: a genuine row is the smallest element that BOTH
// contains "Enabled"/"Disabled" text AND has at least 2 <a> descendants
// (Account Name link + Source Name link). Requiring both conditions matters —
// an earlier version anchored on status text alone, which resolved to just
// the status badge's own wrapper cell (smaller than the row, and contains
// zero links, since Name/Source Name live in separate sibling cells), so
// every row failed the link-count check and discovery silently found
// nothing. Requiring both conditions together forces the match up to the
// actual row level, since no single cell within a row has both.
export async function getAllAccountSourceNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent || '';
      const hasStatus = text.includes('Enabled') || text.includes('Disabled');
      const linkCount = el.querySelectorAll('a').length;
      return hasStatus && linkCount >= 2;
    });
    // Keep only the smallest matching elements — discard any candidate that
    // contains another candidate, since that's a larger wrapper spanning
    // multiple rows (e.g. the whole table body), not a single row.
    const rows = candidates.filter(r => !candidates.some(other => other !== r && r.contains(other)));

    const names: string[] = [];
    rows.forEach(row => {
      const links = Array.from(row.querySelectorAll('a'));
      if (links.length >= 2) {
        const sourceName = links[1].textContent?.trim();
        if (sourceName) names.push(sourceName);
      }
    });
    return Array.from(new Set(names));
  });
}