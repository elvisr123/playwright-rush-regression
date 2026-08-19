import { Locator, Page } from '@playwright/test';

export async function waitForLoadingToFinish(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const loadingIndicators = page.getByText('Loading', { exact: true });
  const count = await loadingIndicators.count();
  for (let i = 0; i < count; i++) {
    await loadingIndicators.nth(i).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
}

export async function expandAllScrollAreas(page: Page) {
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      all.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const overflowAmount = htmlEl.scrollHeight - htmlEl.clientHeight;
        if (overflowAmount > 5 && overflowAmount < 3000) {
          htmlEl.style.setProperty('overflow', 'visible', 'important');
          htmlEl.style.setProperty('overflow-y', 'visible', 'important');
          htmlEl.style.setProperty('max-height', 'none', 'important');
          htmlEl.style.setProperty('height', 'auto', 'important');
        }
      });
    });
    await page.waitForTimeout(300);
  }
}

/**
 * Aggressively unclip Access table scroll containers so every role/entitlement
 * row on the current page can participate in layout (no 3000px overflow cap).
 */
export async function expandAccessScrollAreas(page: Page) {
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const htmlEl = el as HTMLElement;
        const overflowAmount = htmlEl.scrollHeight - htmlEl.clientHeight;
        if (overflowAmount <= 5) continue;
        htmlEl.style.setProperty('overflow', 'visible', 'important');
        htmlEl.style.setProperty('overflow-y', 'visible', 'important');
        htmlEl.style.setProperty('max-height', 'none', 'important');
        htmlEl.style.setProperty('height', 'auto', 'important');
      }
    });
    await page.waitForTimeout(200);
  }
}

export async function resetPageZoom(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    document.body.style.zoom = '';
  });
}

/** Lowest visible edge of Access table rows + pager, in viewport CSS pixels. */
async function getAccessContentBottom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    let maxBottom = 0;
    const bump = (el: Element | null) => {
      if (!el) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0 && rect.bottom > maxBottom) {
        maxBottom = rect.bottom;
      }
    };

    for (const row of document.querySelectorAll('tbody tr, [role="row"], table tr')) {
      bump(row);
    }
    for (const el of document.querySelectorAll('button, span, div, p, label')) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.trim();
      if (/next page|previous page|go to next page|^\d+\s*[–-]\s*\d+\s+of\s+\d+/i.test(label)) {
        bump(el);
      }
    }
    if (maxBottom < 100) {
      maxBottom = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.getBoundingClientRect().bottom
      );
    }
    return Math.ceil(maxBottom + 40);
  });
}

/**
 * Expand Access table overflow, then CSS-zoom out until every row on the
 * current page fits inside the viewport. Returns the zoom factor used.
 */
export async function fitAccessContentInView(page: Page): Promise<number> {
  const MIN_ZOOM = 0.45;
  const ZOOM_STEP = 0.05;

  await resetPageZoom(page);
  await expandAccessScrollAreas(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  const viewport = page.viewportSize() ?? { width: 1600, height: 2000 };
  const targetHeight = viewport.height - 16;
  let zoom = 1;

  for (let i = 0; i < 25; i++) {
    const bottom = await getAccessContentBottom(page);
    if (bottom <= targetHeight) break;
    zoom = Math.max(MIN_ZOOM, Number((zoom - ZOOM_STEP).toFixed(2)));
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, zoom);
    await page.waitForTimeout(120);
    if (zoom <= MIN_ZOOM) {
      console.log(
        `Access capture: content still taller than viewport at min zoom ${MIN_ZOOM} (bottom=${bottom}px).`
      );
      break;
    }
  }

  if (zoom < 1) {
    console.log(`Access capture: zoomed out to ${zoom} so all rows fit in view.`);
  }
  return zoom;
}

export async function getContentBottom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
      const html = el as HTMLElement;
      const rect = html.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) return false;
      if (window.getComputedStyle(html).visibility === 'hidden') return false;
      const hasOwnText = Array.from(html.childNodes).some(
        n => n.nodeType === 3 && n.textContent && n.textContent.trim().length > 0
      );
      const isInteractive = ['INPUT', 'BUTTON', 'A', 'IMG', 'TABLE', 'TR', 'TD', 'TH'].includes(html.tagName);
      return hasOwnText || isInteractive;
    });
    let maxBottom = 0;
    candidates.forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    });
    return Math.ceil(maxBottom + 30);
  });
}

export async function screenshotContent(page: Page, path: string) {
  const contentHeight = await getContentBottom(page);
  await page.screenshot({
    path,
    clip: { x: 0, y: 0, width: 1600, height: Math.min(contentHeight, 5000) },
  });
}

async function highlightVisible(locator: Locator) {
  await locator.evaluate((el) => {
    (el as HTMLElement).style.setProperty('background-color', 'yellow', 'important');
  });
}

/**
 * After landing on the identity page: open Actions, screenshot Process Identity
 * highlighted in the menu, click it, then screenshot the success toast.
 */
export async function captureProcessIdentityEvidence(
  page: Page,
  actionsPath: string,
  successPath: string
) {
  await waitForLoadingToFinish(page);

  const actionsButton = page.getByRole('button', { name: /^Actions$/i }).first();
  await actionsButton.waitFor({ state: 'visible', timeout: 20000 });
  await actionsButton.click();

  const processItem = page
    .getByRole('menuitem', { name: /Process Identity/i })
    .or(page.getByRole('option', { name: /Process Identity/i }))
    .or(page.getByText('Process Identity', { exact: true }))
    .filter({ visible: true })
    .first();
  await processItem.waitFor({ state: 'visible', timeout: 10000 });
  await highlightVisible(processItem);
  await screenshotContent(page, actionsPath);

  await processItem.click();

  const toast = page.getByText(/Your identity is now processing/i).first();
  await toast.waitFor({ state: 'visible', timeout: 20000 });
  await highlightVisible(toast);
  await screenshotContent(page, successPath);
  await toast.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

/**
 * Screenshot an Access Roles/Entitlements view after expanding scroll areas and
 * zooming out far enough that every row on the current page is visible.
 * Pass `alreadyFitted: true` when the caller already ran `fitAccessContentInView`
 * (e.g. so highlights can be applied after zoom, before the shot).
 */
export async function screenshotAccessContent(
  page: Page,
  path: string,
  options?: { alreadyFitted?: boolean }
) {
  if (!options?.alreadyFitted) {
    await fitAccessContentInView(page);
  }
  const viewport = page.viewportSize() ?? { width: 1600, height: 2000 };
  const contentHeight = Math.max(await getAccessContentBottom(page), await getContentBottom(page));
  const height = Math.min(Math.max(contentHeight, 100), viewport.height);
  await page.screenshot({
    path,
    clip: { x: 0, y: 0, width: viewport.width, height },
  });
  await resetPageZoom(page);
}

export interface CaptureOptions {
  clickAction?: () => Promise<void>;
  waitForText?: string;
  highlightFn?: () => Promise<Record<string, string[]> | void>;
  screenshotPath: string;
}

export async function captureSection(page: Page, options: CaptureOptions): Promise<Record<string, string[]> | void> {
  if (options.clickAction) {
    await options.clickAction();
  }
  await waitForLoadingToFinish(page);
  if (options.waitForText) {
    await page.waitForSelector(`text=${options.waitForText}`, { timeout: 15000 }).catch(() => {});
  }
  await expandAllScrollAreas(page);
  let highlightResult: Record<string, string[]> | void = undefined;
  if (options.highlightFn) {
    highlightResult = await options.highlightFn();
  }
  await screenshotContent(page, options.screenshotPath);
  return highlightResult;
}

export interface PaginatedCaptureOptions {
  clickAction?: () => Promise<void>;
  waitForText?: string;
  /** Run on every page before screenshot (e.g. tab-count highlight). */
  highlightFn?: () => Promise<Record<string, string[]> | void>;
  /** Path prefix without extension, e.g. `temp/label_3_Roles` → `_p1.png`, `_p2.png`. */
  screenshotPathPrefix: string;
  captionBase: string;
  maxPages?: number;
}

/** Fingerprint of the current table page so we can detect when Next actually advanced. */
async function getAccessTableFingerprint(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const leafStatus = Array.from(document.querySelectorAll('span, div, p, label')).find((el) => {
      if ((el as HTMLElement).children.length > 0) return false;
      return /^\s*\d+\s*[–-]\s*\d+\s+of\s+\d+/i.test((el.textContent || '').trim());
    });
    if (leafStatus?.textContent) return leafStatus.textContent.trim();

    const rows = Array.from(document.querySelectorAll('tbody tr, [role="row"]')).slice(0, 8);
    return rows.map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)).join('|');
  });
}

/**
 * Locate an enabled Next-page control used by SailPoint ISC Access tables.
 * Tries common aria-labels / button names; returns null when absent or disabled.
 */
async function findEnabledNextPageButton(page: Page) {
  const locators = [
    page.getByRole('button', { name: /^(next page|go to next page|next)$/i }),
    page.locator('button[aria-label*="Next" i]'),
    page.locator('button[title*="Next" i]'),
  ];

  for (const locator of locators) {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const btn = locator.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      if (!(await btn.isEnabled().catch(() => false))) continue;
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      if (ariaDisabled === 'true') continue;
      // Disabled attribute present (even as empty string) means not clickable
      if ((await btn.getAttribute('disabled')) !== null) continue;
      const cls = (await btn.getAttribute('class')) || '';
      if (/\bdisabled\b/i.test(cls)) continue;
      return btn;
    }
  }
  return null;
}

/**
 * Capture every page of a paginated Access table (Roles / Entitlements).
 * Takes a screenshot of the current page, then clicks Next until disabled or
 * content stops changing. Always produces at least page 1.
 */
export async function capturePaginatedSection(
  page: Page,
  options: PaginatedCaptureOptions
): Promise<{
  images: { path: string; caption: string }[];
  highlightResult?: Record<string, string[]> | void;
}> {
  const maxPages = options.maxPages ?? 50;
  const images: { path: string; caption: string }[] = [];
  let highlightResult: Record<string, string[]> | void = undefined;

  if (options.clickAction) {
    await options.clickAction();
  }
  await waitForLoadingToFinish(page);
  if (options.waitForText) {
    await page.waitForSelector(`text=${options.waitForText}`, { timeout: 15000 }).catch(() => {});
  }

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    // Expand clipped table scroll areas, then zoom out until every row fits.
    await fitAccessContentInView(page);
    if (options.highlightFn) {
      const result = await options.highlightFn();
      if (pageNum === 1) highlightResult = result;
    }

    const path = `${options.screenshotPathPrefix}_p${pageNum}.png`;
    await screenshotAccessContent(page, path, { alreadyFitted: true });
    images.push({
      path,
      caption: `${options.captionBase} — page ${pageNum}`,
    });

    const before = await getAccessTableFingerprint(page);
    const nextBtn = await findEnabledNextPageButton(page);
    if (!nextBtn) {
      console.log(`${options.captionBase}: no further pages after page ${pageNum}.`);
      break;
    }

    console.log(`${options.captionBase}: advancing to page ${pageNum + 1}…`);
    await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
    await nextBtn.click();
    await waitForLoadingToFinish(page);

    // Wait briefly for the table contents / status text to change
    const advanced = await page
      .waitForFunction(
        (prev) => {
          const leafStatus = Array.from(document.querySelectorAll('span, div, p, label')).find((el) => {
            if ((el as HTMLElement).children.length > 0) return false;
            return /^\s*\d+\s*[–-]\s*\d+\s+of\s+\d+/i.test((el.textContent || '').trim());
          });
          if (leafStatus?.textContent) {
            return leafStatus.textContent.trim() !== prev;
          }
          const rows = Array.from(document.querySelectorAll('tbody tr, [role="row"]')).slice(0, 8);
          const fp = rows.map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)).join('|');
          return fp !== prev;
        },
        before,
        { timeout: 10000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!advanced) {
      console.log(
        `${options.captionBase}: Next clicked but table did not change after page ${pageNum} — stopping.`
      );
      break;
    }
  }

  // If we only captured one page, drop the " — page 1" suffix for a cleaner report caption
  if (images.length === 1) {
    images[0].caption = options.captionBase;
  }

  return { images, highlightResult };
}

export async function waitForStableSearchResults(page: Page, maxRows = 5, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  let lastCount = -1;
  while (Date.now() - start < timeoutMs) {
    const count = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      let n = 0;
      for (const a of links) {
        let row: Element | null = a;
        for (let i = 0; i < 6 && row; i++) {
          row = row.parentElement;
          if (!row) break;
          if (/disabled|enabled/i.test(row.textContent || '')) { n++; break; }
        }
      }
      return n;
    });
    if (count > 0 && count <= maxRows && count === lastCount) {
      return true;
    }
    lastCount = count;
    await page.waitForTimeout(500);
  }
  return false;
}