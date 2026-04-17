const API_BASE = '/api';
const REQUEST_TIMEOUT = 30000; // 30 seconds

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('nexus_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('nexus_token', token);
    else localStorage.removeItem('nexus_token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    // Add request timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Handle different error codes
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'TOKEN_INVALID') {
          this.setToken(null);
          localStorage.removeItem('nexus_user');
          window.location.href = '/login';
          return null;
        }
        this.setToken(null);
        window.location.href = '/login';
        return null;
      }

      if (res.status === 423) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Account locked');
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Access denied');
      }

      if (res.status === 429) {
        throw new Error('Too many requests. Please wait a moment.');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || data.error || 'Request failed');
        err.data = data; // Preserve full response for structured errors
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  get(endpoint, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return this.request(`${endpoint}${qs ? `?${qs}` : ''}`);
  }

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  }

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

const api = new ApiClient();
export default api;
