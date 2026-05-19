/**
 * Screens visible in the graph when a section is active.
 * Includes section members plus external screens linked across section boundaries.
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
