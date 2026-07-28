/** Count navigation buttons on other screens that target the deleted node(s). */
export function countInboundButtons(screens, deletedIds) {
  const idSet = new Set(deletedIds);
  let count = 0;
  const parentScreenIds = new Set();
  for (const screen of screens) {
    if (idSet.has(screen.id)) continue;
    const buttons = [
      ...(screen.buttons || []),
      ...(screen.scrollArea?.buttons || []),
    ];
    for (const btn of buttons) {
      if (btn.target && idSet.has(btn.target)) {
        count += 1;
        parentScreenIds.add(screen.id);
      }
    }
  }
  return { count, parentScreenCount: parentScreenIds.size };
}

function formatDeleteLabel(ids) {
  if (ids.length === 1) return `"${ids[0]}"`;
  return `${ids.length} nodes (${ids.join(', ')})`;
}

/**
 * Confirm node deletion from the graph (keyboard / flow canvas).
 * @returns {{ ids: string[], removeParentButtons: boolean } | null}
 */
export function promptDeleteScreens(screens, selectedIds) {
  const ids = [...new Set(selectedIds)].filter(Boolean);
  if (!ids.length) return null;

  const label = formatDeleteLabel(ids);
  if (
    !confirm(
      `Permanently delete ${label} from the graph?\n\n` +
        'This removes each node entirely (image, buttons, and links on those nodes).'
    )
  ) {
    return null;
  }

  const inbound = countInboundButtons(screens, ids);
  let removeParentButtons = false;
  if (inbound.count > 0) {
    removeParentButtons = confirm(
      `${inbound.count} navigation button${inbound.count === 1 ? '' : 's'} on ` +
        `${inbound.parentScreenCount} parent screen${inbound.parentScreenCount === 1 ? '' : 's'} ` +
        `point to the node${ids.length === 1 ? '' : 's'} you are deleting.\n\n` +
        'OK — remove those parent buttons too\n' +
        'Cancel — keep them (they will target missing screens)'
    );
  }

  return { ids, removeParentButtons };
}
