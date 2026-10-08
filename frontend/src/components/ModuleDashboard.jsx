// Shared pieces for the per-module dashboards ("Welcome to <Module>").
// Everything here works on data the modules already load (document list, saved results, trials).
import { useState } from 'react';

export function DashboardHeader({ title, subtitle, children }) {
  return (
    <div className="dash-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="dash-header-actions">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, children, flush = false, className = '' }) {
  return (
    <section className={`dash-panel ${className}`}>
      {(title || action) && (
        <div className="dash-panel-head">
          <h3>{title}</h3>
          {action && <button type="button" className="link-btn" onClick={action.onClick}>{action.label} →</button>}
        </div>
      )}
      <div className={flush ? '' : 'dash-panel-body'}>{children}</div>
    </section>
  );
}

// Row of count cards.
export function StatGrid({ items }) {
  return (
    <div className="stat-grid">
      {items.map((item, i) => (
        <div key={item.label} className={`stat-tile tone-${item.tone || (i % 6) + 1}`}>
          <div className="stat-tile-label">{item.label}</div>
          <div className="stat-tile-value">{item.value}</div>
          {item.sub && <div className="stat-tile-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// One card per existing feature of the module; a tick marks steps that already have results.
export function FeatureCards({ features, doneIds = [], onOpen }) {
  return (
    <div className="feature-grid">
      {features.map((f, i) => (
        <button key={f.id} type="button" className={`feature-card tone-${(i % 6) + 1}`} onClick={() => onOpen(f.id)}>
          <span className="feature-title">{f.label}</span>
          {f.desc && <span className="feature-desc">{f.desc}</span>}
          <span className="feature-foot">
            {doneIds.includes(f.id) ? <span className="feature-done">✓ Completed</span> : <span />}
            <span className="feature-arrow">→</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Progress status of a document for a module, from the results saved on it.
export function docProgress(doc, stepKeys) {
  const done = stepKeys.filter(k => doc.analysis_results?.[k]).length;
  const status = done === 0 ? 'not_started' : done === stepKeys.length ? 'completed' : 'in_progress';
  return { done, status };
}

// Counts of documents per progress status.
export function progressCounts(docs, stepKeys) {
  const counts = { completed: 0, in_progress: 0, not_started: 0, stepsDone: 0 };
  docs.forEach(d => {
    const { done, status } = docProgress(d, stepKeys);
    counts[status] += 1;
    counts.stepsDone += done;
  });
  return counts;
}

const STATUS_LABEL = { completed: 'Completed', in_progress: 'In Progress', not_started: 'Not Started' };
const STATUS_CLASS = { completed: 'success', in_progress: 'info', not_started: 'warning' };

const formatSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Uploaded documents with search, status and file-type filters.
export function DocumentTable({ docs, stepKeys, activeIds = [], onOpen, openLabel = 'Open', emptyText }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');

  const types = [...new Set(docs.map(d => d.file_type).filter(Boolean))].sort();
  const rows = [...docs]
    .sort((a, b) => (b.upload_time || '').localeCompare(a.upload_time || ''))
    .filter(d => !query || d.filename.toLowerCase().includes(query.toLowerCase()))
    .filter(d => type === 'all' || d.file_type === type)
    .filter(d => status === 'all' || docProgress(d, stepKeys).status === status);

  return (
    <>
      <div className="dash-toolbar">
        <input
          className="dash-search"
          type="search"
          placeholder="Search documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="dash-filter" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In Progress</option>
          <option value="not_started">Not Started</option>
        </select>
        <select className="dash-filter" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by file type">
          <option value="all">All file types</option>
          {types.map(t => <option key={t} value={t}>{t.replace('.', '').toUpperCase()}</option>)}
        </select>
        <span className="dash-count">Showing {rows.length} of {docs.length}</span>
      </div>

      {!docs.length ? (
        <div className="dash-empty">{emptyText}</div>
      ) : !rows.length ? (
        <div className="dash-empty">No documents match your search or filters.</div>
      ) : (
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr><th>Document</th><th>Type</th><th>Size</th><th>Words</th><th>Uploaded</th><th>Progress</th><th>Status</th><th className="right">Action</th></tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const { done, status: st } = docProgress(d, stepKeys);
                const active = activeIds.includes(d.id);
                return (
                  <tr key={d.id} className={active ? 'selected' : ''}>
                    <td className="row-title">{d.filename}</td>
                    <td className="nowrap">{d.file_type?.replace('.', '').toUpperCase()}</td>
                    <td className="nowrap">{formatSize(d.file_size)}</td>
                    <td className="nowrap">{d.word_count?.toLocaleString() ?? '—'}</td>
                    <td className="nowrap">{d.upload_time ? new Date(d.upload_time).toLocaleDateString() : '—'}</td>
                    <td className="nowrap">
                      <div className="progress-cell">
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${(done / stepKeys.length) * 100}%` }} /></div>
                        <span>{done}/{stepKeys.length}</span>
                      </div>
                    </td>
                    <td className="nowrap"><span className={`status-badge ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</span></td>
                    <td className="right">
                      {active
                        ? <span className="active-tag">Active</span>
                        : <button type="button" className="link-btn" onClick={() => onOpen(d)}>{openLabel}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// How many documents have each step's saved result; click a row to open that step.
export function StepCoverage({ steps, docs, onOpen }) {
  const total = docs.length;
  return (
    <div className="coverage-list">
      {steps.map(s => {
        const n = docs.filter(d => d.analysis_results?.[s.key]).length;
        return (
          <button key={s.id} type="button" className="coverage-row" onClick={() => onOpen(s.id)}>
            <span className="coverage-label">{s.label}</span>
            <span className="progress-track"><span className="progress-fill" style={{ width: total ? `${(n / total) * 100}%` : 0 }} /></span>
            <span className="coverage-count">{n}/{total}</span>
          </button>
        );
      })}
    </div>
  );
}

// Count values of a field across items, most common first.
export function countBy(items, getValues) {
  const counts = {};
  items.forEach(item => {
    [].concat(getValues(item) || []).forEach(v => {
      if (v && v !== 'N/A') counts[v] = (counts[v] || 0) + 1;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// Horizontal bar breakdown for a list of [label, count] pairs.
export function Breakdown({ entries, total, limit = 6 }) {
  if (!entries.length) return <div className="dash-empty">No data yet.</div>;
  return (
    <div className="coverage-list">
      {entries.slice(0, limit).map(([label, n]) => (
        <div key={label} className="coverage-row static">
          <span className="coverage-label">{label}</span>
          <span className="progress-track"><span className="progress-fill" style={{ width: total ? `${(n / total) * 100}%` : 0 }} /></span>
          <span className="coverage-count">{n}</span>
        </div>
      ))}
    </div>
  );
}
