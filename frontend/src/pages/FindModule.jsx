import { useState, useEffect, useRef } from 'react';
import { searchTrials, runTrialAnalysis, chatWithTrials, deleteTrial, listTrials } from '../services/api';
import { DashboardHeader, Panel, FeatureCards, StatGrid, Breakdown, countBy } from '../components/ModuleDashboard';
import { getModule } from '../moduleNav';

// Helper to format file sizes
const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Markdown renderer helper for tables and rich texts
function parseMarkdownTable(rows) {
  if (rows.length < 2) return '';
  let html = '<div class="table-container"><table class="clinical-table">';
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (i === 1 && cells.every(c => c.match(/^:?-+:?$/))) {
      continue;
    }
    html += '<tr>';
    for (let cell of cells) {
      if (i === 0) {
        html += `<th>${cell}</th>`;
      } else {
        let statusClass = '';
        if (cell.toLowerCase().includes('high') || cell === 'Recruiting') statusClass = 'status-badge success';
        else if (cell.toLowerCase().includes('moderate') || cell === 'Active, not recruiting') statusClass = 'status-badge warning';
        else if (cell.toLowerCase().includes('low') || cell === 'Completed') statusClass = 'status-badge info';
        
        if (statusClass) {
          html += `<td><span class="${statusClass}" style="padding:2px 8px;font-size:11px">${cell}</span></td>`;
        } else {
          html += `<td>${cell}</td>`;
        }
      }
    }
    html += '</tr>';
  }
  html += '</table></div>';
  return html;
}

function renderMarkdown(text) {
  if (!text) return '';
  
  let lines = text.split('\n');
  let inTable = false;
  let tableRows = [];
  let processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        processedLines.push(parseMarkdownTable(tableRows));
        inTable = false;
      }
      processedLines.push(lines[i]);
    }
  }
  if (inTable) {
    processedLines.push(parseMarkdownTable(tableRows));
  }
  
  let formattedText = processedLines.join('\n');
  
  return formattedText
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/# (.*)/g, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n\n/g, '<br/>');
}

export default function FindModule({ view = 'dashboard', onNavigate = () => {} }) {
  const [searchMode, setSearchMode] = useState('clinical'); // 'clinical' or 'academic'
  const [searchLive, setSearchLive] = useState(true);
  
  // Clinical inputs
  const [clinicalFilters, setClinicalFilters] = useState({
    indication: '',
    therapeutic_area: '',
    phase: 'All',
    sponsor: '',
    drug_name: '',
    country: '',
    status: 'All',
    study_design: '',
    enrolment_size: '',
    keywords: ''
  });

  // Academic inputs
  const [academicFilters, setAcademicFilters] = useState({
    research_topic: '',
    thesis_area: '',
    specialty: '',
    molecule: '',
    publication_topic: '',
    emerging_area: '',
    research_question: ''
  });

  const [trials, setTrials] = useState([]);
  // Dashboard search/filters over the saved trial library
  const [libQuery, setLibQuery] = useState('');
  const [libPhase, setLibPhase] = useState('all');
  const [libStatus, setLibStatus] = useState('all');
  const [libCountry, setLibCountry] = useState('all');
  const [selectedTrialIds, setSelectedTrialIds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  // The module sidebar and the step tabs both drive the active step.
  const activeTab = view === 'dashboard' ? 'results' : view;
  const setActiveTab = onNavigate;
  const [analysisResults, setAnalysisResults] = useState({});
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [loadingTab, setLoadingTab] = useState(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Load initial list of trials
    const loadInit = async () => {
      try {
        const res = await listTrials();
        setTrials(res.trials || []);
      } catch (err) {
        console.error('Failed to load trials:', err);
      }
    };
    loadInit();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleClinicalChange = (e) => {
    setClinicalFilters({ ...clinicalFilters, [e.target.name]: e.target.value });
  };

  const handleAcademicChange = (e) => {
    setAcademicFilters({ ...academicFilters, [e.target.name]: e.target.value });
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsSearching(true);
    try {
      const params = searchMode === 'clinical' 
        ? { mode: 'clinical', live: searchLive, ...clinicalFilters }
        : { mode: 'academic', live: searchLive, ...academicFilters };
        
      const res = await searchTrials(params);
      setTrials(res.trials || []);
      setSelectedTrialIds([]);
      setActiveTab('results');
      setAnalysisResults({}); // Clear previous AI results
      setChatMessages([]);
    } catch (err) {
      alert(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    if (searchMode === 'clinical') {
      setClinicalFilters({
        indication: '',
        therapeutic_area: '',
        phase: 'All',
        sponsor: '',
        drug_name: '',
        country: '',
        status: 'All',
        study_design: '',
        enrolment_size: '',
        keywords: ''
      });
    } else {
      setAcademicFilters({
        research_topic: '',
        thesis_area: '',
        specialty: '',
        molecule: '',
        publication_topic: '',
        emerging_area: '',
        research_question: ''
      });
    }
  };

  const handleSelectTrial = (id) => {
    setSelectedTrialIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedTrialIds.length === trials.length) {
      setSelectedTrialIds([]);
    } else {
      setSelectedTrialIds(trials.map(t => t.id));
    }
  };

  const runStepAnalysis = async (stepId) => {
    setIsLoadingAnalysis(true);
    setLoadingTab(stepId);
    try {
      const topicText = searchMode === 'academic' 
        ? academicFilters.research_topic || academicFilters.emerging_area || academicFilters.publication_topic
        : clinicalFilters.indication;
        
      const res = await runTrialAnalysis(stepId, selectedTrialIds, topicText, searchMode);
      setAnalysisResults(prev => ({ ...prev, [stepId]: res.result }));
    } catch (err) {
      alert(err.message || 'Analysis failed');
    } finally {
      setIsLoadingAnalysis(false);
      setLoadingTab(null);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;
    
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);
    
    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await chatWithTrials(selectedTrialIds, userMsg.content, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Chat request failed.'}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleDeleteTrial = async (id) => {
    if (!confirm('Are you sure you want to delete this trial?')) return;
    try {
      await deleteTrial(id);
      setTrials(prev => prev.filter(t => t.id !== id));
      setSelectedTrialIds(prev => prev.filter(x => x !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete trial');
    }
  };

  // Step definition mapping
  const STEPS = [
    { id: 'results', label: 'Step 1: Search Results' },
    { id: 'metadata', label: 'Step 2: Metadata', type: 'metadata', needsSelection: true },
    { id: 'summary', label: 'Step 3: Summary', type: 'summary', needsSelection: true },
    { id: 'similar', label: 'Step 4: Similar Trials', type: 'similar', needsSelection: true },
    { id: 'comparison', label: 'Step 5: Comparison', type: 'comparison', needsSelection: true, minCount: 2 },
    { id: 'recruiting', label: 'Step 6: Recruiting', type: 'recruiting', needsSelection: true },
    { id: 'gaps', label: 'Step 7: Gaps', type: 'gaps' },
    { id: 'topics', label: 'Step 8: Topics', type: 'topics' },
    { id: 'dissertation', label: 'Step 9: Dissertation', type: 'dissertation' },
    { id: 'chat', label: '💬 Ask AI' }
  ];

  if (view === 'dashboard') {
    const q = libQuery.toLowerCase();
    const phases = countBy(trials, t => t.phase);
    const statuses = countBy(trials, t => t.status);
    const countries = countBy(trials, t => t.countries);
    const sponsors = countBy(trials, t => t.sponsor);
    const filtered = trials
      .filter(t => !q || [t.nct_number, t.title, t.sponsor, t.indication, t.drug_name]
        .some(v => String(v || '').toLowerCase().includes(q)))
      .filter(t => libPhase === 'all' || t.phase === libPhase)
      .filter(t => libStatus === 'all' || t.status === libStatus)
      .filter(t => libCountry === 'all' || (t.countries || []).includes(libCountry));
    const statusClass = (s) => s === 'Recruiting' ? 'success' : s === 'Completed' ? 'info' : 'warning';

    return (
      <div className="dash">
        <DashboardHeader title="Welcome to Find" subtitle="AI-assisted Clinical Trial Search, Registry Intelligence & Research Discovery">
          <button className="btn btn-primary" onClick={() => onNavigate('results')}>🔍 Search Registry & AI</button>
        </DashboardHeader>

        <StatGrid items={[
          { label: 'Trials in Library', value: trials.length, sub: 'Saved from registry searches', tone: 2 },
          { label: 'Recruiting', value: trials.filter(t => t.status === 'Recruiting').length, sub: 'Currently enrolling', tone: 3 },
          { label: 'Completed', value: trials.filter(t => t.status === 'Completed').length, sub: 'Finished trials', tone: 4 },
          { label: 'Countries', value: countries.length, sub: 'With trial sites', tone: 5 },
          { label: 'Sponsors', value: sponsors.length, sub: 'Lead sponsors', tone: 6 },
        ]} />

        <Panel title="Trial Library" flush>
          <div className="dash-toolbar">
            <input
              className="dash-search"
              type="search"
              placeholder="Search by NCT number, title, sponsor, condition or drug..."
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
            />
            <select className="dash-filter" value={libPhase} onChange={(e) => setLibPhase(e.target.value)} aria-label="Filter by phase">
              <option value="all">All phases</option>
              {phases.map(([p]) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="dash-filter" value={libStatus} onChange={(e) => setLibStatus(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {statuses.map(([s]) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="dash-filter" value={libCountry} onChange={(e) => setLibCountry(e.target.value)} aria-label="Filter by country">
              <option value="all">All countries</option>
              {countries.map(([c]) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="dash-count">Showing {filtered.length} of {trials.length} • {selectedTrialIds.length} selected</span>
          </div>

          {trials.length === 0 ? (
            <div className="dash-empty">No trials yet. Use Search Registry & AI to pull trials from the registry.</div>
          ) : filtered.length === 0 ? (
            <div className="dash-empty">No trials match your search or filters.</div>
          ) : (
            <div className="table-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr><th></th><th>NCT Number</th><th>Title</th><th>Phase</th><th>Status</th><th>Sponsor</th><th>Countries</th></tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const selected = selectedTrialIds.includes(t.id);
                    return (
                      <tr key={t.id} className={selected ? 'selected' : ''} onClick={() => handleSelectTrial(t.id)} style={{ cursor: 'pointer' }}>
                        <td><input type="checkbox" checked={selected} readOnly /></td>
                        <td className="nowrap" style={{ fontWeight: 700, color: 'var(--accent)' }}>{t.nct_number}</td>
                        <td className="row-title">{t.title}</td>
                        <td className="nowrap">{t.phase}</td>
                        <td className="nowrap"><span className={`status-badge ${statusClass(t.status)}`}>{t.status}</span></td>
                        <td>{t.sponsor}</td>
                        <td>{(t.countries || []).filter(c => c !== 'N/A').slice(0, 3).join(', ')}{(t.countries || []).length > 3 ? ` +${t.countries.length - 3}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="dash-grid">
          <Panel title="Trials by Status">
            <Breakdown entries={statuses} total={trials.length} />
          </Panel>
          <Panel title="Trials by Phase">
            <Breakdown entries={phases} total={trials.length} />
          </Panel>
        </div>

        <Panel title="Features">
          <FeatureCards
            features={getModule('find').features}
            doneIds={Object.keys(analysisResults).filter(k => analysisResults[k])}
            onOpen={onNavigate}
          />
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>🔍 FIND Module</h2>
        <p>AI-assisted Clinical Trial Search, Registry Intelligence & Research Discovery</p>
      </div>

      {/* Mode Selector & Search Form */}
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(180deg, var(--bg-white) 0%, var(--bg-input) 100%)' }}>
        <div className="search-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${searchMode === 'clinical' ? 'active' : ''}`}
            onClick={() => { setSearchMode('clinical'); handleReset(); setTrials([]); }}
          >
            📋 Clinical Trial Search
          </button>
          <button
            type="button"
            className={`mode-btn ${searchMode === 'academic' ? 'active' : ''}`}
            onClick={() => { setSearchMode('academic'); handleReset(); setTrials([]); }}
          >
            🎓 Academic & Research Support
          </button>
        </div>

        <form onSubmit={handleSearch}>
          {searchMode === 'clinical' ? (
            <div className="search-grid">
              <div className="form-group">
                <label>Disease / Indication</label>
                <input 
                  type="text" 
                  name="indication" 
                  value={clinicalFilters.indication} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. Breast Cancer" 
                />
              </div>
              <div className="form-group">
                <label>Therapeutic Area</label>
                <input 
                  type="text" 
                  name="therapeutic_area" 
                  value={clinicalFilters.therapeutic_area} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. Oncology" 
                />
              </div>
              <div className="form-group">
                <label>Study Phase</label>
                <select name="phase" value={clinicalFilters.phase} onChange={handleClinicalChange}>
                  <option value="All">All Phases</option>
                  <option value="Phase I">Phase I</option>
                  <option value="Phase II">Phase II</option>
                  <option value="Phase III">Phase III</option>
                  <option value="Phase IV">Phase IV</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sponsor Name</label>
                <input 
                  type="text" 
                  name="sponsor" 
                  value={clinicalFilters.sponsor} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. Genentech" 
                />
              </div>
              <div className="form-group">
                <label>Drug / Molecule Name</label>
                <input 
                  type="text" 
                  name="drug_name" 
                  value={clinicalFilters.drug_name} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. Trastuzumab" 
                />
              </div>
              <div className="form-group">
                <label>Country</label>
                <input 
                  type="text" 
                  name="country" 
                  value={clinicalFilters.country} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. United States" 
                />
              </div>
              <div className="form-group">
                <label>Study Status</label>
                <select name="status" value={clinicalFilters.status} onChange={handleClinicalChange}>
                  <option value="All">All Statuses</option>
                  <option value="Recruiting">Recruiting</option>
                  <option value="Active, not recruiting">Active, not recruiting</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Study Design</label>
                <input 
                  type="text" 
                  name="study_design" 
                  value={clinicalFilters.study_design} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. Randomized" 
                />
              </div>
              <div className="form-group">
                <label>Keywords</label>
                <input 
                  type="text" 
                  name="keywords" 
                  value={clinicalFilters.keywords} 
                  onChange={handleClinicalChange} 
                  placeholder="e.g. ADC, biomarker" 
                />
              </div>
            </div>
          ) : (
            <div className="search-grid">
              <div className="form-group">
                <label>Research Topic</label>
                <input 
                  type="text" 
                  name="research_topic" 
                  value={academicFilters.research_topic} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Immunotherapy resistance" 
                />
              </div>
              <div className="form-group">
                <label>Thesis / Dissertation Area</label>
                <input 
                  type="text" 
                  name="thesis_area" 
                  value={academicFilters.thesis_area} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Oncology dissertation" 
                />
              </div>
              <div className="form-group">
                <label>Medical Specialty</label>
                <input 
                  type="text" 
                  name="specialty" 
                  value={academicFilters.specialty} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Endocrinology" 
                />
              </div>
              <div className="form-group">
                <label>Drug / Molecule</label>
                <input 
                  type="text" 
                  name="molecule" 
                  value={academicFilters.molecule} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Tirzepatide" 
                />
              </div>
              <div className="form-group">
                <label>Publication Topic</label>
                <input 
                  type="text" 
                  name="publication_topic" 
                  value={academicFilters.publication_topic} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. SGLT2 cardiorenal protection" 
                />
              </div>
              <div className="form-group">
                <label>Emerging Research Area</label>
                <input 
                  type="text" 
                  name="emerging_area" 
                  value={academicFilters.emerging_area} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Adaptive designs" 
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Research Question</label>
                <input 
                  type="text" 
                  name="research_question" 
                  value={academicFilters.research_question} 
                  onChange={handleAcademicChange} 
                  placeholder="e.g. Does Tirzepatide show superior weight loss compared to Semaglutide?" 
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                Reset Filters
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSearching}>
                {isSearching ? '🔍 Searching...' : '🔍 Search Registry & AI'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Step Navigation Tabs */}
      <div className="tabs">
        {STEPS.map(s => {
          const isSelected = activeTab === s.id;
          return (
            <button
              key={s.id}
              className={`tab ${isSelected ? 'active' : ''}`}
              onClick={() => setActiveTab(s.id)}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Render Steps */}
      {activeTab === 'results' ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4>Registry Matches ({trials.length} trials found)</h4>
            {trials.length > 0 && (
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleSelectAll}>
                  {selectedTrialIds.length === trials.length ? 'Deselect All' : 'Select All'}
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', alignSelf: 'center' }}>
                  {selectedTrialIds.length} Selected
                </span>
              </div>
            )}
          </div>

          {trials.length === 0 ? (
            <div className="analysis-placeholder" style={{ padding: 40 }}>
              <span style={{ fontSize: 36 }}>📂</span>
              <h4 style={{ marginTop: 12 }}>No Matching Trials Found</h4>
              <p>Adjust your search filters or try keywords like "Cancer", "Diabetes", or "Dupilumab".</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {trials.map(t => {
                const isSelected = selectedTrialIds.includes(t.id);
                return (
                  <div 
                    key={t.id} 
                    className={`trial-result-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectTrial(t.id)}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={(e) => {
                        e.stopPropagation(); // Stop click propagating to the card
                        handleSelectTrial(t.id);
                      }}
                      style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{t.nct_number}</span>
                        <span className="status-badge" style={{ fontSize: 9.5, padding: '1px 6px' }}>{t.phase}</span>
                        <span className="status-badge success" style={{ fontSize: 9.5, padding: '1px 6px' }}>{t.status}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {t.sponsor}</span>
                      </div>
                      <h4 style={{ margin: '6px 0', fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </h4>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span><strong>Indication:</strong> {t.indication}</span>
                        <span><strong>Target Enrolment:</strong> {t.enrolment_target}</span>
                        <span><strong>Countries:</strong> {t.countries?.join(', ')}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Avoid selection toggle on delete click
                        handleDeleteTrial(t.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 4
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'chat' ? (
        <div className="card" style={{ padding: 0, height: '480px', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
            <h4 style={{ margin: 0 }}>💬 Interactive Trials Assistant</h4>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Ask questions about the {selectedTrialIds.length} selected trials
            </p>
          </div>
          
          {/* Messages list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatMessages.length === 0 ? (
              <div className="analysis-placeholder" style={{ margin: 'auto' }}>
                <span style={{ fontSize: 32 }}>💬</span>
                <h4 style={{ marginTop: 8 }}>Chat with selected trials</h4>
                <p>Ask questions like "What are the common exclusions?" or "Compare the endpoints".</p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div 
                  key={i} 
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    background: msg.role === 'user' ? 'var(--accent-gradient)' : 'var(--bg-input)',
                    color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    maxWidth: '75%',
                    fontSize: 13,
                    wordBreak: 'break-word',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              ))
            )}
            {isChatting && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg-input)', padding: '10px 14px', borderRadius: '12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                AI is typing...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          
          {/* Send box */}
          <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--border)' }}>
            <input 
              type="text" 
              placeholder="Ask anything about the selected trials..." 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', outline: 'none' }}
              disabled={selectedTrialIds.length === 0}
            />
            <button 
              type="submit" 
              className="btn btn-primary btn-sm"
              disabled={isChatting || !chatInput.trim() || selectedTrialIds.length === 0}
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        // Standard AI Analysis Steps
        <div className="card">
          {(() => {
            const stepObj = STEPS.find(s => s.id === activeTab);
            const needsSelection = stepObj?.needsSelection;
            const minCount = stepObj?.minCount || 1;
            const hasEnoughSelection = selectedTrialIds.length >= minCount;
            
            if (needsSelection && !hasEnoughSelection) {
              return (
                <div className="analysis-placeholder" style={{ padding: 40 }}>
                  <span style={{ fontSize: 36 }}>⚠️</span>
                  <h4 style={{ marginTop: 12 }}>Selection Required</h4>
                  <p>
                    Please select at least {minCount} trial(s) in the <strong>Step 1: Search Results</strong> tab to run this analysis.
                  </p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setActiveTab('results')}>
                    Go to Search Results
                  </button>
                </div>
              );
            }
            
            const currentResult = analysisResults[activeTab];
            
            if (isLoadingAnalysis && loadingTab === activeTab) {
              return (
                <div className="loading-spinner" style={{ padding: 60 }}>
                  <div className="spinner"></div>
                  <span>iClinicalAI is generating your comparative intelligence report...</span>
                </div>
              );
            }
            
            if (currentResult) {
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
                    <h4 style={{ margin: 0 }}>📊 Generated Report: {stepObj?.label}</h4>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => window.print()}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      🖨️ Export PDF / Print
                    </button>
                  </div>
                  <div className="analysis-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentResult) }} />
                </div>
              );
            }
            
            return (
              <div className="analysis-placeholder" style={{ padding: 40 }}>
                <span style={{ fontSize: 36 }}>📊</span>
                <h4 style={{ marginTop: 12 }}>No report generated yet</h4>
                <p>Run this step to generate AI-assisted clinical trial analysis outcomes.</p>
                <button 
                  className="btn btn-primary btn-sm" 
                  style={{ marginTop: 16 }}
                  onClick={() => runStepAnalysis(activeTab)}
                >
                  Generate {stepObj?.label}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
