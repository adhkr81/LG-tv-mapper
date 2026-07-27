import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client.js';
import './ProjectList.css';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

function platformLabel(platform) {
  return platform === 'samsung' ? 'Samsung' : 'LG';
}

export default function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState('lg');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProjects();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openProject = async (projectId) => {
    setBusyId(projectId);
    setError(null);
    try {
      await api.openProject(projectId);
      navigate(`/projects/${projectId}`);
    } catch (err) {
      setError(err.message || 'Failed to open project');
      setBusyId(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim() || 'Untitled Project';
    setCreating(true);
    setError(null);
    try {
      const project = await api.createProject({ name, platform: newPlatform });
      setNewName('');
      setNewPlatform('lg');
      await openProject(project.id);
    } catch (err) {
      setError(err.message || 'Failed to create project');
      setCreating(false);
    }
  };

  const startRename = (project, e) => {
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const submitRename = async (projectId, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const name = renameValue.trim();
    if (!name) return;
    setBusyId(projectId);
    try {
      const updated = await api.renameProject(projectId, name);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...updated } : p))
      );
      setRenamingId(null);
    } catch (err) {
      setError(err.message || 'Failed to rename');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (project, e) => {
    e.stopPropagation();
    const ok = window.confirm(
      `Delete “${project.name}”? This permanently removes its screens, layout, and screenshots.`
    );
    if (!ok) return;
    setBusyId(project.id);
    try {
      await api.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(err.message || 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="project-list">
      <header className="project-list__header">
        <div className="project-list__brand">
          <div className="project-list__brand-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <div>
            <h1 className="project-list__title">UI Mapper</h1>
            <p className="project-list__subtitle">Select a project to map</p>
          </div>
        </div>

        <form className="project-list__create" onSubmit={handleCreate}>
          <select
            className="input project-list__platform-select"
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            disabled={creating}
            aria-label="TV platform"
          >
            <option value="lg">LG</option>
            <option value="samsung">Samsung</option>
          </select>
          <input
            type="text"
            className="input"
            placeholder="New project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            maxLength={80}
          />
          <button type="submit" className="btn btn-accent" disabled={creating}>
            {creating ? 'Creating…' : 'New project'}
          </button>
        </form>
      </header>

      {error && <div className="project-list__error">{error}</div>}

      <div className="project-list__body">
        {loading ? (
          <p className="project-list__empty">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="project-list__empty">
            <p>No projects yet.</p>
            <p className="project-list__hint">Create one above to get started.</p>
          </div>
        ) : (
          <ul className="project-list__grid">
            {projects.map((project) => {
              const busy = busyId === project.id;
              const renaming = renamingId === project.id;
              const platform = project.platform === 'samsung' ? 'samsung' : 'lg';
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    className="project-card"
                    onClick={() => !renaming && openProject(project.id)}
                    disabled={busy}
                  >
                    <div className="project-card__top">
                      {renaming ? (
                        <form
                          className="project-card__rename"
                          onSubmit={(e) => submitRename(project.id, e)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            className="input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                          />
                          <button type="submit" className="btn btn-sm btn-accent">
                            Save
                          </button>
                        </form>
                      ) : (
                        <div className="project-card__title-row">
                          <h2 className="project-card__name">{project.name}</h2>
                          <span
                            className={`project-pill project-pill--${platform}`}
                          >
                            {platformLabel(platform)}
                          </span>
                        </div>
                      )}
                      <div className="project-card__actions">
                        {!renaming && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm"
                              title="Rename"
                              onClick={(e) => startRename(project, e)}
                              disabled={busy}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              title="Delete"
                              onClick={(e) => handleDelete(project, e)}
                              disabled={busy}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="project-card__meta">
                      <span>
                        {project.screenCount === 1
                          ? '1 screen'
                          : `${project.screenCount ?? 0} screens`}
                      </span>
                      {project.updatedAt && (
                        <span>Updated {formatDate(project.updatedAt)}</span>
                      )}
                    </div>
                    {busy && <div className="project-card__busy">Opening…</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
