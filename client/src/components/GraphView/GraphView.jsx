import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ScreenNode from './ScreenNode.jsx';
import SectionNode from './SectionNode.jsx';
import useStore from '../../store/useStore.js';
import { rectCenteredAt } from '../../utils/buttonRect.js';
import {
  getNextNumericScreenId,
  isRealSectionView,
  suggestScreenIdForSection,
  resolveImportScreenId,
} from '../../utils/sectionGraph.js';
import {
  buildGraphPositionUpdates,
  buildSectionGraphFlow,
  filterSelectionToNodes,
  nextNewNodePosition,
  toStoredGraphPosition,
} from '../../utils/graphFlow.js';
import { promptDeleteScreens } from '../../utils/deleteScreenPrompt.js';
import './GraphView.css';

const nodeTypes = { screenNode: ScreenNode, sectionNode: SectionNode };

export default function GraphView({ isActive = true }) {
  const screens = useStore((s) => s.screens);
  const sections = useStore((s) => s.sections);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectedScreenIds = useStore((s) => s.selectedScreenIds);
  const setSelectedScreenIds = useStore((s) => s.setSelectedScreenIds);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const toggleSectionCollapsed = useStore((s) => s.toggleSectionCollapsed);
  const deleteScreens = useStore((s) => s.deleteScreens);
  const importScreens = useStore((s) => s.importScreens);
  const captureScreen = useStore((s) => s.captureScreen);
  const addButton = useStore((s) => s.addButton);
  const updateScreenGraphPositions = useStore((s) => s.updateScreenGraphPositions);
  const persistGraphLayoutFromNodes = useStore((s) => s.persistGraphLayoutFromNodes);
  const serialStatus = useStore((s) => s.serialStatus);
  const isCapturing = useStore((s) => s.isCapturing);
  const capturingScreenId = useStore((s) => s.capturingScreenId);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [newScreenId, setNewScreenId] = useState('');
  const [importFiles, setImportFiles] = useState([]);
  const fileInputRef = useRef(null);
  const flowRef = useRef(null);
  const prevSectionRef = useRef(activeSectionId);
  const fitViewContextRef = useRef({
    activeSectionId,
    isActive,
    nodesLength: 0,
  });
  const dragSessionRef = useRef(null);
  const dragSaveTimerRef = useRef(null);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildSectionGraphFlow(screens, activeSectionId, sections),
    [screens, activeSectionId, sections]
  );

  const nodesRef = useRef(initialNodes);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  nodesRef.current = nodes;

  const flushDragPositions = useCallback(() => {
    const ids = dragSessionRef.current;
    if (!ids?.size) return;

    const current = nodesRef.current;
    if (!isRealSectionView(activeSectionId)) {
      void persistGraphLayoutFromNodes(current);
    } else {
      const updates = buildGraphPositionUpdates(
        current.filter((n) => ids.has(n.id))
      );
      if (updates.length) {
        void updateScreenGraphPositions(updates);
      }
    }
    dragSessionRef.current = null;
  }, [
    activeSectionId,
    persistGraphLayoutFromNodes,
    updateScreenGraphPositions,
  ]);

  const scheduleDragPositionSave = useCallback(() => {
    if (dragSaveTimerRef.current) {
      clearTimeout(dragSaveTimerRef.current);
    }
    dragSaveTimerRef.current = setTimeout(() => {
      dragSaveTimerRef.current = null;
      flushDragPositions();
    }, 0);
  }, [flushDragPositions]);

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      const dragEnded = changes.some(
        (c) => c.type === 'position' && c.dragging === false
      );
      if (dragEnded && dragSessionRef.current?.size) {
        scheduleDragPositionSave();
      }
    },
    [onNodesChange, scheduleDragPositionSave]
  );

  // Sync data when screens change; keep dragged positions until server state catches up
  useEffect(() => {
    const prevSection = prevSectionRef.current;
    const sectionChanged = prevSection !== activeSectionId;
    prevSectionRef.current = activeSectionId;

    const wasAllScreensLayout = !isRealSectionView(prevSection);
    const isAllScreensLayout = !isRealSectionView(activeSectionId);
    const enteringAllScreens = sectionChanged && isAllScreensLayout;
    const enteringSection = sectionChanged && isRealSectionView(activeSectionId);

    // Leaving All screens (expanded or collapsed): persist coords + section bands
    if (sectionChanged && wasAllScreensLayout && nodesRef.current.length > 0) {
      void persistGraphLayoutFromNodes(nodesRef.current);
    }

    // Leaving a section: persist section-local node positions
    if (enteringAllScreens && isRealSectionView(prevSection) && nodesRef.current.length > 0) {
      void updateScreenGraphPositions(
        buildGraphPositionUpdates(nodesRef.current)
      );
    }

    const validSelected = filterSelectionToNodes(initialNodes, selectedScreenIds);
    if (validSelected.length !== selectedScreenIds.length) {
      setSelectedScreenIds(validSelected);
      return;
    }

    const selected = new Set(validSelected);

    setNodes((current) => {
      const next = initialNodes.map((node) => {
        const live = current.find((n) => n.id === node.id);
        let position;

        if (sectionChanged) {
          position = node.position;
        } else if (enteringSection && live) {
          position = toStoredGraphPosition(live);
        } else {
          position = live?.position ?? node.position;
        }

        return {
          ...node,
          position,
          selected: selected.has(node.id),
        };
      });

      if (capturingScreenId && !next.some((n) => n.id === capturingScreenId)) {
        const prev = current.find((n) => n.id === capturingScreenId);
        next.push({
          id: capturingScreenId,
          type: 'screenNode',
          position: prev?.position ?? nextNewNodePosition(next),
          selected: selected.has(capturingScreenId),
          data: {
            label: capturingScreenId,
            image: null,
            buttonCount: 0,
            isExternal: false,
          },
        });
      }

      return next;
    });
    setEdges(initialEdges);
  }, [
    initialNodes,
    initialEdges,
    capturingScreenId,
    activeSectionId,
    selectedScreenIds,
    setSelectedScreenIds,
    setNodes,
    setEdges,
  ]);

  // Refit when switching sections or returning to the Flow tab — not on collapse/expand
  // (those change nodes.length but should keep the current pan/zoom).
  useEffect(() => {
    const prev = fitViewContextRef.current;
    const sectionChanged = prev.activeSectionId !== activeSectionId;
    const becameActive = !prev.isActive && isActive;
    const initialLoad = prev.nodesLength === 0 && nodes.length > 0;
    const enteringAllScreens =
      sectionChanged &&
      activeSectionId == null &&
      prev.activeSectionId != null;

    fitViewContextRef.current = {
      activeSectionId,
      isActive,
      nodesLength: nodes.length,
    };

    if (!isActive || !flowRef.current || nodes.length === 0) return undefined;
    if (!sectionChanged && !becameActive && !initialLoad && !enteringAllScreens) {
      return undefined;
    }

    const delay = enteringAllScreens ? 200 : 120;
    const t = setTimeout(() => flowRef.current?.fitView({ padding: 0.25 }), delay);
    return () => clearTimeout(t);
  }, [activeSectionId, isActive, nodes.length]);

  useEffect(() => {
    setSelectedScreenIds([]);
  }, [activeSectionId, setSelectedScreenIds]);

  useEffect(
    () => () => {
      if (dragSaveTimerRef.current) clearTimeout(dragSaveTimerRef.current);
    },
    []
  );

  const activeSection = isRealSectionView(activeSectionId)
    ? sections.find((s) => s.id === activeSectionId)
    : null;

  const openCaptureModal = () => {
    setNewScreenId(
      isRealSectionView(activeSectionId) && activeSection
        ? suggestScreenIdForSection(activeSection, screens)
        : getNextNumericScreenId(screens)
    );
    setShowCaptureModal(true);
  };

  const openImportModal = () => {
    setImportFiles([]);
    setShowImportModal(true);
  };

  const addImportFiles = (fileList) => {
    const images = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setImportFiles(images);
  };

  const onNodeDragStart = useCallback(
    (_, node) => {
      const ids = new Set(selectedScreenIds);
      nodesRef.current.forEach((n) => {
        if (n.selected) ids.add(n.id);
      });
      ids.add(node.id);
      dragSessionRef.current = ids;
    },
    [selectedScreenIds]
  );

  const onNodeDragStop = useCallback(() => {
    if (!dragSessionRef.current?.size) return;
    scheduleDragPositionSave();
  }, [scheduleDragPositionSave]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }) => {
      setSelectedScreenIds(
        selectedNodes.filter((n) => n.type === 'screenNode').map((n) => n.id)
      );
    },
    [setSelectedScreenIds]
  );

  const onNodeClick = useCallback(
    (_, node) => {
      if (
        node.type === 'sectionNode' &&
        node.data?.sectionId &&
        activeSectionId == null
      ) {
        toggleSectionCollapsed(node.data.sectionId, false);
      }
    },
    [activeSectionId, toggleSectionCollapsed]
  );

  const onNodeDoubleClick = useCallback(
    (_, node) => {
      if (node.type === 'sectionNode' && node.data?.sectionId) {
        setActiveSection(node.data.sectionId);
      }
    },
    [setActiveSection]
  );

  const confirmDeleteSelection = useCallback(() => {
    const choice = promptDeleteScreens(screens, selectedScreenIds);
    if (choice) {
      deleteScreens(choice.ids, { removeParentButtons: choice.removeParentButtons });
    }
  }, [screens, selectedScreenIds, deleteScreens]);

  useEffect(() => {
    if (!isActive) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedScreenIds.length) return;
      e.preventDefault();
      confirmDeleteSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, selectedScreenIds, confirmDeleteSelection]);

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const onConnect = useCallback(
    async (connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      const sourceScreen = screens.find((s) => s.id === source);
      const w = sourceScreen?.sourceWidth || 1031;
      const h = sourceScreen?.sourceHeight || 580;

      try {
        await addButton(source, {
          target,
          ...rectCenteredAt(Math.round(w / 2), Math.round(h / 2)),
        });
      } catch (err) {
        alert('Failed to create link: ' + err.message);
      }
    },
    [addButton, screens]
  );

  const buildImportEntries = () => {
    if (!importFiles.length) return [];

    const assigned = new Set();
    return importFiles.map((file) => {
      const screenId = resolveImportScreenId(file.name, screens, assigned);
      assigned.add(screenId);
      return { screenId, file };
    });
  };

  const handleImport = async () => {
    const entries = buildImportEntries();
    if (!entries.length) return;

    try {
      await importScreens(entries);
      setShowImportModal(false);
      setImportFiles([]);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleCapture = async () => {
    if (!newScreenId.trim()) return;
    const screenId = newScreenId.trim();
    setShowCaptureModal(false);
    setNewScreenId('');
    try {
      await captureScreen(screenId);
    } catch (err) {
      alert('Capture failed: ' + err.message);
    }
  };

  const flowKey = activeSectionId ?? 'all';

  return (
    <div className={`graph-view ${isActive ? '' : 'graph-view--inactive'}`}>
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
        key={flowKey}
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => setSelectedScreenIds([])}
        onInit={(instance) => { flowRef.current = instance; }}
        nodeTypes={nodeTypes}
        nodesFocusable={false}
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={['Control', 'Meta']}
        defaultEdgeOptions={{ interactionWidth: 0 }}
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
            <h3 className="modal__title">
              {importFiles.length > 1 ? 'Import Screenshots' : 'Import Screenshot'}
            </h3>
            {isRealSectionView(activeSectionId) && (
              <p className="graph-view__section-note">
                Adds to section: {activeSection?.name || activeSectionId}
              </p>
            )}

            <p className="graph-view__import-hint">
              Screen names are taken from each filename.
            </p>

            <div className="modal__field">
              <label className="label">
                {importFiles.length > 1 ? 'Screenshot Files' : 'Screenshot File'}
              </label>
              <div
                className="modal__dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addImportFiles(e.dataTransfer.files);
                }}
              >
                {importFiles.length === 0 ? (
                  <span>Drop images here or click to browse</span>
                ) : importFiles.length === 1 ? (
                  <span className="modal__filename">{importFiles[0].name}</span>
                ) : (
                  <ul className="modal__file-list">
                    {importFiles.map((f) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`}>{f.name}</li>
                    ))}
                  </ul>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    addImportFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div className="modal__actions">
              <button
                className="btn"
                onClick={() => setShowImportModal(false)}
                disabled={isCapturing}
              >
                Cancel
              </button>
              <button
                className="btn btn-accent"
                onClick={handleImport}
                disabled={isCapturing || importFiles.length === 0}
              >
                {isCapturing
                  ? 'Importing…'
                  : importFiles.length > 1
                    ? `Import ${importFiles.length} screenshots`
                    : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Modal */}
      {showCaptureModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isCapturing) setShowCaptureModal(false);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Capture from TV</h3>
            {isRealSectionView(activeSectionId) && (
              <p className="graph-view__section-note">
                Adds to section: {activeSection?.name || activeSectionId}
              </p>
            )}

            <div className="modal__field">
              <label className="label">Screen Name</label>
              <input
                className="input"
                value={newScreenId}
                onChange={(e) => setNewScreenId(e.target.value)}
                placeholder={
                  isRealSectionView(activeSectionId)
                    ? 'e.g. SectionName_01, SectionName_02'
                    : 'e.g. 1, 2, 3'
                }
                autoFocus
                disabled={isCapturing}
              />
            </div>

            <div className="modal__actions">
              <button
                className="btn"
                onClick={() => setShowCaptureModal(false)}
                disabled={isCapturing}
              >
                Cancel
              </button>
              <button
                className="btn btn-accent"
                onClick={handleCapture}
                disabled={!newScreenId.trim() || isCapturing}
              >
                {isCapturing ? 'Capturing…' : 'Capture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
