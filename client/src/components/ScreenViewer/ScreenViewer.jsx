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
import {
  getScrollViewportRelative,
  isSamsungScrollPreset,
} from '../../data/samsungScrollPresets.js';
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
/** Screen pixels the pointer must move before a move/resize drag starts (avoids jitter on click). */
const DRAG_ACTIVATION_THRESHOLD = 8;

export default function ScreenViewer() {
  const screensById = useStore((s) => s.screensById);
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
  const projectPlatform = useStore((s) => s.projectPlatform);
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

  const screen = selectedScreenId ? screensById.get(selectedScreenId) : undefined;
  const compareScreen = importCompareScreenId
    ? screensById.get(importCompareScreenId)
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

  const handleHotspotDuplicate = useCallback(
    async (sourceButton, { left, top, width, height }) => {
      if (!screen) return;
      const src = normalizeButton(sourceButton);
      try {
        const created = await addButton(screen.id, {
          left,
          top,
          width,
          height,
          target: src.target || '',
          label: src.label || '',
          ...(src.type ? { type: src.type } : {}),
        });
        if (created?.id) selectButton(created.id);
      } catch (err) {
        alert('Duplicate button failed: ' + err.message);
      }
    },
    [screen, addButton, selectButton]
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
        imageConfig,
        projectPlatform
      );

      addButton(targetScreen.id, {
        label,
        target,
        ...hotspotRect,
      });
      setAddingHotspot(false);
    },
    [
      isAddingHotspot,
      isCompareMode,
      addButton,
      setAddingHotspot,
      placementSize,
      imageConfig,
      projectPlatform,
    ]
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
        onHotspotDuplicate={handleHotspotDuplicate}
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
      onHotspotDuplicate={handleHotspotDuplicate}
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
  onHotspotDuplicate,
  onImageClick,
  reportSourceSize,
  showPickHint = false,
  onHeaderClose,
}) {
  const projectPlatform = useStore((s) => s.projectPlatform);
  const editLayer = useStore((s) => s.editLayer);
  const showScrollLayer =
    editLayer === 'scroll' &&
    Boolean(screen?.scrollArea?.image?.trim()) &&
    (editable || pickable);
  const hasScrollStrip = Boolean(screen?.scrollArea?.image?.trim());
  const presetViewport =
    hasScrollStrip &&
    projectPlatform === 'samsung' &&
    isSamsungScrollPreset(screen?.preset)
      ? getScrollViewportRelative(screen.preset)
      : null;
  /** Overlay area from preset — not the strip image bounds. */
  const scrollViewportGuide = presetViewport
    ? showScrollLayer
      ? {
          // On strip canvas: window size only (visible overlay region at top).
          left: 0,
          top: 0,
          width: presetViewport.width,
          height: presetViewport.height,
          borderRadius: presetViewport.borderRadius || 0,
        }
      : presetViewport
    : null;
  const activeButtons = showScrollLayer
    ? screen.scrollArea?.buttons || []
    : screen.buttons || [];
  const activeImage = showScrollLayer
    ? screen.scrollArea.image
    : screen.image;
  const imageVersionKey = showScrollLayer
    ? `${screen?.id}:scroll`
    : screen?.id;
  const imageVersion = useStore((s) =>
    imageVersionKey ? (s.imageVersions[imageVersionKey] ?? 0) : 0
  );
  const [sourceSize, setSourceSize] = useState({
    width: showScrollLayer
      ? imageConfig.intrinsicWidth
      : screen?.sourceWidth || imageConfig.intrinsicWidth,
    height: showScrollLayer
      ? imageConfig.intrinsicHeight
      : screen?.sourceHeight || imageConfig.intrinsicHeight,
  });

  useEffect(() => {
    if (showScrollLayer) {
      setSourceSize({
        width: imageConfig.intrinsicWidth,
        height: imageConfig.intrinsicHeight,
      });
      return;
    }
    if (screen?.sourceWidth && screen?.sourceHeight) {
      setSourceSize({ width: screen.sourceWidth, height: screen.sourceHeight });
    } else {
      setSourceSize({
        width: imageConfig.intrinsicWidth,
        height: imageConfig.intrinsicHeight,
      });
    }
  }, [
    screen?.id,
    screen?.sourceWidth,
    screen?.sourceHeight,
    imageConfig.intrinsicWidth,
    imageConfig.intrinsicHeight,
    showScrollLayer,
  ]);

  const handleLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    setSourceSize({ width: naturalWidth, height: naturalHeight });
    if (!showScrollLayer && reportSourceSize && screen) {
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

  const layerImageConfig = useMemo(() => {
    // Scroll strip coords live in strip pixel space; main-screen Samsung coords stay in preset2 (imageConfig).
    if (showScrollLayer) {
      return {
        intrinsicWidth: sourceSize.width,
        intrinsicHeight: sourceSize.height,
      };
    }
    return imageConfig;
  }, [
    showScrollLayer,
    sourceSize.width,
    sourceSize.height,
    imageConfig,
  ]);

  const buttonSourceRects = useMemo(() => {
    if (!pickable || !activeButtons.length) return new Map();
    return new Map(
      activeButtons.map((btn) => [
        btn.id,
        toDisplayRect(
          normalizeButton(btn),
          screenForCoords,
          layerImageConfig,
          projectPlatform
        ),
      ])
    );
  }, [pickable, activeButtons, screenForCoords, layerImageConfig, projectPlatform]);

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
        const hits = activeButtons
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
        className={`screen-viewer__image-container ${isAddingHotspot ? 'screen-viewer--crosshair' : ''} ${!editable ? 'screen-viewer__image-container--readonly' : ''} ${pickable ? 'screen-viewer__image-container--pickable' : ''} ${showScrollLayer ? 'screen-viewer__image-container--scroll-layer' : ''}`}
        onClick={editable ? onSelectButton : undefined}
      >
        <ScreenStack
          sourceSize={sourceSize}
          frameScale={frameScale}
          stageRef={stageRef}
          frameRef={imageFrameRef}
          onFramePointerDown={pickable ? handlePickStagePointerDown : undefined}
          buttons={activeButtons.map((btn) => (
            <HotspotRegion
              key={btn.id}
              button={btn}
              screen={screenForCoords}
              imageConfig={layerImageConfig}
              imageSize={sourceSize}
              platform={projectPlatform}
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
              onDuplicate={editable ? onHotspotDuplicate : undefined}
            />
          ))}
          image={
            <img
              key={`${activeImage}-${imageVersion}`}
              src={screenshotUrl(activeImage, imageVersion)}
              alt={showScrollLayer ? `${screen.id} scroll` : screen.id}
              className="screen-viewer__image"
              onClick={editable ? (e) => onImageClick(e, screenForCoords, setSourceSize) : undefined}
              onLoad={handleLoad}
              draggable={false}
            />
          }
          overlay={
            scrollViewportGuide ? (
              <div
                className="screen-viewer__scroll-viewport-guide"
                style={{
                  left: scrollViewportGuide.left,
                  top: scrollViewportGuide.top,
                  width: scrollViewportGuide.width,
                  height: scrollViewportGuide.height,
                  borderRadius: scrollViewportGuide.borderRadius || 0,
                }}
                aria-hidden="true"
              />
            ) : null
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
  platform = 'lg',
  selected,
  draggable,
  readonly,
  pickable = false,
  onSelect,
  onToggleSelect,
  onUpdate,
  onDuplicate,
}) {
  const savedIntrinsic = normalizeButton(button);
  // Subscribe to a boolean instead of the full `screens` array so this
  // component doesn't re-render on every unrelated screen mutation.
  const hasTarget = useStore((s) =>
    Boolean(savedIntrinsic.target && s.screensById.has(savedIntrinsic.target))
  );

  const screenForCoords = useMemo(
    () => ({
      ...screen,
      sourceWidth: imageSize.width,
      sourceHeight: imageSize.height,
    }),
    [screen, imageSize.width, imageSize.height]
  );

  const saved = useMemo(
    () => toDisplayRect(savedIntrinsic, screenForCoords, imageConfig, platform),
    [
      savedIntrinsic.left,
      savedIntrinsic.top,
      savedIntrinsic.width,
      savedIntrinsic.height,
      screenForCoords.sourceWidth,
      screenForCoords.sourceHeight,
      imageConfig,
      platform,
    ]
  );

  const [draftRect, setDraftRect] = useState(null);
  const [duplicateGhost, setDuplicateGhost] = useState(null);
  const draftRef = useRef(null);
  const duplicateGhostRef = useRef(null);
  const isDuplicateDragRef = useRef(false);
  const savedRef = useRef(saved);
  const didDragRef = useRef(false);
  const interactionRef = useRef(null);

  savedRef.current = saved;

  const rect =
    isDuplicateDragRef.current && duplicateGhost
      ? saved
      : draftRect
        ? { ...saved, ...draftRect }
        : saved;

  useEffect(() => {
    if (interactionRef.current) return;
    setDraftRect(null);
    setDuplicateGhost(null);
    duplicateGhostRef.current = null;
    isDuplicateDragRef.current = false;
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

  const interactionButtonIdRef = useRef(button.id);
  interactionButtonIdRef.current = button.id;

  const commitSourceRect = (partial, buttonId = interactionButtonIdRef.current) => {
    const fullSource = { ...savedRef.current, ...partial };
    onUpdate(
      buttonId,
      fromDisplayRect(fullSource, screenForCoords, imageConfig, platform)
    );
  };

  const clearInteraction = (captureTarget, pointerId) => {
    window.removeEventListener('pointermove', interactionRef.current?.onMove);
    window.removeEventListener('pointerup', interactionRef.current?.onUp);
    if (captureTarget?.releasePointerCapture && pointerId != null) {
      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    setDraftRect(null);
    draftRef.current = null;
    setDuplicateGhost(null);
    duplicateGhostRef.current = null;
    isDuplicateDragRef.current = false;
    interactionRef.current = null;
  };

  const endInteraction = (commit, captureTarget, pointerId) => {
    if (commit && draftRef.current) {
      commitSourceRect(draftRef.current);
    }
    clearInteraction(captureTarget, pointerId);
  };

  const endDuplicateInteraction = (commit, captureTarget, pointerId) => {
    if (commit && duplicateGhostRef.current && onDuplicate) {
      const ghost = duplicateGhostRef.current;
      const sourceRect = fromDisplayRect(
        {
          left: ghost.left,
          top: ghost.top,
          width: ghost.width,
          height: ghost.height,
        },
        screenForCoords,
        imageConfig,
        platform
      );
      onDuplicate(button, sourceRect);
    }
    clearInteraction(captureTarget, pointerId);
  };

  const handleMovePointerDown = (e) => {
    if (!draggable || e.button !== 0 || e.target.classList.contains('hotspot-region__resize-handle')) return;
    e.stopPropagation();
    interactionButtonIdRef.current = button.id;
    onSelect();
    didDragRef.current = false;

    const isAltDuplicate = e.altKey && !!onDuplicate;
    isDuplicateDragRef.current = isAltDuplicate;

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

    let dragStarted = false;

    const onMove = (ev) => {
      const clientDx = ev.clientX - startX;
      const clientDy = ev.clientY - startY;
      if (!dragStarted) {
        if (Math.hypot(clientDx, clientDy) < DRAG_ACTIVATION_THRESHOLD) return;
        dragStarted = true;
        didDragRef.current = true;
      }
      const { scaleX, scaleY } = getFrameScale(frame, imageSize);
      const dx = clientDx * scaleX;
      const dy = clientDy * scaleY;
      const next = clampPosition(
        startLeft + dx,
        startTop + dy,
        startWidth,
        startHeight
      );
      if (isAltDuplicate) {
        const ghost = {
          left: next.left,
          top: next.top,
          width: startWidth,
          height: startHeight,
        };
        duplicateGhostRef.current = ghost;
        setDuplicateGhost(ghost);
      } else {
        draftRef.current = { left: next.left, top: next.top };
        setDraftRect(draftRef.current);
      }
    };

    const onUp = () =>
      isAltDuplicate
        ? endDuplicateInteraction(dragStarted, captureTarget, pointerId)
        : endInteraction(dragStarted, captureTarget, pointerId);

    interactionRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleResizePointerDown = (e) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    interactionButtonIdRef.current = button.id;
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

    let dragStarted = false;

    const onMove = (ev) => {
      const clientDx = ev.clientX - startX;
      const clientDy = ev.clientY - startY;
      if (!dragStarted) {
        if (Math.hypot(clientDx, clientDy) < DRAG_ACTIVATION_THRESHOLD) return;
        dragStarted = true;
        didDragRef.current = true;
      }
      const { scaleX, scaleY } = getFrameScale(frame, imageSize);
      const dx = clientDx * scaleX;
      const dy = clientDy * scaleY;
      const next = clampSize(startWidth + dx, startHeight + dy, anchorLeft, anchorTop);
      draftRef.current = { width: next.width, height: next.height };
      setDraftRect(draftRef.current);
    };

    const onUp = () => endInteraction(dragStarted, captureTarget, pointerId);

    interactionRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      role="button"
      tabIndex={readonly && !pickable ? -1 : 0}
      className={`emulator-button hotspot-region ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'} ${selected ? 'hotspot-region--selected' : ''} ${draftRect ? 'hotspot-region--dragging' : ''} ${duplicateGhost ? 'hotspot-region--duplicating-source' : ''} ${readonly ? 'hotspot-region--readonly' : ''} ${pickable ? 'hotspot-region--pickable' : ''}`}
      style={style}
      title={`${savedIntrinsic.label}${savedIntrinsic.target ? ` → ${savedIntrinsic.target}` : ''}${onDuplicate ? ' · Alt+drag to duplicate' : ''}`}
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
      {duplicateGhost && (
        <div
          className="hotspot-region__duplicate-ghost"
          style={{
            top: `${duplicateGhost.top - saved.top}px`,
            left: `${duplicateGhost.left - saved.left}px`,
            width: `${duplicateGhost.width}px`,
            height: `${duplicateGhost.height}px`,
          }}
          aria-hidden="true"
        />
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
