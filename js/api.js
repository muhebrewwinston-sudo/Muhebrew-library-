const BACKEND_URL = 'http://195.123.189.186:25692';

const API = {
  get base() {
    const meta = document.querySelector('meta[name="api-base"]');
    const custom = (window.API_BASE_URL || (meta && meta.content) || localStorage.getItem('ph_api_base') || '').replace(/\/$/, '');
    if (custom) return custom + '/api';

    // If running from file:// or a local static dev server on different port without reverse proxy:
    if (typeof window !== 'undefined' && window.location) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isSamePort = window.location.port === '25692';
      if (window.location.protocol === 'file:' || (isLocalhost && !isSamePort && !window.location.port)) {
        return BACKEND_URL + '/api';
      }
    }

    // Default to '/api' which works natively and proxies through Vercel rewrites to 195.123.189.186:25692
    return '/api';
  },

  token: () => localStorage.getItem('ph_token'),
  setToken(t) { t ? localStorage.setItem('ph_token', t) : localStorage.removeItem('ph_token'); },

  async req(path, { method = 'GET', body, json = true } = {}) {
    const headers = {};
    if (json && body) headers['Content-Type'] = 'application/json';
    const t = this.token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(this.base + path, { method, headers, body: json && body ? JSON.stringify(body) : body });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Error ' + res.status), { status: res.status });
    return data;
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
        return data.user;
      }
      return null;
    }
    catch { this.setToken(null); return null; }
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
