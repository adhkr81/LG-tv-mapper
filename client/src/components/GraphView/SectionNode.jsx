import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import './GraphView.css';

function SectionNode({ data, selected }) {
  const { label, screenCount, linkCount, color } = data;

  return (
    <div
      className={`section-node ${selected ? 'section-node--selected' : ''}`}
      style={{
        '--section-color': color,
        borderColor: color,
      }}
    >
      <Handle type="target" position={Position.Top} className="section-node__handle" />

      <div className="section-node__body">
        <div className="section-node__icon" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div className="section-node__label">{label}</div>
        <div className="section-node__meta">
          {screenCount} screen{screenCount !== 1 ? 's' : ''}
          {data.collapsed ? ' · click to expand' : ''}
        </div>
      </div>

      {linkCount > 0 && (
        <div className="section-node__badge">{linkCount}</div>
      )}

      <Handle type="source" position={Position.Bottom} className="section-node__handle" />
    </div>
  );
}

export default memo(SectionNode);
