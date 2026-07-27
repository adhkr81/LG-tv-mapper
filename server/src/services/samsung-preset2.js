/**
 * Samsung preset2 screen size (simulator data.json screen width/height).
 * Full HDMI captures (1920×1080) are scaled to this size — no crop —
 * so the entire TV UI fits the preset2 screen.
 */
export const SAMSUNG_PRESET2 = {
  width: 658,
  height: 370,
  /** Source capture size we normalize from. */
  sourceWidth: 1920,
  sourceHeight: 1080,
};

/**
 * Map a rect from capture/source pixels into preset2 space.
 * @param {{ left?: number, top?: number, x?: number, y?: number, width?: number, height?: number }} rect
 * @param {{ width?: number, height?: number }} [from] defaults to 1920×1080
 */
export function mapRectToPreset2(rect, from = {}) {
  const fromW = from.width || SAMSUNG_PRESET2.sourceWidth;
  const fromH = from.height || SAMSUNG_PRESET2.sourceHeight;
  const { width: tw, height: th } = SAMSUNG_PRESET2;
  return {
    left: Math.round(((rect.left ?? rect.x ?? 0) * tw) / fromW),
    top: Math.round(((rect.top ?? rect.y ?? 0) * th) / fromH),
    width: Math.round(((rect.width ?? 0) * tw) / fromW),
    height: Math.round(((rect.height ?? 0) * th) / fromH),
  };
}

export function mapSamsungButtonToPreset2(btn, from) {
  const mapped = mapRectToPreset2(
    {
      left: btn.x ?? btn.left ?? 0,
      top: btn.y ?? btn.top ?? 0,
      width: btn.width ?? 0,
      height: btn.height ?? 0,
    },
    from
  );
  const out = {
    width: mapped.width,
    height: mapped.height,
    x: mapped.left,
    y: mapped.top,
  };
  if (btn.target) out.target = btn.target;
  return out;
}

/** Invert a previous crop-based preset2 mapping back to 1920×1080 capture space. */
export function invertLegacyCropToSource(btn) {
  const crop = { left: 95, top: 8, width: 1024, height: 575 };
  const { width: tw, height: th } = SAMSUNG_PRESET2;
  return {
    width: Math.round(((btn.width ?? 0) * crop.width) / tw),
    height: Math.round(((btn.height ?? 0) * crop.height) / th),
    x: Math.round(((btn.x ?? 0) * crop.width) / tw + crop.left),
    y: Math.round(((btn.y ?? 0) * crop.height) / th + crop.top),
    ...(btn.target ? { target: btn.target } : {}),
  };
}
