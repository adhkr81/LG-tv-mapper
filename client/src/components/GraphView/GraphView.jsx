import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ScreenNode from './ScreenNode.jsx';
import SectionBar from '../SectionBar/SectionBar.jsx';
import useStore from '../../store/useStore.js';
import { rectCenteredAt } from '../../utils/buttonRect.js';
import { getSectionGraphScreens, suggestScreenId } from '../../utils/sectionGraph.js';
import './GraphView.css';

const nodeTypes = { screenNode: ScreenNode };

function defaultNodePosition(index) {
  return { x: (index % 4) * 220, y: Math.floor(index / 4) * 185 };
}

function getSavedPosition(screen, index) {
  if (screen.graphX != null && screen.graphY != null) {
    return { x: screen.graphX, y: screen.graphY };
  }
  return defaultNodePosition(index);
}

export default function GraphView() {
  const screens = useStore((s) => s.screens);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const importScreen = useStore((s) => s.importScreen);
  const captureScreen = useStore((s) => s.captureScreen);
  const addButton = useStore((s) => s.addButton);
  const updateScreenGraphPosition = useStore((s) => s.updateScreenGraphPosition);
  const serialStatus = useStore((s) => s.serialStatus);
  const isCapturing = useStore((s) => s.isCapturing);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [newScreenId, setNewScreenId] = useState('');
  const [importFile, setImportFile] = useState(null);
  const fileInputRef = useRef(null);
  const flowRef = useRef(null);

  const { primary, external } = useMemo(
    () => getSectionGraphScreens(screens, activeSectionId),
    [screens, activeSectionId]
  );

  const visibleScreens = useMemo(
    () => [...primary, ...external],
    [primary, external]
  );

  const externalIds = useMemo(
    () => new Set(external.map((s) => s.id)),
    [external]
  );

  const maxPrimaryX = useMemo(() => {
    if (primary.length === 0) return 0;
    return Math.max(...primary.map((s, i) => getSavedPosition(s, i).x));
  }, [primary]);

  // Build React Flow nodes from visible screens
  const initialNodes = useMemo(() => {
    return visibleScreens.map((screen, i) => {
      const isExternal = externalIds.has(screen.id);
      let position = getSavedPosition(screen, i);
      if (isExternal && activeSectionId) {
        const extIndex = external.findIndex((s) => s.id === screen.id);
        position = {
          x: maxPrimaryX + 280,
          y: extIndex * 185,
        };
      }
      return {
        id: screen.id,
        type: 'screenNode',
        position,
        data: {
          label: screen.id,
          image: screen.image,
          buttonCount: screen.buttons.length,
          isExternal,
        },
        selected: screen.id === selectedScreenId,
      };
    });
  }, [visibleScreens, externalIds, activeSectionId, maxPrimaryX, selectedScreenId, external]);

  // Build edges from button targets (within visible set)
  const initialEdges = useMemo(() => {
    const edges = [];
    const screenIds = new Set(visibleScreens.map((s) => s.id));

    visibleScreens.forEach((screen) => {
      screen.buttons.forEach((btn) => {
        if (btn.target && screenIds.has(btn.target)) {
          const crossSection = externalIds.has(screen.id) || externalIds.has(btn.target);
          edges.push({
            id: `e-${btn.id}`,
            source: screen.id,
            target: btn.target,
            label: btn.label,
            animated: !crossSection,
            style: {
              stroke: crossSection ? '#ffab00' : '#00e5ff',
              strokeWidth: 2,
              strokeDasharray: crossSection ? '6 4' : undefined,
            },
            labelStyle: { fill: '#8a8a9e', fontSize: 11 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: crossSection ? '#ffab00' : '#00e5ff',
              width: 16,
              height: 16,
            },
          });
        }
      });
    });

    return edges;
  }, [visibleScreens, externalIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync data when screens change; keep dragged positions until server state catches up
  useEffect(() => {
    setNodes((current) =>
      initialNodes.map((node) => {
        const prev = current.find((n) => n.id === node.id);
        return {
          ...node,
          position: prev?.position ?? node.position,
        };
      })
    );
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!flowRef.current) return;
    const t = setTimeout(() => flowRef.current?.fitView({ padding: 0.25 }), 80);
    return () => clearTimeout(t);
  }, [activeSectionId, visibleScreens.length]);

  const openCaptureModal = () => {
    setNewScreenId(
      activeSectionId ? suggestScreenId(activeSectionId, screens) : ''
    );
    setShowCaptureModal(true);
  };

  const openImportModal = () => {
    setNewScreenId(
      activeSectionId ? suggestScreenId(activeSectionId, screens) : ''
    );
    setImportFile(null);
    setShowImportModal(true);
  };

  const onNodeClick = useCallback((_, node) => {
    selectScreen(node.id);
  }, [selectScreen]);

  const onNodeDragStop = useCallback(
    (_, node) => {
      updateScreenGraphPosition(node.id, node.position.x, node.position.y);
    },
    [updateScreenGraphPosition]
  );

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const onConnect = useCallback(
    async (connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      const label = `→ ${target}`;
      try {
        await addButton(source, {
          label,
          target,
          ...rectCenteredAt(960, 540),
        });
      } catch (err) {
        alert('Failed to create link: ' + err.message);
      }
    },
    [addButton]
  );

  const handleImport = async () => {
    if (!newScreenId.trim() || !importFile) return;
    try {
      await importScreen(newScreenId.trim(), importFile);
      setShowImportModal(false);
      setNewScreenId('');
      setImportFile(null);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleCapture = async () => {
    if (!newScreenId.trim()) return;
    try {
      await captureScreen(newScreenId.trim());
      setShowCaptureModal(false);
      setNewScreenId('');
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
  };

  return (
    <div className="graph-view">
      <SectionBar />

      <div className="graph-view__toolbar">
        <div className="graph-view__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <span>LG TV UI Mapper</span>
        </div>

        <div className="graph-view__actions">
          <button
            className="btn btn-accent"
            onClick={openCaptureModal}
            disabled={serialStatus !== 'shell-ready' && serialStatus !== 'connected'}
            title={serialStatus !== 'shell-ready' ? 'Connect serial first' : 'Capture from TV'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Capture
          </button>

          <button
            className="btn"
            onClick={openImportModal}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onInit={(instance) => { flowRef.current = instance; }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="graph-view__canvas"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a26" gap={20} size={1} />
        <Controls className="graph-view__controls" />
      </ReactFlow>

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Import Screenshot</h3>
            {activeSectionId && (
              <p className="graph-view__section-note">Adds to section: {activeSectionId}</p>
            )}

            <div className="modal__field">
              <label className="label">Screen Name</label>
              <input
                className="input"
                value={newScreenId}
                onChange={(e) => setNewScreenId(e.target.value)}
                placeholder="e.g. home, settings, apps"
                autoFocus
              />
            </div>

            <div className="modal__field">
              <label className="label">Screenshot File</label>
              <div
                className="modal__dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setImportFile(f);
                }}
              >
                {importFile ? (
                  <span className="modal__filename">{importFile.name}</span>
                ) : (
                  <span>Drop image here or click to browse</span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => setImportFile(e.target.files[0] || null)}
                />
              </div>
            </div>

            <div className="modal__actions">
              <button className="btn" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button
                className="btn btn-accent"
                onClick={handleImport}
                disabled={!newScreenId.trim() || !importFile}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Modal */}
      {showCaptureModal && (
        <div className="modal-overlay" onClick={() => setShowCaptureModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Capture from TV</h3>
            {activeSectionId && (
              <p className="graph-view__section-note">Adds to section: {activeSectionId}</p>
            )}

            <div className="modal__field">
              <label className="label">Screen Name</label>
              <input
                className="input"
                value={newScreenId}
                onChange={(e) => setNewScreenId(e.target.value)}
                placeholder="e.g. home, settings, apps"
                autoFocus
              />
            </div>

            <div className="modal__actions">
              <button className="btn" onClick={() => setShowCaptureModal(false)}>Cancel</button>
              <button
                className="btn btn-accent"
                onClick={handleCapture}
                disabled={!newScreenId.trim() || isCapturing}
              >
                {isCapturing ? 'Capturing...' : 'Capture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
