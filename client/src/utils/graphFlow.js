import { MarkerType } from '@xyflow/react';
import { getSectionGraphScreens } from './sectionGraph.js';

export function defaultNodePosition(index) {
  return { x: (index % 4) * 220, y: Math.floor(index / 4) * 185 };
}

export function getSavedPosition(screen, index) {
  if (screen.graphX != null && screen.graphY != null) {
    return { x: screen.graphX, y: screen.graphY };
  }
  return defaultNodePosition(index);
}

/** React Flow nodes and edges for the active section (same layout as the main graph). */
export function buildSectionGraphFlow(screens, activeSectionId) {
  const { primary, external } = getSectionGraphScreens(screens, activeSectionId);
  const visibleScreens = [...primary, ...external];
  const externalIds = new Set(external.map((s) => s.id));
  const screenIds = new Set(visibleScreens.map((s) => s.id));

  const maxPrimaryX =
    primary.length === 0
      ? 0
      : Math.max(...primary.map((s, i) => getSavedPosition(s, i).x));

  const nodes = visibleScreens.map((screen, i) => {
    const isExternal = externalIds.has(screen.id);
    let position = getSavedPosition(screen, i);
    if (isExternal && activeSectionId) {
      const extIndex = external.findIndex((s) => s.id === screen.id);
      position = {
        x: maxPrimaryX + 280,
        y: extIndex * 185,
      };
    }
    return {
      id: screen.id,
      type: 'screenNode',
      position,
      data: {
        label: screen.id,
        image: screen.image,
        buttonCount: screen.buttons.length,
        isExternal,
      },
    };
  });

  const edges = [];
  visibleScreens.forEach((screen) => {
    screen.buttons.forEach((btn) => {
      if (btn.target && screenIds.has(btn.target)) {
        const crossSection = externalIds.has(screen.id) || externalIds.has(btn.target);
        edges.push({
          id: `e-${btn.id}`,
          source: screen.id,
          target: btn.target,
          label: btn.label,
          animated: !crossSection,
          style: {
            stroke: crossSection ? '#ffab00' : '#00e5ff',
            strokeWidth: 2,
            strokeDasharray: crossSection ? '6 4' : undefined,
          },
          labelStyle: { fill: '#8a8a9e', fontSize: 11 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: crossSection ? '#ffab00' : '#00e5ff',
            width: 16,
            height: 16,
          },
        });
      }
    });
  });

  return { nodes, edges, visibleScreens };
}
