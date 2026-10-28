// Shared study header for the DESIGN workspace: study, protocol version, processing and review status.
import { useState } from 'react';
import { StatusPill } from './DesignUi';

export default function StudyHeader({ studies, study, version, onSelectStudy, onSelectVersion, onCreateStudy, busy }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ study_code: '', title: '', sponsor: '', therapeutic_area: '' });
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await onCreateStudy(form);
      setCreating(false);
      setForm({ study_code: '', title: '', sponsor: '', therapeutic_area: '' });
    } catch (ex) { setErr(ex.message); }
  };

  const processing = version && !['completed', 'failed'].includes(version.processing_status);

  return (
    <div className="ds-header card">
      <div className="ds-header-row">
        <div className="form-group ds-header-field">
          <label htmlFor="ds-study">Study</label>
          <select id="ds-study" className="form-control" value={study?.id || ''} onChange={(e) => onSelectStudy(e.target.value || null)} disabled={busy}>
            <option value="">{studies.length ? 'Select a study…' : 'No studies yet'}</option>
            {studies.map(s => <option key={s.id} value={s.id}>{s.study_code}{s.title ? ` — ${s.title}` : ''}</option>)}
          </select>
        </div>
        <div className="form-group ds-header-field">
          <label htmlFor="ds-version">Protocol version</label>
          <select id="ds-version" className="form-control" value={version?.id || ''} onChange={(e) => onSelectVersion(e.target.value || null)}
            disabled={!study || !study.versions?.length || busy}>
            <option value="">{study?.versions?.length ? 'Select a version…' : 'No versions registered'}</option>
            {(study?.versions || []).map(v => (
              <option key={v.id} value={v.id}>{v.label}{v.amendment_number ? ` (Amendment ${v.amendment_number})` : ''} — {v.filename}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-secondary btn-sm ds-new-study" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New study'}
        </button>
      </div>

      {study && (
        <div className="ds-header-meta">
          <span><b>Study ID</b> {study.study_code}</span>
          {study.sponsor && <span><b>Sponsor</b> {study.sponsor}</span>}
          {study.therapeutic_area && <span><b>Area</b> {study.therapeutic_area}</span>}
          <span><b>Protocol version</b> {version ? version.label : '—'}</span>
          <span><b>Processing</b> {version ? <StatusPill value={version.processing_status} /> : '—'}</span>
          <span><b>Review</b> {version ? <StatusPill value={version.review_status} /> : '—'}</span>
          <span><b>Your role</b> {study.role}</span>
        </div>
      )}
      {processing && (
        <div className="ds-progress">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${version.processing_progress}%` }} /></div>
          <span>{version.processing_message}</span>
        </div>
      )}
      {version?.processing_status === 'failed' && <div className="ds-alert error">{version.processing_message}</div>}
      {version?.processing_status === 'completed' && version.processing_message && version.processing_message !== 'Extraction complete' && (
        <div className="ds-alert">{version.processing_message}</div>
      )}

      {creating && (
        <form className="ds-form-grid" onSubmit={submit}>
          <div className="form-group"><label>Study ID *</label><input required value={form.study_code} onChange={e => setForm({ ...form, study_code: e.target.value })} placeholder="e.g. DX-301" /></div>
          <div className="form-group"><label>Study title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="form-group"><label>Sponsor</label><input value={form.sponsor} onChange={e => setForm({ ...form, sponsor: e.target.value })} /></div>
          <div className="form-group"><label>Therapeutic area</label><input value={form.therapeutic_area} onChange={e => setForm({ ...form, therapeutic_area: e.target.value })} /></div>
          <div className="ds-form-actions">
            {err && <span className="ds-error-text">{err}</span>}
            <button className="btn btn-primary btn-sm" type="submit">Create study</button>
          </div>
        </form>
      )}
    </div>
  );
}
