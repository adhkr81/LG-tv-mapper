import React, { useMemo, useCallback, useState, useRef } from 'react';
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
import useStore from '../../store/useStore.js';
import './GraphView.css';

const nodeTypes = { screenNode: ScreenNode };

export default function GraphView() {
  const screens = useStore((s) => s.screens);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectScreen = useStore((s) => s.selectScreen);
  const importScreen = useStore((s) => s.importScreen);
  const captureScreen = useStore((s) => s.captureScreen);
  const serialStatus = useStore((s) => s.serialStatus);
  const isCapturing = useStore((s) => s.isCapturing);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [newScreenId, setNewScreenId] = useState('');
  const [importFile, setImportFile] = useState(null);
  const fileInputRef = useRef(null);

  // Build React Flow nodes from screens
  const initialNodes = useMemo(() => {
    return screens.map((screen, i) => ({
      id: screen.id,
      type: 'screenNode',
      position: { x: (i % 4) * 260, y: Math.floor(i / 4) * 220 },
      data: {
        label: screen.id,
        image: screen.image,
        buttonCount: screen.buttons.length,
      },
      selected: screen.id === selectedScreenId,
    }));
  }, [screens, selectedScreenId]);

  // Build edges from button targets
  const initialEdges = useMemo(() => {
    const edges = [];
    const screenIds = new Set(screens.map((s) => s.id));

    screens.forEach((screen) => {
      screen.buttons.forEach((btn) => {
        if (btn.target && screenIds.has(btn.target)) {
          edges.push({
            id: `e-${btn.id}`,
            source: screen.id,
            target: btn.target,
            label: btn.label,
            animated: true,
            style: { stroke: '#00e5ff', strokeWidth: 2 },
            labelStyle: { fill: '#8a8a9e', fontSize: 11 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#00e5ff',
              width: 16,
              height: 16,
            },
          });
        }
      });
    });

    return edges;
  }, [screens]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when screens change
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const onNodeClick = useCallback((_, node) => {
    selectScreen(node.id);
  }, [selectScreen]);

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
      {/* Toolbar */}
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
            onClick={() => { setShowCaptureModal(true); setNewScreenId(''); }}
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
            onClick={() => { setShowImportModal(true); setNewScreenId(''); setImportFile(null); }}
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
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
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
