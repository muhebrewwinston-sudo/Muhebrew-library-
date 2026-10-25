const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

(async () => {
  const u = await API.me();
  if (!u) return location.replace('/auth.html');
  if (!['teacher', 'admin'].includes(u.role)) {
    return location.replace('/');
  }
  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const signOut = $('signOutBtn');
  if (signOut) {
    signOut.onclick = () => {
      if (confirm('Sign out?')) {
        API.setToken(null);
        location.replace('/auth.html');
      }
    };
  }

  const themeBtn = $('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
      localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
    });
  }

  loadMine();
})();

async function loadMine() {
  const { items } = await API.get('/search/my-uploads');
  $('mine').innerHTML = items.length
    ? '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table><thead><tr><th>Title</th><th>Type</th><th>Status</th></tr></thead><tbody>' +
      items.map((i) => '<tr><td>' + esc(i.title) + '</td><td>' + i.t + '</td><td><span class="tag ' + (i.status === 'approved' ? 'ok' : 'wait') + '">' + esc(i.status) + '</span></td></tr>').join('') + '</tbody></table></div>'
    : '<p style="color:var(--muted)">Nothing uploaded yet.</p>';
}

$('type').onchange = () => {
  const b = $('type').value === 'books';
  $('yw').hidden = b; $('bw').hidden = b; $('aw').hidden = !b; $('pw').hidden = !b;
};

$('f').onsubmit = async (e) => {
  e.preventDefault(); $('go').disabled = true;
  try {
    const fd = new FormData();
    const m = { title: 'title', subject: 'subject', level: 'level', year: 'year', exam_board: 'board', author: 'author', publisher: 'publisher', description: 'desc' };
    for (const k in m) if ($(m[k]).value) fd.append(k, $(m[k]).value);
    fd.append('file', $('file').files[0]);
    if ($('cover').files[0]) fd.append('cover', $('cover').files[0]);
    await API.upload('/' + $('type').value, fd);
    toast('Submitted. Waiting for admin review.');
    e.target.reset(); loadMine();
  } catch (err) { toast(err.message, true); }
  finally { $('go').disabled = false; }
};
