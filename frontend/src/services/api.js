const API_BASE = '/api';

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem('iclinical_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponseError(res, fallbackMessage) {
  let errMsg = fallbackMessage;
  try {
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const err = await res.json();
      errMsg = err.detail || errMsg;
    } else {
      errMsg = `Error ${res.status}: ${fallbackMessage} (server returned unexpected format).`;
    }
  } catch (e) {
    errMsg = `Error ${res.status}: ${res.statusText || fallbackMessage}`;
  }
  throw new Error(errMsg);
}

// ─── Authentication Services ──────────────────────────────────────

export async function register(email, password, fullname) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullname }),
  });
  if (!res.ok) await handleResponseError(res, 'Registration failed');
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) await handleResponseError(res, 'Login failed');
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!res.ok) await handleResponseError(res, 'Failed to get profile');
  return res.json();
}

// ─── Document Services ────────────────────────────────────────────

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) await handleResponseError(res, 'Upload failed');
  return res.json();
}

export async function listDocuments() {
  const res = await fetch(`${API_BASE}/documents`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to list documents');
  return res.json();
}

export async function getDocument(docId) {
  const res = await fetch(`${API_BASE}/documents/${docId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Document not found');
  return res.json();
}

export async function deleteDocument(docId) {
  const res = await fetch(`${API_BASE}/documents/${docId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete document');
  return res.json();
}

export async function getOrGenerateDashboard(docId) {
  const res = await fetch(`${API_BASE}/documents/${docId}/dashboard`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) await handleResponseError(res, 'Failed to get/generate dashboard');
  return res.json();
}

export async function runAnalysis(type, docId) {
  const res = await fetch(`${API_BASE}/analysis/${type}/${docId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) await handleResponseError(res, 'Analysis failed');
  return res.json();
}

export async function chatWithDocument(docId, message, history = []) {
  const res = await fetch(`${API_BASE}/analysis/chat/${docId}`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) await handleResponseError(res, 'Chat failed');
  return res.json();
}

// ─── Trials / FIND Module Services ──────────────────────────────────

export async function listTrials() {
  const res = await fetch(`${API_BASE}/trials`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to list trials');
  return res.json();
}

export async function searchTrials(searchParams) {
  const res = await fetch(`${API_BASE}/trials/search`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(searchParams),
  });
  if (!res.ok) await handleResponseError(res, 'Search failed');
  return res.json();
}

export async function runTrialAnalysis(step, selectedTrialIds, topic = null, mode = 'clinical') {
  const res = await fetch(`${API_BASE}/trials/analyze`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ step, selected_trial_ids: selectedTrialIds, topic, mode }),
  });
  if (!res.ok) await handleResponseError(res, 'Analysis failed');
  return res.json();
}

export async function chatWithTrials(selectedTrialIds, message, history = []) {
  const res = await fetch(`${API_BASE}/trials/chat`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ selected_trial_ids: selectedTrialIds, message, history }),
  });
  if (!res.ok) await handleResponseError(res, 'Chat failed');
  return res.json();
}

export async function deleteTrial(trialId) {
  const res = await fetch(`${API_BASE}/trials/${trialId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete trial');
  return res.json();
}

// ─── Data Management / MANAGE Module Services ──────────────────────────

export async function runManageAnalysis(step, docId = null, extraInput = null) {
  const res = await fetch(`${API_BASE}/manage/analyze`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ step, doc_id: docId, extra_input: extraInput }),
  });
  if (!res.ok) await handleResponseError(res, 'Analysis failed');
  return res.json();
}

export async function uploadDataset(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/manage/upload-dataset`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) await handleResponseError(res, 'Audit failed');
  return res.json();
}

export async function getMockDataset() {
  const res = await fetch(`${API_BASE}/manage/mock-dataset`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch mock dataset');
  return res.json();
}

// ─── Biostatistics / ANALYSE Module Services ──────────────────────────

export async function runBiostatsAnalysis(step, docId = null, extraInput = null) {
  const res = await fetch(`${API_BASE}/biostats/analyze`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ step, doc_id: docId, extra_input: extraInput }),
  });
  if (!res.ok) await handleResponseError(res, 'Biostatistics analysis failed');
  return res.json();
}

export async function exportBiostats(format, title, content, filename) {
  const res = await fetch(`${API_BASE}/biostats/export/${format}`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, content, filename }),
  });
  if (!res.ok) throw new Error(`Failed to export to ${format}`);
  return res.blob();
}

export async function runSafetyAnalysis(step, docId) {
  const res = await fetch(`${API_BASE}/safety/analyze`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ step, doc_id: docId }),
  });
  if (!res.ok) await handleResponseError(res, `Safety step ${step} analysis failed`);
  return res.json();
}

export async function generateSafetyNarrative(eventDetails, docId = null) {
  const res = await fetch(`${API_BASE}/safety/narrative`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ event_details: eventDetails, doc_id: docId }),
  });
  if (!res.ok) await handleResponseError(res, 'Narrative generation failed');
  return res.json();
}

export async function assessSafetyCausality(naranjoResponses, clinicalContext = '') {
  const res = await fetch(`${API_BASE}/safety/causality`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ naranjo_responses: naranjoResponses, clinical_context: clinicalContext }),
  });
  if (!res.ok) await handleResponseError(res, 'Causality assessment failed');
  return res.json();
}

export async function chatWithSafety(docId, message, history = []) {
  const res = await fetch(`${API_BASE}/safety/chat/${docId}`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) await handleResponseError(res, 'Safety chat failed');
  return res.json();
}

export async function sendHeartbeat() {
  const res = await fetch(`${API_BASE}/auth/heartbeat`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Heartbeat failed');
  return res.json();
}

export async function logoutUser() {
  try {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch (e) {
    console.error('Logout request failed:', e);
    return false;
  }
}


