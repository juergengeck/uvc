import { Link } from '@tanstack/react-router';
import { ChevronRight, Radio, Server } from 'lucide-react';
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
}: {
  discoveryRuntime: UvcDiscoveryRuntime | null;
  runtimeError: string | null;
  sections: SettingsSection[];
}) {
  const { error, loading, settings, updateSection } = useSettingsContext();
  const [drafts, setDrafts] = useState<Record<string, SectionValues>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  return (
    <div className="settings-home">
      <header className="settings-hero">
        <span className="eyebrow">Settings</span>
        <h1>Resources and configuration</h1>
        <p>Manage the devices used to document UVC cycles and this application's configuration.</p>
      </header>

      <section className="settings-group">
        <div className="settings-group__header"><h2>Resources</h2></div>
        <Link className="settings-link-card" to="/settings/devices">
          <span className="settings-link-card__icon"><Radio aria-hidden="true" /></span>
          <span className="settings-link-card__copy">
            <strong>Devices</strong>
            <span>Lamps, sensors, ESP, groov RIO, pairing, and provisioning</span>
          </span>
          <span className="settings-link-card__status">
            {discoveryRuntime ? `${discoveryRuntime.devices.length} resources` : 'Loading…'}
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        {runtimeError ? <pre className="error-block">{runtimeError}</pre> : null}
      </section>

      {visibleSections.length ? <section className="settings-group">
        <div className="settings-group__header">
          <div><h2>Application</h2><p>Sections registered by modules through settings.core.</p></div>
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
                  <div><h3>{section.name}</h3><p>{section.module}</p></div>
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
      </section> : null}
    </div>
  );
}
