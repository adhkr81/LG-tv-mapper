import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import GraphView from './components/GraphView/GraphView.jsx';
import ScreenViewer from './components/ScreenViewer/ScreenViewer.jsx';
import ScreenPreview from './components/ScreenPreview/ScreenPreview.jsx';
import SidebarEditor from './components/SidebarEditor/SidebarEditor.jsx';
import useStore from './store/useStore.js';
import * as api from './api/client.js';
import './App.css';

export default function App() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const fetchScreens = useStore((s) => s.fetchScreens);
  const fetchConfig = useStore((s) => s.fetchConfig);
  const fetchSerialStatus = useStore((s) => s.fetchSerialStatus);
  const fetchRmusStatus = useStore((s) => s.fetchRmusStatus);
  const setProjectPlatform = useStore((s) => s.setProjectPlatform);
  const resetForProject = useStore((s) => s.resetForProject);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const projectPlatform = useStore((s) => s.projectPlatform);
  const serialStatus = useStore((s) => s.serialStatus);
  const rmusStatus = useStore((s) => s.rmusStatus);
  const connectSerial = useStore((s) => s.connectSerial);
  const disconnectSerial = useStore((s) => s.disconnectSerial);
  const connectRmus = useStore((s) => s.connectRmus);
  const confirmRmusPin = useStore((s) => s.confirmRmusPin);
  const disconnectRmus = useStore((s) => s.disconnectRmus);
  const undo = useStore((s) => s.undo);

  const [projectName, setProjectName] = useState('');
  const [bootError, setBootError] = useState(null);
  const [ready, setReady] = useState(false);
  const [connectError, setConnectError] = useState(null);

  // Panels: 'graph' | 'viewer' | 'preview'
  const [activePanel, setActivePanel] = useState('graph');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setReady(false);
      setBootError(null);
      try {
        api.setCurrentProjectId(projectId);
        resetForProject(projectId);
        const project = await api.openProject(projectId);
        if (cancelled) return;
        const platform = project?.platform === 'samsung' ? 'samsung' : 'lg';
        setProjectPlatform(platform);
        setProjectName(project?.name || projectId);
        const statusFetch =
          platform === 'samsung' ? fetchRmusStatus() : fetchSerialStatus();
        await Promise.all([
          fetchScreens({ clearUndo: true }),
          fetchConfig(),
          statusFetch,
        ]);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setBootError(err.message || 'Failed to open project');
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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

  const isSamsung = projectPlatform === 'samsung';
  const connectionStatus = isSamsung ? rmusStatus : serialStatus;

  useEffect(() => {
    document.documentElement.dataset.platform = projectPlatform || 'lg';
    return () => {
      delete document.documentElement.dataset.platform;
    };
  }, [projectPlatform]);

  const connectionLabel = isSamsung
    ? connectionStatus === 'ready'
      ? 'RMUS Ready'
      : connectionStatus === 'awaiting-pin'
        ? 'Enter PIN in browser…'
        : connectionStatus === 'connecting'
          ? 'Connecting…'
          : connectionStatus === 'error'
            ? 'RMUS Error'
            : 'Disconnected'
    : connectionStatus === 'shell-ready'
      ? 'Shell Ready'
      : connectionStatus === 'connected'
        ? 'Connected'
        : connectionStatus === 'connecting'
          ? 'Connecting...'
          : 'Disconnected';

  const connectionLive =
    isSamsung
      ? connectionStatus === 'ready'
      : connectionStatus === 'shell-ready' || connectionStatus === 'connected';

  const connectionBusy =
    connectionStatus === 'connecting' || connectionStatus === 'awaiting-pin';

  const handleConnect = async () => {
    setConnectError(null);
    try {
      if (isSamsung) {
        await connectRmus();
      } else {
        await connectSerial();
      }
    } catch (err) {
      setConnectError(err.message || 'Connect failed');
    }
  };

  const handleConfirmPin = async () => {
    setConnectError(null);
    try {
      await confirmRmusPin();
    } catch (err) {
      setConnectError(err.message || 'Confirm failed');
    }
  };

  const handleDisconnect = async () => {
    setConnectError(null);
    if (isSamsung) {
      await disconnectRmus();
    } else {
      await disconnectSerial();
    }
  };

  if (bootError) {
    return (
      <div className="app app--boot">
        <p className="app__boot-error">{bootError}</p>
        <button type="button" className="btn btn-accent" onClick={() => navigate('/')}>
          Back to projects
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app app--boot">
        <p className="app__boot-loading">Opening project…</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top bar */}
      <div className="app__tabs">
        {/* Brand */}
        <div className="app__brand">
          <Link to="/" className="app__brand-back" title="All projects">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="app__brand-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <div className="app__brand-text">
            <span className="app__brand-name">UI Mapper</span>
            {projectName && (
              <span className="app__brand-project" title={projectName}>
                {projectName}
              </span>
            )}
          </div>
        </div>
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
        <div className="app__serial" aria-label={isSamsung ? 'RMUS connection' : 'Serial connection'}>
          <span
            className={`status-dot ${connectionLive ? 'connected' : connectionBusy ? 'connecting' : ''}`}
          />
          <span className="app__serial-label">{connectionLabel}</span>
          {connectionStatus === 'awaiting-pin' ? (
            <button type="button" className="btn btn-sm btn-accent" onClick={handleConfirmPin}>
              I entered PIN
            </button>
          ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
            <button type="button" className="btn btn-sm btn-accent" onClick={handleConnect}>
              Connect
            </button>
          ) : connectionBusy ? null : (
            <button type="button" className="btn btn-sm btn-danger" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>
      {connectError && (
        <div className="app__connect-error" role="alert">
          {connectError}
        </div>
      )}

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
