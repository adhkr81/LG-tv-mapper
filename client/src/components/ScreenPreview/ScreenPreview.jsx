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
  const imageConfig = useStore((s) => s.imageConfig);

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
  // GraphView clears selection because the preview screen is off-canvas.
  useEffect(() => {
    if (!selectedScreenId) return;
    setAnchorScreenId(selectedScreenId);
    setCurrentScreenId(selectedScreenId);
    setHistory([]);
  }, [selectedScreenId]);

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
    },
    [currentScreenId, screensById]
  );

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousId = next.pop();
      setCurrentScreenId(previousId);
      return next;
    });
  }, []);

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

function PreviewHotspot({ button, screenForCoords, imageConfig, onNavigate }) {
  const normalized = normalizeButton(button);
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

  const handleClick = (e) => {
    e.stopPropagation();
    if (hasTarget) onNavigate(normalized.target);
  };

  return (
    <div
      role={hasTarget ? 'button' : undefined}
      tabIndex={hasTarget ? 0 : undefined}
      className={`emulator-button hotspot-region preview-hotspot ${hasTarget ? 'hotspot-region--linked' : 'hotspot-region--unlinked'}`}
      style={style}
      title={
        hasTarget
          ? `Go to ${normalized.target}`
          : normalized.label || 'No target'
      }
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
  );
}
