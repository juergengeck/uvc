import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Plus, ShieldCheck, UserCheck } from 'lucide-react';

export interface RoleEntry {
  role: string;
  holder: string;
  issuedAt: string;
  fingerprint: string;
  status: 'valid' | 'revoked';
}

const DEFAULT_ROLES: RoleEntry[] = [
  {
    role: 'Admin (Trust Anchor)',
    holder: 'admin@hospital.local',
    issuedAt: '2026-09-01',
    fingerprint: '607d03b13b162ede...f89a',
    status: 'valid',
  },
  {
    role: 'Clinician / Doctor',
    holder: 'doctor@hospital.local',
    issuedAt: '2026-09-05',
    fingerprint: '482bc01824aa019c...28aa',
    status: 'valid',
  },
  {
    role: 'Facility Operator',
    holder: 'operator@cleanroom.local',
    issuedAt: '2026-09-10',
    fingerprint: '19dca883ba450123...bb91',
    status: 'valid',
  },
  {
    role: 'UVC Lamp Fixture',
    holder: 'lamp-254nm@devices.local',
    issuedAt: '2026-09-12',
    fingerprint: '9921abcf0193481a...3319',
    status: 'valid',
  },
  {
    role: 'Industrial Radiometer',
    holder: 'sensor-nist@devices.local',
    issuedAt: '2026-09-12',
    fingerprint: '8491a0c0eef19241...55a2',
    status: 'valid',
  },
];

export function RolesView({
  onAssignRole,
}: {
  onAssignRole?: (role: string, person: string) => Promise<void>;
}) {
  const [roles, setRoles] = useState<RoleEntry[]>(DEFAULT_ROLES);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('Clinician / Doctor');
  const [submitting, setSubmitting] = useState(false);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmail.trim()) return;
    setSubmitting(true);
    try {
      if (onAssignRole) {
        await onAssignRole(selectedRole, targetEmail);
      }
      const newEntry: RoleEntry = {
        role: selectedRole,
        holder: targetEmail.trim(),
        issuedAt: new Date().toISOString().split('T')[0],
        fingerprint: `${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
        status: 'valid',
      };
      setRoles(prev => [newEntry, ...prev]);
      setTargetEmail('');
      setShowIssueModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="roles-view" style={{ maxWidth: 1040, margin: '0 auto' }}>
      <header className="settings-hero">
        <span className="eyebrow">Governance & Authority</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Role Management (EN 17141)</h1>
            <p>Cryptographic identity and authority management. Authorize cycle signers, clinicians, and authenticated devices.</p>
          </div>
          <button
            className="action-button action-button--primary"
            onClick={() => setShowIssueModal(true)}
            type="button"
          >
            <Plus aria-hidden="true" />
            Issue Role Certificate
          </button>
        </div>
      </header>

      <div className="stack" style={{ marginTop: 24, gap: 14 }}>
        {roles.map((entry, idx) => (
          <div key={idx} className="settings-card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  className="settings-link-card__icon"
                  style={{
                    backgroundColor: entry.role.includes('Admin')
                      ? 'rgba(234, 179, 8, 0.15)'
                      : entry.role.includes('Clinician')
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'rgba(52, 199, 89, 0.15)',
                    color: entry.role.includes('Admin')
                      ? '#eab308'
                      : entry.role.includes('Clinician')
                      ? '#3b82f6'
                      : '#34c759',
                  }}
                >
                  <ShieldCheck aria-hidden="true" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{entry.role}</h3>
                  <p style={{ margin: '2px 0 0', color: '#9cabc1', fontSize: '0.85rem' }}>
                    Holder: <strong style={{ color: '#e7edf6' }}>{entry.holder}</strong>
                  </p>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: 'rgba(52, 199, 89, 0.15)',
                    color: '#34c759',
                    marginBottom: 4,
                  }}
                >
                  ● VALID CERTIFICATE
                </span>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Fingerprint: <code>{entry.fingerprint}</code>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showIssueModal && (
        <div className="modal-backdrop">
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Issue Role Certificate</h3>
              <button
                className="action-button action-button--secondary action-button--icon"
                onClick={() => setShowIssueModal(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleIssue}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#9cabc1' }}>
                  Target Person / Email
                </label>
                <input
                  className="field-input"
                  onChange={e => setTargetEmail(e.target.value)}
                  placeholder="e.g. clinician@hospital.local"
                  required
                  style={{ width: '100%' }}
                  type="email"
                  value={targetEmail}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#9cabc1' }}>
                  Role & Privileges
                </label>
                <select
                  className="field-input"
                  onChange={e => setSelectedRole(e.target.value)}
                  style={{ width: '100%' }}
                  value={selectedRole}
                >
                  <option value="Clinician / Doctor">Clinician / Doctor (Plan & Execute Cycles)</option>
                  <option value="Admin (Trust Anchor)">Admin (EN 17141 Certification & Key Ceremony)</option>
                  <option value="Facility Operator">Facility Operator (Execute & Maintenance)</option>
                  <option value="Auditor">Auditor (Read-Only Verification)</option>
                  <option value="UVC Lamp Fixture">UVC Lamp Fixture (254nm Emission Device)</option>
                  <option value="Industrial Radiometer">Industrial Radiometer (NIST Dose Sensor)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="action-button action-button--secondary"
                  onClick={() => setShowIssueModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="action-button action-button--primary"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? 'Issuing…' : 'Sign & Issue Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
