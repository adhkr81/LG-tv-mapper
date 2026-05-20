import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import {
  centerFromSourceClick,
  defaultButtonSize,
  toIntrinsicRect,
  toSourceRect,
} from '../../utils/coords.js';
import './ScreenViewer.css';

const MIN_HOTSPOT_SIZE = 20;

export default function ScreenViewer() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectedButtonId = useStore((s) => s.selectedButtonId);
  const importCompareScreenId = useStore((s) => s.importCompareScreenId);
  const selectButton = useStore((s) => s.selectButton);
  const isAddingHotspot = useStore((s) => s.isAddingHotspot);
  const setAddingHotspot = useStore((s) => s.setAddingHotspot);
  const addButton = useStore((s) => s.addButton);
  const updateButton = useStore((s) => s.updateButton);
  const imageConfig = useStore((s) => s.imageConfig);
  const reportScreenSourceSize = useStore((s) => s.reportScreenSourceSize);
  const buttonRectClipboard = useStore((s) => s.buttonRectClipboard);
  const importSourceButtonId = useStore((s) => s.importSourceButtonId);
  const setImportSourceButtonId = useStore((s) => s.setImportSourceButtonId);

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

      const rect = e.currentTarget.getBoundingClientRect();
      const img = e.currentTarget;

      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      const label = prompt('Button name:');
      if (!label) return;

      const target = prompt('Target screen name (leave empty if unknown):') || '';

      const screenForCoords = {
        ...targetScreen,
        sourceWidth: img.naturalWidth,
        sourceHeight: img.naturalHeight,
      };
      setSourceSize({ width: img.naturalWidth, height: img.naturalHeight });
      const intrinsicRect = centerFromSourceClick(
        x,
        y,
        placementSize,
        screenForCoords,
        imageConfig
      );

      addButton(targetScreen.id, {
        label,
        target,
        ...intrinsicRect,
      });
      setAddingHotspot(false);
    },
    [isAddingHotspot, isCompareMode, addButton, setAddingHotspot, imageConfig, placementSize]
  );

  if (!screen) {
    return (
      <div className="screen-viewer screen-viewer--empty">
        <div className="screen-viewer__empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p>Select a screen node from the graph</p>
          <p className="screen-viewer__empty-hint">or capture / import a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`screen-viewer ${isCompareMode ? 'screen-viewer--compare' : ''}`}>
      <div className="screen-viewer__header">
        {isCompareMode ? (
          <h3 className="screen-viewer__title">
            Compare: <span className="screen-viewer__title-current">{screen.id}</span>
            {' vs '}
            <span className="screen-viewer__title-compare">{compareScreen.id}</span>
          </h3>
        ) : (
          <h3 className="screen-viewer__title">{screen.id}</h3>
        )}
        {!isCompareMode && (
          <button
            className={`btn btn-sm ${isAddingHotspot ? 'btn-accent' : ''}`}
            onClick={() => setAddingHotspot(!isAddingHotspot)}
          >
            {isAddingHotspot ? '✕ Cancel' : '+ Add Hotspot'}
          </button>
        )}
      </div>

      {isCompareMode ? (
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
            selectedButtonId={importSourceButtonId}
            isAddingHotspot={false}
            onSelectButton={() => setImportSourceButtonId(null)}
            onSelectHotspot={setImportSourceButtonId}
            onHotspotUpdate={() => {}}
            onImageClick={() => {}}
            reportSourceSize={null}
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
          showSizeHint
          showAddHint={isAddingHotspot}
          hotspotSize={placementSize}
        />
      )}
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
  isAddingHotspot,
  onSelectButton,
  onSelectHotspot,
  onHotspotUpdate,
  onImageClick,
  reportSourceSize,
  showSizeHint = false,
  showAddHint = false,
  hotspotSize,
}) {
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

  const content = (
    <>
      {label && <div className="screen-viewer__compare-label">{label}</div>}
      {showSizeHint && (
        <p className="screen-viewer__size-hint">
          Screenshot {sourceSize.width}×{sourceSize.height} → product{' '}
          {imageConfig.intrinsicWidth}×{imageConfig.intrinsicHeight} px
        </p>
      )}
      <div
        className={`screen-viewer__image-container ${isAddingHotspot ? 'screen-viewer--crosshair' : ''} ${!editable ? 'screen-viewer__image-container--readonly' : ''}`}
        onClick={editable ? onSelectButton : undefined}
      >
        <div className="screen-viewer__stage">
          <img
            src={`/screenshots/${screen.image}`}
            alt={screen.id}
            className="screen-viewer__image"
            onClick={editable ? (e) => onImageClick(e, screen, setSourceSize) : undefined}
            onLoad={handleLoad}
            draggable={false}
          />
          {screen.buttons.map((btn) => (
            <HotspotRegion
              key={btn.id}
              button={btn}
              screen={screen}
              imageConfig={imageConfig}
              imageSize={sourceSize}
              selected={btn.id === selectedButtonId && (editable || pickable)}
              draggable={editable && !isAddingHotspot}
              readonly={!editable}
              pickable={pickable}
              onSelect={() => onSelectHotspot(btn.id)}
              onUpdate={onHotspotUpdate}
            />
          ))}
        </div>
      </div>
      {showAddHint && (
        <div className="screen-viewer__hint">
          Click on the image to place a hotspot ({hotspotSize.width}×{hotspotSize.height} product px)
        </div>
      )}
    </>
  );

  if (label) {
    return <div className="screen-viewer__compare-pane">{content}</div>;
  }
  return content;
}

function getStageScale(stage, imageSize) {
  const stageRect = stage.getBoundingClientRect();
  return {
    scaleX: imageSize.width / stageRect.width,
    scaleY: imageSize.height / stageRect.height,
  };
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
    () => toSourceRect(savedIntrinsic, screenForCoords, imageConfig),
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

  const style = {
    left: `${(rect.left / imageSize.width) * 100}%`,
    top: `${(rect.top / imageSize.height) * 100}%`,
    width: `${(rect.width / imageSize.width) * 100}%`,
    height: `${(rect.height / imageSize.height) * 100}%`,
  };

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
    const intrinsic = toIntrinsicRect(fullSource, screenForCoords, imageConfig);
    onUpdate(button.id, intrinsic);
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
    const stage = e.currentTarget.parentElement;
    const captureTarget = e.currentTarget;
    const pointerId = e.pointerId;
    captureTarget.setPointerCapture(pointerId);

    const onMove = (ev) => {
      const { scaleX, scaleY } = getStageScale(stage, imageSize);
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
    const stage = e.currentTarget.closest('.screen-viewer__stage');
    const captureTarget = e.currentTarget;
    const pointerId = e.pointerId;
    captureTarget.setPointerCapture(pointerId);

    const onMove = (ev) => {
      const { scaleX, scaleY } = getStageScale(stage, imageSize);
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
      className={`hotspot-region ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'} ${selected ? 'hotspot-region--selected' : ''} ${draftRect ? 'hotspot-region--dragging' : ''} ${readonly ? 'hotspot-region--readonly' : ''} ${pickable ? 'hotspot-region--pickable' : ''}`}
      style={style}
      title={`${savedIntrinsic.label}${savedIntrinsic.target ? ` → ${savedIntrinsic.target}` : ''}`}
      onPointerDown={draggable ? handleMovePointerDown : undefined}
      onClick={(e) => {
        if (readonly && !pickable) return;
        e.stopPropagation();
        if (!didDragRef.current) onSelect();
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
