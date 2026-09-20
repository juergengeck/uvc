import React, { useState } from 'react';
import { Building2, Plus, Radio, ShieldCheck, Sparkles } from 'lucide-react';

export interface RoomItem {
  roomId: string;
  name: string;
  roomKind: string;
  targetDoseJm2: number;
  assignedDevices: string[];
}

const DEFAULT_ROOMS: RoomItem[] = [
  {
    roomId: 'room-101',
    name: 'Room 101 · Patient Suite',
    roomKind: 'Treatment Room',
    targetDoseJm2: 250,
    assignedDevices: ['ESP32 Wall Emitter #1', 'Radiometer Sensor #1'],
  },
  {
    roomId: 'room-or-4',
    name: 'OR 4 · Surgical Suite',
    roomKind: 'Operating Room (ISO 7)',
    targetDoseJm2: 400,
    assignedDevices: ['Groov RIO Overhead Tube #1', 'Groov RIO Overhead Tube #2', 'Industrial NIST Radiometer'],
  },
  {
    roomId: 'room-clean-b',
    name: 'Cleanroom B · Decontamination',
    roomKind: 'Cleanroom (ISO 5)',
    targetDoseJm2: 500,
    assignedDevices: ['Quartz 254nm Mobile Tower', 'Precision NIST Radiometer'],
  },
];

export function RoomsView() {
  const [rooms, setRooms] = useState<RoomItem[]>(DEFAULT_ROOMS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomKind, setNewRoomKind] = useState('Operating Room');
  const [newRoomDose, setNewRoomDose] = useState('400');

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const newRoom: RoomItem = {
      roomId: `room-${Date.now()}`,
      name: newRoomName.trim(),
      roomKind: newRoomKind,
      targetDoseJm2: Number(newRoomDose) || 400,
      assignedDevices: [],
    };
    setRooms(prev => [...prev, newRoom]);
    setNewRoomName('');
    setShowAddModal(false);
  };

  return (
    <div className="rooms-view" style={{ maxWidth: 1040, margin: '0 auto' }}>
      <header className="settings-hero">
        <span className="eyebrow">Facility & Cleanrooms</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Controlled Environments</h1>
            <p>Define decontamination rooms, target biocontamination doses, and assigned UVC resources.</p>
          </div>
          <button
            className="action-button action-button--primary"
            onClick={() => setShowAddModal(true)}
            type="button"
          >
            <Plus aria-hidden="true" />
            Add Room
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 24 }}>
        {rooms.map(r => (
          <div key={r.roomId} className="settings-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div className="settings-link-card__icon" style={{ width: 36, height: 36 }}>
                <Building2 aria-hidden="true" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{r.name}</h3>
                <span style={{ fontSize: '0.8rem', color: '#9cabc1' }}>{r.roomKind}</span>
              </div>
            </div>

            <div style={{ margin: '14px 0', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                <span style={{ color: '#9cabc1' }}>EN 17141 Target Dose:</span>
                <strong style={{ color: '#34c759' }}>{r.targetDoseJm2} J/m²</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: '#9cabc1' }}>Spectrum:</span>
                <span>254nm Germicidal</span>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#9cabc1' }}>
              <strong>Assigned Resources:</strong>
              {r.assignedDevices.length > 0 ? (
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {r.assignedDevices.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: '4px 0 0 0', fontStyle: 'italic' }}>No fixtures mapped yet</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Add Controlled Environment</h3>
              <button
                className="action-button action-button--secondary action-button--icon"
                onClick={() => setShowAddModal(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddRoom}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#9cabc1' }}>
                  Room Name / Identifier
                </label>
                <input
                  className="field-input"
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="e.g. OR 5 Surgical Suite"
                  required
                  style={{ width: '100%' }}
                  value={newRoomName}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#9cabc1' }}>
                  Classification
                </label>
                <select
                  className="field-input"
                  onChange={e => setNewRoomKind(e.target.value)}
                  style={{ width: '100%' }}
                  value={newRoomKind}
                >
                  <option value="Operating Room (ISO 7)">Operating Room (ISO 7)</option>
                  <option value="Cleanroom (ISO 5)">Cleanroom (ISO 5)</option>
                  <option value="Treatment Room">Treatment Room</option>
                  <option value="Isolation Ward">Isolation Ward</option>
                  <option value="Laboratory (BSL-2)">Laboratory (BSL-2)</option>
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#9cabc1' }}>
                  Target Disinfection Dose (J/m²)
                </label>
                <input
                  className="field-input"
                  min="50"
                  onChange={e => setNewRoomDose(e.target.value)}
                  step="50"
                  style={{ width: '100%' }}
                  type="number"
                  value={newRoomDose}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="action-button action-button--secondary"
                  onClick={() => setShowAddModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="action-button action-button--primary" type="submit">
                  Save Environment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
