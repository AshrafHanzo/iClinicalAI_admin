// Feature 12 — Design Reports & AI Assistant: evidence-linked reports and a study-scoped assistant.
import { useEffect, useState } from 'react';
import {
  askDesignAssistant, createReportTemplate, generateDesignReport, getAssistantHistory, getReportSources, getReportTypes,
  listDesignReports, listReportTemplates, setArtifactStatus, updateReportTemplate,
} from '../../services/designApi';
import { Card, EmptyState, ErrorBanner, ExportMenu, Loading, NeedsVersion, ReviewStatusBar, StatusPill, can , statusCard } from './DesignUi';

const LABELS = {
  verified: ['Verified source fact', 'success'], pending: ['Source fact – pending verification', 'warning'], fact: ['Source fact', 'info'],
  calculated: ['Calculated result', 'info'], ai_interpretation: ['AI interpretation', 'warning'], unresolved: ['Unresolved issue', 'error'], note: ['Note', 'info'],
};
const CLAIM_LABELS = {
  verified_fact: ['Verified fact', 'success'], source_fact_pending: ['Source text – pending verification', 'warning'],
  calculated_result: ['Calculated result', 'info'], ai_interpretation: ['AI interpretation', 'warning'], unresolved_issue: ['Unresolved issue', 'error'],
};
function Tag({ map, k }) {
  const [label, tone] = map[k] || [k, 'info'];
  return <span className={`status-badge ${tone} ds-pill`}>{label}</span>;
}

function ReportView({ report }) {
  return (
    <div className="ds-report">
      {report.sections.map((s, i) => (
        <div key={i} className="ds-report-section">
          <h4>{s.heading}</h4>
          {s.items.map((it, j) => (
            <div key={j} className="ds-report-item">
              <Tag map={LABELS} k={it.label} />
              <span className="ds-pre">{it.text}</span>
              {it.citations?.length > 0 && <span className="ds-cites">({it.citations.join('; ')})</span>}
            </div>
          ))}
          {s.table && (
            <div className="table-scroll"><table className="dash-table ds-table">
              <thead><tr>{s.table.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{s.table.rows.map((r, k) => <tr key={k}>{r.map((v, m) => <td key={m}>{String(v ?? '')}</td>)}</tr>)}</tbody>
            </table></div>
          )}
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({ catalogue, initial, onSave, onCancel }) {
  const [t, setT] = useState(initial || { name: '', title: '', intro: '', sections: [] });
  const [add, setAdd] = useState('');
  const move = (i, d) => {
    const s = [...t.sections];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    setT({ ...t, sections: s });
  };
  return (
    <div className="ds-template-editor">
      <div className="ds-form-grid">
        <div className="form-group"><label>Template name</label><input value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></div>
        <div className="form-group"><label>Report title</label><input value={t.title} onChange={e => setT({ ...t, title: e.target.value })} /></div>
        <div className="form-group ds-span-2"><label>Introduction (optional)</label>
          <textarea className="form-control" rows={2} value={t.intro} onChange={e => setT({ ...t, intro: e.target.value })} /></div>
      </div>
      <div className="ds-subhead">Sections (in report order)</div>
      {t.sections.length === 0 && <div className="ds-muted">No sections yet.</div>}
      {t.sections.map((sid, i) => (
        <div key={sid} className="ds-inline">
          <span style={{ flex: 1 }}>{i + 1}. {catalogue[sid]?.title || sid}</span>
          <button className="link-btn" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button className="link-btn" onClick={() => move(i, 1)} disabled={i === t.sections.length - 1}>↓</button>
          <button className="link-btn" onClick={() => setT({ ...t, sections: t.sections.filter(x => x !== sid) })}>remove</button>
        </div>
      ))}
      <div className="ds-inline">
        <select className="form-control" value={add} onChange={e => setAdd(e.target.value)}>
          <option value="">Add a section…</option>
          {Object.entries(catalogue).filter(([k]) => !t.sections.includes(k)).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!add} onClick={() => { setT({ ...t, sections: [...t.sections, add] }); setAdd(''); }}>Add</button>
      </div>
      <div className="ds-form-actions">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!t.name.trim() || !t.title.trim() || !t.sections.length} onClick={() => onSave(t)}>Save template</button>
      </div>
    </div>
  );
}

function reportSummary(reports, running) {
  const latest = reports[0];
  return {
    has: reports.length > 0, running, approved: latest?.status === 'approved', reviewed: latest?.status === 'reviewed',
    items: [
      { label: 'Reports', value: reports.length, desc: 'generated for this version' },
      { label: 'Approved', value: reports.filter(r => r.status === 'approved').length, desc: 'ready to share' },
      statusCard(latest, 'No report yet', latest ? `Latest: ${latest.data.title}` : undefined),
    ],
  };
}

function Reports({ study, version, role, onSummary }) {
  const [types, setTypes] = useState({});
  const [catalogue, setCatalogue] = useState({});
  const [templates, setTemplates] = useState([]);
  const [choice, setChoice] = useState('type:protocol_intelligence');
  const [sections, setSections] = useState([]);
  const [sources, setSources] = useState({ artifacts: [], existing_analyses: [] });
  const [explicit, setExplicit] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | template artifact
  const [reports, setReports] = useState([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (reportsLoaded) onSummary?.(reportSummary(reports, busy)); }, [reports, busy, reportsLoaded]);
  const [error, setError] = useState('');

  useEffect(() => {
    getReportTypes().then(r => { setTypes(r.types); setCatalogue(r.sections || {}); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    listReportTemplates(study.id).then(r => setTemplates(r.templates)).catch(e => setError(e.message));
  }, [study.id]);
  useEffect(() => {
    setReports([]); setActive(null); setChosen([]);
    listDesignReports(version.id).then(r => { setReports(r.reports); setActive(r.reports[0] || null); setReportsLoaded(true); }).catch(e => setError(e.message));
    getReportSources(version.id).then(setSources).catch(e => setError(e.message));
  }, [version.id]);

  const isType = choice.startsWith('type:');
  const typeKey = isType ? choice.slice(5) : null;
  const template = !isType ? templates.find(t => t.id === choice.slice(4)) : null;
  useEffect(() => { if (isType) setSections(types[typeKey]?.sections || []); }, [choice, types]);
  const effectiveSections = isType ? sections : (template?.data.sections || []);

  const generate = async () => {
    setBusy(true); setError('');
    try {
      const body = isType ? { report_type: typeKey, sections } : { template_id: template.id };
      if (explicit) body.artifact_ids = chosen;
      const a = await generateDesignReport(version.id, body);
      setReports(prev => [a, ...prev]); setActive(a);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const saveTemplate = async (t) => {
    setError('');
    try {
      const saved = editing === 'new' ? await createReportTemplate(study.id, t) : await updateReportTemplate(study.id, editing.id, t);
      setTemplates(prev => [saved, ...prev.filter(x => x.lineage_id !== saved.lineage_id)]);
      setChoice(`tpl:${saved.id}`); setEditing(null);
    } catch (e) { setError(e.message); }
  };
  const changeStatus = async (s) => {
    setBusy(true); setError('');
    try {
      const a = await setArtifactStatus(study.id, active.id, s);
      setActive(a); setReports(prev => prev.map(x => x.lineage_id === a.lineage_id ? a : x));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {can(role, 'editor') && (
        <Card title="Generate report">
          <div className="ds-form-grid">
            <div className="form-group ds-span-2">
              <label>Report template</label>
              <select className="form-control" value={choice} onChange={e => setChoice(e.target.value)}>
                <optgroup label="Built-in reports">
                  {Object.entries(types).map(([k, t]) => <option key={k} value={`type:${k}`}>{t.title}</option>)}
                </optgroup>
                {templates.length > 0 && (
                  <optgroup label="Study templates">
                    {templates.map(t => <option key={t.id} value={`tpl:${t.id}`}>{t.data.name} (rev {t.revision})</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div className="ds-actions" style={{ marginTop: 8 }}>
            <button className="link-btn" onClick={() => setEditing('new')}>+ New template</button>
            {template && <button className="link-btn" onClick={() => setEditing(template)}>Edit “{template.data.name}”</button>}
          </div>
          {editing && (
            <TemplateEditor catalogue={catalogue}
              initial={editing === 'new' ? { name: '', title: '', intro: '', sections: isType ? sections : [] }
                : { name: editing.data.name, title: editing.data.title, intro: editing.data.intro, sections: editing.data.sections }}
              onSave={saveTemplate} onCancel={() => setEditing(null)} />
          )}
          <div className="ds-subhead">Sections</div>
          {isType ? (
            <div className="ds-checks">
              {(types[typeKey]?.sections || []).map(s => (
                <label key={s} className="ds-check">
                  <input type="checkbox" checked={sections.includes(s)} onChange={e => setSections(e.target.checked ? [...sections, s] : sections.filter(x => x !== s))} />
                  {catalogue[s]?.title || s}
                </label>
              ))}
            </div>
          ) : (
            <ol className="ds-plain-ol">{effectiveSections.map(s => <li key={s}>{catalogue[s]?.title || s}</li>)}</ol>
          )}

          <div className="ds-subhead">Analysis results used</div>
          <label className="ds-check"><input type="radio" checked={!explicit} onChange={() => setExplicit(false)} /> Latest results of version {version.label}</label>
          <label className="ds-check"><input type="radio" checked={explicit} onChange={() => setExplicit(true)} /> Choose results explicitly</label>
          {explicit && (
            <div className="ds-source-list">
              {sources.artifacts.length === 0 && <div className="ds-muted">No saved analysis results for this version.</div>}
              {sources.artifacts.map(a => (
                <label key={a.id} className="ds-check">
                  <input type="checkbox" checked={chosen.includes(a.id)} onChange={e => setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter(x => x !== a.id))} />
                  {a.kind.replace(/_/g, ' ')} · rev {a.revision} · <StatusPill value={a.status} /> {a.name ? `· ${a.name}` : ''} · {new Date(a.created_at).toLocaleString()}
                </label>
              ))}
              <div className="ds-muted ds-small">Results not chosen are left out of the report (their sections say so).</div>
            </div>
          )}
          <div className="ds-muted ds-small">
            Existing analyses for this document: {sources.existing_analyses.map(x => `${x.label} ${x.available ? '✓' : '—'}`).join(' · ')}
          </div>
          <div className="ds-form-actions">
            <span className="ds-muted ds-small">Reports use protocol version {version.label} only.</span>
            <button className="btn btn-primary" disabled={busy || !effectiveSections.length} onClick={generate}>{busy ? 'Generating…' : 'Generate report'}</button>
          </div>
        </Card>
      )}
      {!reports.length && <EmptyState title="No reports yet" text="Reports combine the DESIGN outputs for this protocol version with source references." />}
      {reports.length > 0 && (
        <Card title="Reports" actions={active && <ExportMenu formats={['docx', 'pdf']} path={`/reports/${active.id}/export?study_id=${study.id}`} onError={setError} />}>
          <div className="ds-inline">
            <select className="form-control" value={active?.id || ''} onChange={e => setActive(reports.find(r => r.id === e.target.value))}>
              {reports.map(r => <option key={r.id} value={r.id}>{r.data.title} · rev {r.revision} · {r.status} · {new Date(r.data.metadata.generated_at).toLocaleString()}</option>)}
            </select>
          </div>
          {active && (
            <>
              <ReviewStatusBar artifact={active} role={role} busy={busy} onChange={changeStatus} />
              <div className="ds-meta-grid">
                <span><b>Study ID</b> {active.data.metadata.study_id}</span>
                <span><b>Protocol version</b> {active.data.metadata.protocol_version}</span>
                <span><b>Generated</b> {new Date(active.data.metadata.generated_at).toLocaleString()}</span>
                {active.data.template?.name && <span><b>Template</b> {active.data.template.name} (rev {active.data.template.revision})</span>}
                <span><b>Analysis versions</b> {active.data.metadata.analysis_versions.map(s => s.artifact_id ? `${s.kind} r${s.revision} (${s.status})` : 'existing analyses').join(', ') || '—'}</span>
              </div>
              <ReportView report={active.data} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Assistant({ version }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [includeExisting, setIncludeExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setItems([]);
    getAssistantHistory(version.id).then(r => setItems(r.items)).catch(e => setError(e.message));
  }, [version.id]);

  const ask = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError('');
    try { const r = await askDesignAssistant(version.id, q.trim(), includeExisting); setItems(prev => [...prev, r]); setQ(''); }
    catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };

  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <div className="ds-alert">Answers use only this study's protocol version {version.label} and its saved analyses. Every statement cites its evidence; unsupported statements are removed.</div>
      {items.length === 0 && !busy && <EmptyState title="Ask a question about this study" text="e.g. “What is the primary endpoint and when is it assessed?”" />}
      {items.map((it, i) => (
        <div key={it.id || i} className="ds-qa">
          <div className="ds-q">{it.question}</div>
          <div className="ds-a">
            <div className="ds-item-head"><StatusPill value={it.outcome === 'answered' ? 'answered' : it.outcome === 'evidence_only' ? 'pending' : 'missing'} label={it.outcome.replace(/_/g, ' ')} /></div>
            <div className="ds-pre">{it.answer}</div>
            {it.claims?.length > 0 && (
              <ul className="ds-plain">{it.claims.map((c, j) => <li key={j}><Tag map={CLAIM_LABELS} k={c.category} /> {c.text} <span className="ds-cites">[{c.citations.join(', ')}]</span></li>)}</ul>
            )}
            {it.review_items?.length > 0 && (
              <div className="ds-review-items">
                {it.review_items.map((r, k) => (
                  <div key={k} className={`ds-alert ${r.type === 'contradictory' ? 'error' : ''}`}>
                    <b>{r.type === 'contradictory' ? 'Contradictory evidence' : 'Missing evidence'}:</b> {r.detail}
                    <div className="ds-small">Source to review: {r.source_to_review}</div>
                  </div>
                ))}
              </div>
            )}
            {it.limitations && !it.review_items?.length && <div className="ds-muted ds-small">Limitations: {it.limitations}</div>}
            {it.evidence?.length > 0 && (
              <details className="ds-alt">
                <summary>Evidence ({it.evidence.length})</summary>
                {it.evidence.map(ev => (
                  <div key={ev.id} className="ds-alt-item"><b>{ev.id}</b> <span className="ds-tag">{ev.type.replace(/_/g, ' ')}</span> <span className="ds-muted">{ev.ref}</span><div className="ds-small">{ev.text}</div></div>
                ))}
              </details>
            )}
          </div>
        </div>
      ))}
      {busy && <Loading text="Searching study evidence…" />}
      <form className="chat-input-area ds-ask" onSubmit={ask}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about this study…" disabled={busy} />
        <label className="ds-check"><input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} /> include existing AI analyses</label>
        <button className="btn btn-primary" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}

export default function DesignReports({ study, version, role, documentChat, onSummary }) {
  // Report counts for the page's stat cards (also refreshed by the Reports tab when reports change)
  useEffect(() => {
    if (!version || version.processing_status !== 'completed') { onSummary?.(reportSummary([], false)); return; }
    listDesignReports(version.id).then(r => onSummary?.(reportSummary(r.reports, false))).catch(() => {});
  }, [version?.id, version?.processing_status]);
  const [tab, setTab] = useState('reports');
  return (
    <div className="ds-stack">
      <div className="tabs ds-filter-tabs">
        {[['reports', 'Reports'], ['assistant', 'Study AI Assistant'], ['chat', 'Document chat']].map(([id, l]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'chat' ? documentChat : !version ? <NeedsVersion title="Design Reports & AI Assistant" />
        : version.processing_status !== 'completed' ? <EmptyState title="Protocol is still being processed" text={version.processing_message} />
          : tab === 'reports' ? <Reports study={study} version={version} role={role} onSummary={onSummary} /> : <Assistant version={version} />}
    </div>
  );
}
