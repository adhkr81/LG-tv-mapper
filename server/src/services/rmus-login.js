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
 * Log into RMUS (or reuse an already-authenticated session).
 * With interactivePinConfirmation, returns after submitting credentials so the
 * caller can wait on #btnGraphicCapture while the user finishes PIN/OTP.
 */
export async function loginAndWaitAuthenticated(page, options = {}) {
  const { interactivePinConfirmation = true } = options;
  const { timeouts = {}, security = {}, selectors, baseUrl } = rmusConfig;
  const usernameSelectors = selectorList(selectors.usernameInput);
  const passwordSelectors = selectorList(selectors.passwordInput);
  const loginButtonSelectors = selectorList(selectors.loginButton);
  const username = (process.env[security.usernameEnv] || '').trim();
  const password = (process.env[security.passwordEnv] || '').trim();

  await page.goto(baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeouts.loginNavigationMs ?? 60000,
  });
  await page.waitForTimeout(timeouts.initialPageSettleMs ?? 2000);

  const loginButton = await waitForFirstVisibleOrNull(
    page,
    loginButtonSelectors,
    timeouts.loginSelectorVisibleMs ?? 10000
  );
  if (!loginButton) {
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
