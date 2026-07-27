import fs from 'fs';
import { rmusConfig } from './rmus-config.js';

const selectorList = (selectorString) =>
  String(selectorString || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export async function waitForFirstVisible(page, selectors, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} was not visible. Tried: ${selectors.join(', ')}`);
}

async function waitForFirstVisibleOrNull(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

/**
 * Samsung often returns ASP.NET ServerError for /RemoteControl when the
 * saved session/cookies are expired instead of redirecting to login.
 * @see https://rmus.samsungcsportal.com/Error/ServerError?aspxerrorpath=/RemoteControl
 */
export async function isRmusFailurePage(page) {
  const url = page.url();
  if (/\/Error\/ServerError/i.test(url) || /aspxerrorpath=/i.test(url)) {
    return true;
  }

  const title = await page.title().catch(() => '');
  if (/internal server error/i.test(title)) return true;

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 2000 })
    .catch(() => '');
  if (
    /INTERNAL SERVER ERROR/i.test(bodyText) ||
    (/Automatically Ended/i.test(bodyText) && /Log-?In Again/i.test(bodyText))
  ) {
    return true;
  }
  return false;
}

function portalOrigin() {
  try {
    return new URL(rmusConfig.baseUrl).origin;
  } catch {
    return 'https://rmus.samsungcsportal.com';
  }
}

export function clearSavedRmusSession() {
  const storagePath = rmusConfig.storageStatePath;
  if (fs.existsSync(storagePath)) {
    try {
      fs.unlinkSync(storagePath);
      console.log(`[RMUS] Cleared saved session: ${storagePath}`);
    } catch (err) {
      console.warn('[RMUS] Could not delete saved session:', err.message);
    }
  }
}

async function gotoRmus(page, url) {
  const { timeouts = {} } = rmusConfig;
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeouts.loginNavigationMs ?? 60000,
  });
  await page.waitForTimeout(timeouts.initialPageSettleMs ?? 2000);
}

/**
 * Drop cookies and open a clean entry URL so the login form appears again.
 */
export async function recoverFromStaleSession(page) {
  clearSavedRmusSession();
  await page.context().clearCookies();

  const origin = portalOrigin();
  const loginUrl = rmusConfig.loginUrl || `${origin}/`;
  console.warn(
    `[RMUS] Session invalid (ServerError / logout). Clearing cookies and opening ${loginUrl}`
  );

  await gotoRmus(page, loginUrl);

  if (await isRmusFailurePage(page)) {
    // Root may also error — try Remote Control without cookies (should show login).
    await gotoRmus(page, rmusConfig.baseUrl);
  }
}

/**
 * Log into RMUS (or reuse an already-authenticated session).
 * With interactivePinConfirmation, returns after submitting credentials so the
 * caller can wait on #btnGraphicCapture while the user finishes PIN/OTP.
 *
 * @param {import('playwright').Page} page
 * @param {{ interactivePinConfirmation?: boolean, skipNavigation?: boolean }} [options]
 */
export async function loginAndWaitAuthenticated(page, options = {}) {
  const { interactivePinConfirmation = true, skipNavigation = false } = options;
  const { timeouts = {}, security = {}, selectors, baseUrl } = rmusConfig;
  const usernameSelectors = selectorList(selectors.usernameInput);
  const passwordSelectors = selectorList(selectors.passwordInput);
  const loginButtonSelectors = selectorList(selectors.loginButton);
  const username = (process.env[security.usernameEnv] || '').trim();
  const password = (process.env[security.passwordEnv] || '').trim();

  if (!skipNavigation) {
    await gotoRmus(page, baseUrl);

    // Stale ASP.NET session → ServerError instead of login form.
    if (await isRmusFailurePage(page)) {
      await recoverFromStaleSession(page);
    }
  }

  let loginButton = await waitForFirstVisibleOrNull(
    page,
    loginButtonSelectors,
    timeouts.loginSelectorVisibleMs ?? 10000
  );

  // No login form: either a good session, or a broken page we misread.
  if (!loginButton) {
    if (await isRmusFailurePage(page)) {
      await recoverFromStaleSession(page);
      loginButton = await waitForFirstVisibleOrNull(
        page,
        loginButtonSelectors,
        timeouts.loginSelectorVisibleMs ?? 10000
      );
    }
  }

  if (!loginButton) {
    if (await isRmusFailurePage(page)) {
      throw new Error(
        'RMUS returned Internal Server Error after clearing the session. ' +
          'Open https://rmus.samsungcsportal.com/ in a normal browser, log in, ' +
          'then try Connect again (or set RMUS_LOGIN_URL to the working login URL).'
      );
    }
    // Storage-state / reused session — already authenticated.
    return { loggedIn: true, reusedSession: true };
  }

  if (!username || !password) {
    throw new Error(
      `RMUS credentials missing. Set ${security.usernameEnv} and ${security.passwordEnv} in .env`
    );
  }

  const usernameInput = await waitForFirstVisible(
    page,
    usernameSelectors,
    timeouts.loginSelectorVisibleMs ?? 10000,
    'Username input'
  );
  await usernameInput.fill(username);

  const passwordInput = await waitForFirstVisible(
    page,
    passwordSelectors,
    timeouts.loginSelectorVisibleMs ?? 10000,
    'Password input'
  );
  await passwordInput.fill(password);
  await loginButton.click();

  if (interactivePinConfirmation) {
    await page.waitForTimeout(timeouts.startButtonPostClickMs ?? 1500);
    if (await isRmusFailurePage(page)) {
      throw new Error(
        'RMUS showed Internal Server Error after login. Try Connect again with a fresh session, ' +
          'or log in manually at https://rmus.samsungcsportal.com/ first.'
      );
    }
    return { loggedIn: true, reusedSession: false, awaitingPin: true };
  }

  // Non-interactive: poll until auth UI disappears (MFA completed).
  const pinSelectors = selectorList(selectors.pinInput);
  const authSelectorsToTrack = [
    ...usernameSelectors,
    ...passwordSelectors,
    ...loginButtonSelectors,
    ...pinSelectors,
    'input[type="tel"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
  ];

  const monitorDeadline = Date.now() + (timeouts.authMonitorTotalMs ?? 240000);
  let stableNoAuthMs = 0;

  while (Date.now() < monitorDeadline) {
    if (await isRmusFailurePage(page)) {
      throw new Error('RMUS Internal Server Error during authentication.');
    }
    let authVisible = false;
    for (const selector of authSelectorsToTrack) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (visible) {
        authVisible = true;
        break;
      }
    }
    stableNoAuthMs = authVisible ? 0 : stableNoAuthMs + 1000;
    if (stableNoAuthMs >= 10000) break;
    await page.waitForTimeout(1000);
  }

  return { loggedIn: true, reusedSession: false, awaitingPin: false };
}
