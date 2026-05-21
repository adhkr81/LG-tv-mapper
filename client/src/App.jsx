import React, { useEffect, useState } from 'react';
import GraphView from './components/GraphView/GraphView.jsx';
import ScreenViewer from './components/ScreenViewer/ScreenViewer.jsx';
import ScreenPreview from './components/ScreenPreview/ScreenPreview.jsx';
import SidebarEditor from './components/SidebarEditor/SidebarEditor.jsx';
import useStore from './store/useStore.js';
import './App.css';

export default function App() {
  const fetchScreens = useStore((s) => s.fetchScreens);
  const fetchConfig = useStore((s) => s.fetchConfig);
  const fetchSerialStatus = useStore((s) => s.fetchSerialStatus);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const serialStatus = useStore((s) => s.serialStatus);
  const connectSerial = useStore((s) => s.connectSerial);
  const disconnectSerial = useStore((s) => s.disconnectSerial);
  const undo = useStore((s) => s.undo);

  // Panels: 'graph' | 'viewer' | 'preview'
  const [activePanel, setActivePanel] = useState('graph');

  useEffect(() => {
    fetchScreens({ clearUndo: true });
    fetchConfig();
    fetchSerialStatus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!useStore.getState().canUndo) return;
      e.preventDefault();
      void undo().catch((err) => {
        console.error('Undo failed:', err);
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  const serialStatusLabel =
    serialStatus === 'shell-ready' ? 'Shell Ready' :
    serialStatus === 'connected' ? 'Connected' :
    serialStatus === 'connecting' ? 'Connecting...' : 'Disconnected';

  return (
    <div className="app">
      {/* Panel toggle tabs */}
      <div className="app__tabs">
        <div className="app__tabs-nav">
          <button
            className={`app__tab ${activePanel === 'graph' ? 'app__tab--active' : ''}`}
            onClick={() => setActivePanel('graph')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="5" cy="6" r="3" />
              <circle cx="19" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <line x1="7.5" y1="7.5" x2="10.5" y2="16.5" />
              <line x1="16.5" y1="7.5" x2="13.5" y2="16.5" />
            </svg>
            Flow
          </button>
          <button
            className={`app__tab ${activePanel === 'viewer' ? 'app__tab--active' : ''}`}
            onClick={() => setActivePanel('viewer')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            Screen
          </button>
          <button
            className={`app__tab ${activePanel === 'preview' ? 'app__tab--active' : ''}`}
            onClick={() => setActivePanel('preview')}
            disabled={!selectedScreenId}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Preview
          </button>
        </div>
        <div className="app__serial" aria-label="Serial connection">
          <span
            className={`status-dot ${serialStatus === 'shell-ready' || serialStatus === 'connected' ? 'connected' : serialStatus === 'connecting' ? 'connecting' : ''}`}
          />
          <span className="app__serial-label">{serialStatusLabel}</span>
          {serialStatus === 'disconnected' ? (
            <button type="button" className="btn btn-sm btn-accent" onClick={connectSerial}>
              Connect
            </button>
          ) : serialStatus === 'connecting' ? null : (
            <button type="button" className="btn btn-sm btn-danger" onClick={disconnectSerial}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="app__content">
        <div className="app__main">
          <GraphView isActive={activePanel === 'graph'} />
          {activePanel === 'preview' && (
            <div className="app__panel-overlay">
              <ScreenPreview />
            </div>
          )}
          {activePanel === 'viewer' && (
            <div className="app__panel-overlay">
              <ScreenViewer />
            </div>
          )}
        </div>
        <SidebarEditor mode={activePanel} />
      </div>
    </div>
  );
}
