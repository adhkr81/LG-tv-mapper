import { MarkerType } from '@xyflow/react';
import {
  getCollapsedSectionIds,
  getSectionGraphScreens,
  isRealSectionView,
  sectionNodeId,
} from './sectionGraph.js';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 185;
const SECTION_NODE_WIDTH = 220;
const STAGING_GAP_X = 280;
const SECTION_GAP_X = 320;
const ROW_STEP_Y = 185;
const COL_STEP_X = 220;
const UNGROUPED_KEY = '__ungrouped__';

const SECTION_NODE_COLORS = [
  '#7c4dff',
  '#00bfa5',
  '#ff6d00',
  '#e91e63',
  '#00b0ff',
  '#c6ff00',
  '#ff4081',
  '#40c4ff',
];

function sectionAccentColor(index) {
  return SECTION_NODE_COLORS[index % SECTION_NODE_COLORS.length];
}

export function defaultNodePosition(index) {
  return { x: (index % 4) * COL_STEP_X, y: Math.floor(index / 4) * ROW_STEP_Y };
}

export function positionsOverlap(a, b) {
  return (
    Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT
  );
}

export function getSavedPosition(screen, index) {
  if (screen.graphX != null && screen.graphY != null) {
    return ensureFinitePosition({ x: screen.graphX, y: screen.graphY });
  }
  return defaultNodePosition(index);
}

export function ensureFinitePosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

/**
 * Compact structural signature for the React Flow layout inputs.
 *
 * Mirrors only the fields `buildSectionGraphFlow` actually reads: positions,
 * section membership, target ids, image presence, collapsed state, band
 * offsets. Crucially, button rect/label/popover fields are excluded — that's
 * what lets us memoize the graph and skip relayout on every hotspot drag.
 */
export function graphLayoutSignature(screens, activeSectionId, sections) {
  const parts = [activeSectionId ?? ''];
  for (const sec of sections) {
    parts.push(
      's',
      sec.id,
      sec.name || '',
      sec.rootScreenId ?? '',
      sec.collapsed ? '1' : '0',
      sec.bandX ?? '',
      sec.bandY ?? ''
    );
  }
  for (const screen of screens) {
    parts.push(
      'p',
      screen.id,
      screen.sectionId ?? '',
      screen.graphX ?? '',
      screen.graphY ?? '',
      screen.image ? '1' : '0',
      String(screen.buttons.length)
    );
    for (const btn of screen.buttons) {
      parts.push('b', btn.id, btn.target || '');
    }
  }
  return parts.join('|');
}

/** Drop edges whose endpoints are missing in the current node list. */
export function filterEdgesToNodes(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

/** Selection ids that exist in the current graph. */
export function filterSelectionToNodes(nodes, selectedIds) {
  const ids = new Set(nodes.map((n) => n.id));
  return selectedIds.filter((id) => ids.has(id));
}

/** True when every selected id is missing from the current graph (e.g. collapsed section). */
export function isOffCanvasScreenSelection(nodes, selectedIds) {
  if (!selectedIds?.length) return false;
  return filterSelectionToNodes(nodes, selectedIds).length === 0;
}

/** First free slot in the staging column (right of the main flow). */
export function nextStagingPosition(occupied, stagingX, startIndex = 0) {
  let index = startIndex;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = { x: stagingX, y: index * ROW_STEP_Y };
    if (!occupied.some((p) => positionsOverlap(candidate, p))) {
      return candidate;
    }
    index += 1;
  }
  return { x: stagingX, y: index * ROW_STEP_Y };
}

/** Next graph position for a new screen in the active section (or all screens). */
export function nextScreenGraphPosition(screens, activeSectionId = null) {
  const primary = isRealSectionView(activeSectionId)
    ? screens.filter((s) => s.sectionId === activeSectionId)
    : screens;
  const occupied = primary.map((s) =>
    getSavedPosition(s, 0)
  );
  const maxX =
    primary.length === 0
      ? 0
      : Math.max(...primary.map((s) => getSavedPosition(s, 0).x));
  return nextStagingPosition(occupied, maxX + STAGING_GAP_X);
}

/** Position for a node being added while capture is in progress. */
export function nextNewNodePosition(existingNodes) {
  const occupied = existingNodes.map((n) => n.position);
  const primary = existingNodes.filter((n) => !n.data?.isExternal);
  const maxX =
    primary.length === 0
      ? 0
      : Math.max(...primary.map((n) => n.position.x));
  return nextStagingPosition(occupied, maxX + STAGING_GAP_X);
}

/** Convert a displayed node position back to stored graph coordinates. */
export function toStoredGraphPosition(node) {
  const offset = node.data?.viewOffset;
  if (!offset) {
    return ensureFinitePosition(node.position);
  }
  return ensureFinitePosition({
    x: node.position.x - offset.x,
    y: node.position.y - offset.y,
  });
}

/** Build API/store updates from React Flow nodes. */
export function buildGraphPositionUpdates(nodes) {
  return nodes.map((node) => {
    const { x, y } = toStoredGraphPosition(node);
    return { screenId: node.id, graphX: x, graphY: y };
  });
}

/** Persist each section's top-left anchor on the All screens canvas. */
export function buildSectionBandUpdates(nodes) {
  const updates = [];
  const fromSectionNode = new Set();

  for (const node of nodes) {
    if (node.type === 'sectionNode' && node.data?.sectionId) {
      const sectionId = node.data.sectionId;
      fromSectionNode.add(sectionId);
      // The collapsed summary may be rendered offset from the band's top-left
      // so it sits where the root screen would be when expanded. Subtract that
      // offset so the persisted band matches what gets rendered back next time.
      const offset = node.data.bandAnchorOffset ?? { x: 0, y: 0 };
      updates.push({
        sectionId,
        bandX: Math.round(node.position.x - offset.x),
        bandY: Math.round(node.position.y - offset.y),
      });
    }
  }

  const groups = new Map();
  for (const node of nodes) {
    if (node.type === 'sectionNode') continue;
    const sectionId = node.data?.sectionId;
    if (!sectionId || fromSectionNode.has(sectionId)) continue;
    if (!groups.has(sectionId)) groups.set(sectionId, []);
    groups.get(sectionId).push(node);
  }

  for (const [sectionId, groupNodes] of groups) {
    const xs = groupNodes.map((n) => n.position.x);
    const ys = groupNodes.map((n) => n.position.y);
    updates.push({
      sectionId,
      bandX: Math.round(Math.min(...xs)),
      bandY: Math.round(Math.min(...ys)),
    });
  }
  return updates;
}

function collectSectionEdges(visibleScreens, screenIds, externalIds) {
  const edges = [];
  const connectedIds = new Set();

  visibleScreens.forEach((screen) => {
    screen.buttons.forEach((btn) => {
      if (btn.target && screenIds.has(btn.target)) {
        connectedIds.add(screen.id);
        connectedIds.add(btn.target);
        const crossSection =
          externalIds.has(screen.id) || externalIds.has(btn.target);
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

  return { edges, connectedIds };
}

function graphEndpointId(screen, collapsedSectionIds) {
  if (screen.sectionId && collapsedSectionIds.has(screen.sectionId)) {
    return sectionNodeId(screen.sectionId);
  }
  return screen.id;
}

function isCrossSectionLink(screen, target, sourceId, targetId) {
  if (sourceId.startsWith('section:') || targetId.startsWith('section:')) {
    return true;
  }
  return screen.sectionId !== target?.sectionId;
}

function collectAllScreensEdges(screens, collapsedSectionIds = new Set()) {
  const screenIds = new Set(screens.map((s) => s.id));
  const byId = new Map(screens.map((s) => [s.id, s]));

  // Group buttons by their effective (source, target) endpoints after the
  // collapse remapping. Multiple buttons that all point into the same
  // collapsed section would otherwise produce overlapping duplicate edges.
  const grouped = new Map();

  screens.forEach((screen) => {
    screen.buttons.forEach((btn) => {
      if (!btn.target || !screenIds.has(btn.target)) return;
      const target = byId.get(btn.target);
      const sourceId = graphEndpointId(screen, collapsedSectionIds);
      const targetId = graphEndpointId(target, collapsedSectionIds);
      if (sourceId === targetId) return;

      const key = `${sourceId}->${targetId}`;
      let group = grouped.get(key);
      if (!group) {
        group = {
          sourceId,
          targetId,
          buttons: [],
          crossSection: isCrossSectionLink(screen, target, sourceId, targetId),
        };
        grouped.set(key, group);
      }
      group.buttons.push(btn);
    });
  });

  const edges = [];
  for (const { sourceId, targetId, buttons, crossSection } of grouped.values()) {
    const first = buttons[0];
    const count = buttons.length;
    edges.push({
      // Use a stable per-pair id when consolidating, otherwise keep the
      // original button id so non-collapsed edges stay individually editable.
      id: count > 1 ? `e-pair-${sourceId}->${targetId}` : `e-${first.id}`,
      source: sourceId,
      target: targetId,
      label: count > 1 ? undefined : first.label,
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

  return edges;
}

function groupScreensBySection(screens) {
  const map = new Map();
  for (const screen of screens) {
    const key = screen.sectionId ?? UNGROUPED_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(screen);
  }

  const keys = [...map.keys()].sort((a, b) => {
    if (a === UNGROUPED_KEY) return -1;
    if (b === UNGROUPED_KEY) return 1;
    return a.localeCompare(b);
  });

  return keys.map((key) => ({
    sectionId: key === UNGROUPED_KEY ? null : key,
    primary: map.get(key),
  }));
}

/** Layout nodes for one section's members (local coordinates). */
function buildGroupNodes(primary, external, sectionId) {
  const visibleScreens = [...primary, ...external];
  const externalIds = new Set(external.map((s) => s.id));
  const screenIds = new Set(visibleScreens.map((s) => s.id));
  const primaryIndex = new Map(primary.map((s, i) => [s.id, i]));

  const { connectedIds } = collectSectionEdges(
    visibleScreens,
    screenIds,
    externalIds
  );

  const flowPositions = primary
    .filter((s) => connectedIds.has(s.id))
    .map((s) => getSavedPosition(s, primaryIndex.get(s.id)));

  const maxFlowX =
    flowPositions.length === 0
      ? 0
      : Math.max(...flowPositions.map((p) => p.x));
  const stagingX = maxFlowX + STAGING_GAP_X;

  const occupied = [...flowPositions];
  let stagingSlot = 0;

  return visibleScreens.map((screen) => {
    const isExternal = externalIds.has(screen.id);
    const isOrphan = !isExternal && !connectedIds.has(screen.id);
    const index = primaryIndex.get(screen.id) ?? 0;

    let position = getSavedPosition(screen, index);

    if (isExternal && sectionId) {
      position = nextStagingPosition(occupied, stagingX, stagingSlot);
      stagingSlot += 1;
    } else if (isOrphan) {
      const saved = getSavedPosition(screen, index);
      const overlapsFlow = occupied.some((p) => positionsOverlap(saved, p));
      if (overlapsFlow) {
        position = nextStagingPosition(occupied, stagingX, stagingSlot);
        stagingSlot += 1;
      } else {
        position = saved;
      }
    }

    occupied.push(position);

    return {
      id: screen.id,
      type: 'screenNode',
      position: ensureFinitePosition(position),
      data: {
        label: screen.id,
        image: screen.image,
        buttonCount: screen.buttons.length,
        isExternal,
        sectionId: screen.sectionId ?? null,
      },
    };
  });
}

/** Band anchor and canvas positions for a section on the All screens view. */
function computeSectionBandLayout(primary, sectionMeta, autoOffsetX, sectionId) {
  const groupNodes = buildGroupNodes(primary, [], sectionId);
  const xs = groupNodes.map((n) => n.position.x);
  const minX = Math.min(...xs);
  const minY = Math.min(...groupNodes.map((n) => n.position.y));
  const maxX = Math.max(...xs);
  const groupWidth = maxX - minX + NODE_WIDTH + STAGING_GAP_X;

  // Ungrouped screens live in absolute graph coords — no band shift.
  // Without this, the auto-computed viewOffset depends on the current min(x/y)
  // of the ungrouped cluster, so moving one screen would shift the offset on
  // the next render and cause every persist to drift the others by a few px.
  if (!sectionId) {
    return {
      groupNodes,
      bandX: minX,
      bandY: minY,
      viewOffset: { x: 0, y: 0 },
      groupWidth,
      hasSavedBand: true,
    };
  }

  const hasSavedBand =
    sectionMeta != null && Number.isFinite(sectionMeta.bandX);
  const bandX = hasSavedBand ? sectionMeta.bandX : autoOffsetX;
  const bandY =
    hasSavedBand && Number.isFinite(sectionMeta.bandY)
      ? sectionMeta.bandY
      : 0;
  const viewOffset = { x: bandX - minX, y: bandY - minY };

  return {
    groupNodes,
    bandX,
    bandY,
    viewOffset,
    groupWidth,
    hasSavedBand,
  };
}

/**
 * Where a collapsed summary node should sit (root screen, else band top-left).
 * Also reports the offset from the band's top-left to the summary node, so the
 * persist step can reverse it when the user drags the summary.
 */
function collapsedSectionNodePosition(layout, sectionMeta) {
  const { groupNodes, bandX, bandY, viewOffset } = layout;

  const rootId = sectionMeta?.rootScreenId;
  const rootNode = rootId ? groupNodes.find((n) => n.id === rootId) : null;
  if (rootNode) {
    const position = ensureFinitePosition({
      x: rootNode.position.x + viewOffset.x,
      y: rootNode.position.y + viewOffset.y,
    });
    return {
      position,
      anchorOffset: { x: position.x - bandX, y: position.y - bandY },
    };
  }

  return {
    position: ensureFinitePosition({ x: bandX, y: bandY }),
    anchorOffset: { x: 0, y: 0 },
  };
}

function buildSectionSummaryNode({
  sectionId,
  primary,
  meta,
  position,
  anchorOffset,
  colorIndex,
}) {
  const linkCount = primary.reduce((n, s) => n + s.buttons.length, 0);
  return {
    id: sectionNodeId(sectionId),
    type: 'sectionNode',
    position: ensureFinitePosition(position),
    connectable: false,
    data: {
      label: meta?.name ?? sectionId,
      screenCount: primary.length,
      linkCount,
      sectionId,
      color: sectionAccentColor(colorIndex),
      collapsed: true,
      bandAnchorOffset: anchorOffset ?? { x: 0, y: 0 },
    },
  };
}

/** All screens: per-section bands; collapsed sections render as one node. */
function buildAllScreensGraphFlow(
  screens,
  sections = [],
  collapsedSectionIds = new Set()
) {
  const groups = groupScreensBySection(screens);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sectionIndexById = new Map(sections.map((s, i) => [s.id, i]));
  const allNodes = [];
  let autoOffsetX = 0;

  for (const { sectionId, primary } of groups) {
    if (!primary.length) continue;

    const sectionMeta = sectionId ? sectionById.get(sectionId) : null;
    const isCollapsed = sectionId && collapsedSectionIds.has(sectionId);

    if (isCollapsed) {
      const layout = computeSectionBandLayout(
        primary,
        sectionMeta,
        autoOffsetX,
        sectionId
      );
      const { groupWidth, hasSavedBand } = layout;
      const { position, anchorOffset } = collapsedSectionNodePosition(
        layout,
        sectionMeta
      );

      allNodes.push(
        buildSectionSummaryNode({
          sectionId,
          primary,
          meta: sectionMeta,
          position,
          anchorOffset,
          colorIndex: sectionIndexById.get(sectionId) ?? 0,
        })
      );

      const bandRight = position.x + groupWidth;
      if (!hasSavedBand) {
        autoOffsetX = Math.max(
          autoOffsetX,
          position.x + SECTION_NODE_WIDTH + SECTION_GAP_X
        );
      } else {
        autoOffsetX = Math.max(autoOffsetX, bandRight + SECTION_GAP_X);
      }
      continue;
    }

    const { groupNodes, viewOffset, groupWidth, hasSavedBand, bandX } =
      computeSectionBandLayout(primary, sectionMeta, autoOffsetX, sectionId);

    groupNodes.forEach((node) => {
      allNodes.push({
        ...node,
        position: {
          x: node.position.x + viewOffset.x,
          y: node.position.y + viewOffset.y,
        },
        data: {
          ...node.data,
          viewOffset,
        },
      });
    });

    const bandRight = bandX + groupWidth;
    if (!hasSavedBand) {
      autoOffsetX += groupWidth + SECTION_GAP_X;
    } else {
      autoOffsetX = Math.max(autoOffsetX, bandRight + SECTION_GAP_X);
    }
  }

  const edges = filterEdgesToNodes(
    allNodes,
    collectAllScreensEdges(screens, collapsedSectionIds)
  );
  return { nodes: allNodes, edges, visibleScreens: screens };
}

/** React Flow nodes and edges for the active section (same layout as the main graph). */
export function buildSectionGraphFlow(screens, activeSectionId, sections = []) {
  if (!activeSectionId) {
    return buildAllScreensGraphFlow(
      screens,
      sections,
      getCollapsedSectionIds(sections)
    );
  }

  const { primary } = getSectionGraphScreens(screens, activeSectionId);
  const screenIds = new Set(primary.map((s) => s.id));
  const nodes = buildGroupNodes(primary, [], activeSectionId);
  const { edges } = collectSectionEdges(primary, screenIds, new Set());

  return {
    nodes,
    edges: filterEdgesToNodes(nodes, edges),
    visibleScreens: primary,
  };
}

