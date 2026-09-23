import { Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, Download, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadDataWorkbook } from '../data-export.js';
import type { UvcMemory, UvcMemorySummary, UvcPlatform } from '../types.js';

export function DataView({ platform }: { platform: UvcPlatform }) {
  const [memories, setMemories] = useState<UvcMemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UvcMemory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setMemories(await platform.listMemories()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [platform]);
  useEffect(() => { void reload(); return () => { detailRequest.current++; }; }, [reload]);

  const openMemory = async (id: string) => {
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setSelected(null);
    setError(null);
    try {
      const memory = await platform.getMemory(id);
      if (request === detailRequest.current) setSelected(memory);
    } catch (cause) {
      if (request === detailRequest.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (request === detailRequest.current) setDetailLoading(false); }
  };

  const exportData = async () => {
    setExporting(true);
    setError(null);
    setStatus(null);
    try {
      const [records, runtime, entries] = await Promise.all([
        platform.listJournalRecords(), platform.getDiscoveryRuntime(), platform.listMemories(),
      ]);
      const memoryDocuments: UvcMemory[] = [];
      // Read sequentially to avoid overwhelming the local object store for large libraries.
      for (const entry of entries) memoryDocuments.push(await platform.getMemory(entry.id));
      downloadDataWorkbook({ exportedAt: new Date().toISOString(), records, devices: runtime.devices, memories: memoryDocuments });
      setStatus('Excel workbook prepared.');
    } catch (cause) { setError(`Export failed: ${cause instanceof Error ? cause.message : String(cause)}`); }
    finally { setExporting(false); }
  };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = memories.filter(memory => `${memory.title} ${memory.summary ?? ''}`.toLocaleLowerCase().includes(normalizedQuery));

  return (
    <div className="settings-home data-view">
      <header className="settings-hero">
        <Link className="data-back" to="/settings"><ArrowLeft aria-hidden="true" /> Settings</Link>
        <h1>Data &amp; Memory</h1>
        <p>Export your records and browse the memories saved to this identity.</p>
      </header>
      <section className="settings-card" aria-labelledby="data-export-heading">
        <div className="settings-card__header">
          <div><h2 id="data-export-heading">Export data</h2><p>An Excel workbook with separate sheets for the journal, devices, and memories.</p></div>
          <button className="action-button action-button--primary" type="button" disabled={exporting} onClick={() => void exportData()}>
            <Download aria-hidden="true" />{exporting ? 'Preparing workbook…' : 'Export Excel (.xlsx)'}
          </button>
        </div>
        <p className="data-help">Includes records available to this instance. Passwords and private keys are excluded.</p>
        {status && <p role="status">{status}</p>}
      </section>
      {error && <div className="error-block" role="alert">{error}</div>}
      <section className="settings-group" aria-labelledby="memory-heading">
        <div className="settings-group__header">
          <div><h2 id="memory-heading">Memory</h2><p>Saved knowledge, summaries, and their source references.</p></div>
          <button className="action-button action-button--secondary" type="button" disabled={loading} onClick={() => void reload()}>
            <RefreshCw aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <label className="memory-search"><Search aria-hidden="true" /><input className="field-input" aria-label="Search memories" placeholder="Search memories" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="memory-layout">
          <div className="memory-list" aria-busy={loading}>
            {loading ? <p className="data-empty" role="status">Loading memories…</p> : filtered.length ? filtered.map(memory => (
              <button className={`memory-item ${selected?.id === memory.id ? 'memory-item--selected' : ''}`} key={memory.id} onClick={() => void openMemory(memory.id)} type="button">
                <BookOpen aria-hidden="true" /><span><strong>{memory.title}</strong>{memory.summary && <span>{memory.summary}</span>}<small>{new Date(memory.timestamp).toLocaleDateString()} · {memory.factsCount} facts · {memory.entitiesCount} entities</small></span>
              </button>
            )) : <div className="data-empty"><BookOpen aria-hidden="true" /><h3>{query ? 'No matching memories' : 'No memories yet'}</h3><p>{query ? 'Try another title or summary.' : 'Memories saved to this identity will appear here.'}</p></div>}
          </div>
          {(selected || detailLoading) && <article className="settings-card memory-detail" aria-busy={detailLoading}>
            {detailLoading ? <p role="status">Opening memory…</p> : selected && <>
              <div className="settings-card__header"><h3>{selected.title}</h3><button className="action-button action-button--ghost" aria-label="Close memory" type="button" onClick={() => { detailRequest.current++; setSelected(null); }}><X aria-hidden="true" /></button></div>
              {selected.summary && <p>{selected.summary}</p>}
              <div className="memory-prose">{selected.prose}</div>
              {selected.facts.length > 0 && <><h4>Facts</h4><ul>{selected.facts.map((fact, index) => <li key={index}>{fact.statement}</li>)}</ul></>}
              {selected.entities.length > 0 && <><h4>Entities</h4><ul>{selected.entities.map((entity, index) => <li key={index}>{entity.name} · {entity.type}</li>)}</ul></>}
              <details><summary>Source details</summary><dl><dt>Author</dt><dd>{selected.author}</dd><dt>Memory ID</dt><dd>{selected.id}</dd></dl>{selected.sourceSubjects.length ? <ul>{selected.sourceSubjects.map(id => <li key={id}>{id}</li>)}</ul> : <p>No source subjects recorded.</p>}</details>
            </>}
          </article>}
        </div>
      </section>
    </div>
  );
}
