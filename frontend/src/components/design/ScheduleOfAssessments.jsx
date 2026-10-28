// Feature 07 — Schedule of Assessments: editable visit × assessment matrix with source references and review workflow.
import { Fragment, useEffect, useState } from 'react';
import { downloadDesignFile, generateSoa, getSoa, listSoaTemplates, resolveSoaIssue, saveSoa, setArtifactStatus, uploadSoaTemplate } from '../../services/designApi';

function SoaTemplates({ study, version, role, onError }) {
  const [templates, setTemplates] = useState([]);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSoaTemplates(study.id).then(r => setTemplates(r.templates)).catch(e => onError(e.message));
  }, [study.id]);

  const upload = async () => {
    setBusy(true);
    try {
      const t = await uploadSoaTemplate(study.id, file, name);
      setTemplates(prev => [t, ...prev]); setFile(null); setName('');
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="ds-templates">
      <div className="ds-subhead">Protocol-specific table templates</div>
      <div className="ds-muted ds-small">
        Upload an Excel or Word template containing placeholders: {'{{SOA_TABLE}}'} (where the matrix goes), {'{{SOA_FOOTNOTES}}'}, {'{{SOA_CONVENTIONS}}'},
        {' {{STUDY_ID}}'}, {'{{STUDY_TITLE}}'}, {'{{PROTOCOL_VERSION}}'}, {'{{STATUS}}'}, {'{{REVISION}}'}, {'{{EXPORTED}}'}.
      </div>
      {templates.map(t => (
        <div key={t.id} className="ds-inline">
          <span className="row-title">{t.data.name}</span>
          <span className="ds-tag">{t.data.format.toUpperCase()}</span>
          <span className="ds-muted ds-small">{t.data.placeholders.join(' ') || 'no placeholders'}</span>
          {t.data.warning && <span className="ds-tag warn">{t.data.warning}</span>}
          <button className="btn btn-secondary btn-sm"
            onClick={() => downloadDesignFile(`/versions/${version.id}/soa/export?format=${t.data.format}&template_id=${t.id}`).catch(e => onError(e.message))}>
            Export with this template
          </button>
        </div>
      ))}
      {can(role, 'editor') && (
        <div className="ds-inline">
          <input type="file" accept=".xlsx,.docx" onChange={e => setFile(e.target.files[0] || null)} />
          <input className="form-control" placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Add template'}</button>
        </div>
      )}
    </div>
  );
}
import { Card, EmptyState, ErrorBanner, EvidenceList, ExportMenu, Loading, NeedsProcessing, NeedsVersion, RevisionHistory, ReviewStatusBar, StatusPill, can , statusCard } from './DesignUi';

const windowText = (w) => (w ? `-${w.minus}/+${w.plus} ${w.unit}${w.plus === 1 ? '' : 's'}` : '');
const nextId = (prefix, items) => `${prefix}${Math.max(0, ...items.map(x => parseInt(String(x.id).slice(1), 10) || 0)) + 1}`;

function sourceEvidence(src) {
  return src ? [{ block_id: src.block_id, page: src.page, section: src.section, quote: src.text }] : [];
}

export default function ScheduleOfAssessments({ study, version, role, onSummary }) {
  const [art, setArt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null); // working copy while editing
  const [note, setNote] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [issueNotes, setIssueNotes] = useState({});
  const [selected, setSelected] = useState(null);

  const ready = version?.processing_status === 'completed';
  useEffect(() => {
    const m = art?.data;
    const open = m ? m.issues.filter(i => i.status !== 'resolved') : [];
    onSummary?.({
      has: !!art, running: busy && !art, approved: art?.status === 'approved', reviewed: art?.status === 'reviewed',
      items: [
        { label: 'Visits', value: m ? m.visits.length : '—', desc: 'in the schedule' },
        { label: 'Assessments', value: m ? m.assessments.length : '—', desc: m ? `${open.length} open scheduling issues` : 'procedures and tests' },
        statusCard(art, 'Not generated yet', art ? `${open.filter(i => i.severity === 'conflict').length} open conflicts` : undefined),
      ],
    });
  }, [art, busy]);
  useEffect(() => {
    setArt(null); setEdit(null); setError('');
    if (!ready) return;
    setLoading(true);
    getSoa(version.id).then(setArt).catch(e => { if (!/No Schedule/.test(e.message)) setError(e.message); }).finally(() => setLoading(false));
  }, [version?.id, ready]);

  if (!version) return <NeedsVersion title="Schedule of Assessments" />;
  if (!ready) return <NeedsProcessing version={version} />;

  const act = async (fn) => {
    setBusy(true); setError('');
    try { setArt(await fn()); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  };

  const generate = () => {
    if (art && !window.confirm('Generate a new matrix from the protocol? The current matrix and its history are kept, but the new matrix starts a fresh revision line.')) return;
    act(() => generateSoa(version.id, useAi));
  };

  const m = edit || art?.data;
  // Timing and window are edited as text and re-parsed by the server, so the stored form stays consistent
  const startEdit = () => {
    const copy = JSON.parse(JSON.stringify(art.data));
    copy.visits.forEach(v => { v.timing_text = v.timing?.text || ''; v.window_text = v.window?.text || ''; });
    setEdit(copy);
  };
  const upd = (fn) => setEdit(prev => { const c = JSON.parse(JSON.stringify(prev)); fn(c); return c; });
  const toggleCell = (aid, vid) => upd(c => {
    const k = `${aid}|${vid}`;
    if (c.cells[k]) delete c.cells[k]; else c.cells[k] = { mark: 'X', conditional: false, footnotes: [], source: null };
  });
  const save = async () => {
    const payload = JSON.parse(JSON.stringify(edit));
    payload.visits.forEach(v => {
      const orig = art.data.visits.find(o => o.id === v.id);
      if (orig && v.timing_text === (orig.timing?.text || '')) delete v.timing_text;
      if (orig && v.window_text === (orig.window?.text || '')) delete v.window_text;
    });
    if (await act(() => saveSoa(version.id, payload, note || 'Matrix edited', art.revision))) { setEdit(null); setNote(''); }
  };

  const openIssues = (m?.issues || []).filter(i => i.status !== 'resolved');
  const issueFor = (ref) => openIssues.filter(i => i.refs.includes(ref));

  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {loading && <Loading />}
      {!loading && !art && (
        <EmptyState title="No Schedule of Assessments yet" text="Generates the visit × assessment matrix from the protocol's schedule table (and supporting SoA documents). Timing and windows are taken only from the protocol.">
          {can(role, 'editor') && (
            <div className="ds-actions">
              <label className="ds-check"><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} /> Use AI if no table is found</label>
              <button className="btn btn-primary" disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate from protocol'}</button>
            </div>
          )}
        </EmptyState>
      )}

      {art && m && (
        <Card title="Schedule of Assessments" actions={
          <>
            <ExportMenu formats={['xlsx', 'docx', 'pdf']} path={`/versions/${version.id}/soa/export`} onError={setError} />
            {can(role, 'editor') && !edit && <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit matrix</button>}
            {can(role, 'editor') && !edit && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={generate}>Regenerate</button>}
          </>
        }>
          <ReviewStatusBar artifact={art} role={role} busy={busy} onChange={(s) => act(() => setArtifactStatus(study.id, art.id, s))} />
          {art.data.note && <div className="ds-alert">{art.data.note}</div>}
          <div className="ds-muted ds-small">
            {m.visits.length} visits · {m.assessments.length} assessments · source: {art.data.generated_by === 'table' ? `protocol table(s) ${art.data.source_tables.join(', ')}` : art.data.generated_by === 'ai' ? 'AI extraction (each item checked against the text)' : 'none detected'}
            {openIssues.some(i => i.severity === 'conflict') && ' · approval requires all conflicts to be reviewed'}
          </div>

          {edit && (
            <div className="ds-toolbar">
              <button className="btn btn-secondary btn-sm" onClick={() => upd(c => c.visits.push({ id: nextId('V', c.visits), label: 'New visit', timing_text: '', window_text: '' }))}>+ Visit</button>
              <button className="btn btn-secondary btn-sm" onClick={() => upd(c => c.assessments.push({ id: nextId('A', c.assessments), name: 'New assessment', category: null }))}>+ Assessment</button>
              <span className="ds-muted ds-small">Click a cell to toggle an assignment. Timing such as “Week 4” or “Day -14 to -1”; windows such as “±3 days”.</span>
            </div>
          )}

          <div className="table-scroll ds-soa-wrap">
            <table className="ds-soa">
              <thead>
                <tr>
                  <th className="sticky">Assessment</th>
                  {m.visits.map(v => (
                    <th key={v.id} className={issueFor(v.id).length ? 'warn' : ''} onClick={() => !edit && setSelected({ type: 'visit', v })}>
                      {edit ? (
                        <div className="ds-vedit">
                          <input value={v.label} onChange={e => upd(c => { c.visits.find(x => x.id === v.id).label = e.target.value; })} />
                          <input value={v.timing_text} placeholder="Timing" onChange={e => upd(c => { c.visits.find(x => x.id === v.id).timing_text = e.target.value; })} />
                          <input value={v.window_text} placeholder="Window" onChange={e => upd(c => { c.visits.find(x => x.id === v.id).window_text = e.target.value; })} />
                          <button className="link-btn" onClick={() => upd(c => { c.visits = c.visits.filter(x => x.id !== v.id); Object.keys(c.cells).forEach(k => { if (k.endsWith(`|${v.id}`)) delete c.cells[k]; }); })}>remove</button>
                        </div>
                      ) : (
                        <>
                          <div>{v.label}</div>
                          <div className="ds-th-sub">{v.timing ? v.timing.label : <span className="ds-ns">timing not specified</span>}</div>
                          <div className="ds-th-sub">{v.window ? windowText(v.window) : <span className="ds-ns">window not specified</span>}</div>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.assessments.map((a, idx) => (
                  <Fragment key={a.id}>
                    {a.category && a.category !== m.assessments[idx - 1]?.category && (
                      <tr className="cat"><td className="sticky" colSpan={m.visits.length + 1}>{a.category}</td></tr>
                    )}
                    <tr className={issueFor(a.id).length ? 'warn' : ''}>
                      <td className="sticky" onClick={() => !edit && setSelected({ type: 'assessment', a })}>
                        {edit ? (
                          <div className="ds-inline">
                            <input value={a.name} onChange={e => upd(c => { c.assessments.find(x => x.id === a.id).name = e.target.value; })} />
                            <button className="link-btn" onClick={() => upd(c => { c.assessments = c.assessments.filter(x => x.id !== a.id); Object.keys(c.cells).forEach(k => { if (k.startsWith(`${a.id}|`)) delete c.cells[k]; }); })}>remove</button>
                          </div>
                        ) : a.name}
                      </td>
                      {m.visits.map(v => {
                        const cell = m.cells[`${a.id}|${v.id}`];
                        return (
                          <td key={v.id} className={`cell ${edit ? 'editable' : ''} ${cell?.inferred_from_shading ? 'inferred' : ''}`}
                            title={cell?.inferred_from_shading ? 'Read from an unshaded cell in the protocol table' : undefined}
                            onClick={() => edit ? toggleCell(a.id, v.id) : cell && setSelected({ type: 'cell', a, v, cell })}>
                            {cell ? <>{cell.mark}{cell.footnotes?.length ? <sup>{cell.footnotes.join(',')}</sup> : null}</> : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {selected && !edit && (
            <div className="ds-source-panel">
              <div className="ds-item-head"><b>Source reference</b><button className="link-btn" onClick={() => setSelected(null)}>close</button></div>
              {selected.type === 'visit' && <><div>{selected.v.label}{selected.v.timing ? ` — as stated: “${selected.v.timing.text}”` : ''}</div><EvidenceList versionId={version.id} evidence={sourceEvidence(selected.v.source)} /></>}
              {selected.type === 'assessment' && <EvidenceList versionId={version.id} evidence={sourceEvidence(selected.a.source)} />}
              {selected.type === 'cell' && (
                selected.cell.source
                  ? <><div>{selected.a.name} at {selected.v.label}: “{selected.cell.source.text}” (row {selected.cell.source.row}, column {selected.cell.source.column})</div><EvidenceList versionId={version.id} evidence={sourceEvidence({ ...selected.cell.source, text: undefined })} /></>
                  : <div className="ds-muted">Added by a user edit — no protocol source.</div>
              )}
            </div>
          )}

          {edit && (
            <div className="ds-savebar">
              <input className="form-control" placeholder="Describe the change (kept in revision history)" value={note} onChange={e => setNote(e.target.value)} />
              <button className="btn btn-secondary btn-sm" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save as new revision'}</button>
            </div>
          )}

          {art.timeline?.length > 0 && !edit && (
            <>
              <div className="ds-subhead">Visit timeline</div>
              <div className="ds-timeline">
                {art.timeline.map((t, n) => (
                  <div key={t.visit_id} className="ds-tl-item">
                    <div className="ds-tl-dot">{n + 1}</div>
                    <div>
                      <div className="row-title">{t.label}</div>
                      <div className="ds-small ds-muted">{t.phase} · {t.timing}{t.approx_day !== null && t.approx ? ` (≈ day ${t.approx_day})` : ''} · window {t.window}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ds-muted ds-small">Order uses the stated timing; “≈ day” is derived only for ordering week/month timings.</div>
            </>
          )}

          {art.data.assignment_basis === 'shading' && (
            <div className="ds-alert">Assignments were read from cell shading in the protocol table. Confirm the convention (see scheduling issues) before approval.</div>
          )}

          <SoaTemplates study={study} version={version} role={role} onError={setError} />

          <div className="ds-columns">
            <div>
              <div className="ds-subhead">Footnotes</div>
              {m.footnotes?.length ? <ul className="ds-plain">{m.footnotes.map((f, i) => <li key={i}><b>{f.marker}</b> {f.text}</li>)}</ul> : <div className="ds-muted">None found</div>}
              <div className="ds-subhead">Timing conventions (as stated)</div>
              {m.conventions?.length ? <ul className="ds-plain">{m.conventions.map((c, i) => <li key={i}>{c.text} <EvidenceList versionId={version.id} evidence={c.evidence} compact /></li>)}</ul> : <div className="ds-muted">None found</div>}
              {art.source_diff?.length > 0 && (
                <>
                  <div className="ds-subhead">Differences from the protocol-derived matrix</div>
                  <ul className="ds-plain">{art.source_diff.map((d, i) => <li key={i}><span className="ds-tag">{d.type.replace(/_/g, ' ')}</span> {d.detail}</li>)}</ul>
                </>
              )}
            </div>
            <div>
              <div className="ds-subhead">Scheduling issues ({openIssues.length} open)</div>
              {(m.issues || []).length === 0 && <div className="ds-muted">No issues.</div>}
              {(m.issues || []).map(i => (
                <div key={i.id} className={`ds-item ${i.status === 'resolved' ? 'done' : ''}`}>
                  <div className="ds-item-head"><b>{i.id}</b> <StatusPill value={i.severity === 'conflict' ? 'conflict' : i.severity === 'warning' ? 'pending' : 'reviewed'} label={i.severity} /> <StatusPill value={i.status} /></div>
                  <div>{i.description}</div>
                  {i.resolution && <div className="ds-muted ds-small">Reviewed: “{i.resolution.note}” — {i.resolution.by}</div>}
                  {can(role, 'reviewer') && !edit && (
                    <div className="ds-inline">
                      <input className="form-control" placeholder="Review note" value={issueNotes[i.id] || ''} onChange={e => setIssueNotes({ ...issueNotes, [i.id]: e.target.value })} />
                      <button className="btn btn-secondary btn-sm" disabled={busy || !issueNotes[i.id]}
                        onClick={() => act(() => resolveSoaIssue(version.id, i.id, issueNotes[i.id], i.status === 'resolved'))}>{i.status === 'resolved' ? 'Reopen' : 'Mark reviewed'}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <RevisionHistory history={art.history} />
        </Card>
      )}
    </div>
  );
}
