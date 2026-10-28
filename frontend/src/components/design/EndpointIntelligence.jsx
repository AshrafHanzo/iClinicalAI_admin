// Feature 06 — Endpoint Intelligence: register, objective mapping, definitions/methods, time points, issues, suggestions.
import { useEffect, useState } from 'react';
import { analyzeEndpoints, getEndpoints, resolveEndpointIssue, reviewSuggestion, setArtifactStatus } from '../../services/designApi';
import { Card, EmptyState, ErrorBanner, EvidenceList, Loading, NeedsProcessing, NeedsVersion, RevisionHistory, ReviewStatusBar, StatusPill, can , statusCard } from './DesignUi';

const VIEWS = [
  ['register', 'Endpoint register'], ['matrix', 'Objective mapping'], ['hypotheses', 'Hypotheses'], ['methods', 'Definitions & methods'],
  ['timepoints', 'Time points'], ['sap', 'SAP comparison'], ['issues', 'Issues'], ['questions', 'Unresolved questions'],
  ['suggestions', 'Suggested clarifications'],
];

function Present({ ok, text }) {
  return ok ? <span>{text}</span> : <span className="ds-ns">Not specified</span>;
}

export default function EndpointIntelligence({ study, version, role, onSummary }) {
  const [art, setArt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('register');
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});

  const ready = version?.processing_status === 'completed';
  useEffect(() => {
    const d = art?.data;
    onSummary?.({
      has: !!art, running, approved: art?.status === 'approved', reviewed: art?.status === 'reviewed',
      items: [
        { label: 'Endpoints', value: d ? d.register.length : '—', desc: d ? `${d.objectives.length} objectives` : 'in the register' },
        { label: 'Open Issues', value: d ? d.issues.filter(i => i.status !== 'resolved').length : '—',
          desc: d ? `${d.suggestions.filter(x => x.status === 'pending_review').length} suggestions to review` : 'to review' },
        statusCard(art, 'Analysis not run yet'),
      ],
    });
  }, [art, running]);
  useEffect(() => {
    setArt(null); setError('');
    if (!ready) return;
    setLoading(true);
    getEndpoints(version.id).then(setArt).catch(e => { if (!/not been run/.test(e.message)) setError(e.message); }).finally(() => setLoading(false));
  }, [version?.id, ready]);

  if (!version) return <NeedsVersion title="Endpoint Intelligence" />;
  if (!ready) return <NeedsProcessing version={version} />;

  const run = async () => {
    setRunning(true); setError('');
    try { setArt(await analyzeEndpoints(version.id, useAi)); } catch (e) { setError(e.message); } finally { setRunning(false); }
  };
  const act = async (fn) => {
    setBusy(true); setError('');
    try { setArt(await fn()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const d = art?.data;
  const runControls = can(role, 'editor') && (
    <>
      <label className="ds-check"><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} /> AI suggestions</label>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={running}>{running ? 'Analyzing…' : art ? 'Re-run analysis' : 'Run endpoint analysis'}</button>
    </>
  );

  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {loading && <Loading />}
      {!loading && !art && (
        <EmptyState title="Endpoint Intelligence has not been run" text="Analyzes endpoints from the protocol information: objective links, definitions, measurement methods and time points.">
          <div className="ds-actions">{runControls}</div>
        </EmptyState>
      )}
      {running && <Loading text="Analyzing endpoints…" />}
      {d && (
        <Card title="Endpoint Intelligence" actions={runControls}>
          <ReviewStatusBar artifact={art} role={role} busy={busy}
            onChange={(s) => act(() => setArtifactStatus(study.id, art.id, s))} />
          {d.basis.warning && <div className="ds-alert">{d.basis.warning}. Verify them in Protocol Intelligence for a reviewed basis.</div>}
          {d.ai_note && <div className="ds-alert">{d.ai_note}</div>}
          <div className="tabs ds-filter-tabs">
            {VIEWS.map(([id, l]) => (
              <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
                {l}{id === 'issues' ? ` (${d.issues.filter(i => i.status !== 'resolved').length})` : ''}
                {id === 'suggestions' ? ` (${d.suggestions.filter(s => s.status === 'pending_review').length})` : ''}
                {id === 'questions' ? ` (${(d.unresolved_questions || []).filter(q => d.issues.find(i => i.id === q.issue_id)?.status !== 'resolved').length})` : ''}
              </button>
            ))}
          </div>

          {view === 'register' && (
            d.register.length ? (
              <div className="table-scroll"><table className="dash-table ds-table">
                <thead><tr><th>ID</th><th>Type</th><th>Priority</th><th>Endpoint (as in protocol)</th><th>Verification</th><th>Source</th></tr></thead>
                <tbody>{d.register.map(e => (
                  <tr key={e.id}><td>{e.id}</td><td><StatusPill value={e.type} label={e.type} /></td><td>{e.priority}</td>
                    <td className="row-title">{e.text}</td><td><StatusPill value={e.verification} /></td>
                    <td><EvidenceList versionId={version.id} evidence={e.evidence} compact /></td></tr>
                ))}</tbody>
              </table></div>
            ) : <EmptyState title="No endpoints found" text="The protocol information has no primary, secondary or exploratory endpoints." />
          )}

          {view === 'matrix' && (
            <div className="table-scroll"><table className="dash-table ds-table ds-matrix">
              <thead><tr><th>Objective</th>{d.register.map(e => <th key={e.id} title={e.text}>{e.id}</th>)}</tr></thead>
              <tbody>{d.objectives.map(o => (
                <tr key={o.id}>
                  <td className="row-title"><b>{o.id}</b> ({o.type}) {o.text}</td>
                  {d.register.map(e => {
                    const l = d.mapping.find(m => m.objective_id === o.id && m.endpoint_id === e.id);
                    return <td key={e.id} className="center" title={l ? `${l.basis}, ${l.certainty}` : ''}>{l ? (l.certainty === 'high' ? '●' : '○') : ''}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
            <div className="ds-muted ds-small">● linked by shared terms and objective type · ○ possible link (type only) — confirm during review</div></div>
          )}

          {view === 'hypotheses' && (
            (d.hypotheses || []).length ? (
              <table className="dash-table ds-table">
                <thead><tr><th>ID</th><th>Hypothesis (as in protocol)</th><th>Endpoints tested</th><th>Source</th></tr></thead>
                <tbody>{d.hypotheses.map(h => (
                  <tr key={h.id}><td>{h.id}</td><td className="row-title">{h.text}</td>
                    <td>{(d.hypothesis_mapping || []).filter(l => l.hypothesis_id === h.id).map(l => l.endpoint_id).join(', ') || <span className="ds-ns">None identified</span>}</td>
                    <td><EvidenceList versionId={version.id} evidence={h.evidence} compact /></td></tr>
                ))}</tbody>
              </table>
            ) : <EmptyState title="No study hypotheses stated" text="The protocol information has no hypotheses (shown as Not specified in Protocol Intelligence)." />
          )}

          {view === 'sap' && (
            !d.basis.sap_used ? <EmptyState title="No statistical analysis plan supplied" text="Upload the SAP as a supporting document (type: Statistical analysis plan) when registering the protocol version, then re-run the analysis." />
              : (
                <table className="dash-table ds-table">
                  <thead><tr><th>Endpoint</th><th>Result</th><th>Time points in SAP</th><th>SAP source</th></tr></thead>
                  <tbody>{(d.sap_comparison || []).map(r => (
                    <tr key={r.endpoint_id}><td>{r.endpoint_id}</td><td><StatusPill value={r.status} /></td>
                      <td>{r.sap_time_points.join(', ') || '—'}</td>
                      <td><EvidenceList versionId={version.id} evidence={r.sap_evidence} compact /></td></tr>
                  ))}</tbody>
                </table>
              )
          )}

          {view === 'questions' && (
            <div className="ds-list">
              {(d.unresolved_questions || []).length === 0 && <EmptyState title="No unresolved questions" />}
              {(d.unresolved_questions || []).map(q => {
                const issue = d.issues.find(i => i.id === q.issue_id);
                return (
                  <div key={q.id} className={`ds-item ${issue?.status === 'resolved' ? 'done' : ''}`}>
                    <div className="ds-item-head"><b>{q.id}</b> <StatusPill value={q.certainty} /> <StatusPill value={issue?.status === 'resolved' ? 'resolved' : 'open'} label={issue?.status === 'resolved' ? 'answered' : 'open'} /></div>
                    <div className="ds-sugg-text">{q.question}</div>
                    <div className="ds-muted">{q.context}</div>
                    <EvidenceList versionId={version.id} evidence={q.evidence} compact />
                    {issue?.resolution && <div className="ds-muted ds-small">Answer recorded in review: “{issue.resolution.note}”</div>}
                  </div>
                );
              })}
              <div className="ds-muted ds-small">Answer a question by reviewing its issue on the Issues tab.</div>
            </div>
          )}

          {view === 'methods' && (
            <div className="table-scroll"><table className="dash-table ds-table">
              <thead><tr><th>ID</th><th>Definition</th><th>Measurement method</th><th>Time points</th></tr></thead>
              <tbody>{d.register.map(e => (
                <tr key={e.id}><td>{e.id}</td>
                  <td><Present ok={e.components.definition.present} text={e.text} /></td>
                  <td><Present ok={e.components.measurement_method.present} text={e.components.measurement_method.text} />
                    {e.components.measurement_method.from_assessment_section && <div className="ds-muted ds-small">from assessment section</div>}</td>
                  <td><Present ok={e.components.time_points.present} text={e.components.time_points.text} /></td></tr>
              ))}</tbody>
            </table></div>
          )}

          {view === 'timepoints' && (
            d.timepoint_map.length ? (
              <table className="dash-table ds-table">
                <thead><tr><th>Endpoint</th><th>Time point</th><th>Scheduled visit(s)</th></tr></thead>
                <tbody>{d.timepoint_map.map((t, i) => (
                  <tr key={i}><td>{t.endpoint_id}</td><td>{t.time_point}</td>
                    <td>{t.visit_ids.length ? t.visit_ids.join(', ') : (d.basis.soa_used ? <span className="ds-ns">No matching visit</span> : <span className="ds-muted">Generate the Schedule of Assessments to map visits</span>)}</td></tr>
                ))}</tbody>
              </table>
            ) : <EmptyState title="No time points stated in the endpoints" />
          )}

          {view === 'issues' && (
            <div className="ds-list">
              {d.issues.length === 0 && <EmptyState title="No issues detected" />}
              {d.issues.map(i => (
                <div key={i.id} className={`ds-item ${i.status === 'resolved' ? 'done' : ''}`}>
                  <div className="ds-item-head">
                    <b>{i.id}</b> <StatusPill value={i.certainty} label={i.certainty === 'confirmed' ? 'Confirmed inconsistency' : 'Potential issue'} />
                    <span className="ds-tag">{i.type.replace(/_/g, ' ')}</span> <StatusPill value={i.status} />
                  </div>
                  <div>{i.description}</div>
                  <EvidenceList versionId={version.id} evidence={i.evidence} />
                  {i.resolution && <div className="ds-muted ds-small">Review note: “{i.resolution.note}” — {i.resolution.by}</div>}
                  {can(role, 'reviewer') && (
                    <div className="ds-inline">
                      <input className="form-control" placeholder="Review note" value={drafts[i.id] || ''} onChange={e => setDrafts({ ...drafts, [i.id]: e.target.value })} />
                      <button className="btn btn-secondary btn-sm" disabled={busy || !drafts[i.id]}
                        onClick={() => act(() => resolveEndpointIssue(version.id, i.id, drafts[i.id], i.status === 'resolved'))}>
                        {i.status === 'resolved' ? 'Reopen' : 'Mark reviewed'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {view === 'suggestions' && (
            <div className="ds-list">
              <div className="ds-alert">Suggestions are kept separate from the protocol content. Approving one records a decision; it never changes the endpoint register or hierarchy.</div>
              {d.suggestions.length === 0 && <EmptyState title="No suggestions" />}
              {d.suggestions.map(sg => (
                <div key={sg.id} className="ds-item ds-suggestion">
                  <div className="ds-item-head">
                    <b>{sg.id}</b> <span className="ds-tag">{sg.origin === 'ai' ? 'AI-generated' : 'Rule-generated'}</span>
                    <span className="ds-tag">{sg.impact}</span>
                    {sg.requires_scientific_review && <span className="ds-tag warn">requires scientific review</span>}
                    <StatusPill value={sg.status} /> {sg.target && <span className="ds-muted">→ {sg.target}</span>}
                  </div>
                  <div className="ds-sugg-text">{sg.text}</div>
                  <div className="ds-muted">Rationale: {sg.rationale}</div>
                  <EvidenceList versionId={version.id} evidence={sg.evidence} compact />
                  {sg.comments.map((c, k) => <div key={k} className="ds-comment">{c.by}: {c.text}</div>)}
                  {sg.decision && <div className="ds-muted ds-small">{sg.status} by {sg.decision.by}{sg.decision.comment ? ` — “${sg.decision.comment}”` : ''}</div>}
                  {can(role, 'editor') && (
                    <div className="ds-inline">
                      <input className="form-control" placeholder="Comment" value={drafts[sg.id] || ''} onChange={e => setDrafts({ ...drafts, [sg.id]: e.target.value })} />
                      <button className="btn btn-secondary btn-sm" disabled={busy || !drafts[sg.id]}
                        onClick={() => act(() => reviewSuggestion(version.id, sg.id, 'comment', drafts[sg.id])).then(() => setDrafts({ ...drafts, [sg.id]: '' }))}>Comment</button>
                      {can(role, sg.requires_scientific_review ? 'reviewer' : 'editor') && sg.status === 'pending_review' && (
                        <>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => reviewSuggestion(version.id, sg.id, 'reject', drafts[sg.id]))}>Reject</button>
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => reviewSuggestion(version.id, sg.id, 'approve', drafts[sg.id]))}>Approve</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <RevisionHistory history={art.history} />
        </Card>
      )}
    </div>
  );
}
