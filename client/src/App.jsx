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

  // Panels: 'graph' | 'viewer' | 'preview'
  const [activePanel, setActivePanel] = useState('graph');

  useEffect(() => {
    fetchScreens();
    fetchConfig();
    fetchSerialStatus();
  }, []);

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
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          Viewer
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

      {/* Main content area */}
      <div className="app__content">
        <div className="app__main">
          {activePanel === 'graph' && <GraphView />}
          {activePanel === 'preview' && <ScreenPreview />}
          {activePanel === 'viewer' && <ScreenViewer />}
        </div>
        <SidebarEditor mode={activePanel} />
      </div>
    </div>
  );
}
