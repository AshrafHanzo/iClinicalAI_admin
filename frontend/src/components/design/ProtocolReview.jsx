// Feature 02 — Protocol Review: Check → Identify issues → Explain findings → Recommend improvements.
// Input is the protocol text plus the structured Protocol Intelligence data; the user resolves or documents each finding.
import { useEffect, useMemo, useState } from 'react';
import { actOnFinding, getProtocolReview, runProtocolReview, setArtifactStatus } from '../../services/designApi';
import { Card, EmptyState, ErrorBanner, EvidenceList, ExportMenu, Loading, NeedsProcessing, NeedsVersion, RevisionHistory, ReviewStatusBar, StatusPill, can , statusCard } from './DesignUi';

const CATEGORIES = [
  ['completeness', 'Missing information'], ['consistency', 'Inconsistencies'], ['ambiguity', 'Ambiguity'],
  ['clarity', 'Unclear wording'], ['unresolved', 'Unresolved issues'],
];
const SEVERITY_TONE = { critical: 'error', major: 'warning', minor: 'info' };
const CHECK_TONE = { present: 'success', mentioned_only: 'warning', missing: 'error', not_checked: 'info' };

function Finding({ f, versionId, role, busy, onAction }) {
  const [note, setNote] = useState('');
  const isOpen = f.status === 'open';
  return (
    <div className={`ds-item ds-finding sev-${f.severity} ${isOpen ? '' : 'done'}`}>
      <div className="ds-item-head">
        <b>{f.id}</b>
        <span className={`status-badge ${SEVERITY_TONE[f.severity]} ds-pill`}>{f.severity}</span>
        <span className="ds-tag">priority {f.priority}</span>
        <span className="ds-tag">{f.category_label}</span>
        {f.origin === 'ai' && <span className="ds-tag warn">AI-generated</span>}
        {f.certainty === 'potential' && <span className="ds-tag">potential</span>}
        <StatusPill value={f.status === 'open' ? 'open' : f.status === 'resolved' ? 'resolved' : 'reviewed'} label={f.status} />
      </div>
      <div className="ds-sugg-text">{f.title}</div>
      <div>{f.description}</div>
      <div className="ds-reco"><b>Recommendation:</b> {f.recommendation}</div>
      {f.evidence.length > 0
        ? <EvidenceList versionId={versionId} evidence={f.evidence} />
        : <div className="ds-muted ds-small">No source text — the information is absent from the protocol.</div>}
      {f.comments.map((c, i) => <div key={i} className="ds-comment">{c.by}: {c.text}</div>)}
      {f.resolution && (
        <div className="ds-muted ds-small">
          {f.resolution.action === 'resolve' ? 'Resolved' : 'Documented'} by {f.resolution.by} · {new Date(f.resolution.at).toLocaleString()} — “{f.resolution.note}”
        </div>
      )}
      {can(role, 'editor') && (
        <div className="ds-inline">
          <input className="form-control" placeholder={isOpen ? 'How it was resolved, why it is accepted, or a comment' : 'Comment'}
            value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={busy || !note.trim()}
            onClick={() => onAction(f.id, 'comment', note).then(ok => ok && setNote(''))}>Comment</button>
          {can(role, 'reviewer') && (isOpen ? (
            <>
              <button className="btn btn-secondary btn-sm" disabled={busy || !note.trim()} title="Accept the finding without changing the protocol, with a rationale"
                onClick={() => onAction(f.id, 'document', note).then(ok => ok && setNote(''))}>Document</button>
              <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}
                onClick={() => onAction(f.id, 'resolve', note).then(ok => ok && setNote(''))}>Resolve</button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(f.id, 'reopen', '')}>Reopen</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProtocolReview({ study, version, role, onSummary }) {
  const [art, setArt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [view, setView] = useState('findings');
  const [cat, setCat] = useState('all');
  const [sev, setSev] = useState('all');
  const [status, setStatus] = useState('open');

  const ready = version?.processing_status === 'completed';
  useEffect(() => {
    const s = art?.data.summary;
    onSummary?.({
      has: !!art, running, approved: art?.status === 'approved', reviewed: art?.status === 'reviewed',
      items: [
        { label: 'Open Findings', value: s ? `${s.open}/${s.total}` : '—', desc: 'to resolve or document' },
        { label: 'Critical', value: s ? s.open_critical : '—', desc: s ? `Completeness ${s.completeness.percent ?? '—'}%` : 'open critical findings' },
        statusCard(art, 'Review not run yet'),
      ],
    });
  }, [art, running]);
  useEffect(() => {
    setArt(null); setError('');
    if (!ready) return;
    setLoading(true);
    getProtocolReview(version.id).then(setArt).catch(e => { if (!/not been run/.test(e.message)) setError(e.message); }).finally(() => setLoading(false));
  }, [version?.id, ready]);

  const findings = useMemo(() => (art?.data.findings || [])
    .filter(f => cat === 'all' || f.category === cat)
    .filter(f => sev === 'all' || f.severity === sev)
    .filter(f => status === 'all' || (status === 'open' ? f.status === 'open' : f.status !== 'open')), [art, cat, sev, status]);

  if (!version) return <NeedsVersion title="Protocol Review" />;
  if (!ready) return <NeedsProcessing version={version} />;

  const run = async () => {
    setRunning(true); setError('');
    try { setArt(await runProtocolReview(version.id, useAi)); } catch (e) { setError(e.message); } finally { setRunning(false); }
  };
  const onAction = async (fid, action, note) => {
    setBusy(true); setError('');
    try { setArt(await actOnFinding(version.id, fid, action, note)); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };
  const changeStatus = async (s) => {
    setBusy(true); setError('');
    try { setArt(await setArtifactStatus(study.id, art.id, s)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const d = art?.data;
  const runControls = can(role, 'editor') && (
    <>
      <label className="ds-check"><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} /> AI review</label>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={running}>{running ? 'Reviewing…' : art ? 'Re-run review' : 'Run protocol review'}</button>
    </>
  );

  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {loading && <Loading />}
      {!loading && !art && !running && (
        <EmptyState title="Protocol Review has not been run"
          text="Checks the protocol and its Protocol Intelligence data for missing information, inconsistencies, ambiguity, unclear wording and unresolved issues, explains each finding and recommends an improvement.">
          <div className="ds-actions">{runControls}</div>
        </EmptyState>
      )}
      {running && <Loading text="Reviewing the protocol…" />}
      {d && (
        <Card title="Protocol Review" actions={<>
          <ExportMenu formats={['docx', 'pdf', 'xlsx']} path={`/versions/${version.id}/review/export`} onError={setError} />
          {runControls}
        </>}>
          <ReviewStatusBar artifact={art} role={role} busy={busy} onChange={changeStatus} />
          {d.basis.warning && <div className="ds-alert">{d.basis.warning} Verify them in Protocol Intelligence for a reviewed basis.</div>}
          {d.basis.ai_note && <div className="ds-alert">{d.basis.ai_note}</div>}
          {d.summary.open_critical > 0 && <div className="ds-alert error">{d.summary.open_critical} critical finding(s) are open. Resolve or document them before approval.</div>}

          <div className="stat-grid ds-mini-stats">
            <div className="stat-tile tone-2"><div className="stat-tile-label">Open findings</div><div className="stat-tile-value">{d.summary.open}</div>
              <div className="stat-tile-sub">of {d.summary.total}</div></div>
            {['critical', 'major', 'minor'].map((s, i) => (
              <div key={s} className={`stat-tile tone-${[1, 5, 6][i]}`}><div className="stat-tile-label">{s}</div><div className="stat-tile-value">{d.summary.by_severity[s]}</div></div>
            ))}
            <div className="stat-tile tone-3"><div className="stat-tile-label">Completeness</div>
              <div className="stat-tile-value">{d.summary.completeness.percent ?? '—'}{d.summary.completeness.percent !== null ? '%' : ''}</div>
              <div className="stat-tile-sub">{d.summary.completeness.present} of {d.summary.completeness.checked} elements present</div></div>
          </div>

          <div className="tabs ds-filter-tabs">
            <button className={`tab ${view === 'findings' ? 'active' : ''}`} onClick={() => setView('findings')}>Findings</button>
            <button className={`tab ${view === 'checklist' ? 'active' : ''}`} onClick={() => setView('checklist')}>Completeness checklist</button>
          </div>

          {view === 'findings' && (
            <>
              <div className="dash-toolbar">
                <select className="dash-filter" value={cat} onChange={e => setCat(e.target.value)} aria-label="Category">
                  <option value="all">All categories</option>
                  {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l} ({d.summary.by_category[k]})</option>)}
                </select>
                <select className="dash-filter" value={sev} onChange={e => setSev(e.target.value)} aria-label="Severity">
                  <option value="all">All severities</option>
                  {['critical', 'major', 'minor'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="dash-filter" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
                  <option value="open">Open</option><option value="closed">Resolved / documented</option><option value="all">All</option>
                </select>
                <span className="dash-count">Showing {findings.length} of {d.findings.length}</span>
              </div>
              <div className="ds-list">
                {findings.length === 0 && <EmptyState title="No findings match these filters" />}
                {findings.map(f => <Finding key={f.id} f={f} versionId={version.id} role={role} busy={busy} onAction={onAction} />)}
              </div>
            </>
          )}

          {view === 'checklist' && (
            <table className="dash-table ds-table">
              <thead><tr><th>Protocol element</th><th>Checked in</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>{d.checklist.map((c, i) => (
                <tr key={i}><td className="row-title">{c.element}</td><td>{c.source}</td>
                  <td><span className={`status-badge ${CHECK_TONE[c.status]} ds-pill`}>{c.status.replace('_', ' ')}</span></td>
                  <td>{c.evidence?.length ? <EvidenceList versionId={version.id} evidence={c.evidence} compact /> : '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
          <RevisionHistory history={art.history} />
        </Card>
      )}
    </div>
  );
}
