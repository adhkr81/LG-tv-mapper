import React, { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import useStore from '../../store/useStore.js';
import './GraphView.css';

function ScreenNode({ id, data }) {
  const { label, image, buttonCount, isExternal } = data;
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const selected = id === selectedScreenId;

  const handleSelect = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.react-flow__handle')) return;
      selectScreen(id);
    },
    [id, selectScreen]
  );

  return (
    <div
      className={`screen-node ${selected ? 'screen-node--selected' : ''} ${isExternal ? 'screen-node--external' : ''}`}
      onPointerDown={handleSelect}
    >
      <Handle type="target" position={Position.Top} className="screen-node__handle" />

      <div className="screen-node__thumb">
        {image ? (
          <img
            src={`/screenshots/${image}`}
            alt={label}
            className="screen-node__img"
            draggable={false}
          />
        ) : (
          <div className="screen-node__placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
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
