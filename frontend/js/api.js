const BACKEND_URL = 'http://195.123.189.186:25692';

const API = {
  get base() {
    const meta = document.querySelector('meta[name="api-base"]');
    const custom = (window.API_BASE_URL || (meta && meta.content) || localStorage.getItem('ph_api_base') || '').replace(/\/$/, '');
    if (custom) return custom + '/api';

    if (typeof window !== 'undefined' && window.location) {
      // If opened directly from file:// protocol:
      if (window.location.protocol === 'file:') {
        return BACKEND_URL + '/api';
      }
      // If opened from a known local static development server port without reverse proxy:
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isDevStaticPort = ['5500', '5173', '8080', '8000', '3001', '4173'].includes(String(window.location.port));
      if (isLocalhost && isDevStaticPort) {
        return 'http://localhost:3000/api';
      }
    }

    // Default to relative '/api' which works natively and proxies on Vercel & Pterodactyl
    return '/api';
  },

  token: () => {
    let t = sessionStorage.getItem('ph_token');
    if (!t) {
      t = localStorage.getItem('ph_token');
      if (t) {
        try { sessionStorage.setItem('ph_token', t); } catch (_) {}
      }
    }
    return t;
  },
  setToken(t) {
    if (t) {
      try { sessionStorage.setItem('ph_token', t); } catch (_) {}
      try { localStorage.setItem('ph_token', t); } catch (_) {}
    } else {
      try { sessionStorage.removeItem('ph_token'); } catch (_) {}
      try { localStorage.removeItem('ph_token'); } catch (_) {}
    }
  },
  logout() {
    sessionStorage.removeItem('ph_token');
    sessionStorage.removeItem('ph_user');
    try {
      localStorage.removeItem('ph_token');
      localStorage.removeItem('ph_user');
    } catch (_) {}
    location.replace('/auth.html');
  },

  async req(path, { method = 'GET', body, json = true, timeoutMs = 12000 } = {}) {
    const headers = {};
    if (json && body) headers['Content-Type'] = 'application/json';
    const t = this.token();
    if (t) headers.Authorization = 'Bearer ' + t;

    let signal;
    let timer;
    if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const res = await fetch(this.base + path, {
        method,
        headers,
        body: json && body ? JSON.stringify(body) : body,
        signal
      });
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Error ' + res.status), { status: res.status });
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw Object.assign(new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + 's. Backend may be restarting.'), { status: 408 });
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  get: (p) => API.req(p),
  post: (p, b) => API.req(p, { method: 'POST', body: b }),
  patch: (p, b) => API.req(p, { method: 'PATCH', body: b }),
  del: (p) => API.req(p, { method: 'DELETE' }),
  upload: (p, fd) => API.req(p, { method: 'POST', body: fd, json: false }),
  uploadWithProgress(p, fd, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.base + p);
      const t = this.token();
      if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct, e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || 'Upload failed with status ' + xhr.status));
          }
        } catch (_) {
          if (xhr.status >= 200 && xhr.status < 300) resolve({});
          else reject(new Error('Upload failed'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });
  },

  async me() {
    if (!this.token()) return null;
    try {
      const data = await this.get('/auth/me');
      if (data && data.user) {
        data.user.quota = data.quota || null;
        try { localStorage.setItem('ph_user', JSON.stringify(data.user)); } catch (_) {}
        return data.user;
      }
      return null;
    } catch (err) {
      if (err && err.status === 401) {
        this.setToken(null);
        return null;
      }
      // Keep session intact if temporary backend reboot or network delay
      try {
        const cached = localStorage.getItem('ph_user');
        if (cached) return JSON.parse(cached);
      } catch (_) {}
      return null;
    }
  },

  async getQuota() {
    if (!this.token()) return null;
    try {
      const data = await this.get('/auth/quota');
      return data ? data.quota : null;
    } catch { return null; }
  }
};

function toast(msg, isError) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('err', !!isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}
