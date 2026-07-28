import React from 'react';

/**
 * LG simroom–style screen stack: fixed pixel coordinate space with buttons
 * overlaid on the screenshot (buttons before image, like EmulatorV2_screen-stack-container).
 */
export default function ScreenStack({
  sourceSize,
  frameScale,
  stageRef,
  frameRef,
  onFramePointerDown,
  image,
  buttons,
  overlay,
  marquee,
}) {
  const w = sourceSize.width || 1;
  const h = sourceSize.height || 1;

  return (
    <div
      ref={stageRef}
      className="screen-viewer__stage"
      style={{
        width: Math.round(w * frameScale),
        height: Math.round(h * frameScale),
      }}
    >
      <div
        ref={frameRef}
        className="screen-viewer__image-frame"
        style={{
          width: w,
          height: h,
          transform: `scale(${frameScale})`,
        }}
        onPointerDown={onFramePointerDown}
      >
        <div className="screen-viewer__screen-stack">
          {buttons}
          {image}
          {overlay}
          {marquee}
        </div>
      </div>
    </div>
  );
}
