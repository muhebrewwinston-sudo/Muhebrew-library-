const $ = (id) => document.getElementById(id);
const grid = $('grid'), empty = $('empty'), countEl = $('count');
let type = 'papers', user = null;
const savedSet = new Set();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = [['math', '➗'], ['english', '📖'], ['chichewa', '🗣️'], ['physic', '⚛️'], ['chem', '🧪'], ['bio', '🧬'], ['agri', '🌱'],
  ['geo', '🌍'], ['history', '🏛️'], ['bible', '✝️'], ['social', '🤝'], ['computer', '💻'], ['business', '💼'], ['account', '🧾'],
  ['home', '🍳'], ['french', '🇫🇷'], ['life', '🧭'], ['science', '🔬']];
const icon = (sub) => { const k = String(sub || '').toLowerCase(); const m = ICONS.find((i) => k.includes(i[0])); return m ? m[1] : '📚'; };
const params = () => new URLSearchParams({ q: $('q').value.trim(), level: $('level').value, subject: $('subject').value, year: $('year').value, sort: $('sort').value, limit: '24' });

async function loadFacets() {
  try {
    const [p, b] = await Promise.all([API.get('/papers/facets'), API.get('/books/facets')]);
    const fill = (el, values) => { el.innerHTML = el.firstElementChild.outerHTML + values.map((v) => '<option>' + esc(v) + '</option>').join(''); };
    fill($('subject'), [...new Set([...p.subjects, ...b.subjects])].sort());
    fill($('level'), [...new Set([...p.levels, ...b.levels])].sort());
    fill($('year'), p.years);
  } catch (e) { /* filters stay empty */ }
}

function card(item) {
  const kind = item._type || (type === 'books' ? 'book' : 'paper');
  const isPaper = kind === 'paper';
  const coll = isPaper ? 'papers' : 'books';
  const key = kind + ':' + item.id, ref = coll + ':' + item.id;
  const art = !isPaper && item.cover_path ? '<img src="/' + esc(item.cover_path) + '" alt="" loading="lazy">' : icon(item.subject);
  return '<article class="card"><div class="card-top"><span class="ico">' + art + '</span><h3>' + esc(item.title) + '</h3></div><div class="tags">' +
    '<span class="tag subject">' + esc(item.subject) + '</span><span class="tag">' + esc(item.level) + '</span>' +
    (isPaper && item.year ? '<span class="tag">' + item.year + '</span>' : '') +
    (isPaper && item.exam_board ? '<span class="tag">' + esc(item.exam_board) + '</span>' : '') +
    (!isPaper && item.author ? '<span class="tag">' + esc(item.author) + '</span>' : '') +
    '</div><div class="card-foot"><span class="dlcount">' + item.downloads.toLocaleString() + ' downloads</span><span class="acts">' +
    '<button class="btn sm" data-save="' + key + '">' + (savedSet.has(key) ? 'Saved' : 'Save') + '</button>' +
    '<button class="btn sm" data-pv="' + ref + '">Preview</button>' +
    '<button class="btn sm" data-rp="' + ref + '" title="Report broken file">⚠</button>' +
    '<button class="btn sm primary" data-dl="' + ref + '">Download</button></span></div></article>';
}

async function load() {
  empty.hidden = true;
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
  try {
    if (type === 'saved') {
      if (!user) { grid.innerHTML = ''; empty.hidden = false; empty.innerHTML = 'Sign in to see your saved resources. <a href="/auth.html">Sign in</a>'; countEl.textContent = ''; return; }
      const { items } = await API.get('/search/mine');
      countEl.textContent = items.length + ' saved';
      if (!items.length) { grid.innerHTML = ''; empty.hidden = false; empty.textContent = 'Nothing saved yet.'; return; }
      grid.innerHTML = items.map(card).join('');
      return;
    }
    empty.textContent = 'Nothing matched. Try clearing a filter.';
    const { items, total } = await API.get('/' + type + '?' + params());
    countEl.textContent = total + ' resource' + (total === 1 ? '' : 's');
    if (!items.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    grid.innerHTML = items.map(card).join('');
  } catch (e) { toast(e.message, true); grid.innerHTML = ''; }
}

grid.addEventListener('click', async (e) => {
  const saveBtn = e.target.closest('[data-save]');
  const dlBtn = e.target.closest('[data-dl]');
  try {
    if (saveBtn) {
      if (!user) return location.replace('/auth.html');
      const [kind, id] = saveBtn.dataset.save.split(':');
      const r = await API.post('/' + (kind === 'paper' ? 'papers' : 'books') + '/' + id + '/bookmark');
      r.saved ? savedSet.add(saveBtn.dataset.save) : savedSet.delete(saveBtn.dataset.save);
      saveBtn.textContent = r.saved ? 'Saved' : 'Save';
      toast(r.saved ? 'Saved to your list' : 'Removed from your list');
    }
    if (dlBtn) {
      const [coll, id] = dlBtn.dataset.dl.split(':');
      window.location.href = '/api/' + coll + '/' + id + '/download';
      toast('Download starting...');
    }
  } catch (err) { toast(err.message, true); }
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  type = t.dataset.type;
  load();
}));

let dt;
['q', 'level', 'subject', 'year', 'sort'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(load, 280); }));

$('themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
});

(async function init() {
  user = await API.me();
  if (!user) {
    location.replace('/auth.html');
    return;
  }
  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const a = $('authLink');
  a.textContent = (user.name || 'Account').split(' ')[0];
  a.href = '#';
  a.title = 'Click to sign out';
  a.onclick = (e) => {
    e.preventDefault();
    if (confirm('Sign out?')) {
      API.setToken(null);
      location.replace('/auth.html');
    }
  };
  if (user.role === 'admin') $('adminLink').hidden = false;
  if (user.role === 'admin' || user.role === 'teacher') $('uploadLink').hidden = false;
  try {
    const m = await API.get('/search/mine');
    m.items.forEach((i) => savedSet.add(i._type + ':' + i.id));
  } catch (e) { /* ignore */ }

  try {
    const s = await API.get('/search/stats');
    $('statPapers').textContent = s.papers;
    $('statBooks').textContent = s.books;
    $('statDl').textContent = s.downloads.toLocaleString();
  } catch (e) { /* ignore */ }
  await loadFacets();
  await load();
})();
