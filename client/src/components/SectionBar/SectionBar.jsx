import React, { useState, useEffect } from 'react';
import useStore from '../../store/useStore.js';
import {
  isRealSectionView,
  sectionProgress,
  sectionIdFromName,
} from '../../utils/sectionGraph.js';
import './SectionBar.css';

export default function SectionBar({ variant = 'toolbar' }) {
  const isSidebar = variant === 'sidebar';
  const sections = useStore((s) => s.sections);
  const screens = useStore((s) => s.screens);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectedScreenIds = useStore((s) => s.selectedScreenIds);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const createSection = useStore((s) => s.createSection);
  const createSectionFromScreens = useStore((s) => s.createSectionFromScreens);
  const deleteSection = useStore((s) => s.deleteSection);
  const selectScreen = useStore((s) => s.selectScreen);
  const updateSection = useStore((s) => s.updateSection);
  const toggleSectionCollapsed = useStore((s) => s.toggleSectionCollapsed);
  const collapseAllSections = useStore((s) => s.collapseAllSections);
  const expandAllSections = useStore((s) => s.expandAllSections);
  const locateSection = useStore((s) => s.locateSection);

  const [sectionName, setSectionName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isAllScreens = !activeSectionId;
  const activeSection = isRealSectionView(activeSectionId)
    ? sections.find((s) => s.id === activeSectionId)
    : null;
  const progress =
    activeSectionId && isRealSectionView(activeSectionId)
      ? sectionProgress(screens, activeSectionId)
      : null;

  const collapsedCount = sections.filter((s) => s.collapsed).length;
  const renameDirty =
    activeSection &&
    renameName.trim() &&
    renameName.trim() !== activeSection.name;

  useEffect(() => {
    setRenameName(activeSection?.name ?? '');
    setIsEditingName(false);
  }, [activeSection?.id, activeSection?.name]);

  const handleRenameSection = async () => {
    if (!activeSection) return;
    const name = renameName.trim();
    if (!name) {
      alert('Enter a section name.');
      return;
    }
    if (name === activeSection.name) {
      setIsEditingName(false);
      return;
    }

    setIsBusy(true);
    try {
      await updateSection(activeSection.id, { name });
      setIsEditingName(false);
    } catch (err) {
      alert('Rename section failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const cancelRename = () => {
    setRenameName(activeSection?.name ?? '');
    setIsEditingName(false);
  };

  const handleCreateEmpty = async () => {
    let name = sectionName.trim();
    if (!name && !isSidebar) {
      name = window.prompt('Section name', '')?.trim() || '';
    }
    if (!name) {
      alert('Enter a section name.');
      return;
    }
    setIsBusy(true);
    try {
      const id = sectionIdFromName(name, sections);
      await createSection({ id, name });
      setActiveSection(id);
      setSectionName('');
    } catch (err) {
      alert('Failed to create section: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleMakeFromSelection = async () => {
    const name = sectionName.trim();
    if (!name) {
      alert('Enter a section name.');
      return;
    }
    if (!selectedScreenIds.length) {
      alert('Select one or more nodes on the graph first.');
      return;
    }
    setIsBusy(true);
    try {
      await createSectionFromScreens({
        name,
        screenIds: selectedScreenIds,
        rootScreenId: selectedScreenIds[0],
      });
      setSectionName('');
    } catch (err) {
      alert('Create section failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveSection = async () => {
    if (!activeSection) return;
    const taggedCount = screens.filter((s) => s.sectionId === activeSection.id).length;
    const message =
      `Remove section "${activeSection.name}"?\n\n` +
      `The section will be deleted. ${taggedCount} screen${taggedCount === 1 ? '' : 's'} will ` +
      'stay on the graph; only their section tags will be cleared.';
    if (!confirm(message)) return;

    setIsBusy(true);
    try {
      await deleteSection(activeSection.id);
    } catch (err) {
      alert('Remove section failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleCollapsed = async (sectionId, collapsed) => {
    setIsBusy(true);
    try {
      await toggleSectionCollapsed(sectionId, collapsed);
    } catch (err) {
      alert('Failed to update section: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCollapseAll = async () => {
    setIsBusy(true);
    try {
      await collapseAllSections();
    } catch (err) {
      alert('Collapse all failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleExpandAll = async () => {
    setIsBusy(true);
    try {
      await expandAllSections();
    } catch (err) {
      alert('Expand all failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const openRoot = () => {
    if (activeSection?.rootScreenId) {
      selectScreen(activeSection.rootScreenId);
    }
  };

  const setAsRoot = async () => {
    if (!isRealSectionView(activeSectionId) || !selectedScreenId) return;
    try {
      await updateSection(activeSectionId, { rootScreenId: selectedScreenId });
    } catch (err) {
      alert('Failed to set menu root: ' + err.message);
    }
  };

  const sidebarCreatePanel = (
    <details className="section-bar__panel">
      <summary className="section-bar__panel-summary">Add section</summary>
      <div className="section-bar__panel-body">
        <input
          id="section-bar-name"
          className="input"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selectedScreenIds.length > 0) handleMakeFromSelection();
              else handleCreateEmpty();
            }
          }}
          disabled={isBusy}
          placeholder="Section name"
          aria-label="New section name"
        />
        <div className="section-bar__actions">
          <button
            type="button"
            className="btn btn-sm section-bar__action-btn"
            onClick={handleCreateEmpty}
            disabled={isBusy || !sectionName.trim()}
            title="Create an empty section"
          >
            Empty
          </button>
          <button
            type="button"
            className="btn btn-sm btn-accent section-bar__action-btn"
            onClick={handleMakeFromSelection}
            disabled={
              isBusy ||
              !sectionName.trim() ||
              selectedScreenIds.length === 0
            }
            title="Group selected nodes into a new section"
          >
            {isBusy
              ? 'Working…'
              : selectedScreenIds.length > 0
                ? `From selection (${selectedScreenIds.length})`
                : 'From selection'}
          </button>
        </div>
        <p className="section-bar__hint section-bar__hint--inline">
          Empty creates a group. From selection uses nodes selected on the graph.
        </p>
      </div>
    </details>
  );

  return (
    <div className={`section-bar ${isSidebar ? 'section-bar--sidebar' : ''}`}>
      <div className="section-bar__row">
        {!isSidebar && <label className="section-bar__label">Section</label>}
        {isSidebar && <div className="sidebar__section-title">Section</div>}
        <select
          className="input section-bar__select"
          value={activeSectionId || ''}
          onChange={(e) => setActiveSection(e.target.value || null)}
          disabled={isBusy}
          aria-label="Section view"
        >
          <option value="">All screens ({screens.length})</option>
          {sections.map((sec) => {
            const count = screens.filter((s) => s.sectionId === sec.id).length;
            return (
              <option key={sec.id} value={sec.id}>
                {sec.name} ({count})
              </option>
            );
          })}
        </select>

        {!isSidebar && (
          <button
            type="button"
            className="btn btn-sm section-bar__add-btn"
            onClick={handleCreateEmpty}
            title="New section"
          >
            + Section
          </button>
        )}
      </div>

      {isSidebar && activeSection && progress && (
        <div className="section-bar__card">
          {isEditingName ? (
            <div className="section-bar__edit-row">
              <input
                className="input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSection();
                  if (e.key === 'Escape') cancelRename();
                }}
                disabled={isBusy}
                autoFocus
                aria-label="Section name"
              />
              <div className="section-bar__edit-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-accent"
                  onClick={handleRenameSection}
                  disabled={isBusy || !renameDirty}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={cancelRename}
                  disabled={isBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="section-bar__current-row">
              <div className="section-bar__current-info">
                <span className="section-bar__current-name">{activeSection.name}</span>
                <span className="section-bar__current-meta">
                  {progress.screenCount} screen{progress.screenCount !== 1 ? 's' : ''}
                  {progress.unlinkedButtons > 0 &&
                    ` · ${progress.unlinkedButtons} unlinked`}
                </span>
              </div>
              <div className="section-bar__current-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setIsEditingName(true)}
                  disabled={isBusy}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={handleRemoveSection}
                  disabled={isBusy}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          <div className="section-bar__card-footer">
            {activeSection.rootScreenId ? (
              <button type="button" className="btn btn-sm btn-accent" onClick={openRoot}>
                Open menu: {activeSection.rootScreenId}
              </button>
            ) : (
              <span className="section-bar__hint">Set a menu root from a selected screen</span>
            )}
            {selectedScreenId && (
              <button type="button" className="btn btn-sm" onClick={setAsRoot}>
                Set as menu root
              </button>
            )}
          </div>
        </div>
      )}

      {isSidebar && sidebarCreatePanel}

      {isAllScreens && sections.length > 0 && (
        <details className="section-bar__panel">
          <summary className="section-bar__panel-summary">
            Canvas groups
            {collapsedCount > 0 && (
              <span className="section-bar__panel-badge">{collapsedCount} collapsed</span>
            )}
          </summary>
          <div className="section-bar__panel-body">
            <div className="section-bar__collapse-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleCollapseAll}
                disabled={isBusy || collapsedCount === sections.length}
                title="Collapse every section to a single node"
              >
                Collapse all
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleExpandAll}
                disabled={isBusy || collapsedCount === 0}
                title="Show every section's screens on the graph"
              >
                Expand all
              </button>
            </div>
            <ul className="section-bar__collapse-list">
              {sections.map((sec) => {
                const count = screens.filter((s) => s.sectionId === sec.id).length;
                if (!count) return null;
                return (
                  <li key={sec.id} className="section-bar__collapse-item">
                    <button
                      type="button"
                      className="section-bar__collapse-open"
                      onClick={() => setActiveSection(sec.id)}
                      disabled={isBusy}
                      title="Open this section"
                    >
                      <span
                        className="section-bar__collapse-dot"
                        style={{
                          background: sec.collapsed
                            ? 'var(--accent)'
                            : 'var(--text-muted)',
                        }}
                        aria-hidden
                      />
                      <span className="section-bar__collapse-name">
                        {sec.name}
                        <span className="section-bar__collapse-count">({count})</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="section-bar__collapse-locate"
                      onClick={() => locateSection(sec.id)}
                      disabled={isBusy}
                      title="Find this section on the graph"
                      aria-label={`Locate ${sec.name} on the graph`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm section-bar__collapse-toggle"
                      onClick={() => handleToggleCollapsed(sec.id, !sec.collapsed)}
                      disabled={isBusy}
                      title={
                        sec.collapsed
                          ? 'Expand this section on the graph'
                          : 'Collapse this section to one node'
                      }
                    >
                      {sec.collapsed ? 'Expand' : 'Collapse'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="section-bar__hint section-bar__hint--inline">
              Click a collapsed node on the graph to expand. Double-click to open the section.
            </p>
          </div>
        </details>
      )}

      {!isSidebar && activeSection && (
        <div className="section-bar__rename-row">
          <input
            className="input section-bar__name-input"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSection();
            }}
            disabled={isBusy}
            aria-label="Rename section"
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleRenameSection}
            disabled={isBusy || !renameDirty}
          >
            Rename
          </button>
        </div>
      )}

      {!isSidebar && activeSection && progress && (
        <div className="section-bar__meta">
          <span className="section-bar__stat">
            {progress.screenCount} screen{progress.screenCount !== 1 ? 's' : ''}
          </span>
          {progress.unlinkedButtons > 0 && (
            <span className="section-bar__warn">
              {progress.unlinkedButtons} unlinked button{progress.unlinkedButtons !== 1 ? 's' : ''}
            </span>
          )}
          {activeSection.rootScreenId ? (
            <button type="button" className="btn btn-sm btn-accent" onClick={openRoot}>
              Open menu: {activeSection.rootScreenId}
            </button>
          ) : (
            <span className="section-bar__hint">Capture the menu screen, then set as menu root</span>
          )}
          {selectedScreenId && (
            <button type="button" className="btn btn-sm" onClick={setAsRoot}>
              Set as menu root
            </button>
          )}
        </div>
      )}
    </div>
  );
}
