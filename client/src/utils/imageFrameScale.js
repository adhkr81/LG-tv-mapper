import { useEffect, useState } from 'react';

/** Scale factor so a W×H frame fills 80% of its container (may upscale small images). */
export function computeImageFrameScale(containerWidth, containerHeight, imageWidth, imageHeight) {
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) return 1;
  return Math.min(containerWidth / imageWidth, containerHeight / imageHeight) * 0.8;
}

export function useImageFrameScale(containerRef, imageSize) {
  const [frameScale, setFrameScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const w = imageSize?.width;
    const h = imageSize?.height;
    if (!container || !w || !h) return;

    const update = () => {
      setFrameScale(
        computeImageFrameScale(container.clientWidth, container.clientHeight, w, h)
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, imageSize?.width, imageSize?.height]);

  return frameScale;
}

export function getFrameScale(frameEl, imageSize) {
  const frameRect = frameEl.getBoundingClientRect();
  return {
    scaleX: imageSize.width / frameRect.width,
    scaleY: imageSize.height / frameRect.height,
  };
}

/** Map pointer position to image pixel coords inside the frame (top-left = 0,0). */
export function clientToImagePoint(clientX, clientY, frameEl, imageSize) {
  const frameRect = frameEl.getBoundingClientRect();
  const scaleX = imageSize.width / frameRect.width;
  const scaleY = imageSize.height / frameRect.height;
  return {
    x: (clientX - frameRect.left) * scaleX,
    y: (clientY - frameRect.top) * scaleY,
  };
}

/** Match LG simroom EmulatorV2_button inline style order (top, left, height, width). */
export function emulatorButtonStyle(rect) {
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    height: `${rect.height}px`,
    width: `${rect.width}px`,
  };
}

export const hotspotStyle = emulatorButtonStyle;
