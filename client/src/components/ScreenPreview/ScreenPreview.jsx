import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import { screenshotUrl } from '../../utils/screenshotUrl.js';
import { toDisplayRect } from '../../utils/coords.js';
import { emulatorButtonStyle, useImageFrameScale } from '../../utils/imageFrameScale.js';
import {
  getScrollButtonsRelative,
  getScrollViewportRelative,
  isSamsungScrollPreset,
} from '../../data/samsungScrollPresets.js';
import ScreenStack from '../ScreenViewer/ScreenStack.jsx';
import '../ScreenViewer/ScreenViewer.css';
import './ScreenPreview.css';

const SCROLL_STEP = 190;

export default function ScreenPreview() {
  const screensById = useStore((s) => s.screensById);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const imageConfig = useStore((s) => s.imageConfig);
  const projectPlatform = useStore((s) => s.projectPlatform);
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
  const [scrollTop, setScrollTop] = useState(0);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const frameScale = useImageFrameScale(containerRef, sourceSize);
  const reportScreenSourceSize = useStore((s) => s.reportScreenSourceSize);
  const imageVersion = useStore((s) =>
    currentScreenId ? (s.imageVersions[currentScreenId] ?? 0) : 0
  );
  const scrollImageVersion = useStore((s) =>
    currentScreenId ? (s.imageVersions[`${currentScreenId}:scroll`] ?? 0) : 0
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
    setScrollTop(0);
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

  const isSamsung = projectPlatform === 'samsung';
  const backButtonTarget = String(screen?.backButtonTarget || '').trim();
  const canUseBackButton = Boolean(
    backButtonTarget && screensById.has(backButtonTarget)
  );

  const goRemoteBack = useCallback(() => {
    if (!canUseBackButton) return;
    navigateTo(backButtonTarget);
  }, [canUseBackButton, backButtonTarget, navigateTo]);

  const resetToAnchor = useCallback(() => {
    if (!anchorScreenId) return;
    setCurrentScreenId(anchorScreenId);
    setHistory([]);
  }, [anchorScreenId]);

  const scrollViewport = useMemo(
    () => (isSamsung ? getScrollViewportRelative(screen?.preset) : null),
    [isSamsung, screen?.preset]
  );
  const scrollArrows = useMemo(
    () => (isSamsung ? getScrollButtonsRelative(screen?.preset) : null),
    [isSamsung, screen?.preset]
  );
  const hasScrollPreview = Boolean(
    isSamsung &&
      isSamsungScrollPreset(screen?.preset) &&
      screen?.scrollArea?.image?.trim() &&
      scrollViewport
  );

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
        <span className="screen-preview__hint">
          {hasScrollPreview
            ? `Click hotspots · scroll (${screen.preset})`
            : 'Click hotspots to navigate'}
        </span>
        {isSamsung && (
          <button
            type="button"
            className="btn btn-sm btn-accent screen-preview__remote-back"
            onClick={goRemoteBack}
            disabled={!canUseBackButton}
            title={
              canUseBackButton
                ? `Remote back → ${backButtonTarget}`
                : 'No back button target'
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Remote back
          </button>
        )}
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
                    platform={projectPlatform}
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
          overlay={
            hasScrollPreview ? (
              <ScrollPreviewOverlay
                screen={screen}
                viewport={scrollViewport}
                arrows={scrollArrows}
                scrollTop={scrollTop}
                setScrollTop={setScrollTop}
                imageVersion={scrollImageVersion}
                onNavigate={navigateTo}
                platform={projectPlatform}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

function ScrollPreviewOverlay({
  screen,
  viewport,
  arrows,
  scrollTop,
  setScrollTop,
  imageVersion,
  onNavigate,
  platform,
}) {
  const scrollRef = useRef(null);
  const [stripSize, setStripSize] = useState({
    width: viewport.width,
    height: viewport.height * 2,
  });
  const [maxScroll, setMaxScroll] = useState(0);

  const stripConfig = useMemo(
    () => ({
      intrinsicWidth: stripSize.width || viewport.width,
      intrinsicHeight: stripSize.height || viewport.height,
    }),
    [stripSize.width, stripSize.height, viewport.width, viewport.height]
  );

  const stripScreen = useMemo(
    () => ({
      ...screen,
      sourceWidth: stripSize.width || viewport.width,
      sourceHeight: stripSize.height || viewport.height,
    }),
    [screen, stripSize.width, stripSize.height, viewport.width, viewport.height]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop, screen?.id]);

  const atTop = scrollTop <= 0;
  const atBottom = maxScroll > 0 ? scrollTop >= maxScroll - 1 : false;

  const nudge = (delta) => {
    const next = Math.max(0, Math.min(maxScroll, scrollTop + delta));
    setScrollTop(next);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? SCROLL_STEP : -SCROLL_STEP;
    nudge(delta);
  };

  return (
    <>
      {arrows?.up && (
        <button
          type="button"
          className="screen-preview__scroll-btn screen-preview__scroll-btn--up"
          style={{ top: arrows.up.top, left: arrows.up.left }}
          disabled={atTop}
          onClick={(e) => {
            e.stopPropagation();
            nudge(-SCROLL_STEP);
          }}
          title="Scroll up"
        >
          ▲
        </button>
      )}
      {arrows?.down && (
        <button
          type="button"
          className="screen-preview__scroll-btn screen-preview__scroll-btn--down"
          style={{ top: arrows.down.top, left: arrows.down.left }}
          disabled={atBottom}
          onClick={(e) => {
            e.stopPropagation();
            nudge(SCROLL_STEP);
          }}
          title="Scroll down"
        >
          ▼
        </button>
      )}
      <div
        ref={scrollRef}
        className="screen-preview__scroll-viewport"
        style={{
          left: viewport.left,
          top: viewport.top,
          width: viewport.width,
          height: viewport.height,
          borderRadius: viewport.borderRadius || 0,
        }}
        onWheel={handleWheel}
      >
        <div
          className="screen-preview__scroll-content"
          style={{ width: viewport.width, position: 'relative' }}
        >
          {(screen.scrollArea?.buttons || []).map((btn) => (
            <PreviewHotspot
              key={btn.id}
              button={btn}
              screenForCoords={stripScreen}
              imageConfig={stripConfig}
              platform={platform}
              onNavigate={onNavigate}
            />
          ))}
          <img
            key={`${screen.scrollArea.image}-${imageVersion}`}
            src={screenshotUrl(screen.scrollArea.image, imageVersion)}
            alt={`${screen.id} scroll`}
            className="screen-preview__scroll-image"
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              setStripSize({ width: naturalWidth, height: naturalHeight });
              const max = Math.max(0, naturalHeight - viewport.height);
              setMaxScroll(max);
              setScrollTop((prev) => Math.min(prev, max));
            }}
          />
        </div>
      </div>
    </>
  );
}

function hasPopoverContent(popover) {
  return Boolean(popover?.title?.trim() || popover?.text?.trim());
}

function PreviewHotspot({ button, screenForCoords, imageConfig, platform = 'lg', onNavigate }) {
  const normalized = normalizeButton(button);
  const [hovered, setHovered] = useState(false);
  const popover = button.popover;
  const showPopover = hasPopoverContent(popover);
  const hasTarget = useStore((s) =>
    Boolean(normalized.target && s.screensById.has(normalized.target))
  );

  const rect = useMemo(
    () => toDisplayRect(normalized, screenForCoords, imageConfig, platform),
    [
      normalized.left,
      normalized.top,
      normalized.width,
      normalized.height,
      screenForCoords?.sourceWidth,
      screenForCoords?.sourceHeight,
      imageConfig,
      platform,
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
