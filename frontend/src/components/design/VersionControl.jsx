// Feature 11 — Protocol Version Control: version history, registration, side-by-side comparison and change review.
import { useEffect, useMemo, useState } from 'react';
import { compareVersions, generateDesignReport, listComparisons, reviewChange } from '../../services/designApi';
import { RegisterVersionForm } from './ProtocolIntelligence';
import { Card, EmptyState, ErrorBanner, Loading, RevisionHistory, StatusPill, can, refText , statusCard } from './DesignUi';

function WordDiff({ segs, side }) {
  return (
    <span>
      {segs.filter(s => s.op === 'equal' || (side === 'old' ? s.op === 'delete' : s.op === 'insert')).map((s, i) => (
        <span key={i} className={s.op === 'equal' ? '' : side === 'old' ? 'ds-del' : 'ds-ins'}>{s.text} </span>
      ))}
    </span>
  );
}

function ChangeCard({ c, role, onReview, busy }) {
  const [comment, setComment] = useState('');
  const [action, setAction] = useState({ description: '', assignee: '', due: '' });
  return (
    <div className={`ds-item ds-change ${c.type}`}>
      <div className="ds-item-head">
        <b>{c.id}</b> <span className={`ds-tag ${c.type === 'added' ? 'ok' : c.type === 'removed' ? 'bad' : 'warn'}`}>{c.type}</span>
        {!c.substantive && <span className="ds-tag">formatting only</span>}
        <span className="ds-muted">{c.section_new || c.section_old}</span>
        <StatusPill value={c.review.status} />
      </div>
      <div className="ds-sbs">
        <div>
          <div className="ds-sbs-head">Previous{c.old ? ` · ${refText(c.old)}` : ''}</div>
          {c.old ? (c.word_diff ? <WordDiff segs={c.word_diff} side="old" /> : <span className="ds-del">{c.old.text}</span>) : <span className="ds-muted">—</span>}
        </div>
        <div>
          <div className="ds-sbs-head">New{c.new ? ` · ${refText(c.new)}` : ''}</div>
          {c.new ? (c.word_diff ? <WordDiff segs={c.word_diff} side="new" /> : <span className="ds-ins">{c.new.text}</span>) : <span className="ds-muted">—</span>}
        </div>
      </div>
      {c.table_diff && (c.table_diff.rows_added.length > 0 || c.table_diff.rows_removed.length > 0) && (
        <div className="ds-small">
          {c.table_diff.rows_removed.map((r, i) => <div key={`r${i}`} className="ds-del">− {r}</div>)}
          {c.table_diff.rows_added.map((r, i) => <div key={`a${i}`} className="ds-ins">+ {r}</div>)}
        </div>
      )}
      {c.impacts.length > 0 && (
        <div className="ds-impacts">Potential impact (for review): {c.impacts.map(i => <span key={i.area} className="ds-tag warn">{i.label}</span>)}</div>
      )}
      {c.comments.map((x, i) => <div key={i} className="ds-comment">{x.by}: {x.text}</div>)}
      {c.actions.map((x, i) => <div key={i} className="ds-comment">Follow-up: {x.description}{x.assignee ? ` → ${x.assignee}` : ''}{x.due ? ` (due ${x.due})` : ''}</div>)}
      {c.review.by && <div className="ds-muted ds-small">{c.review.status} by {c.review.by}{c.review.comment ? ` — “${c.review.comment}”` : ''}</div>}
      {can(role, 'editor') && (
        <div className="ds-review-controls">
          <div className="ds-inline">
            <input className="form-control" placeholder="Comment" value={comment} onChange={e => setComment(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={busy || !comment} onClick={() => onReview(c.id, { action: 'comment', comment }).then(() => setComment(''))}>Annotate</button>
            {can(role, 'reviewer') && <>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onReview(c.id, { action: 'reject', comment })}>Reject</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onReview(c.id, { action: 'accept', comment })}>Accept</button>
            </>}
          </div>
          <div className="ds-inline">
            <input className="form-control" placeholder="Follow-up action" value={action.description} onChange={e => setAction({ ...action, description: e.target.value })} />
            <input className="form-control" placeholder="Assignee" value={action.assignee} onChange={e => setAction({ ...action, assignee: e.target.value })} />
            <input className="form-control" type="date" value={action.due} onChange={e => setAction({ ...action, due: e.target.value })} />
            <button className="btn btn-secondary btn-sm" disabled={busy || !action.description}
              onClick={() => onReview(c.id, { action: 'add_action', action_item: action }).then(() => setAction({ description: '', assignee: '', due: '' }))}>Add action</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VersionControl({ study, version, role, legacyDocs, onRegistered, onSummary }) {
  const [comparisons, setComparisons] = useState([]);
  const [active, setActive] = useState(null);
  const [baseId, setBaseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(null);
  const [filter, setFilter] = useState('substantive');
  const [area, setArea] = useState('all');
  const [showRegister, setShowRegister] = useState(false);

  const versions = study?.versions || [];
  useEffect(() => {
    const pending = active ? active.data.changes.filter(c => c.substantive && c.review.status === 'pending').length : 0;
    onSummary?.({
      has: !!active, running: busy, approved: active?.status === 'approved', reviewed: active?.status === 'reviewed',
      items: [
        { label: 'Versions', value: versions.length, desc: 'registered, never overwritten' },
        { label: 'Comparisons', value: comparisons.length, desc: active ? `${pending} changes pending review` : 'for this version' },
        statusCard(active, versions.length > 1 ? 'Compare versions to start' : 'Register an amendment to compare'),
      ],
    });
  }, [active, comparisons, busy, versions.length]);
  useEffect(() => {
    setComparisons([]); setActive(null); setUncertain(null);
    if (!version) return;
    const prev = versions.filter(v => v.sequence < version.sequence).pop();
    setBaseId(prev?.id || '');
    listComparisons(version.id).then(r => { setComparisons(r.comparisons); setActive(r.comparisons[0] || null); }).catch(e => setError(e.message));
  }, [version?.id]);

  const changes = useMemo(() => {
    if (!active) return [];
    return active.data.changes
      .filter(c => filter === 'all' || (filter === 'substantive' ? c.substantive : filter === 'pending' ? c.review.status === 'pending' : !c.substantive))
      .filter(c => area === 'all' || c.impacts.some(i => i.area === area));
  }, [active, filter, area]);

  if (!study) return <EmptyState title="Create or select a study" />;

  const run = async (confirm = false) => {
    setBusy(true); setError(''); setUncertain(null);
    try {
      const a = await compareVersions(version.id, baseId, confirm);
      setComparisons(prev => [a, ...prev]); setActive(a);
    } catch (e) {
      if (e.status === 409 && e.detail?.match) setUncertain(e.detail); else setError(e.message);
    } finally { setBusy(false); }
  };
  const review = async (changeId, body) => {
    setBusy(true); setError('');
    try {
      const a = await reviewChange(study.id, active.id, changeId, body);
      setActive(a); setComparisons(prev => prev.map(x => x.lineage_id === a.lineage_id ? a : x));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const impactReport = async () => {
    try {
      const r = await generateDesignReport(version.id, { report_type: 'amendment_impact', artifact_ids: [active.id] });
      setError('');
      window.alert(`Amendment impact report generated (revision ${r.revision}). Open “Design Reports & AI Assistant” to review and export it.`);
    } catch (e) { setError(e.message); }
  };

  const d = active?.data;
  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <Card title="Version history" actions={can(role, 'editor') && <button className="btn btn-secondary btn-sm" onClick={() => setShowRegister(!showRegister)}>{showRegister ? 'Close' : '+ Register new version'}</button>}>
        {showRegister && <RegisterVersionForm study={study} legacyDocs={legacyDocs} onRegistered={(v) => { setShowRegister(false); onRegistered(v); }} title="Register a new protocol version or amendment" />}
        {!versions.length ? <EmptyState title="No versions registered" /> : (
          <div className="table-scroll"><table className="dash-table ds-table">
            <thead><tr><th>#</th><th>Version</th><th>Amendment</th><th>Effective</th><th>Reason</th><th>Document</th><th>Checksum</th><th>Processing</th><th>Review</th><th>Registered</th></tr></thead>
            <tbody>{versions.map(v => (
              <tr key={v.id} className={v.id === version?.id ? 'selected' : ''}>
                <td>{v.sequence}</td><td className="row-title">{v.label}</td><td>{v.amendment_number || '—'}</td><td>{v.effective_date || '—'}</td>
                <td>{v.amendment_reason || '—'}</td><td>{v.filename}</td><td className="ds-mono" title={v.file_sha256}>{v.file_sha256.slice(0, 10)}…</td>
                <td><StatusPill value={v.processing_status} /></td><td><StatusPill value={v.review_status} /></td>
                <td className="nowrap">{new Date(v.created_at).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="ds-muted ds-small">Registered versions are never overwritten or deleted; each keeps its original file and checksum.</div>
      </Card>

      {version && versions.length > 1 && (
        <Card title={`Compare with ${version.label}`}>
          <div className="ds-form-actions" style={{ justifyContent: 'flex-start' }}>
            <div className="form-group" style={{ minWidth: 260 }}>
              <label>Base (earlier) version</label>
              <select className="form-control" value={baseId} onChange={e => setBaseId(e.target.value)}>
                <option value="">Previous version</option>
                {versions.filter(v => v.id !== version.id).map(v => <option key={v.id} value={v.id}>{v.label} — {v.filename}</option>)}
              </select>
            </div>
            {can(role, 'editor') && <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}>{busy ? 'Comparing…' : 'Compare versions'}</button>}
          </div>
          {uncertain && (
            <div className="ds-alert error">
              <b>{uncertain.message}</b>
              <ul className="ds-plain">{uncertain.match.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              Match confidence: {uncertain.match.level} ({uncertain.match.score})
              <div className="ds-actions"><button className="btn btn-secondary btn-sm" onClick={() => setUncertain(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={() => run(true)}>Compare anyway (recorded)</button></div>
            </div>
          )}
          {comparisons.length > 1 && (
            <div className="ds-inline">
              <span className="ds-muted">Comparison history:</span>
              <select className="form-control" value={active?.id || ''} onChange={e => setActive(comparisons.find(c => c.id === e.target.value))}>
                {comparisons.map(c => <option key={c.id} value={c.id}>{c.data.base_label} → {c.data.target_label} · {new Date(c.created_at).toLocaleString()}</option>)}
              </select>
            </div>
          )}
        </Card>
      )}

      {busy && !active && <Loading text="Comparing documents…" />}
      {d && (
        <Card title={`Changes: ${d.base_label} → ${d.target_label}`} actions={can(role, 'editor') && <button className="btn btn-secondary btn-sm" onClick={impactReport}>Generate amendment impact report</button>}>
          <div className="ds-muted ds-small">Document match: {d.match.level} ({d.match.score}) — {d.match.reasons.join('; ')}{d.match.confirmed_by ? ` · confirmed by ${d.match.confirmed_by}` : ''}</div>
          <div className="stat-grid ds-mini-stats">
            {[['Added', d.totals.added], ['Removed', d.totals.removed], ['Modified', d.totals.modified], ['Formatting only', d.totals.formatting],
              ['Pending review', d.changes.filter(c => c.review.status === 'pending' && c.substantive).length]].map(([l, v]) => (
              <div key={l} className="stat-tile"><div className="stat-tile-label">{l}</div><div className="stat-tile-value">{v}</div></div>
            ))}
          </div>
          <div className="ds-columns">
            <div>
              <div className="ds-subhead">Section-level summary</div>
              <table className="dash-table ds-table">
                <thead><tr><th>Section</th><th>Status</th><th>+</th><th>−</th><th>~</th><th>fmt</th></tr></thead>
                <tbody>{d.section_summary.map((s, i) => (
                  <tr key={i}><td>{s.section_new || s.section_old}{s.status === 'renamed' ? ` (was ${s.section_old})` : ''}</td><td>{s.status}</td>
                    <td>{s.added}</td><td>{s.removed}</td><td>{s.modified}</td><td>{s.formatting}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <div className="ds-subhead">Potential downstream impact</div>
              <div className="ds-alert">These are recommendations for review, not confirmed consequences.</div>
              {d.impact_areas.length === 0 && <div className="ds-muted">None identified.</div>}
              {d.impact_areas.map(a => (
                <div key={a.area} className="ds-item">
                  <div className="ds-item-head"><b>{a.label}</b> <span className="ds-muted">{a.change_ids.length} change(s)</span>
                    <button className="link-btn" onClick={() => setArea(a.area)}>show</button></div>
                  {a.linked_deliverables?.length > 0 && <div className="ds-small">Linked deliverables to check: {a.linked_deliverables.map((x, i) => <span key={i} className="ds-tag">{x.kind ? `${x.kind} r${x.revision} (${x.status})` : `existing ${x.existing_analysis}`}</span>)}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="dash-toolbar">
            <select className="dash-filter" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="substantive">Substantive changes</option><option value="pending">Pending review</option>
              <option value="formatting">Formatting only</option><option value="all">All changes</option>
            </select>
            <select className="dash-filter" value={area} onChange={e => setArea(e.target.value)}>
              <option value="all">All impact areas</option>{d.impact_areas.map(a => <option key={a.area} value={a.area}>{a.label}</option>)}
            </select>
            <span className="dash-count">Showing {changes.length} of {d.changes.length}</span>
          </div>
          <div className="ds-list">{changes.map(c => <ChangeCard key={c.id} c={c} role={role} onReview={review} busy={busy} />)}</div>
          <RevisionHistory history={active.history} />
        </Card>
      )}
      {version && versions.length === 1 && <EmptyState title="Only one version registered" text="Register an amendment or new protocol version to compare changes." />}
    </div>
  );
}

