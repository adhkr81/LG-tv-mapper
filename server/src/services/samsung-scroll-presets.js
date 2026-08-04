/**
 * Samsung scroll preset defaults + normalize (EmulatorDisplay canvas shape).
 * Keep defaults in sync with client/src/data/samsungScrollPresets.js.
 *
 * Schema per preset:
 * {
 *   screen: { height, left, src, top, width },
 *   scroll: { left, top, height, width, borderRadius },
 *   scroll_buttons: { up: { top, left }, down: { top, left } }
 * }
 */

export const SAMSUNG_SCREEN_FRAME = {
  height: 370,
  left: 125,
  top: 17,
  width: 658,
};

export function buildSamsungPresetScreen(src = 'homescreen') {
  return {
    height: SAMSUNG_SCREEN_FRAME.height,
    left: SAMSUNG_SCREEN_FRAME.left,
    src: typeof src === 'string' && src ? src : 'homescreen',
    top: SAMSUNG_SCREEN_FRAME.top,
    width: SAMSUNG_SCREEN_FRAME.width,
  };
}

export const SAMSUNG_SCROLL_PRESET_DEFAULTS = {
  preset2: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      left: 159,
      top: 134,
      height: 203,
      width: 164,
      borderRadius: 5,
    },
    scroll_buttons: {
      up: { top: 70, left: 225 },
      down: { top: 353, left: 225 },
    },
  },
  preset4: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      left: 159,
      top: 134,
      height: 203,
      width: 164,
      borderRadius: 5,
    },
    scroll_buttons: {
      up: { top: 70, left: 225 },
      down: { top: 353, left: 225 },
    },
  },
  preset5: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      left: 159,
      top: 104,
      height: 240,
      width: 164,
      borderRadius: 0,
    },
    scroll_buttons: {
      up: { top: 70, left: 225 },
      down: { top: 353, left: 225 },
    },
  },
  preset6: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      left: 159,
      top: 181,
      height: 164,
      width: 130,
      borderRadius: 0,
    },
    scroll_buttons: {
      up: { top: 121, left: 208 },
      down: { top: 353, left: 208 },
    },
  },
  preset7: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      left: 261,
      top: 113,
      height: 207,
      width: 276,
      borderRadius: 5,
    },
    scroll_buttons: {
      up: { top: 50, left: 439 },
      down: { top: 326, left: 439 },
    },
  },
  preset8: {
    screen: buildSamsungPresetScreen(),
    scroll: {
      height: 370,
      left: 125,
      top: 17,
      width: 658,
      borderRadius: 0,
    },
    scroll_buttons: {
      up: { top: 1, left: 439 },
      down: { top: 377, left: 439 },
    },
  },
};

function finiteNum(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function cloneDef(def) {
  if (!def?.scroll || !def?.scroll_buttons) return null;
  return {
    screen: buildSamsungPresetScreen(def.screen?.src),
    scroll: {
      left: finiteNum(def.scroll.left),
      top: finiteNum(def.scroll.top),
      width: Math.max(1, finiteNum(def.scroll.width, 1)),
      height: Math.max(1, finiteNum(def.scroll.height, 1)),
      borderRadius: Math.max(0, finiteNum(def.scroll.borderRadius, 0)),
    },
    scroll_buttons: {
      up: {
        top: finiteNum(def.scroll_buttons.up?.top),
        left: finiteNum(def.scroll_buttons.up?.left),
      },
      down: {
        top: finiteNum(def.scroll_buttons.down?.top),
        left: finiteNum(def.scroll_buttons.down?.left),
      },
    },
  };
}

export function normalizeSamsungScrollPresets(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of Object.keys(SAMSUNG_SCROLL_PRESET_DEFAULTS)) {
    if (!raw[key]) continue;
    const cloned = cloneDef(raw[key]);
    if (cloned) out[key] = cloned;
  }
  return out;
}
