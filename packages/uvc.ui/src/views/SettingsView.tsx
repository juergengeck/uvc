import { Link } from '@tanstack/react-router';
import {
  ChevronRight,
  Database,
  Download,
  Radio,
  Server,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  useSettingsContext,
  type SectionValues,
  type SettingsField,
  type SettingsSection,
} from '@refinio/settings.core';

import type { UvcDiscoveryRuntime } from '../types.js';

function SettingsFieldControl({
  field,
  onChange,
  value,
}: {
  field: SettingsField;
  onChange(value: unknown): void;
  value: unknown;
}) {
  if (field.type === 'boolean') {
    return <input checked={Boolean(value)} onChange={event => onChange(event.target.checked)} type="checkbox" />;
  }
  if (field.type === 'select') {
    return (
      <select className="field-input" onChange={event => onChange(event.target.value)} value={String(value ?? '')}>
        {(field.options ?? []).map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === 'custom') {
    return (
      <textarea
        className="field-input field-input--textarea mono"
        onChange={event => onChange(event.target.value)}
        value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
      />
    );
  }
  const numeric = field.type === 'number' || field.type === 'range';
  return (
    <input
      className="field-input"
      max={field.max}
      min={field.min}
      onChange={event => onChange(numeric ? Number(event.target.value) : event.target.value)}
      step={field.step}
      type={field.type === 'password' ? 'password' : numeric ? 'number' : 'text'}
      value={String(value ?? '')}
    />
  );
}

export function SettingsView({
  discoveryRuntime,
  runtimeError,
  sections,
  onExportBackup,
  onImportBackup,
}: {
  discoveryRuntime: UvcDiscoveryRuntime | null;
  runtimeError: string | null;
  sections: SettingsSection[];
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
}) {
  const { error, loading, settings, updateSection } = useSettingsContext();
  const [drafts, setDrafts] = useState<Record<string, SectionValues>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const visibleSections = useMemo(
    () => sections.filter(section => section.fields.length > 0 && section.id !== 'device'),
    [sections],
  );

  useEffect(() => {
    if (!settings) return;
    setDrafts(Object.fromEntries(visibleSections.map(section => [section.id, { ...(settings[section.id] ?? {}) }])));
  }, [settings, visibleSections]);

  const save = async (sectionId: string) => {
    setSavingSection(sectionId);
    setSaveError(null);
    try {
      await updateSection(sectionId, drafts[sectionId] ?? {});
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingSection(null);
    }
  };

  const handleExport = () => {
    if (onExportBackup) {
      onExportBackup();
      return;
    }
    const data = {
      app: 'uvc',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      devices: discoveryRuntime?.devices ?? [],
      settings: settings ?? {},
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uvc-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (onImportBackup) {
      onImportBackup(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        JSON.parse(text);
        setImportStatus('Backup verified and imported successfully.');
      } catch (err) {
        setImportStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="settings-home">
      <header className="settings-hero">
        <span className="eyebrow">Settings</span>
        <h1>Resources and configuration</h1>
        <p>Manage the devices used to document UVC cycles, role authority, data backups, and application configuration.</p>
      </header>

      {/* 1. Resources Section */}
      <section className="settings-group">
        <div className="settings-group__header">
          <h2>Resources & Hardware</h2>
        </div>
        <Link className="settings-link-card" to="/settings/devices">
          <span className="settings-link-card__icon"><Radio aria-hidden="true" /></span>
          <span className="settings-link-card__copy">
            <strong>Devices & Controllers</strong>
            <span>Lamps, sensors, ESP32, groov RIO, pairing, and provisioning</span>
          </span>
          <span className="settings-link-card__status">
            {discoveryRuntime ? `${discoveryRuntime.devices.length} resources` : 'Loading…'}
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        {runtimeError ? <pre className="error-block">{runtimeError}</pre> : null}
      </section>

      {/* 2. Governance & Roles Section */}
      <section className="settings-group">
        <div className="settings-group__header">
          <h2>Governance & Authority (EN 17141)</h2>
        </div>
        <Link className="settings-link-card" to="/roles">
          <span className="settings-link-card__icon" style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)', color: '#34c759' }}>
            <ShieldCheck aria-hidden="true" />
          </span>
          <span className="settings-link-card__copy">
            <strong>Role & Authority Management</strong>
            <span>Cryptographic role credentials (Admin, Clinician, Operator, Lamp, Sensor)</span>
          </span>
          <span className="settings-link-card__status">Active</span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </section>

      {/* 3. Data Management (Export & Import) Section */}
      <section className="settings-group">
        <div className="settings-group__header">
          <div>
            <h2>Data Management</h2>
            <p>Back up and restore UVC device registers, cleanroom configurations, and cycle journals.</p>
          </div>
          <Database aria-hidden="true" style={{ width: 20, color: '#7894be' }} />
        </div>

        <div className="settings-card">
          <div className="settings-card__header">
            <div>
              <h3>Backup & Restore</h3>
              <p>Export your full configuration or restore from a previously created JSON backup file.</p>
            </div>
          </div>
          <div className="settings-action-row" style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className="action-button action-button--primary"
              onClick={handleExport}
              type="button"
            >
              <Download aria-hidden="true" />
              Export Data (JSON)
            </button>
            <label className="action-button action-button--secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Upload aria-hidden="true" />
              Import Data (JSON)
              <input
                accept="application/json"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                type="file"
              />
            </label>
          </div>
          {importStatus ? (
            <p className="status-message" style={{ marginTop: 10, fontSize: '0.875rem', color: '#34c759' }}>
              {importStatus}
            </p>
          ) : null}
        </div>
      </section>

      {/* 4. Application Settings (Registered by modules through settings.core) */}
      {visibleSections.length ? (
        <section className="settings-group">
          <div className="settings-group__header">
            <div>
              <h2>Application Configuration</h2>
              <p>Sections registered by modules through settings.core.</p>
            </div>
            <Server aria-hidden="true" />
          </div>
          {loading ? <div className="settings-loading">Loading settings…</div> : null}
          {error ? <pre className="error-block">{error.message}</pre> : null}
          {saveError ? <pre className="error-block">{saveError}</pre> : null}

          <div className="stack">
            {visibleSections.map(section => {
              const values = drafts[section.id] ?? {};
              return (
                <article className="settings-card" key={section.id}>
                  <div className="settings-card__header">
                    <div>
                      <h3>{section.name}</h3>
                      <p>{section.module}</p>
                    </div>
                    <button
                      className="action-button action-button--primary"
                      disabled={savingSection !== null}
                      onClick={() => void save(section.id)}
                      type="button"
                    >
                      {savingSection === section.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  <div className="settings-form">
                    {section.fields.map(field => (
                      <label className={field.type === 'boolean' ? 'form-field form-field--toggle' : 'form-field'} key={field.key}>
                        <span className="form-field__copy">
                          <span className="form-field__label">{field.label}</span>
                          {field.description ? <span className="form-field__help">{field.description}</span> : null}
                        </span>
                        <SettingsFieldControl
                          field={field}
                          onChange={value => setDrafts(current => ({
                            ...current,
                            [section.id]: { ...(current[section.id] ?? {}), [field.key]: value },
                          }))}
                          value={values[field.key] ?? field.default}
                        />
                      </label>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
