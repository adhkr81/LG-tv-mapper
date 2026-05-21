import React, { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ScreenNode from '../GraphView/ScreenNode.jsx';
import SectionNode from '../GraphView/SectionNode.jsx';
import useStore from '../../store/useStore.js';
import { buildSectionGraphFlow } from '../../utils/graphFlow.js';
import './MiniGraph.css';

const nodeTypes = { screenNode: ScreenNode, sectionNode: SectionNode };
const FIT_VIEW_OPTIONS = { padding: 0.2 };

function scheduleFitView(instance) {
  const run = () => instance.fitView(FIT_VIEW_OPTIONS);
  requestAnimationFrame(run);
  setTimeout(run, 150);
}

export default function MiniGraph({ onClose }) {
  const screens = useStore((s) => s.screens);
  const sections = useStore((s) => s.sections);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectScreen = useStore((s) => s.selectScreen);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildSectionGraphFlow(screens, activeSectionId, sections),
    [screens, activeSectionId, sections]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <aside className="mini-graph" aria-label="Screen graph">
      <div className="mini-graph__header screen-viewer__pane-header">
        <span className="mini-graph__title">Screens</span>
        {onClose && (
          <button
            type="button"
            className="screen-viewer__pane-close"
            onClick={onClose}
            title="Close graph"
            aria-label="Close screen graph"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {initialNodes.length === 0 ? (
        <p className="mini-graph__empty">No screens in this section</p>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => scheduleFitView(instance)}
          onNodeClick={(_, node) => {
            if (node.type === 'sectionNode') return;
            selectScreen(node.id);
          }}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.15}
          maxZoom={1.2}
          selectNodesOnDrag={false}
          defaultEdgeOptions={{ interactionWidth: 0 }}
          className="mini-graph__flow"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a26" gap={16} size={1} />
        </ReactFlow>
      )}
    </aside>
  );
}
