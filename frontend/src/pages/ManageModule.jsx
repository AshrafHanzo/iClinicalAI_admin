import { useState, useEffect, useRef } from 'react';
import { DashboardHeader, Panel, FeatureCards, StatGrid, DocumentTable, StepCoverage, Breakdown, progressCounts } from '../components/ModuleDashboard';
import { getModule } from '../moduleNav';
import { 
  listDocuments, 
  runManageAnalysis, 
  uploadDataset, 
  getMockDataset,
  deleteDocument
} from '../services/api';

// Custom-designed premium Protocol Selector dropdown matching the DESIGN module
function ProtocolSelector({ allDocs, currentDoc, onSelect, onDelete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const getFileIcon = (type) => {
    if (type === '.pdf') return '📕';
    if (type === '.docx' || type === '.doc') return '📘';
    return '📄';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredDocs = allDocs.filter(d => 
    d.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
      {/* Trigger element */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--bg-white)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          transition: 'var(--transition)',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 22 }}>📂</span>
          <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Active Protocol</div>
            {currentDoc ? (
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                  {currentDoc.filename}
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                  textTransform: 'uppercase'
                }}>
                  {currentDoc.file_type?.replace('.', '')}
                </span>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2, fontWeight: 500 }}>Select a protocol context...</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '12px' }}>
            {allDocs.length} loaded
          </span>
          <span style={{ fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

      {/* Dropdown Options List */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--bg-white)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            maxHeight: '260px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Search box */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-white)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔍</span>
            <input 
              type="text"
              placeholder="Search protocols..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 12.5,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font)'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredDocs.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                {allDocs.length === 0 ? 'No documents uploaded yet.' : 'No matching protocols found.'}
              </div>
            ) : (
              filteredDocs.map((d) => {
                const isActive = currentDoc?.id === d.id;
                return (
                  <div 
                    key={d.id}
                    onClick={() => {
                      onSelect(d.id);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderBottom: '1px solid #f8fafc',
                      cursor: 'pointer',
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                      transition: 'var(--transition)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 18 }}>{getFileIcon(d.file_type)}</span>
                      <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                        <div style={{ 
                          fontWeight: isActive ? 750 : 600, 
                          color: isActive ? 'var(--accent)' : 'var(--text-primary)', 
                          fontSize: 12.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {d.filename}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {formatSize(d.file_size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { id: 'crf_review', label: 'CRF Review', icon: '📋', desc: 'Identify data capture gaps and logic errors' },
  { id: 'edit_checks', label: 'Edit Checks', icon: '⚡', desc: 'Generate logic checks for validation' },
  { id: 'query_wording', label: 'Query Wording', icon: '✍️', desc: 'Translate raw reviewer notes to standard queries' },
  { id: 'cleaning_checklist', label: 'Cleaning Checklist', icon: '✅', desc: 'Build study-specific cleaning guides' },
  { id: 'medical_coding', label: 'Coding Review', icon: '🏷️', desc: 'Audit adverse events and WHO-Drug lists' },
  { id: 'dataset_review', label: 'Dataset Review', icon: '📊', desc: 'Programmatic CSV validator & AI anomalies' },
  { id: 'review_summary', label: 'Review Summary', icon: '📝', desc: 'Produce executive CDM readiness reports' },
];

export default function ManageModule({ view = 'dashboard', onNavigate = () => {} }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  // The module sidebar and the step list both drive the active step.
  const activeTab = view === 'dashboard' ? 'crf_review' : view;
  const setActiveTab = onNavigate;
  const [loadingTab, setLoadingTab] = useState(null);
  const [tabResults, setTabResults] = useState({});
  
  // Query wording state
  const [queryWordingInput, setQueryWordingInput] = useState('');
  const [isWordingLoading, setIsWordingLoading] = useState(false);

  // Dataset review state
  const [activeDatasetName, setActiveDatasetName] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  // Load documents on mount
  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await listDocuments();
        setDocuments(res.documents || []);
        if (res.documents && res.documents.length > 0) {
          setSelectedDocId(res.documents[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch documents:', err);
      }
    }
    loadDocs();
  }, []);

  const activeDoc = documents.find(d => d.id === selectedDocId);

  // Load analysis results from active document when selection changes
  useEffect(() => {
    if (activeDoc && activeDoc.analysis_results) {
      const saved = activeDoc.analysis_results;
      setTabResults({
        crf_review: saved.crf_review || '',
        edit_checks: saved.edit_checks || '',
        query_wording: saved.query_wording || '',
        cleaning_checklist: saved.cleaning_checklist || '',
        medical_coding: saved.medical_coding || '',
        dataset_review: saved.dataset_review || '',
        review_summary: saved.review_summary || ''
      });
    } else {
      setTabResults({});
    }
  }, [selectedDocId, documents]);

  // Run AI Analysis for normal steps
  const handleAnalyzeStep = async (stepId) => {
    setLoadingTab(stepId);
    try {
      let extra = null;
      if (stepId === 'dataset_review' && auditResult) {
        extra = JSON.stringify(auditResult.summary);
      }
      const res = await runManageAnalysis(stepId, selectedDocId || null, extra);
      setTabResults(prev => ({ ...prev, [stepId]: res.result }));
      
      if (activeDoc) {
        if (!activeDoc.analysis_results) activeDoc.analysis_results = {};
        activeDoc.analysis_results[stepId] = res.result;
      }
    } catch (err) {
      alert(err.message || 'Analysis failed');
    } finally {
      setLoadingTab(null);
    }
  };

  // Step 3 Wording Generation
  const handleGenerateWording = async () => {
    if (!queryWordingInput) return;
    setIsWordingLoading(true);
    try {
      const res = await runManageAnalysis('query_wording', selectedDocId || null, queryWordingInput);
      setTabResults(prev => ({ ...prev, query_wording: res.result }));
      
      if (activeDoc) {
        if (!activeDoc.analysis_results) activeDoc.analysis_results = {};
        activeDoc.analysis_results.query_wording = res.result;
      }
    } catch (err) {
      alert(err.message || 'Wording generation failed');
    } finally {
      setIsWordingLoading(false);
    }
  };

  // Step 6 programmatic file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsAuditing(true);
    setActiveDatasetName(file.name);
    try {
      const res = await uploadDataset(file);
      setAuditResult(res);
      
      // Auto-trigger the AI report overlaying the audit results
      setLoadingTab('dataset_review');
      const aiRes = await runManageAnalysis('dataset_review', selectedDocId || null, JSON.stringify(res.summary));
      setTabResults(prev => ({ ...prev, dataset_review: aiRes.result }));
      
      if (activeDoc) {
        if (!activeDoc.analysis_results) activeDoc.analysis_results = {};
        activeDoc.analysis_results.dataset_review = aiRes.result;
      }
    } catch (err) {
      alert(err.message || 'File upload and audit failed');
    } finally {
      setIsAuditing(false);
      setLoadingTab(null);
    }
  };

  // Load mock dataset for demo testing
  const handleLoadDemoDataset = async () => {
    setIsAuditing(true);
    setActiveDatasetName('sample_adverse_events.csv');
    try {
      const res = await getMockDataset();
      setAuditResult(res.audit);
      
      // Auto-trigger AI review on mock findings
      setLoadingTab('dataset_review');
      const aiRes = await runManageAnalysis('dataset_review', selectedDocId || null, JSON.stringify(res.audit.summary));
      setTabResults(prev => ({ ...prev, dataset_review: aiRes.result }));
      
      if (activeDoc) {
        if (!activeDoc.analysis_results) activeDoc.analysis_results = {};
        activeDoc.analysis_results.dataset_review = aiRes.result;
      }
    } catch (err) {
      alert(err.message || 'Mock dataset audit failed');
    } finally {
      setIsAuditing(false);
      setLoadingTab(null);
    }
  };

  // Reset module results
  const handleResetResults = () => {
    setTabResults({});
    setAuditResult(null);
    setActiveDatasetName('');
  };

  // Helper formatting size
  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Custom Markdown parser for premium rendering inside cards
  const renderMarkdown = (text) => {
    if (!text) return '';
    let lines = text.split('\n');
    let html = '';
    let inList = false;
    let inTable = false;
    let tableRows = [];

    for (let line of lines) {
      line = line.trim();

      // Handle markdown tables
      if (line.startsWith('|')) {
        inTable = true;
        tableRows.push(line);
        continue;
      } else if (inTable) {
        html += parseMarkdownTable(tableRows);
        inTable = false;
        tableRows = [];
      }

      if (line.startsWith('# ')) {
        html += `<h2 style="font-size:18px; font-weight:700; margin-top:20px; margin-bottom:12px; color:var(--text-primary); border-bottom: 2px solid var(--border); padding-bottom:6px;">${line.replace('# ', '')}</h2>`;
      } else if (line.startsWith('## ')) {
        html += `<h3 style="font-size:15px; font-weight:600; margin-top:16px; margin-bottom:8px; color:var(--accent);">${line.replace('## ', '')}</h3>`;
      } else if (line.startsWith('### ')) {
        html += `<h4 style="font-size:13.5px; font-weight:600; margin-top:12px; margin-bottom:6px; color:var(--text-primary);">${line.replace('### ', '')}</h4>`;
      } else if (line.startsWith('* ') || line.startsWith('- ')) {
        if (!inList) {
          html += '<ul style="margin-left: 20px; margin-bottom: 12px; list-style-type: disc;">';
          inList = true;
        }
        let content = line.substring(2);
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html += `<li style="margin-bottom: 5px; color: var(--text-secondary); line-height: 1.6;">${content}</li>`;
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        if (line) {
          let content = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html += `<p style="margin-bottom: 10px; color: var(--text-secondary); line-height: 1.65; font-size:13px;">${content}</p>`;
        }
      }
    }
    if (inList) html += '</ul>';
    if (inTable) html += parseMarkdownTable(tableRows);

    return html;
  };

  const parseMarkdownTable = (rows) => {
    if (rows.length < 2) return '';
    let html = '<div style="overflow-x:auto; margin: 12px 0; border:1px solid var(--border); border-radius:var(--radius-sm);"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">';
    for (let i = 0; i < rows.length; i++) {
      let cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
      if (i === 1 && cells.every(c => c.match(/^:?-+:?$/))) {
        continue;
      }
      html += `<tr style="border-bottom: 1px solid var(--border); ${i === 0 ? 'background:var(--bg-hover); font-weight:700;' : ''}">`;
      for (let cell of cells) {
        if (i === 0) {
          html += `<th style="padding:8px 10px; color:var(--text-primary);">${cell}</th>`;
        } else {
          let displayCell = cell;
          if (cell === 'High') {
            displayCell = `<span style="background:#fee2e2; color:#ef4444; font-weight:700; padding:1px 6px; border-radius:4px; font-size:10px;">High</span>`;
          } else if (cell === 'Medium' || cell === 'Moderate') {
            displayCell = `<span style="background:#fffbeb; color:#f59e0b; font-weight:700; padding:1px 6px; border-radius:4px; font-size:10px;">Medium</span>`;
          } else if (cell === 'Low') {
            displayCell = `<span style="background:#ecfdf5; color:#10b981; font-weight:700; padding:1px 6px; border-radius:4px; font-size:10px;">Low</span>`;
          }
          html += `<td style="padding:8px 10px; color:var(--text-secondary);">${displayCell}</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  };

  const completedCount = Object.values(tabResults).filter(Boolean).length;

  if (view === 'dashboard') {
    const steps = getModule('manage').features.map(f => ({ ...f, key: f.id, desc: STEPS.find(s => s.id === f.id)?.desc }));
    const stepKeys = steps.map(s => s.key);
    const counts = progressCounts(documents, stepKeys);
    const summary = auditResult?.summary;
    return (
      <div className="dash">
        <DashboardHeader title="Welcome to Manage" subtitle="AI-assisted Clinical Data Management, CRF Audit & Dynamic Data Quality Checks">
          <button className="btn btn-primary" onClick={() => onNavigate('dataset_review')}>📊 Dataset Review</button>
        </DashboardHeader>

        <StatGrid items={[
          { label: 'Protocol Documents', value: documents.length, sub: 'Available as study context', tone: 2 },
          { label: 'With CDM Output', value: counts.completed + counts.in_progress, sub: `${counts.completed} fully reviewed`, tone: 3 },
          { label: 'CDM Steps Generated', value: counts.stepsDone, sub: 'Across all protocols', tone: 4 },
          { label: 'Active Protocol', value: `${completedCount}/7`, sub: activeDoc ? 'Steps generated' : 'None selected', tone: 6 },
          { label: 'Data Integrity Flags', value: summary ? summary.total_issues : '—', sub: summary ? `${summary.total_rows} rows audited` : 'No dataset loaded', tone: 1 },
        ]} />

        <Panel title="Protocols" flush>
          <DocumentTable
            docs={documents}
            stepKeys={stepKeys}
            activeIds={selectedDocId ? [selectedDocId] : []}
            onOpen={(d) => setSelectedDocId(d.id)}
            openLabel="Set Active"
            emptyText="No documents uploaded yet."
          />
        </Panel>

        <div className="dash-grid">
          <Panel title="CDM Step Coverage">
            <StepCoverage steps={steps} docs={documents} onOpen={onNavigate} />
          </Panel>

          <Panel title="Clinical Dataset" action={{ label: 'Open Dataset Review', onClick: () => onNavigate('dataset_review') }}>
            {!summary ? (
              <div className="dash-empty">No dataset loaded. Upload a CSV or load the demo dataset in Dataset Review.</div>
            ) : (
              <>
                <div style={{ fontWeight: 650, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{activeDatasetName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 12px' }}>
                  {summary.total_rows} rows • {summary.total_cols} columns • {summary.total_issues} issues
                </div>
                <Breakdown
                  total={summary.total_issues}
                  entries={[
                    ['Missing values', summary.missing_count],
                    ['Date logic / format', summary.date_logic_count],
                    ['Outliers', summary.outlier_count],
                    ['Duplicate records', summary.duplicate_count],
                  ]}
                />
              </>
            )}
          </Panel>
        </div>

        <Panel title="Features">
          <FeatureCards
            features={steps}
            doneIds={STEPS.filter(s => tabResults[s.id]).map(s => s.id)}
            onOpen={onNavigate}
          />
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      
      {/* 1. Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h2>🗂️ MANAGE Module</h2>
        <p>AI-assisted Clinical Data Management, CRF Audit & Dynamic Data Quality Checks</p>
      </div>

      {/* 2. Top-Level Protocol Workspace Selector Bar */}
      <div className="card" style={{ marginBottom: 20, padding: '12px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <ProtocolSelector 
            allDocs={documents}
            currentDoc={activeDoc}
            onSelect={setSelectedDocId}
            onDelete={async (docId) => {
              try {
                await deleteDocument(docId);
                const res = await listDocuments();
                setDocuments(res.documents || []);
                if (selectedDocId === docId) {
                  setSelectedDocId(res.documents?.[0]?.id || '');
                }
              } catch (e) {
                console.error(e);
              }
            }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeDatasetName && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                📊 Dataset: <strong>{activeDatasetName}</strong>
              </span>
            )}
            
            {(completedCount > 0 || auditResult) && (
              <button 
                onClick={handleResetResults} 
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'var(--danger)' }}
              >
                🧹 Reset Workspace
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Stat Row Metric Grid */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Active Protocol</div>
          <div className="stat-value" style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 6 }}>
            {activeDoc ? activeDoc.filename : 'None Selected'}
          </div>
          <div className="stat-desc">
            {activeDoc ? `${activeDoc.file_type?.toUpperCase().replace('.', '')} • ${formatSize(activeDoc.file_size)}` : 'No context file selected'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Clinical Dataset</div>
          <div className="stat-value" style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 6 }}>
            {activeDatasetName ? activeDatasetName : 'No Dataset Loaded'}
          </div>
          <div className="stat-desc">
            {auditResult ? `${auditResult.summary.total_rows} rows • ${auditResult.summary.total_cols} columns` : 'Upload CSV in Dataset Review'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Data Integrity Flags</div>
          <div className="stat-value" style={{ 
            color: auditResult?.summary.total_issues > 0 ? 'var(--danger)' : 'var(--text-primary)',
            fontSize: 20, 
            fontWeight: 800,
            marginTop: 4 
          }}>
            {auditResult ? auditResult.summary.total_issues : '0'}
          </div>
          <div className="stat-desc">
            {auditResult 
              ? `${auditResult.summary.missing_count} missing • ${auditResult.summary.duplicate_count} dupes` 
              : 'No discrepancies detected'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Steps Generated</div>
          <div className="stat-value" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            {completedCount}/7
          </div>
          <div className="stat-desc">
            {completedCount === 7 ? '🎉 Study Review Complete' : 'Pending step results'}
          </div>
        </div>
      </div>

      {/* 4. Main Workspace (Left Stepper Menu / Right Output panel) */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        
        {/* Left Column Stepper Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 10px 10px 10px', borderBottom: '1px solid var(--border)' }}>
              Data Management Steps
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {STEPS.map((step) => {
                const isActive = activeTab === step.id;
                const isCompleted = !!tabResults[step.id];
                
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveTab(step.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'var(--transition)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Circle icon */}
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isActive ? 'var(--accent)' : isCompleted ? 'var(--success)' : 'var(--border)',
                      color: isActive || isCompleted ? 'white' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {isCompleted ? '✓' : step.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: isActive ? 700 : 600, 
                        color: isActive ? 'var(--accent)' : 'var(--text-primary)', 
                        fontSize: '12.5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {step.label}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column Content Display Card */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '520px', background: 'var(--bg-white)' }}>
          
          {loadingTab === activeTab ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '80px 20px' }}>
              <span className="spinner" style={{ fontSize: 26, marginBottom: 16 }}>🌀</span>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Analyzing Clinical Protocol & Data</h4>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>Processing requested step utilizing OpenAI GPT-4o...</p>
            </div>
          ) : (
            <div>
              {/* Programmatic audit table when no AI report exists yet */}
              {activeTab === 'dataset_review' && auditResult && !tabResults[activeTab] && auditResult.issues.length > 0 && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead style={{ background: 'var(--bg-hover)', position: 'sticky', top: 0, zIndex: 5 }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Row</th>
                        <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Field</th>
                        <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Discrepancy</th>
                        <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Detail</th>
                        <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditResult.issues.map((issue, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{issue.row}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{issue.field}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{issue.type}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{issue.description}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: issue.severity === 'High' ? '#fee2e2' : issue.severity === 'Medium' ? '#fffbeb' : '#ecfdf5',
                              color: issue.severity === 'High' ? '#ef4444' : issue.severity === 'Medium' ? '#f59e0b' : '#10b981'
                            }}>
                              {issue.severity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Output Content */}
              {tabResults[activeTab] ? (
                <div>
                  
                  {/* Step Title Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 18 }}>
                    <span style={{ fontSize: 22 }}>{STEPS.find(s => s.id === activeTab)?.icon}</span>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {STEPS.find(s => s.id === activeTab)?.label}
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Generated from protocol context & AI reasoning
                      </p>
                    </div>
                  </div>

                  {activeTab === 'dataset_review' && !auditResult && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                        Browse Local File
                        <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                      </label>
                      <button onClick={handleLoadDemoDataset} className="btn btn-secondary btn-sm" disabled={isAuditing}>
                        {isAuditing ? 'Analyzing...' : '⚡ Load Demo Dataset'}
                      </button>
                    </div>
                  )}

                  {/* Interactive Query Wording Box in Step 3 */}
                  {activeTab === 'query_wording' && (
                    <div style={{ background: 'var(--bg-input)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 20, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontWeight: 700, fontSize: 11.5, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>
                            Translate Raw Discrepancy Note:
                          </label>
                          <input 
                            type="text" 
                            value={queryWordingInput} 
                            onChange={(e) => setQueryWordingInput(e.target.value)}
                            placeholder="e.g. visit date is wrong"
                            className="form-control"
                            style={{ width: '100%', background: 'var(--bg-white)', height: '40px', fontSize: 13 }}
                          />
                        </div>
                        <button 
                          onClick={handleGenerateWording} 
                          className="btn btn-primary"
                          disabled={isWordingLoading || !queryWordingInput}
                          style={{ height: '40px', padding: '0 20px', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {isWordingLoading ? 'Rephrasing...' : '✍️ Clean Wording'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Programmatic details in Step 6: Dataset Review */}
                  {activeTab === 'dataset_review' && auditResult && (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                        Programmatic Validation Details
                      </h3>
                      
                      {/* Grid listing issues */}
                      {auditResult.issues.length > 0 ? (
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 20 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                            <thead style={{ background: 'var(--bg-hover)', position: 'sticky', top: 0, zIndex: 5 }}>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Row</th>
                                <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Field</th>
                                <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Discrepancy</th>
                                <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Detail</th>
                                <th style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Severity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {auditResult.issues.map((issue, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{issue.row}</td>
                                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{issue.field}</td>
                                  <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{issue.type}</td>
                                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{issue.description}</td>
                                  <td style={{ padding: '6px 10px' }}>
                                    <span style={{
                                      fontSize: '9px',
                                      fontWeight: '700',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: issue.severity === 'High' ? '#fee2e2' : issue.severity === 'Medium' ? '#fffbeb' : '#ecfdf5',
                                      color: issue.severity === 'High' ? '#ef4444' : issue.severity === 'Medium' ? '#f59e0b' : '#10b981'
                                    }}>
                                      {issue.severity}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ background: 'var(--bg-input)', padding: 10, borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontWeight: 650, fontSize: 12.5, textAlign: 'center', marginBottom: 20 }}>
                          ✅ Audit complete. No programmatic discrepancies detected!
                        </div>
                      )}
                      
                      <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: '20px 0 10px 0', color: 'var(--text-primary)' }}>
                        AI Observations & Quality Report
                      </h3>
                    </div>
                  )}

                  {/* Render standard markdown generated results */}
                  <div 
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(tabResults[activeTab]) }} 
                    style={{ fontSize: '13px' }}
                  />

                </div>
              ) : (
                
                /* Empty State: Step needs generation */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', flex: 1 }}>
                  
                  {activeTab === 'dataset_review' && !auditResult ? (
                    /* Step 6 Upload zone empty state */
                    <div style={{ width: '100%', maxWidth: '480px' }}>
                      <span style={{ fontSize: '44px', marginBottom: '16px', display: 'block' }}>📊</span>
                      <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Upload Clinical Dataset CSV
                      </h4>
                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '6px auto 20px auto', lineHeight: 1.5 }}>
                        Upload your clinical study CSV listing to validate formatting, dates, outliers, and duplicates, or load our demo dataset.
                      </p>

                      <div className="upload-zone" style={{ padding: '32px 20px', marginBottom: 16 }}>
                        <span className="upload-icon" style={{ fontSize: 32, marginBottom: 8 }}>📤</span>
                        <h4 style={{ fontSize: 13.5, fontWeight: 600 }}>Select File for Audit</h4>
                        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 12px 0' }}>Supports clinical data records (.csv)</p>
                        
                        <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', margin: '0 auto', cursor: 'pointer' }}>
                          Browse Local File
                          <input 
                            type="file" 
                            accept=".csv" 
                            onChange={handleFileUpload} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or test instantly using</span>
                        <button 
                          onClick={handleLoadDemoDataset} 
                          className="btn btn-secondary btn-sm"
                          style={{ borderStyle: 'dashed', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                          disabled={isAuditing}
                        >
                          {isAuditing ? 'Analyzing...' : '⚡ Load Demo Dataset'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* General Steps empty state */
                    <div style={{ maxWidth: '440px' }}>
                      <span style={{ fontSize: '44px', marginBottom: '16px', display: 'block' }}>
                        {STEPS.find(s => s.id === activeTab)?.icon}
                      </span>
                      <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {STEPS.find(s => s.id === activeTab)?.label}
                      </h4>
                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '6px auto 20px auto', lineHeight: 1.5 }}>
                        {activeTab === 'query_wording' 
                          ? 'Translate raw investigator annotations and observations into standard GCP-compliant query wordings.'
                          : `Generate the AI-assisted ${STEPS.find(s => s.id === activeTab)?.label} report leveraging context from the active protocol.`}
                      </p>

                      {activeTab === 'query_wording' ? (
                        <div style={{ display: 'flex', gap: 12, marginTop: 16, width: '100%', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            value={queryWordingInput} 
                            onChange={(e) => setQueryWordingInput(e.target.value)}
                            placeholder="Enter raw note (e.g. vital sign blank)" 
                            className="form-control"
                            style={{ flex: 1, height: '40px', fontSize: 13 }}
                          />
                          <button 
                            onClick={handleGenerateWording} 
                            className="btn btn-primary"
                            disabled={isWordingLoading || !queryWordingInput}
                            style={{ height: '40px', padding: '0 20px', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            {isWordingLoading ? 'Processing...' : '⚡ Rephrase Wording'}
                          </button>
                        </div>
                      ) : activeTab === 'dataset_review' ? (
                        /* Case where csv uploaded but no AI report generated yet */
                        <button 
                          onClick={() => handleAnalyzeStep('dataset_review')} 
                          className="btn btn-primary btn-sm"
                        >
                          ⚡ Generate AI Quality Report
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleAnalyzeStep(activeTab)} 
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 10 }}
                        >
                          ⚡ Generate Step Analysis
                        </button>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
