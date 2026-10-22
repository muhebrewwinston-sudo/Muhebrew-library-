const API = {
  base: '/api',
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

  async me() {
    if (!this.token()) return null;
    try { return (await this.get('/auth/me')).user; }
    catch { this.setToken(null); return null; }
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
