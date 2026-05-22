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

  const [sectionName, setSectionName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [sectionToRemove, setSectionToRemove] = useState('');
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

  useEffect(() => {
    if (!isSidebar) return;
    if (isRealSectionView(activeSectionId)) {
      setSectionToRemove(activeSectionId);
      return;
    }
    setSectionToRemove((prev) => {
      if (sections.length === 0) return '';
      if (sections.some((s) => s.id === prev)) return prev;
      return sections[0].id;
    });
  }, [isSidebar, activeSectionId, sections]);

  const renameTarget =
    activeSection ||
    (isSidebar && sectionToRemove
      ? sections.find((s) => s.id === sectionToRemove)
      : null);
  const renameDirty =
    renameTarget &&
    renameName.trim() &&
    renameName.trim() !== renameTarget.name;

  useEffect(() => {
    setRenameName(renameTarget?.name ?? '');
  }, [renameTarget?.id, renameTarget?.name]);

  const handleRenameSection = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) {
      alert('Enter a section name.');
      return;
    }
    if (name === renameTarget.name) return;

    setIsBusy(true);
    try {
      await updateSection(renameTarget.id, { name });
    } catch (err) {
      alert('Rename section failed: ' + err.message);
    } finally {
      setIsBusy(false);
    }
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
    if (!sectionToRemove) return;
    const sec = sections.find((s) => s.id === sectionToRemove);
    if (!sec) return;
    const taggedCount = screens.filter((s) => s.sectionId === sectionToRemove).length;
    const message =
      `Remove section "${sec.name}"?\n\n` +
      `The section will be deleted. ${taggedCount} screen${taggedCount === 1 ? '' : 's'} will ` +
      'stay on the graph; only their section tags will be cleared.';
    if (!confirm(message)) return;

    setIsBusy(true);
    try {
      await deleteSection(sectionToRemove);
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

        {isSidebar && renameTarget && (
          <>
            <label className="label" htmlFor="section-bar-rename">
              Rename section
            </label>
            <div className="section-bar__rename-row">
              <input
                id="section-bar-rename"
                className="input section-bar__name-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSection();
                }}
                disabled={isBusy}
                placeholder={renameTarget.name}
              />
              <button
                type="button"
                className="btn btn-sm section-bar__rename-btn"
                onClick={handleRenameSection}
                disabled={isBusy || !renameDirty}
                title={`Rename "${renameTarget.name}"`}
              >
                Rename
              </button>
            </div>
          </>
        )}

        {isSidebar ? (
          <>
            <label className="label" htmlFor="section-bar-name">
              New section name
            </label>
            <input
              id="section-bar-name"
              className="input section-bar__name-input"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (selectedScreenIds.length > 0) handleMakeFromSelection();
                  else handleCreateEmpty();
                }
              }}
              disabled={isBusy}
              placeholder="e.g. Settings menu"
            />
            <p className="section-bar__hint section-bar__hint--inline">
              + Section creates an empty group. From selection assigns selected graph nodes.
            </p>
            <div className="section-bar__actions">
              <button
                type="button"
                className="btn btn-sm section-bar__action-btn"
                onClick={handleCreateEmpty}
                disabled={isBusy || !sectionName.trim()}
                title="Create an empty section"
              >
                + Section
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
            {sections.length > 0 && (
              <>
                <label className="label" htmlFor="section-bar-remove">
                  Remove section
                </label>
                <select
                  id="section-bar-remove"
                  className="input section-bar__select"
                  value={sectionToRemove}
                  onChange={(e) => setSectionToRemove(e.target.value)}
                  disabled={isBusy}
                >
                  {sections.map((sec) => {
                    const count = screens.filter((s) => s.sectionId === sec.id).length;
                    return (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} ({count})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-danger section-bar__remove-btn"
                  onClick={handleRemoveSection}
                  disabled={isBusy || !sectionToRemove}
                >
                  Remove section
                </button>
              </>
            )}
          </>
        ) : (
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

      {isAllScreens && sections.length > 0 && (
        <div className="section-bar__collapse-panel">
          <div className="section-bar__collapse-header">
            <span className="section-bar__collapse-title">Canvas groups</span>
            {collapsedCount > 0 && (
              <span className="section-bar__collapse-stat">
                {collapsedCount} collapsed
              </span>
            )}
          </div>
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
                  <span
                    className="section-bar__collapse-dot"
                    style={{
                      background: sec.collapsed
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                    }}
                    aria-hidden
                  />
                  <span className="section-bar__collapse-name" title={sec.id}>
                    {sec.name}
                    <span className="section-bar__collapse-count">({count})</span>
                  </span>
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
      )}

      {!isSidebar && renameTarget && (
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

      {activeSection && progress && (
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

