import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

/** Samsung RMUS remote-management portal config (ported from TV AUTOMATION). */
export const rmusConfig = {
  baseUrl:
    process.env.RMUS_BASE_URL ||
    'https://rmus.samsungcsportal.com/RemoteControl#none',

  storageStatePath:
    process.env.RMUS_STORAGE_STATE_PATH ||
    path.join(DATA_DIR, '.cache', 'rmus-storage-state.json'),

  headless: envBool('RMUS_HEADLESS', false),

  selectors: {
    usernameInput: '#userId',
    passwordInput: '#userPW',
    loginButton:
      '#lbLogin, input[name="lbLogin"], input[type="submit"][value="LOGIN"]',
    pinInput:
      'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
    remoteStartButton: '#btnRemoteStart',
    captureButton: '#btnGraphicCapture',
    loadingOverlays:
      '.rc_virtual .box_loading, .pop_rm .box_loading, .rc_keys .box_loading',
  },

  security: {
    usernameEnv: 'RMUS_USERNAME',
    passwordEnv: 'RMUS_PASSWORD',
  },

  timeouts: {
    loginNavigationMs: 60000,
    initialPageSettleMs: 2000,
    loginSelectorVisibleMs: 10000,
    authMonitorTotalMs: 240000,
    remoteReadyMs: 600000, // 10 min — enough time to enter PIN manually
    remoteReadySettleMs: 2000,
    startButtonPostClickMs: 1500,
    popupEventMs: 12000,
    popupFallbackLookupMs: 20000,
    popupDomReadyMs: 10000,
    popupInitialSettleMs: 2000,
    popupImageReadyMs: 25000,
    popupBlobImgWaitMs: 12000,
    popupEvaluateMs: 120000,
    popupBlobFetchMs: 45000,
    previewScreenshotMs: 30000,
    popupPostCloseMs: 5000,
    loadingVisibleMs: 6000,
    loadingHiddenMs: 45000,
    downloadMs: 8000,
  },

  capture: {
    retryAttempts: 3,
    popupExtractAttempts: 6,
    enablePreviewScreenshotFallback: false,
    retryWaitMs: 800,
    popupWaitMs: 1500,
  },

  featureFlags: {
    enableStartButtonClick: true,
    enablePopupFallback: true,
  },

  healthChecks: {
    requiredUrlIncludes: ['/RemoteControl'],
  },
};
