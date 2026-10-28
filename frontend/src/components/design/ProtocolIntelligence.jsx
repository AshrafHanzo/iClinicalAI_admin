// Feature 01 — Protocol Intelligence: register a protocol, follow processing, review/edit/verify extracted fields.
import { useEffect, useMemo, useState } from 'react';
import { downloadDesignFile, getIntelligence, registerExistingDocument, registerProtocolVersion, reprocessVersion, updateIntelligenceFields } from '../../services/designApi';
import { Card, EmptyState, ErrorBanner, EvidenceList, ExportMenu, Loading, RevisionHistory, StatusPill, can , statusCard } from './DesignUi';

const FIELD_GROUPS = ['Study identification', 'Objectives', 'Design', 'Population', 'Eligibility', 'Endpoints', 'Schedule', 'Safety & statistics'];

const SUPPORTING_KINDS = [
  ['amendment', 'Amendment'], ['synopsis', 'Synopsis'], ['schedule_of_assessments', 'Schedule of assessments'],
  ['statistical_analysis_plan', 'Statistical analysis plan'], ['other', 'Other'],
];

export function RegisterVersionForm({ study, legacyDocs = [], onRegistered, title = 'Register protocol version' }) {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({
    version_label: '', amendment_number: '', effective_date: '', amendment_reason: '', language: 'en', use_ai: true,
    field_groups: FIELD_GROUPS, review_threshold: 0.8, ai_scope: 'full', include_supporting: true,
  });
  const [supporting, setSupporting] = useState([]);
  const [existingId, setExistingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pickFile = (f) => {
    setErr('');
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) { setErr('Protocols must be PDF or DOCX files.'); return; }
    if (f.size > 20 * 1024 * 1024) { setErr('File too large (maximum 20 MB).'); return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file && !existingId) { setErr('Choose a protocol file or an existing document.'); return; }
    setBusy(true); setErr('');
    try {
      const v = file
        ? await registerProtocolVersion(study.id, file, meta, supporting.filter(s => s.file))
        : await registerExistingDocument(study.id, {
          document_id: existingId, ...meta,
          preferences: { use_ai: meta.use_ai, field_groups: meta.field_groups, review_threshold: meta.review_threshold,
                         ai_scope: meta.ai_scope, include_supporting: meta.include_supporting },
        });
      setFile(null); setSupporting([]); setExistingId('');
      onRegistered(v);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <Card title={title}>
      <form onSubmit={submit} className="ds-register">
        <div className="ds-form-grid">
          <div className="form-group ds-span-2">
            <label>Protocol document (PDF or DOCX) *</label>
            <input type="file" accept=".pdf,.docx" onChange={e => pickFile(e.target.files[0])} />
            {file && <span className="ds-muted">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
          </div>
          {legacyDocs.length > 0 && (
            <div className="form-group ds-span-2">
              <label>…or register a document already uploaded to DESIGN</label>
              <select className="form-control" value={existingId} onChange={e => { setExistingId(e.target.value); setFile(null); }} disabled={!!file}>
                <option value="">—</option>
                {legacyDocs.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
              </select>
            </div>
          )}
          <div className="form-group"><label>Protocol version</label><input value={meta.version_label} onChange={e => setMeta({ ...meta, version_label: e.target.value })} placeholder="e.g. 1.0" /></div>
          <div className="form-group"><label>Amendment number</label><input value={meta.amendment_number} onChange={e => setMeta({ ...meta, amendment_number: e.target.value })} /></div>
          <div className="form-group"><label>Effective date</label><input type="date" value={meta.effective_date} onChange={e => setMeta({ ...meta, effective_date: e.target.value })} /></div>
          <div className="form-group">
            <label>Document language</label>
            <select value={meta.language} onChange={e => setMeta({ ...meta, language: e.target.value })}>
              {[['en', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['it', 'Italian'], ['ja', 'Japanese'], ['other', 'Other']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group ds-span-2"><label>Reason for amendment</label><input value={meta.amendment_reason} onChange={e => setMeta({ ...meta, amendment_reason: e.target.value })} /></div>
        </div>

        <div className="ds-subhead">Extraction preferences</div>
        <div className="ds-form-grid">
          <div className="form-group ds-span-2">
            <label>Information to extract</label>
            <div className="ds-checks">
              {FIELD_GROUPS.map(g => (
                <label key={g} className="ds-check">
                  <input type="checkbox" checked={meta.field_groups.includes(g)}
                    onChange={e => setMeta({ ...meta, field_groups: e.target.checked ? [...meta.field_groups, g] : meta.field_groups.filter(x => x !== g) })} />
                  {g}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Flag for review below confidence</label>
            <select value={meta.review_threshold} onChange={e => setMeta({ ...meta, review_threshold: Number(e.target.value) })}>
              {[0.6, 0.7, 0.8, 0.9].map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>AI reads</label>
            <select value={meta.ai_scope} onChange={e => setMeta({ ...meta, ai_scope: e.target.value })} disabled={!meta.use_ai}>
              <option value="full">Whole document (relevant sections first)</option>
              <option value="relevant">Only sections relevant to the chosen information</option>
            </select>
          </div>
          <label className="ds-check ds-span-2">
            <input type="checkbox" checked={meta.use_ai} onChange={e => setMeta({ ...meta, use_ai: e.target.checked })} />
            Use AI-assisted extraction in addition to rule-based extraction (AI values are accepted only with evidence found in the document)
          </label>
          <label className="ds-check ds-span-2">
            <input type="checkbox" checked={meta.include_supporting} onChange={e => setMeta({ ...meta, include_supporting: e.target.checked })} />
            Also extract from the supporting documents (their evidence is cited by document and section)
          </label>
        </div>

        <div className="ds-subhead">Supporting documents (optional)</div>
        {supporting.map((s, i) => (
          <div key={i} className="ds-inline">
            <select className="form-control" value={s.kind} onChange={e => setSupporting(supporting.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}>
              {SUPPORTING_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="file" accept=".pdf,.docx" onChange={e => setSupporting(supporting.map((x, j) => j === i ? { ...x, file: e.target.files[0] } : x))} />
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSupporting(supporting.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setSupporting([...supporting, { kind: 'amendment', file: null }])}>+ Add supporting document</button>

        <div className="ds-form-actions">
          {err && <span className="ds-error-text">{err}</span>}
          <button className="btn btn-primary" type="submit" disabled={busy || !meta.field_groups.length}>{busy ? 'Uploading…' : 'Upload and process'}</button>
        </div>
        <p className="ds-muted">Earlier versions are never overwritten. The original file is stored unchanged and verified by checksum.</p>
      </form>
    </Card>
  );
}

const FILTERS = [
  ['all', 'All fields'], ['review', 'Needs review'], ['missing', 'Not specified'], ['conflict', 'Conflicting / ambiguous'],
  ['low', 'Low confidence'], ['verified', 'Verified'], ['excluded', 'Excluded by preferences'],
];

function fieldMatches(f, filter) {
  switch (filter) {
    case 'review': return f.needs_review && f.verification.status !== 'verified';
    case 'missing': return f.status === 'missing';
    case 'conflict': return ['conflict', 'ambiguous'].includes(f.status);
    case 'low': return f.confidence_level === 'low' && !['missing', 'not_requested'].includes(f.status);
    case 'verified': return f.verification.status === 'verified';
    case 'excluded': return f.status === 'not_requested';
    default: return true;
  }
}

function FieldRow({ f, versionId, role, staged, onStage }) {
  const [editing, setEditing] = useState(false);
  const pending = staged || {};
  const shownValue = pending.value !== undefined ? pending.value : f.value;
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(Array.isArray(shownValue) ? shownValue.join('\n') : (f.status === 'missing' && pending.value === undefined ? '' : shownValue));
    setEditing(true);
  };
  const applyEdit = () => {
    const value = f.multi ? draft.split('\n').map(s => s.trim()).filter(Boolean) : draft.trim();
    onStage({ ...pending, value });
    setEditing(false);
  };

  return (
    <div className={`ds-field ${f.needs_review && f.verification.status !== 'verified' ? 'flag' : ''}`}>
      <div className="ds-field-head">
        <div className="ds-field-label">{f.label}</div>
        <div className="ds-pills">
          <StatusPill value={f.status} label={f.status === 'missing' ? 'Not specified' : f.status === 'not_requested' ? 'Not extracted' : undefined} />
          {!['missing', 'not_requested'].includes(f.status) && f.source !== 'user' && <StatusPill value={f.confidence_level} label={`${f.confidence_level} confidence · ${Math.round(f.confidence * 100)}%`} />}
          <StatusPill value={f.verification.status} />
          {f.source && <span className="ds-tag">{f.source === 'rule+ai' ? 'rule + AI' : f.source}</span>}
        </div>
      </div>

      {editing ? (
        <div className="ds-edit">
          <textarea className="form-control" rows={f.multi ? 5 : 3} value={draft} onChange={e => setDraft(e.target.value)}
            placeholder={f.multi ? 'One item per line' : 'Value as stated in the protocol (leave empty if not specified)'} />
          <div className="ds-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={applyEdit}>Stage change</button>
          </div>
        </div>
      ) : (
        <div className="ds-value">
          {Array.isArray(shownValue)
            ? (shownValue.length ? <ol>{shownValue.map((v, i) => <li key={i}>{v}</li>)}</ol> : <span className="ds-ns">Not specified</span>)
            : (f.status === 'not_requested' && pending.value === undefined ? <span className="ds-ns">Not extracted (excluded by extraction preferences)</span>
              : shownValue === 'Not specified' || !shownValue ? <span className="ds-ns">Not specified</span> : shownValue)}
          {pending.value !== undefined && <span className="ds-tag warn">unsaved edit</span>}
          {pending.verify && <span className="ds-tag ok">will be verified</span>}
        </div>
      )}

      {f.flags?.length > 0 && <ul className="ds-flags">{f.flags.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {f.alternatives?.length > 0 && (
        <details className="ds-alt">
          <summary>{f.alternatives.length} alternative value(s) found</summary>
          {f.alternatives.map((a, i) => (
            <div key={i} className="ds-alt-item">
              <div>{Array.isArray(a.value) ? a.value.join('; ') : a.value} <span className="ds-tag">{a.source}</span></div>
              <EvidenceList versionId={versionId} evidence={a.evidence} compact />
            </div>
          ))}
        </details>
      )}
      <div className="ds-field-foot">
        <EvidenceList versionId={versionId} evidence={f.evidence} compact={!f.multi} />
        <div className="ds-actions">
          {can(role, 'editor') && !editing && <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit</button>}
          {can(role, 'reviewer') && f.verification.status !== 'verified' && (
            <button className="btn btn-secondary btn-sm" onClick={() => onStage({ ...pending, verify: !pending.verify })}>
              {pending.verify ? 'Undo verify' : 'Verify'}
            </button>
          )}
          {staged && <button className="link-btn" onClick={() => onStage(null)}>Discard</button>}
        </div>
      </div>
      {f.verification.status !== 'unverified' && f.verification.at && (
        <div className="ds-muted ds-small">{f.verification.status} by {f.verification.by} · {new Date(f.verification.at).toLocaleString()}{f.verification.note ? ` · “${f.verification.note}”` : ''}</div>
      )}
    </div>
  );
}

export default function ProtocolIntelligence({ study, version, role, legacyDocs, onRegistered, onVersionUpdated, onSummary }) {
  const [art, setArt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [staged, setStaged] = useState({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const ready = version?.processing_status === 'completed';
  // Counts shown in the page's stat cards
  useEffect(() => {
    const s = art?.data.summary;
    const requested = s ? s.total - (s.not_requested || 0) : 0;
    const verified = version?.review_status === 'verified';
    onSummary?.({
      has: !!art, approved: verified, reviewed: version?.review_status === 'in_review',
      items: [
        { label: 'Fields Extracted', value: s ? `${requested - s.missing}/${requested}` : '—', desc: s ? `${s.missing} not specified` : 'Upload a protocol' },
        { label: 'Needs Review', value: s ? s.needs_review : '—', desc: s ? `${s.verified} verified` : 'fields to check' },
        version?.processing_status && version.processing_status !== 'completed'
          ? { label: 'Status', value: version.processing_status === 'failed' ? '✕ Failed' : '⏳ Processing', badge: version.processing_status === 'failed' ? 'error' : 'warning', desc: version.processing_message?.slice(0, 60) }
          : { label: 'Status', value: verified ? '✓ Verified' : art ? '📝 Unverified' : '⏳ Pending', badge: verified ? 'success' : 'warning', desc: art ? `Revision ${art.revision}` : 'No extraction yet' },
      ],
    });
  }, [art, version?.review_status, version?.processing_status]);
  useEffect(() => {
    setArt(null); setStaged({}); setError('');
    if (!ready) return;
    setLoading(true);
    getIntelligence(version.id).then(setArt).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [version?.id, ready]);

  const groups = useMemo(() => {
    const out = {};
    (art?.data.fields || []).filter(f => fieldMatches(f, filter)).forEach(f => { (out[f.category] = out[f.category] || []).push(f); });
    return out;
  }, [art, filter]);

  const save = async () => {
    const updates = Object.entries(staged).filter(([, v]) => v).map(([key, v]) => ({ key, value: v.value, verify: !!v.verify, note: note || null }));
    if (!updates.length) return;
    setSaving(true); setError('');
    try {
      setArt(await updateIntelligenceFields(version.id, updates, art.revision));
      setStaged({}); setNote('');
      onVersionUpdated?.();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const reprocess = async () => {
    if (!window.confirm('Re-run extraction? A new revision is created; your current revisions are kept in the history.')) return;
    try { await reprocessVersion(version.id); onVersionUpdated?.(); } catch (e) { setError(e.message); }
  };

  if (!study) return <EmptyState title="Create or select a study" text="Use the study header above to create a study, then register its protocol." />;

  const s = art?.data.summary;
  const stagedCount = Object.values(staged).filter(Boolean).length;
  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {(!version || showRegister) && can(role, 'editor') && (
        <RegisterVersionForm study={study} legacyDocs={legacyDocs} onRegistered={(v) => { setShowRegister(false); onRegistered(v); }}
          title={study.versions?.length ? 'Register a new protocol version' : 'Register the protocol'} />
      )}
      {version && !showRegister && can(role, 'editor') && (
        <div className="ds-actions"><button className="btn btn-secondary btn-sm" onClick={() => setShowRegister(true)}>+ Register new version</button></div>
      )}
      {version && !ready && version.processing_status !== 'failed' && <Loading text={version.processing_message || 'Processing protocol…'} />}
      {version?.processing_status === 'failed' && (
        <EmptyState title="Processing failed" text={version.processing_message}>
          {can(role, 'editor') && <button className="btn btn-secondary" onClick={reprocess}>Retry processing</button>}
        </EmptyState>
      )}
      {loading && <Loading text="Loading extracted study information…" />}

      {art && (
        <Card title="Extracted study information" actions={
          <>
            <ExportMenu formats={['json', 'xlsx']} path={`/versions/${version.id}/intelligence/export`} onError={setError} />
            <button className="btn btn-secondary btn-sm" onClick={() => downloadDesignFile(`/versions/${version.id}/original`).catch(e => setError(e.message))}>
              Original document
            </button>
            {can(role, 'editor') && <button className="btn btn-secondary btn-sm" onClick={reprocess}>Re-run extraction</button>}
          </>
        }>
          <div className="stat-grid ds-mini-stats">
            {[['Fields', s.total], ['Extracted', s.extracted], ['Not specified', s.missing], ['Conflicts', s.conflict || 0],
              ['Ambiguous', s.ambiguous || 0], ['Low confidence', s.low_confidence || 0], ['Verified', s.verified]].map(([l, v]) => (
              <div key={l} className="stat-tile"><div className="stat-tile-label">{l}</div><div className="stat-tile-value">{v}</div></div>
            ))}
          </div>
          <div className="ds-muted ds-small">
            Revision {art.revision} · {art.data.extraction.ai_used ? 'Rule-based + AI extraction' : 'Rule-based extraction'} · {art.method_version}
            {art.data.document?.page_count ? ` · ${art.data.document.page_count} pages` : ''}
            {art.data.extraction.ai_error ? ` · AI unavailable: ${art.data.extraction.ai_error}` : ''}
          </div>
          {art.data.characteristics?.length > 0 && (
            <div className="ds-characteristics">
              <div className="ds-subhead">Protocol summary — study characteristics</div>
              <dl className="glance-list">
                {art.data.characteristics.map(c => (
                  <div key={c.key} style={{ display: 'contents' }}>
                    <dt>{c.label}</dt>
                    <dd>{c.value === 'Not specified' ? <span className="ds-ns">Not specified</span> : c.value}
                      {' '}<StatusPill value={c.verification} /></dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {art.data.preferences && (
            <div className="ds-muted ds-small">
              Preferences: {art.data.preferences.field_groups.length} of 8 information groups · review below {Math.round(art.data.preferences.review_threshold * 100)}% confidence
              · supporting documents {art.data.preferences.include_supporting ? 'included' : 'not used'}
            </div>
          )}
          <div className="tabs ds-filter-tabs">
            {FILTERS.map(([id, l]) => (
              <button key={id} className={`tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
                {l} ({(art.data.fields || []).filter(f => fieldMatches(f, id)).length})
              </button>
            ))}
          </div>
          {Object.keys(groups).length === 0 && <EmptyState title="No fields match this filter" />}
          {Object.entries(groups).map(([cat, fields]) => (
            <div key={cat} className="ds-group">
              <div className="ds-subhead">{cat}</div>
              {fields.map(f => (
                <FieldRow key={f.key} f={f} versionId={version.id} role={role} staged={staged[f.key]}
                  onStage={(v) => setStaged(prev => ({ ...prev, [f.key]: v }))} />
              ))}
            </div>
          ))}
          <RevisionHistory history={art.history} />
        </Card>
      )}

      {stagedCount > 0 && (
        <div className="ds-savebar">
          <span>{stagedCount} staged change(s)</span>
          <input className="form-control" placeholder="Review note (optional)" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={() => setStaged({})}>Discard all</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save as new revision'}</button>
        </div>
      )}
    </div>
  );
}
