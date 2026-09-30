import { useState, useEffect, useRef } from 'react';
import { 
  listDocuments, 
  runSafetyAnalysis, 
  generateSafetyNarrative, 
  assessSafetyCausality, 
  chatWithSafety,
  deleteDocument,
  uploadDocument
} from '../services/api';
import DocumentUpload from '../components/DocumentUpload';

// Custom-designed Protocol Selector dropdown matching other modules
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

  const filteredDocs = allDocs.filter(d => 
    d.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 18px',
          background: 'var(--bg-white)',
          border: isOpen ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.12), var(--shadow-sm)' : 'var(--shadow-sm)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 22 }}>📂</span>
          <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Active Document</div>
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
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2, fontWeight: 500 }}>Select a document...</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 650, background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '12px' }}>
            {allDocs.length} loaded
          </span>
          <span style={{ fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>

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
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '13px',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }} className="custom-scrollbar">
            {filteredDocs.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No matching documents found
              </div>
            ) : (
              filteredDocs.map((d) => (
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
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: currentDoc?.id === d.id ? 'var(--bg-input)' : 'transparent',
                    transition: 'var(--transition)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input)'}
                  onMouseLeave={(e) => {
                    if (currentDoc?.id !== d.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '16px' }}>{d.file_type === '.pdf' ? '📕' : '📘'}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: currentDoc?.id === d.id ? '700' : '500',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {d.filename}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this document?')) {
                        onDelete(d.id);
                      }
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--danger)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      opacity: 0.6,
                      marginLeft: 12
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Markdown Parser
function renderMarkdown(text) {
  if (!text) return '';
  let lines = text.split('\n');
  let processedLines = [];
  let inTable = false;
  let tableRows = [];

  const parseTable = (rows) => {
    let html = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">';
    for (let i = 0; i < rows.length; i++) {
      let cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
      if (i === 1 && cells.every(c => c.match(/^:?-+:?$/))) continue;
      html += '<tr style="border-bottom: 1px solid var(--border);">';
      for (let cell of cells) {
        if (i === 0) {
          html += `<th style="background-color: var(--accent-light); color: var(--accent); font-weight: 700; border: 1px solid var(--border); padding: 10px 14px; text-align: left;">${cell}</th>`;
        } else {
          html += `<td style="border: 1px solid var(--border); padding: 10px 14px; color: var(--text-secondary); background: white;">${cell}</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table>';
    return html;
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
      continue;
    } else if (inTable) {
      processedLines.push(parseTable(tableRows));
      inTable = false;
    }

    if (line.startsWith('# ')) {
      processedLines.push(`<h2 style="font-size: 18px; color: var(--accent); border-bottom: 2px solid var(--border); padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px; font-weight: 800;">${line.replace('# ', '')}</h2>`);
    } else if (line.startsWith('## ')) {
      processedLines.push(`<h3 style="font-size: 15px; color: var(--text-primary); margin-top: 18px; margin-bottom: 8px; font-weight: 700;">${line.replace('## ', '')}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      processedLines.push(`<li style="margin-left: 20px; margin-bottom: 6px; color: var(--text-secondary); font-size: 13.5px;">${line.replace(/^[-*]\s+/, '')}</li>`);
    } else if (line !== '') {
      processedLines.push(`<p style="margin-bottom: 10px; color: var(--text-secondary); font-size: 13.5px; line-height: 1.6;">${line}</p>`);
    }
  }

  if (inTable) {
    processedLines.push(parseTable(tableRows));
  }

  return processedLines.join('\n');
}

export default function SafetyModule() {
  const [allDocs, setAllDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const [activeStep, setActiveStep] = useState(1); // steps 1-9, plus 10 (Naranjo), 11 (Chat)
  const [error, setError] = useState('');
  const [showUploadSection, setShowUploadSection] = useState(false);
  
  // Loading states
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Step results cache
  const [stepResults, setStepResults] = useState({});

  // Interactive Naranjo Algorithm Calculator State
  const [naranjoAnswers, setNaranjoAnswers] = useState({
    q1: '0', q2: '0', q3: '0', q4: '0', q5: '0',
    q6: '0', q7: '0', q8: '0', q9: '0', q10: '0'
  });
  const [naranjoClinicalContext, setNaranjoClinicalContext] = useState('');
  const [naranjoResult, setNaranjoResult] = useState(null);
  const [isNaranjoLoading, setIsNaranjoLoading] = useState(false);

  // Safety Chatbot State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatBottomRef = useRef(null);

  const STEPS = [
    { num: 1, id: 1, label: 'Safety Case Review', desc: 'Case Profile & Demographics', icon: '🔍' },
    { num: 2, id: 2, label: 'SAE Narrative Draft', desc: 'MedWatch/CIOMS Writer', icon: '📝' },
    { num: 3, id: 3, label: 'Safety Case Summary', desc: 'Concise ADR Summaries', icon: '📋' },
    { num: 4, id: 4, label: 'Seriousness & Causality', desc: 'Regulatory Criteria Check', icon: '⚖️' },
    { num: 5, id: 5, label: 'MedDRA Coding Support', desc: 'Verbatim Term Mapping', icon: '🏷️' },
    { num: 6, id: 6, label: 'Aggregate Safety Summary', desc: 'Event Frequency Report', icon: '📊' },
    { num: 7, id: 7, label: 'Safety Trend Analysis', desc: 'Cluster & Pattern Detection', icon: '📈' },
    { num: 8, id: 8, label: 'Medical Review Note', desc: 'Clinical Assessment Draft', icon: '🩺' },
    { num: 9, id: 9, label: 'Signal Detection Support', desc: 'Emerging Risks Scan', icon: '⚡' },
  ];

  const NARANJO_QUESTIONS = [
    { id: 'q1', text: '1. Are there previous conclusive reports on this reaction?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q2', text: '2. Did the adverse event appear after the suspected drug was administered?', options: [{ label: 'Yes (+2)', val: '2' }, { label: 'No (-1)', val: '-1' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q3', text: '3. Did the adverse reaction improve when the drug was discontinued or a specific antagonist was administered?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q4', text: '4. Did the adverse reaction reappear when the drug was readministered?', options: [{ label: 'Yes (+2)', val: '2' }, { label: 'No (-1)', val: '-1' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q5', text: '5. Are there alternative causes (other than the drug) that could on their own have caused the reaction?', options: [{ label: 'Yes (-1)', val: '-1' }, { label: 'No (+2)', val: '2' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q6', text: '6. Did the reaction reappear when a placebo was given?', options: [{ label: 'Yes (-1)', val: '-1' }, { label: 'No (+1)', val: '1' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q7', text: '7. Was the drug detected in the blood (or other fluids) in concentrations known to be toxic?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q8', text: '8. Was the reaction more severe when the dose was increased, or less severe when the dose was decreased?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q9', text: '9. Did the patient have a similar reaction to the same or similar drugs in any previous exposure?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] },
    { id: 'q10', text: '10. Was the adverse event confirmed by any objective evidence?', options: [{ label: 'Yes (+1)', val: '1' }, { label: 'No (0)', val: '0' }, { label: 'Do not know (0)', val: '0' }] }
  ];

  useEffect(() => {
    fetchDocsList();
  }, []);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const fetchDocsList = async (selectId = null) => {
    try {
      const result = await listDocuments();
      const docs = result.documents || [];
      setAllDocs(docs);

      if (selectId) {
        const found = docs.find(d => d.id === selectId);
        if (found) {
          setDoc(found);
          loadDocSafetyData(found);
        }
      } else if (docs.length > 0 && !doc) {
        setDoc(docs[docs.length - 1]);
        loadDocSafetyData(docs[docs.length - 1]);
      }
    } catch (err) {
      setError('Failed to load documents: ' + err.message);
    }
  };

  const loadDocSafetyData = (targetDoc) => {
    const res = targetDoc?.analysis_results || {};
    setStepResults({
      1: res.safety_case_review || '',
      2: res.sae_narrative || '',
      3: res.safety_case_summary || '',
      4: res.causality_checklist || '',
      5: res.meddra_coding || '',
      6: res.aggregate_safety || '',
      7: res.safety_trend || '',
      8: res.medical_review || '',
      9: res.signal_detection || '',
    });
    setChatMessages([]);
  };

  const handleSelectDocument = (id) => {
    const selected = allDocs.find(d => d.id === id);
    if (selected) {
      setDoc(selected);
      loadDocSafetyData(selected);
      setShowUploadSection(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id);
      const remaining = allDocs.filter(d => d.id !== id);
      setAllDocs(remaining);
      if (remaining.length > 0) {
        handleSelectDocument(remaining[remaining.length - 1].id);
      } else {
        setDoc(null);
        setStepResults({});
        setChatMessages([]);
      }
    } catch (err) {
      setError('Failed to delete document: ' + err.message);
    }
  };

  const handleUpload = async (file) => {
    setIsUploading(true);
    setError('');
    try {
      const result = await uploadDocument(file);
      await fetchDocsList(result.id);
      setShowUploadSection(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Run Specific Safety Step Analysis
  const handleRunAnalysis = async (stepNum) => {
    if (!doc) return;
    setIsAnalyzing(true);
    setError('');
    try {
      const result = await runSafetyAnalysis(stepNum, doc.id);
      setStepResults(prev => ({ ...prev, [stepNum]: result.result }));
      // Update local doc state
      setDoc(prev => {
        const stepKeys = {
          1: "safety_case_review", 2: "sae_narrative", 3: "safety_case_summary",
          4: "causality_checklist", 5: "meddra_coding", 6: "aggregate_safety",
          7: "safety_trend", 8: "medical_review", 9: "signal_detection"
        };
        const key = stepKeys[stepNum];
        return {
          ...prev,
          analysis_results: {
            ...prev.analysis_results,
            [key]: result.result
          }
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Calculate Naranjo causality
  const handleCalculateCausality = async () => {
    setIsNaranjoLoading(true);
    setError('');
    try {
      const result = await assessSafetyCausality(naranjoAnswers, naranjoClinicalContext);
      setNaranjoResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsNaranjoLoading(false);
    }
  };

  // Send Safety Chat message
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !doc) return;
    const msg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setIsChatting(true);
    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const result = await chatWithSafety(doc.id, msg, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Chat failed: ${err.message}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const completedCount = Object.values(stepResults).filter(v => v).length;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>🛡️ Pharmacovigilance & Safety Module</h2>
          <p>AI-assisted pharmacovigilance safety summaries, MedDRA coding reviews, and causality audits.</p>
        </div>
        <button 
          onClick={() => setShowUploadSection(!showUploadSection)}
          className="btn btn-secondary"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
            fontWeight: 700,
            background: showUploadSection ? 'var(--bg-input)' : 'var(--bg-white)',
            color: 'var(--text-primary)',
            transition: 'all 0.2s ease'
          }}
        >
          {showUploadSection ? '✖️ Close Uploader' : '📤 Upload Safety File'}
        </button>
      </div>

      {/* Upload Section */}
      {showUploadSection && (
        <div className="card animate-fade-in" style={{ marginBottom: 24, boxShadow: 'var(--shadow-md)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>📤 Upload Safety Document</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Supports PDF, DOCX, XLSX, CSV</span>
          </div>
          <DocumentUpload onUpload={handleUpload} isUploading={isUploading} />
        </div>
      )}

      {/* Unified Document Manager Bar with Quick-Action Toggle Buttons on the right */}
      <div className="card" style={{ marginBottom: 24, padding: '14px 20px', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <ProtocolSelector 
            allDocs={allDocs}
            currentDoc={doc}
            onSelect={handleSelectDocument}
            onDelete={handleDelete}
          />
          
          <div style={{ display: 'flex', gap: 10, background: 'var(--bg-input)', padding: '5px', borderRadius: '10px' }}>
            <button
              onClick={() => setActiveStep(10)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                borderRadius: '8px',
                background: activeStep === 10 ? 'var(--accent)' : 'transparent',
                color: activeStep === 10 ? 'var(--bg-white)' : 'var(--text-secondary)',
                border: 'none',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: activeStep === 10 ? 'var(--shadow-md)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              🧪 Causality Calculator
            </button>
            
            <button
              onClick={() => setActiveStep(11)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                borderRadius: '8px',
                background: activeStep === 11 ? 'var(--accent)' : 'transparent',
                color: activeStep === 11 ? 'var(--bg-white)' : 'var(--text-secondary)',
                border: 'none',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: activeStep === 11 ? 'var(--shadow-md)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              💬 Safety Chatbot
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 18px',
          background: '#fef2f2',
          borderLeft: '4px solid var(--danger)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 20,
          fontSize: '13.5px',
          fontWeight: 500,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
        </div>
      )}

      {/* Dashboard Stat Cards */}
      {doc && (
        <div className="stats-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Document Name</div>
            <div className="stat-value" style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 6 }}>
              {doc.filename}
            </div>
            <div className="stat-desc">Active PV context</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Total Words</div>
            <div className="stat-value" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
              {doc.stats?.word_count || 'Pending'}
            </div>
            <div className="stat-desc">extracted from document</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Completed Steps</div>
            <div className="stat-value" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
              {completedCount}/9
            </div>
            <div className="stat-desc">
              {completedCount === 9 ? '🎉 Safety Review Finished' : 'Pending steps analysis'}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace (Left Navigation / Right Details Panel) */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        
        {/* Left Column Navigation: Purely for Safety Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 10px 10px 10px', borderBottom: '1px solid var(--border)' }}>
              Safety Review Workflow Steps
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {STEPS.map((step) => {
                const isActive = activeStep === step.id;
                const isCompleted = !!stepResults[step.id];
                
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
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
                      {isCompleted ? '✓' : step.num}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: isActive ? 700 : 600, 
                        color: isActive ? 'var(--accent)' : 'var(--text-primary)', 
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {step.label}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{step.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column Workspace */}
        <div style={{ minWidth: 0 }}>
          
          {/* Active Steps 1-9 WORKSPACE */}
          {activeStep >= 1 && activeStep <= 9 && (
            <div className="card" style={{ padding: '24px', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 17, color: 'var(--text-primary)', fontWeight: 700 }}>
                    {STEPS.find(s => s.id === activeStep)?.icon} Step {activeStep}: {STEPS.find(s => s.id === activeStep)?.label}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {STEPS.find(s => s.id === activeStep)?.desc}
                  </p>
                </div>
                
                <button
                  className="btn btn-primary"
                  onClick={() => handleRunAnalysis(activeStep)}
                  disabled={isAnalyzing || !doc}
                  style={{ minWidth: '160px' }}
                >
                  {isAnalyzing ? 'Analyzing...' : `🛡️ Run Step ${activeStep} Review`}
                </button>
              </div>

              {!doc ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', minHeight: 240 }}>
                  <span style={{ fontSize: 32 }}>📂</span>
                  <p style={{ fontSize: 13, marginTop: 10 }}>Please select or upload a document to begin the safety analysis.</p>
                </div>
              ) : stepResults[activeStep] ? (
                <div 
                  className="animate-fade-in custom-markdown" 
                  style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(stepResults[activeStep]) }}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px 20px', minHeight: 240 }}>
                  <span style={{ fontSize: 32 }}>🛡️</span>
                  <h4 style={{ margin: '14px 0 6px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>Analysis Pending</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 380, textAlign: 'center' }}>
                    Click the <strong>Run Step {activeStep} Review</strong> button to trigger the pharmacovigilance safety evaluation for this step.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 10: INTERACTIVE NARANJO CAUSALITY CALCULATOR */}
          {activeStep === 10 && (
            <div style={{ display: 'grid', gridTemplateColumns: '55% 42%', gap: '3%', alignItems: 'start' }}>
              <div className="card" style={{ padding: '20px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>🧪 Interactive Naranjo Causality Calculator</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {NARANJO_QUESTIONS.map(q => (
                    <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingRight: 10 }}>{q.text}</span>
                      <select
                        value={naranjoAnswers[q.id]}
                        onChange={(e) => setNaranjoAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1.5px solid var(--border)',
                          background: 'var(--bg-white)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {q.options.map(opt => (
                          <option key={opt.val} value={opt.val}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>Clinical Context / Event Description</label>
                  <textarea
                    placeholder="Provide description of adverse event, timeline, dechallenge, or patient medical history context..."
                    value={naranjoClinicalContext}
                    onChange={(e) => setNaranjoClinicalContext(e.target.value)}
                    style={{
                      width: '100%',
                      height: '80px',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--border)',
                      fontSize: '12.5px',
                      outline: 'none',
                      marginBottom: 16
                    }}
                  />
                  <button className="btn btn-primary" onClick={handleCalculateCausality} disabled={isNaranjoLoading} style={{ width: '100%' }}>
                    {isNaranjoLoading ? 'Evaluating Causality...' : '⚖️ Assess Causality Score'}
                  </button>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>📊 Analysis Result</h4>
                {naranjoResult ? (
                  <div className="card animate-fade-in" style={{ padding: '20px', border: '1.5px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 32 }}>{naranjoResult.color}</div>
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Causality Rating</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{naranjoResult.causality}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', background: 'var(--accent-light)', color: 'var(--accent)', padding: '6px 12px', borderRadius: '12px', fontWeight: 800, fontSize: 14 }}>
                        Score: {naranjoResult.score}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>Clinical Explanation</div>
                      <div 
                        style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(naranjoResult.explanation) }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '80px 20px', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: 28 }}>⚖️</span>
                    <p style={{ fontSize: 13, marginTop: 10 }}>Fill out the checklist and click assess to get causality scores.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 11: SAFETY CHAT */}
          {activeStep === 11 && (
            <div className="card" style={{ padding: 0, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#fafafa' }}>
                <h3 style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>💬 Safety & PV Chatbot</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  Safety-scoped helper for <strong>{doc ? doc.filename : 'No active document context'}</strong>.
                </p>
              </div>

              {!doc ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  ⚠️ Please select or upload a document to use Safety Chat.
                </div>
              ) : (
                <>
                  <div style={{ height: '360px', overflowY: 'auto', padding: '20px' }} className="custom-scrollbar">
                    {chatMessages.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: 24 }}>💬</span>
                        <p style={{ fontSize: '13px', marginTop: 8 }}>Ask any question about safety guidelines, dose modifications, or lab schedules in the protocol.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {chatMessages.map((msg, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                            }}
                          >
                            <div
                              style={{
                                maxWidth: '80%',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                fontSize: '13px',
                                lineHeight: '1.5',
                                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-input)',
                                color: msg.role === 'user' ? 'var(--bg-white)' : 'var(--text-primary)'
                              }}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {isChatting && (
                          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ padding: '10px 14px', borderRadius: '12px', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                              Evaluating medical safety context...
                            </div>
                          </div>
                        )}
                        <div ref={chatBottomRef} />
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSendChat} style={{ display: 'flex', borderTop: '1px solid var(--border)', padding: '10px' }}>
                    <input
                      type="text"
                      placeholder="e.g. What safety risks or transaminase elevations require dose reduction?"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isChatting}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        outline: 'none',
                        marginRight: 10
                      }}
                    />
                    <button type="submit" className="btn btn-primary" disabled={isChatting || !chatInput.trim()}>
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
