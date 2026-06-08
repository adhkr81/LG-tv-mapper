import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import { screenshotUrl } from '../../utils/screenshotUrl.js';
import { toDisplayRect } from '../../utils/coords.js';
import { emulatorButtonStyle, useImageFrameScale } from '../../utils/imageFrameScale.js';
import ScreenStack from '../ScreenViewer/ScreenStack.jsx';
import '../ScreenViewer/ScreenViewer.css';
import './ScreenPreview.css';

export default function ScreenPreview() {
  const screensById = useStore((s) => s.screensById);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const imageConfig = useStore((s) => s.imageConfig);
  const skipGraphSyncRef = useRef(false);

  /** Graph pick that started preview; kept when navigating off-canvas. */
  const [anchorScreenId, setAnchorScreenId] = useState(selectedScreenId);
  const [currentScreenId, setCurrentScreenId] = useState(selectedScreenId);
  const [history, setHistory] = useState([]);
  const [sourceSize, setSourceSize] = useState({
    width: imageConfig.intrinsicWidth,
    height: imageConfig.intrinsicHeight,
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const frameScale = useImageFrameScale(containerRef, sourceSize);
  const reportScreenSourceSize = useStore((s) => s.reportScreenSourceSize);
  const imageVersion = useStore((s) =>
    currentScreenId ? (s.imageVersions[currentScreenId] ?? 0) : 0
  );

  // Follow graph selection only when the user picks a visible node — not when
  // GraphView clears or reverts selection because the preview screen is off-canvas.
  useEffect(() => {
    if (!selectedScreenId) return;
    if (skipGraphSyncRef.current) {
      skipGraphSyncRef.current = false;
      return;
    }
    if (
      history.length > 0 &&
      currentScreenId &&
      currentScreenId !== selectedScreenId &&
      selectedScreenId === anchorScreenId
    ) {
      return;
    }
    setAnchorScreenId(selectedScreenId);
    setCurrentScreenId(selectedScreenId);
    setHistory([]);
  }, [selectedScreenId, currentScreenId, anchorScreenId, history.length]);

  const screen = currentScreenId ? screensById.get(currentScreenId) : undefined;

  const applyImageDimensions = useCallback(
    (naturalWidth, naturalHeight) => {
      if (!naturalWidth || !naturalHeight || !currentScreenId) return;
      setSourceSize({ width: naturalWidth, height: naturalHeight });
      setImageLoaded(true);
      reportScreenSourceSize(currentScreenId, naturalWidth, naturalHeight);
    },
    [currentScreenId, reportScreenSourceSize]
  );

  useEffect(() => {
    setImageLoaded(false);
    setSourceSize({
      width: screen?.sourceWidth || imageConfig.intrinsicWidth,
      height: screen?.sourceHeight || imageConfig.intrinsicHeight,
    });
  }, [screen?.id, screen?.sourceWidth, screen?.sourceHeight, imageConfig.intrinsicWidth, imageConfig.intrinsicHeight]);

  const screenForCoords = useMemo(
    () => ({
      ...screen,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
    }),
    [screen, sourceSize.width, sourceSize.height]
  );

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth && img.naturalHeight) {
      applyImageDimensions(img.naturalWidth, img.naturalHeight);
    }
  }, [screen?.id, screen?.image, applyImageDimensions]);

  const navigateTo = useCallback(
    (targetId) => {
      if (!targetId || targetId === currentScreenId) return;
      if (!screensById.has(targetId)) return;
      setHistory((prev) => [...prev, currentScreenId]);
      setCurrentScreenId(targetId);
      skipGraphSyncRef.current = true;
      selectScreen(targetId);
    },
    [currentScreenId, screensById, selectScreen]
  );

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousId = next.pop();
      setCurrentScreenId(previousId);
      skipGraphSyncRef.current = true;
      selectScreen(previousId);
      return next;
    });
  }, [selectScreen]);

  const resetToAnchor = useCallback(() => {
    if (!anchorScreenId) return;
    setCurrentScreenId(anchorScreenId);
    setHistory([]);
  }, [anchorScreenId]);

  if (!anchorScreenId) {
    return (
      <div className="screen-preview screen-preview--empty">
        <div className="screen-viewer__empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <p>Select a screen on the graph to preview navigation</p>
        </div>
      </div>
    );
  }

  if (!screen) {
    return (
      <div className="screen-preview screen-preview--empty">
        <div className="screen-viewer__empty-state">
          <p>Screen &quot;{currentScreenId}&quot; not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-preview">
      <div className="screen-preview__header">
        <div className="screen-preview__nav">
          <button
            type="button"
            className="btn btn-sm"
            onClick={goBack}
            disabled={history.length === 0}
            title="Go back"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          {currentScreenId !== anchorScreenId && (
            <button type="button" className="btn btn-sm" onClick={resetToAnchor}>
              Reset to {anchorScreenId}
            </button>
          )}
        </div>
        <h3 className="screen-preview__title">{screen.id}</h3>
        <span className="screen-preview__hint">Click hotspots to navigate</span>
      </div>

      <div ref={containerRef} className="screen-viewer__image-container">
        <ScreenStack
          sourceSize={sourceSize}
          frameScale={frameScale}
          buttons={
            imageLoaded
              ? (screen.buttons || []).map((btn) => (
                  <PreviewHotspot
                    key={btn.id}
                    button={btn}
                    screenForCoords={screenForCoords}
                    imageConfig={imageConfig}
                    onNavigate={navigateTo}
                  />
                ))
              : null
          }
          image={
            <img
              ref={imgRef}
              key={`${screen.image}-${imageVersion}`}
              src={screenshotUrl(screen.image, imageVersion)}
              alt={screen.id}
              className="screen-viewer__image"
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth, naturalHeight } = e.currentTarget;
                applyImageDimensions(naturalWidth, naturalHeight);
              }}
            />
          }
        />
      </div>
    </div>
  );
}

function hasPopoverContent(popover) {
  return Boolean(popover?.title?.trim() || popover?.text?.trim());
}

function PreviewHotspot({ button, screenForCoords, imageConfig, onNavigate }) {
  const normalized = normalizeButton(button);
  const [hovered, setHovered] = useState(false);
  const popover = button.popover;
  const showPopover = hasPopoverContent(popover);
  const hasTarget = useStore((s) =>
    Boolean(normalized.target && s.screensById.has(normalized.target))
  );

  const rect = useMemo(
    () => toDisplayRect(normalized, screenForCoords, imageConfig),
    [
      normalized.left,
      normalized.top,
      normalized.width,
      normalized.height,
      screenForCoords?.sourceWidth,
      screenForCoords?.sourceHeight,
      imageConfig,
    ]
  );

  const style = emulatorButtonStyle(rect);

  const popoverStyle = useMemo(() => {
    if (!showPopover) return null;
    const pos = { position: 'absolute', zIndex: 20 };
    const style = popover.style || {};
    for (const key of ['top', 'left', 'bottom', 'right']) {
      const value = style[key];
      if (value) pos[key] = value;
    }
    if (!pos.top && !pos.bottom) pos.top = '0%';
    if (!pos.left && !pos.right) pos.left = '0%';
    return pos;
  }, [showPopover, popover]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (hasTarget) onNavigate(normalized.target);
  };

  return (
    <>
      <div
        role={hasTarget ? 'button' : undefined}
        tabIndex={hasTarget ? 0 : undefined}
        className={`emulator-button hotspot-region preview-hotspot ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'} ${showPopover ? 'preview-hotspot--has-popover' : ''}`}
        style={style}
        title={
          hasTarget
            ? `Go to ${normalized.target}`
            : normalized.label || 'No target'
        }
        onMouseEnter={showPopover ? () => setHovered(true) : undefined}
        onMouseLeave={showPopover ? () => setHovered(false) : undefined}
        onClick={hasTarget ? handleClick : undefined}
        onKeyDown={(e) => {
          if (hasTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleClick(e);
          }
        }}
      >
        {hasTarget ? (
          <span className="hotspot-region__tag">→ {normalized.target}</span>
        ) : (
          <span className="hotspot-region__tag">{normalized.label}</span>
        )}
      </div>
      {hovered && showPopover && (
        <div className="preview-popover" style={popoverStyle} role="tooltip">
          {popover.title?.trim() && (
            <div className="preview-popover__title">{popover.title}</div>
          )}
          {popover.text?.trim() && (
            <div className="preview-popover__text">{popover.text}</div>
          )}
        </div>
      )}
    </>
  );
}
