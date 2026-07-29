import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../store/useStore.js';
import { normalizeButton } from '../../utils/buttonRect.js';
import { screenshotUrl } from '../../utils/screenshotUrl.js';
import {
  effectiveSectionId,
  getSectionGraphScreens,
  getNextNumericScreenId,
  isRealSectionView,
  suggestScreenIdForSection,
} from '../../utils/sectionGraph.js';
import { nextScreenGraphPosition } from '../../utils/graphFlow.js';
import { countInboundButtons } from '../../utils/deleteScreenPrompt.js';
import ImageConfigSection from '../ImageConfig/ImageConfigSection.jsx';
import SectionBar from '../SectionBar/SectionBar.jsx';
import '../SectionBar/SectionBar.css';
import {
  isSamsungScrollPreset,
  SAMSUNG_PRESET_OPTIONS,
} from '../../data/samsungScrollPresets.js';
import './SidebarEditor.css';

export default function SidebarEditor({ mode = 'viewer' }) {
  const isEditMode = mode === 'viewer';
  const screens = useStore((s) => s.screens);
  const screensById = useStore((s) => s.screensById);
  const sections = useStore((s) => s.sections);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const selectedScreenId = useStore((s) => s.selectedScreenId);
  const selectedScreenIds = useStore((s) => s.selectedScreenIds);
  const selectScreen = useStore((s) => s.selectScreen);
  const assignScreenToSection = useStore((s) => s.assignScreenToSection);
  const createSectionFromScreens = useStore((s) => s.createSectionFromScreens);
  const deleteScreens = useStore((s) => s.deleteScreens);
  const deleteButton = useStore((s) => s.deleteButton);
  const updateButton = useStore((s) => s.updateButton);
  const addButton = useStore((s) => s.addButton);
  const importButtonsFromScreen = useStore((s) => s.importButtonsFromScreen);
  const imageConfig = useStore((s) => s.imageConfig);
  const updateScreenName = useStore((s) => s.updateScreenName);
  const updateScreenBackButton = useStore((s) => s.updateScreenBackButton);
  const updateScreenPreset = useStore((s) => s.updateScreenPreset);
  const replaceScreenImage = useStore((s) => s.replaceScreenImage);
  const clearScreenImage = useStore((s) => s.clearScreenImage);
  const replaceScrollImage = useStore((s) => s.replaceScrollImage);
  const clearScrollImage = useStore((s) => s.clearScrollImage);
  const editLayer = useStore((s) => s.editLayer);
  const setEditLayer = useStore((s) => s.setEditLayer);
  const createScreenNode = useStore((s) => s.createScreenNode);
  const captureScreen = useStore((s) => s.captureScreen);
  const isCapturing = useStore((s) => s.isCapturing);
  const serialStatus = useStore((s) => s.serialStatus);
  const rmusStatus = useStore((s) => s.rmusStatus);
  const selectedButtonId = useStore((s) => s.selectedButtonId);
  const selectButton = useStore((s) => s.selectButton);
  const importCompareScreenId = useStore((s) => s.importCompareScreenId);
  const setImportCompareScreenId = useStore((s) => s.setImportCompareScreenId);
  const importSourceButtonIds = useStore((s) => s.importSourceButtonIds);
  const setImportSourceButtonIds = useStore((s) => s.setImportSourceButtonIds);
  const buttonRectClipboard = useStore((s) => s.buttonRectClipboard);
  const copyButtonRect = useStore((s) => s.copyButtonRect);
  const projectPlatform = useStore((s) => s.projectPlatform);
  const isSamsung = projectPlatform === 'samsung';

  const screen = selectedScreenId ? screensById.get(selectedScreenId) : undefined;
  const activeSection = isRealSectionView(activeSectionId)
    ? sections.find((s) => s.id === activeSectionId)
    : null;

  const { primary, external } = useMemo(
    () => getSectionGraphScreens(screens, activeSectionId),
    [screens, activeSectionId]
  );

  const sectionScreens = useMemo(() => {
    if (!isRealSectionView(activeSectionId)) return [];
    const rootId = activeSection?.rootScreenId;
    const sorted = [...primary].sort((a, b) => {
      if (a.id === rootId) return -1;
      if (b.id === rootId) return 1;
      return a.id.localeCompare(b.id);
    });
    return sorted;
  }, [primary, activeSectionId, activeSection?.rootScreenId]);

  const targetOptions = useMemo(() => {
    if (!isRealSectionView(activeSectionId)) {
      return { inSection: [], other: screens.filter((s) => s.id !== screen?.id) };
    }
    const inSection = screens.filter(
      (s) => s.sectionId === activeSectionId && s.id !== screen?.id
    );
    const other = screens.filter(
      (s) => s.sectionId !== activeSectionId && s.id !== screen?.id
    );
    return { inSection, other };
  }, [screens, activeSectionId, screen?.id]);

  const parentScreenIds = useMemo(() => {
    if (!screen?.id) return new Set();
    const ids = new Set();
    screens.forEach((s) => {
      const buttons = [
        ...(s.buttons || []),
        ...(s.scrollArea?.buttons || []),
      ];
      if (buttons.some((btn) => btn.target === screen.id)) ids.add(s.id);
    });
    return ids;
  }, [screens, screen?.id]);

  const isParentScreen = (screenId) => parentScreenIds.has(screenId);

  const layerButtons = useMemo(() => {
    if (!screen) return [];
    if (editLayer === 'scroll') return screen.scrollArea?.buttons || [];
    return screen.buttons || [];
  }, [screen, editLayer]);

  const selectedButton = useMemo(() => {
    if (!selectedButtonId || !screen) return null;
    return (
      screen.buttons?.find((b) => b.id === selectedButtonId) ||
      screen.scrollArea?.buttons?.find((b) => b.id === selectedButtonId) ||
      null
    );
  }, [screen, selectedButtonId]);

  const canEditScroll = isSamsung && isSamsungScrollPreset(screen?.preset);
  const hasScrollImage = Boolean(screen?.scrollArea?.image?.trim());

  const importSourceOptions = useMemo(() => {
    if (!screen?.id) return [];
    return screens
      .filter((s) => {
        if (s.id === screen.id) return false;
        if (editLayer === 'scroll') {
          return (s.scrollArea?.buttons || []).length > 0;
        }
        return s.buttons.length > 0;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [screens, screen?.id, editLayer]);

  const importSourceGroups = useMemo(() => {
    if (!isRealSectionView(activeSectionId)) {
      return { inSection: [], other: importSourceOptions };
    }
    return {
      inSection: importSourceOptions.filter((s) => s.sectionId === activeSectionId),
      other: importSourceOptions.filter((s) => s.sectionId !== activeSectionId),
    };
  }, [importSourceOptions, activeSectionId]);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [popoverUIOpen, setPopoverUIOpen] = useState({});
  const [isImportingButtons, setIsImportingButtons] = useState(false);
  const [importIncludeTargets, setImportIncludeTargets] = useState(true);
  const [isImageBusy, setIsImageBusy] = useState(false);
  const [newNodeId, setNewNodeId] = useState('');
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [removeParentButtons, setRemoveParentButtons] = useState(true);
  const [assignSectionId, setAssignSectionId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isAssigningGroup, setIsAssigningGroup] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const replaceImageInputRef = useRef(null);
  const replaceScrollImageInputRef = useRef(null);

  const inboundToSelection = useMemo(
    () => countInboundButtons(screens, selectedScreenIds),
    [screens, selectedScreenIds]
  );

  const ungroupedSelectedIds = useMemo(
    () =>
      selectedScreenIds.filter((id) => {
        const s = screensById.get(id);
        return s && !s.sectionId;
      }),
    [selectedScreenIds, screensById]
  );

  const groupedSelectedIds = useMemo(
    () =>
      selectedScreenIds.filter((id) => {
        const s = screensById.get(id);
        return s && s.sectionId;
      }),
    [selectedScreenIds, screensById]
  );
  useEffect(() => {
    if (screen) setNameValue(screen.id);
  }, [screen?.id]);

  useEffect(() => {
    setAssignSectionId('');
    setNewGroupName('');
  }, [selectedScreenIds]);

  useEffect(() => {
    setImportCompareScreenId(null);
  }, [screen?.id, setImportCompareScreenId]);

  useEffect(() => {
    if (!isEditMode) return undefined;
    const onKeyDown = (e) => {
      const isDeleteKey =
        e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter';
      if (!isDeleteKey) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const buttonId = selectedButtonId;
      if (!buttonId || !layerButtons.some((b) => b.id === buttonId)) return;
      e.preventDefault();
      deleteButton(screen.id, buttonId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditMode, selectedButtonId, screen?.id, layerButtons, deleteButton]);

  useEffect(() => {
    if (mode !== 'graph') return;
    const section = isRealSectionView(activeSectionId)
      ? sections.find((s) => s.id === activeSectionId)
      : null;
    const suggested =
      section
        ? suggestScreenIdForSection(section, screens)
        : getNextNumericScreenId(screens);
    setNewNodeId(suggested);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- suggest id when Flow tab or section changes only
  }, [mode, activeSectionId, sections]);

  const hasScreenImage = Boolean(screen?.image?.trim());

  const handleReplaceImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !screen) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    setIsImageBusy(true);
    try {
      await replaceScreenImage(screen.id, file);
    } catch (err) {
      alert('Replace image failed: ' + err.message);
    } finally {
      setIsImageBusy(false);
    }
  };

  const handleReplaceScrollImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !screen) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    setIsImageBusy(true);
    try {
      await replaceScrollImage(screen.id, file);
      setEditLayer('scroll');
    } catch (err) {
      alert('Replace scroll strip failed: ' + err.message);
    } finally {
      setIsImageBusy(false);
    }
  };

  const handleClearScrollImage = async () => {
    if (!screen || !hasScrollImage) return;
    if (!confirm('Remove the scroll strip image? Scroll buttons are kept.')) return;
    setIsImageBusy(true);
    try {
      await clearScrollImage(screen.id);
    } catch (err) {
      alert('Remove scroll strip failed: ' + err.message);
    } finally {
      setIsImageBusy(false);
    }
  };

  const handlePresetChange = async (e) => {
    if (!screen) return;
    try {
      await updateScreenPreset(screen.id, e.target.value);
    } catch (err) {
      alert('Update preset failed: ' + err.message);
    }
  };

  const confirmDeleteNodes = () => {
    const count = selectedScreenIds.length;
    const ids =
      count === 1
        ? `"${selectedScreenIds[0]}"`
        : `${count} nodes (${selectedScreenIds.join(', ')})`;
    return confirm(
      `Permanently delete ${ids} from the graph?\n\n` +
        'This removes each node entirely (image, buttons, and links on those nodes). ' +
        'To keep the node and only remove its screenshot, use Remove image on the Screen tab.'
    );
  };

  const handleDeleteNodes = () => {
    if (!selectedScreenIds.length) return;
    if (!confirmDeleteNodes()) return;
    deleteScreens(selectedScreenIds, { removeParentButtons });
  };

  const captureReady = isSamsung
    ? rmusStatus === 'ready'
    : serialStatus === 'shell-ready' || serialStatus === 'connected';
  const captureReadyTitle = isSamsung
    ? captureReady
      ? 'Retake screenshot from Samsung TV (RMUS)'
      : 'Connect RMUS first'
    : captureReady
      ? 'Retake screenshot from TV'
      : 'Connect serial first';

  const handleRetakeScreenshot = async () => {
    if (selectedScreenIds.length !== 1 || !captureReady || isCapturing) return;
    const screenId = selectedScreenIds[0];
    try {
      await captureScreen(screenId);
    } catch (err) {
      alert('Retake failed: ' + err.message);
    }
  };

  const handleAddSelectionToGroup = async () => {
    if (!assignSectionId || !ungroupedSelectedIds.length) return;
    setIsAssigningGroup(true);
    try {
      for (const id of ungroupedSelectedIds) {
        await assignScreenToSection(id, assignSectionId);
      }
      setAssignSectionId('');
    } catch (err) {
      alert('Add to group failed: ' + err.message);
    } finally {
      setIsAssigningGroup(false);
    }
  };

  const handleCreateGroupFromSelection = async () => {
    const name = newGroupName.trim();
    if (!name) {
      alert('Enter a name for the new canvas group.');
      return;
    }
    if (!ungroupedSelectedIds.length) return;
    setIsAssigningGroup(true);
    try {
      await createSectionFromScreens({
        name,
        screenIds: ungroupedSelectedIds,
        rootScreenId: ungroupedSelectedIds[0],
      });
      setNewGroupName('');
    } catch (err) {
      alert('Create group failed: ' + err.message);
    } finally {
      setIsAssigningGroup(false);
    }
  };

  const handleRemoveSelectionFromGroup = async () => {
    if (!groupedSelectedIds.length) return;
    setIsAssigningGroup(true);
    try {
      for (const id of groupedSelectedIds) {
        await assignScreenToSection(id, null);
      }
    } catch (err) {
      alert('Remove from group failed: ' + err.message);
    } finally {
      setIsAssigningGroup(false);
    }
  };

  const handleCreateNode = async () => {
    const id = newNodeId.trim();
    if (!id) {
      alert('Enter a screen id for the new node.');
      return;
    }
    if (screens.some((s) => s.id === id)) {
      alert(`Screen "${id}" already exists.`);
      return;
    }
    const { x, y } = nextScreenGraphPosition(screens, activeSectionId);
    setIsCreatingNode(true);
    try {
      const sectionId = effectiveSectionId(activeSectionId);
      await createScreenNode({
        id,
        sectionId,
        graphX: Math.round(x),
        graphY: Math.round(y),
      });
      const section = sectionId
        ? sections.find((s) => s.id === sectionId)
        : null;
      const nextId =
        section
          ? suggestScreenIdForSection(section, [...screens, { id, sectionId }])
          : getNextNumericScreenId([...screens, { id }]);
      setNewNodeId(nextId);
    } catch (err) {
      alert('Create node failed: ' + err.message);
    } finally {
      setIsCreatingNode(false);
    }
  };

  const handleClearImage = async () => {
    if (!screen || !hasScreenImage) return;
    if (!confirm(`Remove the image from "${screen.id}"? The screen node and buttons will stay.`)) {
      return;
    }
    setIsImageBusy(true);
    try {
      await clearScreenImage(screen.id);
    } catch (err) {
      alert('Remove image failed: ' + err.message);
    } finally {
      setIsImageBusy(false);
    }
  };

  const handleRename = async () => {
    if (!screen || !nameValue.trim() || nameValue === screen.id) {
      setEditingName(false);
      return;
    }
    setIsRenaming(true);
    try {
      await updateScreenName(screen.id, nameValue.trim());
      setEditingName(false);
    } catch (err) {
      alert('Rename failed: ' + err.message);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleBackButtonChange = async (targetId) => {
    if (!screen) return;
    try {
      await updateScreenBackButton(screen.id, targetId || '');
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleTargetChange = async (buttonId, newTarget) => {
    try {
      await updateButton(screen.id, buttonId, { target: newTarget });
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleRectChange = async (buttonId, updates) => {
    try {
      await updateButton(screen.id, buttonId, updates);
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleCopyButtonRect = (btn) => {
    const rect = normalizeButton(btn);
    copyButtonRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  };

  const handlePasteButtonRect = async (buttonId) => {
    if (!screen || !buttonRectClipboard) return;
    try {
      await handleRectChange(buttonId, { ...buttonRectClipboard });
    } catch {
      /* handleRectChange alerts on failure */
    }
  };

  const handleAddButton = async () => {
    if (!screen) return;
    try {
      const newButtonData = {
        ...(buttonRectClipboard
          ? { ...buttonRectClipboard }
          : { left: 500, top: 200, width: 50, height: 50 }),
      };
      await addButton(screen.id, newButtonData);
    } catch (err) {
      alert('Failed to add button: ' + err.message);
    }
  };

  const handleImportButtons = async () => {
    if (!screen || !importCompareScreenId) return;
    const source = screens.find((s) => s.id === importCompareScreenId);
    const sourceButtons =
      editLayer === 'scroll'
        ? source?.scrollArea?.buttons || []
        : source?.buttons || [];
    if (!sourceButtons.length) return;

    if (!importSourceButtonIds.length) {
      alert('Select buttons on the import screen (right panel): drag an area or Ctrl+click.');
      return;
    }

    const count = importSourceButtonIds.length;
    const layerLabel = editLayer === 'scroll' ? 'scroll' : 'base';
    if (
      !confirm(
        layerButtons.length > 0
          ? `Import ${count} ${layerLabel} button${count === 1 ? '' : 's'} from "${importCompareScreenId}"? They will be added to the ${layerButtons.length} existing ${layerLabel} button${layerButtons.length === 1 ? '' : 's'} on this screen.`
          : `Import ${count} ${layerLabel} button${count === 1 ? '' : 's'} from "${importCompareScreenId}" onto this empty ${layerLabel} layer?`
      )
    ) {
      return;
    }

    setIsImportingButtons(true);
    try {
      await importButtonsFromScreen(screen.id, importCompareScreenId, {
        includeTargets: importIncludeTargets,
        buttonIds: importSourceButtonIds,
        layer: editLayer === 'scroll' ? 'scroll' : 'base',
      });
      setImportSourceButtonIds([]);
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setIsImportingButtons(false);
    }
  };

  const importDisabled =
    !importCompareScreenId ||
    isImportingButtons ||
    importSourceButtonIds.length === 0;

  const handlePopoverToggle = async (buttonId, hasPopover) => {
    if (hasPopover) {
      // Just open the UI, don't save yet
      setPopoverUIOpen((prev) => ({ ...prev, [buttonId]: true }));
    } else {
      // Closing - remove popover from DB
      setPopoverUIOpen((prev) => ({ ...prev, [buttonId]: false }));
      try {
        await updateButton(screen.id, buttonId, { popover: null });
      } catch (err) {
        alert('Failed to update popover: ' + err.message);
      }
    }
  };

  const handlePopoverChange = async (buttonId, field, value) => {
    try {
      const btn = screen.buttons.find(b => b.id === buttonId);
      if (!btn) return;

      // Get or create popover structure
      let popover = btn.popover || {
        title: '',
        text: '',
        style: { top: '0%', left: '0%' },
      };

      // Update the field
      if (field.startsWith('style.')) {
        const styleField = field.split('.')[1];
        popover.style = { ...popover.style, [styleField]: value };
      } else {
        popover[field] = value;
      }

      // Check if popover has any content
      const hasContent = popover.title?.trim() || popover.text?.trim();

      // Only save if it has content, otherwise remove it
      const updates = hasContent ? { popover } : { popover: null };
      await updateButton(screen.id, buttonId, updates);
    } catch (err) {
      alert('Failed to update popover: ' + err.message);
    }
  };

  return (
    <div className="sidebar">
      {screen && selectedScreenIds.length === 1 && isEditMode && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">Image</div>
          {editingName ? (
            <div className="sidebar__rename">
              <input
                className="input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                disabled={isRenaming}
                autoFocus
              />
              <button
                className="btn btn-sm btn-accent"
                onClick={handleRename}
                disabled={isRenaming}
              >
                {isRenaming ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(screen.id);
                }}
                disabled={isRenaming}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="sidebar__screen-name" onClick={() => setEditingName(true)}>
              <span>{screen.id}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
          )}
          {isRealSectionView(activeSectionId) && screen.sectionId !== activeSectionId && (
            <button
              type="button"
              className="btn btn-sm btn-accent sidebar__assign-section"
              onClick={() => assignScreenToSection(screen.id, activeSectionId)}
            >
              Add to section {activeSectionId}
            </button>
          )}
          <div className="sidebar__image-actions">
            <input
              ref={replaceImageInputRef}
              type="file"
              accept="image/*"
              className="sidebar__image-file-input"
              onChange={handleReplaceImage}
              disabled={isImageBusy || isCapturing}
            />
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={() => replaceImageInputRef.current?.click()}
              disabled={isImageBusy || isCapturing}
            >
              {isImageBusy ? 'Working…' : hasScreenImage ? 'Replace image' : 'Add image'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleClearImage}
              disabled={!hasScreenImage || isImageBusy || isCapturing}
              title={hasScreenImage ? 'Delete screenshot file; keep this screen node' : 'No image on this screen'}
            >
              Remove image
            </button>
          </div>
          {isSamsung && (
            <>
              <div className="sidebar__button-target sidebar__back-button">
                <label className="label">Back button</label>
                <ScreenPickerSelect
                  value={screen.backButtonTarget || ''}
                  onChange={handleBackButtonChange}
                  allowEmpty
                  emptyLabel="— none —"
                  isParent={isParentScreen}
                  showPreviewOnHover
                  screens={screens}
                  groups={[
                    ...(targetOptions.inSection.length > 0
                      ? [{
                          label: 'This section',
                          options: targetOptions.inSection.map((s) => ({ id: s.id })),
                        }]
                      : []),
                    ...(targetOptions.other.length > 0
                      ? [{
                          label: 'Other screens',
                          options: targetOptions.other.map((s) => ({ id: s.id })),
                        }]
                      : []),
                  ]}
                />
              </div>
              <div className="sidebar__button-target">
                <label className="label" htmlFor="sidebar-preset">
                  Preset
                </label>
                <select
                  id="sidebar-preset"
                  className="input"
                  value={screen.preset || 'preset2'}
                  onChange={handlePresetChange}
                >
                  {SAMSUNG_PRESET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {canEditScroll && (
                <div className="sidebar__scroll-section">
                  <div className="sidebar__section-title">Scroll strip</div>
                  <div className="sidebar__image-actions">
                    <input
                      ref={replaceScrollImageInputRef}
                      type="file"
                      accept="image/*"
                      className="sidebar__image-file-input"
                      onChange={handleReplaceScrollImage}
                      disabled={isImageBusy || isCapturing}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-accent"
                      onClick={() => replaceScrollImageInputRef.current?.click()}
                      disabled={isImageBusy || isCapturing}
                    >
                      {hasScrollImage ? 'Replace strip' : 'Add strip'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={handleClearScrollImage}
                      disabled={!hasScrollImage || isImageBusy || isCapturing}
                    >
                      Remove strip
                    </button>
                  </div>
                  <div className="sidebar__layer-toggle" role="group" aria-label="Edit layer">
                    <button
                      type="button"
                      className={`btn btn-sm ${editLayer === 'base' ? 'btn-accent' : ''}`}
                      onClick={() => setEditLayer('base')}
                    >
                      Base
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${editLayer === 'scroll' ? 'btn-accent' : ''}`}
                      onClick={() => setEditLayer('scroll')}
                      disabled={!hasScrollImage}
                      title={
                        hasScrollImage
                          ? 'Edit scroll-strip hotspots'
                          : 'Upload a scroll strip first'
                      }
                    >
                      Scroll
                    </button>
                  </div>
                  {editLayer === 'scroll' && (
                    <p className="sidebar__import-pick-hint">
                      Editing the tall strip full-height. Preset {screen.preset} sets the
                      simulator viewport only.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {screen && isEditMode && importSourceOptions.length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">Import buttons</div>
          <div className="sidebar__button-import">
            <label className="label">From screen</label>
            <div className="sidebar__button-import-row">
              <ScreenPickerSelect
                value={importCompareScreenId || ''}
                onChange={(screenId) => setImportCompareScreenId(screenId || null)}
                placeholder="— select screen —"
                disabled={isImportingButtons}
                isParent={isParentScreen}
                showPreviewOnHover
                screens={screens}
                groups={[
                  ...(importSourceGroups.inSection.length > 0
                    ? [{
                        label: 'This section',
                        options: importSourceGroups.inSection.map((s) => ({
                          id: s.id,
                          suffix:
                            editLayer === 'scroll'
                              ? (s.scrollArea?.buttons || []).length
                              : s.buttons.length,
                        })),
                      }]
                    : []),
                  ...(importSourceGroups.other.length > 0
                    ? [{
                        label: 'Other screens',
                        options: importSourceGroups.other.map((s) => ({
                          id: s.id,
                          suffix:
                            editLayer === 'scroll'
                              ? (s.scrollArea?.buttons || []).length
                              : s.buttons.length,
                        })),
                      }]
                    : []),
                ]}
              />
              <button
                type="button"
                className="btn btn-sm btn-accent"
                onClick={handleImportButtons}
                disabled={importDisabled}
              >
                {isImportingButtons ? 'Importing…' : 'Import'}
              </button>
            </div>
            <label className="sidebar__import-targets">
              <input
                type="checkbox"
                checked={importIncludeTargets}
                onChange={(e) => setImportIncludeTargets(e.target.checked)}
                disabled={isImportingButtons}
              />
              <span>Import targets</span>
            </label>
            {importCompareScreenId && (
              <p className="sidebar__import-pick-hint">
                {importSourceButtonIds.length > 0
                  ? `${importSourceButtonIds.length} button${importSourceButtonIds.length === 1 ? '' : 's'} selected on the import screen.`
                  : 'Drag on the import screen to select an area, or Ctrl+click buttons.'}
                {editLayer === 'scroll' ? ' (scroll layer)' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {mode === 'graph' && (
        <div className="sidebar__section">
          <SectionBar variant="sidebar" />
        </div>
      )}

      {mode === 'graph' && <ImageConfigSection />}

      {mode === 'graph' && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">Nodes</div>
          <label className="label" htmlFor="sidebar-new-node-id">
            Screen id
          </label>
          <input
            id="sidebar-new-node-id"
            className="input sidebar__new-node-input"
            value={newNodeId}
            onChange={(e) => setNewNodeId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateNode()}
            disabled={isCreatingNode}
            placeholder="e.g. settings_01"
          />
          <button
            type="button"
            className="btn btn-sm btn-accent sidebar__new-node-btn"
            onClick={handleCreateNode}
            disabled={isCreatingNode || !newNodeId.trim()}
          >
            {isCreatingNode ? 'Creating…' : 'New node'}
          </button>
          <p className="sidebar__flow-select-hint">
            Creates an empty node on the graph. Open the Screen tab to add an image and buttons.
          </p>
        </div>
      )}

      {mode === 'graph' && selectedScreenIds.length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">
            {selectedScreenIds.length === 1 ? 'Selection' : `Screens (${selectedScreenIds.length})`}
          </div>
          {selectedScreenIds.length > 1 && (
            <ul className="sidebar__flow-screen-list">
              {selectedScreenIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
          <p className="sidebar__flow-select-hint">
            Ctrl+click or drag a box to multi-select. Drag selected nodes together.
          </p>
          {selectedScreenIds.length === 1 && screen && (
            <div className="sidebar__rename-node">
              <label className="label" htmlFor="sidebar-rename-node-id">
                Rename node
              </label>
              {editingName ? (
                <div className="sidebar__rename">
                  <input
                    id="sidebar-rename-node-id"
                    className="input"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    disabled={isRenaming}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-accent"
                    onClick={handleRename}
                    disabled={isRenaming}
                  >
                    {isRenaming ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setEditingName(false);
                      setNameValue(screen.id);
                    }}
                    disabled={isRenaming}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm sidebar__rename-node-btn"
                  onClick={() => {
                    setNameValue(screen.id);
                    setEditingName(true);
                  }}
                  title="Also renames the screenshot file to match"
                >
                  Rename…
                </button>
              )}
              <p className="sidebar__flow-select-hint">
                Renames the node id and its screenshot file.
              </p>
            </div>
          )}
          {ungroupedSelectedIds.length > 0 && (
            <div className="sidebar__add-to-group">
              <div className="sidebar__section-title sidebar__section-title--nested">
                {ungroupedSelectedIds.length === selectedScreenIds.length
                  ? 'Add to canvas group'
                  : `Add ${ungroupedSelectedIds.length} ungrouped to canvas group`}
              </div>
              {sections.length > 0 && (
                <div className="sidebar__add-to-group-row">
                  <select
                    className="input"
                    value={assignSectionId}
                    onChange={(e) => setAssignSectionId(e.target.value)}
                    disabled={isAssigningGroup}
                    aria-label="Existing canvas group"
                  >
                    <option value="">Choose a group…</option>
                    {sections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name || sec.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-accent"
                    onClick={handleAddSelectionToGroup}
                    disabled={isAssigningGroup || !assignSectionId}
                  >
                    {isAssigningGroup ? 'Working…' : 'Add'}
                  </button>
                </div>
              )}
              <div className="sidebar__add-to-group-row">
                <input
                  className="input"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateGroupFromSelection();
                  }}
                  disabled={isAssigningGroup}
                  placeholder="New group name"
                  aria-label="New canvas group name"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleCreateGroupFromSelection}
                  disabled={isAssigningGroup || !newGroupName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          )}
          {groupedSelectedIds.length > 0 && (
            <button
              type="button"
              className="btn btn-sm sidebar__remove-from-group"
              onClick={handleRemoveSelectionFromGroup}
              disabled={isAssigningGroup}
            >
              {isAssigningGroup
                ? 'Working…'
                : groupedSelectedIds.length === 1
                  ? 'Remove from group'
                  : `Remove ${groupedSelectedIds.length} from group`}
            </button>
          )}
          {inboundToSelection.count > 0 && (
            <label className="sidebar__delete-parent-option">
              <input
                type="checkbox"
                checked={removeParentButtons}
                onChange={(e) => setRemoveParentButtons(e.target.checked)}
              />
              <span>
                Remove {inboundToSelection.count} navigation button
                {inboundToSelection.count === 1 ? '' : 's'} on parent screen
                {inboundToSelection.parentScreenCount === 1 ? '' : 's'}
              </span>
            </label>
          )}
          <div className="sidebar__selection-actions">
            {selectedScreenIds.length === 1 && (
              <button
                type="button"
                className="btn btn-sm btn-accent sidebar__retake-btn"
                onClick={handleRetakeScreenshot}
                disabled={!captureReady || isCapturing}
                title={captureReadyTitle}
              >
                {isCapturing ? 'Capturing…' : 'Retake screenshot'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm sidebar__delete-btn"
              onClick={handleDeleteNodes}
            >
              {selectedScreenIds.length === 1
                ? 'Delete node'
                : `Delete ${selectedScreenIds.length} nodes`}
            </button>
          </div>
        </div>
      )}

      {isRealSectionView(activeSectionId) && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">
            Section: {activeSection?.name || activeSectionId}
          </div>
          {sectionScreens.length === 0 ? (
            <div className="sidebar__empty">
              No screens yet. Capture or import while this section is selected.
            </div>
          ) : (
            <div className="sidebar__section-screens">
              {sectionScreens.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sidebar__section-screen ${selectedScreenIds.includes(s.id) ? 'sidebar__section-screen--active' : ''} ${s.id === activeSection?.rootScreenId ? 'sidebar__section-screen--root' : ''}`}
                  onClick={() => selectScreen(s.id)}
                >
                  {s.id}
                </button>
              ))}
              {external.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sidebar__section-screen sidebar__section-screen--external ${selectedScreenIds.includes(s.id) ? 'sidebar__section-screen--active' : ''}`}
                  onClick={() => selectScreen(s.id)}
                  title="Outside this section (linked)"
                >
                  {s.id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screen / button editing — viewer only */}
      {screen && isEditMode ? (
        <>
          {/* Selected button details */}
          {selectedButtonId && selectedButton && (
            <div className="sidebar__section sidebar__section--grow">
              <div className="sidebar__section-title">Button Details</div>
              {(() => {
                const selectedBtn = selectedButton;
                return (
                  <>
                    <div className="sidebar__button-target">
                      <label className="label">Target</label>
                      <ScreenPickerSelect
                        value={selectedBtn.target || ''}
                        onChange={(targetId) => handleTargetChange(selectedBtn.id, targetId || '')}
                        allowEmpty
                        emptyLabel="— none —"
                        isParent={isParentScreen}
                        showPreviewOnHover
                        screens={screens}
                        groups={[
                          ...(targetOptions.inSection.length > 0
                            ? [{
                                label: 'This section',
                                options: targetOptions.inSection.map((s) => ({ id: s.id })),
                              }]
                            : []),
                          ...(targetOptions.other.length > 0
                            ? [{
                                label: 'Other screens',
                                options: targetOptions.other.map((s) => ({ id: s.id })),
                              }]
                            : []),
                        ]}
                      />
                    </div>
                    <div className="sidebar__button-target">
                      <label className="label">Type</label>
                      <select
                        className="input"
                        value={selectedBtn.type || ''}
                        onChange={(e) => handleRectChange(selectedBtn.id, { type: e.target.value || null })}
                      >
                        <option value="">— default —</option>
                        <option value="arrow-right">arrow-right</option>
                        <option value="arrow-left">arrow-left</option>
                        <option value="arrow-up">arrow-up</option>
                        <option value="arrow-down">arrow-down</option>
                        <option value="arrow-up-disabled">arrow-up-disabled</option>
                        <option value="arrow-down-disabled">arrow-down-disabled</option>
                      </select>
                    </div>
                    <ButtonRectInputs
                      key={selectedBtn.id}
                      button={selectedBtn}
                      onUpdate={(updates) => handleRectChange(selectedBtn.id, updates)}
                    />
                    <div className="sidebar__rect-clipboard">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleCopyButtonRect(selectedBtn)}
                        title="Save this button's position and size for reuse"
                      >
                        Copy size
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-accent"
                        onClick={() => handlePasteButtonRect(selectedBtn.id)}
                        disabled={!buttonRectClipboard}
                        title={
                          buttonRectClipboard
                            ? `Apply ${buttonRectClipboard.top}, ${buttonRectClipboard.left}, ${buttonRectClipboard.width}×${buttonRectClipboard.height}`
                            : 'Copy a button size first'
                        }
                      >
                        Paste size
                      </button>
                    </div>
                    {buttonRectClipboard && (
                      <p className="sidebar__rect-clipboard-hint">
                        Saved: top {buttonRectClipboard.top}, left {buttonRectClipboard.left},{' '}
                        {buttonRectClipboard.width}×{buttonRectClipboard.height}
                      </p>
                    )}
                    <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', marginBottom: 'var(--space-md)' }}>
                        <input
                          type="checkbox"
                          checked={popoverUIOpen[selectedBtn.id] || (selectedBtn.popover && (selectedBtn.popover.title?.trim() || selectedBtn.popover.text?.trim()))}
                          onChange={(e) => handlePopoverToggle(selectedBtn.id, e.target.checked)}
                        />
                        <span className="label" style={{ margin: 0 }}>Add Popover</span>
                      </label>
                      {(popoverUIOpen[selectedBtn.id] || (selectedBtn.popover && (selectedBtn.popover.title?.trim() || selectedBtn.popover.text?.trim()))) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                          <label className="sidebar__rect-field">
                            <span className="label">Title</span>
                            <input
                              className="input"
                              type="text"
                              value={selectedBtn.popover?.title || ''}
                              onChange={(e) => handlePopoverChange(selectedBtn.id, 'title', e.target.value)}
                            />
                          </label>
                          <label className="sidebar__rect-field">
                            <span className="label">Text</span>
                            <textarea
                              className="input"
                              value={selectedBtn.popover?.text || ''}
                              onChange={(e) => handlePopoverChange(selectedBtn.id, 'text', e.target.value)}
                              style={{ minHeight: '60px', resize: 'vertical' }}
                            />
                          </label>
                          <label className="sidebar__rect-field">
                            <span className="label">Top Position</span>
                            <input
                              className="input"
                              type="text"
                              value={selectedBtn.popover.style?.top || ''}
                              onChange={(e) => handlePopoverChange(selectedBtn.id, 'style.top', e.target.value)}
                              placeholder="e.g., 0%, 10px"
                            />
                          </label>
                          <label className="sidebar__rect-field">
                            <span className="label">Left Position</span>
                            <input
                              className="input"
                              type="text"
                              value={selectedBtn.popover.style?.left || ''}
                              onChange={(e) => handlePopoverChange(selectedBtn.id, 'style.left', e.target.value)}
                              placeholder="e.g., 0%, 10px"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Buttons list */}
          <div className="sidebar__section">
            <div className="sidebar__section-title">
              <span>
                {editLayer === 'scroll' ? 'Scroll buttons' : 'Buttons'} ({layerButtons.length})
              </span>
              <button
                className="btn btn-sm btn-accent"
                onClick={handleAddButton}
                title="Add new button"
                style={{ marginLeft: 'auto' }}
              >
                +
              </button>
            </div>

            {layerButtons.length === 0 ? (
              <div className="sidebar__empty">No buttons yet. Click "Add Hotspot" in the viewer.</div>
            ) : (
              <div className="sidebar__button-list">
                {layerButtons.map((btn) => (
                  <div
                    key={btn.id}
                    className={`sidebar__button-item ${btn.id === selectedButtonId ? 'sidebar__button-item--selected' : ''}`}
                    onClick={() => selectButton(btn.id)}
                  >
                  <div className="sidebar__button-header">
                      <span className={`sidebar__button-dot ${btn.target && screensById.has(btn.target) ? 'linked' : 'unlinked'}`} />
                      <span className="sidebar__button-name">{btn.target || '— none —'}</span>
                      <button
                        className="sidebar__button-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteButton(screen.id, btn.id);
                        }}
                        title="Delete button"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : !isEditMode && selectedScreenIds.length === 0 ? (
        <div className="sidebar__section sidebar__section--grow">
          <div className="sidebar__empty">
            Select a screen from the graph to edit its details and buttons.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScreenPickerLabel({ screenId, isParent, suffix }) {
  return (
    <>
      {screenId}
      {isParent && (
        <>
          {' '}
          <strong className="sidebar-screen-picker__parent">(parent)</strong>
        </>
      )}
      {suffix != null && suffix !== '' && <> ({suffix})</>}
    </>
  );
}

function ScreenPickerSelect({
  value,
  onChange,
  placeholder = '— select —',
  disabled = false,
  allowEmpty = false,
  emptyLabel = '— none —',
  groups = [],
  isParent = () => false,
  showPreviewOnHover = false,
  screens = [],
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [previewPos, setPreviewPos] = useState(null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const imageVersions = useStore((s) => s.imageVersions);

  const flatOptions = useMemo(() => {
    const opts = [];
    if (allowEmpty) opts.push({ id: '', suffix: null });
    groups.forEach((group) => {
      group.options.forEach((option) => opts.push(option));
    });
    return opts;
  }, [groups, allowEmpty]);

  const selected = flatOptions.find((option) => option.id === (value || ''));

  // When closed (or value changes externally), sync the input text to the value
  useEffect(() => {
    if (!open) {
      setFilterText(value || '');
      setIsFiltering(false);
    }
  }, [value, open]);

  const normalizedFilter = isFiltering ? filterText.trim().toLowerCase() : '';

  const filteredGroups = useMemo(() => {
    if (!normalizedFilter) return groups;
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((opt) =>
          opt.id.toLowerCase().includes(normalizedFilter)
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, normalizedFilter]);

  const firstMatch = useMemo(() => {
    for (const group of filteredGroups) {
      if (group.options.length) return group.options[0];
    }
    return null;
  }, [filteredGroups]);

  const totalMatches = filteredGroups.reduce(
    (sum, g) => sum + g.options.length,
    0
  );

  const hoveredScreen = hoveredId
    ? screens.find((screen) => screen.id === hoveredId)
    : null;
  const hoveredImageVersion = hoveredId ? (imageVersions[hoveredId] ?? 0) : 0;

  useEffect(() => {
    if (!open) {
      setHoveredId(null);
      setPreviewPos(null);
    }
  }, [open]);

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [hoveredId, hoveredScreen?.image, hoveredImageVersion]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
    setFilterText(id || '');
    setIsFiltering(false);
  };

  const handleInputFocus = (e) => {
    if (disabled) return;
    setOpen(true);
    const input = e.target;
    // Defer select so click-cursor placement doesn't override it
    setTimeout(() => {
      if (document.activeElement === input) input.select();
    }, 0);
  };

  const handleInputChange = (e) => {
    if (!open) setOpen(true);
    setFilterText(e.target.value);
    setIsFiltering(true);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isFiltering && firstMatch) {
        e.preventDefault();
        pick(firstMatch.id);
      } else if (isFiltering && allowEmpty && !filterText.trim()) {
        e.preventDefault();
        pick('');
      }
    } else if (e.key === 'ArrowDown' && !open) {
      setOpen(true);
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      inputRef.current?.blur();
    } else {
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const handleOptionHover = (optionId, e) => {
    if (!showPreviewOnHover || !optionId) {
      setHoveredId(null);
      setPreviewPos(null);
      return;
    }

    setHoveredId(optionId);
    const optionRect = e.currentTarget.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const width = 630;
    const gap = 12;
    const anchorLeft = menuRect?.left ?? optionRect.left;
    let left = anchorLeft - width - gap;
    let top = optionRect.top;
    const maxHeight = 441;

    if (top + maxHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - maxHeight - 8);
    }
    if (left < 8) left = 8;

    setPreviewPos({ top, left, width });
  };

  const previewImage = hoveredScreen?.image?.trim();
  const showPreview = open && showPreviewOnHover && hoveredId && previewPos;

  const showEmptyOption =
    allowEmpty && (!normalizedFilter || emptyLabel.toLowerCase().includes(normalizedFilter));

  return (
    <div
      ref={rootRef}
      className={`sidebar-screen-picker ${open ? 'sidebar-screen-picker--open' : ''} ${className}`.trim()}
    >
      <div
        className={`input sidebar-screen-picker__trigger ${disabled ? 'sidebar-screen-picker__trigger--disabled' : ''}`}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="sidebar-screen-picker__input"
          value={filterText}
          placeholder={open ? 'Type to filter…' : placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
        />
        {!open && value && selected?.suffix != null && selected.suffix !== '' && (
          <span className="sidebar-screen-picker__trigger-suffix">({selected.suffix})</span>
        )}
        {!open && value && selected && isParent(value) && (
          <span className="sidebar-screen-picker__trigger-badge">parent</span>
        )}
        <button
          type="button"
          tabIndex={-1}
          className="sidebar-screen-picker__chevron"
          aria-label={open ? 'Close options' : 'Open options'}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleOpen}
        >▾</button>
      </div>
      {open && (
        <div
          ref={menuRef}
          className="sidebar-screen-picker__menu"
          role="listbox"
          onMouseLeave={() => {
            setHoveredId(null);
            setPreviewPos(null);
          }}
        >
          {showEmptyOption && (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`sidebar-screen-picker__option ${!value ? 'sidebar-screen-picker__option--selected' : ''}`}
              onClick={() => pick('')}
            >
              {emptyLabel}
            </button>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label} className="sidebar-screen-picker__group">
              <div className="sidebar-screen-picker__group-label">{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  className={`sidebar-screen-picker__option ${value === option.id ? 'sidebar-screen-picker__option--selected' : ''}`}
                  onClick={() => pick(option.id)}
                  onMouseEnter={(e) => handleOptionHover(option.id, e)}
                >
                  <ScreenPickerLabel
                    screenId={option.id}
                    isParent={isParent(option.id)}
                    suffix={option.suffix}
                  />
                </button>
              ))}
            </div>
          ))}
          {totalMatches === 0 && !showEmptyOption && (
            <div className="sidebar-screen-picker__no-results">
              No matches for "{filterText}"
            </div>
          )}
        </div>
      )}
      {showPreview && createPortal(
        <div
          className="sidebar-screen-picker__preview"
          style={{
            top: previewPos.top,
            left: previewPos.left,
            width: previewPos.width,
          }}
        >
          <div className="sidebar-screen-picker__preview-thumb">
            {previewImage && !previewImageFailed ? (
              <img
                key={`${previewImage}-${hoveredImageVersion}`}
                src={screenshotUrl(previewImage, hoveredImageVersion)}
                alt=""
                draggable={false}
                onError={() => setPreviewImageFailed(true)}
              />
            ) : (
              <div className="sidebar-screen-picker__preview-empty">no image</div>
            )}
          </div>
          <div className="sidebar-screen-picker__preview-label">{hoveredId}</div>
        </div>,
        document.body
      )}
    </div>
  );
}

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function ButtonRectInputs({ button, onUpdate }) {
  const rect = normalizeButton(button);
  const ownerIdRef = useRef(button.id);
  ownerIdRef.current = button.id;
  const rectRootRef = useRef(null);
  const fieldsRef = useRef(null);

  const [fields, setFields] = useState({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  });
  fieldsRef.current = fields;

  useEffect(() => {
    const next = normalizeButton(button);
    ownerIdRef.current = button.id;
    setFields({
      top: next.top,
      left: next.left,
      width: next.width,
      height: next.height,
    });
  }, [button.id, button.left, button.top, button.width, button.height, button.x, button.y]);

  const commit = (next, ownerId = button.id) => {
    if (ownerId !== ownerIdRef.current) return;
    onUpdate({
      left: next.left,
      top: next.top,
      width: next.width,
      height: next.height,
    });
  };

  const handleChange = (key, raw) => {
    const ownerId = button.id;
    if (raw === '') {
      setFields((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    const min = key === 'width' || key === 'height' ? 1 : 0;
    const value = Math.max(min, parseInt(raw, 10) || 0);
    setFields((prev) => {
      const nextFields = { ...prev, [key]: value };
      commit(normalizeFields(nextFields), ownerId);
      return nextFields;
    });
  };

  const normalizeFields = (draft) => {
    const minSize = 1;
    return {
      top: draft.top === '' ? 0 : Math.max(0, Number(draft.top) || 0),
      left: draft.left === '' ? 0 : Math.max(0, Number(draft.left) || 0),
      width: draft.width === '' ? minSize : Math.max(minSize, Number(draft.width) || minSize),
      height: draft.height === '' ? minSize : Math.max(minSize, Number(draft.height) || minSize),
    };
  };

  const nudgeFromArrow = (key, focusedField, step) => {
    const f = fieldsRef.current;
    const draft = { ...f };

    if (focusedField === 'width') {
      if (key === 'ArrowLeft') draft.width = Number(f.width) - step;
      else if (key === 'ArrowRight') draft.width = Number(f.width) + step;
      else return false;
    } else if (focusedField === 'height') {
      if (key === 'ArrowUp') draft.height = Number(f.height) - step;
      else if (key === 'ArrowDown') draft.height = Number(f.height) + step;
      else return false;
    } else if (focusedField === 'left') {
      if (key === 'ArrowLeft') draft.left = Number(f.left) - step;
      else if (key === 'ArrowRight') draft.left = Number(f.left) + step;
      else return false;
    } else if (focusedField === 'top') {
      if (key === 'ArrowUp') draft.top = Number(f.top) - step;
      else if (key === 'ArrowDown') draft.top = Number(f.top) + step;
      else return false;
    } else {
      if (key === 'ArrowLeft') draft.left = Number(f.left) - step;
      else if (key === 'ArrowRight') draft.left = Number(f.left) + step;
      else if (key === 'ArrowUp') draft.top = Number(f.top) - step;
      else if (key === 'ArrowDown') draft.top = Number(f.top) + step;
      else return false;
    }

    const next = normalizeFields(draft);
    setFields(next);
    commit(next, ownerIdRef.current);
    return true;
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!ARROW_KEYS.has(e.key)) return;

      const active = document.activeElement;
      const inRect = rectRootRef.current?.contains(active);
      const focusedField = active?.dataset?.rectField;

      if (active?.closest('input, textarea, select, [contenteditable="true"]') && !inRect) {
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (!nudgeFromArrow(e.key, inRect ? focusedField : null, step)) return;

      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleBlur = () => {
    if (button.id !== ownerIdRef.current) {
      const next = normalizeButton(button);
      setFields({
        top: next.top,
        left: next.left,
        width: next.width,
        height: next.height,
      });
      return;
    }
    const next = normalizeFields(fields);
    setFields(next);
    commit(next, button.id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    if (!ARROW_KEYS.has(e.key)) return;
    const step = e.shiftKey ? 10 : 1;
    if (nudgeFromArrow(e.key, e.currentTarget.dataset.rectField, step)) {
      e.preventDefault();
    }
  };

  return (
    <div
      ref={rectRootRef}
      className="sidebar__button-rect"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="sidebar__rect-field">
        <span className="label">Top</span>
        <input
          className="input"
          type="number"
          min="0"
          data-rect-field="top"
          value={fields.top}
          onChange={(e) => handleChange('top', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Left</span>
        <input
          className="input"
          type="number"
          min="0"
          data-rect-field="left"
          value={fields.left}
          onChange={(e) => handleChange('left', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Width</span>
        <input
          className="input"
          type="number"
          min="1"
          data-rect-field="width"
          value={fields.width}
          onChange={(e) => handleChange('width', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="sidebar__rect-field">
        <span className="label">Height</span>
        <input
          className="input"
          type="number"
          min="1"
          data-rect-field="height"
          value={fields.height}
          onChange={(e) => handleChange('height', e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </label>
    </div>
  );
}
