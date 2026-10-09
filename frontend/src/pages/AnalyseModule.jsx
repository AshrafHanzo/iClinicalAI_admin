import { useState, useEffect, useRef } from 'react';
import { 
  listDocuments, 
  uploadDocument, 
  deleteDocument, 
  runBiostatsAnalysis, 
  exportBiostats,
  chatWithDocument 
} from '../services/api';
import ChatInterface from '../components/ChatInterface';
import { DashboardHeader, Panel, FeatureCards, StatGrid, DocumentTable, StepCoverage, progressCounts } from '../components/ModuleDashboard';
import { getModule } from '../moduleNav';

// Premium Protocol Selector Dropdown with animations and glassmorphism
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
    if (!isOpen) setSearchTerm('');
  }, [isOpen]);

  const getFileIcon = (type) => {
    if (type === '.pdf') return '📕';
    if (type === '.docx' || type === '.doc') return '📘';
    if (type === '.csv' || type === '.xlsx') return '📊';
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
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Dropdown Trigger */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          border: isOpen ? '1.5px solid #4f8bff' : '1.5px solid #e2e8f0',
          borderRadius: '16px',
          cursor: 'pointer',
          boxShadow: isOpen ? '0 8px 30px rgba(79, 139, 255, 0.15)' : '0 4px 20px rgba(0, 0, 0, 0.02)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px'
          }}>
            📂
          </div>
          <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Active Document</div>
            {currentDoc ? (
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {currentDoc.filename}
                </span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {currentDoc.file_type?.replace('.', '')}
                </span>
              </div>
            ) : (
              <div style={{ color: '#475569', fontSize: '13px', marginTop: 2, fontWeight: 600 }}>Select a protocol context...</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
          <span style={{ fontSize: '10px', color: '#4f8bff', fontWeight: 700, background: '#eff6ff', padding: '3px 10px', borderRadius: '20px' }}>
            {allDocs.length} loaded
          </span>
          <span style={{ fontSize: '11px', color: '#64748b', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }}>▼</span>
        </div>
      </div>

      {/* Options List */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '20px',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
            zIndex: 110,
            maxHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Search */}
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: '14px' }}>🔍</span>
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
                color: '#0f172a',
                fontFamily: 'var(--font)'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredDocs.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                {allDocs.length === 0 ? 'No documents uploaded yet.' : 'No matching documents found.'}
              </div>
            ) : (
              filteredDocs.map((d) => {
                const isActive = currentDoc?.id === d.id;
                return (
                  <div 
                    key={d.id}
                    onClick={() => {
                      onSelect(d);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isActive ? '#eff6ff' : 'transparent',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '20px' }}>{getFileIcon(d.file_type)}</span>
                      <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                        <div style={{ 
                          fontWeight: isActive ? 750 : 600, 
                          color: isActive ? '#4f8bff' : '#0f172a', 
                          fontSize: '13px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {d.filename}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {formatSize(d.file_size)}
                          </span>
                          <span style={{ fontSize: '11px', color: '#cbd5e1' }}>•</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
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
                        color: '#94a3b8',
                        padding: '6px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        marginLeft: 10
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.background = '#fef2f2';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#94a3b8';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      ✕
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

// ─── WORKFLOW STEPS ──────────────────────────────────────────────────

const STEPS = [
  { id: 'study_review', label: 'Study Analysis Review', icon: '📋', desc: 'Summarize study protocol statistical designs' },
  { id: 'endpoint_summary', label: 'Endpoint Summary', icon: '🎯', desc: 'Identify primary, secondary and safety targets' },
  { id: 'sap_outline', label: 'SAP Outline Structure', icon: '📝', desc: 'Draft statistical analysis plan outline' },
  { id: 'tlf_shells', label: 'TLF Shell Draft Package', icon: '📊', desc: 'Design mockup table, listing & figure shells' },
  { id: 'dataset_checklist', label: 'Dataset Review Checklist', icon: '✔️', desc: 'Database readiness and compliance audit' },
  { id: 'descriptive_stats', label: 'Descriptive Statistics', icon: '📈', desc: 'Compute on-the-fly statistics and summary tables' },
  { id: 'clinical_interpretation', label: 'Clinical Interpretation', icon: '💡', desc: 'Synthesize safety & efficacy result insights' },
  { id: 'csr_results', label: 'CSR Results Draft', icon: '✍️', desc: 'Produce copy-paste clinical study report prose' },
  { id: 'chat', label: '💬 Biostatistician Chat', icon: '🤖', desc: 'Chat directly with your study protocol & data' }
];

export default function AnalyseModule({ view = 'dashboard', onNavigate = () => {} }) {
  // The module sidebar and the workflow list both drive the active step.
  const activeStep = view === 'dashboard' ? 'study_review' : view;
  const setActiveStep = onNavigate;
  const [allDocs, setAllDocs] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  
  // Dataset States
  const [datasetDoc, setDatasetDoc] = useState(null);
  const [datasetParsed, setDatasetParsed] = useState({ headers: [], data: [] });
  const [statSummary, setStatSummary] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statsViewMode, setStatsViewMode] = useState('local'); // 'local' or 'ai'

  // Results & Loading
  const [results, setResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isUploadingData, setIsUploadingData] = useState(false);
  const [error, setError] = useState('');
  
  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);

  const fileInputRef = useRef();
  const dataInputRef = useRef();

  // Fetch Documents
  const loadDocs = async (selectId = null) => {
    try {
      const res = await listDocuments();
      const docs = res.documents || [];
      setAllDocs(docs);
      
      if (selectId) {
        const found = docs.find(d => d.id === selectId);
        if (found) selectDocument(found);
      } else if (docs.length > 0 && !currentDoc) {
        const protocol = docs.find(d => ['.pdf', '.docx', '.txt'].includes(d.file_type)) || docs[0];
        selectDocument(protocol);
        
        const dataset = docs.find(d => ['.csv', '.xlsx'].includes(d.file_type));
        if (dataset) selectDataset(dataset);
      }
    } catch (err) {
      console.error("Error listing documents:", err);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const selectDocument = (docObj) => {
    setCurrentDoc(docObj);
    if (docObj.analysis_results) {
      const saved = docObj.analysis_results;
      setResults(prev => ({
        ...prev,
        study_review: saved.study_review || '',
        endpoint_summary: saved.endpoint_summary || '',
        sap_outline: saved.sap_outline || '',
        tlf_shells: saved.tlf_shells || '',
        dataset_checklist: saved.dataset_checklist || '',
        descriptive_stats: saved.descriptive_stats || '',
        clinical_interpretation: saved.clinical_interpretation || '',
        csr_results: saved.csr_results || ''
      }));
    }
  };

  const selectDataset = async (docObj) => {
    setDatasetDoc(docObj);
    setIsLoading(true);
    try {
      const detailed = await fetch(`/api/documents/${docObj.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('iclinical_token')}` }
      }).then(r => r.json());
      
      if (detailed.extracted_text) {
        parseCSVText(detailed.extracted_text);
      }
    } catch (err) {
      console.error("Error reading dataset content:", err);
    }
    setIsLoading(false);
  };

  // CSV Tabular Parsing
  const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) {
      setDatasetParsed({ headers: [], data: [] });
      setStatSummary([]);
      return;
    }

    const parseLine = (line) => {
      const result = [];
      let insideQuote = false;
      let entry = "";
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          result.push(entry.trim());
          entry = "";
        } else {
          entry += char;
        }
      }
      result.push(entry.trim());
      return result.map(val => val.replace(/^["']|["']$/g, ''));
    };

    const headers = parseLine(lines[0]);
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const rowValues = parseLine(lines[i]);
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = rowValues[j] !== undefined ? rowValues[j] : "";
      }
      data.push(obj);
    }

    setDatasetParsed({ headers, data });
    calculateStats(headers, data);
  };

  // Calculate descriptive stats locally
  const calculateStats = (headers, data) => {
    const summary = [];
    headers.forEach(header => {
      const vals = data.map(d => parseFloat(d[header])).filter(v => !isNaN(v));
      if (vals.length > 0 && vals.length > data.length * 0.4) {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sorted = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        
        const variance = vals.length > 1
          ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length - 1)
          : 0;
        const sd = Math.sqrt(variance);

        summary.push({
          variable: header,
          type: 'Numeric',
          count: vals.length,
          mean: mean.toFixed(2),
          median: median.toFixed(2),
          sd: sd.toFixed(2),
          min: min.toFixed(2),
          max: max.toFixed(2)
        });
      } else {
        const frequencies = {};
        data.forEach(d => {
          const val = d[header] || 'Missing';
          frequencies[val] = (frequencies[val] || 0) + 1;
        });

        const topCat = Object.entries(frequencies)
          .sort((a, b) => b[1] - a[1])[0];

        summary.push({
          variable: header,
          type: 'Categorical',
          count: data.length,
          top: topCat ? `${topCat[0]} (${topCat[1]} counts)` : 'N/A',
          unique: Object.keys(frequencies).length
        });
      }
    });
    setStatSummary(summary);
  };

  const handleUploadDoc = async (file) => {
    setIsUploadingDoc(true);
    setError('');
    try {
      const uploaded = await uploadDocument(file);
      await loadDocs(uploaded.id);
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
    setIsUploadingDoc(false);
  };

  const handleUploadDataset = async (file) => {
    setIsUploadingData(true);
    setError('');
    try {
      const uploaded = await uploadDocument(file);
      await loadDocs();
      await selectDataset(uploaded);
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
    setIsUploadingData(false);
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await deleteDocument(docId);
      if (currentDoc?.id === docId) setCurrentDoc(null);
      if (datasetDoc?.id === docId) {
        setDatasetDoc(null);
        setDatasetParsed({ headers: [], data: [] });
        setStatSummary([]);
      }
      loadDocs();
    } catch (err) {
      setError("Failed to delete document.");
    }
  };

  const handleRunAnalysis = async () => {
    if (!currentDoc) {
      setError("Please select an Active Document context from the dropdown.");
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const docId = currentDoc.id;
      let extra = "";
      if (datasetDoc && datasetParsed.data.length > 0) {
        const previewRows = datasetParsed.data.slice(0, 100);
        extra = JSON.stringify({
          filename: datasetDoc.filename,
          rowCount: datasetParsed.data.length,
          columnSummary: statSummary,
          dataPreview: previewRows
        }, null, 2);
      }

      const res = await runBiostatsAnalysis(activeStep, docId, extra);
      setResults(prev => ({ ...prev, [activeStep]: res.result }));
      
      if (!currentDoc.analysis_results) currentDoc.analysis_results = {};
      currentDoc.analysis_results[activeStep] = res.result;

    } catch (err) {
      setError(err.message || 'Biostatistics analysis failed');
    }
    setIsLoading(false);
  };

  const handleExport = async (format) => {
    const content = results[activeStep];
    if (!content) return;
    try {
      const stepLabel = STEPS.find(s => s.id === activeStep)?.label || activeStep;
      const filename = `iClinicalAI_Analyse_${activeStep}_${new Date().toISOString().slice(0,10)}`;
      const blob = await exportBiostats(format, stepLabel, content, filename);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format === 'word' ? 'docx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleSendChatMessage = async (msg) => {
    if (!currentDoc) return;
    setIsChatting(true);
    const newMsg = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, newMsg]);
    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await chatWithDocument(currentDoc.id, msg, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    }
    setIsChatting(false);
  };

  // Modern Markdown Parser
  const parseMarkdownTable = (rows) => {
    if (rows.length < 2) return '';
    let html = '<div class="table-container" style="overflow-x:auto; margin: 24px 0; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.01);"><table style="width:100%; border-collapse:collapse; font-size:13px; font-family:var(--font);">';
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      let cells = row.split('|').slice(1, -1).map(c => c.trim());
      if (i === 1 && cells.every(c => c.match(/^:?-+:?$/))) continue;
      
      const isHeader = i === 0;
      html += `<tr style="border-bottom: 1px solid #e2e8f0; ${isHeader ? 'background:#f8fafc; font-weight:700; color:#0f172a;' : 'background:#ffffff; color:#334155;'}">`;
      for (let cell of cells) {
        const padding = '12px 16px';
        const tag = isHeader ? 'th' : 'td';
        let styleStr = `padding:${padding}; text-align:left; font-size: 13px; line-height: 1.5;`;
        
        if (!isHeader) {
          // Add highlight badges for standard safety keywords
          if (cell.toLowerCase().includes('high risk') || cell === 'High' || cell.toLowerCase().includes('red') || cell.toLowerCase().includes('critical')) {
            cell = `<span style="background:#fef2f2; color:#ef4444; font-weight:600; padding:2px 8px; border-radius:6px; font-size:11px;">${cell}</span>`;
          } else if (cell.toLowerCase().includes('medium') || cell === 'Moderate' || cell.toLowerCase().includes('amber') || cell.toLowerCase().includes('warning')) {
            cell = `<span style="background:#fffbeb; color:#d97706; font-weight:600; padding:2px 8px; border-radius:6px; font-size:11px;">${cell}</span>`;
          } else if (cell.toLowerCase().includes('low') || cell.toLowerCase().includes('green') || cell.toLowerCase().includes('yes') || cell === '✓' || cell.toLowerCase().includes('acceptable')) {
            cell = `<span style="background:#ecfdf5; color:#059669; font-weight:600; padding:2px 8px; border-radius:6px; font-size:11px;">${cell}</span>`;
          }
        }
        html += `<${tag} style="${styleStr}">${cell}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  };

  const renderMarkdown = (text) => {
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
      .replace(/### (.*)/g, '<h3 style="font-size: 15px; font-weight:700; color:#0f172a; margin: 24px 0 8px 0; display:flex; align-items:center; gap:8px;">$1</h3>')
      .replace(/## (.*)/g, '<h2 style="font-size: 18px; font-weight:700; color:#2563eb; margin: 32px 0 12px 0; border-bottom:1.5px solid #f1f5f9; padding-bottom:6px;">$1</h2>')
      .replace(/# (.*)/g, '<h1 style="font-size: 22px; font-weight:800; color:#0f172a; margin: 36px 0 16px 0; letter-spacing:-0.5px;">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a; font-weight:700;">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '<li style="margin-left: 24px; margin-bottom: 8px; color:#475569; list-style-type: disc; padding-left: 4px;">$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul style="margin: 12px 0; padding-left: 0;">$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/\n\n/g, '<br/>');
  };

  const filteredDatasetRows = datasetParsed.data.filter(row => {
    return Object.values(row).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  
  const totalPages = Math.ceil(filteredDatasetRows.length / 10);
  const paginatedRows = filteredDatasetRows.slice((currentPage - 1) * 10, currentPage * 10);

  if (view === 'dashboard') {
    const steps = getModule('analyze').features
      .filter(f => f.id !== 'chat')
      .map(f => ({ ...f, key: f.id, desc: STEPS.find(s => s.id === f.id)?.desc }));
    const stepKeys = steps.map(s => s.key);
    const isDataset = (d) => ['.csv', '.xlsx'].includes(d.file_type);
    const protocols = allDocs.filter(d => !isDataset(d));
    const datasets = allDocs.filter(isDataset);
    const counts = progressCounts(protocols, stepKeys);
    const activeDone = stepKeys.filter(k => results[k]).length;
    const numericStats = statSummary.filter(s => s.type === 'Numeric');

    return (
      <div className="dash">
        <DashboardHeader
          title="Welcome to Analyse"
          subtitle="Formulate SAP parameters, track study endpoints, evaluate database readiness checklists, and compile descriptive statistics reports."
        >
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            {isUploadingDoc ? 'Uploading...' : '📁 Ingest Protocol'}
            <input type="file" accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} disabled={isUploadingDoc}
              onChange={(e) => { handleUploadDoc(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {isUploadingData ? 'Uploading...' : '📊 Ingest Dataset'}
            <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} disabled={isUploadingData}
              onChange={(e) => { handleUploadDataset(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </DashboardHeader>

        {error && (
          <div className="error-banner">
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        <StatGrid items={[
          { label: 'Protocols', value: protocols.length, sub: 'PDF / DOCX / TXT', tone: 2 },
          { label: 'Datasets', value: datasets.length, sub: 'CSV / XLSX', tone: 3 },
          { label: 'Analysis Outputs', value: counts.stepsDone, sub: 'Across all protocols', tone: 4 },
          { label: 'Active Protocol', value: `${activeDone}/8`, sub: currentDoc ? 'Steps generated' : 'None selected', tone: 6 },
          { label: 'Active Dataset Rows', value: datasetDoc ? datasetParsed.data.length.toLocaleString() : '—', sub: datasetDoc ? `${datasetParsed.headers.length} columns` : 'No dataset selected', tone: 5 },
        ]} />

        <Panel title="Documents & Datasets" flush>
          <DocumentTable
            docs={allDocs}
            stepKeys={stepKeys}
            activeIds={[currentDoc?.id, datasetDoc?.id].filter(Boolean)}
            onOpen={(d) => (isDataset(d) ? selectDataset(d) : selectDocument(d))}
            openLabel="Set Active"
            emptyText="No documents uploaded yet. Use Ingest Protocol or Ingest Dataset."
          />
        </Panel>

        <div className="dash-grid">
          <Panel title="Analysis Step Coverage">
            <StepCoverage steps={steps} docs={protocols} onOpen={onNavigate} />
          </Panel>

          <Panel title="Active Dataset" action={datasetDoc ? { label: 'Descriptive Statistics', onClick: () => onNavigate('descriptive_stats') } : null} flush={numericStats.length > 0}>
            {!datasetDoc ? (
              <div className="dash-empty">No dataset selected. Ingest a CSV or set one active from the table.</div>
            ) : !numericStats.length ? (
              <div className="dash-empty">{datasetDoc.filename}: no numeric variables found.</div>
            ) : (
              <div className="table-scroll">
                <table className="dash-table">
                  <thead><tr><th>Variable</th><th>Mean</th><th>SD</th><th>Min</th><th>Max</th></tr></thead>
                  <tbody>
                    {numericStats.slice(0, 6).map(s => (
                      <tr key={s.variable}>
                        <td className="row-title">{s.variable}</td>
                        <td>{s.mean}</td><td>{s.sd}</td><td>{s.min}</td><td>{s.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Features">
          <FeatureCards
            features={getModule('analyze').features.map(f => ({ ...f, desc: STEPS.find(s => s.id === f.id)?.desc }))}
            doneIds={STEPS.filter(s => results[s.id]).map(s => s.id)}
            onOpen={onNavigate}
          />
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 24, padding: '12px 0' }}>
      
      {/* Premium Glassmorphic Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '30px 40px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '24px',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08)',
        color: '#ffffff',
        position: 'relative'
      }}>
        {/* Glow wrapper with border radius and overflow hidden to prevent clipping of the dropdown list */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '24px',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 0
        }}>
          {/* Glow decoration */}
          <div style={{
            position: 'absolute',
            top: '-10%',
            right: '5%',
            width: '200px',
            height: '200px',
            background: 'rgba(59, 130, 246, 0.15)',
            filter: 'blur(80px)',
            borderRadius: '50%'
          }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #4f8bff 100%)',
              padding: '4px 12px',
              borderRadius: '8px',
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
            }}>Analyse Engine</span>
            <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>v1.0.0</span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, marginTop: 8, letterSpacing: '-0.8px', color: '#f8fafc' }}>
            Biostatistics & Clinical Analytics Suite
          </h1>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', marginTop: 6, fontWeight: 500, maxWidth: '600px', lineHeight: 1.5 }}>
            Formulate SAP parameters, track study endpoints, evaluate database readiness checklists, and compile descriptive statistics reports.
          </p>
        </div>
        
        {/* Active Context dropdown selector */}
        <div style={{ width: '380px', position: 'relative', zIndex: 2 }}>
          <ProtocolSelector 
            allDocs={allDocs} 
            currentDoc={currentDoc} 
            onSelect={selectDocument} 
            onDelete={handleDeleteDoc}
          />
        </div>
      </div>

      {error && (
        <div style={{
          padding: '16px 24px',
          background: '#fef2f2',
          border: '1.5px solid #fecaca',
          borderRadius: '16px',
          color: '#ef4444',
          fontWeight: 650,
          fontSize: '13.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>✕</button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
        
        {/* Left Control Panel */}
        <div style={{ width: '330px', display: 'flex', flexDirection: 'column', gap: 24, flexShrink: 0 }}>
          
          {/* Workflow Steps Card */}
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <h3 style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
              Analysis Workflow
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STEPS.map((step) => {
                const isActive = activeStep === step.id;
                const hasResult = !!results[step.id];
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      border: 'none',
                      borderRadius: '14px',
                      background: isActive ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      textAlign: 'left',
                      width: '100%',
                      boxShadow: isActive ? '0 4px 15px rgba(59, 130, 246, 0.05)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={{ 
                        fontSize: '17px',
                        transform: isActive ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.2s'
                      }}>{step.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: isActive ? 750 : 600,
                          color: isActive ? '#1e40af' : '#334155',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {step.label}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                          {step.desc}
                        </div>
                      </div>
                    </div>
                    {hasResult && !isActive && (
                      <span style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#d1fae5',
                        color: '#065f46',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 800
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload Documents Box */}
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            <h3 style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>
              File Ingestion Hub
            </h3>
            
            {/* Protocol upload area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Study Protocol context (PDF/DOCX)</span>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '14px',
                  background: '#f8fafc',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4f8bff';
                  e.currentTarget.style.background = '#eff6ff';
                  e.currentTarget.style.color = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#334155';
                }}
              >
                {isUploadingDoc ? 'Uploading...' : '📁 Ingest Protocol'}
              </button>
              <input 
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                style={{ display: 'none' }}
                onChange={(e) => handleUploadDoc(e.target.files[0])}
              />
            </div>

            {/* Dataset upload area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Study Dataset (CSV/XLSX)</span>
              <button 
                onClick={() => dataInputRef.current?.click()}
                disabled={isUploadingData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '14px',
                  background: '#f8fafc',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#10b981';
                  e.currentTarget.style.background = '#ecfdf5';
                  e.currentTarget.style.color = '#059669';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#334155';
                }}
              >
                {isUploadingData ? 'Uploading...' : '📊 Ingest Dataset'}
              </button>
              <input 
                ref={dataInputRef}
                type="file"
                accept=".csv,.xlsx"
                style={{ display: 'none' }}
                onChange={(e) => handleUploadDataset(e.target.files[0])}
              />
            </div>

            {datasetDoc && (
              <div style={{
                background: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                padding: '12px 16px',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
              }}>
                <span style={{ color: '#065f46', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                  📈 Active Dataset: {datasetDoc.filename}
                </span>
                <button 
                  onClick={() => {
                    setDatasetDoc(null);
                    setDatasetParsed({ headers: [], data: [] });
                    setStatSummary([]);
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right Workspace Board */}
        <div style={{
          flex: 1,
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '24px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden'
        }}>
          
          {/* Action Header bar */}
          <div style={{
            padding: '20px 30px',
            borderBottom: '1.5px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{STEPS.find(s => s.id === activeStep)?.icon}</span>
                <span>{STEPS.find(s => s.id === activeStep)?.label}</span>
              </h2>
              {currentDoc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Active Scope:</span>
                  <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>{currentDoc.filename}</span>
                </div>
              )}
            </div>

            {activeStep !== 'chat' && (
              <div style={{ display: 'flex', gap: 12 }}>
                {results[activeStep] && (
                  <>
                    <button 
                      onClick={() => handleExport('word')}
                      style={{
                        padding: '10px 18px',
                        background: '#ffffff',
                        color: '#334155',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                    >
                      📘 Export Word
                    </button>
                    <button 
                      onClick={() => handleExport('pdf')}
                      style={{
                        padding: '10px 18px',
                        background: '#ffffff',
                        color: '#334155',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                    >
                      📕 Export PDF
                    </button>
                  </>
                )}

                <button
                  onClick={handleRunAnalysis}
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    background: isLoading ? '#cbd5e1' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: isLoading ? 'none' : '0 4px 15px rgba(37, 99, 235, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="mini-spinner" /> Running AI...
                    </span>
                  ) : results[activeStep] ? 'Re-run AI Analysis' : 'Run AI Analysis'}
                </button>
              </div>
            )}
          </div>

          {/* Content Viewer Panel */}
          <div style={{ flex: 1, padding: '30px 40px', overflowY: 'auto', background: '#ffffff' }}>
            
            {isLoading ? (
              // Premium Pulsing Skeleton Loader
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ width: '40%', height: '24px', background: '#f1f5f9', borderRadius: '6px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '80%', height: '14px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '95%', height: '14px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite', marginTop: 10 }} />
                <div style={{ width: '90%', height: '14px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '85%', height: '14px', background: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                
                <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
                  <div style={{ flex: 1, height: '100px', background: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ flex: 1, height: '100px', background: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                </div>
                
                <style>{`
                  @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                  }
                  .mini-spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-top-color: #ffffff;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                  }
                `}</style>
              </div>
            ) : activeStep === 'chat' ? (
              currentDoc ? (
                <ChatInterface 
                  docId={currentDoc.id}
                  messages={chatMessages}
                  onSendMessage={handleSendChatMessage}
                  isChatting={isChatting}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: 16 }}>
                  <span style={{ fontSize: '50px' }}>🤖</span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Active Protocol Context Required</h3>
                  <p style={{ fontSize: '13.5px', color: '#64748b', textAlign: 'center', maxWidth: '340px' }}>
                    Select a study protocol from the header dropdown to initiate the AI Biostatistician Chat.
                  </p>
                </div>
              )
            ) : activeStep === 'descriptive_stats' && datasetParsed.data.length > 0 ? (
              // Splendid Interactive Data Explorer
              <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                
                {/* Metric grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                  <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total Records</div>
                    <div style={{ fontSize: '24px', fontWeight: 850, color: '#0f172a', marginTop: 6 }}>{datasetParsed.data.length}</div>
                  </div>
                  <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total Columns</div>
                    <div style={{ fontSize: '24px', fontWeight: 850, color: '#0f172a', marginTop: 6 }}>{datasetParsed.headers.length}</div>
                  </div>
                  <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Numeric Variables</div>
                    <div style={{ fontSize: '24px', fontWeight: 850, color: '#10b981', marginTop: 6 }}>
                      {statSummary.filter(s => s.type === 'Numeric').length}
                    </div>
                  </div>
                  <div style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Categorical Variables</div>
                    <div style={{ fontSize: '24px', fontWeight: 850, color: '#3b82f6', marginTop: 6 }}>
                      {statSummary.filter(s => s.type === 'Categorical').length}
                    </div>
                  </div>
                </div>

                {/* Segmented Control Tabs */}
                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '12px',
                  width: 'fit-content'
                }}>
                  <button 
                    onClick={() => setStatsViewMode('local')}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: statsViewMode === 'local' ? '#ffffff' : 'transparent',
                      color: statsViewMode === 'local' ? '#0f172a' : '#64748b',
                      boxShadow: statsViewMode === 'local' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    📊 Statistical Summaries
                  </button>
                  <button 
                    onClick={() => setStatsViewMode('ai')}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: statsViewMode === 'ai' ? '#ffffff' : 'transparent',
                      color: statsViewMode === 'ai' ? '#0f172a' : '#64748b',
                      boxShadow: statsViewMode === 'ai' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    🤖 AI Clinical Insights
                  </button>
                </div>

                {statsViewMode === 'local' ? (
                  <div>
                    {/* Variables Table */}
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Dataset Variable Summary</h3>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#0f172a' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Variable</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Type</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Valid N</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Mean / Mode</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Median / Unique</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>SD</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Min</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statSummary.map((stat, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{stat.variable}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: stat.type === 'Numeric' ? '#e6fffa' : '#ebf8ff',
                                  color: stat.type === 'Numeric' ? '#047481' : '#2b6cb0'
                                }}>{stat.type}</span>
                              </td>
                              <td style={{ padding: '12px 16px' }}>{stat.count}</td>
                              <td style={{ padding: '12px 16px' }}>{stat.type === 'Numeric' ? stat.mean : stat.top}</td>
                              <td style={{ padding: '12px 16px' }}>{stat.type === 'Numeric' ? stat.median : stat.unique}</td>
                              <td style={{ padding: '12px 16px' }}>{stat.type === 'Numeric' ? stat.sd : '—'}</td>
                              <td style={{ padding: '12px 16px' }}>{stat.type === 'Numeric' ? stat.min : '—'}</td>
                              <td style={{ padding: '12px 16px' }}>{stat.type === 'Numeric' ? stat.max : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Explorer */}
                    <div style={{ marginTop: 40 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Tabular Data Explorer</h3>
                        <input 
                          type="text" 
                          placeholder="Filter records..." 
                          value={searchTerm} 
                          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                          style={{
                            padding: '8px 16px',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '10px',
                            fontSize: '13px',
                            width: '240px',
                            outline: 'none',
                            fontFamily: 'var(--font)'
                          }}
                        />
                      </div>

                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#0f172a' }}>
                              {datasetParsed.headers.map((h, i) => (
                                <th key={i} style={{ padding: '12px 16px', textAlign: 'left' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedRows.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                {datasetParsed.headers.map((h, i) => (
                                  <td key={i} style={{ padding: '12px 16px', color: '#475569' }}>{row[h] || '—'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                          <span style={{ fontSize: '13px', color: '#64748b' }}>
                            Showing {(currentPage - 1) * 10 + 1} - {Math.min(currentPage * 10, filteredDatasetRows.length)} of {filteredDatasetRows.length} entries
                          </span>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button 
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(prev => prev - 1)}
                              style={{
                                padding: '6px 14px',
                                background: '#ffffff',
                                border: '1.5px solid #e2e8f0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: currentPage === 1 ? '#cbd5e1' : '#334155'
                              }}
                            >Prev</button>
                            <button 
                              disabled={currentPage === totalPages}
                              onClick={() => setCurrentPage(prev => prev + 1)}
                              style={{
                                padding: '6px 14px',
                                background: '#ffffff',
                                border: '1.5px solid #e2e8f0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: currentPage === totalPages ? '#cbd5e1' : '#334155'
                              }}
                            >Next</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    {results.descriptive_stats ? (
                      <div 
                        className="markdown-body" 
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(results.descriptive_stats) }} 
                      />
                    ) : (
                      <div style={{ textAlign: 'center', padding: '60px 40px', color: '#64748b' }}>
                        <span style={{ fontSize: '40px' }}>🤖</span>
                        <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: 12 }}>No AI Analysis Drafted</h4>
                        <p style={{ fontSize: '13px', color: '#64748b', marginTop: 4, maxWidth: '280px', margin: '6px auto 14px auto' }}>
                          Ingest your dataset, click "Run AI Analysis", and view comprehensive clinical descriptions.
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : results[activeStep] ? (
              // Styled AI Output Display
              <div 
                className="markdown-body"
                style={{ fontSize: '14px', lineHeight: '1.7', color: '#334155' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(results[activeStep]) }}
              />
            ) : (
              // Gorgeous Interactive Empty State (replaces raw/brain look)
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: '40px 0'
              }}>
                <div style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '30px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '44px',
                  boxShadow: '0 8px 30px rgba(59, 130, 246, 0.08)',
                  marginBottom: '24px'
                }}>
                  📊
                </div>
                <div style={{ textAlign: 'center', maxWidth: '440px' }}>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Biostatistics Analysis Ready</h3>
                  <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
                    Ingest your clinical study documents or datasets using the control panel, then trigger <strong>"Run AI Analysis"</strong> to generate structured biostatistical parameters.
                  </p>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 16,
                  width: '100%',
                  maxWidth: '560px',
                  marginTop: '36px'
                }}>
                  <div style={{
                    padding: '16px',
                    border: '1.5px solid #f1f5f9',
                    borderRadius: '16px',
                    background: '#f8fafc',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                      <span>📝</span>
                      <span>Protocol & SAP Outlining</span>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                      Formulate detailed outlines mapping study endpoints directly to statistical models.
                    </p>
                  </div>
                  <div style={{
                    padding: '16px',
                    border: '1.5px solid #f1f5f9',
                    borderRadius: '16px',
                    background: '#f8fafc',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                      <span>📈</span>
                      <span>Descriptive Statistics</span>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                      Evaluate demographics datasets, calculate summary statistics, and compile CSR prose.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
          </div>

        </div>

      </div>

    </div>
  );
}
