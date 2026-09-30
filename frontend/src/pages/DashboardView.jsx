import React, { useState, useEffect } from 'react';
import { listDocuments, listTrials } from '../services/api';

export default function DashboardView({ user, onLogout, onChangeModule }) {
  const userName = user?.fullname || 'Ashraf Ali';
  const userEmail = user?.email || 'ashrafdamzz12@gmail.com';

  const [protocols, setProtocols] = useState([]);
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch real data on mount
  useEffect(() => {
    async function loadDashboardData() {
      try {
        const docsData = await listDocuments();
        setProtocols(docsData?.documents || []);
      } catch (err) {
        console.error('Failed to load documents for dashboard:', err);
      }

      try {
        const trialsData = await listTrials();
        setTrials(trialsData?.trials || []);
      } catch (err) {
        console.error('Failed to load trials for dashboard:', err);
      }

      setLoading(false);
    }

    loadDashboardData();
  }, []);

  // Compute actual metrics from real user data
  const totalProtocols = protocols.length;
  const totalTrials = trials.length;
  
  // Count analyzed protocols
  const analyzedProtocols = protocols.filter(p => {
    if (!p.analysis_results) return false;
    return Object.keys(p.analysis_results).length > 0;
  }).length;

  const pendingProtocols = totalProtocols - analyzedProtocols;

  // Step-by-step pipeline stats
  const reviewCount = protocols.filter(p => p.analysis_results?.summary || p.analysis_results?.extraction).length;
  const synopsisCount = protocols.filter(p => p.analysis_results?.summary).length;
  const eligibilityCount = protocols.filter(p => p.analysis_results?.eligibility_review).length;
  const gapCount = protocols.filter(p => p.analysis_results?.gap_analysis).length;
  const feasibilityCount = protocols.filter(p => p.analysis_results?.feasibility).length;
  const recommendationCount = protocols.filter(p => p.analysis_results?.design_recommendations).length;

  return (
    <div className="dashboard-view" style={{ fontFamily: 'var(--font)' }}>
      {/* Top Header Row matching the template */}
      <header className="dashboard-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{userName}</span>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            background: 'rgba(59, 130, 246, 0.12)',
            color: '#3b82f6',
            padding: '3px 8px',
            borderRadius: '10px',
            letterSpacing: '0.3px'
          }}>
            Researcher
          </span>
        </div>
        
        {onLogout && (
          <button 
            onClick={onLogout}
            style={{
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-xs)',
              transition: 'var(--transition)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = '#ffffff';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        )}
      </header>

      {/* Main Welcome Banner with Purple/Indigo Gradient */}
      <section className="welcome-banner" style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        borderRadius: '16px',
        padding: '32px',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.3)',
        marginBottom: '28px'
      }}>
        {/* Decorative background shape */}
        <div style={{
          position: 'absolute',
          right: '-50px',
          bottom: '-50px',
          width: '240px',
          height: '240px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          filter: 'blur(30px)'
        }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#a5f3fc' }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                Welcome back, {userName.split(' ')[0]}!
              </h2>
            </div>
            <p style={{ fontSize: '14.5px', opacity: 0.9, margin: 0, fontWeight: 500 }}>
              Here's your clinical research and protocol design performance at a glance.
            </p>
          </div>
          
          <button 
            onClick={() => onChangeModule && onChangeModule('design')}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              padding: '10px 20px',
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#4f46e5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#ffffff';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Live Dashboard
          </button>
        </div>
      </section>

      {/* Grid of 4 stunning stat cards */}
      <section className="stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {/* Card 1: Blue */}
        <div style={{
          background: '#3b82f6',
          borderRadius: '16px',
          padding: '24px',
          color: '#ffffff',
          boxShadow: '0 10px 20px -5px rgba(59, 130, 246, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          flexDirection: 'column',
          minHeight: '145px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Protocols</span>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#ffffff' }}>
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0 4px' }}>
              {loading ? '...' : totalProtocols}
            </h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(255, 255, 255, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                {analyzedProtocols} Analyzed
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(255, 255, 255, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                {pendingProtocols} Pending
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Purple */}
        <div style={{
          background: '#8b5cf6',
          borderRadius: '16px',
          padding: '24px',
          color: '#ffffff',
          boxShadow: '0 10px 20px -5px rgba(139, 92, 246, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          flexDirection: 'column',
          minHeight: '145px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clinical Trials</span>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#ffffff' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0 4px' }}>
              {loading ? '...' : totalTrials}
            </h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.9 }}>
                ✓ Synced clinical registry
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Orange */}
        <div style={{
          background: '#f97316',
          borderRadius: '16px',
          padding: '24px',
          color: '#ffffff',
          boxShadow: '0 10px 20px -5px rgba(249, 115, 22, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          flexDirection: 'column',
          minHeight: '145px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Document Audits</span>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#ffffff' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0 4px' }}>
              {loading ? '...' : analyzedProtocols}
            </h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.9 }}>
                ✓ Gap & Feasibility checks
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Green */}
        <div style={{
          background: '#10b981',
          borderRadius: '16px',
          padding: '24px',
          color: '#ffffff',
          boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          flexDirection: 'column',
          minHeight: '145px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Design Recommendations</span>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#ffffff' }}>
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0 4px' }}>
              {loading ? '...' : recommendationCount}
            </h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.9 }}>
                ✓ AI-suggested protocol enhancements
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Clinical Design Pipeline matching applied/callbacks horizontal style */}
      <section className="pipeline-section" style={{
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <h4 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Clinical Design Pipeline
            </h4>
          </div>
          
          <button 
            onClick={() => onChangeModule && onChangeModule('design')}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            View All 
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Pipeline horizontal cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '12px'
        }}>
          {/* Card 1 */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#3b82f6', marginBottom: '4px' }}>
              {loading ? '...' : totalProtocols}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Protocols</div>
          </div>

          {/* Card 2 */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.05)',
            border: '1px solid rgba(245, 158, 11, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px' }}>
              {loading ? '...' : gapCount}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Gap Assessments</div>
          </div>

          {/* Card 3 */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginBottom: '4px' }}>
              {loading ? '...' : eligibilityCount}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Eligibility Reviews</div>
          </div>

          {/* Card 4 */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginBottom: '4px' }}>
              {loading ? '...' : feasibilityCount}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Feasibility Audits</div>
          </div>

          {/* Card 5 */}
          <div style={{
            background: 'rgba(139, 92, 246, 0.05)',
            border: '1px solid rgba(139, 92, 246, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px' }}>
              {loading ? '...' : synopsisCount}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Synopses Done</div>
          </div>

          {/* Card 6 */}
          <div style={{
            background: 'rgba(6, 182, 212, 0.05)',
            border: '1px solid rgba(6, 182, 212, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('design')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#06b6d4', marginBottom: '4px' }}>
              {loading ? '...' : recommendationCount}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Design Recs</div>
          </div>

          {/* Card 7 */}
          <div style={{
            background: 'rgba(100, 116, 139, 0.05)',
            border: '1px solid rgba(100, 116, 139, 0.1)',
            borderRadius: '10px',
            padding: '16px 12px',
            textAlign: 'center',
            cursor: 'pointer'
          }} onClick={() => onChangeModule('find')}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>
              {loading ? '...' : totalTrials}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Database Trials</div>
          </div>
        </div>
      </section>
    </div>
  );
}
