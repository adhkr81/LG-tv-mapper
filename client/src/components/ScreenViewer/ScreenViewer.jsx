import React, { useCallback, useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton, rectCenteredAt, DEFAULT_BUTTON_SIZE } from '../../utils/buttonRect.js';
import './ScreenViewer.css';

const DEFAULT_IMAGE_SIZE = { width: 1920, height: 1080 };
const MIN_HOTSPOT_SIZE = 20;

export default function ScreenViewer() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectedButtonId = useStore((s) => s.selectedButtonId);
  const selectButton = useStore((s) => s.selectButton);
  const isAddingHotspot = useStore((s) => s.isAddingHotspot);
  const setAddingHotspot = useStore((s) => s.setAddingHotspot);
  const addButton = useStore((s) => s.addButton);
  const updateButton = useStore((s) => s.updateButton);
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);

  const screen = screens.find((s) => s.id === selectedScreenId);

  useEffect(() => {
    setImageSize(DEFAULT_IMAGE_SIZE);
  }, [screen?.id, screen?.image]);

  const handleImageClick = useCallback(
    (e) => {
      if (!isAddingHotspot || !screen) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const img = e.currentTarget;

      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      const label = prompt('Button name:');
      if (!label) return;

      const target = prompt('Target screen name (leave empty if unknown):') || '';

      addButton(screen.id, {
        label,
        target,
        ...rectCenteredAt(x, y),
      });
      setAddingHotspot(false);
    },
    [isAddingHotspot, screen, addButton, setAddingHotspot]
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
    <div className="screen-viewer">
      <div className="screen-viewer__header">
        <h3 className="screen-viewer__title">{screen.id}</h3>
        <button
          className={`btn btn-sm ${isAddingHotspot ? 'btn-accent' : ''}`}
          onClick={() => setAddingHotspot(!isAddingHotspot)}
        >
          {isAddingHotspot ? '✕ Cancel' : '+ Add Hotspot'}
        </button>
      </div>

      <div
        className={`screen-viewer__image-container ${isAddingHotspot ? 'screen-viewer--crosshair' : ''}`}
        onClick={() => selectButton(null)}
      >
        <div className="screen-viewer__stage">
          <img
            src={`/screenshots/${screen.image}`}
            alt={screen.id}
            className="screen-viewer__image"
            onClick={handleImageClick}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth && naturalHeight) {
                setImageSize({ width: naturalWidth, height: naturalHeight });
              }
            }}
            draggable={false}
          />

          {screen.buttons.map((btn) => (
            <HotspotRegion
              key={btn.id}
              button={btn}
              imageSize={imageSize}
              selected={btn.id === selectedButtonId}
              draggable={!isAddingHotspot}
              onSelect={() => selectButton(btn.id)}
              onUpdate={handleHotspotUpdate}
            />
          ))}
        </div>
      </div>

      {isAddingHotspot && (
        <div className="screen-viewer__hint">
          Click on the image to place a hotspot ({DEFAULT_BUTTON_SIZE.width}×{DEFAULT_BUTTON_SIZE.height})
        </div>
      )}
    </div>
  );
}

function getStageScale(stage, imageSize) {
  const stageRect = stage.getBoundingClientRect();
  return {
    scaleX: imageSize.width / stageRect.width,
    scaleY: imageSize.height / stageRect.height,
  };
}

function HotspotRegion({ button, imageSize, selected, draggable, onSelect, onUpdate }) {
  const screens = useStore((s) => s.screens);
  const saved = normalizeButton(button);
  const hasTarget = saved.target && screens.some((s) => s.id === saved.target);

  const [draftRect, setDraftRect] = useState(null);
  const draftRef = useRef(null);
  const didDragRef = useRef(false);
  const interactionRef = useRef(null);

  const rect = draftRect ? { ...saved, ...draftRect } : saved;

  useEffect(() => {
    if (!draftRect) return;
    const synced =
      (draftRect.left == null || draftRect.left === saved.left) &&
      (draftRect.top == null || draftRect.top === saved.top) &&
      (draftRect.width == null || draftRect.width === saved.width) &&
      (draftRect.height == null || draftRect.height === saved.height);
    if (synced) setDraftRect(null);
  }, [saved.left, saved.top, saved.width, saved.height, draftRect]);

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
      const committed = { ...draftRef.current };
      setDraftRect(committed);
      onUpdate(button.id, committed);
    } else {
      setDraftRect(null);
    }
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
    const startLeft = rect.left;
    const startTop = rect.top;
    const startWidth = rect.width;
    const startHeight = rect.height;
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
    const startWidth = rect.width;
    const startHeight = rect.height;
    const anchorLeft = rect.left;
    const anchorTop = rect.top;
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
      className={`hotspot-region ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'} ${selected ? 'hotspot-region--selected' : ''} ${draftRect ? 'hotspot-region--dragging' : ''}`}
      style={style}
      title={`${saved.label}${saved.target ? ` → ${saved.target}` : ''}`}
      onPointerDown={handleMovePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!didDragRef.current) onSelect();
      }}
    >
      {hasTarget ? (
        <span className="hotspot-region__tag">→ {saved.target}</span>
      ) : (
        <span className="hotspot-region__tag">{saved.label}</span>
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
