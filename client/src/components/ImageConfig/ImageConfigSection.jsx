import React, { useEffect, useState } from 'react';
import useStore from '../../store/useStore.js';
import { DEFAULT_IMAGE_CONFIG } from '../../utils/coords.js';
import './ImageConfigSection.css';

const FIELDS = [
  { key: 'intrinsicWidth', label: 'Width' },
  { key: 'intrinsicHeight', label: 'Height' },
];

export default function ImageConfigSection() {
  const imageConfig = useStore((s) => s.imageConfig);
  const updateImageConfig = useStore((s) => s.updateImageConfig);
  const [draft, setDraft] = useState(imageConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(imageConfig);
  }, [imageConfig]);

  const handleChange = (key, raw) => {
    const value = raw === '' ? '' : Math.max(1, parseInt(raw, 10) || 0);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      for (const { key } of FIELDS) {
        payload[key] = parseInt(draft[key], 10) || DEFAULT_IMAGE_CONFIG[key];
      }
      await updateImageConfig(payload);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const dirty = FIELDS.some(
    ({ key }) => String(draft[key]) !== String(imageConfig[key])
  );

  return (
    <div className="sidebar__section image-config">
      <div className="sidebar__section-title">Product image size</div>
      <p className="image-config__hint">
        Hotspot coordinates in <code>emulator.json</code> use this size (px).
      </p>

      <div className="image-config__grid">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="image-config__field">
            <span className="label">{label}</span>
            <input
              className="input"
              type="number"
              min="1"
              value={draft[key]}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <p className="image-config__aspect">
        {draft.intrinsicWidth}×{draft.intrinsicHeight} px
      </p>

      <button
        className="btn btn-sm btn-accent image-config__save"
        type="button"
        disabled={!dirty || saving}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save sizes'}
      </button>
    </div>
  );
}
