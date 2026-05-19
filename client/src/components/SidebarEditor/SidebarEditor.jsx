import React, { useState, useEffect } from 'react';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import './SidebarEditor.css';

export default function SidebarEditor() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const serialStatus = useStore((s) => s.serialStatus);
  const connectSerial = useStore((s) => s.connectSerial);
  const disconnectSerial = useStore((s) => s.disconnectSerial);
  const deleteScreen = useStore((s) => s.deleteScreen);
  const deleteButton = useStore((s) => s.deleteButton);
  const updateButton = useStore((s) => s.updateButton);
  const updateScreenName = useStore((s) => s.updateScreenName);
  const selectedButtonId = useStore((s) => s.selectedButtonId);
  const selectButton = useStore((s) => s.selectButton);

  const screen = screens.find((s) => s.id === selectedScreenId);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  useEffect(() => {
    if (screen) setNameValue(screen.id);
  }, [screen?.id]);

  const handleRename = async () => {
    if (!nameValue.trim() || nameValue === screen.id) {
      setEditingName(false);
      return;
    }
    try {
      await updateScreenName(screen.id, nameValue.trim());
      setEditingName(false);
    } catch (err) {
      alert('Rename failed: ' + err.message);
    }
  };

  const handleTargetChange = async (buttonId, newTarget) => {
    try {
      await updateButton(screen.id, buttonId, { target: newTarget });
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleRectChange = async (buttonId, updates) => {
    try {
      await updateButton(screen.id, buttonId, updates);
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const statusLabel =
    serialStatus === 'shell-ready' ? 'Shell Ready' :
    serialStatus === 'connected' ? 'Connected' :
    serialStatus === 'connecting' ? 'Connecting...' : 'Disconnected';

  return (
    <div className="sidebar">
      {/* Serial connection section */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">Serial Connection</div>
        <div className="sidebar__serial-row">
          <span className={`status-dot ${serialStatus === 'shell-ready' || serialStatus === 'connected' ? 'connected' : serialStatus === 'connecting' ? 'connecting' : ''}`} />
          <span className="sidebar__serial-label">{statusLabel}</span>
          {serialStatus === 'disconnected' ? (
            <button className="btn btn-sm btn-accent" onClick={connectSerial}>Connect</button>
          ) : serialStatus === 'connecting' ? null : (
            <button className="btn btn-sm btn-danger" onClick={disconnectSerial}>Disconnect</button>
          )}
        </div>
      </div>

      {/* Screen info */}
      {screen ? (
        <>
          <div className="sidebar__section">
            <div className="sidebar__section-title">Screen</div>

            {editingName ? (
              <div className="sidebar__rename">
                <input
                  className="input"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  autoFocus
                />
                <button className="btn btn-sm btn-accent" onClick={handleRename}>Save</button>
                <button className="btn btn-sm" onClick={() => setEditingName(false)}>✕</button>
              </div>
            ) : (
              <div className="sidebar__screen-name" onClick={() => setEditingName(true)}>
                <span>{screen.id}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            )}

            <div className="sidebar__screen-image">
              <img src={`/screenshots/${screen.image}`} alt={screen.id} />
            </div>

            <button className="btn btn-danger btn-sm sidebar__delete-btn" onClick={() => {
              if (confirm(`Delete screen "${screen.id}"?`)) deleteScreen(screen.id);
            }}>
              Delete Screen
            </button>
          </div>

          {/* Buttons list */}
          <div className="sidebar__section sidebar__section--grow">
            <div className="sidebar__section-title">
              Buttons ({screen.buttons.length})
            </div>

            {screen.buttons.length === 0 ? (
              <div className="sidebar__empty">No buttons yet. Click "Add Hotspot" in the viewer.</div>
            ) : (
              <div className="sidebar__button-list">
                {screen.buttons.map((btn) => (
                  <div
                    key={btn.id}
                    className={`sidebar__button-item ${btn.id === selectedButtonId ? 'sidebar__button-item--selected' : ''}`}
                    onClick={() => selectButton(btn.id)}
                  >
                    <div className="sidebar__button-header">
                      <span className={`sidebar__button-dot ${btn.target && screens.some(s => s.id === btn.target) ? 'linked' : 'unlinked'}`} />
                      <span className="sidebar__button-name">{btn.label}</span>
                      <button
                        className="sidebar__button-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteButton(screen.id, btn.id);
                        }}
                        title="Delete button"
                      >✕</button>
                    </div>
                    <div className="sidebar__button-target" onClick={(e) => e.stopPropagation()}>
                      <label className="label">Target</label>
                      <select
                        className="input"
                        value={btn.target || ''}
                        onChange={(e) => handleTargetChange(btn.id, e.target.value)}
                      >
                        <option value="">— none —</option>
                        {screens.filter(s => s.id !== screen.id).map(s => (
                          <option key={s.id} value={s.id}>{s.id}</option>
                        ))}
                      </select>
                    </div>
                    <ButtonRectInputs
                      button={btn}
                      onUpdate={(updates) => handleRectChange(btn.id, updates)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="sidebar__section sidebar__section--grow">
          <div className="sidebar__empty">
            Select a screen from the graph to edit its details and buttons.
          </div>
        </div>
      )}
    </div>
  );
}

function ButtonRectInputs({ button, onUpdate }) {
  const rect = normalizeButton(button);
  const [fields, setFields] = useState({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  });

  useEffect(() => {
    const next = normalizeButton(button);
    setFields({
      top: next.top,
      left: next.left,
      width: next.width,
      height: next.height,
    });
  }, [button.id, button.left, button.top, button.width, button.height, button.x, button.y]);

  const commit = (next) => {
    onUpdate({
      left: next.left,
      top: next.top,
      width: next.width,
      height: next.height,
    });
  };

  const handleChange = (key, raw) => {
    const min = key === 'width' || key === 'height' ? 1 : 0;
    const value = raw === '' ? min : Math.max(min, parseInt(raw, 10) || 0);
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = () => commit(fields);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <div className="sidebar__button-rect" onClick={(e) => e.stopPropagation()}>
      <label className="sidebar__rect-field">
        <span className="label">Top</span>
        <input
          className="input"
          type="number"
          min="0"
          value={fields.top}
          onChange={(e) => handleChange('top', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Left</span>
        <input
          className="input"
          type="number"
          min="0"
          value={fields.left}
          onChange={(e) => handleChange('left', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Width</span>
        <input
          className="input"
          type="number"
          min="1"
          value={fields.width}
          onChange={(e) => handleChange('width', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Height</span>
        <input
          className="input"
          type="number"
          min="1"
          value={fields.height}
          onChange={(e) => handleChange('height', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
    </div>
  );
}
