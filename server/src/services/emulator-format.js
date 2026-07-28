/**
 * Emulator JSON format helpers for LG (CSS px left/top) and Samsung (numeric x/y).
 */

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

function finiteNum(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {{ left: number, top: number, width: number, height: number, target?: string, label?: string, popover?: object, type?: string }} btn
 * @param {'lg' | 'samsung'} platform
 * @returns {Record<string, unknown>}
 */
export function buttonToEmulator(btn, platform = 'lg') {
  if (platform === 'samsung') {
    const out = {
      width: finiteNum(btn.width, 1),
      height: finiteNum(btn.height, 1),
      x: finiteNum(btn.left, 0),
      y: finiteNum(btn.top, 0),
    };
    if (btn.target) out.target = btn.target;
    return out;
  }

  const out = {
    left: toPx(btn.left),
    top: toPx(btn.top),
    width: toPx(btn.width),
    height: toPx(btn.height),
  };
  if (btn.target) out.target = btn.target;
  if (btn.type) out.type = btn.type;
  if (btn.popover) out.popover = btn.popover;
  return out;
}

/**
 * Accepts LG (`left`/`top` px) or Samsung (`x`/`y` numbers) button shapes.
 * @param {Record<string, unknown>} btn
 * @param {{ id: string, screenId: string }} ids
 * @returns {object}
 */
export function buttonFromEmulator(btn, { id, screenId }) {
  const hasXy = btn.x != null || btn.y != null;
  const left = hasXy ? finiteNum(btn.x, 0) : parsePx(btn.left);
  const top = hasXy ? finiteNum(btn.y, 0) : parsePx(btn.top);
  const width = hasXy ? finiteNum(btn.width, 0) : parsePx(btn.width);
  const height = hasXy ? finiteNum(btn.height, 0) : parsePx(btn.height);

  return {
    id,
    screenId,
    label: typeof btn.popover?.title === 'string' ? btn.popover.title : '',
    target: typeof btn.target === 'string' ? btn.target : '',
    left,
    top,
    width,
    height,
    ...(btn.popover ? { popover: btn.popover } : {}),
    ...(btn.type ? { type: btn.type } : {}),
  };
}

function normalizeSamsungPreset(preset) {
  if (typeof preset === 'string' && preset.trim()) return preset.trim();
  if (typeof preset === 'number' && Number.isFinite(preset) && preset > 0) {
    return `preset${preset}`;
  }
  return 'preset2';
}

function normalizeLgPreset(preset) {
  if (typeof preset === 'number' && Number.isFinite(preset)) return preset;
  if (typeof preset === 'string') {
    const m = preset.match(/(\d+)/);
    if (m) return parseInt(m[1], 10) || 0;
  }
  return 0;
}

/**
 * @param {object} screen
 * @param {'lg' | 'samsung'} platform
 * @returns {Record<string, unknown>}
 */
function scrollAreaToEmulator(scrollArea) {
  if (!scrollArea || typeof scrollArea !== 'object') return null;
  const hasImage = Boolean(
    scrollArea.image?.trim() || scrollArea.img_filename?.trim()
  );
  if (!hasImage) return null;
  const imgFilename =
    scrollArea.img_filename ||
    stripImageExtension(scrollArea.image) ||
    '';
  if (!imgFilename) return null;
  return {
    img_filename: imgFilename,
    buttons: (scrollArea.buttons || []).map((b) =>
      buttonToEmulator(b, 'samsung')
    ),
  };
}

function scrollAreaFromEmulator(screenId, entry, meta, scrollImageFilename) {
  const raw = entry?.scroll_area;
  if (!raw || typeof raw !== 'object') return null;
  const imgFilename =
    typeof raw.img_filename === 'string' && raw.img_filename.trim()
      ? raw.img_filename.trim()
      : '';
  if (!imgFilename && !scrollImageFilename) return null;

  const scrollButtonIds = meta?.scrollButtonIds || [];
  const buttons = (raw.buttons || []).map((btn, i) =>
    buttonFromEmulator(btn, {
      id: scrollButtonIds[i] || '',
      screenId,
    })
  );

  return {
    img_filename: imgFilename || stripImageExtension(scrollImageFilename) || '',
    image: scrollImageFilename || '',
    buttons,
  };
}

export function screenToEmulator(screen, platform = 'lg') {
  const hasImage = Boolean(screen.image?.trim() || screen.img_filename?.trim());
  const imgFilename = !hasImage
    ? ''
    : screen.img_filename || stripImageExtension(screen.image) || screen.id;

  if (platform === 'samsung') {
    const out = {
      img_filename: imgFilename,
      preset: normalizeSamsungPreset(screen.preset),
      model: screen.model || 'smart-tv',
      buttons: (screen.buttons || []).map((b) => buttonToEmulator(b, 'samsung')),
      back_button: {
        target:
          typeof screen.backButtonTarget === 'string' ? screen.backButtonTarget : '',
      },
    };
    const scrollArea = scrollAreaToEmulator(screen.scrollArea);
    if (scrollArea) out.scroll_area = scrollArea;
    return out;
  }

  return {
    img_filename: imgFilename,
    preset: normalizeLgPreset(screen.preset),
    buttons: (screen.buttons || []).map((b) => buttonToEmulator(b, 'lg')),
  };
}

/**
 * @param {string} screenId
 * @param {Record<string, unknown>} entry
 * @param {{ graphX?: number, graphY?: number, sectionId?: string | null, buttonIds?: string[] } | undefined} meta
 * @param {string} imageFilename
 * @param {'lg' | 'samsung'} platform
 */
export function screenFromEmulator(
  screenId,
  entry,
  meta,
  imageFilename,
  platform = 'lg',
  scrollImageFilename = ''
) {
  const buttonIds = meta?.buttonIds || [];
  const buttons = (entry.buttons || []).map((btn, i) =>
    buttonFromEmulator(btn, {
      id: buttonIds[i] || '',
      screenId,
    })
  );

  const backTarget =
    entry.back_button && typeof entry.back_button === 'object'
      ? String(entry.back_button.target || '')
      : '';

  const base = {
    id: screenId,
    image: imageFilename,
    img_filename:
      typeof entry.img_filename === 'string' ? entry.img_filename : screenId,
    buttons,
    graphX: meta?.graphX ?? 0,
    graphY: meta?.graphY ?? 0,
    sectionId: meta?.sectionId ?? null,
  };

  if (platform === 'samsung') {
    const scrollArea = scrollAreaFromEmulator(
      screenId,
      entry,
      meta,
      scrollImageFilename
    );
    return {
      ...base,
      preset: normalizeSamsungPreset(entry.preset),
      model: typeof entry.model === 'string' && entry.model ? entry.model : 'smart-tv',
      backButtonTarget: backTarget,
      ...(scrollArea ? { scrollArea } : {}),
    };
  }

  return {
    ...base,
    preset: normalizeLgPreset(entry.preset),
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
