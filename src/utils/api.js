const BASE = process.env.REACT_APP_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  health: () => request('/health'),
  saveIntake: (data) => request('/intake/save', { method: 'POST', body: data }),
  analyze: (data) => request('/analyze', { method: 'POST', body: data }),
  saveOutcome: (data) => request('/outcome/save', { method: 'POST', body: data }),
  getEvaluations: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/evaluations${q ? '?' + q : ''}`);
  },
  getEvaluation: (id) => request(`/evaluations/${id}`),
  getDashboard: () => request('/dashboard'),
  getPrograms: () => request('/programs'),
  getPolicies: () => request('/policies'),
  getSettings: () => request('/settings'),
  getMonthlyReport: (month, year) => request(`/monthly-report?month=${month}&year=${year}`),
};
