export const DEFAULT_IMAGE_CONFIG = {
  intrinsicWidth: 1031,
  intrinsicHeight: 580,
};

export function normalizeImageConfig(cfg) {
  const c = cfg || {};
  return {
    intrinsicWidth: positiveInt(c.intrinsicWidth, DEFAULT_IMAGE_CONFIG.intrinsicWidth),
    intrinsicHeight: positiveInt(c.intrinsicHeight, DEFAULT_IMAGE_CONFIG.intrinsicHeight),
  };
}

function positiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** LG emulator / emulator.json coordinate space (default 1031×580). */
export function intrinsicSize(config) {
  return { width: config.intrinsicWidth, height: config.intrinsicHeight };
}

export function sourceSize(screen) {
  if (screen?.sourceWidth > 0 && screen?.sourceHeight > 0) {
    return { width: screen.sourceWidth, height: screen.sourceHeight };
  }
  return null;
}

export function scaleRect(rect, from, to) {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return {
    left: Math.round(rect.left * sx),
    top: Math.round(rect.top * sy),
    width: Math.round(rect.width * sx),
    height: Math.round(rect.height * sy),
  };
}

/** Align emulator.json coords with full screenshots (LG screen-stack inset). */
export const BUTTON_DISPLAY_OFFSET = { left: -92, top: -5 };
export const BUTTON_DISPLAY_OFFSET_NONE = { left: 0, top: 0 };

/** Samsung preset2 screen size (simulator data.json). */
export const SAMSUNG_PRESET2_SIZE = { intrinsicWidth: 658, intrinsicHeight: 370 };

export function displayOffsetForPlatform(platform) {
  return platform === 'samsung' ? BUTTON_DISPLAY_OFFSET_NONE : BUTTON_DISPLAY_OFFSET;
}

/** Align emulator.json coords with full screenshots (LG screen-stack inset). */
function offsetRect(rect, delta) {
  return {
    ...rect,
    left: rect.left + delta.left,
    top: rect.top + delta.top,
  };
}

/** Stored emulator coords → actual screenshot pixels for display. */
export function toSourceRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, product, src);
}

/** Emulator storage → on-screen pixels (scale + display offset). */
export function toDisplayRect(rect, screen, config, platform = 'lg') {
  return toSourceRect(
    offsetRect(rect, displayOffsetForPlatform(platform)),
    screen,
    config
  );
}

/** Screenshot pixels → emulator.json storage space. */
export function toIntrinsicRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, src, product);
}

/** On-screen pixels → emulator.json storage (inverse scale + offset). */
export function fromDisplayRect(rect, screen, config, platform = 'lg') {
  const delta = displayOffsetForPlatform(platform);
  return offsetRect(toIntrinsicRect(rect, screen, config), {
    left: -delta.left,
    top: -delta.top,
  });
}

export function defaultButtonSize(config) {
  const product = intrinsicSize(config);
  return {
    width: Math.max(16, Math.round((120 * product.width) / 1031)),
    height: Math.max(12, Math.round((60 * product.height) / 580)),
  };
}

/** Click in screenshot pixels; returns rect in emulator storage space. */
export function centerFromSourceClick(x, y, productSize, screen, config, platform = 'lg') {
  const src = sourceSize(screen) || intrinsicSize(config);
  const product = intrinsicSize(config);
  const sourceBtnSize = {
    width: Math.max(16, Math.round((productSize.width * src.width) / product.width)),
    height: Math.max(12, Math.round((productSize.height * src.height) / product.height)),
  };
  const sourceRect = {
    left: Math.round(x - sourceBtnSize.width / 2),
    top: Math.round(y - sourceBtnSize.height / 2),
    width: sourceBtnSize.width,
    height: sourceBtnSize.height,
  };
  return fromDisplayRect(sourceRect, screen, config, platform);
}
