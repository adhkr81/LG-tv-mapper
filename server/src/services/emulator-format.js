/**
 * Parse emulator CSS pixel value to integer.
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function parsePx(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.round(value);
  const n = parseInt(String(value).replace(/px$/i, '').trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Format integer as emulator CSS pixel string.
 * @param {number} n
 * @returns {string}
 */
export function toPx(n) {
  return `${Math.round(n)}px`;
}

/**
 * @param {{ left: number, top: number, width: number, height: number, target?: string, label?: string, popover?: object, type?: string }} btn
 * @returns {Record<string, unknown>}
 */
export function buttonToEmulator(btn) {
  const out = {
    left: toPx(btn.left),
    top: toPx(btn.top),
    width: toPx(btn.width),
    height: toPx(btn.height),
  };
  if (btn.target) out.target = btn.target;
  if (btn.type) out.type = btn.type;
  if (btn.popover) {
    out.popover = btn.popover;
  } else if (btn.label) {
    out.popover = {
      title: btn.label,
      text: '',
      style: { top: '0%', left: '0%' },
    };
  }
  return out;
}

/**
 * @param {Record<string, unknown>} btn
 * @param {{ id: string, screenId: string }} ids
 * @returns {object}
 */
export function buttonFromEmulator(btn, { id, screenId }) {
  return {
    id,
    screenId,
    label: typeof btn.popover?.title === 'string' ? btn.popover.title : '',
    target: typeof btn.target === 'string' ? btn.target : '',
    left: parsePx(btn.left),
    top: parsePx(btn.top),
    width: parsePx(btn.width),
    height: parsePx(btn.height),
    ...(btn.popover ? { popover: btn.popover } : {}),
    ...(btn.type ? { type: btn.type } : {}),
  };
}

/**
 * @param {{ id: string, image: string, img_filename?: string, preset?: number, buttons: object[] }} screen
 * @returns {Record<string, unknown>}
 */
export function screenToEmulator(screen) {
  const imgFilename =
    screen.img_filename || stripImageExtension(screen.image) || screen.id;
  return {
    img_filename: imgFilename,
    preset: screen.preset ?? 0,
    buttons: screen.buttons.map(buttonToEmulator),
  };
}

/**
 * @param {string} screenId
 * @param {Record<string, unknown>} entry
 * @param {{ graphX?: number, graphY?: number, sectionId?: string | null, buttonIds?: string[] } | undefined} meta
 * @param {string} imageFilename
 */
export function screenFromEmulator(screenId, entry, meta, imageFilename) {
  const buttonIds = meta?.buttonIds || [];
  const buttons = (entry.buttons || []).map((btn, i) =>
    buttonFromEmulator(btn, {
      id: buttonIds[i] || '',
      screenId,
    })
  );

  return {
    id: screenId,
    image: imageFilename,
    img_filename:
      typeof entry.img_filename === 'string' ? entry.img_filename : screenId,
    preset: typeof entry.preset === 'number' ? entry.preset : 0,
    buttons,
    graphX: meta?.graphX ?? 0,
    graphY: meta?.graphY ?? 0,
    sectionId: meta?.sectionId ?? null,
  };
}

/**
 * @param {string} filename
 * @returns {string}
 */
export function stripImageExtension(filename) {
  if (!filename) return '';
  return filename.replace(/\.(jpe?g|png|webp)$/i, '');
}
