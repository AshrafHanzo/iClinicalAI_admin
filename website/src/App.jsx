import { useState, useEffect, useRef } from 'react';

const ALLOW_SIGNUP = true;
const CONTACT_EMAIL = 'info@iclinical.ai';

/* ══════════════════════════════════════════════════════════════
   Icon system — Lucide-style stroke SVGs
   ══════════════════════════════════════════════════════════════ */
const ICONS = {
  bolt: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  building: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20" /><path d="M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01M10 18h4" /></>,
  flask: <path d="M9 3h6M10 3v6L5.2 17.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.8-3L14 9V3M7.5 14h9" />,
  hospital: <><path d="M4 22V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 22h20" /><path d="M12 7v6M9 10h6" /></>,
  cap: <path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" />,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  layout: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  layers: <path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></>,
  chart: <path d="M3 3v18h18M7 15v-4M12 15V8M17 15v-6" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  sparkles: <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  trending: <><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></>,
  bulb: <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />,
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" /></>,
  checkCircle: <><circle cx="12" cy="12" r="10" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>,
};

const Icon = ({ name }) => (
  <span className="icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || ICONS.sparkles}
    </svg>
  </span>
);

/* ══════════════════════════════════════════════════════════════
   Reveal-on-scroll wrapper
   ══════════════════════════════════════════════════════════════ */
function Reveal({ children, delay = 0, className = '', style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.unobserve(el); } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? 'in-view' : ''} ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/* Animated count-up — runs once when scrolled into view */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function CountUp({ end, duration = 1700 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(() => (prefersReducedMotion() ? end : 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.unobserve(el);
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(end * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [end, duration]);
  return <span ref={ref}>{val}</span>;
}

/* ══════════════════════════════════════════════════════════════
   Page content data
   ══════════════════════════════════════════════════════════════ */
const HERO_CHIPS = [
  { icon: 'cpu', label: 'AI-Powered Automation' },
  { icon: 'shield', label: 'Regulatory-Aware' },
  { icon: 'users', label: 'Human-in-the-Loop' },
  { icon: 'lock', label: 'Secure Cloud Platform' },
];

const HOME_MODULES = [
  { icon: 'layout', name: 'DESIGN', desc: 'Analyze patient datasets, design efficient clinical trials, review eligibility criteria, and run automated protocol gap assessments against ICH guidelines.', soon: false },
  { icon: 'search', name: 'FIND', desc: 'Supercharge search queries across registries. Fetch live global clinical trial statistics directly from registries for advanced benchmarking.', soon: false },
  { icon: 'layers', name: 'MANAGE', desc: 'Manage bulk clinical trial datasets. Audit trial records, run safety validations, and verify dataset integrity with deep analysis reports.', soon: false },
  { icon: 'chart', name: 'ANALYZE', desc: 'Leverage advanced analytics to examine data patterns and identify trends across clinical trials to enhance therapeutic outcomes.', soon: true },
  { icon: 'sparkles', name: 'PREDICT', desc: 'Forecast patient outcomes, model clinical trial risks, and optimize design schemas using machine learning algorithms.', soon: true },
  { icon: 'users', name: 'RECRUIT', desc: 'Identify optimal participants, match them with active trials, and streamline visits using automated tracking systems.', soon: true },
];

const STATS = [
  { icon: 'award', n: 20, suffix: '+', label: 'Years of CRO Experience' },
  { icon: 'users', n: 40, suffix: '+', label: 'Clinical Trial Partners' },
  { icon: 'flask', n: 100, suffix: '+', label: 'Studies Conducted' },
  { icon: 'globe', n: 10, suffix: '+', label: 'Countries Covered' },
];

const SOLUTION_SEGMENTS = [
  { icon: 'building', title: 'Enterprise Solutions', subtitle: 'For Pharmaceutical, Biotechnology & Medical Device Companies', desc: 'Accelerate clinical development with AI-powered automation. Designed for Sponsors managing clinical trials globally.', idealFor: ['Pharmaceutical Companies', 'Biotechnology Companies', 'Medical Device Companies', 'Vaccine Developers', 'Digital Health Companies'], solutions: ['Protocol Design Assistant', 'Clinical Operations Copilot', 'AI Medical Writing', 'AI Data Review', 'Clinical Analytics', 'Risk-Based Monitoring', 'AI Safety Review', 'CSR & Submission Support'], benefits: ['Faster study startup', 'Improved protocol quality', 'Reduced operational costs', 'Better regulatory readiness', 'Faster database lock', 'Improved decision making'] },
  { icon: 'flask', title: 'CRO Solutions', subtitle: 'AI for Clinical Research Organizations (CROs)', desc: 'Increase operational efficiency while delivering high-quality services to Sponsors.', idealFor: ['Full-Service CROs', 'Functional Service Providers (FSP)', 'Biometrics Teams', 'Pharmacovigilance Teams', 'Medical Writing Teams'], solutions: ['Study Startup Automation', 'Clinical Data Management Assistant', 'Biostatistics Assistant', 'SAS Programming Assistant', 'CDISC SDTM/ADaM Assistant', 'Medical Writing Assistant', 'Safety Narrative Generator', 'Project Management Dashboard'], benefits: ['Increase productivity', 'Standardize deliverables', 'Reduce turnaround time', 'Improve quality', 'Scale operations efficiently'] },
  { icon: 'hospital', title: 'Healthcare & Research Organizations', subtitle: 'AI for Hospitals, Research Networks & Healthcare Organizations', desc: 'Support investigator-initiated studies, registries, and real-world evidence programs.', idealFor: ['Hospitals', 'Research Centers', 'Government Organizations', 'NGOs', 'Public Health Programs'], solutions: ['Registry Management', 'Clinical Data Capture', 'AI Analytics', 'Research Documentation', 'Patient Recruitment', 'Safety Monitoring'], benefits: [] },
  { icon: 'cap', title: 'Academic Institution Solutions', subtitle: 'Empower Universities and Clinical Research Training Institutes', desc: 'Transform clinical research education through AI-powered learning.', idealFor: ['Universities', 'Medical Colleges', 'Pharmacy Colleges', 'Life Science Institutions', 'Clinical Research Institutes'], solutions: ['AI Learning Platform', 'Research Proposal Assistant', 'Literature Review Assistant', 'Study Design Assistant', 'Thesis Writing Support', 'Publication Assistant', 'Clinical Trial Simulation', 'Faculty AI Toolkit'], benefits: ['Improve research quality', 'Faster academic writing', 'AI-enabled learning', 'Better student engagement'] },
  { icon: 'briefcase', title: 'Professional Solutions', subtitle: 'AI Productivity Suite for Clinical Research Professionals', desc: 'Your everyday AI assistant for clinical research work.', idealFor: ['Clinical Research Associates (CRA)', 'Clinical Trial Managers', 'Clinical Data Managers', 'Biostatisticians', 'SAS Programmers', 'CDISC Specialists', 'Medical Writers', 'Pharmacovigilance Professionals', 'Regulatory Affairs Professionals', 'Quality Assurance Professionals'], solutions: ['Document Generator', 'Protocol Review', 'CRF Review', 'Edit Check Builder', 'SDTM Assistant', 'ADaM Assistant', 'SAP Assistant', 'TLF Assistant', 'Medical Writing Assistant', 'Safety Narrative Assistant'], benefits: ['Save hours every week', 'Improve documentation quality', 'Reduce repetitive tasks', 'Learn faster', 'Enhance career growth'] },
  { icon: 'target', title: 'Student Solutions', subtitle: 'Learn Clinical Research with AI', desc: 'Designed for students preparing for careers in Clinical Research, Data Management, Biostatistics, SAS Programming, Pharmacovigilance, and Regulatory Affairs.', idealFor: ['Life Science Students', 'Pharmacy Students', 'Medical Students', 'Biotechnology Students', 'Nursing Students', 'Fresh Graduates'], solutions: ['AI Tutor', 'Prompt Library', 'Practice Datasets', 'Mock Projects', 'Quiz Generator', 'Interview Preparation', 'Resume Builder', 'Career Guidance', 'Certification Support'], benefits: ['Learn faster', 'Practice with real-world examples', 'Build job-ready skills', 'Improve placement opportunities'] },
];

const AI_MODULES = [
  { icon: 'layout', name: 'DESIGN', purpose: 'Protocol Design & Study Planning' },
  { icon: 'search', name: 'FIND', purpose: 'Literature Search & Trial Discovery' },
  { icon: 'layers', name: 'MANAGE', purpose: 'Clinical Trial Operations' },
  { icon: 'database', name: 'DATA', purpose: 'Clinical Data Management' },
  { icon: 'chart', name: 'ANALYZE', purpose: 'Biostatistics & Analytics' },
  { icon: 'shield', name: 'SAFETY', purpose: 'Pharmacovigilance & Safety' },
  { icon: 'pen', name: 'WRITE', purpose: 'Medical & Regulatory Writing' },
];

const WHY_CHOOSE = ['Built exclusively for Clinical Research', 'AI-powered productivity across the study lifecycle', 'Human-in-the-loop approach', 'Regulatory-aware workflows', 'Secure cloud platform', 'Scalable for individuals and enterprises', 'Suitable for learning, research, and commercial use'];

const MISSION_POINTS = ['Accelerate clinical development', 'Improve operational efficiency', 'Enhance data quality', 'Strengthen regulatory compliance', 'Support evidence-based decision-making', 'Advance medical research through responsible AI'];

const ASPIRE_POINTS = ['Study Design and Protocol Development', 'Clinical Trial Operations', 'Clinical Data Management', 'Biostatistics and Data Analytics', 'Medical Writing and Regulatory Documentation', 'Pharmacovigilance and Drug Safety', 'Research Collaboration and Knowledge Management', 'AI-enabled Learning and Professional Development'];

const CORE_VALUES = [
  { icon: 'bulb', title: 'Innovation', desc: 'We continuously develop AI-powered solutions that simplify complex clinical research workflows.' },
  { icon: 'award', title: 'Scientific Excellence', desc: 'Every solution is designed with an understanding of clinical research principles, industry standards, and best practices.' },
  { icon: 'shield', title: 'Responsible AI', desc: 'We advocate for human oversight, transparency, and ethical AI use in healthcare and clinical research.' },
  { icon: 'checkCircle', title: 'Quality', desc: 'We strive to improve consistency, accuracy, and efficiency while supporting informed human review.' },
  { icon: 'users', title: 'Collaboration', desc: 'We believe the best outcomes come from collaboration between researchers, clinicians, technology experts, educators, and AI.' },
  { icon: 'book', title: 'Lifelong Learning', desc: 'We are committed to supporting professionals, researchers, and students through AI-enabled education and continuous skill development.' },
];

const WHO_WE_SERVE = ['Pharmaceutical Companies', 'Biotechnology Companies', 'Medical Device Organizations', 'Contract Research Organizations (CROs)', 'Hospitals and Healthcare Networks', 'Academic Institutions', 'Research Organizations', 'Government and Public Health Programs', 'Clinical Research Professionals', 'Students and Early-Career Researchers'];

const PARTNERS = [
  { name: 'WorkBooster AI', role: 'AI Technology & Product Development Partner', monogram: 'WB', desc: 'WorkBooster AI is a strategic technology partner supporting the design and development of the iClinicalAI platform. The collaboration focuses on building intelligent AI capabilities, enhancing user experience, and accelerating the delivery of innovative solutions for clinical research professionals and organizations.', areas: ['AI application development', 'Intelligent workflow automation', 'Product engineering and technical architecture', 'AI model integration and optimization', 'Scalable cloud-based platform development', 'Continuous product innovation'] },
  { name: 'AJAKS Corp', role: 'Business Strategy & Global Growth Partner', monogram: 'AC', desc: 'AJAKS Corp collaborates with iClinicalAI to support strategic business growth, international expansion, and the development of partnerships across the global life sciences ecosystem. The alliance focuses on strengthening market presence and creating opportunities for sustainable growth.', areas: ['Strategic business consulting', 'Global partnership development', 'Market expansion initiatives', 'Corporate growth strategy', 'Business development', 'Ecosystem collaboration'] },
];

const WHY_PARTNERSHIPS = ['Accelerating AI innovation in clinical research', 'Delivering scalable solutions for global organizations', 'Promoting responsible AI adoption', 'Supporting digital transformation across life sciences', 'Building a collaborative ecosystem for research, education, and healthcare'];

const BECOME_PARTNER = ['Pharmaceutical Companies', 'Biotechnology Companies', 'Medical Device Organizations', 'Contract Research Organizations (CROs)', 'Healthcare Providers', 'Academic and Research Institutions', 'AI & Technology Companies', 'Cloud and Digital Infrastructure Providers', 'Healthcare Consulting Firms', 'Innovation Networks and Industry Associations'];

/* ── Presentational helpers ──────────────────────────────────── */
const PillGroup = ({ items }) => (
  <div className="pill-group">
    {items.map((item, i) => <span key={i} className="pill"><Icon name="check" />{item}</span>)}
  </div>
);
const CheckGrid = ({ items }) => (
  <div className="check-grid">
    {items.map((item, i) => (
      <div key={i} className="check-item"><span className="check-mark"><Icon name="check" /></span>{item}</div>
    ))}
  </div>
);
const SubLabel = ({ children }) => <h4 className="sub-label">{children}</h4>;

const VALID_TABS = ['home', 'solutions', 'vision', 'partners', 'contact', 'login', 'signup'];
const getInitialTab = () => {
  if (typeof window === 'undefined') return 'home';
  const params = new URLSearchParams(window.location.search);
  if (params.get('signup') === 'true') return ALLOW_SIGNUP ? 'signup' : 'login';
  if (params.get('login') === 'true') return 'login';
  const tab = params.get('tab');
  if (tab && VALID_TABS.includes(tab)) return tab;
  return 'home';
};

function App() {
  const [currentTab, setCurrentTab] = useState(getInitialTab);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullname, setFullname] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ message: '', type: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Contact
  const [contactKind, setContactKind] = useState('enquiry');
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cOrg, setCOrg] = useState('');
  const [cSubject, setCSubject] = useState('');
  const [cMessage, setCMessage] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactAlert, setContactAlert] = useState({ message: '', type: '' });

  // Newsletter
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeMsg, setSubscribeMsg] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? (window.scrollY / h) * 100 : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const getApiRoot = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    return '/api';
  };
  const getPortalUrl = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:5173/' : 'https://app.iclinical.ai/';
  };
  const setAuthCookie = (token) => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) document.cookie = `iclinical_token=${token}; path=/; max-age=2592000; samesite=lax`;
    else document.cookie = `iclinical_token=${token}; path=/; domain=.iclinical.ai; max-age=2592000; secure; samesite=lax`;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAlert({ message: '', type: '' });
    if (!email || !password) { setAlert({ message: 'Please enter email and password.', type: 'danger' }); return; }
    try {
      setLoading(true);
      const res = await fetch(`${getApiRoot()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Login failed. Check credentials.'); }
      const data = await res.json();
      setAuthCookie(data.access_token);
      localStorage.setItem('iclinical_token', data.access_token);
      setAlert({ message: 'Login successful! Redirecting to app...', type: 'success' });
      setTimeout(() => { window.location.href = getPortalUrl(); }, 800);
    } catch (err) { setAlert({ message: err.message, type: 'danger' }); } finally { setLoading(false); }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!ALLOW_SIGNUP) { setAlert({ message: 'Registration is currently disabled.', type: 'danger' }); return; }
    setAlert({ message: '', type: '' });
    if (!fullname || !email || !password) { setAlert({ message: 'All fields are required.', type: 'danger' }); return; }
    if (password !== confirmPassword) { setAlert({ message: 'Passwords do not match.', type: 'danger' }); return; }
    try {
      setLoading(true);
      const regRes = await fetch(`${getApiRoot()}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, fullname }) });
      if (!regRes.ok) { const err = await regRes.json(); throw new Error(err.detail || 'Registration failed.'); }
      setAlert({ message: 'Account request submitted! Your registration is pending administrator review and approval. You will be able to sign in once approved.', type: 'success' });
      setEmail(''); setFullname(''); setPassword(''); setConfirmPassword('');
      setTimeout(() => { setCurrentTab('login'); }, 5000);
    } catch (err) { setAlert({ message: err.message, type: 'danger' }); } finally { setLoading(false); }
  };

  const handleContact = async (e) => {
    e.preventDefault();
    setContactAlert({ message: '', type: '' });
    if (!cName.trim() || !cEmail.trim() || !cMessage.trim()) { setContactAlert({ message: 'Please fill in your name, email, and message.', type: 'danger' }); return; }
    try {
      setContactLoading(true);
      const res = await fetch(`${getApiRoot()}/contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName, email: cEmail, organization: cOrg, subject: cSubject, message: cMessage, kind: contactKind, source_page: contactKind === 'partnership' ? 'partners' : 'contact' }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Something went wrong. Please try again.'); }
      const data = await res.json();
      setContactAlert({ message: data.message || 'Thank you! Your message has been received.', type: 'success' });
      setCName(''); setCEmail(''); setCOrg(''); setCSubject(''); setCMessage('');
    } catch (err) { setContactAlert({ message: err.message, type: 'danger' }); } finally { setContactLoading(false); }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (subscribing) return; // guard against double submits
    setSubscribeMsg('');
    if (!subscribeEmail.trim()) return;
    try {
      setSubscribing(true);
      const res = await fetch(`${getApiRoot()}/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: subscribeEmail, source_page: 'footer' }) });
      if (!res.ok) throw new Error('Subscription failed.');
      setSubscribeMsg('Thank you for subscribing!');
      setSubscribeEmail('');
    } catch { setSubscribeMsg('Could not subscribe right now. Please try again later.'); }
    finally { setSubscribing(false); }
  };

  const navigateToTab = (tabName, opts = {}) => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
    setCurrentTab(tabName === 'signup' && !ALLOW_SIGNUP ? 'login' : tabName);
    if (tabName === 'contact') { setContactKind(opts.kind || 'enquiry'); setContactAlert({ message: '', type: '' }); }
  };

  const NAV_ITEMS = [
    { key: 'home', label: 'Home' },
    { key: 'solutions', label: 'Solutions' },
    { key: 'vision', label: 'Vision' },
    { key: 'partners', label: 'Partners' },
    { key: 'contact', label: 'Contact' },
  ];

  return (
    <>
      <div className="scroll-progress" style={{ width: `${progress}%` }} />

      {/* ══ HEADER ══ */}
      <header className={scrolled ? 'scrolled' : ''}>
        <div className="container nav-wrapper">
          <div className="logo" onClick={() => navigateToTab('home')}>
            <div className="logo-icon">iC</div>
            <div>
              <span className="logo-text">iClinicalAI</span>
              <span className="logo-sub">Powered by IDDCR Global Research</span>
            </div>
          </div>

          <ul className="nav-links">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <button className={currentTab === item.key ? 'active' : ''} onClick={() => navigateToTab(item.key)}>{item.label}</button>
              </li>
            ))}
          </ul>

          <div className="nav-btns">
            {ALLOW_SIGNUP ? (
              <>
                <button className="btn btn-secondary" onClick={() => navigateToTab('login')}>Sign In</button>
                <button className="btn btn-primary" onClick={() => navigateToTab('signup')}>Get Started<Icon name="arrow" /></button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => navigateToTab('login')}>Sign In</button>
            )}
          </div>

          <button className={`hamburger ${menuOpen ? 'open' : ''}`} aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <span></span><span></span><span></span>
          </button>
        </div>

        <div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <button className={currentTab === item.key ? 'active' : ''} onClick={() => navigateToTab(item.key)}>{item.label}</button>
              </li>
            ))}
          </ul>
          <div className="mobile-menu-btns">
            {ALLOW_SIGNUP ? (
              <>
                <button className="btn btn-secondary" onClick={() => navigateToTab('login')}>Sign In</button>
                <button className="btn btn-primary" onClick={() => navigateToTab('signup')}>Get Started</button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => navigateToTab('login')}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      {/* ══ HOME ══ */}
      {currentTab === 'home' && (
        <main className="animate-fade-in">
          <section className="hero">
            <div className="hero-bg"><span className="blob blob-1" /><span className="blob blob-2" /></div>
            <div className="container">
              <span className="badge"><span className="pillette">NEW</span><span className="dot" /> Next-Generation Clinical Trial Platform</span>
              <h1>Revolutionizing Clinical Research with <span className="grad-text">Artificial Intelligence</span></h1>
              <p className="hero-sub">iClinicalAI streamlines protocol design, automates eligibility reviews, performs gap assessments, and accelerates recruitment to reduce cycle times and deliver elite outcomes.</p>
              <div className="hero-btns">
                {ALLOW_SIGNUP
                  ? <button onClick={() => navigateToTab('signup')} className="btn btn-primary">Get Started Free<Icon name="arrow" /></button>
                  : <button onClick={() => navigateToTab('login')} className="btn btn-primary">Sign In<Icon name="arrow" /></button>}
                <button onClick={() => navigateToTab('solutions')} className="btn btn-secondary">Explore AI Modules</button>
              </div>

              <div className="hero-trust">
                <div className="hero-trust-label">Built for the entire clinical research ecosystem</div>
                <div className="hero-chips">
                  {HERO_CHIPS.map((c) => (
                    <span className="hero-chip" key={c.label}><Icon name={c.icon} />{c.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container">
              <Reveal className="section-head">
                <div className="eyebrow centered">Platform</div>
                <h2>Empowering Research with Intelligence</h2>
                <p>Our modular AI suite provides state-of-the-art workflows to automate, audit, and benchmark every layer of clinical research.</p>
              </Reveal>
              <div className="features-grid">
                {HOME_MODULES.map((m, i) => (
                  <Reveal key={m.name} delay={i * 70}>
                    <article className="feature-card">
                      <div className="icon-tile"><Icon name={m.icon} /></div>
                      <h3>iClinicalAI {m.name}{m.soon && <span className="tag-soon">Soon</span>}</h3>
                      <p>{m.desc}</p>
                      <button onClick={() => navigateToTab('login')} className="feature-link">
                        {m.soon ? 'Coming Soon' : `Explore ${m.name}`}<Icon name="arrow" />
                      </button>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="stats-band">
            <div className="container">
              <Reveal className="section-head">
                <div className="eyebrow centered">Proven Track Record</div>
                <h2>Two Decades of Clinical Research Excellence</h2>
                <p>Backed by the deep domain expertise of IDDCR Global Research — spanning therapeutic areas, geographies, and hundreds of studies.</p>
              </Reveal>
              <div className="numbers-grid">
                {STATS.map((s, i) => (
                  <Reveal key={s.label} delay={i * 90}>
                    <div className="number-card">
                      <div className="stat-icon"><Icon name={s.icon} /></div>
                      <h4><CountUp end={s.n} /><span>{s.suffix}</span></h4>
                      <p>{s.label}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section className="cta-section">
            <div className="container">
              <Reveal>
                <div className="cta-box">
                  <h2>Transform Your Traditional Research Today</h2>
                  {ALLOW_SIGNUP ? (
                    <>
                      <p>Ready to deploy AI-powered clinical protocol designs and benchmark live trials? Sign up today and get started instantly.</p>
                      <div className="hero-btns">
                        <button onClick={() => navigateToTab('signup')} className="btn btn-primary">Get Started for Free<Icon name="arrow" /></button>
                        <button onClick={() => navigateToTab('contact')} className="btn btn-secondary">Contact Us</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>Ready to deploy AI-powered clinical protocol designs and benchmark live trials? Sign in to access your modules.</p>
                      <button onClick={() => navigateToTab('login')} className="btn btn-primary">Sign In<Icon name="arrow" /></button>
                    </>
                  )}
                </div>
              </Reveal>
            </div>
          </section>
        </main>
      )}

      {/* ══ SOLUTIONS ══ */}
      {currentTab === 'solutions' && (
        <main className="page animate-fade-in">
          <div className="container">
            <Reveal className="page-hero">
              <div className="eyebrow centered">Solutions</div>
              <h1>AI Solutions for Every Clinical Research Stakeholder</h1>
              <p>Whether you're a pharmaceutical company, CRO, healthcare organization, research institution, or an aspiring clinical research professional, iClinicalAI provides intelligent AI assistants to improve productivity, quality, compliance, and decision-making across the clinical research lifecycle.</p>
            </Reveal>

            <div className="sol-list">
              {SOLUTION_SEGMENTS.map((seg, idx) => (
                <Reveal key={seg.title} delay={(idx % 2) * 90}>
                  <section className="sol-block">
                    <div className="sol-block-head">
                      <div className="sol-num">{String(idx + 1).padStart(2, '0')}</div>
                      <div className="sol-icon"><Icon name={seg.icon} /></div>
                      <div><h3>{seg.title}</h3><p className="sol-subtitle">{seg.subtitle}</p></div>
                    </div>
                    <p className="sol-desc">{seg.desc}</p>
                    <SubLabel>Ideal For</SubLabel>
                    <PillGroup items={seg.idealFor} />
                    <SubLabel>Solutions</SubLabel>
                    <CheckGrid items={seg.solutions} />
                    {seg.benefits.length > 0 && (<><SubLabel>Key Benefits</SubLabel><PillGroup items={seg.benefits} /></>)}
                  </section>
                </Reveal>
              ))}
            </div>

            <Reveal className="section-head" style={{ marginTop: '96px' }}>
              <div className="eyebrow centered">Platform Capabilities</div>
              <h2>iClinicalAI AI Modules</h2>
              <p>Powerful, purpose-built modules covering every stage of the clinical research lifecycle.</p>
            </Reveal>
            <div className="module-grid">
              {AI_MODULES.map((mod, i) => (
                <Reveal key={mod.name} delay={i * 60}>
                  <div className="module-card">
                    <div className="icon-tile"><Icon name={mod.icon} /></div>
                    <h4>{mod.name}</h4>
                    <p>{mod.purpose}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="why-box" style={{ marginTop: '80px' }}>
                <h3>Why Choose iClinicalAI?</h3>
                <CheckGrid items={WHY_CHOOSE} />
                <div className="hero-btns" style={{ justifyContent: 'flex-start', marginTop: '32px' }}>
                  {ALLOW_SIGNUP && <button onClick={() => navigateToTab('signup')} className="btn btn-primary">Get Started Free<Icon name="arrow" /></button>}
                  <button onClick={() => navigateToTab('contact')} className="btn btn-secondary">Talk to Our Team</button>
                </div>
              </div>
            </Reveal>
          </div>
        </main>
      )}

      {/* ══ VISION ══ */}
      {currentTab === 'vision' && (
        <main className="page animate-fade-in">
          <div className="container">
            <Reveal className="page-hero">
              <div className="eyebrow centered">Vision</div>
              <h1>Shaping the Future of Clinical Research with <span className="grad-text">Artificial Intelligence</span></h1>
              <p>At iClinicalAI, we envision a future where clinical research is faster, smarter, and more accessible through the responsible use of Artificial Intelligence.</p>
            </Reveal>

            <Reveal className="prose">
              <p>Our vision is to empower every stakeholder in the clinical research ecosystem—from pharmaceutical companies and CROs to healthcare organizations, academic institutions, researchers, and students—with intelligent AI solutions that enhance productivity, improve decision-making, and accelerate medical innovation.</p>
              <p>We believe AI should augment human expertise, not replace it. By combining advanced AI with scientific knowledge and regulatory best practices, we help professionals focus on innovation while reducing repetitive, time-consuming tasks.</p>
            </Reveal>

            <div className="two-col" style={{ marginTop: '50px' }}>
              <Reveal>
                <div className="panel">
                  <div className="icon-tile"><Icon name="target" /></div>
                  <h3>Our Mission</h3>
                  <p>To build a trusted AI platform that simplifies clinical research by delivering intelligent, compliant, and user-friendly solutions across the entire clinical development lifecycle. We are committed to enabling organizations and professionals to:</p>
                  <CheckGrid items={MISSION_POINTS} />
                </div>
              </Reveal>
              <Reveal delay={90}>
                <div className="panel">
                  <div className="icon-tile"><Icon name="bulb" /></div>
                  <h3>Our Purpose</h3>
                  <p>Healthcare innovation depends on the ability to transform complex scientific data into meaningful insights. iClinicalAI was created to bridge the gap between human expertise and artificial intelligence by providing practical AI assistants designed specifically for clinical research and life sciences.</p>
                  <p>Our purpose is to make advanced AI accessible to organizations of every size—from global pharmaceutical companies to emerging biotech startups, academic institutions, healthcare organizations, and individual professionals.</p>
                </div>
              </Reveal>
            </div>

            <Reveal className="section-head" style={{ marginTop: '90px' }}><div className="eyebrow centered">Roadmap</div><h2>What We Aspire to Build</h2><p>A comprehensive AI ecosystem for clinical research that supports every stage of the research lifecycle, providing intelligent assistance across:</p></Reveal>
            <Reveal><div className="soft-card"><CheckGrid items={ASPIRE_POINTS} /></div></Reveal>

            <Reveal className="section-head" style={{ marginTop: '90px' }}><div className="eyebrow centered">What Drives Us</div><h2>Our Core Values</h2><p>The principles that guide everything we build.</p></Reveal>
            <div className="value-grid">
              {CORE_VALUES.map((v, i) => (
                <Reveal key={v.title} delay={(i % 3) * 80}>
                  <div className="value-card">
                    <div className="icon-tile"><Icon name={v.icon} /></div>
                    <h4>{v.title}</h4>
                    <p>{v.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="section-head" style={{ marginTop: '90px' }}><div className="eyebrow centered">Our Community</div><h2>Who We Serve</h2><p>Our solutions are designed for organizations and individuals across the clinical research ecosystem.</p></Reveal>
            <Reveal><div className="soft-card"><PillGroup items={WHO_WE_SERVE} /></div></Reveal>

            <div className="two-col" style={{ marginTop: '90px' }}>
              <Reveal>
                <div className="panel">
                  <div className="icon-tile"><Icon name="globe" /></div>
                  <h3>Our Long-Term Vision</h3>
                  <p>We aspire to become one of the world's most trusted AI platforms for clinical research by creating intelligent solutions that connect research, technology, education, and healthcare.</p>
                  <p>Our long-term vision is to foster a collaborative ecosystem where AI helps organizations accelerate innovation, improve research quality, and expand access to knowledge—ultimately contributing to better health outcomes for patients worldwide.</p>
                </div>
              </Reveal>
              <Reveal delay={90}>
                <div className="panel highlight">
                  <h3>Together, We Can Accelerate Medical Innovation</h3>
                  <p>Clinical research is evolving rapidly, and artificial intelligence has the potential to transform how studies are designed, managed, analyzed, and documented. At iClinicalAI, we are committed to helping organizations and individuals embrace this transformation with confidence through practical, responsible, and domain-specific AI solutions.</p>
                  <p style={{ fontWeight: 700, color: '#fff' }}>Together, we can shape a smarter future for clinical research.</p>
                  <div className="hero-btns" style={{ justifyContent: 'flex-start', marginTop: '8px' }}>
                    {ALLOW_SIGNUP && <button onClick={() => navigateToTab('signup')} className="btn btn-primary">Get Started<Icon name="arrow" /></button>}
                    <button onClick={() => navigateToTab('contact')} className="btn btn-secondary">Contact Us</button>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </main>
      )}

      {/* ══ PARTNERS ══ */}
      {currentTab === 'partners' && (
        <main className="page animate-fade-in">
          <div className="container">
            <Reveal className="page-hero">
              <div className="eyebrow centered">Strategic Partners & Alliances</div>
              <h1>Building the Future of Clinical Research Through <span className="grad-text">Collaboration</span></h1>
              <p>At iClinicalAI, we believe that meaningful innovation is driven by strong partnerships. By collaborating with technology leaders, industry experts, and strategic organizations, we are creating an intelligent ecosystem that advances clinical research, healthcare innovation, and AI-powered digital transformation.</p>
            </Reveal>

            <Reveal className="prose">
              <p>Our partners contribute specialized expertise in artificial intelligence, technology, business strategy, and global market development, enabling us to deliver scalable and impactful solutions to the life sciences community.</p>
            </Reveal>

            <Reveal className="section-head" style={{ marginTop: '40px' }}><div className="eyebrow centered">The Alliance</div><h2>Our Strategic Partners</h2></Reveal>
            <div className="partner-grid">
              {PARTNERS.map((p, i) => (
                <Reveal key={p.name} delay={i * 100}>
                  <section className="partner-card">
                    <div className="partner-head">
                      <div className="partner-logo">{p.monogram}</div>
                      <div><h3>{p.name}</h3><span className="partner-role">{p.role}</span></div>
                    </div>
                    <p className="sol-desc">{p.desc}</p>
                    <SubLabel>Areas of Collaboration</SubLabel>
                    <CheckGrid items={p.areas} />
                  </section>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="why-box" style={{ marginTop: '80px' }}>
                <h3>Why Partnerships Matter</h3>
                <p style={{ color: 'var(--text-soft)', marginBottom: '24px', maxWidth: '760px', fontSize: '16px' }}>The future of clinical research requires collaboration across technology, science, healthcare, and education. Through our strategic alliances, iClinicalAI is committed to:</p>
                <CheckGrid items={WHY_PARTNERSHIPS} />
              </div>
            </Reveal>

            <Reveal className="section-head" style={{ marginTop: '90px' }}><div className="eyebrow centered">Join Us</div><h2>Become a Strategic Partner</h2><p>We welcome collaborations with organizations that share our vision of transforming clinical research through innovation and artificial intelligence. We are open to partnerships with:</p></Reveal>
            <Reveal><div className="soft-card"><PillGroup items={BECOME_PARTNER} /></div></Reveal>

            <Reveal>
              <div className="banner-cta">
                <h2>Interested in Collaborating with iClinicalAI?</h2>
                <p>We would be delighted to explore opportunities for innovation and mutual growth.</p>
                <button className="btn btn-primary" onClick={() => navigateToTab('contact', { kind: 'partnership' })}>Contact Us to Discuss a Partnership<Icon name="arrow" /></button>
              </div>
            </Reveal>
          </div>
        </main>
      )}

      {/* ══ CONTACT ══ */}
      {currentTab === 'contact' && (
        <main className="page animate-fade-in">
          <div className="container">
            <Reveal className="page-hero">
              <div className="eyebrow centered">{contactKind === 'partnership' ? 'Partnership Enquiry' : 'Contact Us'}</div>
              <h1>{contactKind === 'partnership' ? "Let's Build Something Together" : 'Get in Touch'}</h1>
              <p>Have a question, an enquiry, or a partnership idea? Send us a message and our team will get back to you shortly.</p>
            </Reveal>

            <div className="contact-grid">
              <Reveal>
                <aside className="contact-info">
                  <h3>Contact Information</h3>
                  <div className="contact-info-item">
                    <span className="ci-icon"><Icon name="mail" /></span>
                    <div><div className="ci-label">Email</div><a href={`mailto:${CONTACT_EMAIL}`} className="ci-value">{CONTACT_EMAIL}</a></div>
                  </div>
                  <div className="contact-info-item">
                    <span className="ci-icon"><Icon name="pin" /></span>
                    <div><div className="ci-label">Location</div><div className="ci-value">Hyderabad, India</div></div>
                  </div>
                  <div className="contact-info-item">
                    <span className="ci-icon"><Icon name="award" /></span>
                    <div><div className="ci-label">Powered by</div><a href="https://www.iddcrglobal.com/" target="_blank" rel="noreferrer" className="ci-value">IDDCR Global Research</a></div>
                  </div>
                </aside>
              </Reveal>

              <Reveal delay={90}>
                <form className="contact-form" onSubmit={handleContact}>
                  {contactAlert.message && <div className={`alert-message alert-${contactAlert.type}`}>{contactAlert.message}</div>}
                  <div className="form-row">
                    <div className="form-group"><label>Full Name *</label><input className="form-input" type="text" placeholder="Your name" value={cName} onChange={(e) => setCName(e.target.value)} disabled={contactLoading} required /></div>
                    <div className="form-group"><label>Email Address *</label><input className="form-input" type="email" placeholder="name@company.com" value={cEmail} onChange={(e) => setCEmail(e.target.value)} disabled={contactLoading} required /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Organization</label><input className="form-input" type="text" placeholder="Company / Institution" value={cOrg} onChange={(e) => setCOrg(e.target.value)} disabled={contactLoading} /></div>
                    <div className="form-group"><label>Subject</label><input className="form-input" type="text" placeholder="How can we help?" value={cSubject} onChange={(e) => setCSubject(e.target.value)} disabled={contactLoading} /></div>
                  </div>
                  <div className="form-group"><label>Message *</label><textarea className="form-input" rows="5" placeholder="Tell us more about your needs..." value={cMessage} onChange={(e) => setCMessage(e.target.value)} disabled={contactLoading} required /></div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={contactLoading}>{contactLoading ? 'Sending...' : 'Send Message'}<Icon name="arrow" /></button>
                </form>
              </Reveal>
            </div>
          </div>
        </main>
      )}

      {/* ══ AUTH ══ */}
      {(currentTab === 'login' || currentTab === 'signup') && (
        <main className="auth-wrapper animate-fade-in">
          <div className="auth-card">
            {alert.message && <div className={`alert-message alert-${alert.type}`}>{alert.message}</div>}
            {currentTab === 'login' ? (
              <div>
                <div className="auth-header"><h2>Welcome Back</h2><p>Sign in to access your clinical modules portal</p></div>
                <form onSubmit={handleLogin}>
                  <div className="form-group"><label>Email Address</label><input type="email" className="form-input" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} /></div>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Password</label>
                    <input type={showPassword ? 'text' : 'password'} className="form-input" placeholder="••••••••" style={{ paddingRight: '44px' }} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="pw-toggle"><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={loading}>{loading ? 'Signing In...' : 'Sign In'}</button>
                </form>
                <div className="auth-footer">
                  {ALLOW_SIGNUP ? (<>Don't have an account?{' '}<button className="toggle-form-btn" onClick={() => navigateToTab('signup')}>Create one</button></>) : (<span>Registration is currently closed.</span>)}
                </div>
              </div>
            ) : (
              <div>
                <div className="auth-header"><h2>Create Account</h2><p>Get started with the iClinicalAI suite</p></div>
                <form onSubmit={handleSignup}>
                  <div className="form-group"><label>Full Name</label><input type="text" className="form-input" placeholder="Dr. Sarah Jenkins" value={fullname} onChange={(e) => setFullname(e.target.value)} required disabled={loading} /></div>
                  <div className="form-group"><label>Email Address</label><input type="email" className="form-input" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} /></div>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Password</label>
                    <input type={showPassword ? 'text' : 'password'} className="form-input" placeholder="Min. 8 characters" style={{ paddingRight: '44px' }} value={password} onChange={(e) => setPassword(e.target.value)} required minLength="8" disabled={loading} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="pw-toggle"><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button>
                  </div>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Confirm Password</label>
                    <input type={showConfirmPassword ? 'text' : 'password'} className="form-input" placeholder="••••••••" style={{ paddingRight: '44px' }} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength="8" disabled={loading} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="pw-toggle"><Icon name={showConfirmPassword ? 'eyeOff' : 'eye'} /></button>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={loading}>{loading ? 'Creating Account...' : 'Get Started'}</button>
                </form>
                <div className="auth-footer">Already have an account?{' '}<button className="toggle-form-btn" onClick={() => setCurrentTab('login')}>Sign In</button></div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ══ FOOTER ══ */}
      <footer>
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="logo" onClick={() => navigateToTab('home')}>
                <div className="logo-icon">iC</div><span className="logo-text">iClinicalAI</span>
              </div>
              <p>AI-enabled clinical research automation platform delivering next-generation protocol analytics.</p>
              <div className="footer-contact"><Icon name="mail" /><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></div>
              <div className="footer-contact"><Icon name="pin" /><span>Hyderabad, India</span></div>
            </div>

            <div>
              <h4 className="footer-heading">Platform</h4>
              <ul className="footer-links">
                <li><button onClick={() => navigateToTab('solutions')}>Solutions</button></li>
                <li><button onClick={() => navigateToTab('login')}>DESIGN Module</button></li>
                <li><button onClick={() => navigateToTab('login')}>FIND Module</button></li>
                <li><button onClick={() => navigateToTab('login')}>Sign In</button></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-heading">Company</h4>
              <ul className="footer-links">
                <li><button onClick={() => navigateToTab('vision')}>Vision</button></li>
                <li><button onClick={() => navigateToTab('partners')}>Partners & Alliances</button></li>
                <li><button onClick={() => navigateToTab('contact')}>Contact Us</button></li>
                <li><a href="https://www.iddcrglobal.com/" target="_blank" rel="noreferrer">IDDCR Global Research</a></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-heading">Subscribe to Newsletter</h4>
              <p style={{ fontSize: '14px', marginBottom: '16px', color: '#94a3b8' }}>Stay updated on AI advancements in clinical development.</p>
              <form className="subscribe-form" onSubmit={handleSubscribe}>
                <input type="email" placeholder="Enter your email" value={subscribeEmail} onChange={(e) => setSubscribeEmail(e.target.value)} required disabled={subscribing} />
                <button type="submit" className="btn btn-primary" style={{ padding: '12px 16px' }} disabled={subscribing}>{subscribing ? '…' : <Icon name="arrow" />}</button>
              </form>
              {subscribeMsg && <div style={{ fontSize: '13px', marginTop: '10px', color: '#6ee7b7' }}>{subscribeMsg}</div>}
            </div>
          </div>

          <div className="footer-bottom">
            <div>© 2026 iClinicalAI. All rights reserved. Powered by IDDCR Global Research.</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
