export default function Sidebar({ currentModule, onChangeModule, user, onLogout }) {
  const modules = [
    {
      id: 'dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9"/>
          <rect x="14" y="3" width="7" height="5"/>
          <rect x="14" y="12" width="7" height="9"/>
          <rect x="3" y="16" width="7" height="5"/>
        </svg>
      ),
      label: 'Dashboard',
      desc: 'Overview & Statistics',
      active: currentModule === 'dashboard'
    },
    {
      id: 'design',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
      ),
      label: 'Protocol Review',
      desc: 'Protocol & Study Design',
      active: currentModule === 'design'
    },
    {
      id: 'find',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
      label: 'Trial Search',
      desc: 'FIND Module',
      active: currentModule === 'find'
    },
    {
      id: 'manage',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
        </svg>
      ),
      label: 'Data Management',
      desc: 'MANAGE Module',
      active: currentModule === 'manage'
    },
    {
      id: 'analyze',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
      label: 'Biostatistics',
      desc: 'ANALYZE Module',
      active: currentModule === 'analyze'
    },
    {
      id: 'safety',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      label: 'Pharmacovigilance',
      desc: 'SAFETY Module',
      active: currentModule === 'safety'
    },
    {
      id: 'recruit',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      label: 'Recruitment',
      desc: 'RECRUIT Module',
      disabled: true
    },
    {
      id: 'predict',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
      label: 'Risk Prediction',
      desc: 'PREDICT Module',
      disabled: true
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">iC</div>
        <div>
          <h1>iClinicalAi</h1>
          <span>Clinical Research Platform</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Modules</div>
        {modules.map(m => (
          <div 
            key={m.id} 
            className={`nav-item ${m.active ? 'active' : ''} ${m.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!m.disabled && onChangeModule) {
                onChangeModule(m.id);
              }
            }}
            style={{ cursor: m.disabled ? 'not-allowed' : 'pointer' }}
          >
            <span className="nav-icon">{m.icon}</span>
            <div style={{ flex: 1 }}>
              <div className="nav-label">{m.label}</div>
              <div className="nav-desc">{m.desc}</div>
            </div>
            {m.disabled && <span className="nav-badge">Soon</span>}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{
        borderTop: '1px solid var(--border)',
        padding: '20px 16px',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            background: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
              flexShrink: 0
            }}>
              {user.fullname ? user.fullname.split(' ').map(n => n[0]).join('').toUpperCase() : user.email[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.fullname || 'User'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
          </div>
        )}
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {onLogout && (
            <button 
              onClick={onLogout}
              className="exit-btn"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 650,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                width: '100%',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ef4444';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Exit Portal
            </button>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 4px'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-secondary)' }}>IDDCR Global Research</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>v1.0.0 MVP</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
