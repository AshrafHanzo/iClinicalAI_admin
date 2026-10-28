// DESIGN workspace API: studies, protocol versions and features 01, 06, 07, 10, 11, 12.
import { getAuthHeaders, handleResponseError } from './api';

const API_BASE = '/api/design';

async function request(path, { method = 'GET', body, form, fallback = 'Request failed' } = {}) {
  const opts = { method, headers: getAuthHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  if (form) opts.body = form;
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    // Conflicts (e.g. an uncertain document match) carry structured detail for the caller
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(typeof data.detail === 'string' ? data.detail : data.detail?.message || fallback);
      err.status = 409;
      err.detail = data.detail;
      throw err;
    }
    await handleResponseError(res, fallback);
  }
  return res.json();
}

// Downloads a file response using the server-provided filename.
export async function downloadDesignFile(path, fallbackName = 'export') {
  const res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
  if (!res.ok) await handleResponseError(res, 'Export failed');
  const blob = await res.blob();
  const match = (res.headers.get('content-disposition') || '').match(/filename="?([^";]+)"?/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Studies
export const listStudies = () => request('/studies', { fallback: 'Failed to load studies' });
export const createStudy = (data) => request('/studies', { method: 'POST', body: data, fallback: 'Failed to create study' });
export const getStudy = (id) => request(`/studies/${id}`, { fallback: 'Failed to load study' });
export const addStudyMember = (id, email, role) => request(`/studies/${id}/members`, { method: 'POST', body: { email, role } });
export const getStudyAudit = (id) => request(`/studies/${id}/audit`);

// Protocol versions
export function registerProtocolVersion(studyId, file, meta = {}, supporting = []) {
  const form = new FormData();
  form.append('file', file);
  ['version_label', 'amendment_number', 'effective_date', 'amendment_reason', 'language'].forEach(k => {
    if (meta[k]) form.append(k, meta[k]);
  });
  form.append('preferences', JSON.stringify({
    use_ai: meta.use_ai !== false,
    field_groups: meta.field_groups,
    review_threshold: meta.review_threshold,
    ai_scope: meta.ai_scope,
    include_supporting: meta.include_supporting !== false,
  }));
  supporting.forEach(s => form.append('supporting_files', s.file));
  if (supporting.length) form.append('supporting_kinds', supporting.map(s => s.kind).join(','));
  return request(`/studies/${studyId}/versions`, { method: 'POST', form, fallback: 'Upload failed' });
}
export const registerExistingDocument = (studyId, data) =>
  request(`/studies/${studyId}/versions/from-document`, { method: 'POST', body: data, fallback: 'Registration failed' });
export const getProtocolVersion = (id) => request(`/versions/${id}`);
export const reprocessVersion = (id, useAi) =>
  request(`/versions/${id}/reprocess${useAi === undefined ? '' : `?use_ai=${useAi}`}`, { method: 'POST', fallback: 'Re-processing failed' });
export const getSourceBlock = (versionId, blockId) => request(`/versions/${versionId}/blocks/${encodeURIComponent(blockId)}`);

// Feature 01 — Protocol Intelligence
export const getIntelligence = (versionId) => request(`/versions/${versionId}/intelligence`);
export const updateIntelligenceFields = (versionId, updates, baseRevision) =>
  request(`/versions/${versionId}/intelligence/fields`, { method: 'POST', body: { updates, base_revision: baseRevision }, fallback: 'Save failed' });

// Feature 02 — Protocol Review
export const runProtocolReview = (versionId, useAi) =>
  request(`/versions/${versionId}/review/run`, { method: 'POST', body: { use_ai: useAi }, fallback: 'Protocol review failed' });
export const getProtocolReview = (versionId) => request(`/versions/${versionId}/review`);
export const actOnFinding = (versionId, findingId, action, note) =>
  request(`/versions/${versionId}/review/findings/${findingId}`, { method: 'POST', body: { action, note }, fallback: 'Update failed' });

// Shared review status (draft / reviewed / approved)
export const setArtifactStatus = (studyId, artifactId, status, note) =>
  request(`/artifacts/${artifactId}/status?study_id=${studyId}`, { method: 'POST', body: { status, note }, fallback: 'Status change failed' });

// Feature 06 — Endpoint Intelligence
export const analyzeEndpoints = (versionId, useAi) =>
  request(`/versions/${versionId}/endpoints/analyze`, { method: 'POST', body: { use_ai: useAi }, fallback: 'Endpoint analysis failed' });
export const getEndpoints = (versionId) => request(`/versions/${versionId}/endpoints`);
export const reviewSuggestion = (versionId, suggestionId, action, comment) =>
  request(`/versions/${versionId}/endpoints/suggestions/${suggestionId}/review`, { method: 'POST', body: { action, comment } });
export const resolveEndpointIssue = (versionId, issueId, note, reopen = false) =>
  request(`/versions/${versionId}/endpoints/issues/${issueId}/resolve`, { method: 'POST', body: { note, reopen } });

// Feature 07 — Schedule of Assessments
export const generateSoa = (versionId, useAi) =>
  request(`/versions/${versionId}/soa/generate`, { method: 'POST', body: { use_ai: useAi }, fallback: 'Generation failed' });
export const getSoa = (versionId) => request(`/versions/${versionId}/soa`);
export const saveSoa = (versionId, matrix, note, baseRevision) =>
  request(`/versions/${versionId}/soa`, { method: 'PUT', body: { matrix, note, base_revision: baseRevision }, fallback: 'Save failed' });
export const resolveSoaIssue = (versionId, issueId, note, reopen = false) =>
  request(`/versions/${versionId}/soa/issues/${issueId}/resolve`, { method: 'POST', body: { note, reopen } });
export const listSoaTemplates = (studyId) => request(`/studies/${studyId}/soa-templates`);
export function uploadSoaTemplate(studyId, file, name) {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  return request(`/studies/${studyId}/soa-templates`, { method: 'POST', form, fallback: 'Template upload failed' });
}

// Feature 10 — Sample Size & Power
export const getSampleSizeMethods = () => request('/sample-size/methods');
export const previewSampleSize = (inputs) => request('/sample-size/calculate', { method: 'POST', body: { inputs }, fallback: 'Calculation failed' });
export const saveSampleSize = (versionId, name, inputs, basisNote) =>
  request(`/versions/${versionId}/sample-size`, { method: 'POST', body: { name, inputs, basis_note: basisNote }, fallback: 'Calculation failed' });
export const listSampleSize = (versionId) => request(`/versions/${versionId}/sample-size`);
export const verifySampleSize = (versionId, artifactId) => request(`/versions/${versionId}/sample-size/${artifactId}/verify`, { method: 'POST' });

// Feature 11 — Protocol Version Control
export const compareVersions = (versionId, baseVersionId, confirmMatch = false) =>
  request(`/versions/${versionId}/compare`, { method: 'POST', body: { base_version_id: baseVersionId || null, confirm_match: confirmMatch }, fallback: 'Comparison failed' });
export const listComparisons = (versionId) => request(`/versions/${versionId}/comparisons`);
export const reviewChange = (studyId, artifactId, changeId, body) =>
  request(`/comparisons/${artifactId}/changes/${changeId}/review?study_id=${studyId}`, { method: 'POST', body });

// Feature 12 — Design Reports & AI Assistant
export const getReportTypes = () => request('/reports/types');
export const generateDesignReport = (versionId, body) => request(`/versions/${versionId}/reports`, { method: 'POST', body, fallback: 'Report generation failed' });
export const listDesignReports = (versionId) => request(`/versions/${versionId}/reports`);
export const getReportSources = (versionId) => request(`/versions/${versionId}/report-sources`);
export const listReportTemplates = (studyId) => request(`/studies/${studyId}/report-templates`);
export const createReportTemplate = (studyId, body) =>
  request(`/studies/${studyId}/report-templates`, { method: 'POST', body, fallback: 'Template could not be saved' });
export const updateReportTemplate = (studyId, templateId, body) =>
  request(`/studies/${studyId}/report-templates/${templateId}`, { method: 'PUT', body, fallback: 'Template could not be saved' });
export const askDesignAssistant = (versionId, question, includeExisting = true) =>
  request(`/versions/${versionId}/assistant`, { method: 'POST', body: { question, include_existing_analyses: includeExisting }, fallback: 'Assistant failed' });
export const getAssistantHistory = (versionId) => request(`/versions/${versionId}/assistant/history`);
