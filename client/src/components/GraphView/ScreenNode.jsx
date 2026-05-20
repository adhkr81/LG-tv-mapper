import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import useStore from '../../store/useStore.js';
import { screenshotUrl } from '../../utils/screenshotUrl.js';
import './GraphView.css';

function ScreenNode({ id, data, selected }) {
  const { label, image, buttonCount, isExternal } = data;
  const imageVersion = useStore((s) => s.imageVersions[id] ?? 0);
  const capturingScreenId = useStore((s) => s.capturingScreenId);
  const captureProgress = useStore((s) => s.captureProgress);
  const isCapturing = id === capturingScreenId && captureProgress;
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(image?.trim());

  useEffect(() => {
    setImageFailed(false);
  }, [image, imageVersion]);

  return (
    <div
      className={`screen-node ${selected ? 'screen-node--selected' : ''} ${isExternal ? 'screen-node--external' : ''} ${isCapturing ? 'screen-node--capturing' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="screen-node__handle" />

      <div className="screen-node__thumb">
        {hasImage && !imageFailed ? (
          <img
            key={`${image}-${imageVersion}`}
            src={screenshotUrl(image, imageVersion)}
            alt={label}
            className="screen-node__img"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="screen-node__placeholder">
            <span className="screen-node__no-image">no image</span>
          </div>
        )}
        {isCapturing && (
          <div className="screen-node__capture-progress" role="status" aria-live="polite">
            <div className="screen-node__capture-progress-header">
              <span className="screen-node__capture-progress-label">{captureProgress.label}</span>
              <span className="screen-node__capture-progress-percent">{captureProgress.percent}%</span>
            </div>
            <div
              className="screen-node__capture-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={captureProgress.percent}
              aria-label={captureProgress.label}
            >
              <div
                className="screen-node__capture-progress-bar"
                style={{ width: `${captureProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="screen-node__label">{label}</div>

      {buttonCount > 0 && (
        <div className="screen-node__badge">{buttonCount}</div>
      )}

      <Handle type="source" position={Position.Bottom} className="screen-node__handle" />
    </div>
  );
}

export default memo(ScreenNode);
