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
      $('drimeCloudCount').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> <b>${s.drime.totalCloudFiles} files</b> backed up on Drime Cloud (Folder ID: <code>${esc(s.drime.folderId)}</code>)`;
    }

    // Render Most Favorite Textbooks (Mostly Downloaded)
    const fbList = $('favoriteBooksList');
    if (fbList && s.favoriteBooks) {
      if (!s.favoriteBooks.length) {
        fbList.innerHTML = '<p style="color:var(--muted);font-size:13px">No textbooks uploaded yet.</p>';
      } else {
        fbList.innerHTML = s.favoriteBooks.map((b, idx) => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
            <span style="font-weight:800;color:var(--primary);font-size:14px;width:20px;text-align:center">#${idx + 1}</span>
            <div style="width:36px;height:44px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--border);flex-shrink:0;display:grid;place-items:center">
              ${b.cover_path ? `<img src="/${esc(b.cover_path)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>'}
            </div>
            <div style="flex:1;min-width:0">
              <b style="font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</b>
              <span style="font-size:11.5px;color:var(--muted)">${esc(b.subject)} · ${esc(b.level)}</span>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${b.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime</span>' : ''}
              <span class="tag ok" style="font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${b.downloads.toLocaleString()} dl</span>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Most Favorite Past Papers
    const fpList = $('favoritePapersList');
    if (fpList && s.favoritePapers) {
      if (!s.favoritePapers.length) {
        fpList.innerHTML = '<p style="color:var(--muted);font-size:13px">No papers uploaded yet.</p>';
      } else {
        fpList.innerHTML = s.favoritePapers.map((p, idx) => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
            <span style="font-weight:800;color:var(--primary);font-size:14px;width:20px;text-align:center">#${idx + 1}</span>
            <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:44px;flex-shrink:0;color:var(--primary)">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
            </span>
            <div style="flex:1;min-width:0">
              <b style="font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</b>
              <span style="font-size:11.5px;color:var(--muted)">${esc(p.subject)} · ${esc(p.level)} · ${esc(p.category || p.exam_board || '')}</span>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${p.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime</span>' : ''}
              <span class="tag ok" style="font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${p.downloads.toLocaleString()} dl</span>
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
          <span style="font-weight:700;color:var(--primary);display:inline-flex;align-items:center;gap:3px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Downloaded:
          </span>
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
          ${up.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime Cloud</span>' : ''}
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

// ============ SECTION 5: THE LAST BAR - UPLOAD RESOURCES (BULK & SINGLE) ============

// Tab Switcher between Bulk and Single Mode
$('modeTabBulk')?.addEventListener('click', () => {
  $('modeTabBulk').classList.add('primary');
  $('modeTabSingle')?.classList.remove('primary');
  $('bulkUploadPanel').hidden = false;
  $('uploadForm').hidden = true;
});

$('modeTabSingle')?.addEventListener('click', () => {
  $('modeTabSingle').classList.add('primary');
  $('modeTabBulk')?.classList.remove('primary');
  $('bulkUploadPanel').hidden = true;
  $('uploadForm').hidden = false;
});

// Single file type change
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

// Auto-trace single file when picked in uFile
$('uFile')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const traced = clientAutoTrace(file.name, file.size);
  if ($('uTitle')) $('uTitle').value = traced.title;
  if ($('uSubject')) $('uSubject').value = traced.subject;
  if ($('uLevel')) $('uLevel').value = traced.level;
  if ($('uCategory')) $('uCategory').value = traced.category;
  if ($('uType')) {
    $('uType').value = traced.type;
    $('uType').dispatchEvent(new Event('change'));
  }
  if ($('uYear')) $('uYear').value = traced.year;
  if ($('uBoard')) $('uBoard').value = traced.exam_board;
  toast(`Auto-traced: ${traced.subject} (${traced.level}, ${traced.year})`);
});

// Client-side Auto Trace Engine (mirrors server utils/autotrace.js)
function clientAutoTrace(filename, size = 0) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  const cleanSpacing = nameWithoutExt.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = cleanSpacing.toLowerCase();

  const subjectPatterns = [
    { name: 'Mathematics', regex: /\b(math|maths|mathematics|algebra|geometry)\b/i },
    { name: 'English', regex: /\b(english|grammar|literature)\b/i },
    { name: 'Chichewa', regex: /\b(chichewa|chi chewa)\b/i },
    { name: 'Biology', regex: /\b(biology|bio)\b/i },
    { name: 'Physical Science', regex: /\b(physical science|ps|phys-sci)\b/i },
    { name: 'Physics', regex: /\b(physics)\b/i },
    { name: 'Chemistry', regex: /\b(chemistry|chem)\b/i },
    { name: 'Agriculture', regex: /\b(agriculture|agric)\b/i },
    { name: 'Geography', regex: /\b(geography|geo)\b/i },
    { name: 'History', regex: /\b(history|hist)\b/i },
    { name: 'Social Studies', regex: /\b(social studies|social-studies)\b/i },
    { name: 'Life Skills', regex: /\b(life skills|life-skills)\b/i },
    { name: 'Computer Studies', regex: /\b(computer studies|computer science|ict|computing)\b/i },
    { name: 'Bible Knowledge', regex: /\b(bible knowledge|bk|religious studies|cre)\b/i },
    { name: 'Business Studies', regex: /\b(business studies|business)\b/i },
    { name: 'Commerce', regex: /\b(commerce)\b/i },
    { name: 'Home Economics', regex: /\b(home economics|nutrition)\b/i },
    { name: 'French', regex: /\b(french)\b/i }
  ];

  let detectedSubject = 'General';
  for (const item of subjectPatterns) {
    if (item.regex.test(lower)) {
      detectedSubject = item.name;
      break;
    }
  }

  let detectedLevel = 'Form 4';
  if (/\b(form\s*1|f1|grade\s*9|junior)\b/i.test(lower)) detectedLevel = 'Form 1';
  else if (/\b(form\s*2|f2|grade\s*10|jce)\b/i.test(lower)) detectedLevel = 'Form 2';
  else if (/\b(form\s*3|f3|grade\s*11)\b/i.test(lower)) detectedLevel = 'Form 3';
  else if (/\b(form\s*4|f4|grade\s*12|msce)\b/i.test(lower)) detectedLevel = 'Form 4';

  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  const detectedYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  let detectedType = 'papers';
  let detectedCategory = 'MANEB';
  let examBoard = 'MANEB';

  const isMarkingKey = /\b(marking\s*key|marking\s*scheme|answers|solution|key)\b/i.test(lower);
  const isNotes = /\b(notes|revision|summary|guide|module|pamphlet)\b/i.test(lower);
  const isMock = /\b(mock|cluster|division|zone|district)\b/i.test(lower);
  const isTextbook = /\b(textbook|book|student\s*book|learners?\s*book|teachers?\s*guide)\b/i.test(lower);

  if (isMarkingKey) {
    detectedType = 'papers';
    detectedCategory = 'Marking Key';
  } else if (isNotes) {
    detectedType = 'papers';
    detectedCategory = 'Notes';
  } else if (isMock) {
    detectedType = 'papers';
    detectedCategory = 'Mock';
    examBoard = 'Cluster Mock';
  } else if (isTextbook) {
    detectedType = 'books';
    detectedCategory = (detectedLevel === 'Form 1' || detectedLevel === 'Form 2') ? 'JCE' : 'MSCE';
  } else if (/\bjce\b/i.test(lower)) {
    detectedCategory = 'JCE';
  } else if (/\bmsce\b/i.test(lower)) {
    detectedCategory = 'MSCE';
  }

  let title = cleanSpacing;
  const paperMatch = cleanSpacing.match(/\bpaper\s*([1-3]|i{1,3})\b/i);
  const paperStr = paperMatch ? ` Paper ${paperMatch[1].toUpperCase()}` : '';

  if (detectedCategory === 'Marking Key') {
    title = `${detectedCategory} - ${detectedSubject}${paperStr} (${detectedLevel} ${detectedYear})`;
  } else if (detectedCategory === 'Notes') {
    title = `${detectedSubject} Study Revision Notes (${detectedLevel})`;
  } else if (detectedType === 'books') {
    title = `${detectedSubject} ${detectedLevel} Textbook`;
  } else {
    const prefix = isMock ? 'Cluster Mock' : 'MANEB';
    title = `${prefix} ${detectedSubject}${paperStr} ${detectedYear} (${detectedLevel})`;
  }

  return {
    rawName: filename,
    fileSize: size,
    type: detectedType,
    title,
    subject: detectedSubject,
    level: detectedLevel,
    category: detectedCategory,
    year: detectedYear,
    exam_board: examBoard,
    author: detectedType === 'books' ? 'Ministry of Education' : ''
  };
}

// Bulk Queue State & Functions
let bulkQueue = [];

window.updateBulkItem = function(idx, field, val) {
  if (bulkQueue[idx]) {
    bulkQueue[idx][field] = val;
    if (field === 'category') {
      if (val === 'MSCE' || val === 'JCE') bulkQueue[idx].type = 'books';
      else bulkQueue[idx].type = 'papers';
      const typeSelect = $(`bType_${idx}`);
      if (typeSelect) typeSelect.value = bulkQueue[idx].type;
    }
  }
};

window.removeBulkItem = function(idx) {
  bulkQueue.splice(idx, 1);
  renderBulkQueue();
  if (bulkQueue.length === 0) {
    $('bulkProgressWrapper').hidden = true;
  }
};

function renderBulkQueue() {
  const container = $('bulkQueueContainer');
  const list = $('bulkItemsList');
  const countEl = $('bulkQueueCount');

  if (!container || !list) return;

  if (bulkQueue.length === 0) {
    container.hidden = true;
    list.innerHTML = '';
    return;
  }

  container.hidden = false;
  if (countEl) countEl.textContent = bulkQueue.length;

  const subjectsList = [
    'Mathematics', 'English', 'Chichewa', 'Biology', 'Physical Science',
    'Physics', 'Chemistry', 'Agriculture', 'Geography', 'History',
    'Social Studies', 'Life Skills', 'Computer Studies', 'Bible Knowledge',
    'Business Studies', 'Commerce', 'Home Economics', 'French', 'General'
  ];

  list.innerHTML = bulkQueue.map((item, idx) => {
    const isSuccess = item.status === 'success';
    const isUploading = item.status === 'uploading';
    const isError = item.status === 'error';
    const cardClass = isSuccess ? 'bulk-item-card is-success' : isUploading ? 'bulk-item-card is-uploading' : isError ? 'bulk-item-card is-error' : 'bulk-item-card';

    return `
      <div class="${cardClass}" id="bulkCard_${idx}">
        <div class="bulk-item-head">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="tag" style="background:var(--surface-2);color:var(--text);font-weight:700">#${idx + 1}</span>
            <span style="font-size:12.5px;color:var(--text);font-weight:600;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(item.rawName)}">
              ${esc(item.rawName)}
            </span>
            <span class="tag size" style="font-size:10px">${item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(1) + ' MB' : 'PDF'}</span>
          </div>

          <div style="display:flex;align-items:center;gap:8px">
            ${isSuccess ? '<span class="tag ok" style="font-size:11px;font-weight:700">✓ Published &amp; Live</span>' :
              isUploading ? '<span class="tag info" style="font-size:11px">Uploading to Drime...</span>' :
              isError ? `<span class="tag danger" style="font-size:11px">${esc(item.error || 'Failed')}</span>` :
              '<span class="tag" style="font-size:11px">Auto-Traced</span>'}
            ${!isSuccess ? `<button type="button" class="btn sm danger" onclick="removeBulkItem(${idx})" title="Remove item" style="padding:3px 8px;font-size:11px">✕</button>` : ''}
          </div>
        </div>

        <div class="bulk-item-fields">
          <div class="bulk-item-field">
            <label>Title</label>
            <input type="text" id="bTitle_${idx}" value="${esc(item.title)}" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'title', this.value)">
          </div>

          <div class="bulk-item-field">
            <label>Subject</label>
            <select id="bSubject_${idx}" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'subject', this.value)">
              ${subjectsList.map(s => `<option value="${s}" ${s.toLowerCase() === (item.subject || '').toLowerCase() ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>

          <div class="bulk-item-field">
            <label>Class Level</label>
            <select id="bLevel_${idx}" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'level', this.value)">
              <option value="Form 1" ${item.level === 'Form 1' ? 'selected' : ''}>Form 1</option>
              <option value="Form 2" ${item.level === 'Form 2' ? 'selected' : ''}>Form 2</option>
              <option value="Form 3" ${item.level === 'Form 3' ? 'selected' : ''}>Form 3</option>
              <option value="Form 4" ${item.level === 'Form 4' ? 'selected' : ''}>Form 4</option>
            </select>
          </div>

          <div class="bulk-item-field">
            <label>Category</label>
            <select id="bCategory_${idx}" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'category', this.value)">
              <option value="MANEB" ${item.category === 'MANEB' ? 'selected' : ''}>MANEB</option>
              <option value="Mock" ${item.category === 'Mock' ? 'selected' : ''}>Mock Exam</option>
              <option value="Marking Key" ${item.category === 'Marking Key' ? 'selected' : ''}>Marking Key</option>
              <option value="Notes" ${item.category === 'Notes' ? 'selected' : ''}>Study Notes</option>
              <option value="MSCE" ${item.category === 'MSCE' ? 'selected' : ''}>MSCE Book</option>
              <option value="JCE" ${item.category === 'JCE' ? 'selected' : ''}>JCE Book</option>
            </select>
          </div>

          <div class="bulk-item-field">
            <label>Year</label>
            <input type="number" id="bYear_${idx}" value="${item.year || 2024}" min="1990" max="2100" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'year', this.value)">
          </div>

          <div class="bulk-item-field">
            <label>Type</label>
            <select id="bType_${idx}" ${isSuccess ? 'disabled' : ''} onchange="updateBulkItem(${idx}, 'type', this.value)">
              <option value="papers" ${item.type === 'papers' ? 'selected' : ''}>Past Paper</option>
              <option value="books" ${item.type === 'books' ? 'selected' : ''}>Textbook</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addFilesToQueue(fileList) {
  if (!fileList || !fileList.length) return;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const traced = clientAutoTrace(file.name, file.size);
    bulkQueue.push({
      file,
      rawName: file.name,
      fileSize: file.size,
      title: traced.title,
      subject: traced.subject,
      level: traced.level,
      category: traced.category,
      year: traced.year,
      exam_board: traced.exam_board,
      author: traced.author,
      type: traced.type,
      status: 'ready',
      error: null
    });
  }
  renderBulkQueue();
  toast(`Auto-traced and added ${fileList.length} files to queue!`);
}

async function executeBulkUpload() {
  // Sync live inputs
  bulkQueue.forEach((item, idx) => {
    const t = $(`bTitle_${idx}`);
    if (t) item.title = t.value.trim();
    const s = $(`bSubject_${idx}`);
    if (s) item.subject = s.value;
    const l = $(`bLevel_${idx}`);
    if (l) item.level = l.value;
    const c = $(`bCategory_${idx}`);
    if (c) item.category = c.value;
    const y = $(`bYear_${idx}`);
    if (y) item.year = parseInt(y.value, 10) || 2024;
    const ty = $(`bType_${idx}`);
    if (ty) item.type = ty.value;
  });

  const pending = bulkQueue.filter(item => item.status !== 'success');
  if (pending.length === 0) {
    return toast('All items in queue have already been published!');
  }

  const btn = $('bulkUploadAllBtn');
  const btnText = $('bulkUploadBtnText');
  const progressWrap = $('bulkProgressWrapper');
  const progressBar = $('bulkProgressBar');
  const progressPercent = $('bulkProgressPercent');
  const progressTitle = $('bulkProgressTitle');
  const progressSub = $('bulkProgressSub');

  if (btn) btn.disabled = true;
  if (progressWrap) progressWrap.hidden = false;

  let uploadedCount = 0;
  const totalToUpload = pending.length;

  for (let i = 0; i < bulkQueue.length; i++) {
    const item = bulkQueue[i];
    if (item.status === 'success') continue;

    item.status = 'uploading';
    renderBulkQueue();

    if (progressTitle) {
      progressTitle.textContent = `Publishing ${uploadedCount + 1} of ${totalToUpload}: "${item.title}"...`;
    }
    if (progressSub) {
      progressSub.textContent = `Syncing "${item.rawName}" to Drime Cloud Storage (OymudINAwCDhPbnTH5Gt4oAIxo5mbC)...`;
    }

    try {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('title', item.title);
      fd.append('subject', item.subject);
      fd.append('level', item.level);
      fd.append('category', item.category);
      fd.append('type', item.type);
      fd.append('storage', 'drime');

      if (item.type === 'books') {
        fd.append('author', item.author || 'Ministry of Education');
      } else {
        fd.append('year', item.year);
        fd.append('exam_board', item.exam_board || 'MANEB');
      }

      // Upload through /admin/upload-item with fallback
      try {
        await API.upload('/admin/upload-item', fd);
      } catch (adminErr) {
        const endpoint = item.type === 'books' ? '/books' : '/papers';
        await API.upload(endpoint, fd);
      }

      item.status = 'success';
      item.error = null;
      uploadedCount++;
    } catch (err) {
      console.error('Failed to upload', item.rawName, err);
      item.status = 'error';
      item.error = err.message || 'Upload failed';
    }

    const pct = Math.round((uploadedCount / totalToUpload) * 100);
    if (progressBar) progressBar.style.width = pct + '%';
    if (progressPercent) progressPercent.textContent = pct + '%';
    renderBulkQueue();
  }

  if (btn) btn.disabled = false;
  if (btnText) {
    btnText.textContent = uploadedCount === totalToUpload ? 'All Files Published Successfully ✓' : 'Retry Failed Uploads';
  }
  if (progressTitle) {
    progressTitle.textContent = `Upload completed: ${uploadedCount} of ${totalToUpload} files published to library!`;
  }
  if (progressSub) {
    progressSub.textContent = 'All published resources are instantly available on student pages (Past Papers & Books).';
  }

  toast(`Successfully published ${uploadedCount} resources!`);
  loadStats();
  loadProgression();
}

// Bulk Dropzone Setup
const dropzone = $('bulkDropzone');
const fileInput = $('bulkFileInput');

if (dropzone && fileInput) {
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('#bulkSelectBtn') || e.target === dropzone || dropzone.contains(e.target)) {
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      addFilesToQueue(dt.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) {
      addFilesToQueue(e.target.files);
      fileInput.value = '';
    }
  });

  $('bulkAddMoreBtn')?.addEventListener('click', () => fileInput.click());

  $('bulkClearBtn')?.addEventListener('click', () => {
    if (bulkQueue.length && confirm('Clear all files from the upload queue?')) {
      bulkQueue = [];
      renderBulkQueue();
      if ($('bulkProgressWrapper')) $('bulkProgressWrapper').hidden = true;
    }
  });

  $('bulkQuickLevel')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    bulkQueue.forEach(item => {
      if (item.status !== 'success') item.level = val;
    });
    renderBulkQueue();
    toast(`Set all pending items to ${val}`);
    e.target.value = '';
  });

  $('bulkQuickCategory')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    bulkQueue.forEach(item => {
      if (item.status !== 'success') {
        item.category = val;
        if (val === 'MSCE' || val === 'JCE') item.type = 'books';
        else item.type = 'papers';
      }
    });
    renderBulkQueue();
    toast(`Set all pending items to ${val}`);
    e.target.value = '';
  });

  $('bulkUploadAllBtn')?.addEventListener('click', executeBulkUpload);
}

// Helper to format bytes nicely
function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Single Upload Handler with Real-Time Progression
$('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('uSubmit');
  btn.disabled = true;
  btn.textContent = 'Syncing to Drime Cloud & Publishing...';

  const pWrap = $('uSingleProgressWrapper');
  const pBar = $('uSingleProgressBar');
  const pPct = $('uSingleProgressPercent');
  const pTitle = $('uSingleProgressTitle');
  const pSub = $('uSingleProgressSub');

  if (pWrap) pWrap.hidden = false;
  if (pBar) pBar.style.width = '0%';
  if (pPct) pPct.textContent = '0%';
  if (pTitle) pTitle.innerHTML = '<span>Uploading to Server &amp; Syncing to Drime Cloud...</span>';
  if (pSub) pSub.textContent = 'Transferring document bytes...';

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

    const res = await API.uploadWithProgress(endpoint, fd, (pct, loaded, total) => {
      const displayPct = Math.min(95, pct);
      if (pBar) pBar.style.width = displayPct + '%';
      if (pPct) pPct.textContent = displayPct + '%';
      if (pSub) pSub.textContent = `Uploading bytes: ${fmtBytes(loaded)} of ${fmtBytes(total)} (${pct}%)`;
      if (pct >= 100) {
        if (pTitle) pTitle.innerHTML = '<span>Syncing to Drime Cloud Storage...</span>';
        if (pSub) pSub.textContent = 'Registering in Drime Cloud folder (OymudINAwCDhPbnTH5Gt4oAIxo5mbC)...';
      }
    });

    if (pBar) pBar.style.width = '100%';
    if (pPct) pPct.textContent = '100%';
    if (pTitle) pTitle.innerHTML = '<span style="color:#16a34a">✓ Document Approved &amp; Published!</span>';
    if (pSub) pSub.innerHTML = '<b style="color:#16a34a">✓ Resource published and synced to Drime Cloud Storage!</b>';

    toast(res.message || 'Resource published and synced to Drime Cloud Storage!');
    $('uploadForm').reset();
    loadStats();
    loadProgression();

    setTimeout(() => {
      if (pWrap) pWrap.hidden = true;
    }, 3500);
  } catch (err) {
    if (pWrap) pWrap.hidden = true;
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish Resource to Library (Syncs to Drime Cloud)';
  }
});
