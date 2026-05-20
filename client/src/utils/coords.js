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

export function toIntrinsicRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, src, product);
}

export function toSourceRect(rect, screen, config) {
  const src = sourceSize(screen);
  const product = intrinsicSize(config);
  if (!src) return rect;
  if (src.width === product.width && src.height === product.height) return rect;
  return scaleRect(rect, product, src);
}

export function defaultButtonSize(config) {
  const product = intrinsicSize(config);
  return {
    width: Math.max(16, Math.round((120 * product.width) / 1031)),
    height: Math.max(12, Math.round((60 * product.height) / 580)),
  };
}

/** Place a hotspot from a click in screenshot pixel space; returns intrinsic (product) rect. */
export function centerFromSourceClick(x, y, productSize, screen, config) {
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
  return scaleRect(sourceRect, src, product);
}
