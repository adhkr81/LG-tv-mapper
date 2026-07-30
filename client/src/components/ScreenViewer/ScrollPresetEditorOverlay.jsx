import React, { useCallback, useRef } from 'react';
import { getScrollControlSize } from '../../data/samsungScrollPresets.js';

const MIN_SIZE = 24;
const HANDLE_SIZE = 10;

/**
 * Editable scroll viewport + up/down arrow markers (source-image pixel space).
 * Arrow size matches Preview / EmulatorDisplay (30px on the 658-wide canvas).
 * @param frameScale CSS scale of the image frame (client px → source px).
 * @param sourceSize Natural screenshot size { width, height }.
 */
export default function ScrollPresetEditorOverlay({
  viewport,
  arrows,
  frameScale = 1,
  sourceSize = null,
  onViewportChange,
  onArrowChange,
}) {
  const dragRef = useRef(null);

  const startDrag = useCallback(
    (e, kind, handle = null) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startViewport = { ...viewport };
      const startArrows = {
        up: { ...arrows?.up },
        down: { ...arrows?.down },
      };
      const scale = Math.max(0.01, frameScale);

      const onMove = (ev) => {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;

        if (kind === 'viewport') {
          onViewportChange?.({
            ...startViewport,
            left: Math.round(startViewport.left + dx),
            top: Math.round(startViewport.top + dy),
          });
          return;
        }

        if (kind === 'resize' && handle) {
          let { left, top, width, height } = startViewport;
          if (handle.includes('w')) {
            const nextLeft = left + dx;
            const nextWidth = width - dx;
            if (nextWidth >= MIN_SIZE) {
              left = nextLeft;
              width = nextWidth;
            }
          }
          if (handle.includes('e')) {
            width = Math.max(MIN_SIZE, width + dx);
          }
          if (handle.includes('n')) {
            const nextTop = top + dy;
            const nextHeight = height - dy;
            if (nextHeight >= MIN_SIZE) {
              top = nextTop;
              height = nextHeight;
            }
          }
          if (handle.includes('s')) {
            height = Math.max(MIN_SIZE, height + dy);
          }
          onViewportChange?.({
            ...startViewport,
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width),
            height: Math.round(height),
          });
          return;
        }

        if ((kind === 'up' || kind === 'down') && startArrows[kind]) {
          onArrowChange?.(kind, {
            left: Math.round(startArrows[kind].left + dx),
            top: Math.round(startArrows[kind].top + dy),
          });
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        dragRef.current = null;
      };

      dragRef.current = { onMove, onUp };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [viewport, arrows, frameScale, onViewportChange, onArrowChange]
  );

  if (!viewport) return null;

  const displayBtn = getScrollControlSize(sourceSize);
  const iconSize = Math.max(10, Math.round(displayBtn * (14 / 30)));
  const handles = ['nw', 'ne', 'sw', 'se'];

  return (
    <>
      <div
        className="screen-viewer__scroll-viewport-guide screen-viewer__scroll-viewport-guide--editable"
        style={{
          left: viewport.left,
          top: viewport.top,
          width: viewport.width,
          height: viewport.height,
          borderRadius: viewport.borderRadius || 0,
        }}
        onPointerDown={(e) => startDrag(e, 'viewport')}
        title="Drag to move scroll area · resize from corners"
      >
        {handles.map((h) => (
          <span
            key={h}
            className={`screen-viewer__scroll-handle screen-viewer__scroll-handle--${h}`}
            style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
            onPointerDown={(e) => startDrag(e, 'resize', h)}
          />
        ))}
      </div>

      {arrows?.up && (
        <button
          type="button"
          className="screen-viewer__scroll-arrow screen-viewer__scroll-arrow--up"
          style={{
            left: arrows.up.left,
            top: arrows.up.top,
            width: displayBtn,
            height: displayBtn,
          }}
          onPointerDown={(e) => startDrag(e, 'up')}
          title="Drag scroll-up control"
        >
          <ScrollChevron size={iconSize} />
        </button>
      )}
      {arrows?.down && (
        <button
          type="button"
          className="screen-viewer__scroll-arrow screen-viewer__scroll-arrow--down"
          style={{
            left: arrows.down.left,
            top: arrows.down.top,
            width: displayBtn,
            height: displayBtn,
          }}
          onPointerDown={(e) => startDrag(e, 'down')}
          title="Drag scroll-down control"
        >
          <ScrollChevron size={iconSize} />
        </button>
      )}
    </>
  );
}

function ScrollChevron({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 14l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
