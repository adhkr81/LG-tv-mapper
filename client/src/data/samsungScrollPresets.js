/**
 * Samsung simulator scroll presets (smart-tv / 2026).
 * Defaults match EmulatorDisplay canvas coords (screen at left 125 / top 17, 658×370).
 * Project overrides are stored in the same absolute canvas shape for export.
 */

export const SAMSUNG_SCROLL_CONTROL_SIZE = 30;

export const SAMSUNG_SCREEN_FRAME = {
  height: 370,
  left: 125,
  top: 17,
  width: 658,
};

/**
 * EmulatorDisplay scroll arrow size in screenshot pixels
 * (30px on the 658-wide preset canvas, scaled with the image).
 */
export function getScrollControlSize(sourceSize) {
  const srcW = sourceSize?.width || SAMSUNG_SCREEN_FRAME.width;
  const scale = Math.max(0.5, srcW / SAMSUNG_SCREEN_FRAME.width);
  return Math.round(SAMSUNG_SCROLL_CONTROL_SIZE * scale);
}

export const SAMSUNG_PRESET_OPTIONS = [
  { value: 'preset2', label: 'preset2 (no scroll)' },
  { value: 'preset4', label: 'preset4 (narrow list)' },
  { value: 'preset5', label: 'preset5 (taller list)' },
  { value: 'preset6', label: 'preset6 (narrow lower)' },
  { value: 'preset7', label: 'preset7 (wide panel)' },
  { value: 'preset8', label: 'preset8 (full screen)' },
];

/** EmulatorDisplay canvas screen frame shared by all scroll presets. */
export function buildSamsungPresetScreen(src = 'homescreen') {
  return {
    height: SAMSUNG_SCREEN_FRAME.height,
    left: SAMSUNG_SCREEN_FRAME.left,
    src: typeof src === 'string' && src ? src : 'homescreen',
    top: SAMSUNG_SCREEN_FRAME.top,
    width: SAMSUNG_SCREEN_FRAME.width,
  };
}

export const SAMSUNG_SCROLL_PRESETS = {
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

/** Presets that enable scroll_area editing / preview. */
export function isSamsungScrollPreset(preset) {
  return Boolean(SAMSUNG_SCROLL_PRESETS[preset]);
}

export function cloneScrollPresetDef(def) {
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

/** Normalize a map of project overrides (EmulatorDisplay absolute canvas shape). */
export function normalizeSamsungScrollPresets(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of Object.keys(SAMSUNG_SCROLL_PRESETS)) {
    if (!raw[key]) continue;
    const cloned = cloneScrollPresetDef(raw[key]);
    if (cloned) out[key] = cloned;
  }
  return out;
}

/** Effective preset def = defaults merged with project override. */
export function resolveScrollPreset(preset, overrides = null) {
  const base = SAMSUNG_SCROLL_PRESETS[preset];
  if (!base) return null;
  const override = overrides?.[preset];
  if (!override) return cloneScrollPresetDef(base);
  return cloneScrollPresetDef({
    screen: { ...base.screen, ...override.screen },
    scroll: { ...base.scroll, ...override.scroll },
    scroll_buttons: {
      up: { ...base.scroll_buttons.up, ...override.scroll_buttons?.up },
      down: { ...base.scroll_buttons.down, ...override.scroll_buttons?.down },
    },
  });
}

/**
 * Map a rect from preset2 screen-relative space into displayed screenshot pixels.
 */
export function scaleFromPresetScreen(rect, sourceSize) {
  const srcW = sourceSize?.width;
  const srcH = sourceSize?.height;
  if (
    !srcW ||
    !srcH ||
    (srcW === SAMSUNG_SCREEN_FRAME.width && srcH === SAMSUNG_SCREEN_FRAME.height)
  ) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }
  const sx = srcW / SAMSUNG_SCREEN_FRAME.width;
  const sy = srcH / SAMSUNG_SCREEN_FRAME.height;
  return {
    left: Math.round(rect.left * sx),
    top: Math.round(rect.top * sy),
    width: Math.round(rect.width * sx),
    height: Math.round(rect.height * sy),
  };
}

/** Inverse of scaleFromPresetScreen — screenshot pixels → preset2 screen-relative. */
export function scaleToPresetScreen(rect, sourceSize) {
  const srcW = sourceSize?.width;
  const srcH = sourceSize?.height;
  if (
    !srcW ||
    !srcH ||
    (srcW === SAMSUNG_SCREEN_FRAME.width && srcH === SAMSUNG_SCREEN_FRAME.height)
  ) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  }
  const sx = SAMSUNG_SCREEN_FRAME.width / srcW;
  const sy = SAMSUNG_SCREEN_FRAME.height / srcH;
  return {
    left: Math.round(rect.left * sx),
    top: Math.round(rect.top * sy),
    width: Math.max(1, Math.round(rect.width * sx)),
    height: Math.max(1, Math.round(rect.height * sy)),
  };
}

function canvasScrollToRelative(scroll) {
  return {
    left: scroll.left - SAMSUNG_SCREEN_FRAME.left,
    top: scroll.top - SAMSUNG_SCREEN_FRAME.top,
    width: scroll.width,
    height: scroll.height,
    borderRadius: scroll.borderRadius || 0,
  };
}

function relativeToCanvasScroll(rel) {
  return {
    left: rel.left + SAMSUNG_SCREEN_FRAME.left,
    top: rel.top + SAMSUNG_SCREEN_FRAME.top,
    width: Math.max(1, rel.width),
    height: Math.max(1, rel.height),
    borderRadius: Math.max(0, rel.borderRadius || 0),
  };
}

/**
 * Scroll viewport relative to the screen image (source pixels).
 */
export function getScrollViewportRelative(
  preset,
  sourceSize = null,
  overrides = null
) {
  const def = resolveScrollPreset(preset, overrides);
  if (!def?.scroll) return null;
  const relative = canvasScrollToRelative(def.scroll);
  return {
    ...scaleFromPresetScreen(relative, sourceSize),
    borderRadius: relative.borderRadius || 0,
  };
}

/**
 * Visible overlay window in scroll-strip coordinate space.
 * Strip editors use preset.scroll.width (EmulatorDisplay space), so scale is usually 1.
 */
export function getScrollViewportOnStrip(preset, stripSize, overrides = null) {
  const viewport = getScrollViewportRelative(preset, null, overrides);
  if (!viewport || !stripSize?.width) return null;
  const scale = stripSize.width / viewport.width;
  return {
    left: 0,
    top: 0,
    width: stripSize.width,
    height: Math.round(viewport.height * scale),
    borderRadius: viewport.borderRadius || 0,
  };
}

/**
 * EmulatorDisplay scroll content size: strip image is shown at preset.scroll.width,
 * height keeps the strip aspect ratio. Button x/y/w/h are authored in this space.
 */
export function getScrollStripCoordSize(
  preset,
  naturalWidth,
  naturalHeight,
  overrides = null
) {
  const nw = Math.round(Number(naturalWidth) || 0);
  const nh = Math.round(Number(naturalHeight) || 0);
  if (!nw || !nh) return null;
  const def = resolveScrollPreset(preset, overrides);
  const scrollW = Math.max(1, Math.round(Number(def?.scroll?.width) || 0));
  if (!scrollW) {
    return { width: nw, height: nh };
  }
  return {
    width: scrollW,
    height: Math.max(1, Math.round((nh * scrollW) / nw)),
  };
}

/**
 * Scroll arrow positions relative to the screen image (source pixels).
 */
export function getScrollButtonsRelative(
  preset,
  sourceSize = null,
  overrides = null
) {
  const def = resolveScrollPreset(preset, overrides);
  if (!def?.scroll_buttons) return null;
  const { up, down } = def.scroll_buttons;
  const scaledUp = scaleFromPresetScreen(
    {
      left: up.left - SAMSUNG_SCREEN_FRAME.left,
      top: up.top - SAMSUNG_SCREEN_FRAME.top,
      width: 1,
      height: 1,
    },
    sourceSize
  );
  const scaledDown = scaleFromPresetScreen(
    {
      left: down.left - SAMSUNG_SCREEN_FRAME.left,
      top: down.top - SAMSUNG_SCREEN_FRAME.top,
      width: 1,
      height: 1,
    },
    sourceSize
  );
  return {
    up: { top: scaledUp.top, left: scaledUp.left },
    down: { top: scaledDown.top, left: scaledDown.left },
  };
}

/**
 * Apply a viewport edit from source-image pixels back into canvas-absolute override.
 */
export function patchScrollFromSourceViewport(
  preset,
  sourceViewport,
  sourceSize,
  overrides = null
) {
  const current = resolveScrollPreset(preset, overrides);
  if (!current) return null;
  const rel = scaleToPresetScreen(sourceViewport, sourceSize);
  const scroll = relativeToCanvasScroll({
    ...rel,
    borderRadius:
      sourceViewport.borderRadius != null
        ? sourceViewport.borderRadius
        : current.scroll.borderRadius,
  });
  return cloneScrollPresetDef({
    ...current,
    scroll,
  });
}

/**
 * Apply an arrow edit from source-image pixels back into canvas-absolute override.
 * @param {'up' | 'down'} which
 */
export function patchScrollButtonFromSource(
  preset,
  which,
  sourcePoint,
  sourceSize,
  overrides = null
) {
  const current = resolveScrollPreset(preset, overrides);
  if (!current || (which !== 'up' && which !== 'down')) return null;
  const rel = scaleToPresetScreen(
    { left: sourcePoint.left, top: sourcePoint.top, width: 1, height: 1 },
    sourceSize
  );
  return cloneScrollPresetDef({
    ...current,
    scroll_buttons: {
      ...current.scroll_buttons,
      [which]: {
        left: rel.left + SAMSUNG_SCREEN_FRAME.left,
        top: rel.top + SAMSUNG_SCREEN_FRAME.top,
      },
    },
  });
}

/**
 * EmulatorDisplay-ready fragment for one preset (screen + scroll + scroll_buttons).
 */
export function buildEmulatorDisplayPreset(preset, overrides = null) {
  return resolveScrollPreset(preset, overrides);
}

/** All scroll presets as EmulatorDisplay would nest under smart-tv / year. */
export function buildEmulatorDisplayScrollPresets(overrides = null) {
  const out = {};
  for (const key of Object.keys(SAMSUNG_SCROLL_PRESETS)) {
    out[key] = buildEmulatorDisplayPreset(key, overrides);
  }
  return out;
}
