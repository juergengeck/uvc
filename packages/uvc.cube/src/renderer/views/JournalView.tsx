import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  Radio,
  ShieldCheck,
} from 'lucide-react';

import type { DiscoveryDeviceSnapshot } from '@shared/contracts';

interface JournalViewProps {
  devices: DiscoveryDeviceSnapshot[];
}

interface DemoJournalEntry {
  date: Date;
  durationMinutes: number;
  id: string;
  location: string;
  resources: string[];
  status: 'completed' | 'planned';
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function atTime(dayOffset: number, hour: number, minute: number): Date {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function resourceNames(devices: DiscoveryDeviceSnapshot[]): string[] {
  const names = devices
    .filter((device) => device.online)
    .map((device) => device.name || device.type || device.id)
    .slice(0, 2);

  return names.length ? names : ['UVC lamp 01', 'ESP32 room sensor'];
}

function createDemoEntries(devices: DiscoveryDeviceSnapshot[]): DemoJournalEntry[] {
  const resources = resourceNames(devices);
  return [
    {
      id: 'demo-treatment-room',
      date: atTime(0, 9, 45),
      durationMinutes: 12,
      location: 'Treatment room 03',
      resources,
      status: 'completed',
    },
    {
      id: 'demo-bathroom',
      date: atTime(0, 7, 20),
      durationMinutes: 8,
      location: 'Bathroom · east wing',
      resources: [resources[0]],
      status: 'completed',
    },
    {
      id: 'demo-operating-room',
      date: atTime(-1, 18, 10),
      durationMinutes: 18,
      location: 'Operating room 01',
      resources,
      status: 'completed',
    },
    {
      id: 'demo-treatment-room-planned',
      date: atTime(1, 16, 30),
      durationMinutes: 12,
      location: 'Treatment room 02',
      resources: [resources[0]],
      status: 'planned',
    },
  ];
}

function CalendarGrid({
  entries,
  month,
  onMonthChange,
  onSelectDate,
  selectedDate,
}: {
  entries: DemoJournalEntry[];
  month: Date;
  onMonthChange: (offset: number) => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}) {
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);
  const entryDates = useMemo(() => new Set(entries.map((entry) => dateKey(entry.date))), [entries]);
  const today = dateKey(new Date());

  return (
    <section className="journal-calendar" aria-label="Disinfection calendar">
      <div className="journal-calendar__header">
        <button aria-label="Previous month" onClick={() => onMonthChange(-1)} type="button">
          <ChevronLeft />
        </button>
        <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button aria-label="Next month" onClick={() => onMonthChange(1)} type="button">
          <ChevronRight />
        </button>
      </div>
      <div className="journal-calendar__weekdays" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="journal-calendar__days">
        {days.map((date) => {
          const key = dateKey(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          return (
            <button
              aria-label={date.toLocaleDateString()}
              aria-pressed={key === dateKey(selectedDate)}
              className={[
                'journal-calendar__day',
                isCurrentMonth ? '' : 'journal-calendar__day--outside',
                key === today ? 'journal-calendar__day--today' : '',
                key === dateKey(selectedDate) ? 'journal-calendar__day--selected' : '',
              ].filter(Boolean).join(' ')}
              key={key}
              onClick={() => onSelectDate(date)}
              type="button"
            >
              <span>{date.getDate()}</span>
              {entryDates.has(key) ? <i aria-label="Has journal entries" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function JournalEntryCard({ entry }: { entry: DemoJournalEntry }) {
  return (
    <article className="journal-entry-card">
      <div className={`journal-entry-card__status journal-entry-card__status--${entry.status}`} aria-hidden="true">
        {entry.status === 'completed' ? <CheckCircle2 /> : <Clock3 />}
      </div>
      <div className="journal-entry-card__body">
        <div className="journal-entry-card__heading">
          <div>
            <h3>{entry.location}</h3>
            <p>{entry.status === 'completed' ? 'Disinfection completed' : 'Disinfection planned'}</p>
          </div>
          <time dateTime={entry.date.toISOString()}>
            {entry.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div className="journal-entry-card__meta">
          <span><Clock3 /> {entry.durationMinutes} min</span>
          <span><Radio /> {entry.resources.join(' · ')}</span>
        </div>
      </div>
    </article>
  );
}

export function JournalView({ devices }: JournalViewProps) {
  const [mode, setMode] = useState<'calendar' | 'journal'>('calendar');
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const entries = useMemo(() => createDemoEntries(devices), [devices]);
  const visibleEntries = mode === 'calendar'
    ? entries.filter((entry) => dateKey(entry.date) === dateKey(selectedDate))
    : entries;

  const changeMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  return (
    <div className="journal-view">
      <header className="journal-hero">
        <div>
          <span className="eyebrow">Disinfection journal</span>
          <h1>Where and when rooms were treated</h1>
          <p>A shared record of room treatments and the lamps and sensors used for each run.</p>
        </div>
        <div className="view-switcher" aria-label="Journal view">
          <button aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')} type="button">
            <CalendarDays /> Calendar
          </button>
          <button aria-pressed={mode === 'journal'} onClick={() => setMode('journal')} type="button">
            <List /> Journal
          </button>
        </div>
      </header>

      <div className="demo-notice" role="note">
        <ShieldCheck aria-hidden="true" />
        <span><strong>Demonstration journal</strong> — sample treatment records show the intended room, time, and resource workflow.</span>
      </div>

      <div className={`journal-workspace journal-workspace--${mode}`}>
        {mode === 'calendar' ? (
          <CalendarGrid
            entries={entries}
            month={month}
            onMonthChange={changeMonth}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
          />
        ) : null}

        <section className="journal-timeline">
          <div className="journal-timeline__header">
            <div>
              <span className="eyebrow">{mode === 'calendar' ? 'Selected day' : 'Recent activity'}</span>
              <h2>{mode === 'calendar'
                ? selectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', weekday: 'long' })
                : 'Disinfection records'}</h2>
            </div>
            <span>{visibleEntries.length} {visibleEntries.length === 1 ? 'record' : 'records'}</span>
          </div>

          {visibleEntries.length ? (
            <div className="journal-entry-list">
              {visibleEntries.map((entry) => <JournalEntryCard entry={entry} key={entry.id} />)}
            </div>
          ) : (
            <div className="journal-empty">
              <MapPin aria-hidden="true" />
              <strong>No treatments recorded</strong>
              <span>Select a marked date to inspect its disinfection record.</span>
            </div>
          )}
        </section>
      </div>

      <section className="resource-strip">
        <div>
          <span className="eyebrow">Resources</span>
          <h2>Lamps and sensors</h2>
          <p>{devices.length ? `${devices.length} discovered device${devices.length === 1 ? '' : 's'}` : 'No live devices discovered; demo resources are shown above.'}</p>
        </div>
        <Link className="action-button" to="/settings/devices">
          <Radio /> Settings · Devices <ChevronRight />
        </Link>
      </section>
    </div>
  );
}
