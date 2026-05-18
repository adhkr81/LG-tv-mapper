import React, { useEffect, useState } from 'react';
import GraphView from './components/GraphView/GraphView.jsx';
import ScreenViewer from './components/ScreenViewer/ScreenViewer.jsx';
import SidebarEditor from './components/SidebarEditor/SidebarEditor.jsx';
import useStore from './store/useStore.js';
import './App.css';

export default function App() {
  const fetchScreens = useStore((s) => s.fetchScreens);
  const fetchSerialStatus = useStore((s) => s.fetchSerialStatus);
  const selectedScreenId = useStore((s) => s.selectedScreenId);

  // Panels: 'graph' or 'viewer'
  const [activePanel, setActivePanel] = useState('graph');

  useEffect(() => {
    fetchScreens();
    fetchSerialStatus();
  }, []);

  // Switch to viewer when a screen is selected
  useEffect(() => {
    if (selectedScreenId) setActivePanel('viewer');
  }, [selectedScreenId]);

  return (
    <div className="app">
      {/* Panel toggle tabs */}
      <div className="app__tabs">
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
          Graph
        </button>
        <button
          className={`app__tab ${activePanel === 'viewer' ? 'app__tab--active' : ''}`}
          onClick={() => setActivePanel('viewer')}
          disabled={!selectedScreenId}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          Viewer
        </button>
      </div>

      {/* Main content area */}
      <div className="app__content">
        <div className="app__main">
          {activePanel === 'graph' ? <GraphView /> : <ScreenViewer />}
        </div>
        <SidebarEditor />
      </div>
    </div>
  );
}
