/** LG simroom / emulator reference sizes (quick-settings-main.jpg). */
export const DEFAULT_IMAGE_CONFIG = {
  intrinsicWidth: 1031,
  intrinsicHeight: 580,
};

/**
 * @param {Partial<typeof DEFAULT_IMAGE_CONFIG>} [cfg]
 */
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

/** Coordinate space used in emulator.json button positions. */
export function intrinsicSize(config) {
  return { width: config.intrinsicWidth, height: config.intrinsicHeight };
}

/**
 * @param {{ sourceWidth?: number | null, sourceHeight?: number | null }} screen
 */
export function sourceSize(screen) {
  if (screen.sourceWidth > 0 && screen.sourceHeight > 0) {
    return { width: screen.sourceWidth, height: screen.sourceHeight };
  }
  return null;
}

/**
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {{ width: number, height: number }} from
 * @param {{ width: number, height: number }} to
 */
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

/**
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {{ sourceWidth?: number | null, sourceHeight?: number | null }} screen
 * @param {ReturnType<typeof normalizeImageConfig>} config
 */
export function toIntrinsicRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, src, product);
}

/**
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {{ sourceWidth?: number | null, sourceHeight?: number | null }} screen
 * @param {ReturnType<typeof normalizeImageConfig>} config
 */
export function toSourceRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, product, src);
}

/**
 * @param {ReturnType<typeof normalizeImageConfig>} config
 */
export function defaultButtonSize(config) {
  const product = intrinsicSize(config);
  return {
    width: Math.max(16, Math.round((120 * product.width) / 1031)),
    height: Math.max(12, Math.round((60 * product.height) / 580)),
  };
}

/**
 * Detect buttons stored in screenshot pixels instead of intrinsic product space.
 * @param {{ buttons: Array<{ left: number, top: number, width: number, height: number }>, sourceWidth?: number | null, sourceHeight?: number | null }} screen
 * @param {ReturnType<typeof normalizeImageConfig>} config
 */
export function screenLikelySourceSpace(screen, config) {
  if (!screen.buttons?.length || !sourceSize(screen)) return false;
  const product = intrinsicSize(config);
  const maxX = Math.max(...screen.buttons.map((b) => b.left + b.width));
  const maxY = Math.max(...screen.buttons.map((b) => b.top + b.height));
  return maxX > product.width * 1.05 || maxY > product.height * 1.05;
}
