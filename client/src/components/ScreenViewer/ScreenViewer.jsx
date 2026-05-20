import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import {
  centerFromSourceClick,
  defaultButtonSize,
  fromDisplayRect,
  toDisplayRect,
} from '../../utils/coords.js';
import MiniGraph from '../MiniGraph/MiniGraph.jsx';
import {
  loadGraphOpenPreference,
  saveGraphOpenPreference,
} from '../MiniGraph/miniGraphPreference.js';
import { screenshotUrl } from '../../utils/screenshotUrl.js';
import {
  clientToImagePoint,
  emulatorButtonStyle,
  getFrameScale,
  useImageFrameScale,
} from '../../utils/imageFrameScale.js';
import ScreenStack from './ScreenStack.jsx';
import './ScreenViewer.css';

function PaneCloseButton({ onClick, label }) {
  return (
    <button
      type="button"
      className="screen-viewer__pane-close"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/** Sidebar map: panel + linked nodes (screen flow navigator). */
function GraphNavIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="6" height="16" rx="1" />
      <circle cx="17" cy="8" r="2" />
      <circle cx="17" cy="16" r="2" />
      <line x1="9" y1="12" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="16" />
    </svg>
  );
}

const MARQUEE_DRAG_THRESHOLD = 4;

function rectsIntersect(a, b) {
  return !(
    a.left + a.width < b.left ||
    b.left + b.width < a.left ||
    a.top + a.height < b.top ||
    b.top + b.height < a.top
  );
}

function normalizeMarqueeRect(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

const MIN_HOTSPOT_SIZE = 20;

export default function ScreenViewer() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectedButtonId = useStore((s) => s.selectedButtonId);
  const importCompareScreenId = useStore((s) => s.importCompareScreenId);
  const setImportCompareScreenId = useStore((s) => s.setImportCompareScreenId);
  const selectButton = useStore((s) => s.selectButton);
  const isAddingHotspot = useStore((s) => s.isAddingHotspot);
  const setAddingHotspot = useStore((s) => s.setAddingHotspot);
  const addButton = useStore((s) => s.addButton);
  const updateButton = useStore((s) => s.updateButton);
  const imageConfig = useStore((s) => s.imageConfig);
  const reportScreenSourceSize = useStore((s) => s.reportScreenSourceSize);
  const buttonRectClipboard = useStore((s) => s.buttonRectClipboard);
  const importSourceButtonIds = useStore((s) => s.importSourceButtonIds);
  const setImportSourceButtonIds = useStore((s) => s.setImportSourceButtonIds);
  const toggleImportSourceButtonId = useStore((s) => s.toggleImportSourceButtonId);
  const selectImportSourceButton = useStore((s) => s.selectImportSourceButton);

  const [graphOpen, setGraphOpen] = useState(loadGraphOpenPreference);

  const toggleGraph = useCallback(() => {
    setGraphOpen((open) => {
      const next = !open;
      saveGraphOpenPreference(next);
      return next;
    });
  }, []);

  const closeGraph = useCallback(() => {
    setGraphOpen(false);
    saveGraphOpenPreference(false);
  }, []);

  const screen = screens.find((s) => s.id === selectedScreenId);
  const compareScreen = importCompareScreenId
    ? screens.find((s) => s.id === importCompareScreenId)
    : null;
  const isCompareMode = !!compareScreen;
  const hotspotSize = useMemo(() => defaultButtonSize(imageConfig), [imageConfig]);
  const placementSize = useMemo(
    () =>
      buttonRectClipboard
        ? {
            width: buttonRectClipboard.width,
            height: buttonRectClipboard.height,
          }
        : hotspotSize,
    [buttonRectClipboard, hotspotSize]
  );

  const handleHotspotUpdate = useCallback(
    async (buttonId, updates) => {
      if (!screen) return;
      try {
        await updateButton(screen.id, buttonId, updates);
      } catch (err) {
        alert('Update failed: ' + err.message);
      }
    },
    [screen, updateButton]
  );

  const handleImageClick = useCallback(
    (e, targetScreen, setSourceSize) => {
      if (!isAddingHotspot || !targetScreen || isCompareMode) return;

      const imgRect = e.currentTarget.getBoundingClientRect();
      const img = e.currentTarget;

      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;

      const x = Math.round((e.clientX - imgRect.left) * scaleX);
      const y = Math.round((e.clientY - imgRect.top) * scaleY);

      const label = prompt('Button name:');
      if (!label) return;

      const target = prompt('Target screen name (leave empty if unknown):') || '';

      setSourceSize({ width: img.naturalWidth, height: img.naturalHeight });
      const screenForCoords = {
        ...targetScreen,
        sourceWidth: img.naturalWidth,
        sourceHeight: img.naturalHeight,
      };
      const hotspotRect = centerFromSourceClick(
        x,
        y,
        placementSize,
        screenForCoords,
        imageConfig
      );

      addButton(targetScreen.id, {
        label,
        target,
        ...hotspotRect,
      });
      setAddingHotspot(false);
    },
    [isAddingHotspot, isCompareMode, addButton, setAddingHotspot, placementSize, imageConfig]
  );

  const canvasContent = !screen ? (
    <div className="screen-viewer__empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <p>Select a screen from the graph</p>
      <p className="screen-viewer__empty-hint">or capture / import a new one in Graph mode</p>
    </div>
  ) : isCompareMode ? (
    <div className="screen-viewer__compare">
      <ComparePane
        label={`Current — ${screen.id}`}
        screen={screen}
        imageConfig={imageConfig}
        editable
        selectedButtonId={selectedButtonId}
        isAddingHotspot={false}
        onSelectButton={() => selectButton(null)}
        onSelectHotspot={selectButton}
        onHotspotUpdate={handleHotspotUpdate}
        onImageClick={handleImageClick}
        reportSourceSize={reportScreenSourceSize}
      />
      <div className="screen-viewer__compare-divider" aria-hidden="true" />
      <ComparePane
        label={`Import from — ${compareScreen.id}`}
        screen={compareScreen}
        imageConfig={imageConfig}
        editable={false}
        pickable
        selectedButtonIds={importSourceButtonIds}
        isAddingHotspot={false}
        onClearPick={() => setImportSourceButtonIds([])}
        onPickButton={(buttonId, { additive }) =>
          additive
            ? toggleImportSourceButtonId(buttonId)
            : selectImportSourceButton(buttonId)
        }
        onPickButtons={(buttonIds, { additive }) => {
          if (additive) {
            const merged = new Set([...importSourceButtonIds, ...buttonIds]);
            setImportSourceButtonIds([...merged]);
          } else {
            setImportSourceButtonIds(buttonIds);
          }
        }}
        onHotspotUpdate={() => {}}
        onImageClick={() => {}}
        reportSourceSize={null}
        showPickHint
        onHeaderClose={() => setImportCompareScreenId(null)}
      />
    </div>
  ) : (
    <ComparePane
      label={null}
      screen={screen}
      imageConfig={imageConfig}
      editable
      selectedButtonId={selectedButtonId}
      isAddingHotspot={isAddingHotspot}
      onSelectButton={() => selectButton(null)}
      onSelectHotspot={selectButton}
      onHotspotUpdate={handleHotspotUpdate}
      onImageClick={handleImageClick}
      reportSourceSize={reportScreenSourceSize}
    />
  );

  return (
    <div className={`screen-viewer ${isCompareMode ? 'screen-viewer--compare' : ''} ${!screen ? 'screen-viewer--empty' : ''}`}>
      <div className="screen-viewer__header">
        <div className="screen-viewer__nav">
          {screen ? (
            isCompareMode ? (
              <h3 className="screen-viewer__title">
                Compare: <span className="screen-viewer__title-current">{screen.id}</span>
                {' vs '}
                <span className="screen-viewer__title-compare">{compareScreen.id}</span>
              </h3>
            ) : (
              <h3 className="screen-viewer__title">{screen.id}</h3>
            )
          ) : (
            <h3 className="screen-viewer__title screen-viewer__title--muted">Screen viewer</h3>
          )}
        </div>
      </div>

      <div className={`screen-viewer__body ${graphOpen ? 'screen-viewer__body--split' : ''}`}>
        {graphOpen && <MiniGraph onClose={closeGraph} />}
        <div className="screen-viewer__main">
          {!graphOpen && (
            <button
              type="button"
              className="btn btn-sm screen-viewer__graph-btn"
              onClick={toggleGraph}
              title="Show screen graph"
              aria-label="Show screen graph"
            >
              <GraphNavIcon />
            </button>
          )}
          {canvasContent}
        </div>
      </div>
    </div>
  );
}

function ComparePane({
  label,
  screen,
  imageConfig,
  editable,
  pickable = false,
  selectedButtonId,
  selectedButtonIds,
  isAddingHotspot,
  onSelectButton,
  onSelectHotspot,
  onClearPick,
  onPickButton,
  onPickButtons,
  onHotspotUpdate,
  onImageClick,
  reportSourceSize,
  showPickHint = false,
  onHeaderClose,
}) {
  const imageVersion = useStore((s) =>
    screen?.id ? (s.imageVersions[screen.id] ?? 0) : 0
  );
  const [sourceSize, setSourceSize] = useState({
    width: screen?.sourceWidth || imageConfig.intrinsicWidth,
    height: screen?.sourceHeight || imageConfig.intrinsicHeight,
  });

  useEffect(() => {
    if (screen?.sourceWidth && screen?.sourceHeight) {
      setSourceSize({ width: screen.sourceWidth, height: screen.sourceHeight });
    } else {
      setSourceSize({
        width: imageConfig.intrinsicWidth,
        height: imageConfig.intrinsicHeight,
      });
    }
  }, [screen?.id, screen?.sourceWidth, screen?.sourceHeight, imageConfig.intrinsicWidth, imageConfig.intrinsicHeight]);

  const handleLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    setSourceSize({ width: naturalWidth, height: naturalHeight });
    if (reportSourceSize && screen) {
      reportSourceSize(screen.id, naturalWidth, naturalHeight);
    }
  };

  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const imageFrameRef = useRef(null);
  const frameScale = useImageFrameScale(containerRef, sourceSize);
  const [marquee, setMarquee] = useState(null);
  const marqueeRef = useRef(null);
  const pickInteractionRef = useRef(null);

  const screenForCoords = useMemo(
    () => ({
      ...screen,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
    }),
    [screen, sourceSize.width, sourceSize.height]
  );

  const buttonSourceRects = useMemo(() => {
    if (!pickable || !screen?.buttons?.length) return new Map();
    return new Map(
      screen.buttons.map((btn) => [
        btn.id,
        toDisplayRect(normalizeButton(btn), screenForCoords, imageConfig),
      ])
    );
  }, [pickable, screen?.buttons, screenForCoords, imageConfig]);

  const selectedPickSet = useMemo(
    () => new Set(selectedButtonIds || []),
    [selectedButtonIds]
  );

  const endPickInteraction = () => {
    const interaction = pickInteractionRef.current;
    if (!interaction) return;
    window.removeEventListener('pointermove', interaction.onMove);
    window.removeEventListener('pointerup', interaction.onUp);
    pickInteractionRef.current = null;
    setMarquee(null);
    marqueeRef.current = null;
  };

  const handlePickStagePointerDown = (e) => {
    if (!pickable || e.button !== 0 || e.target.closest('.hotspot-region')) return;

    const frame = imageFrameRef.current;
    if (!frame) return;

    e.preventDefault();
    const additive = e.ctrlKey || e.metaKey;
    const start = clientToImagePoint(e.clientX, e.clientY, frame, sourceSize);
    let didDrag = false;

    const onMove = (ev) => {
      const current = clientToImagePoint(ev.clientX, ev.clientY, frame, sourceSize);
      if (
        !didDrag &&
        (Math.abs(current.x - start.x) > MARQUEE_DRAG_THRESHOLD ||
          Math.abs(current.y - start.y) > MARQUEE_DRAG_THRESHOLD)
      ) {
        didDrag = true;
      }
      if (didDrag) {
        const next = normalizeMarqueeRect(start, current);
        marqueeRef.current = next;
        setMarquee(next);
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      pickInteractionRef.current = null;

      if (didDrag && marqueeRef.current) {
        const box = marqueeRef.current;
        const hits = screen.buttons
          .filter((btn) => {
            const rect = buttonSourceRects.get(btn.id);
            return rect && rectsIntersect(box, rect);
          })
          .map((btn) => btn.id);
        onPickButtons?.(hits, { additive });
      } else if (!additive) {
        onClearPick?.();
      }

      setMarquee(null);
      marqueeRef.current = null;
    };

    pickInteractionRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => () => endPickInteraction(), []);

  const content = (
    <>
      {label && (
        <div
          className={`screen-viewer__pane-header screen-viewer__compare-label ${showPickHint ? 'screen-viewer__compare-label--pick' : ''}`}
        >
          <div className="screen-viewer__compare-label-main">
            <span className="screen-viewer__compare-label-title">{label}</span>
            {showPickHint && (
              <span className="screen-viewer__compare-label-hint">
                Drag to select an area · Ctrl+click to add or remove buttons
              </span>
            )}
          </div>
          {onHeaderClose && (
            <PaneCloseButton onClick={onHeaderClose} label="Close import" />
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className={`screen-viewer__image-container ${isAddingHotspot ? 'screen-viewer--crosshair' : ''} ${!editable ? 'screen-viewer__image-container--readonly' : ''} ${pickable ? 'screen-viewer__image-container--pickable' : ''}`}
        onClick={editable ? onSelectButton : undefined}
      >
        <ScreenStack
          sourceSize={sourceSize}
          frameScale={frameScale}
          stageRef={stageRef}
          frameRef={imageFrameRef}
          onFramePointerDown={pickable ? handlePickStagePointerDown : undefined}
          buttons={screen.buttons.map((btn) => (
            <HotspotRegion
              key={btn.id}
              button={btn}
              screen={screen}
              imageConfig={imageConfig}
              imageSize={sourceSize}
              selected={
                pickable
                  ? selectedPickSet.has(btn.id)
                  : btn.id === selectedButtonId && editable
              }
              draggable={editable && !isAddingHotspot}
              readonly={!editable}
              pickable={pickable}
              onSelect={() =>
                pickable
                  ? onPickButton?.(btn.id, { additive: false })
                  : onSelectHotspot(btn.id)
              }
              onToggleSelect={() => onPickButton?.(btn.id, { additive: true })}
              onUpdate={onHotspotUpdate}
            />
          ))}
          image={
            <img
              key={`${screen.image}-${imageVersion}`}
              src={screenshotUrl(screen.image, imageVersion)}
              alt={screen.id}
              className="screen-viewer__image"
              onClick={editable ? (e) => onImageClick(e, screen, setSourceSize) : undefined}
              onLoad={handleLoad}
              draggable={false}
            />
          }
          marquee={
            marquee ? (
              <div className="screen-viewer__marquee" style={emulatorButtonStyle(marquee)} />
            ) : null
          }
        />
      </div>
    </>
  );

  if (label) {
    return <div className="screen-viewer__compare-pane">{content}</div>;
  }
  return <div className="screen-viewer__single-pane">{content}</div>;
}

function HotspotRegion({
  button,
  screen,
  imageConfig,
  imageSize,
  selected,
  draggable,
  readonly,
  pickable = false,
  onSelect,
  onToggleSelect,
  onUpdate,
}) {
  const screens = useStore((s) => s.screens);
  const savedIntrinsic = normalizeButton(button);
  const hasTarget = savedIntrinsic.target && screens.some((s) => s.id === savedIntrinsic.target);

  const screenForCoords = useMemo(
    () => ({
      ...screen,
      sourceWidth: imageSize.width,
      sourceHeight: imageSize.height,
    }),
    [screen, imageSize.width, imageSize.height]
  );

  const saved = useMemo(
    () => toDisplayRect(savedIntrinsic, screenForCoords, imageConfig),
    [
      savedIntrinsic.left,
      savedIntrinsic.top,
      savedIntrinsic.width,
      savedIntrinsic.height,
      screenForCoords.sourceWidth,
      screenForCoords.sourceHeight,
      imageConfig,
    ]
  );

  const [draftRect, setDraftRect] = useState(null);
  const draftRef = useRef(null);
  const savedRef = useRef(saved);
  const didDragRef = useRef(false);
  const interactionRef = useRef(null);

  savedRef.current = saved;

  const rect = draftRect ? { ...saved, ...draftRect } : saved;

  useEffect(() => {
    if (interactionRef.current) return;
    setDraftRect(null);
  }, [button.id, saved.left, saved.top, saved.width, saved.height]);

  const style = emulatorButtonStyle(rect);

  const clampPosition = (left, top, width, height) => ({
    left: Math.round(Math.max(0, Math.min(imageSize.width - width, left))),
    top: Math.round(Math.max(0, Math.min(imageSize.height - height, top))),
  });

  const clampSize = (width, height, left, top) => ({
    width: Math.round(Math.max(MIN_HOTSPOT_SIZE, Math.min(imageSize.width - left, width))),
    height: Math.round(Math.max(MIN_HOTSPOT_SIZE, Math.min(imageSize.height - top, height))),
  });

  const commitSourceRect = (partial) => {
    const fullSource = { ...savedRef.current, ...partial };
    onUpdate(button.id, fromDisplayRect(fullSource, screenForCoords, imageConfig));
  };

  const endInteraction = (commit, captureTarget, pointerId) => {
    window.removeEventListener('pointermove', interactionRef.current?.onMove);
    window.removeEventListener('pointerup', interactionRef.current?.onUp);
    if (captureTarget?.releasePointerCapture && pointerId != null) {
      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    if (commit && draftRef.current) {
      commitSourceRect(draftRef.current);
    }
    setDraftRect(null);
    draftRef.current = null;
    interactionRef.current = null;
  };

  const handleMovePointerDown = (e) => {
    if (!draggable || e.button !== 0 || e.target.classList.contains('hotspot-region__resize-handle')) return;
    e.stopPropagation();
    onSelect();
    didDragRef.current = false;

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = savedRef.current.left;
    const startTop = savedRef.current.top;
    const startWidth = savedRef.current.width;
    const startHeight = savedRef.current.height;
    const frame = e.currentTarget.closest('.screen-viewer__image-frame');
    const captureTarget = e.currentTarget;
    const pointerId = e.pointerId;
    captureTarget.setPointerCapture(pointerId);

    const onMove = (ev) => {
      const { scaleX, scaleY } = getFrameScale(frame, imageSize);
      const dx = (ev.clientX - startX) * scaleX;
      const dy = (ev.clientY - startY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true;
      const next = clampPosition(startLeft + dx, startTop + dy, startWidth, startHeight);
      draftRef.current = { left: next.left, top: next.top };
      setDraftRect(draftRef.current);
    };

    const onUp = () => endInteraction(true, captureTarget, pointerId);

    interactionRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleResizePointerDown = (e) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    didDragRef.current = false;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = savedRef.current.width;
    const startHeight = savedRef.current.height;
    const anchorLeft = savedRef.current.left;
    const anchorTop = savedRef.current.top;
    const frame = e.currentTarget.closest('.screen-viewer__image-frame');
    const captureTarget = e.currentTarget;
    const pointerId = e.pointerId;
    captureTarget.setPointerCapture(pointerId);

    const onMove = (ev) => {
      const { scaleX, scaleY } = getFrameScale(frame, imageSize);
      const dx = (ev.clientX - startX) * scaleX;
      const dy = (ev.clientY - startY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true;
      const next = clampSize(startWidth + dx, startHeight + dy, anchorLeft, anchorTop);
      draftRef.current = { width: next.width, height: next.height };
      setDraftRect(draftRef.current);
    };

    const onUp = () => endInteraction(true, captureTarget, pointerId);

    interactionRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      role="button"
      tabIndex={readonly && !pickable ? -1 : 0}
      className={`emulator-button hotspot-region ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'} ${selected ? 'hotspot-region--selected' : ''} ${draftRect ? 'hotspot-region--dragging' : ''} ${readonly ? 'hotspot-region--readonly' : ''} ${pickable ? 'hotspot-region--pickable' : ''}`}
      style={style}
      title={`${savedIntrinsic.label}${savedIntrinsic.target ? ` → ${savedIntrinsic.target}` : ''}`}
      onPointerDown={draggable ? handleMovePointerDown : undefined}
      onClick={(e) => {
        if (readonly && !pickable) return;
        e.stopPropagation();
        if (!didDragRef.current) {
          if (pickable && (e.ctrlKey || e.metaKey)) {
            onToggleSelect?.();
          } else {
            onSelect();
          }
        }
      }}
    >
      {hasTarget ? (
        <span className="hotspot-region__tag">→ {savedIntrinsic.target}</span>
      ) : (
        <span className="hotspot-region__tag">{savedIntrinsic.label}</span>
      )}
      {draggable && (
        <span
          className="hotspot-region__resize-handle"
          title="Drag to resize"
          onPointerDown={handleResizePointerDown}
        />
      )}
    </div>
  );
}
