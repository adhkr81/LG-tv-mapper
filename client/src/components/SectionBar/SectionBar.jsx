import React, { useState } from 'react';
import useStore from '../../store/useStore.js';
import { sectionProgress, sectionIdFromName } from '../../utils/sectionGraph.js';
import './SectionBar.css';

export default function SectionBar() {
  const sections = useStore((s) => s.sections);
  const screens = useStore((s) => s.screens);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const createSection = useStore((s) => s.createSection);
  const selectScreen = useStore((s) => s.selectScreen);
  const updateSection = useStore((s) => s.updateSection);

  const [showCreate, setShowCreate] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const activeSection = sections.find((s) => s.id === activeSectionId);
  const progress = activeSectionId
    ? sectionProgress(screens, activeSectionId)
    : null;

  const handleCreate = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    try {
      const id = sectionIdFromName(name, sections);
      await createSection({ id, name });
      setActiveSection(id);
      setShowCreate(false);
      setNewSectionName('');
    } catch (err) {
      alert('Failed to create section: ' + err.message);
    }
  };

  const openRoot = () => {
    if (activeSection?.rootScreenId) {
      selectScreen(activeSection.rootScreenId);
    }
  };

  const setAsRoot = async () => {
    if (!activeSectionId || !selectedScreenId) return;
    try {
      await updateSection(activeSectionId, { rootScreenId: selectedScreenId });
    } catch (err) {
      alert('Failed to set menu root: ' + err.message);
    }
  };

  return (
    <div className="section-bar">
      <div className="section-bar__row">
        <label className="section-bar__label">Section</label>
        <select
          className="input section-bar__select"
          value={activeSectionId || ''}
          onChange={(e) => setActiveSection(e.target.value || null)}
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
        <button type="button" className="btn btn-sm" onClick={() => setShowCreate(true)} title="New section">
          + Section
        </button>
      </div>

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

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">New Section</h3>
            <p className="section-bar__modal-hint">
              A section is one menu area (e.g. Settings). Screens you capture while this section
              is selected are grouped here.
            </p>
            <div className="modal__field">
              <label className="label">Section name</label>
              <input
                className="input"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="e.g. Settings menu"
                autoFocus
              />
            </div>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="btn btn-accent" onClick={handleCreate} disabled={!newSectionName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
