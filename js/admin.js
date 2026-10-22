const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tbl = (head, rows) => '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';

let progressionData = { signups: [], downloads: [], uploads: [] };
let activeProgTab = 'dl';

function isAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const email = (user.email || '').toLowerCase().trim();
  const adminEmails = ['muhebrewwinston@gmail.com', 'admin@muhebrew.com', 'admin@library.mw'];
  if (adminEmails.includes(email) || email.startsWith('admin@')) return true;
  return false;
}

(async function guard() {
  const user = await API.me();
  if (!user) return location.replace('/auth.html');
  if (!isAdmin(user)) return location.replace('/');
  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const ownerBadge = $('ownerBadge');
  if (ownerBadge) {
    ownerBadge.textContent = (user.email || 'muhebrewwinston@gmail.com') + ' (Owner)';
  }

  $('adminSignOutBtn')?.addEventListener('click', () => {
    if (confirm('Sign out from owner dashboard?')) {
      API.setToken(null);
      location.replace('/auth.html');
    }
  });

  loadStats();
  loadReports();
  loadProgression();
  loadPending();
  loadUsers();
})();

const themeBtn = $('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
  });
}

// ============ SECTION 1: Statistics & Most Favorite Books ============
async function loadStats() {
  try {
    const s = await API.get('/admin/stats');
    $('sUsers').textContent = s.users.toLocaleString();
    $('sDl').textContent = s.downloads.toLocaleString();
    $('sPapers').textContent = s.papers.toLocaleString();
    $('sBooks').textContent = s.books.toLocaleString();
    $('s7').textContent = s.last7.toLocaleString() + ' downloads';

    if (s.drime && $('drimeCloudCount')) {
      $('drimeCloudCount').innerHTML = `☁️ <b>${s.drime.totalCloudFiles} files</b> backed up on Drime Cloud (Folder ID: <code>${esc(s.drime.folderId)}</code>)`;
    }

    // Render Most Favorite Textbooks (Mostly Downloaded)
    const fbList = $('favoriteBooksList');
    if (fbList && s.favoriteBooks) {
      if (!s.favoriteBooks.length) {
        fbList.innerHTML = '<p style="color:var(--muted);font-size:13px">No textbooks downloaded yet.</p>';
      } else {
        fbList.innerHTML = s.favoriteBooks.map((b, idx) => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
            <span style="font-weight:800;color:var(--primary);font-size:14px;width:20px;text-align:center">#${idx + 1}</span>
            <div style="width:36px;height:44px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--border);flex-shrink:0;display:grid;place-items:center">
              ${b.cover_path ? `<img src="/${esc(b.cover_path)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '📖'}
            </div>
            <div style="flex:1;min-width:0">
              <b style="font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</b>
              <span style="font-size:11.5px;color:var(--muted)">${esc(b.subject)} · ${esc(b.level)}</span>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${b.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px">☁️ Drime</span>' : ''}
              <span class="tag ok" style="font-size:11.5px;font-weight:700">🔥 ${b.downloads.toLocaleString()} dl</span>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Most Favorite Past Papers
    const fpList = $('favoritePapersList');
    if (fpList && s.favoritePapers) {
      if (!s.favoritePapers.length) {
        fpList.innerHTML = '<p style="color:var(--muted);font-size:13px">No papers downloaded yet.</p>';
      } else {
        fpList.innerHTML = s.favoritePapers.map((p, idx) => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
            <span style="font-weight:800;color:var(--primary);font-size:14px;width:20px;text-align:center">#${idx + 1}</span>
            <span style="font-size:22px;flex-shrink:0">📜</span>
            <div style="flex:1;min-width:0">
              <b style="font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</b>
              <span style="font-size:11.5px;color:var(--muted)">${esc(p.subject)} · ${esc(p.level)} · ${esc(p.category || p.exam_board || '')}</span>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${p.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px">☁️ Drime</span>' : ''}
              <span class="tag ok" style="font-size:11.5px;font-weight:700">🔥 ${p.downloads.toLocaleString()} dl</span>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ============ SECTION 2: Issues Faced by Users ============
async function loadReports() {
  try {
    const { items } = await API.get('/admin/reports');
    const badge = $('issuesCountBadge');
    const openCount = items.filter((i) => !i.resolved).length;
    if (badge) {
      badge.textContent = openCount + ' Open Issue' + (openCount === 1 ? '' : 's');
      badge.className = openCount > 0 ? 'tag wait' : 'tag ok';
    }

    const reportsDiv = $('reports');
    if (!items.length) {
      reportsDiv.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">No issues reported by users yet. System running smoothly!</p>';
      return;
    }

    reportsDiv.innerHTML = items.map((r) => `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;${r.resolved ? 'opacity:0.65' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span class="tag ${r.resolved ? 'ok' : 'wait'}" style="font-size:10px;font-weight:700">
              ${r.resolved ? 'RESOLVED' : 'OPEN ISSUE'}
            </span>
            <span class="tag" style="font-size:10px">${esc(r.t.toUpperCase())}</span>
          </div>
          <span style="font-size:11px;color:var(--muted)">${new Date(r.created_at + 'Z').toLocaleString()}</span>
        </div>
        <div style="margin:8px 0 6px">
          <b style="font-size:13.5px;color:var(--text)">${esc(r.reason)}</b>
          ${r.details ? `<p style="margin:4px 0 0;font-size:12.5px;color:var(--muted);line-height:1.4">${esc(r.details)}</p>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:6px">
          <span>Reported by: <b style="color:var(--text)">${esc(r.reporter)}</b></span>
          <div style="display:flex;gap:6px">
            ${!r.resolved ? `<button class="btn sm primary" data-rs="${r.id}" style="padding:3px 8px;min-height:26px;font-size:11.5px">Mark Resolved</button>` : ''}
            ${r.item_id ? `<button class="btn sm danger" data-rdel="${r.t}:${r.item_id}:${r.id}" style="padding:3px 8px;min-height:26px;font-size:11.5px">Delete File</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Reports error:', err);
  }
}

// ============ SECTION 3: Live Progression Happening on the Web ============
async function loadProgression() {
  try {
    progressionData = await API.get('/admin/progression');
    renderProgression();
  } catch (err) {
    console.error('Progression error:', err);
  }
}

function renderProgression() {
  const container = $('progressionContent');
  if (!container) return;

  if (activeProgTab === 'dl') {
    const list = progressionData.downloads || [];
    container.innerHTML = list.length ? list.map((d) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12.5px">
        <div style="flex:1;min-width:0">
          <span style="font-weight:700;color:var(--primary)">⚡ Downloaded:</span>
          <b>${esc(d.item_title)}</b>
          <div style="font-size:11px;color:var(--muted)">By ${esc(d.user_name || d.user_email || 'Student')}</div>
        </div>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap">${new Date(d.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('') : '<p style="color:var(--muted);font-size:13px">No downloads recorded yet.</p>';
  } else if (activeProgTab === 'users') {
    const list = progressionData.signups || [];
    container.innerHTML = list.length ? list.map((u) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12.5px">
        <div>
          <b>${esc(u.name)}</b> <span class="tag" style="font-size:10px">${esc(u.role)}</span>
          <div style="font-size:11px;color:var(--muted)">${esc(u.email)} ${u.school ? '· ' + esc(u.school) : ''}</div>
        </div>
        <span style="font-size:11px;color:var(--muted)">${new Date(u.created_at + 'Z').toLocaleDateString()}</span>
      </div>
    `).join('') : '<p style="color:var(--muted);font-size:13px">No recent signups.</p>';
  } else {
    const list = progressionData.uploads || [];
    container.innerHTML = list.length ? list.map((up) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12.5px">
        <div>
          <b>${esc(up.title)}</b> <span class="tag ok" style="font-size:10px">${esc(up.t)}</span>
          ${up.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px">☁️ Drime Cloud</span>' : ''}
          <div style="font-size:11px;color:var(--muted)">${esc(up.subject)} · ${esc(up.level)}</div>
        </div>
        <span style="font-size:11px;color:var(--muted)">${new Date(up.created_at + 'Z').toLocaleDateString()}</span>
      </div>
    `).join('') : '<p style="color:var(--muted);font-size:13px">No recent uploads.</p>';
  }
}

$('progTabDl')?.addEventListener('click', () => {
  activeProgTab = 'dl';
  $('progTabDl').className = 'btn sm primary';
  $('progTabUsers').className = 'btn sm';
  $('progTabUploads').className = 'btn sm';
  renderProgression();
});

$('progTabUsers')?.addEventListener('click', () => {
  activeProgTab = 'users';
  $('progTabDl').className = 'btn sm';
  $('progTabUsers').className = 'btn sm primary';
  $('progTabUploads').className = 'btn sm';
  renderProgression();
});

$('progTabUploads')?.addEventListener('click', () => {
  activeProgTab = 'uploads';
  $('progTabDl').className = 'btn sm';
  $('progTabUsers').className = 'btn sm';
  $('progTabUploads').className = 'btn sm primary';
  renderProgression();
});

// ============ SECTION 4: Teacher Uploads Review & Users ============
async function loadPending() {
  const { items } = await API.get('/admin/pending');
  $('pending').innerHTML = items.length
    ? tbl(['Title', 'Type', 'By', ''], items.map((r) => '<tr><td>' + esc(r.title) + '<br><small style="color:var(--muted)">' + esc(r.subject) + ' · ' + esc(r.level) + '</small></td><td>' +
        (r.t === 'papers' ? 'Paper' : 'Book') + '</td><td>' + esc(r.uploader || '-') + '</td><td style="white-space:nowrap">' +
        '<a class="btn sm" target="_blank" rel="noopener" href="' + API.base + '/' + r.t + '/' + r.id + '/preview?t=' + encodeURIComponent(API.token()) + '">Preview</a> ' +
        '<button class="btn sm primary" data-rv="approve:' + r.t + ':' + r.id + '">Approve</button> ' +
        '<button class="btn sm danger" data-rv="reject:' + r.t + ':' + r.id + '">Reject</button></td></tr>'))
    : '<p style="color:var(--muted);font-size:13px">Nothing waiting for review.</p>';
}

async function loadUsers() {
  const { users } = await API.get('/admin/users');
  document.querySelector('#usersTable tbody').innerHTML = users.map((u) =>
    '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td><select data-role="' + u.id + '">' +
    ['student', 'teacher', 'admin'].map((r) => '<option ' + (r === u.role ? 'selected' : '') + '>' + r + '</option>').join('') +
    '</select></td><td>' + esc(u.school || '-') + '</td><td>' + new Date(u.created_at + 'Z').toLocaleDateString() + '</td></tr>').join('');
}

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-role]');
  if (!sel) return;
  try {
    await API.patch('/admin/users/' + sel.dataset.role + '/role', { role: sel.value });
    toast('Role updated successfully');
  } catch (err) {
    toast(err.message, true);
    loadUsers();
  }
});

$('grantTeacherForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('grantEmail').value.trim().toLowerCase();
  const role = $('grantRole').value;
  try {
    const res = await API.post('/admin/grant-role', { email, role });
    toast(res.message || 'Role updated');
    $('grantEmail').value = '';
    loadUsers();
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener('click', async (e) => {
  try {
    const rv = e.target.closest('[data-rv]');
    if (rv) {
      const [action, t, id] = rv.dataset.rv.split(':');
      if (action === 'reject' && !confirm('Reject and delete this upload?')) return;
      await API.post('/admin/review/' + t + '/' + id, { action });
      toast(action === 'approve' ? 'Approved' : 'Rejected');
      loadPending(); loadStats(); loadProgression();
    }
    const rs = e.target.closest('[data-rs]');
    if (rs) {
      await API.post('/admin/reports/' + rs.dataset.rs + '/resolve');
      toast('Issue marked as resolved');
      loadReports();
    }
    const rd = e.target.closest('[data-rdel]');
    if (rd) {
      const [t, id, rid] = rd.dataset.rdel.split(':');
      if (!confirm('Delete this file from the site?')) return;
      await API.del('/' + t + '/' + id);
      await API.post('/admin/reports/' + rid + '/resolve');
      toast('File deleted and report resolved');
      loadReports(); loadStats(); loadProgression();
    }
  } catch (err) { toast(err.message, true); }
});

// ============ SECTION 5: THE LAST BAR - UPLOAD RESOURCES ============
$('uType')?.addEventListener('change', () => {
  const val = $('uType').value;
  const isBook = val === 'books';
  $('yearWrap').hidden = isBook;
  $('boardWrap').hidden = isBook;
  $('authorWrap').hidden = !isBook;
  $('publisherWrap').hidden = !isBook;

  if (val === 'papers-notes') {
    $('uCategory').value = 'Notes';
  } else if (val === 'papers-keys') {
    $('uCategory').value = 'Marking Key';
  } else if (val === 'books') {
    $('uCategory').value = 'MSCE';
  } else {
    $('uCategory').value = 'MANEB';
  }
});

$('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('uSubmit');
  btn.disabled = true;
  btn.textContent = 'Syncing to Drime Cloud & Publishing...';

  try {
    const fd = new FormData();
    const rawType = $('uType').value;
    const isBook = rawType === 'books';
    const endpoint = isBook ? '/books' : '/papers';

    fd.append('title', $('uTitle').value.trim());
    fd.append('subject', $('uSubject').value.trim());
    fd.append('level', $('uLevel').value);
    fd.append('category', $('uCategory').value);
    fd.append('storage', 'drime');

    const drimeLink = $('uDrimeLink') ? $('uDrimeLink').value.trim() : '';
    if (drimeLink) fd.append('drime_link', drimeLink);

    if ($('uDesc').value.trim()) fd.append('description', $('uDesc').value.trim());

    if (!isBook) {
      if ($('uYear').value) fd.append('year', $('uYear').value);
      if ($('uBoard').value.trim()) fd.append('exam_board', $('uBoard').value.trim());
    } else {
      if ($('uAuthor').value.trim()) fd.append('author', $('uAuthor').value.trim());
      if ($('uPublisher').value.trim()) fd.append('publisher', $('uPublisher').value.trim());
      if ($('uCover').files[0]) fd.append('cover', $('uCover').files[0]);
    }

    if ($('uFile').files[0]) {
      fd.append('file', $('uFile').files[0]);
    } else {
      throw new Error('Please select a file to upload.');
    }

    const res = await API.upload(endpoint, fd);
    toast(res.message || 'Resource published and synced to Drime Cloud Storage!');
    $('uploadForm').reset();
    loadStats();
    loadProgression();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish Resource to Library (Syncs to Drime Cloud)';
  }
});
