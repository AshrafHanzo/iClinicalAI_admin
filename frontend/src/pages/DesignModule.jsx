import { useState, useEffect, useRef } from 'react';
import DocumentUpload from '../components/DocumentUpload';
import AnalysisResults from '../components/AnalysisResults';
import { uploadDocument, runAnalysis, chatWithDocument, listDocuments, getDocument, deleteDocument } from '../services/api';

// Custom-designed premium Protocol Selector dropdown
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

  const getCompletedStepsCount = (docObj) => {
    if (!docObj || !docObj.analysis_results) return 0;
    const keys = ['summary', 'extraction', 'eligibility_review', 'gap_analysis', 'feasibility', 'design_recommendations'];
    return keys.filter(k => docObj.analysis_results[k]).length;
  };

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
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '480px' }}>
      {/* Trigger element */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
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
          <span style={{ fontSize: 24, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>📂</span>
          <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Active Protocol</div>
            {currentDoc ? (
              <div style={{ marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                    {currentDoc.filename}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {currentDoc.file_type?.replace('.', '')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {getCompletedStepsCount(currentDoc)}/6 steps analyzed
                  </span>
                  <div style={{ flex: '0 0 60px', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${(getCompletedStepsCount(currentDoc) / 6) * 100}%`, height: '100%', background: getCompletedStepsCount(currentDoc) === 6 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2, fontWeight: 500 }}>Select a protocol document...</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '12px' }}>
            {allDocs.length} loaded
          </span>
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="var(--text-secondary)" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{ 
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
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
            boxShadow: 'var(--shadow-xl)',
            zIndex: 1000,
            maxHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'messageIn 0.2s ease-out'
          }}
        >
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-input)',
            fontSize: 10,
            fontWeight: 750,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.8px'
          }}>
            Select a Protocol File
          </div>

          {/* Search Input Box */}
          <div style={{
            padding: '10px 16px',
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
            {searchTerm && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 2
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredDocs.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {allDocs.length === 0 ? 'No documents uploaded yet.' : 'No matching protocols found.'}
              </div>
            ) : (
              filteredDocs.map((d) => {
                const isActive = currentDoc?.id === d.id;
                const completedCount = getCompletedStepsCount(d);
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
                      padding: '12px 16px',
                      borderBottom: '1px solid #f8fafc',
                      cursor: 'pointer',
                      background: isActive ? 'var(--bg-sidebar-active)' : 'transparent',
                      transition: 'var(--transition)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-sidebar-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 20 }}>{getFileIcon(d.file_type)}</span>
                      <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                        <div style={{ 
                          fontWeight: isActive ? 700 : 600, 
                          color: isActive ? 'var(--accent)' : 'var(--text-primary)', 
                          fontSize: 13,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {d.filename}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatSize(d.file_size)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>•</span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: completedCount === 6 ? 'var(--success-light)' : completedCount > 0 ? 'var(--accent-light)' : 'var(--bg-input)',
                            color: completedCount === 6 ? 'var(--success)' : completedCount > 0 ? 'var(--accent)' : 'var(--text-muted)'
                          }}>
                            {completedCount === 6 ? '✓ 6/6 Analyzed' : completedCount > 0 ? `${completedCount}/6 steps` : 'Pending'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>•</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(d.upload_time).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(d.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'var(--transition)',
                        marginLeft: 8
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--danger)';
                        e.currentTarget.style.background = 'var(--danger-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
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

export default function DesignModule() {
  const [doc, setDoc] = useState(null);
  const [allDocs, setAllDocs] = useState([]);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingType, setLoadingType] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  const fetchDocsList = async (selectId = null) => {
    try {
      const docList = await listDocuments();
      const docs = docList.documents || [];
      setAllDocs(docs);
      
      if (selectId) {
        await handleSelectDocument(selectId);
      } else if (docs.length > 0 && !doc) {
        const latestDoc = docs[docs.length - 1];
        await handleSelectDocument(latestDoc.id);
      }
    } catch (err) {
      console.error('Error fetching documents list:', err);
    }
  };

  useEffect(() => {
    fetchDocsList();
  }, []);

  const handleSelectDocument = async (docId) => {
    setError('');
    try {
      const detailedDoc = await getDocument(docId);
      setDoc(detailedDoc);
      
      const saved = detailedDoc.analysis_results || {};
      setResults({
        summary: saved.summary || null,
        extract: saved.extraction || null,
        eligibility: saved.eligibility_review || null,
        gaps: saved.gap_analysis || null,
        feasibility: saved.feasibility || null,
        recommendations: saved.design_recommendations || null,
      });

      setChatMessages([]);
      setShowUploadSection(false);

      const completedCount = Object.values(saved).filter(Boolean).length;
      if (completedCount === 6) {
        setCurrentStep(3);
      } else if (completedCount > 0) {
        setCurrentStep(2);
      } else {
        setCurrentStep(1);
      }
    } catch (err) {
      setError('Failed to load document: ' + err.message);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document? All analysis results will be removed.')) {
      return;
    }
    setError('');
    try {
      await deleteDocument(docId);
      const remainingDocs = allDocs.filter(d => d.id !== docId);
      setAllDocs(remainingDocs);
      
      if (remainingDocs.length > 0) {
        await handleSelectDocument(remainingDocs[remainingDocs.length - 1].id);
      } else {
        setDoc(null);
        setResults({});
        setChatMessages([]);
        setCurrentStep(0);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalysis = async (type) => {
    if (!doc) return;
    setIsAnalyzing(true);
    setLoadingType(type);
    setError('');
    setCurrentStep(2);
    try {
      if (type === 'full') {
        const result = await runAnalysis('full', doc.id);
        setResults({
          summary: result.summary,
          extract: result.key_information,
          eligibility: result.eligibility_review,
          gaps: result.gap_analysis,
          feasibility: result.feasibility_checklist,
          recommendations: result.design_recommendations,
        });
        setCurrentStep(3);
      } else {
        const result = await runAnalysis(type, doc.id);
        const tabMap = { 
          summarize: 'summary', 
          extract: 'extract', 
          eligibility: 'eligibility',
          gaps: 'gaps', 
          feasibility: 'feasibility',
          recommendations: 'recommendations'
        };
        setResults(prev => ({ ...prev, [tabMap[type]]: result.result }));
      }
      
      const updatedList = await listDocuments();
      setAllDocs(updatedList.documents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
      setLoadingType('');
    }
  };

  const handleChat = async (message) => {
    if (!doc) return;
    const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
    setChatMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsChatting(true);
    try {
      const result = await chatWithDocument(doc.id, message, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const steps = [
    { num: 1, label: 'Upload Document' },
    { num: 2, label: 'AI Processing' },
    { num: 3, label: 'Review Results' },
    { num: 4, label: 'Chat & Refine' },
  ];

  const completedAnalyses = Object.values(results).filter(v => v).length;

  return (
    <div>
      <div className="page-header">
        <h2>📐 DESIGN Module</h2>
        <p>AI-powered protocol review and study design intelligence</p>
      </div>

      {/* Unified Document Manager Bar */}
      <div className="card" style={{ marginBottom: 24, padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <ProtocolSelector 
            allDocs={allDocs}
            currentDoc={doc}
            onSelect={handleSelectDocument}
            onDelete={handleDelete}
          />
          
          <div>
            <button 
              className={`btn ${showUploadSection ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => setShowUploadSection(!showUploadSection)}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showUploadSection ? '✕ Close Upload' : '📤 Upload New Protocol'}
            </button>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="workflow-steps">
        {steps.map(s => (
          <div
            key={s.num}
            className={`workflow-step ${currentStep === s.num ? 'active' : ''} ${currentStep > s.num ? 'done' : ''}`}
          >
            <div className="step-num">{currentStep > s.num ? '✓' : s.num}</div>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="error-banner">
          <span>❌</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-sm btn-secondary" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Document Stats */}
      {doc && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-label">Document</div>
            <div className="stat-value" style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.filename}
            </div>
            <div className="stat-desc">{doc.file_type?.toUpperCase().replace('.', '')} • {formatSize(doc.file_size)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Word Count</div>
            <div className="stat-value">{doc.word_count?.toLocaleString()}</div>
            <div className="stat-desc">words extracted</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Analyses</div>
            <div className="stat-value">{completedAnalyses}/6</div>
            <div className="stat-desc">completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Status</div>
            <div className="stat-value" style={{ fontSize: 16 }}>
              <span className={`status-badge ${completedAnalyses > 0 ? 'success' : 'warning'}`}>
                {completedAnalyses > 0 ? '✓ Analyzed' : '⏳ Pending'}
              </span>
            </div>
            <div className="stat-desc">
              {isAnalyzing ? 'AI processing...' : completedAnalyses > 0 ? 'Ready for review' : 'Run analysis'}
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {(!doc || showUploadSection) && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3>📤 Upload Clinical Document</h3>
          </div>
          <DocumentUpload onUpload={handleUpload} isUploading={isUploading} />
        </div>
      )}

      {/* Full-width Analysis Workspace */}
      <div style={{ width: '100%' }}>
        <AnalysisResults
          docId={doc?.id}
          results={results}
          onRunAnalysis={handleAnalysis}
          isLoading={isAnalyzing}
          loadingType={loadingType}
          chatMessages={chatMessages}
          onSendChatMessage={handleChat}
          isChatting={isChatting}
          docStats={doc?.stats}
          onUpdateStats={(newStats) => setDoc(prev => ({ ...prev, stats: newStats }))}
        />
      </div>
    </div>
  );
}
