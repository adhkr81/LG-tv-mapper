import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { rmusConfig } from './rmus-config.js';
import { loginAndWaitAuthenticated } from './rmus-login.js';
import { captureWithRetries } from './rmus-capture.js';
import { getScreenshotsDir } from './data-store.js';
import { normalizeCaptureToPreset2 } from './samsung-image.js';

/** @type {import('playwright').Browser | null} */
let browser = null;
/** @type {import('playwright').BrowserContext | null} */
let context = null;
/** @type {import('playwright').Page | null} */
let page = null;

/** @type {'disconnected' | 'connecting' | 'awaiting-pin' | 'ready' | 'error'} */
let status = 'disconnected';
let lastError = null;
let connectChain = Promise.resolve();

function enqueue(fn) {
  const run = connectChain.then(fn, fn);
  connectChain = run.catch(() => {});
  return run;
}

export function getStatus() {
  return {
    status,
    lastError,
    hasCredentials: Boolean(
      (process.env[rmusConfig.security.usernameEnv] || '').trim() &&
        (process.env[rmusConfig.security.passwordEnv] || '').trim()
    ),
    hasSavedSession: fs.existsSync(rmusConfig.storageStatePath),
  };
}

async function cleanupBrowser() {
  const b = browser;
  browser = null;
  context = null;
  page = null;
  if (b) {
    await Promise.race([
      b.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 15000)),
    ]);
  }
}

async function tryClickRemoteStart(activePage) {
  const { timeouts, selectors, featureFlags } = rmusConfig;
  if (featureFlags.enableStartButtonClick === false) return;

  const startButton = activePage.locator(selectors.remoteStartButton);
  if (!(await startButton.isVisible().catch(() => false))) return;

  const enabled = await startButton
    .evaluate((el) => !el.classList.contains('ui-state-disabled'))
    .catch(() => false);
  if (!enabled) return;

  await startButton.evaluate((el) => el.click());
  await activePage.waitForTimeout(timeouts.startButtonPostClickMs ?? 1500);
}

/**
 * After credentials are submitted, keep the browser open and wait until the
 * Remote Control UI is usable. The user may need to enter a PIN in the window.
 * Does not close the browser on timeout — status stays `awaiting-pin`.
 */
async function waitForRemoteReady(activePage) {
  const { timeouts, selectors } = rmusConfig;
  const readyTimeoutMs = timeouts.remoteReadyMs ?? 240000;
  const pollMs = 1000;
  const deadline = Date.now() + readyTimeoutMs;

  status = 'awaiting-pin';
  console.log(
    '[RMUS] Waiting for you to finish login / PIN in the Chromium window…'
  );
  console.log(
    '[RMUS] Will continue automatically once #btnGraphicCapture is visible.'
  );

  while (Date.now() < deadline) {
    if (activePage.isClosed()) {
      throw new Error('RMUS browser window was closed before login finished.');
    }

    await tryClickRemoteStart(activePage);

    const captureVisible = await activePage
      .locator(selectors.captureButton)
      .first()
      .isVisible()
      .catch(() => false);

    if (captureVisible) {
      const settleMs = timeouts.remoteReadySettleMs ?? 2000;
      console.log(`[RMUS] Capture button ready. Settling ${settleMs}ms…`);
      await activePage.waitForTimeout(settleMs);
      return true;
    }

    await activePage.waitForTimeout(pollMs);
  }

  // Keep the browser open so the user can still finish PIN and call confirm().
  console.warn(
    `[RMUS] Remote Control UI not ready after ${readyTimeoutMs / 1000}s. ` +
      'Browser left open — finish PIN, then click Connect again (or Confirm PIN).'
  );
  return false;
}

async function persistSession() {
  if (!context) return;
  const storagePath = rmusConfig.storageStatePath;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  await context.storageState({ path: storagePath });
  console.log(`[RMUS] Session state saved: ${storagePath}`);
}

/**
 * Launch Chromium, log into RMUS, wait until #btnGraphicCapture is ready.
 * Reuses storage state when present (unless fresh=true).
 * Browser stays open while waiting for PIN — it is only closed on disconnect
 * or if launch/login itself fails before the browser is usable.
 */
export function connect({ fresh = false } = {}) {
  return enqueue(async () => {
    if (status === 'ready' && page && !page.isClosed()) {
      return getStatus();
    }

    // Already waiting on an open browser — just keep waiting for the capture UI.
    if (
      (status === 'awaiting-pin' || status === 'connecting') &&
      page &&
      !page.isClosed()
    ) {
      const ready = await waitForRemoteReady(page);
      if (ready) {
        await persistSession();
        status = 'ready';
        lastError = null;
      }
      return getStatus();
    }

    status = 'connecting';
    lastError = null;

    try {
      await cleanupBrowser();

      const storagePath = rmusConfig.storageStatePath;
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });

      const contextOptions = {
        acceptDownloads: true,
        viewport: { width: 1440, height: 900 },
      };
      if (!fresh && fs.existsSync(storagePath)) {
        contextOptions.storageState = storagePath;
        console.log(`[RMUS] Loading saved session from ${storagePath}`);
      }

      browser = await chromium.launch({
        headless: rmusConfig.headless,
      });
      context = await browser.newContext(contextOptions);
      page = await context.newPage();

      const loginResult = await loginAndWaitAuthenticated(page, {
        interactivePinConfirmation: true,
      });

      // Always enter PIN-wait mode after login attempt (fresh or reused session).
      status = 'awaiting-pin';
      if (loginResult.awaitingPin) {
        console.log('[RMUS] Credentials submitted. Enter PIN in the browser window.');
      } else if (loginResult.reusedSession) {
        console.log('[RMUS] Reused saved session — checking Remote Control UI…');
      }

      const ready = await waitForRemoteReady(page);
      if (!ready) {
        // Browser stays open; UI can call connect again to resume waiting.
        lastError =
          'Waiting for PIN / Remote Control. Finish login in the browser, then click Connect again.';
        return getStatus();
      }

      await persistSession();
      status = 'ready';
      lastError = null;
      return getStatus();
    } catch (err) {
      lastError = err.message || String(err);
      console.error('[RMUS] Connect failed:', lastError);

      // Keep an open Chromium window so the user can finish PIN / login.
      if (browser && page && !page.isClosed()) {
        status = 'awaiting-pin';
        return getStatus();
      }

      status = 'error';
      await cleanupBrowser();
      throw err;
    }
  });
}

/**
 * Resume waiting after the user finished entering PIN in the open browser.
 */
export function confirmPin() {
  return enqueue(async () => {
    if (!page || page.isClosed()) {
      throw new Error('No RMUS browser open. Click Connect first.');
    }
    status = 'awaiting-pin';
    lastError = null;
    const ready = await waitForRemoteReady(page);
    if (!ready) {
      lastError =
        'Remote Control still not ready. Finish PIN in the browser, then confirm again.';
      return getStatus();
    }
    await persistSession();
    status = 'ready';
    lastError = null;
    return getStatus();
  });
}

export function disconnect() {
  return enqueue(async () => {
    await cleanupBrowser();
    status = 'disconnected';
    lastError = null;
    return getStatus();
  });
}

export async function ensureReady() {
  if (status === 'ready' && page && !page.isClosed()) {
    return getStatus();
  }
  return connect();
}

/**
 * Capture an OSD screenshot into the active project's screenshots dir.
 * @returns {Promise<string>} filename (e.g. screenId.jpg)
 */
export function captureScreenshot(screenId, onProgress) {
  return enqueue(async () => {
    if (status !== 'ready' || !page || page.isClosed() || !context) {
      throw new Error('RMUS is not connected. Connect first.');
    }

    onProgress?.({
      phase: 'requesting',
      percent: 10,
      label: 'Triggering RMUS graphic capture…',
    });

    const screenshotsDir = getScreenshotsDir();
    const destPath = path.join(screenshotsDir, `${screenId}.jpg`);

    onProgress?.({
      phase: 'extracting',
      percent: 40,
      label: 'Extracting screenshot from capture popup…',
    });

    const result = await captureWithRetries(page, context, destPath);
    if (!result.saved || !result.destPath) {
      throw new Error(`RMUS capture failed (${result.reason}). Try again.`);
    }

    onProgress?.({
      phase: 'finishing',
      percent: 90,
      label: 'Normalizing to preset2…',
    });

    const finalPath = path.join(screenshotsDir, `${screenId}.jpg`);
    const filename = await normalizeCaptureToPreset2(result.destPath, finalPath);

    onProgress?.({
      phase: 'finishing',
      percent: 95,
      label: 'Saving screenshot…',
    });

    return filename;
  });
}
