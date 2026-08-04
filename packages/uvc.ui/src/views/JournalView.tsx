import { Link } from '@tanstack/react-router';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  Radio,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { journalDateKey, projectJournalRecords, type UvcJournalEntry } from '../journal.js';
import type { UvcCycleRecord } from '../types.js';

function CalendarGrid({
  entries,
  month,
  onMonthChange,
  onSelectDate,
  selectedDate,
}: {
  entries: UvcJournalEntry[];
  month: Date;
  onMonthChange(offset: number): void;
  onSelectDate(date: Date): void;
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
  const entryDates = useMemo(() => new Set(entries.map(entry => journalDateKey(entry.date))), [entries]);
  const today = journalDateKey(new Date());

  return (
    <section className="journal-calendar" aria-label="UVC cycle calendar">
      <div className="journal-calendar__header">
        <button aria-label="Previous month" onClick={() => onMonthChange(-1)} type="button"><ChevronLeft /></button>
        <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button aria-label="Next month" onClick={() => onMonthChange(1)} type="button"><ChevronRight /></button>
      </div>
      <div className="journal-calendar__weekdays" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="journal-calendar__days">
        {days.map(date => {
          const key = journalDateKey(date);
          return (
            <button
              aria-label={date.toLocaleDateString()}
              aria-pressed={key === journalDateKey(selectedDate)}
              className={[
                'journal-calendar__day',
                date.getMonth() === month.getMonth() ? '' : 'journal-calendar__day--outside',
                key === today ? 'journal-calendar__day--today' : '',
                key === journalDateKey(selectedDate) ? 'journal-calendar__day--selected' : '',
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

function JournalEntryCard({ entry }: { entry: UvcJournalEntry }) {
  const stateLabel = {
    completed: 'UVC cycle executed',
    planned: 'UVC cycle planned',
    running: 'UVC cycle in progress',
    failed: 'UVC cycle failed',
  }[entry.status];

  return (
    <article className="journal-entry-card">
      <div className={`journal-entry-card__status journal-entry-card__status--${entry.status}`} aria-hidden="true">
        {entry.status === 'completed' ? <CheckCircle2 /> : <Clock3 />}
      </div>
      <div className="journal-entry-card__body">
        <div className="journal-entry-card__heading">
          <div><h3>{entry.location}</h3><p>{stateLabel}</p></div>
          <time dateTime={entry.date.toISOString()}>
            {entry.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div className="journal-entry-card__meta">
          {entry.durationMinutes !== undefined ? <span><Clock3 /> {entry.durationMinutes} min</span> : null}
          {entry.evidenceCount ? <span><ShieldCheck /> {entry.evidenceCount} verified device readbacks</span> : null}
          {entry.resources.length ? <span><Radio /> {entry.resources.join(' · ')}</span> : null}
        </div>
      </div>
    </article>
  );
}

export function JournalView({
  deviceCount,
  loadRecords,
}: {
  deviceCount: number;
  loadRecords(): Promise<UvcCycleRecord[]>;
}) {
  const [mode, setMode] = useState<'calendar' | 'journal'>('calendar');
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [records, setRecords] = useState<UvcCycleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await loadRecords());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [loadRecords]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entries = useMemo(() => projectJournalRecords(records), [records]);
  const visibleEntries = mode === 'calendar'
    ? entries.filter(entry => journalDateKey(entry.date) === journalDateKey(selectedDate))
    : entries;

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
          <span className="eyebrow">UVC cycle journal</span>
          <h1>Where and when rooms were treated</h1>
          <p>Room treatments and the lamps, sensors, and evidence used for each run.</p>
        </div>
        <div className="journal-actions">
          <button className="action-button" disabled={loading} onClick={() => void refresh()} type="button">
            <RefreshCw className={loading ? 'spin' : ''} /> Refresh
          </button>
          <div className="view-switcher" aria-label="Journal view">
            <button aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')} type="button"><CalendarDays /> Calendar</button>
            <button aria-pressed={mode === 'journal'} onClick={() => setMode('journal')} type="button"><List /> Journal</button>
          </div>
        </div>
      </header>

      {error ? <pre className="error-block">{error}</pre> : null}

      <div className={`journal-workspace journal-workspace--${mode}`}>
        {mode === 'calendar' ? (
          <CalendarGrid
            entries={entries}
            month={month}
            onMonthChange={offset => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
          />
        ) : null}

        <section className="journal-timeline">
          <div className="journal-timeline__header">
            <div>
              <span className="eyebrow">{mode === 'calendar' ? 'Selected day' : 'All activity'}</span>
              <h2>{mode === 'calendar'
                ? selectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', weekday: 'long' })
                : 'UVC cycle records'}</h2>
            </div>
            <span>{visibleEntries.length} {visibleEntries.length === 1 ? 'record' : 'records'}</span>
          </div>

          {visibleEntries.length ? (
            <div className="journal-entry-list">
              {visibleEntries.map(entry => <JournalEntryCard entry={entry} key={entry.id} />)}
            </div>
          ) : (
            <div className="journal-empty">
              <MapPin aria-hidden="true" />
              <strong>{loading ? 'Loading UVC cycle records…' : 'No UVC cycles documented'}</strong>
              <span>{mode === 'calendar'
                ? 'No run is recorded for this date.'
                : 'Completed room treatments will appear here when their run records are stored.'}</span>
            </div>
          )}
        </section>
      </div>

      <section className="resource-strip">
        <div>
          <span className="eyebrow">Resources</span>
          <h2>Lamps and sensors</h2>
          <p>{deviceCount} discovered {deviceCount === 1 ? 'device' : 'devices'}</p>
        </div>
        <Link className="action-button" to="/settings/devices"><Radio /> Settings · Devices <ChevronRight /></Link>
      </section>
    </div>
  );
}
