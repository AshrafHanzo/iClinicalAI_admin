import { useState, useEffect } from 'react';
import ChatInterface from './ChatInterface';
import { getOrGenerateDashboard } from '../services/api';

const TABS = [
  { id: 'extract', label: 'Step 1: Protocol Review', type: 'extract' },
  { id: 'summary', label: 'Step 2: Protocol Synopsis', type: 'summarize' },
  { id: 'eligibility', label: 'Step 3: Eligibility Criteria Review', type: 'eligibility' },
  { id: 'gaps', label: 'Step 4: Protocol Gap Assessment', type: 'gaps' },
  { id: 'feasibility', label: 'Step 5: Study Feasibility Review', type: 'feasibility' },
  { id: 'recommendations', label: 'Step 6: Study Design Optimization', type: 'recommendations' },
  { id: 'chat', label: '💬 Ask AI', type: 'chat' },
];

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
        if (cell.toLowerCase().includes('high risk') || cell === 'High') statusClass = 'status-badge error';
        else if (cell.toLowerCase().includes('medium risk') || cell === 'Moderate' || cell.toLowerCase().includes('limited')) statusClass = 'status-badge warning';
        else if (cell.toLowerCase().includes('good') || cell.toLowerCase().includes('realistic') || cell.toLowerCase().includes('low') || cell.toLowerCase().includes('yes')) statusClass = 'status-badge success';
        
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

function convertMarkdownTableToExcelHtml(rows) {
  if (rows.length < 2) return '';
  let html = '<table>';
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (i === 1 && cells.every(c => c.match(/^:?-+:?$/))) {
      continue;
    }
    html += '<tr>';
    for (let cell of cells) {
      if (i === 0) {
        html += `<th style="background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 6px;">${cell}</th>`;
      } else {
        html += `<td style="border: 1px solid #cbd5e1; padding: 6px;">${cell}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function renderMarkdown(text) {
  if (!text) return '';
  
  // Parse tables first
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
    .replace(/🔴/g, '<span class="status-badge error" style="padding:2px 8px;font-size:11px;vertical-align:middle;margin-right:4px">🔴 Critical</span>')
    .replace(/🟡/g, '<span class="status-badge warning" style="padding:2px 8px;font-size:11px;vertical-align:middle;margin-right:4px">🟡 Major</span>')
    .replace(/🟢/g, '<span class="status-badge success" style="padding:2px 8px;font-size:11px;vertical-align:middle;margin-right:4px">🟢 Minor</span>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n\n/g, '<br/>');
}

export default function AnalysisResults({ 
  docId, 
  results, 
  onRunAnalysis, 
  isLoading, 
  loadingType,
  chatMessages,
  onSendChatMessage,
  isChatting,
  docStats,
  onUpdateStats,
  activeTab: controlledTab,
  onTabChange
}) {
  const [internalTab, setInternalTab] = useState('extract');
  // When the module sidebar drives the step, the tabs stay in sync with it.
  const activeTab = controlledTab || internalTab;
  const setActiveTab = onTabChange || setInternalTab;
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGeneratingDashboard, setIsGeneratingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  useEffect(() => {
    setIsExportOpen(false);
    setDashboardError('');
  }, [docId]);

  if (!docId) {
    return (
      <div className="card">
        <div className="analysis-placeholder">
          <span className="placeholder-icon">🧠</span>
          <h4>Upload a document to begin</h4>
          <p>AI-powered analysis will appear here</p>
        </div>
      </div>
    );
  }

  const currentResult = results[activeTab] || null;
  const hasAnyResults = Object.values(results).some(v => v);

  const handleGenerateDashboard = async () => {
    setIsGeneratingDashboard(true);
    setDashboardError('');
    try {
      const data = await getOrGenerateDashboard(docId);
      if (onUpdateStats) {
        const updatedStats = { ...docStats, executive_dashboard: data.executive_dashboard };
        onUpdateStats(updatedStats);
      }
    } catch (err) {
      setDashboardError(err.message || 'Failed to generate study dashboard');
    } finally {
      setIsGeneratingDashboard(false);
    }
  };

  const handleWordExport = () => {
    if (!currentResult) return;
    const title = TABS.find(t => t.id === activeTab)?.label || "Protocol Analysis";
    const contentHtml = renderMarkdown(currentResult);
    
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><title>" + title + "</title><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; } table { border-collapse: collapse; width: 100%; margin: 16px 0; } th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; } th { background-color: #f1f5f9; font-weight: bold; }</style></head><body><h1>iClinicalAI Design: " + title + "</h1>";
    const footer = "</body></html>";
    const sourceHTML = header + contentHtml + footer;
    
    const fileBlob = new Blob(['\ufeff' + sourceHTML], {
      type: 'application/msword'
    });
    
    const url = URL.createObjectURL(fileBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExcelExport = () => {
    if (!currentResult) return;
    const title = TABS.find(t => t.id === activeTab)?.label || "Protocol Analysis";
    
    let lines = currentResult.split('\n');
    let tablesHtml = "";
    let inTable = false;
    let tableRows = [];
    
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
          tablesHtml += convertMarkdownTableToExcelHtml(tableRows) + "<br/><br/>";
          inTable = false;
        }
      }
    }
    if (inTable) {
      tablesHtml += convertMarkdownTableToExcelHtml(tableRows);
    }
    
    if (!tablesHtml) {
      tablesHtml = "<table><tr><th style='background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 6px;'>Protocol Content</th></tr>";
      lines.forEach(l => {
        if (l.trim()) {
          tablesHtml += `<tr><td style='border: 1px solid #cbd5e1; padding: 6px;'>${l.replace(/[*#\-]/g, '').trim()}</td></tr>`;
        }
      });
      tablesHtml += "</table>";
    }
    
    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${title.substring(0, 31).replace(/[^a-zA-Z0-9 ]/g, '')}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; margin: 12px 0; }
          th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; }
          td { border: 1px solid #cbd5e1; }
        </style>
      </head>
      <body>
        <h2>iClinicalAI Design: ${title}</h2>
        ${tablesHtml}
      </body>
      </html>
    `;
    
    const fileBlob = new Blob(['\ufeff' + excelTemplate], {
      type: 'application/vnd.ms-excel'
    });
    
    const url = URL.createObjectURL(fileBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const dashboard = docStats?.executive_dashboard || null;

  const renderDashboardPanel = () => {
    if (activeTab === 'chat') return null;

    if (!dashboard) {
      return (
        <div style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.04) 0%, rgba(236, 72, 153, 0.04) 100%)',
          borderRadius: '12px',
          border: '1.5px dashed var(--border)',
          marginBottom: '24px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ fontSize: '32px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>📊</span>
          <h4 style={{ margin: '10px 0 6px 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700 }}>Executive Study Dashboard & AI Health Scores</h4>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '480px', marginInline: 'auto' }}>
            Extract key metrics (Study Phase, Therapeutic Area, Study Design, etc.) and generate clinical feasibility & overall readiness scores for this protocol.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleGenerateDashboard}
            disabled={isGeneratingDashboard}
          >
            {isGeneratingDashboard ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></span>
                Analyzing Protocol Metrics...
              </span>
            ) : '⚡ Generate Dashboard & Health Scores'}
          </button>
          {dashboardError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '10px', fontWeight: 600 }}>{dashboardError}</div>}
        </div>
      );
    }

    return (
      <div style={{
        background: 'var(--bg-input)',
        border: '1.5px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1.5px solid var(--border)', paddingBottom: '10px' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: '14.5px', fontWeight: 750 }}>
            📋 Executive Study Dashboard & AI Health Scores
          </h4>
          <span style={{ fontSize: '10.5px', color: 'var(--success)', fontWeight: 800, background: 'var(--success-light)', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ● AI Live Assessment
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* Left Column: Key Parameters Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {[
              { label: 'Study Phase', value: dashboard.phase, icon: '⏱️' },
              { label: 'Therapeutic Area', value: dashboard.therapeutic_area, icon: '🩺' },
              { label: 'Study Design', value: dashboard.study_design, icon: '🧬' },
              { label: 'Enrollment Target', value: dashboard.enrollment_target, icon: '👥' },
              { label: 'Number of Sites', value: dashboard.sites_count, icon: '🏢' },
              { label: 'Countries', value: dashboard.countries, icon: '🌍' },
              { label: 'Study Duration', value: dashboard.duration, icon: '📅' },
              { label: 'Regulatory Framework', value: 'ICH E6(R3) / FDA Compliant', icon: '⚖️' }
            ].map((item, idx) => (
              <div key={idx} style={{
                background: 'var(--bg-white)',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minWidth: 0
              }}>
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.value}>
                    {item.value || 'N/A'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right Column: AI Health Scores */}
          <div style={{
            background: 'var(--bg-white)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              Study Readiness & Complexity Scores
            </div>
            
            {[
              { label: 'Protocol Quality Score', val: dashboard.quality_score, color: '#4f46e5' },
              { label: 'Feasibility Score', val: dashboard.feasibility_score, color: '#10b981' },
              { label: 'Recruitment Complexity', val: dashboard.recruitment_score, color: '#f59e0b' },
              { label: 'Overall Study Readiness', val: dashboard.readiness_score, color: '#ec4899' }
            ].map((score, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 650, color: 'var(--text-secondary)' }}>{score.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: score.color }}>{score.val}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${score.val}%`, height: '100%', background: score.color, borderRadius: '3px', transition: 'width 1s ease' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>🧠 AI Analysis Results</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          {hasAnyResults && <span className="status-badge success">✓ Complete</span>}
          
          {currentResult && activeTab !== 'chat' && (
            <div className="export-dropdown" style={{ position: 'relative' }}>
              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsExportOpen(!isExportOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                📥 Export Report ▾
              </button>
              {isExportOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  background: 'var(--bg-white)',
                  border: '1.5px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 999,
                  minWidth: '160px',
                  marginTop: '4px',
                  overflow: 'hidden'
                }}>
                  <button 
                    type="button"
                    onClick={() => { setIsExportOpen(false); window.print(); }}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}
                    className="dropdown-item"
                  >
                    📄 Export to PDF
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsExportOpen(false); handleWordExport(); }}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}
                    className="dropdown-item"
                  >
                    📝 Export to Word
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsExportOpen(false); handleExcelExport(); }}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}
                    className="dropdown-item"
                  >
                    📊 Export to Excel
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary btn-sm"
            onClick={() => onRunAnalysis('full')}
            disabled={isLoading}
          >
            {isLoading && loadingType === 'full' ? (
              <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div> Analyzing...</>
            ) : '🚀 Run Full Analysis'}
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {results[tab.id] && <span style={{ marginLeft: 6 }}>✓</span>}
            {tab.id === 'chat' && chatMessages && chatMessages.length > 0 && (
              <span className="chat-badge" style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px' }}>
                {chatMessages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {renderDashboardPanel()}

      {isLoading && (TABS.find(t => t.id === activeTab)?.type === loadingType || loadingType === 'full') ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <span>AI is analyzing your clinical document...</span>
        </div>
      ) : activeTab === 'chat' ? (
        <ChatInterface
          docId={docId}
          onSendMessage={onSendChatMessage}
          messages={chatMessages}
          isLoading={isChatting}
          embedded={true}
        />
      ) : currentResult ? (
        <div className="analysis-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentResult) }} />
      ) : (
        <div className="analysis-placeholder">
          <span className="placeholder-icon">🔍</span>
          <h4>No results for {TABS.find(t => t.id === activeTab)?.label} yet</h4>
          <p style={{ marginBottom: 16 }}>Run this analysis step to view structured outcomes</p>
          <button
            className="btn btn-secondary"
            onClick={() => onRunAnalysis(TABS.find(t => t.id === activeTab)?.type)}
            disabled={isLoading}
          >
            Run {TABS.find(t => t.id === activeTab)?.label}
          </button>
        </div>
      )}
    </div>
  );
}
