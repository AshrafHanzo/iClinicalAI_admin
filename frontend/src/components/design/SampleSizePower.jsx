// Feature 10 — Sample Size & Power: deterministic calculations with saved, versioned scenarios.
import { useEffect, useState } from 'react';
import { getIntelligence, listSampleSize, previewSampleSize, saveSampleSize, verifySampleSize } from '../../services/designApi';
import { Card, EmptyState, ErrorBanner, ExportMenu, NeedsVersion, StatusPill, can } from './DesignUi';

const DEFAULTS = {
  endpoint_type: 'continuous', design: 'parallel', hypothesis: 'superiority', sided: 2, alpha: 0.05, power: 0.8,
  allocation_ratio: '1:1', dropout: 10, delta: '', sd: '', p1: '', p2: '', hazard_ratio: '', event_probability: '',
  margin: '', units: '', continuity_correction: false, primary_endpoint: '',
};

function toInputs(f) {
  const out = { ...f, dropout: (parseFloat(f.dropout) || 0) / 100, sided: Number(f.sided) };
  ['alpha', 'power', 'delta', 'sd', 'p1', 'p2', 'hazard_ratio', 'event_probability', 'margin'].forEach(k => {
    if (out[k] === '' || out[k] === null) delete out[k];
  });
  return out;
}

function Num({ label, k, f, set, step = 'any', hint }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type="number" step={step} value={f[k]} onChange={e => set({ ...f, [k]: e.target.value })} />
      {hint && <span className="ds-muted ds-small">{hint}</span>}
    </div>
  );
}

function Result({ r }) {
  const maxN = Math.max(r.enrollment.total, ...r.sensitivity.map(s => s.enrollment_total || 0));
  return (
    <div className="ds-result">
      <div className="ds-alert">{r.disclaimer}</div>
      <div className="stat-grid ds-mini-stats">
        <div className="stat-tile tone-2"><div className="stat-tile-label">Evaluable total</div><div className="stat-tile-value">{r.evaluable.total}</div>
          <div className="stat-tile-sub">{r.arms.map((a, i) => `${a}: ${r.evaluable.per_arm[i]}`).join(' · ')}</div></div>
        <div className="stat-tile tone-3"><div className="stat-tile-label">Enrollment target</div><div className="stat-tile-value">{r.enrollment.total}</div>
          <div className="stat-tile-sub">{r.arms.map((a, i) => `${a}: ${r.enrollment.per_arm[i]}`).join(' · ')}</div></div>
        {r.events && <div className="stat-tile tone-4"><div className="stat-tile-label">Required events</div><div className="stat-tile-value">{r.events}</div></div>}
      </div>
      <div className="ds-subhead">Method</div>
      <div><b>{r.method_name}</b> — {r.reference}</div>
      {r.statistical_test && (
        <div className="ds-small"><b>Statistical test:</b> {r.statistical_test}. <span className="ds-muted">Default because: {r.test_justification}</span></div>
      )}
      <pre className="ds-formula">{r.formula}{'\n'}{r.attrition_formula}</pre>
      <div className="ds-muted ds-small">Rounding: {r.rounding} Unrounded: {JSON.stringify(r.raw)} · Engine {r.method_version}</div>
      <div className="ds-columns">
        <div><div className="ds-subhead">Assumptions</div><ul className="ds-plain">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
        <div><div className="ds-subhead">Limitations</div><ul className="ds-plain">{[...r.limitations, ...r.warnings].map((a, i) => <li key={i}>{a}</li>)}</ul></div>
      </div>
      <div className="ds-subhead">Sensitivity analysis</div>
      <table className="dash-table ds-table">
        <thead><tr><th>Parameter</th><th>Value</th><th>Evaluable</th><th>Enrollment</th><th style={{ width: '35%' }}></th></tr></thead>
        <tbody>
          <tr className="selected"><td>Base case</td><td>—</td><td>{r.evaluable.total}</td><td>{r.enrollment.total}</td>
            <td><div className="progress-track"><div className="progress-fill" style={{ width: `${(r.enrollment.total / maxN) * 100}%` }} /></div></td></tr>
          {r.sensitivity.map((s, i) => (
            <tr key={i}><td>{s.parameter}</td><td>{s.value}</td><td>{s.evaluable_total ?? <span className="ds-error-text">{s.error}</span>}</td><td>{s.enrollment_total ?? ''}</td>
              <td>{s.enrollment_total ? <div className="progress-track"><div className="progress-fill" style={{ width: `${(s.enrollment_total / maxN) * 100}%` }} /></div> : null}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SampleSizePower({ version, role, onSummary }) {
  const [f, setF] = useState(DEFAULTS);
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  useEffect(() => {
    const latest = result || scenarios[0]?.data.result;
    onSummary?.({
      has: !!latest, running: busy, approved: false, reviewed: false,
      items: [
        { label: 'Saved Scenarios', value: scenarios.length, desc: 'for this protocol version' },
        { label: 'Enrollment Target', value: latest ? latest.enrollment.total : '—', desc: latest ? `${latest.evaluable.total} evaluable` : 'calculate to see' },
        { label: 'Status', value: latest ? '✓ Calculated' : '⏳ Pending', badge: latest ? 'success' : 'warning', desc: 'Planning estimate — statistician review' },
      ],
    });
  }, [result, scenarios, busy]);
  const [compare, setCompare] = useState([]);
  const [protocolFacts, setProtocolFacts] = useState(null);
  const [verified, setVerified] = useState({});

  useEffect(() => {
    setScenarios([]); setResult(null); setCompare([]); setProtocolFacts(null);
    if (!version || version.processing_status !== 'completed') return;
    listSampleSize(version.id).then(r => setScenarios(r.scenarios)).catch(e => setError(e.message));
    getIntelligence(version.id).then(a => {
      const by = Object.fromEntries(a.data.fields.map(x => [x.key, x]));
      const val = (k) => (by[k] && by[k].status !== 'missing' ? by[k].value : null);
      const primary = val('primary_endpoints');
      setProtocolFacts({ primary: Array.isArray(primary) ? primary[0] : primary, sample: val('sample_size'), randomization: val('randomization') });
      if (Array.isArray(primary) && primary[0]) setF(prev => ({ ...prev, primary_endpoint: prev.primary_endpoint || primary[0] }));
    }).catch(() => {});
  }, [version?.id, version?.processing_status]);

  if (!version) return <NeedsVersion title="Sample Size & Power" />;

  const run = async (persist) => {
    setBusy(true); setError('');
    try {
      if (persist) {
        const a = await saveSampleSize(version.id, name, toInputs(f));
        setResult(a.data.result);
        setScenarios(prev => [a, ...prev]);
      } else {
        setResult(await previewSampleSize(toInputs(f)));
      }
    } catch (e) { setError(e.message); setResult(null); }
    finally { setBusy(false); }
  };
  const load = (a) => {
    const s = a.data.submitted_inputs;
    setF({ ...DEFAULTS, ...s, dropout: (s.dropout || 0) * 100 });
    setName(`${a.data.name} (copy)`);
    setResult(a.data.result);
  };
  const verify = async (a) => {
    try { const r = await verifySampleSize(version.id, a.id); setVerified(v => ({ ...v, [a.id]: r })); } catch (e) { setError(e.message); }
  };

  const selected = scenarios.filter(s => compare.includes(s.id));
  return (
    <div className="ds-stack">
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      <Card title="Calculation inputs">
        <div className="ds-alert">Numbers come from a deterministic, tested statistical engine — never from the AI model.</div>
        {protocolFacts && (
          <div className="ds-muted ds-small">From the protocol: planned sample size {protocolFacts.sample || 'not specified'} · randomization {protocolFacts.randomization || 'not specified'}</div>
        )}
        <div className="ds-form-grid">
          <div className="form-group ds-span-2"><label>Primary endpoint</label><input value={f.primary_endpoint} onChange={e => setF({ ...f, primary_endpoint: e.target.value })} /></div>
          <div className="form-group">
            <label>Endpoint type</label>
            <select value={f.endpoint_type} onChange={e => setF({ ...f, endpoint_type: e.target.value })}>
              <option value="continuous">Continuous</option><option value="binary">Binary (proportion)</option><option value="time_to_event">Time to event</option>
            </select>
          </div>
          <div className="form-group">
            <label>Study design</label>
            <select value={f.design} onChange={e => setF({ ...f, design: e.target.value })}>
              <option value="parallel">Parallel, two groups</option><option value="single_arm">Single arm / paired</option>
              <option value="crossover">Crossover</option><option value="cluster">Cluster randomised</option>
              <option value="multi_arm">More than two arms</option><option value="adaptive">Adaptive / group sequential</option>
            </select>
          </div>
          <div className="form-group">
            <label>Hypothesis</label>
            <select value={f.hypothesis} onChange={e => setF({ ...f, hypothesis: e.target.value, ...(e.target.value === 'non_inferiority' ? { sided: 1, alpha: 0.025 } : {}) })}>
              <option value="superiority">Superiority</option><option value="non_inferiority">Non-inferiority</option>
            </select>
          </div>
          <div className="form-group">
            <label>Sidedness</label>
            <select value={f.sided} onChange={e => setF({ ...f, sided: e.target.value })}><option value={2}>Two-sided</option><option value={1}>One-sided</option></select>
          </div>
          <Num label="Significance level (α)" k="alpha" f={f} set={setF} />
          <Num label="Power (1 − β)" k="power" f={f} set={setF} />
          {f.design === 'parallel' && <div className="form-group"><label>Allocation (group 1 : group 2)</label><input value={f.allocation_ratio} onChange={e => setF({ ...f, allocation_ratio: e.target.value })} /></div>}
          <Num label="Dropout / non-evaluable (%)" k="dropout" f={f} set={setF} />
          {f.endpoint_type === 'continuous' && <>
            <Num label="Expected difference (Δ)" k="delta" f={f} set={setF} />
            <Num label="Standard deviation (σ)" k="sd" f={f} set={setF} />
            <div className="form-group"><label>Units</label><input value={f.units} onChange={e => setF({ ...f, units: e.target.value })} placeholder="e.g. % HbA1c" /></div>
          </>}
          {f.endpoint_type === 'binary' && <>
            <Num label="Proportion group 1 (experimental)" k="p1" f={f} set={setF} hint="0–1" />
            <Num label="Proportion group 2 (control)" k="p2" f={f} set={setF} hint="0–1" />
            <label className="ds-check"><input type="checkbox" checked={f.continuity_correction} onChange={e => setF({ ...f, continuity_correction: e.target.checked })} /> Continuity correction</label>
          </>}
          {f.endpoint_type === 'time_to_event' && <>
            <Num label="Hazard ratio" k="hazard_ratio" f={f} set={setF} />
            <Num label="P(event) during follow-up" k="event_probability" f={f} set={setF} hint="pooled across groups, 0–1" />
          </>}
          {f.hypothesis === 'non_inferiority' && <Num label="Non-inferiority margin" k="margin" f={f} set={setF} />}
        </div>
        <div className="ds-form-actions">
          <input className="form-control" style={{ maxWidth: 260 }} placeholder="Scenario name" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn btn-secondary" disabled={busy} onClick={() => run(false)}>Calculate</button>
          {can(role, 'editor') && <button className="btn btn-primary" disabled={busy} onClick={() => run(true)}>Calculate and save scenario</button>}
        </div>
      </Card>

      {result && <Card title="Result"><Result r={result} /></Card>}

      <Card title={`Saved scenarios (${scenarios.length})`}>
        {!scenarios.length ? <EmptyState title="No saved scenarios" text="Saved scenarios keep their inputs and engine version, so each result can be reproduced." /> : (
          <div className="table-scroll"><table className="dash-table ds-table">
            <thead><tr><th>Compare</th><th>Scenario</th><th>Method</th><th>α / power</th><th>Evaluable</th><th>Enrollment</th><th>Saved</th><th>Actions</th></tr></thead>
            <tbody>{scenarios.map(a => {
              const r = a.data.result;
              const v = verified[a.id];
              return (
                <tr key={a.id}>
                  <td><input type="checkbox" checked={compare.includes(a.id)} onChange={e => setCompare(e.target.checked ? [...compare, a.id] : compare.filter(x => x !== a.id))} /></td>
                  <td className="row-title">{a.data.name}</td><td>{r.method_name}</td><td>{r.inputs.alpha} / {r.inputs.power}</td>
                  <td>{r.evaluable.total}</td><td>{r.enrollment.total}</td><td className="nowrap">{new Date(a.created_at).toLocaleString()}</td>
                  <td>
                    <div className="ds-actions">
                      <button className="link-btn" onClick={() => load(a)}>Open</button>
                      <button className="link-btn" onClick={() => verify(a)}>Re-verify</button>
                      {v && <StatusPill value={v.reproducible ? 'verified' : 'conflict'} label={v.reproducible ? 'reproduced' : 'differs'} />}
                      <ExportMenu formats={['docx', 'pdf']} path={`/versions/${version.id}/sample-size/${a.id}/report`} onError={setError} />
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {selected.length >= 2 && (
          <>
            <div className="ds-subhead">Scenario comparison</div>
            <div className="table-scroll"><table className="dash-table ds-table">
              <thead><tr><th>Item</th>{selected.map(a => <th key={a.id}>{a.data.name}</th>)}</tr></thead>
              <tbody>
                {[['Method', r => r.method_name], ['Alpha', r => `${r.inputs.alpha} (${r.inputs.sided}-sided)`], ['Power', r => r.inputs.power],
                  ['Effect', r => r.inputs.delta ?? (r.inputs.p1 !== undefined ? `${r.inputs.p1} vs ${r.inputs.p2}` : `HR ${r.inputs.hazard_ratio}`)],
                  ['SD / P(event)', r => r.inputs.sd ?? r.inputs.event_probability ?? '—'], ['Dropout', r => `${Math.round(r.inputs.dropout * 100)}%`],
                  ['Allocation', r => r.inputs.allocation_ratio || '—'], ['Evaluable', r => r.evaluable.total], ['Enrollment', r => r.enrollment.total], ['Events', r => r.events || '—']]
                  .map(([label, fn]) => <tr key={label}><td>{label}</td>{selected.map(a => <td key={a.id}>{fn(a.data.result)}</td>)}</tr>)}
              </tbody>
            </table></div>
          </>
        )}
      </Card>
    </div>
  );
}
