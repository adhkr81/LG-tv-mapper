/**
 * Samsung simulator scroll presets (smart-tv / 2026).
 * Screen frame matches preset2 (658×370 at canvas left 125 / top 17).
 * Mapper Preview uses rects relative to that screen frame.
 */

export const SAMSUNG_SCREEN_FRAME = {
  height: 370,
  left: 125,
  top: 17,
  width: 658,
};

export const SAMSUNG_PRESET_OPTIONS = [
  { value: 'preset2', label: 'preset2 (no scroll)' },
  { value: 'preset4', label: 'preset4 (narrow list)' },
  { value: 'preset5', label: 'preset5 (taller list)' },
  { value: 'preset6', label: 'preset6 (narrow lower)' },
  { value: 'preset7', label: 'preset7 (wide panel)' },
  { value: 'preset8', label: 'preset8 (full screen)' },
];

export const SAMSUNG_SCROLL_PRESETS = {
  preset4: {
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

/** Presets that enable scroll_area editing / preview. */
export function isSamsungScrollPreset(preset) {
  return Boolean(SAMSUNG_SCROLL_PRESETS[preset]);
}

/**
 * Scroll viewport relative to the screen image (658×370 stack).
 * @returns {{ left: number, top: number, width: number, height: number, borderRadius: number } | null}
 */
export function getScrollViewportRelative(preset) {
  const def = SAMSUNG_SCROLL_PRESETS[preset];
  if (!def?.scroll) return null;
  const { scroll } = def;
  return {
    left: scroll.left - SAMSUNG_SCREEN_FRAME.left,
    top: scroll.top - SAMSUNG_SCREEN_FRAME.top,
    width: scroll.width,
    height: scroll.height,
    borderRadius: scroll.borderRadius || 0,
  };
}

/**
 * Scroll arrow positions relative to the screen image.
 * @returns {{ up: { top: number, left: number }, down: { top: number, left: number } } | null}
 */
export function getScrollButtonsRelative(preset) {
  const def = SAMSUNG_SCROLL_PRESETS[preset];
  if (!def?.scroll_buttons) return null;
  const { up, down } = def.scroll_buttons;
  return {
    up: {
      top: up.top - SAMSUNG_SCREEN_FRAME.top,
      left: up.left - SAMSUNG_SCREEN_FRAME.left,
    },
    down: {
      top: down.top - SAMSUNG_SCREEN_FRAME.top,
      left: down.left - SAMSUNG_SCREEN_FRAME.left,
    },
  };
}
