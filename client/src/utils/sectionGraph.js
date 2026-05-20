/**
 * Screens for section filtering.
 * `primary` — members of the active section.
 * `external` — linked screens in other sections (sidebar only; not shown on the section graph).
 */
export function getSectionGraphScreens(screens, activeSectionId) {
  if (!activeSectionId) {
    return { primary: screens, external: [] };
  }

  const primary = screens.filter((s) => s.sectionId === activeSectionId);
  const primaryIds = new Set(primary.map((s) => s.id));
  const externalIds = new Set();

  primary.forEach((screen) => {
    screen.buttons.forEach((btn) => {
      if (btn.target && !primaryIds.has(btn.target)) {
        externalIds.add(btn.target);
      }
    });
  });

  screens.forEach((screen) => {
    if (primaryIds.has(screen.id)) return;
    const pointsIn = screen.buttons.some(
      (btn) => btn.target && primaryIds.has(btn.target)
    );
    if (pointsIn) externalIds.add(screen.id);
  });

  const external = screens.filter((s) => externalIds.has(s.id));
  return { primary, external };
}

/** Next unused screen id that is a plain integer (1, 2, 3…), based on all emulator keys. */
export function getNextNumericScreenId(screens) {
  const existing = new Set(screens.map((s) => s.id));
  let max = 0;
  for (const id of existing) {
    if (/^\d+$/.test(id)) {
      max = Math.max(max, parseInt(id, 10));
    }
  }
  let n = max + 1;
  let id = String(n);
  while (existing.has(id)) {
    n += 1;
    id = String(n);
  }
  return id;
}

export function parseScreenIdFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  let id = base
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!id) id = 'screen';
  return id;
}

/** Screen id from an image filename; appends _2, _3… if the id is already taken. */
export function screenIdFromFilename(filename, existingIds) {
  const id = parseScreenIdFromFilename(filename);
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds);
  if (!existing.has(id)) return id;

  let n = 2;
  while (existing.has(`${id}_${n}`)) n += 1;
  return `${id}_${n}`;
}

/**
 * Resolve which screen should receive an imported file.
 * Reuses existing screens when the filename matches id or img_filename.
 */
export function resolveImportScreenId(filename, screens, assignedIds = new Set()) {
  const base = parseScreenIdFromFilename(filename);
  const assigned = assignedIds instanceof Set ? assignedIds : new Set(assignedIds);

  const byId = screens.find((s) => s.id === base);
  if (byId && !assigned.has(byId.id)) return byId.id;

  const byImage = screens.find((s) => {
    if (assigned.has(s.id)) return false;
    const imgName = (s.img_filename || s.id || '').replace(/\.[^.]+$/, '');
    const imageName = (s.image || '').replace(/\.[^.]+$/, '');
    return imgName === base || imageName === base;
  });
  if (byImage) return byImage.id;

  return screenIdFromFilename(
    filename,
    new Set([...screens.map((s) => s.id), ...assigned])
  );
}

/** Safe prefix for screen ids from a section display name or id. */
export function sanitizeScreenIdPrefix(str) {
  const id = String(str || '')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return id || 'section';
}

/** Unique section id derived from a display name. */
export function sectionIdFromName(name, sections) {
  const base = sanitizeScreenIdPrefix(name);
  const existing = new Set(sections.map((s) => s.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function suggestScreenId(sectionId, screens) {
  const prefix = `${sectionId}_`;
  const inSection = screens.filter((s) => s.sectionId === sectionId);
  let n = inSection.length + 1;
  let id = `${prefix}${String(n).padStart(2, '0')}`;
  const existing = new Set(screens.map((s) => s.id));
  while (existing.has(id)) {
    n += 1;
    id = `${prefix}${String(n).padStart(2, '0')}`;
  }
  return id;
}

/** Next screen id in a section using the section display name as prefix. */
export function suggestScreenIdForSection(section, screens) {
  const prefix = sanitizeScreenIdPrefix(section?.name || section?.id);
  const sectionId = section?.id;
  const inSection = sectionId
    ? screens.filter((s) => s.sectionId === sectionId)
    : [];
  let n = inSection.length + 1;
  let id = `${prefix}_${String(n).padStart(2, '0')}`;
  const existing = new Set(screens.map((s) => s.id));
  while (existing.has(id)) {
    n += 1;
    id = `${prefix}_${String(n).padStart(2, '0')}`;
  }
  return id;
}

export function sectionProgress(screens, sectionId) {
  const inSection = screens.filter((s) => s.sectionId === sectionId);
  const unlinkedButtons = inSection.reduce((n, s) => {
    return (
      n +
      s.buttons.filter((b) => !b.target || !screens.some((t) => t.id === b.target)).length
    );
  }, 0);
  return { screenCount: inSection.length, unlinkedButtons };
}
