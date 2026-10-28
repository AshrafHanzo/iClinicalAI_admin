// Shared building blocks for the DESIGN workspace capabilities.
import { useState } from 'react';
import { downloadDesignFile, getSourceBlock } from '../../services/designApi';

const STATUS_TONE = {
  completed: 'success', verified: 'success', approved: 'success', accepted: 'success', resolved: 'success', extracted: 'success', high: 'success',
  reviewed: 'info', in_review: 'info', corrected: 'info', answered: 'info', medium: 'warning',
  not_requested: 'info', unclassified: 'warning', consistent: 'success', not_found: 'warning',
  timepoint_mismatch: 'error', priority_mismatch: 'warning', contradictory: 'error',
  queued: 'warning', extracting: 'warning', structuring: 'warning', saving: 'warning', draft: 'warning', pending: 'warning',
  pending_review: 'warning', unverified: 'warning', open: 'warning', potential: 'warning', ambiguous: 'warning', low_confidence: 'warning',
  failed: 'error', conflict: 'error', missing: 'error', rejected: 'error', confirmed: 'error', low: 'error',
};

export function StatusPill({ value, label }) {
  if (!value) return null;
  return <span className={`status-badge ${STATUS_TONE[value] || 'info'} ds-pill`}>{label || String(value).replace(/_/g, ' ')}</span>;
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner">
      <span style={{ flex: 1 }}>{error}</span>
      {onDismiss && <button className="btn btn-sm btn-secondary" onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="loading-spinner"><div className="spinner" /><span>{text}</span></div>;
}

export function EmptyState({ title, text, children }) {
  return (
    <div className="analysis-placeholder ds-empty">
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ds-card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <h3>{title}</h3>
          {actions && <div className="ds-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function refText(ev) {
  return [ev.page ? `p. ${ev.page}` : null, ev.section ? `§ ${ev.section}` : null].filter(Boolean).join(' · ') || ev.block_id;
}

// Source citations with an expandable view of the cited passage in context.
export function EvidenceList({ versionId, evidence = [], compact = false }) {
  const [open, setOpen] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [err, setErr] = useState('');
  if (!evidence.length) return <span className="ds-muted">No source evidence</span>;

  const toggle = async (ev, i) => {
    if (open === i) { setOpen(null); return; }
    setOpen(i); setCtx(null); setErr('');
    if (!ev.block_id || ev.verified === false) return;
    try { setCtx(await getSourceBlock(versionId, ev.block_id)); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="ds-evidence">
      {evidence.slice(0, compact ? 2 : 8).map((ev, i) => (
        <div key={i}>
          <button type="button" className={`ds-cite ${ev.verified === false ? 'bad' : ''}`} onClick={() => toggle(ev, i)}
            title={ev.verified === false ? 'This citation could not be found in the source document' : 'Show source passage'}>
            {refText(ev)}{ev.verified === false ? ' — not found in source' : ''}
          </button>
          {open === i && (
            <div className="ds-source">
              {ev.quote && <blockquote>“{ev.quote}”</blockquote>}
              {err && <div className="ds-muted">{err}</div>}
              {ctx && (
                <div className="ds-context">
                  {ctx.before.map(b => <p key={b.id} className="dim">{b.text}</p>)}
                  <p className="hit">{ctx.block.text}</p>
                  {ctx.after.map(b => <p key={b.id} className="dim">{b.text}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ExportMenu({ formats, path, onError }) {
  const [busy, setBusy] = useState('');
  const run = async (fmt) => {
    setBusy(fmt);
    try { await downloadDesignFile(typeof path === 'function' ? path(fmt) : `${path}${path.includes('?') ? '&' : '?'}format=${fmt}`); }
    catch (e) { onError?.(e.message); }
    finally { setBusy(''); }
  };
  return (
    <div className="ds-export">
      {formats.map(f => (
        <button key={f} type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run(f)}>
          {busy === f ? 'Exporting…' : `Export ${f.toUpperCase()}`}
        </button>
      ))}
    </div>
  );
}

export function RevisionHistory({ history = [] }) {
  const [open, setOpen] = useState(false);
  if (!history.length) return null;
  return (
    <div className="ds-history">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} revision history ({history.length})
      </button>
      {open && (
        <table className="dash-table ds-table">
          <thead><tr><th>Rev</th><th>Status</th><th>Change</th><th>By</th><th>When</th></tr></thead>
          <tbody>
            {[...history].reverse().map(h => (
              <tr key={h.id}>
                <td>{h.revision}</td><td><StatusPill value={h.status} /></td>
                <td>{h.note || '—'}</td><td>{h.created_by}</td><td className="nowrap">{new Date(h.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const ROLE_RANK = { viewer: 1, editor: 2, reviewer: 3, owner: 4 };
export const can = (role, needed) => (ROLE_RANK[role] || 0) >= ROLE_RANK[needed];

// Draft → reviewed → approved controls shared by reviewable outputs.
export function ReviewStatusBar({ artifact, role, onChange, busy }) {
  if (!artifact) return null;
  const s = artifact.status;
  return (
    <div className="ds-statusbar">
      <span>Status:</span> <StatusPill value={s} />
      <span className="ds-muted">revision {artifact.revision}</span>
      <div className="ds-actions">
        {s !== 'draft' && can(role, 'editor') && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onChange('draft')}>Return to draft</button>}
        {s === 'draft' && can(role, 'reviewer') && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onChange('reviewed')}>Mark reviewed</button>}
        {s !== 'approved' && can(role, 'reviewer') && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onChange('approved')}>Approve</button>}
      </div>
    </div>
  );
}

export function NeedsVersion({ title }) {
  return <EmptyState title={title} text="Select or create a study and register a protocol version in Protocol Intelligence to use this capability." />;
}

export function NeedsProcessing({ version }) {
  if (!version || version.processing_status === 'completed') return null;
  return (
    <EmptyState
      title={version.processing_status === 'failed' ? 'Protocol processing failed' : 'Protocol is still being processed'}
      text={version.processing_message || ''}
    />
  );
}

// ─── Page frame shared by all DESIGN steps (same layout as the original DESIGN module pages) ───

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Four-step progress bar. `current` is the active step; steps before it show as done. `complete` marks all done.
export function WorkflowSteps({ labels, current, complete = false }) {
  return (
    <div className="workflow-steps">
      {labels.map((label, i) => {
        const num = i + 1;
        const done = complete || current > num;
        return (
          <div key={num} className={`workflow-step ${!complete && current === num ? 'active' : ''} ${done ? 'done' : ''}`}>
            <div className="step-num">{done ? '✓' : num}</div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Row of four count cards: the document card first, then three step-specific counts.
export function StatRow({ version, items }) {
  const cards = [
    {
      label: 'Document',
      value: version?.filename || 'No protocol selected',
      desc: version ? `${(version.file_type || '').replace('.', '').toUpperCase()}${version.file_size ? ' • ' + formatSize(version.file_size) : ''} • ${version.label}` : 'Select a study and version',
      small: true,
    },
    ...items,
  ];
  return (
    <div className="stat-row">
      {cards.map(c => (
        <div key={c.label} className="stat-card">
          <div className="stat-label">{c.label}</div>
          <div className="stat-value" style={c.small ? { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : c.badge ? { fontSize: 16 } : undefined}
            title={typeof c.value === 'string' ? c.value : undefined}>
            {c.badge ? <span className={`status-badge ${c.badge}`}>{c.value}</span> : c.value}
          </div>
          {c.desc && <div className="stat-desc">{c.desc}</div>}
        </div>
      ))}
    </div>
  );
}

const STATUS_BADGE = { draft: ['📝 Draft', 'warning'], reviewed: ['✓ Reviewed', 'info'], approved: ['✓ Approved', 'success'] };

// Status card for a reviewable output: Not run / Draft / Reviewed / Approved.
export function statusCard(artifact, emptyText = 'Not run yet', desc) {
  if (!artifact) return { label: 'Status', value: '⏳ Pending', badge: 'warning', desc: emptyText };
  const [text, tone] = STATUS_BADGE[artifact.status] || [artifact.status, 'info'];
  return { label: 'Status', value: text, badge: tone, desc: desc || `Revision ${artifact.revision}` };
}
