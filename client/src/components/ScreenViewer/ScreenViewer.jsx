import React, { useCallback } from 'react';
import useStore from '../../store/useStore.js';
import './ScreenViewer.css';

export default function ScreenViewer() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const isAddingHotspot = useStore((s) => s.isAddingHotspot);
  const setAddingHotspot = useStore((s) => s.setAddingHotspot);
  const addButton = useStore((s) => s.addButton);

  const screen = screens.find((s) => s.id === selectedScreenId);

  const handleImageClick = useCallback(
    (e) => {
      if (!isAddingHotspot || !screen) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const img = e.currentTarget;

      // Calculate position relative to image natural size
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      // Prompt for button info
      const label = prompt('Button name:');
      if (!label) return;

      const target = prompt('Target screen name (leave empty if unknown):') || '';

      addButton(screen.id, { label, target, x, y });
      setAddingHotspot(false);
    },
    [isAddingHotspot, screen, addButton, setAddingHotspot]
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

      <div className={`screen-viewer__image-container ${isAddingHotspot ? 'screen-viewer--crosshair' : ''}`}>
        <img
          src={`/screenshots/${screen.image}`}
          alt={screen.id}
          className="screen-viewer__image"
          onClick={handleImageClick}
          draggable={false}
        />

        {/* Button hotspot overlays */}
        {screen.buttons.map((btn) => (
          <HotspotMarker key={btn.id} button={btn} screen={screen} />
        ))}
      </div>

      {isAddingHotspot && (
        <div className="screen-viewer__hint">
          Click on the image to place a hotspot
        </div>
      )}
    </div>
  );
}

function HotspotMarker({ button, screen }) {
  const screens = useStore((s) => s.screens);
  const hasTarget = button.target && screens.some((s) => s.id === button.target);

  // We need to position the marker using percentage-based positioning
  // since the image may be scaled down
  const style = {
    left: `${(button.x / 3840) * 100}%`,
    top: `${(button.y / 2160) * 100}%`,
  };

  return (
    <div
      className={`hotspot-marker ${hasTarget ? 'hotspot-marker--linked' : 'hotspot-marker--unlinked'}`}
      style={style}
      title={`${button.label}${button.target ? ` → ${button.target}` : ''}`}
    >
      <span className="hotspot-marker__label">{button.label}</span>
    </div>
  );
}
