const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tbl = (head, rows) => '<div style="overflow-x:auto"><table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';

(async function guard() {
  const user = await API.me();
  if (!user) return (location.href = '/auth.html');
  if (user.role !== 'admin') { document.body.innerHTML = '<p style="padding:40px">Admin access required. <a href="/">Go back</a></p>'; return; }
  $('who').textContent = user.name;
  loadStats(); loadRecent(); loadUsers(); loadPending(); loadReports();
})();

async function loadStats() {
  const s = await API.get('/admin/stats');
  $('sUsers').textContent = s.users;
  $('sPapers').textContent = s.papers;
  $('sBooks').textContent = s.books;
  $('sDl').textContent = s.downloads.toLocaleString();
  $('s7').textContent = s.last7.toLocaleString();
}

async function loadRecent() {
  const [p, b] = await Promise.all([API.get('/papers?limit=5'), API.get('/books?limit=5')]);
  const rows = [...p.items.map((i) => ({ ...i, t: 'papers' })), ...b.items.map((i) => ({ ...i, t: 'books' }))]
    .sort((a, c) => (c.created_at > a.created_at ? 1 : -1)).slice(0, 8);
  $('recent').innerHTML = rows.length
    ? tbl(['Title', 'Type', 'Downloads', ''], rows.map((r) => '<tr><td>' + esc(r.title) + '</td><td>' + (r.t === 'papers' ? 'Paper' : 'Book') + '</td><td>' + r.downloads +
        '</td><td><button class="btn sm danger" data-del="' + r.t + ':' + r.id + '">Delete</button></td></tr>'))
    : '<p style="color:var(--muted)">No uploads yet.</p>';
}

async function loadUsers() {
  const { users } = await API.get('/admin/users');
  document.querySelector('#usersTable tbody').innerHTML = users.map((u) =>
    '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td><select data-role="' + u.id + '">' +
    ['student', 'teacher', 'admin'].map((r) => '<option ' + (r === u.role ? 'selected' : '') + '>' + r + '</option>').join('') +
    '</select></td><td>' + esc(u.school || '-') + '</td><td>' + new Date(u.created_at + 'Z').toLocaleDateString() + '</td></tr>').join('');
}

async function loadPending() {
  const { items } = await API.get('/admin/pending');
  $('pending').innerHTML = items.length
    ? tbl(['Title', 'Type', 'By', ''], items.map((r) => '<tr><td>' + esc(r.title) + '<br><small style="color:var(--muted)">' + esc(r.subject) + ' · ' + esc(r.level) + '</small></td><td>' +
        (r.t === 'papers' ? 'Paper' : 'Book') + '</td><td>' + esc(r.uploader || '-') + '</td><td style="white-space:nowrap">' +
        '<a class="btn sm" target="_blank" rel="noopener" href="/api/' + r.t + '/' + r.id + '/preview?t=' + encodeURIComponent(API.token()) + '">Preview</a> ' +
        '<button class="btn sm primary" data-rv="approve:' + r.t + ':' + r.id + '">Approve</button> ' +
        '<button class="btn sm danger" data-rv="reject:' + r.t + ':' + r.id + '">Reject</button></td></tr>'))
    : '<p style="color:var(--muted)">Nothing waiting for review.</p>';
}

async function loadReports() {
  const { items } = await API.get('/admin/reports');
  $('reports').innerHTML = items.length
    ? tbl(['File', 'Reason', 'By', ''], items.map((r) => '<tr><td>' + esc(r.title) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.reporter || 'Guest') + '</td><td style="white-space:nowrap">' +
        '<button class="btn sm" data-rs="' + r.id + '">Resolve</button> ' +
        '<button class="btn sm danger" data-rdel="' + r.t + ':' + r.item_id + ':' + r.id + '">Delete file</button></td></tr>'))
    : '<p style="color:var(--muted)">No open reports.</p>';
}

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-role]');
  if (!sel) return;
  try { await API.patch('/admin/users/' + sel.dataset.role + '/role', { role: sel.value }); toast('Role updated'); }
  catch (err) { toast(err.message, true); loadUsers(); }
});

document.addEventListener('click', async (e) => {
  try {
    const del = e.target.closest('[data-del]');
    if (del) {
      const [t, id] = del.dataset.del.split(':');
      if (!confirm('Delete this resource and its file?')) return;
      await API.del('/' + t + '/' + id);
      toast('Deleted'); loadRecent(); loadStats();
    }
    const rv = e.target.closest('[data-rv]');
    if (rv) {
      const [action, t, id] = rv.dataset.rv.split(':');
      if (action === 'reject' && !confirm('Reject and delete this upload?')) return;
      await API.post('/admin/review/' + t + '/' + id, { action });
      toast(action === 'approve' ? 'Approved' : 'Rejected');
      loadPending(); loadRecent(); loadStats();
    }
    const rs = e.target.closest('[data-rs]');
    if (rs) { await API.post('/admin/reports/' + rs.dataset.rs + '/resolve'); toast('Resolved'); loadReports(); }
    const rd = e.target.closest('[data-rdel]');
    if (rd) {
      const [t, id, rid] = rd.dataset.rdel.split(':');
      if (!confirm('Delete this file from the site?')) return;
      await API.del('/' + t + '/' + id);
      await API.post('/admin/reports/' + rid + '/resolve');
      toast('Deleted'); loadReports(); loadRecent(); loadStats();
    }
  } catch (err) { toast(err.message, true); }
});

$('uType').addEventListener('change', () => {
  const book = $('uType').value === 'books';
  $('yearWrap').hidden = book; $('boardWrap').hidden = book;
  $('authorWrap').hidden = !book; $('publisherWrap').hidden = !book;
});

$('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('uSubmit');
  btn.disabled = true;
  try {
    const fd = new FormData();
    const map = { title: 'uTitle', subject: 'uSubject', level: 'uLevel', year: 'uYear', exam_board: 'uBoard', author: 'uAuthor', publisher: 'uPublisher', description: 'uDesc' };
    for (const k in map) if ($(map[k]).value) fd.append(k, $(map[k]).value);
    fd.append('file', $('uFile').files[0]);
    if ($('uCover').files[0]) fd.append('cover', $('uCover').files[0]);
    await API.upload('/' + $('uType').value, fd);
    toast('Uploaded');
    e.target.reset(); loadRecent(); loadStats();
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; }
});
