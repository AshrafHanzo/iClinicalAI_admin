import { useState, useEffect } from 'react';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Sidebar state
  const [activeMenu, setActiveMenu] = useState('Dashboard');

  // Stats & Directory lists
  const [stats, setStats] = useState({
    total_users: 0,
    active_users: 0,
    pending_approvals: 0,
    total_api_usage_tokens: 0,
    total_cost_usd: 0.0,
    consumption_overview: [],
    usage_by_module: [],
    recent_activity: [],
    top_consumers: [],
    user_module_breakdown: [],
    recently_active_users: 0,
    online_now_count: 0
  });
  const [users, setUsers] = useState([]);
  const [execStats, setExecStats] = useState({
    new_registrations: { today: 0, week: 0, month: 0 },
    dau: 0,
    wau: 0,
    mau: 0,
    returning_users: { today: 0, week: 0, month: 0 },
    new_users: { today: 0, week: 0, month: 0 },
    avg_session_time: { today: '0 min', week: '0 min', month: '0 min' },
    ai_requests: { today: 0, week: 0, month: 0 }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('Current');

  // Paging and Filtering states
  const [visibleCount, setVisibleCount] = useState(10);
  const [visibleApiCount, setVisibleApiCount] = useState(10);
  const [statusFilter, setStatusFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [apiTierFilter, setApiTierFilter] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [chartPeriod, setChartPeriod] = useState(30);
  const [hoveredBar, setHoveredBar] = useState(null);
  const [apiChartPeriod, setApiChartPeriod] = useState(30);
  const [hoveredApiBar, setHoveredApiBar] = useState(null);
  const [userModulesState, setUserModulesState] = useState({});
  const [visibleSessionsCount, setVisibleSessionsCount] = useState(10);
  const [sessionStatusFilter, setSessionStatusFilter] = useState('All');
  const [selectedSessionUser, setSelectedSessionUser] = useState(null);

  // Reset pagination when active tab/menu changes
  useEffect(() => {
    setVisibleCount(10);
    setVisibleApiCount(10);
    setVisibleSessionsCount(10);
  }, [activeMenu]);

  const getApiRoot = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    }
    return '/api';
  };

  const getHeaders = () => {
    const token = localStorage.getItem('iclinical_admin_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  useEffect(() => {
    const token = localStorage.getItem('iclinical_admin_token');
    if (token) {
      setIsLoggedIn(true);
      fetchDashboardData();
    }
  }, []);

  // Background auto-refresh stats and users every 3 seconds for real-time tracking
  useEffect(() => {
    if (!isLoggedIn) return;

    const interval = setInterval(() => {
      const token = localStorage.getItem('iclinical_admin_token');
      if (!token) return;

      const execUrl = selectedMonth === 'Current'
        ? `${getApiRoot()}/admin/executive-stats`
        : `${getApiRoot()}/admin/executive-stats?month=${selectedMonth}`;

      Promise.all([
        fetch(`${getApiRoot()}/admin/stats`, { headers: getHeaders() }),
        fetch(`${getApiRoot()}/admin/users`, { headers: getHeaders() }),
        fetch(execUrl, { headers: getHeaders() })
      ]).then(async ([statsRes, usersRes, execRes]) => {
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        }
        if (execRes.ok) {
          const execData = await execRes.json();
          setExecStats(execData);
        }
      }).catch(err => console.error('Silent auto-refresh failed:', err));
    }, 3000);

    return () => clearInterval(interval);
  }, [isLoggedIn, selectedMonth]);

  // Fetch immediately when selected month changes
  useEffect(() => {
    if (isLoggedIn) {
      fetchDashboardData();
    }
  }, [selectedMonth]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch(`${getApiRoot()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Authentication failed.');
      }

      const data = await res.json();
      
      if (data.user.role !== 'admin') {
        throw new Error('Access denied. Administrator privileges required.');
      }

      localStorage.setItem('iclinical_admin_token', data.access_token);
      setIsLoggedIn(true);
      showToast('Welcome back, Administrator!');
      
      setTimeout(() => {
        fetchDashboardData();
      }, 200);

    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('iclinical_admin_token');
    setIsLoggedIn(false);
  };

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  const fetchDashboardData = async () => {
    setDataLoading(true);
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('iclinical_admin_token');
      if (!token) return;

      const execUrl = selectedMonth === 'Current'
        ? `${getApiRoot()}/admin/executive-stats`
        : `${getApiRoot()}/admin/executive-stats?month=${selectedMonth}`;

      const [statsRes, usersRes, execRes] = await Promise.all([
        fetch(`${getApiRoot()}/admin/stats`, { headers: getHeaders() }),
        fetch(`${getApiRoot()}/admin/users`, { headers: getHeaders() }),
        fetch(execUrl, { headers: getHeaders() })
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        handleLogout();
        return;
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      if (execRes.ok) {
        const execData = await execRes.json();
        setExecStats(execData);
      }
      showToast('System data synchronized successfully.');
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setDataLoading(false);
      setIsSyncing(false);
    }
  };

  const handleApprove = async (userId) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`${getApiRoot()}/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to approve user');
      showToast('User access request approved.');
      fetchDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`${getApiRoot()}/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to suspend user');
      showToast('User access revoked / suspended.');
      fetchDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete the user account: ${userEmail}?`)) {
      return;
    }
    setActionLoading(userId);
    try {
      const res = await fetch(`${getApiRoot()}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to delete user');
      showToast('User deleted permanently from database.');
      fetchDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Initialize module state for each user when users list loads
  useEffect(() => {
    if (users.length > 0) {
      const initialModules = {};
      users.forEach(u => {
        if (!userModulesState[u.id]) {
          if (u.email === 'imakabeer@gmail.com') {
            initialModules[u.id] = [true, true, true, true, true];
          } else if (u.email === 'ashrafdamzz12@gmail.com') {
            initialModules[u.id] = [true, true, true, true, true];
          } else {
            initialModules[u.id] = [true, true, false, false, false];
          }
        }
      });
      if (Object.keys(initialModules).length > 0) {
        setUserModulesState(prev => ({ ...prev, ...initialModules }));
      }
    }
  }, [users]);

  const handleToggleModule = (userId, userFullName, moduleName, idx) => {
    setUserModulesState(prev => {
      const current = prev[userId] ? [...prev[userId]] : [false, false, false, false, false];
      const newVal = !current[idx];
      current[idx] = newVal;
      
      showToast(`${newVal ? 'Granted' : 'Revoked'} ${moduleName} module access for ${userFullName}.`);
      return {
        ...prev,
        [userId]: current
      };
    });
  };

  const formatTokens = (val) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return (val || 0).toLocaleString();
  };

  // Process real database users (admin accounts are excluded by backend)
  const mergedUsers = users.filter(u => u.role !== 'admin').map(u => ({
    id: u.id,
    email: u.email,
    fullname: u.fullname || u.email.split('@')[0],
    created_at: u.created_at,
    is_approved: u.is_approved,
    role: u.role === 'admin' ? 'Super Admin' : 'Researcher',
    api_tokens_used: u.api_tokens_used || 0,
    modules: userModulesState[u.id] || [u.api_tokens_used > 0, u.api_tokens_used > 5000, false, false, false],
    isReal: true,
    last_login: u.last_login,
    is_online: u.is_online,
    last_heartbeat: u.last_heartbeat,
    ai_requests_today: u.ai_requests_today || 0,
    protocols_processed: u.protocols_processed || 0,
    protocols_processed_today: u.protocols_processed_today || 0,
    api_cost_today: u.api_cost_today || 0,
    last_activity: u.last_activity || 'None',
    recent_logs: u.recent_logs || []
  }));

  const filteredUsers = mergedUsers.filter(u => {
    const matchesSearch = u.fullname.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || 
                          (statusFilter === 'Active' && u.is_approved === 1) ||
                          (statusFilter === 'Pending' && u.is_approved === 0) ||
                          (statusFilter === 'Inactive' && u.is_approved === 2);
    
    const matchesRole = roleFilter === 'All' || 
                        (roleFilter === 'Super Admin' && u.role === 'Super Admin') ||
                        (roleFilter === 'Researcher' && u.role === 'Researcher');

    if (activeMenu === 'Pending Approvals') {
      return matchesSearch && u.is_approved === 0;
    }
    return matchesSearch && matchesStatus && matchesRole;
  });

  const pendingApprovalsCount = mergedUsers.filter(u => u.is_approved === 0).length;

  // Compute session status from real DB heartbeat fields (no hardcoded data)
  const getSessionDetails = (user) => {
    let status = 'Offline';
    let statusColor = '#64748b';
    let durationText = 'Logged off';
    
    if (user.is_online === 1 && user.last_heartbeat) {
      const hbTime = new Date(user.last_heartbeat);
      const diffMs = new Date() - hbTime;
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      
      if (diffMins <= 2) {
        status = 'Online';
        statusColor = '#10b981';
        durationText = 'Active now';
      } else if (diffMins <= 10) {
        status = 'Idle';
        statusColor = '#f59e0b';
        durationText = `${diffMins}m idle`;
      } else {
        status = 'Offline';
        statusColor = '#64748b';
        durationText = 'Session expired';
      }
    } else if (user.last_login) {
      const loginTime = new Date(user.last_login);
      const diffMs = new Date() - loginTime;
      const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
      
      if (diffMins < 60) {
        durationText = `Logged off: ${diffMins}m ago`;
      } else if (diffMins < 1440) {
        const hrs = Math.floor(diffMins / 60);
        durationText = `Logged off: ${hrs}h ago`;
      } else {
        const days = Math.floor(diffMins / 1440);
        durationText = `Logged off: ${days}d ago`;
      }
    } else {
      durationText = 'Never logged in';
    }
    
    return { status, statusColor, durationText };
  };

  const sessionStats = (() => {
    let online = 0;
    let idle = 0;
    let offline = 0;
    
    mergedUsers.forEach(u => {
      const details = getSessionDetails(u);
      if (details.status === 'Online') online++;
      else if (details.status === 'Idle') idle++;
      else offline++;
    });
    
    return {
      online,
      idle,
      offline,
      total: mergedUsers.length
    };
  })();

  const filteredApiBreakdown = (stats.user_module_breakdown || []).filter(row => {
    const matchesSearch = row.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          row.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const tokens = row.total_tokens;
    const matchesTier = apiTierFilter === 'All' ||
                        (apiTierFilter === 'High (>100K)' && tokens > 100000) ||
                        (apiTierFilter === 'Medium (10K-100K)' && tokens >= 10000 && tokens <= 100000) ||
                        (apiTierFilter === 'Low (<10K)' && tokens < 10000);
    return matchesSearch && matchesTier;
  });

  if (!isLoggedIn) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #131a2e 0%, #060912 100%)',
        padding: '24px',
        position: 'relative',
        fontFamily: 'var(--font-sans)'
      }}>
        <div className="glass-pattern" />
        
        <form onSubmit={handleLogin} style={{
          background: '#0d1324',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '48px 40px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--shadow-premium)',
          animation: 'fadeIn 0.5s ease-out'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              fontSize: 24,
              fontWeight: 800,
              color: 'white',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)',
              marginBottom: 16
            }}>
              iC
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white', letterSpacing: '-0.5px', margin: '4px 0 8px' }}>
              Operations Portal
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Provide admin credentials to access system controls
            </p>
          </div>

          {errorMsg && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'var(--color-danger-bg)',
              border: '1px solid var(--color-danger-border)',
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: 1.5,
              marginBottom: 24
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Email Address
              </label>
              <input 
                type="email"
                placeholder="admin@iclinical.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'var(--transition-fast)'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Password
              </label>
              <input 
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'var(--transition-fast)'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <button 
              type="submit"
              disabled={loginLoading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: '14.5px',
                cursor: loginLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.2)',
                transition: 'var(--transition-fast)',
                marginTop: 8
              }}
              onMouseEnter={(e) => { if (!loginLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loginLoading ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#070a13',
      color: '#f8fafc',
      fontFamily: 'var(--font-sans)',
      overflowX: 'hidden'
    }}>
      {/* Toast Alert */}
      {successToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 24px',
          borderRadius: '12px',
          background: '#065f46',
          border: '1px solid #059669',
          color: '#ecfdf5',
          fontSize: '13.5px',
          fontWeight: 600,
          boxShadow: 'var(--shadow-premium)',
          zIndex: 9999,
          animation: 'fadeIn 0.25s ease-out'
        }}>
          ✅ {successToast}
        </div>
      )}

      {/* 1. LEFT SIDEBAR */}
      <aside style={{
        width: isSidebarCollapsed ? '0px' : '260px',
        opacity: isSidebarCollapsed ? 0 : 1,
        visibility: isSidebarCollapsed ? 'hidden' : 'visible',
        overflow: 'hidden',
        background: '#0a0d16',
        borderRight: isSidebarCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="url(#logoGrad)" />
            <path d="M12 6L6 9v6l6 3 6-3V9l-6-3z" fill="#0d111c" opacity="0.3" />
            <circle cx="12" cy="12" r="3.5" fill="white" />
          </svg>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15.5px', letterSpacing: '-0.3px', color: 'white', lineHeight: 1.2 }}>iClinicalAI</div>
            <div style={{ fontSize: '8px', color: '#64748b', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700 }}>Clinical Research Platform</div>
          </div>
        </div>

        {/* Sidebar Nav Links */}
        <div style={{
          flex: 1,
          padding: '24px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          overflowY: 'auto'
        }}>
          {[
            {
              group: 'OVERVIEW',
              items: [
                {
                  name: 'Dashboard',
                  action: 'Dashboard',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>)
                },
                {
                  name: 'Executive Dashboard',
                  action: 'Executive Dashboard',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>)
                }
              ]
            },
            {
              group: 'USER MANAGEMENT',
              items: [
                {
                  name: 'Users',
                  action: 'Users',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>)
                },
                {
                  name: 'User Approvals',
                  action: 'Pending Approvals',
                  badge: pendingApprovalsCount,
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>)
                },
                {
                  name: 'Active Sessions',
                  action: 'Active Sessions',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>)
                }
              ]
            },
            {
              group: 'USAGE & BILLING',
              items: [
                {
                  name: 'API Usage',
                  action: 'API Usage',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>)
                }
              ]
            }
          ].map(section => (
            <div key={section.group}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '12px', marginBottom: '8px' }}>
                {section.group}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {section.items.map(item => {
                  const isActive = activeMenu === item.action;
                  return (
                    <div 
                      key={item.name}
                      onClick={() => setActiveMenu(item.action)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                        background: isActive ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)' : 'transparent',
                        border: isActive ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
                        color: isActive ? '#8b5cf6' : '#94a3b8',
                        fontSize: '13.5px', fontWeight: isActive ? 600 : 500, transition: '0.2s'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: isActive ? '#8b5cf6' : 'currentColor' }}>{item.icon}</span> 
                        {item.name}
                      </span>
                      {item.badge > 0 && (
                        <span style={{ background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px', minWidth: '18px', textAlign: 'center' }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* 2. MAIN CONTENT WRAPPER */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        {/* Main top header */}
        <header style={{
          height: '70px',
          background: '#0c111d',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span 
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              style={{ 
                fontSize: '18px', 
                cursor: 'pointer', 
                color: '#94a3b8',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s',
                userSelect: 'none'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              ☰
            </span>
            <span style={{ fontWeight: 700, fontSize: '16px', color: 'white' }}>Admin Dashboard</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '20px',
                  padding: '8px 45px 8px 36px',
                  color: 'white',
                  fontSize: '12.5px',
                  width: '200px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
              />
              <span style={{ position: 'absolute', left: '12px', color: '#475569', fontSize: '13px' }}>🔍</span>
              <span style={{
                position: 'absolute',
                right: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#64748b',
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                pointerEvents: 'none'
              }}>⌘K</span>
            </div>

            {/* Action icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#94a3b8' }}>
              <button 
                onClick={fetchDashboardData} 
                title="Synchronize system metrics" 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: isSyncing ? '#3b82f6' : '#94a3b8', 
                  cursor: 'pointer', 
                  fontSize: '15px', 
                  padding: '6px', 
                  borderRadius: '8px', 
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <svg 
                  className={isSyncing ? "spin-animation" : ""}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
              <button onClick={() => setActiveMenu('Pending Approvals')} title="Pending approvals" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '15px', padding: '6px', borderRadius: '8px', position: 'relative', transition: '0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                {pendingApprovalsCount > 0 && (
                  <span style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 700, width: '15px', height: '15px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingApprovalsCount}</span>
                )}
              </button>
            </div>

            {/* Profile Dropdown */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              paddingLeft: '20px'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '14px',
                color: 'white'
              }}>
                A
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>Admin</span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>Super Administrator</span>
              </div>
              <button 
                onClick={handleLogout}
                style={{
                  marginLeft: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                title="Sign Out"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Main Scrollable Body */}
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
          
          {/* Dashboard View */}
          {activeMenu === 'Dashboard' && (
            <>
              {/* Welcome Banner */}
              <div style={{ background: 'linear-gradient(135deg, #181d30 0%, #0d1222 100%)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, color: '#10b981', marginBottom: '16px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> All Systems Operational
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: '0 0 8px 0' }}>Welcome back, Admin</h2>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Monitor your users, manage approvals, and track OpenAI API consumption across all modules.</p>
                <div style={{ display: 'flex', gap: '32px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <div><div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 800 }}>Online Now</div><div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>{stats.online_now_count}</div></div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <div><div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 800 }}>Active This Week</div><div style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginTop: '4px' }}>{stats.recently_active_users}</div></div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <div><div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', fontWeight: 800 }}>Pending Approvals</div><div style={{ fontSize: '18px', fontWeight: 700, color: stats.pending_approvals > 0 ? '#f59e0b' : 'white', marginTop: '4px' }}>{stats.pending_approvals}</div></div>
                </div>
              </div>

              {/* Row 2: 5 Large Metrics Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '20px'
              }}>
                {[
                  { 
                    title: 'Total Users', 
                    value: stats.total_users.toLocaleString(), 
                    trend: '+12.5% from last month', 
                    type: 'up', 
                    color: '#3b82f6',
                    bgColor: 'rgba(59, 130, 246, 0.1)',
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    )
                  },
                  { 
                    title: 'Active Users', 
                    value: stats.active_users.toLocaleString(), 
                    trend: '+8.2% from last month', 
                    type: 'up', 
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.1)',
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <polyline points="16 11 18 13 22 9" />
                      </svg>
                    )
                  },
                  { 
                    title: 'Pending Approvals', 
                    value: stats.pending_approvals.toString(), 
                    trend: 'Needs attention', 
                    type: 'warning', 
                    color: '#f59e0b',
                    bgColor: 'rgba(245, 158, 11, 0.1)',
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    )
                  },
                  { 
                    title: 'OpenAI Tokens (30d)', 
                    value: formatTokens(stats.total_api_usage_tokens), 
                    trend: '+15.3% from last month', 
                    type: 'up', 
                    color: '#8b5cf6',
                    bgColor: 'rgba(139, 92, 246, 0.1)',
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                        <line x1="6" y1="6" x2="6.01" y2="6" />
                        <line x1="6" y1="18" x2="6.01" y2="18" />
                      </svg>
                    )
                  },
                  { 
                    title: 'Total Cost', 
                    value: `$${stats.total_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                    trend: '+18.7% this month', 
                    type: 'up', 
                    color: '#10b981',
                    bgColor: 'rgba(16, 185, 129, 0.1)',
                    icon: (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    )
                  }
                ].map(card => (
                  <div 
                    key={card.title}
                    style={{
                      background: '#111625',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '16px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginTop: '12px' }}>
                        {card.value}
                      </div>
                    </div>
                    
                    <div style={{
                      marginTop: '16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: card.type === 'up' ? '#10b981' : card.type === 'warning' ? '#fbbf24' : '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      {card.type === 'up' && '▲'} {card.trend}
                    </div>

                    <div style={{
                      position: 'absolute',
                      right: '20px',
                      top: '20px',
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: card.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: card.color
                    }}>
                      {card.icon}
                    </div>
                  </div>
                ))}
              </div>
              {/* Second Row: Charts */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '24px',
                alignItems: 'stretch'
              }}>
                {/* 1. Bar Chart */}
                <div 
                  className="chart-container-box"
                  style={{
                    background: '#111625',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '18px',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>OpenAI API Consumption Overview</h3>
                    <select 
                      value={chartPeriod}
                      onChange={(e) => setChartPeriod(Number(e.target.value))}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '8px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option style={{ background: '#111625', color: 'white' }} value={7}>Last 7 Days</option>
                      <option style={{ background: '#111625', color: 'white' }} value={14}>Last 14 Days</option>
                      <option style={{ background: '#111625', color: 'white' }} value={30}>Last 30 Days</option>
                    </select>
                  </div>
                  
                  {/* Custom SVG Bar Chart */}
                  <div style={{ flex: 1, position: 'relative', minHeight: '180px' }}>
                    <svg viewBox="0 0 500 160" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      {/* Grid lines */}
                      <line x1="0" y1="135" x2="500" y2="135" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="95" x2="500" y2="95" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="55" x2="500" y2="55" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="15" x2="500" y2="15" stroke="rgba(255, 255, 255, 0.05)" />
                      
                      {(() => {
                        const points = (stats.consumption_overview || []).slice(-chartPeriod);
                        const maxVal = Math.max(...points.map(d => d.tokens), 1000);
                        return points.map((d, i) => {
                          const tokens = d.tokens;
                          const height = maxVal > 0 ? (tokens / maxVal) * 120 : 0;
                          const y = 135 - height;
                          const barSpacing = 500 / points.length;
                          const barWidth = barSpacing * 0.65;
                          const x = i * barSpacing + (barSpacing - barWidth) / 2;
                          
                          return (
                            <rect
                              key={i}
                              x={x}
                              y={y}
                              width={barWidth}
                              height={Math.max(1, height)}
                              fill={hoveredBar?.index === i ? "#a78bfa" : "#8b5cf6"}
                              rx={Math.max(1, barWidth / 6)}
                              ry={Math.max(1, barWidth / 6)}
                              style={{ transition: 'all 0.15s ease', cursor: 'pointer' }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const container = e.currentTarget.closest('.chart-container-box');
                                const containerRect = container.getBoundingClientRect();
                                
                                setHoveredBar({
                                  index: i,
                                  date: d.date,
                                  tokens: d.tokens,
                                  cost: d.tokens * 0.0000001786,
                                  x: rect.left - containerRect.left + rect.width / 2,
                                  y: rect.top - containerRect.top - 78
                                });
                              }}
                              onMouseLeave={() => setHoveredBar(null)}
                            />
                          );
                        });
                      })()}
                    </svg>
                    
                    {/* Y-axis helper values */}
                    {(() => {
                      const points = (stats.consumption_overview || []).slice(-chartPeriod);
                      const maxVal = Math.max(...points.map(d => d.tokens), 1000);
                      return (
                        <>
                          <div style={{ position: 'absolute', top: '15px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal)}</div>
                          <div style={{ position: 'absolute', top: '55px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal * 2 / 3)}</div>
                          <div style={{ position: 'absolute', top: '95px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal / 3)}</div>
                          <div style={{ position: 'absolute', top: '135px', left: 0, fontSize: '10px', color: '#475569' }}>0</div>
                        </>
                      );
                    })()}
 
                    {/* X-axis helper labels */}
                    {(() => {
                      const points = (stats.consumption_overview || []).slice(-chartPeriod);
                      const getXAxisLabels = () => {
                        if (points.length === 0) return [];
                        if (points.length <= 7) {
                          return points.map((d, idx) => ({
                            label: d.date,
                            x: ((idx + 0.5) / points.length) * 100 + '%'
                          }));
                        }
                        const step = Math.floor(points.length / 4);
                        const indices = [0, step, step * 2, step * 3, points.length - 1];
                        return indices.map(idx => {
                          const item = points[idx];
                          return {
                            label: item ? item.date : '',
                            x: ((idx + 0.5) / points.length) * 100 + '%'
                          };
                        });
                      };
                      
                      return (
                        <div style={{ display: 'flex', position: 'relative', marginTop: '12px', height: '14px', fontSize: '10px', color: '#475569' }}>
                          {getXAxisLabels().map((item, idx) => (
                            <span 
                              key={idx} 
                              style={{ 
                                position: 'absolute', 
                                left: item.x, 
                                transform: 'translateX(-50%)',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
 
                  {/* Floating Hover Tooltip */}
                  {hoveredBar && (
                    <div style={{
                      position: 'absolute',
                      left: `${hoveredBar.x}px`,
                      top: `${hoveredBar.y}px`,
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      pointerEvents: 'none',
                      zIndex: 1000,
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(6px)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      transition: 'all 0.1s ease',
                      width: 'max-content'
                    }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{hoveredBar.date}</div>
                      <div style={{ fontSize: '13px', color: '#c084fc', fontWeight: 800 }}>
                        Spend: ${hoveredBar.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                        Tokens: {hoveredBar.tokens.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Donut Chart */}         {/* 2. Donut Chart */}
                <div style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '18px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>API Usage by Module</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, flex: 1, justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        {(() => {
                          const hasData = (stats.usage_by_module || []).some(m => m.tokens > 0);
                          if (!hasData) {
                            return <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="12" />;
                          }
                          
                          let cumulativePercent = 0;
                          const colors = {
                            DESIGN: '#3b82f6',
                            FIND: '#06b6d4',
                            MANAGE: '#10b981',
                            ANALYSE: '#8b5cf6',
                            SAFETY: '#ec4899'
                          };
                          
                          return (stats.usage_by_module || []).map((m, idx) => {
                            if (m.percentage <= 0) return null;
                            const strokeDasharray = `${251}`;
                            const strokeDashoffset = `${251 - (251 * m.percentage) / 100}`;
                            const rotation = (cumulativePercent * 360) / 100 - 90; // Start at top
                            cumulativePercent += m.percentage;
                            
                            return (
                              <circle 
                                key={m.module}
                                cx="50" 
                                cy="50" 
                                r="40" 
                                fill="transparent" 
                                stroke={colors[m.module] || '#64748b'} 
                                strokeWidth="12" 
                                strokeDasharray={strokeDasharray} 
                                strokeDashoffset={strokeDashoffset} 
                                transform={`rotate(${rotation} 50 50)`} 
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'white' }}>{formatTokens(stats.total_api_usage_tokens)}</div>
                        <div style={{ fontSize: '8px', color: '#64748b' }}>Tokens</div>
                      </div>
                    </div>

                    {/* Legends */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11.5px' }}>
                      {(() => {
                        const colors = {
                          DESIGN: '#3b82f6',
                          FIND: '#06b6d4',
                          MANAGE: '#10b981',
                          ANALYSE: '#8b5cf6',
                          SAFETY: '#ec4899'
                        };
                        return (stats.usage_by_module || []).map(item => (
                          <div key={item.module} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[item.module] || '#64748b' }} />
                              {item.module}
                            </span>
                            <span style={{ color: 'white', fontWeight: 600 }}>
                              {formatTokens(item.tokens)} <span style={{ color: '#475569', fontWeight: 400 }}>({item.percentage}%)</span>
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Executive Dashboard View */}
          {activeMenu === 'Executive Dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Welcome Banner / Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: '0 0 8px 0' }}>Executive Dashboard</h2>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>High-level product health and growth performance.</p>
                </div>
                
                {/* Period Selector Tools */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10 }}>
                  {/* Live Stats Button Toggle */}
                  <button
                    onClick={() => {
                      setSelectedMonth('Current');
                      setExecStats({
                        new_registrations: { today: 0, week: 0, month: 0 },
                        dau: 0,
                        wau: 0,
                        mau: 0,
                        returning_users: { today: 0, week: 0, month: 0 },
                        new_users: { today: 0, week: 0, month: 0 },
                        avg_session_time: { today: '0 min', week: '0 min', month: '0 min' },
                        ai_requests: { today: 0, week: 0, month: 0 }
                      });
                    }}
                    style={{
                      background: selectedMonth === 'Current' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: selectedMonth === 'Current' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      color: selectedMonth === 'Current' ? '#60a5fa' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: selectedMonth === 'Current' ? '#3b82f6' : '#64748b', display: 'inline-block' }} />
                    Live Stats
                  </button>

                  {/* Native Month Calendar Date Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: selectedMonth !== 'Current' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)', border: selectedMonth !== 'Current' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '6px 12px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>Choose Month:</span>
                    <input
                      type="month"
                      value={selectedMonth === 'Current' ? '' : selectedMonth}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setSelectedMonth(val);
                          setExecStats({
                            new_registrations: 0,
                            active_users: 0,
                            returning_users: 0,
                            new_users: 0,
                            avg_session_time: '0 min',
                            ai_requests: 0
                          });
                        } else {
                          setSelectedMonth('Current');
                          setExecStats({
                            new_registrations: { today: 0, week: 0, month: 0 },
                            dau: 0,
                            wau: 0,
                            mau: 0,
                            returning_users: { today: 0, week: 0, month: 0 },
                            new_users: { today: 0, week: 0, month: 0 },
                            avg_session_time: { today: '0 min', week: '0 min', month: '0 min' },
                            ai_requests: { today: 0, week: 0, month: 0 }
                          });
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: 600,
                        outline: 'none',
                        cursor: 'pointer',
                        colorScheme: 'dark'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI Cards / Table Grid */}
              <div style={{ background: '#111625', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#e2e8f0' }}>
                  {selectedMonth === 'Current' ? (
                    <>
                      <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Metric</th>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Today</th>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>This Week</th>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>This Month</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: 'New Registrations', today: execStats.new_registrations?.today || 0, week: execStats.new_registrations?.week || 0, month: execStats.new_registrations?.month || 0, color: '#38bdf8' },
                          { name: 'Daily Active Users (DAU)', today: execStats.dau || 0, week: '-', month: '-', color: '#fb7185' },
                          { name: 'Weekly Active Users (WAU)', today: '-', week: execStats.wau || 0, month: '-', color: '#60a5fa' },
                          { name: 'Monthly Active Users (MAU)', today: '-', week: '-', month: execStats.mau || 0, color: '#34d399' },
                          { name: 'Returning Users', today: execStats.returning_users?.today || 0, week: execStats.returning_users?.week || 0, month: execStats.returning_users?.month || 0, color: '#c084fc' },
                          { name: 'New Users', today: execStats.new_users?.today || 0, week: execStats.new_users?.week || 0, month: execStats.new_users?.month || 0, color: '#fb923c' },
                          { name: 'Avg Session Time', today: execStats.avg_session_time?.today || '0 min', week: execStats.avg_session_time?.week || '0 min', month: execStats.avg_session_time?.month || '0 min', color: '#2dd4bf' },
                          { name: 'AI Requests', today: (execStats.ai_requests?.today || 0).toLocaleString(), week: (execStats.ai_requests?.week || 0).toLocaleString(), month: (execStats.ai_requests?.month || 0).toLocaleString(), color: '#a78bfa' }
                        ].map((row, idx) => (
                          <tr key={row.name} style={{ borderBottom: idx === 7 ? 'none' : '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '18px 24px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color }} />
                              {row.name}
                            </td>
                            <td style={{ padding: '18px 24px', fontSize: '13.5px', fontWeight: 600, color: row.today === '-' ? '#475569' : 'white', textAlign: 'center' }}>
                              {row.today}
                            </td>
                            <td style={{ padding: '18px 24px', fontSize: '13.5px', fontWeight: 600, color: row.week === '-' ? '#475569' : 'white', textAlign: 'center' }}>
                              {row.week}
                            </td>
                            <td style={{ padding: '18px 24px', fontSize: '13.5px', fontWeight: 600, color: row.month === '-' ? '#475569' : 'white', textAlign: 'center' }}>
                              {row.month}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Metric</th>
                          <th style={{ padding: '16px 24px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Monthly Total / Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: 'New Registrations', value: typeof execStats.new_registrations === 'object' ? 0 : (execStats.new_registrations || 0), color: '#38bdf8' },
                          { name: 'Active Users', value: typeof execStats.active_users === 'object' ? 0 : (execStats.active_users || 0), color: '#fb7185' },
                          { name: 'Returning Users', value: typeof execStats.returning_users === 'object' ? 0 : (execStats.returning_users || 0), color: '#c084fc' },
                          { name: 'New Users', value: typeof execStats.new_users === 'object' ? 0 : (execStats.new_users || 0), color: '#fb923c' },
                          { name: 'Avg Session Time', value: typeof execStats.avg_session_time === 'object' ? '0 min' : (execStats.avg_session_time || '0 min'), color: '#2dd4bf' },
                          { name: 'AI Requests', value: (typeof execStats.ai_requests === 'object' ? 0 : (execStats.ai_requests || 0)).toLocaleString(), color: '#a78bfa' }
                        ].map((row, idx) => (
                          <tr key={row.name} style={{ borderBottom: idx === 5 ? 'none' : '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '18px 24px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color }} />
                              {row.name}
                            </td>
                            <td style={{ padding: '18px 24px', fontSize: '13.5px', fontWeight: 600, color: 'white', textAlign: 'center' }}>
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Mini Dashboard for sub-pages */}
          {activeMenu === 'Users' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '8px'
            }}>
              {[
                { title: 'Total Registered', value: stats.total_users, color: '#3b82f6', icon: '👥' },
                { title: 'Active Researchers', value: stats.active_users, color: '#10b981', icon: '🔬' },
                { title: 'Approvals Pending', value: stats.pending_approvals, color: '#f59e0b', icon: '⏳' },
                { title: 'Active Live Sessions', value: stats.online_now_count, color: '#06b6d4', icon: '🟢' }
              ].map(card => (
                <div key={card.title} style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '16px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{card.title}</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginTop: '4px' }}>{card.value}</div>
                  </div>
                  <div style={{ fontSize: '24px', background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '10px' }}>{card.icon}</div>
                </div>
              ))}
            </div>
          )}

          {activeMenu === 'Pending Approvals' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '8px'
            }}>
              {[
                { title: 'Awaiting Verification', value: stats.pending_approvals, color: '#f59e0b', icon: '⚖️' },
                { title: 'Total Verified Users', value: stats.active_users, color: '#10b981', icon: '✅' },
                { title: 'Total Registered Profiles', value: stats.total_users, color: '#3b82f6', icon: '📁' }
              ].map(card => (
                <div key={card.title} style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '16px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{card.title}</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginTop: '4px' }}>{card.value}</div>
                  </div>
                  <div style={{ fontSize: '24px', background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '10px' }}>{card.icon}</div>
                </div>
              ))}
            </div>
          )}

          {/* User management directories */}
          {(activeMenu === 'Dashboard' || activeMenu === 'Users' || activeMenu === 'Pending Approvals') && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: activeMenu === 'Dashboard' ? '2.3fr 1fr' : '1fr',
              gap: '24px',
              minWidth: 0
            }}>
              {/* Left Column: Users Directory Table */}
              <div style={{
                background: '#111625',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '18px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
                      {activeMenu === 'Dashboard' ? 'Recent Users' : activeMenu === 'Users' ? 'Users Directory' : 'Pending Access Requests'}
                    </h3>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {activeMenu === 'Dashboard' 
                        ? 'Quick overview of registered user sessions and access states' 
                        : activeMenu === 'Users' 
                        ? 'Manage platform users, roles, and access approval statuses'
                        : 'Review and approve/reject pending registration requests'}
                    </p>
                  </div>
                  
                  {/* Filters and Refresh */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {activeMenu !== 'Pending Approvals' && (
                      <>
                        {/* Status Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Status:</span>
                          <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                              background: '#0c111d',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '6px',
                              color: 'white',
                              fontSize: '12px',
                              padding: '4px 8px',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option style={{ background: '#111625', color: 'white' }} value="All">All Statuses</option>
                            <option style={{ background: '#111625', color: 'white' }} value="Active">Active</option>
                            <option style={{ background: '#111625', color: 'white' }} value="Pending">Pending</option>
                            <option style={{ background: '#111625', color: 'white' }} value="Inactive">Inactive</option>
                          </select>
                        </div>

                        {/* Role Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Role:</span>
                          <select 
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            style={{
                              background: '#0c111d',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '6px',
                              color: 'white',
                              fontSize: '12px',
                              padding: '4px 8px',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option style={{ background: '#111625', color: 'white' }} value="All">All Roles</option>
                            <option style={{ background: '#111625', color: 'white' }} value="Super Admin">Super Admin</option>
                            <option style={{ background: '#111625', color: 'white' }} value="Researcher">Researcher</option>
                          </select>
                        </div>
                      </>
                    )}

                    <button 
                      onClick={fetchDashboardData}
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '6px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                    Refresh List
                  </button>
                </div>
              </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '12px 16px' }}>USER</th>
                        <th style={{ padding: '12px 16px' }}>EMAIL</th>
                        <th style={{ padding: '12px 16px' }}>ROLE</th>
                        <th style={{ padding: '12px 16px' }}>MODULE ACCESS</th>
                        <th style={{ padding: '12px 16px' }}>STATUS</th>
                        <th style={{ padding: '12px 16px' }}>JOINED</th>
                        <th style={{ padding: '12px 16px' }}>LAST ACTIVE</th>
                        <th style={{ padding: '12px 16px' }}>API USAGE (TOKENS)</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.slice(0, visibleCount).map(user => {
                        const isPending = user.is_approved === 0;
                        const isApproved = user.is_approved === 1;
                        const isRejected = user.is_approved === 2;

                        return (
                          <tr 
                            key={user.id} 
                            style={{ 
                              borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                              background: user.isReal ? 'rgba(59, 130, 246, 0.02)' : 'transparent'
                            }}
                          >
                            {/* User details */}
                            <td style={{ padding: '16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.03)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 700,
                                border: '1px solid rgba(255, 255, 255, 0.05)'
                              }}>
                                {user.fullname.split(' ').map(n => n[0]).join('')}
                              </div>
                              <span style={{ fontWeight: 600, color: 'white' }}>{user.fullname}</span>
                            </td>

                            {/* Email */}
                            <td style={{ padding: '16px 16px', color: '#94a3b8' }}>{user.email}</td>

                            {/* Role */}
                            <td style={{ padding: '16px 16px', color: '#64748b' }}>{user.role}</td>

                            {/* Module access indicators */}
                            <td style={{ padding: '16px 16px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {['D', 'F', 'M', 'A', 'S'].map((m, idx) => {
                                  const nameMap = {
                                    D: "Design",
                                    F: "Find",
                                    M: "Manage",
                                    A: "Analyse",
                                    S: "Safety"
                                  };
                                  const fullMap = {
                                    D: "Trial Design (Biostatistics)",
                                    F: "Trial Find (Study Search)",
                                    M: "Trial Manage (Operations)",
                                    A: "Trial Analyse (Data Insights)",
                                    S: "Trial Safety (Adverse Events)"
                                  };
                                  return (
                                    <span 
                                      key={m}
                                      onClick={() => handleToggleModule(user.id, user.fullname, nameMap[m], idx)}
                                      title={`Click to toggle access: ${fullMap[m]}`}
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 800,
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        background: user.modules[idx] ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                                        color: user.modules[idx] ? '#3b82f6' : '#475569',
                                        border: user.modules[idx] ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.04)',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                      }}
                                      onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'scale(1.1)';
                                        if (user.modules[idx]) {
                                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
                                        } else {
                                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                        }
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.background = user.modules[idx] ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)';
                                      }}
                                    >
                                      {m}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Status tag */}
                            <td style={{ padding: '16px 16px' }}>
                              {isApproved && <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Active</span>}
                              {isPending && <span style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} /> Pending</span>}
                              {isRejected && <span style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} /> Inactive</span>}
                            </td>

                            {/* Joined */}
                            <td style={{ padding: '16px 16px', color: '#64748b' }}>
                              {new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                            </td>

                            {/* Last Active */}
                            <td style={{ padding: '16px 16px', color: '#94a3b8' }}>
                              {user.last_login ? new Date(user.last_login).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                            </td>

                            {/* Token consumption */}
                            <td style={{ padding: '16px 16px', color: 'white', fontWeight: 600 }}>
                              {user.api_tokens_used.toLocaleString()}
                            </td>

                            {/* Actions buttons */}
                            <td style={{ padding: '16px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 8 }}>
                                {(isPending || isRejected) && (
                                  <button 
                                    onClick={() => handleApprove(user.id)}
                                    disabled={actionLoading !== null}
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.1)',
                                      border: '1px solid rgba(16, 185, 129, 0.2)',
                                      color: '#10b981',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Approve
                                  </button>
                                )}
                                {isApproved && (
                                  <button 
                                    onClick={() => handleReject(user.id)}
                                    disabled={actionLoading !== null}
                                    style={{
                                      background: 'rgba(245, 158, 11, 0.1)',
                                      border: '1px solid rgba(245, 158, 11, 0.2)',
                                      color: '#f59e0b',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Suspend
                                  </button>
                                )}
                                {user.isReal && (
                                  <button 
                                    onClick={() => handleDelete(user.id, user.email)}
                                    disabled={actionLoading !== null}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.2)',
                                      color: '#ef4444',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Facebook style Load More */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '20px',
                  fontSize: '12.5px',
                  color: '#64748b',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '16px'
                }}>
                  <div>Showing {Math.min(visibleCount, filteredUsers.length)} of {filteredUsers.length} users</div>
                  {filteredUsers.length > visibleCount && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + 10)}
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        color: '#3b82f6',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        padding: '6px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Load More (10)
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Pending approvals list widget */}
              {activeMenu === 'Dashboard' && (
                <div style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '18px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>Pending Approvals</h3>
                    <span 
                      onClick={() => setActiveMenu('Pending Approvals')}
                      style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }}
                    >
                      View All
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {mergedUsers.filter(u => u.is_approved === 0).length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px 0' }}>No pending approvals!</div>
                    ) : (
                      mergedUsers.filter(u => u.is_approved === 0).map(u => (
                        <div 
                          key={u.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.03)'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'white' }}>{u.fullname}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>{u.email}</div>
                          </div>
                          
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button 
                              onClick={() => handleApprove(u.id)}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '6px',
                                background: '#10b981',
                                border: 'none',
                                color: 'white',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px'
                              }}
                              title="Approve access"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={() => handleReject(u.id)}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '6px',
                                background: '#ef4444',
                                border: 'none',
                                color: 'white',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px'
                              }}
                              title="Reject access"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Third Row: Recent Activity & Top Consumers */}
          {activeMenu === 'Dashboard' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px'
            }}>
              {/* 1. Recent Activity Logs */}
              <div style={{
                background: '#111625',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '18px',
                padding: '24px'
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>Recent Activity</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {(stats.recent_activity && stats.recent_activity.length > 0) ? (
                    stats.recent_activity.map((act, index) => (
                      <div key={act.id || index} style={{ display: 'flex', gap: 12, fontSize: '12.5px' }}>
                        <div style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          background: act.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                          color: act.type === 'success' ? '#10b981' : '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          flexShrink: 0
                        }}>
                          {act.type === 'success' ? '💾' : '⚙️'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: '#94a3b8' }}>{act.message}</span>
                          <span style={{ fontSize: '10.5px', color: '#475569' }}>{act.time_ago}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12.5px', padding: '20px 0' }}>No recent activity logs.</div>
                  )}
                </div>
              </div>

              {/* 2. Top API Consumers */}
              <div style={{
                background: '#111625',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '18px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>Top API Consumers</h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>View All</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(stats.top_consumers && stats.top_consumers.length > 0) ? (() => {
                    const colors = ['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6', '#ec4899'];
                    const maxTokens = Math.max(...stats.top_consumers.map(u => u.tokens), 1);
                    return stats.top_consumers.map((user, index) => (
                      <div key={user.email || index} style={{ fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: 'white', fontWeight: 600 }}>
                            {index + 1}. {user.name}
                          </span>
                          <span style={{ color: '#94a3b8' }}>
                            {user.tokens.toLocaleString()} tokens <span style={{ color: '#475569', fontSize: '11px' }}>({user.percentage}%)</span>
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '2.5px', overflow: 'hidden' }}>
                          <div style={{ width: `${(user.tokens / maxTokens) * 100}%`, height: '100%', background: colors[index % colors.length], borderRadius: '2.5px' }} />
                        </div>
                      </div>
                    ));
                  })() : (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12.5px', padding: '20px 0' }}>No token usage logs found.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Detailed API Usage View */}
          {activeMenu === 'API Usage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Mini Dashboard for API Usage */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px'
              }}>
                {[
                  { title: 'Accumulated API Tokens', value: stats.total_api_usage_tokens.toLocaleString(), icon: '🪙' },
                  { title: 'Estimated Usage Cost', value: `$${stats.total_cost_usd.toFixed(2)}`, icon: '💵' },
                  { title: 'Active Modules Tracked', value: '5 Modules', icon: '⚙️' },
                  { title: 'Weekly Consumers', value: stats.recently_active_users, icon: '📈' }
                ].map(card => (
                  <div key={card.title} style={{
                    background: '#111625',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{card.title}</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginTop: '4px' }}>{card.value}</div>
                    </div>
                    <div style={{ fontSize: '24px', background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '10px' }}>{card.icon}</div>
                  </div>
                ))}
              </div>

              {/* Row 1: Charts */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '24px',
                alignItems: 'stretch',
                minWidth: 0
              }}>
                {/* 1. Bar Chart */}
                <div 
                  className="chart-container-box"
                  style={{
                    background: '#111625',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '18px',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>OpenAI API Consumption Overview</h3>
                    <select 
                      value={apiChartPeriod}
                      onChange={(e) => setApiChartPeriod(Number(e.target.value))}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '8px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option style={{ background: '#111625', color: 'white' }} value={7}>Last 7 Days</option>
                      <option style={{ background: '#111625', color: 'white' }} value={14}>Last 14 Days</option>
                      <option style={{ background: '#111625', color: 'white' }} value={30}>Last 30 Days</option>
                    </select>
                  </div>
                  
                  {/* Custom SVG Bar Chart */}
                  <div style={{ flex: 1, position: 'relative', minHeight: '180px' }}>
                    <svg viewBox="0 0 500 160" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      {/* Grid lines */}
                      <line x1="0" y1="135" x2="500" y2="135" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="95" x2="500" y2="95" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="55" x2="500" y2="55" stroke="rgba(255, 255, 255, 0.05)" />
                      <line x1="0" y1="15" x2="500" y2="15" stroke="rgba(255, 255, 255, 0.05)" />
                      
                      {(() => {
                        const points = (stats.consumption_overview || []).slice(-apiChartPeriod);
                        const maxVal = Math.max(...points.map(d => d.tokens), 1000);
                        return points.map((d, i) => {
                          const tokens = d.tokens;
                          const height = maxVal > 0 ? (tokens / maxVal) * 120 : 0;
                          const y = 135 - height;
                          const barSpacing = 500 / points.length;
                          const barWidth = barSpacing * 0.65;
                          const x = i * barSpacing + (barSpacing - barWidth) / 2;
                          
                          return (
                            <rect
                              key={i}
                              x={x}
                              y={y}
                              width={barWidth}
                              height={Math.max(1, height)}
                              fill={hoveredApiBar?.index === i ? "#a78bfa" : "#8b5cf6"}
                              rx={Math.max(1, barWidth / 6)}
                              ry={Math.max(1, barWidth / 6)}
                              style={{ transition: 'all 0.15s ease', cursor: 'pointer' }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const container = e.currentTarget.closest('.chart-container-box');
                                const containerRect = container.getBoundingClientRect();
                                
                                setHoveredApiBar({
                                  index: i,
                                  date: d.date,
                                  tokens: d.tokens,
                                  cost: d.tokens * 0.0000001786,
                                  x: rect.left - containerRect.left + rect.width / 2,
                                  y: rect.top - containerRect.top - 78
                                });
                              }}
                              onMouseLeave={() => setHoveredApiBar(null)}
                            />
                          );
                        });
                      })()}
                    </svg>
                    
                    {/* Y-axis helper values */}
                    {(() => {
                      const points = (stats.consumption_overview || []).slice(-apiChartPeriod);
                      const maxVal = Math.max(...points.map(d => d.tokens), 1000);
                      return (
                        <>
                          <div style={{ position: 'absolute', top: '15px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal)}</div>
                          <div style={{ position: 'absolute', top: '55px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal * 2 / 3)}</div>
                          <div style={{ position: 'absolute', top: '95px', left: 0, fontSize: '10px', color: '#475569' }}>{formatTokens(maxVal / 3)}</div>
                          <div style={{ position: 'absolute', top: '135px', left: 0, fontSize: '10px', color: '#475569' }}>0</div>
                        </>
                      );
                    })()}
 
                    {/* X-axis helper labels */}
                    {(() => {
                      const points = (stats.consumption_overview || []).slice(-apiChartPeriod);
                      const getXAxisLabels = () => {
                        if (points.length === 0) return [];
                        if (points.length <= 7) {
                          return points.map((d, idx) => ({
                            label: d.date,
                            x: ((idx + 0.5) / points.length) * 100 + '%'
                          }));
                        }
                        const step = Math.floor(points.length / 4);
                        const indices = [0, step, step * 2, step * 3, points.length - 1];
                        return indices.map(idx => {
                          const item = points[idx];
                          return {
                            label: item ? item.date : '',
                            x: ((idx + 0.5) / points.length) * 100 + '%'
                          };
                        });
                      };
                      
                      return (
                        <div style={{ display: 'flex', position: 'relative', marginTop: '12px', height: '14px', fontSize: '10px', color: '#475569' }}>
                          {getXAxisLabels().map((item, idx) => (
                            <span 
                              key={idx} 
                              style={{ 
                                position: 'absolute', 
                                left: item.x, 
                                transform: 'translateX(-50%)',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
 
                  {/* Floating Hover Tooltip */}
                  {hoveredApiBar && (
                    <div style={{
                      position: 'absolute',
                      left: `${hoveredApiBar.x}px`,
                      top: `${hoveredApiBar.y}px`,
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      pointerEvents: 'none',
                      zIndex: 1000,
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(6px)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      transition: 'all 0.1s ease',
                      width: 'max-content'
                    }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{hoveredApiBar.date}</div>
                      <div style={{ fontSize: '13px', color: '#c084fc', fontWeight: 800 }}>
                        Spend: ${hoveredApiBar.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                        Tokens: {hoveredApiBar.tokens.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Donut Chart */}
                <div style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '18px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0
                }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>API Usage by Module</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, flex: 1, justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        {(() => {
                          const hasData = (stats.usage_by_module || []).some(m => m.tokens > 0);
                          if (!hasData) {
                            return <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="12" />;
                          }
                          
                          let cumulativePercent = 0;
                          const colors = {
                            DESIGN: '#3b82f6',
                            FIND: '#06b6d4',
                            MANAGE: '#10b981',
                            ANALYSE: '#8b5cf6',
                            SAFETY: '#ec4899'
                          };
                          
                          return (stats.usage_by_module || []).map((m, idx) => {
                            if (m.percentage <= 0) return null;
                            const strokeDasharray = `${251}`;
                            const strokeDashoffset = `${251 - (251 * m.percentage) / 100}`;
                            const rotation = (cumulativePercent * 360) / 100 - 90; // Start at top
                            cumulativePercent += m.percentage;
                            
                            return (
                              <circle 
                                key={m.module}
                                cx="50" 
                                cy="50" 
                                r="40" 
                                fill="transparent" 
                                stroke={colors[m.module] || '#64748b'} 
                                strokeWidth="12" 
                                strokeDasharray={strokeDasharray} 
                                strokeDashoffset={strokeDashoffset} 
                                transform={`rotate(${rotation} 50 50)`} 
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'white' }}>{formatTokens(stats.total_api_usage_tokens)}</div>
                        <div style={{ fontSize: '8px', color: '#64748b' }}>Tokens</div>
                      </div>
                    </div>

                    {/* Legends */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11.5px' }}>
                      {(() => {
                        const colors = {
                          DESIGN: '#3b82f6',
                          FIND: '#06b6d4',
                          MANAGE: '#10b981',
                          ANALYSE: '#8b5cf6',
                          SAFETY: '#ec4899'
                        };
                        return (stats.usage_by_module || []).map(item => (
                          <div key={item.module} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[item.module] || '#64748b' }} />
                              {item.module}
                            </span>
                            <span style={{ color: 'white', fontWeight: 600 }}>
                              {formatTokens(item.tokens)} <span style={{ color: '#475569', fontWeight: 400 }}>({item.percentage}%)</span>
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Per-user detailed module consumption table */}
              <div style={{
                background: '#111625',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '18px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>OpenAI API Consumption per User & Module</h3>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Detailed breakdown of tokens consumed by each researcher across iClinicalAI modules</p>
                  </div>
                  
                  {/* API Token Tier Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Usage Tier:</span>
                    <select 
                      value={apiTierFilter}
                      onChange={(e) => setApiTierFilter(e.target.value)}
                      style={{
                        background: '#0c111d',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '12px',
                        padding: '4px 8px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option style={{ background: '#111625', color: 'white' }} value="All">All Tiers</option>
                      <option style={{ background: '#111625', color: 'white' }} value="High (>100K)">High (&gt;100K)</option>
                      <option style={{ background: '#111625', color: 'white' }} value="Medium (10K-100K)">Medium (10K-100K)</option>
                      <option style={{ background: '#111625', color: 'white' }} value="Low (<10K)">Low (&lt;10K)</option>
                    </select>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '12px 16px' }}>USER</th>
                        <th style={{ padding: '12px 16px' }}>DESIGN</th>
                        <th style={{ padding: '12px 16px' }}>FIND</th>
                        <th style={{ padding: '12px 16px' }}>MANAGE</th>
                        <th style={{ padding: '12px 16px' }}>ANALYSE</th>
                        <th style={{ padding: '12px 16px' }}>SAFETY</th>
                        <th style={{ padding: '12px 16px' }}>TOTAL TOKENS</th>
                        <th style={{ padding: '12px 16px' }}>LAST ACTIVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApiBreakdown.slice(0, visibleApiCount).map(row => (
                        <tr key={row.user_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                          <td style={{ padding: '16px 16px' }}>
                            <div style={{ fontWeight: 600, color: 'white' }}>{row.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{row.email}</div>
                          </td>
                          <td style={{ padding: '16px 16px', color: '#3b82f6', fontWeight: 600 }}>{row.design_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: '#06b6d4', fontWeight: 600 }}>{row.find_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: '#10b981', fontWeight: 600 }}>{row.manage_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: '#8b5cf6', fontWeight: 600 }}>{row.analyse_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: '#ec4899', fontWeight: 600 }}>{row.safety_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: 'white', fontWeight: 700 }}>{row.total_tokens.toLocaleString()}</td>
                          <td style={{ padding: '16px 16px', color: '#64748b' }}>
                            {row.last_login ? new Date(row.last_login).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Facebook style Load More for API usage */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '20px',
                  fontSize: '12.5px',
                  color: '#64748b',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '16px'
                }}>
                  <div>Showing {Math.min(visibleApiCount, filteredApiBreakdown.length)} of {filteredApiBreakdown.length} users</div>
                  {filteredApiBreakdown.length > visibleApiCount && (
                    <button
                      onClick={() => setVisibleApiCount(prev => prev + 10)}
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        color: '#3b82f6',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        padding: '6px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Load More (10)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Detailed Active Sessions View */}
          {activeMenu === 'Active Sessions' && (
            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Page Title Header */}
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>Live User Session Tracker</h2>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  Monitor online researchers, idle states, and logoff details in real-time.
                </p>
              </div>

              {/* 1. Mini Dashboard inside the page */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '20px'
              }}>
                {/* Online Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Online Now</span>
                    <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>{sessionStats.online}</h3>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    🟢
                  </div>
                </div>

                {/* Idle Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Idle (Away)</span>
                    <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>{sessionStats.idle}</h3>
                  </div>
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    🟡
                  </div>
                </div>

                {/* Offline Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(100, 116, 139, 0.08) 0%, rgba(100, 116, 139, 0.02) 100%)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Logged Off</span>
                    <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#94a3b8', marginTop: '6px' }}>{sessionStats.offline}</h3>
                  </div>
                  <div style={{ background: 'rgba(100, 116, 139, 0.1)', color: '#94a3b8', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    ⚫
                  </div>
                </div>

                {/* Total Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0.02) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.15)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Registered</span>
                    <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#a78bfa', marginTop: '6px' }}>{sessionStats.total}</h3>
                  </div>
                  <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    👥
                  </div>
                </div>
              </div>

              {/* 2. Main Sessions List Card */}
              <div style={{
                background: '#111625',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '18px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Filter and search header inside page */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>User Sessions Directory</h3>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Detailed browser, duration, and geo-location metrics for current and previous user sessions.</p>
                  </div>
                  
                  {/* Local Session Status Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Filter Status:</span>
                      <select 
                        value={sessionStatusFilter}
                        onChange={(e) => setSessionStatusFilter(e.target.value)}
                        style={{
                          background: '#0c111d',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          color: 'white',
                          fontSize: '12px',
                          padding: '4px 8px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option style={{ background: '#111625', color: 'white' }} value="All">All Sessions</option>
                        <option style={{ background: '#111625', color: 'white' }} value="Online">Online Only</option>
                        <option style={{ background: '#111625', color: 'white' }} value="Idle">Idle Only</option>
                        <option style={{ background: '#111625', color: 'white' }} value="Offline">Offline Only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Session Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '12px 16px' }}>USER</th>
                        <th style={{ padding: '12px 16px' }}>STATUS</th>
                        <th style={{ padding: '12px 16px' }}>SESSION TIME</th>
                        <th style={{ padding: '12px 16px' }}>AI REQUESTS TODAY</th>
                        <th style={{ padding: '12px 16px' }}>PROTOCOLS PROCESSED</th>
                        <th style={{ padding: '12px 16px' }}>API COST TODAY</th>
                        <th style={{ padding: '12px 16px' }}>LAST ACTIVITY</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Apply filters
                        const filtered = mergedUsers.filter(u => {
                          const details = getSessionDetails(u);
                          
                          // Filter by search query
                          const matchesSearch = u.fullname.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                                u.email.toLowerCase().includes(searchQuery.toLowerCase());
                                                
                          // Filter by status dropdown
                          const matchesStatus = sessionStatusFilter === 'All' || details.status === sessionStatusFilter;
                          
                          return matchesSearch && matchesStatus;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                                No active sessions match your search or filter options.
                              </td>
                            </tr>
                          );
                        }

                        // Paginate / Facebook style load
                        const displayed = filtered.slice(0, visibleSessionsCount);

                        return (
                          <>
                            {displayed.map(u => {
                              const details = getSessionDetails(u);
                              return (
                                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)', color: '#e2e8f0', transition: 'all 0.15s ease' }} className="hover-row">
                                  <td style={{ padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: u.role === 'Super Admin' ? 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        fontSize: '12.5px',
                                        color: 'white'
                                      }}>
                                        {u.fullname.charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{u.fullname}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{u.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  
                                  <td style={{ padding: '14px 16px' }}>
                                    <span style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '6px', 
                                      padding: '4px 10px', 
                                      borderRadius: '12px', 
                                      fontSize: '11.5px', 
                                      fontWeight: 700, 
                                      background: `${details.statusColor}18`, 
                                      color: details.statusColor 
                                    }}>
                                      {details.status === 'Online' && (
                                        <span style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          background: '#10b981',
                                          boxShadow: '0 0 8px #10b981',
                                          animation: 'pulse-glow 1.5s infinite'
                                        }} />
                                      )}
                                      {details.status}
                                    </span>
                                  </td>
                                  
                                  <td style={{ padding: '14px 16px', fontSize: '12.5px' }}>
                                    <div style={{ fontWeight: 500 }}>{details.durationText}</div>
                                    {u.last_login && (
                                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                        {new Date(u.last_login).toLocaleString()}
                                      </div>
                                    )}
                                  </td>

                                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f1f5f9', fontSize: '12.5px' }}>
                                    {u.ai_requests_today}
                                  </td>

                                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f1f5f9', fontSize: '12.5px' }}>
                                    {u.protocols_processed}
                                  </td>

                                  <td style={{ padding: '14px 16px', fontWeight: 700, color: '#10b981', fontSize: '12.5px' }}>
                                    ${(u.api_cost_today || 0).toFixed(3)}
                                  </td>

                                  <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12.5px' }}>
                                    <span style={{
                                      background: 'rgba(255, 255, 255, 0.03)',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(255, 255, 255, 0.05)',
                                      fontSize: '11.5px',
                                      color: '#cbd5e1'
                                    }}>{u.last_activity}</span>
                                  </td>

                                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                    <button
                                      onClick={() => setSelectedSessionUser(u)}
                                      style={{
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)',
                                        border: '1px solid rgba(59, 130, 246, 0.25)',
                                        borderRadius: '6px',
                                        color: '#60a5fa',
                                        padding: '5px 12px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.1) 100%)';
                                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                                        e.currentTarget.style.color = '#93c5fd';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)';
                                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                                        e.currentTarget.style.color = '#60a5fa';
                                      }}
                                    >
                                      View More
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            
                            {/* Facebook style Load More section */}
                            {filtered.length > visibleSessionsCount && (
                              <tr>
                                <td colSpan="8" style={{ padding: '20px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => setVisibleSessionsCount(prev => prev + 10)}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid rgba(59, 130, 246, 0.2)',
                                      color: '#3b82f6',
                                      fontSize: '12.5px',
                                      fontWeight: 700,
                                      padding: '6px 16px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    Load More (10)
                                  </button>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Active Session Detail Modal */}
          {selectedSessionUser && (() => {
            const details = getSessionDetails(selectedSessionUser);

            const joinedDate = selectedSessionUser.created_at 
              ? new Date(selectedSessionUser.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              : 'Unknown';

            return (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(5, 8, 16, 0.85)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '20px'
              }}>
                <div style={{
                  background: '#111625',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  width: '100%',
                  maxWidth: '650px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {/* Modal Header Panel */}
                  <div style={{
                    padding: '28px 28px 20px 28px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: selectedSessionUser.role === 'Super Admin' ? 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '22px',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}>
                        {selectedSessionUser.fullname.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white', margin: 0 }}>
                            {selectedSessionUser.fullname}
                          </h3>
                          <span style={{
                            background: selectedSessionUser.role === 'Super Admin' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            border: selectedSessionUser.role === 'Super Admin' ? '1px solid rgba(167, 139, 250, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                            color: selectedSessionUser.role === 'Super Admin' ? '#c084fc' : '#60a5fa',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase'
                          }}>
                            {selectedSessionUser.role}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{selectedSessionUser.email}</div>
                      </div>
                    </div>
                    
                    {/* Close Button */}
                    <button
                      onClick={() => setSelectedSessionUser(null)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#64748b',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.color = '#64748b';
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Modal Body Container */}
                  <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                    
                    {/* Status Glow Banner */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>SESSION STATUS</span>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '3px 8px', 
                          borderRadius: '8px', 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          background: `${details.statusColor}18`, 
                          color: details.statusColor 
                        }}>
                          {details.status === 'Online' && (
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#10b981',
                              boxShadow: '0 0 8px #10b981',
                              animation: 'pulse-glow 1.5s infinite'
                            }} />
                          )}
                          {details.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500 }}>
                        {details.durationText}
                      </div>
                    </div>

                    {/* Today's Usage Summary */}
                    <div>
                      <h4 style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                        Today's Activity
                      </h4>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px'
                      }}>
                        <div style={{ background: '#0c111d', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '14px 16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700 }}>AI REQUESTS</span>
                          <span style={{ fontSize: '18px', color: '#3b82f6', fontWeight: 800 }}>{selectedSessionUser.ai_requests_today || 0}</span>
                        </div>
                        <div style={{ background: '#0c111d', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '14px 16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700 }}>PROTOCOLS</span>
                          <span style={{ fontSize: '18px', color: '#a78bfa', fontWeight: 800 }}>{selectedSessionUser.protocols_processed_today || 0}</span>
                        </div>
                        <div style={{ background: '#0c111d', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '14px 16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700 }}>API COST</span>
                          <span style={{ fontSize: '18px', color: '#10b981', fontWeight: 800 }}>${(selectedSessionUser.api_cost_today || 0).toFixed(4)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Cumulative Usage Statistics */}
                    <div>
                      <h4 style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                        Cumulative Metrics & Account Stats
                      </h4>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px'
                      }}>
                        <div style={{ background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.00) 100%)', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Total Tokens</span>
                          <span style={{ fontSize: '16px', color: '#3b82f6', fontWeight: 800 }}>{(selectedSessionUser.api_tokens_used || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.00) 100%)', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Lifetime Cost</span>
                          <span style={{ fontSize: '16px', color: '#10b981', fontWeight: 800 }}>${((selectedSessionUser.api_tokens_used || 0) * 0.0000001786).toFixed(4)}</span>
                        </div>
                        <div style={{ background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.00) 100%)', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Protocols Uploaded</span>
                          <span style={{ fontSize: '16px', color: '#a78bfa', fontWeight: 800 }}>{selectedSessionUser.protocols_processed || 0}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                        <span>Joined: {joinedDate}</span>
                        <span>Account: <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span></span>
                      </div>
                    </div>

                    {/* Section 3: Recent API Logs timeline */}
                    <div>
                      <h4 style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                        Recent API Activity Logs
                      </h4>
                      {(selectedSessionUser.recent_logs || []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {(selectedSessionUser.recent_logs || []).map((log, index) => (
                            <div key={index} style={{
                              background: '#0c111d',
                              border: '1px solid rgba(255, 255, 255, 0.03)',
                              borderRadius: '8px',
                              padding: '10px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{log.time}</span>
                                <span style={{ fontSize: '12px', color: 'white', fontWeight: 600, fontFamily: 'monospace' }}>{log.endpoint}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>{log.tokens} tokens</span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: log.statusColor,
                                  background: `${log.statusColor}15`,
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {log.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{
                          background: '#0c111d',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                          borderRadius: '8px',
                          padding: '16px',
                          textAlign: 'center',
                          color: '#64748b',
                          fontSize: '12px'
                        }}>
                          No recent API activity logs found in this session.
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
