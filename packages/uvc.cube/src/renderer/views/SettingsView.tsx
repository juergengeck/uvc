import { useEffect, useMemo, useState } from 'react';

import type {
  DiscoveryDeviceSnapshot,
  DiscoveryRuntimeSnapshot,
  SettingsSectionSnapshot,
  SettingsSnapshot,
  SettingsValues,
} from '@shared/contracts';

interface SettingsViewProps {
  sections: SettingsSectionSnapshot[];
  settings: SettingsSnapshot | null;
  runtime: DiscoveryRuntimeSnapshot | null;
  runtimeError: string | null;
  isSaving: boolean;
  isRefreshing: boolean;
  onSaveSection: (sectionId: string, values: SettingsValues) => Promise<void>;
  onRefreshRuntime: () => Promise<void>;
  onPushDiscoverySettings: () => Promise<void>;
}

function jsonValueToTextarea(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatCapabilities(capabilities?: string[]): string {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return 'none';
  }

  return capabilities.join(', ');
}

export function SettingsView({
  sections,
  settings,
  runtime,
  runtimeError,
  isSaving,
  isRefreshing,
  onSaveSection,
  onRefreshRuntime,
  onPushDiscoverySettings,
}: SettingsViewProps) {
  const [drafts, setDrafts] = useState<Record<string, SettingsValues>>({});
  const [sectionErrors, setSectionErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!settings) {
      return;
    }

    setDrafts((previous) => {
      const next = { ...previous };
      for (const section of sections) {
        next[section.id] = { ...(settings[section.id] ?? {}) };
      }
      return next;
    });
  }, [sections, settings]);

  const visibleSections = useMemo(() => {
    return sections.filter((section) => section.id === 'device' || section.id === 'uvc.discovery');
  }, [sections]);

  const handleFieldChange = (sectionId: string, key: string, value: unknown) => {
    setDrafts((previous) => ({
      ...previous,
      [sectionId]: {
        ...(previous[sectionId] ?? {}),
        [key]: value,
      },
    }));
  };

  const handleSave = async (sectionId: string) => {
    try {
      setSectionErrors((previous) => ({ ...previous, [sectionId]: null }));
      await onSaveSection(sectionId, drafts[sectionId] ?? {});
    } catch (error) {
      setSectionErrors((previous) => ({
        ...previous,
        [sectionId]: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header panel__header--with-actions">
          <div>
            <h2>Discovery Runtime</h2>
            <p>Read device and mDNS state from the Raspberry Pi authority, then push the current cube settings back into its discovery config.</p>
          </div>
          <div className="action-row">
            <button className="action-button" onClick={() => void onRefreshRuntime()} type="button">
              {isRefreshing ? 'Refreshing…' : 'Refresh Runtime'}
            </button>
            <button className="action-button action-button--primary" onClick={() => void onPushDiscoverySettings()} type="button">
              Push Settings
            </button>
          </div>
        </div>

        {runtimeError ? <pre className="error-block">{runtimeError}</pre> : null}

        {runtime ? (
          <div className="stack">
            <div className="stats-grid stats-grid--three">
              <article className="stat-card">
                <span className="stat-card__label">Authority</span>
                <strong>{runtime.authorityUrl}</strong>
                <span>{runtime.status.status ?? (runtime.status.healthy ? 'healthy' : 'unknown')}</span>
              </article>
              <article className="stat-card">
                <span className="stat-card__label">mDNS</span>
                <strong>{runtime.status.mdns?.serviceName ?? 'n/a'}</strong>
                <span>{runtime.status.mdns?.host ?? runtime.status.mdns?.serviceType ?? 'not reported'}</span>
              </article>
              <article className="stat-card">
                <span className="stat-card__label">Devices</span>
                <strong>{runtime.devices.length}</strong>
                <span>{runtime.status.discovery?.peersSeen ?? runtime.devices.length} peers seen</span>
              </article>
            </div>

            <dl className="meta-grid meta-grid--three">
              <div>
                <dt>Discovery mode</dt>
                <dd>{runtime.config.discovery?.mode ?? runtime.status.discovery?.protocol ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Service type</dt>
                <dd>{runtime.config.discovery?.serviceType ?? runtime.status.mdns?.serviceType ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Last scan</dt>
                <dd>{formatTimestamp(runtime.status.discovery?.lastScanAt)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="loading-skeleton">
            <div />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Settings</h2>
            <p>`settings.core` sections registered for `uvc.cube`, focused on device behavior and mDNS discovery.</p>
          </div>
        </div>

        <div className="stack">
          {visibleSections.map((section) => {
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
                    disabled={isSaving}
                    onClick={() => void handleSave(section.id)}
                    type="button"
                  >
                    {isSaving ? 'Saving…' : 'Save Section'}
                  </button>
                </div>

                <div className="settings-form">
                  {section.fields.map((field) => {
                    const value = values[field.key] ?? field.defaultValue;

                    if (field.type === 'boolean') {
                      return (
                        <label className="form-field form-field--toggle" key={field.key}>
                          <div className="form-field__copy">
                            <span className="form-field__label">{field.label}</span>
                            {field.description ? <span className="form-field__help">{field.description}</span> : null}
                          </div>
                          <input
                            checked={Boolean(value)}
                            onChange={(event) => handleFieldChange(section.id, field.key, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                      );
                    }

                    if (field.type === 'select') {
                      return (
                        <label className="form-field" key={field.key}>
                          <span className="form-field__label">{field.label}</span>
                          {field.description ? <span className="form-field__help">{field.description}</span> : null}
                          <select
                            className="field-input"
                            onChange={(event) => handleFieldChange(section.id, field.key, event.target.value)}
                            value={String(value ?? '')}
                          >
                            {(field.options ?? []).map((option) => (
                              <option key={String(option.value)} value={String(option.value)}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }

                    if (field.type === 'custom') {
                      return (
                        <label className="form-field" key={field.key}>
                          <span className="form-field__label">{field.label}</span>
                          {field.description ? <span className="form-field__help">{field.description}</span> : null}
                          <textarea
                            className="field-input field-input--textarea mono"
                            onChange={(event) => {
                              handleFieldChange(section.id, field.key, event.target.value);
                            }}
                            value={typeof value === 'string' ? value : jsonValueToTextarea(value)}
                          />
                        </label>
                      );
                    }

                    const isNumber = field.type === 'number' || field.type === 'range';

                    return (
                      <label className="form-field" key={field.key}>
                        <span className="form-field__label">{field.label}</span>
                        {field.description ? <span className="form-field__help">{field.description}</span> : null}
                        <input
                          className="field-input"
                          max={field.max}
                          min={field.min}
                          onChange={(event) => {
                            const raw = event.target.value;
                            handleFieldChange(
                              section.id,
                              field.key,
                              isNumber ? Number(raw) : raw,
                            );
                          }}
                          step={field.step}
                          type={isNumber ? 'number' : 'text'}
                          value={isNumber ? String(value ?? '') : String(value ?? '')}
                        />
                      </label>
                    );
                  })}
                </div>

                {sectionErrors[section.id] ? <pre className="error-block">{sectionErrors[section.id]}</pre> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Discovered Devices</h2>
            <p>Devices reported by the configured authority, including mDNS names and trust state.</p>
          </div>
        </div>

        {!runtime || runtime.devices.length === 0 ? (
          <p className="panel-empty">No devices reported by the authority yet.</p>
        ) : (
          <div className="device-grid">
            {runtime.devices.map((device) => (
              <article className="device-card" key={device.id}>
                <div className="device-card__header">
                  <div>
                    <h3>{device.name ?? device.id}</h3>
                    <p>{device.id}</p>
                  </div>
                  <span className={device.online ? 'status-pill status-pill--available' : 'status-pill status-pill--missing'}>
                    {device.online ? 'online' : 'offline'}
                  </span>
                </div>
                <dl className="device-meta">
                  <div>
                    <dt>Role</dt>
                    <dd>{device.role ?? 'n/a'}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{device.type ?? 'n/a'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{device.address ?? 'n/a'}{device.port ? `:${device.port}` : ''}</dd>
                  </div>
                  <div>
                    <dt>mDNS</dt>
                    <dd>{device.mdnsName ?? 'n/a'}</dd>
                  </div>
                  <div>
                    <dt>Trust</dt>
                    <dd>{device.trustState ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Last seen</dt>
                    <dd>{formatTimestamp(device.lastSeenAt)}</dd>
                  </div>
                </dl>
                <p className="device-capabilities">
                  <strong>Capabilities:</strong> {formatCapabilities(device.capabilities)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
