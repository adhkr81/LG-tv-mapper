export const DEFAULT_BUTTON_SIZE = { width: 120, height: 60 };

/** Normalize legacy x/y center coords to left/top/width/height. */
export function normalizeButton(btn) {
  if (
    btn.left != null &&
    btn.top != null &&
    btn.width != null &&
    btn.height != null
  ) {
    return btn;
  }

  const width = btn.width ?? DEFAULT_BUTTON_SIZE.width;
  const height = btn.height ?? DEFAULT_BUTTON_SIZE.height;
  const x = btn.x ?? 0;
  const y = btn.y ?? 0;

  return {
    ...btn,
    left: Math.round(x - width / 2),
    top: Math.round(y - height / 2),
    width,
    height,
  };
}

export function rectCenteredAt(x, y, size = DEFAULT_BUTTON_SIZE) {
  return {
    left: Math.round(x - size.width / 2),
    top: Math.round(y - size.height / 2),
    width: size.width,
    height: size.height,
  };
}
