import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardView from './pages/DashboardView';
import DesignModule from './pages/DesignModule';
import FindModule from './pages/FindModule';
import ManageModule from './pages/ManageModule';
import AnalyseModule from './pages/AnalyseModule';
import SafetyModule from './pages/SafetyModule';
import { getMe, sendHeartbeat, logoutUser } from './services/api';

function App() {
  const [currentModule, setCurrentModule] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Helper to read cookie
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  };

  useEffect(() => {
    const handleAuth = async () => {
      // 1. Check for token in URL search params (fallback/redirect param)
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');
      if (tokenFromUrl) {
        localStorage.setItem('iclinical_token', tokenFromUrl);
        // Sync to cookie
        document.cookie = `iclinical_token=${tokenFromUrl}; path=/; max-age=2592000; samesite=lax`;
        // Clean URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }

      // 2. Try reading from cookie first (shared domain cookie), then fallback to localStorage
      const token = getCookie('iclinical_token') || localStorage.getItem('iclinical_token');
      if (!token) {
        redirectToLanding();
        return;
      }

      // Sync localstorage if token exists in cookie
      if (token && !localStorage.getItem('iclinical_token')) {
        localStorage.setItem('iclinical_token', token);
      }

      try {
        const profile = await getMe();
        setUser(profile);
        setAuthLoading(false);
      } catch (err) {
        console.error('Auth verification failed:', err);
        localStorage.removeItem('iclinical_token');
        document.cookie = "iclinical_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isLocal) {
          document.cookie = "iclinical_token=; path=/; domain=.iclinical.ai; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        }
        redirectToLanding();
      }
    };

    handleAuth();
  }, []);

  // Heartbeat Effect: signal active status every 30 seconds when user is logged in
  useEffect(() => {
    if (!user || user.is_approved !== 1) return;

    let lastActivity = Date.now();
    let wasInactive = false;

    const handleUserActivity = () => {
      lastActivity = Date.now();
      
      // If they were inactive and now resumed, send immediate heartbeat
      if (wasInactive) {
        wasInactive = false;
        console.log('User resumed activity, sending immediate heartbeat.');
        sendHeartbeat().catch(err => console.error('Heartbeat failed:', err));
      }
    };

    // Add activity listeners
    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'click'];
    events.forEach(event => window.addEventListener(event, handleUserActivity));

    // Send immediate heartbeat on mount
    sendHeartbeat().catch(err => console.error('Heartbeat failed:', err));

    const interval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivity;
      if (timeSinceLastActivity > 300000) { // 5 minutes in milliseconds
        wasInactive = true;
        console.log('Skipping heartbeat due to user inactivity.');
        return;
      }
      sendHeartbeat().catch(err => console.error('Heartbeat failed:', err));
    }, 30000);

    return () => {
      clearInterval(interval);
      events.forEach(event => window.removeEventListener(event, handleUserActivity));
    };
  }, [user]);

  const redirectToLanding = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const landingUrl = isLocal ? 'http://localhost:3000/' : 'https://iclinical.ai/';
    window.location.href = landingUrl;
  };

  const handleLogout = async () => {
    await logoutUser();
    localStorage.removeItem('iclinical_token');
    document.cookie = "iclinical_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
      document.cookie = "iclinical_token=; path=/; domain=.iclinical.ai; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    }
    redirectToLanding();
  };

  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-app, #0f172a)',
        color: '#f8fafc',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }}></div>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Verifying iClinicalAI Session...</div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Pending/Rejected User Access Restriction Layer
  if (user && user.is_approved !== 1) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)',
        color: '#f8fafc',
        fontFamily: 'Inter, sans-serif',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '48px 32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ fontSize: '56px', marginBottom: '24px' }}>
            {user.is_approved === 0 ? '⏳' : '🚫'}
          </div>
          
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.5px' }}>
            {user.is_approved === 0 ? 'Access Approval Pending' : 'Access Restricted'}
          </h2>
          
          <p style={{ fontSize: '14.5px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '32px' }}>
            {user.is_approved === 0 
              ? 'Thank you for signing up for iClinical-AI! Your account is currently awaiting administrator review. You will receive access once approved by our team.'
              : 'Your account access has been restricted by an administrator. If you believe this is a mistake, please contact system support.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button 
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar 
        currentModule={currentModule} 
        onChangeModule={setCurrentModule} 
        user={user} 
        onLogout={handleLogout} 
      />
      <main className="main-content">
        {currentModule === 'dashboard' && <DashboardView user={user} onLogout={handleLogout} onChangeModule={setCurrentModule} />}
        {currentModule === 'design' && <DesignModule />}
        {currentModule === 'find' && <FindModule />}
        {currentModule === 'manage' && <ManageModule />}
        {currentModule === 'analyze' && <AnalyseModule />}
        {currentModule === 'safety' && <SafetyModule />}
      </main>
    </div>
  );
}

export default App;
