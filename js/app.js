const $ = (id) => document.getElementById(id);
const grid = $('grid'), empty = $('empty'), countEl = $('count');
let type = 'all', user = null;
const savedSet = new Set();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '3.2 MB';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

const params = () => {
  const p = new URLSearchParams({
    q: $('q') ? $('q').value.trim() : '',
    level: $('level') ? $('level').value : '',
    subject: $('subject') ? $('subject').value : '',
    year: $('year') ? $('year').value : '',
    sort: $('sort') ? $('sort').value : 'recent',
    limit: '30'
  });
  const cat = $('categoryFilter') ? $('categoryFilter').value : '';
  if (cat) p.append('category', cat);
  return p;
};

// ============ Left Side Drawer Controls ============
function openDrawer() {
  const drawer = $('sideDrawer');
  const backdrop = $('drawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer() {
  const drawer = $('sideDrawer');
  const backdrop = $('drawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}

$('drawerOpenBtn')?.addEventListener('click', openDrawer);
$('drawerCloseBtn')?.addEventListener('click', closeDrawer);
$('drawerBackdrop')?.addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDrawer();
    closeAllModals();
  }
});

$('bottomProfileTab')?.addEventListener('click', openDrawer);
$('headerAvatarBtn')?.addEventListener('click', openDrawer);
$('userBtn')?.addEventListener('click', openDrawer);

// Drawer tab switching
document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetType = btn.dataset.drawerTab;
    closeDrawer();
    if ($('categoryFilter')) $('categoryFilter').value = '';
    switchTab(targetType);
  });
});

// Drawer Sub-category Filter buttons (Books JCE/MSCE, Papers MANEB/Mock, Notes, Marking Keys)
document.querySelectorAll('[data-drawer-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const parts = btn.dataset.drawerFilter.split(':');
    const targetType = parts[0]; // 'papers' or 'books'
    const category = parts[1] || '';
    const levelSub = parts[2] || '';

    closeDrawer();
    type = targetType;

    if ($('categoryFilter')) $('categoryFilter').value = category;
    if ($('level')) $('level').value = levelSub || '';
    if ($('q')) $('q').value = '';

    document.querySelectorAll('.bottom-tabs .tab').forEach((x) => {
      x.classList.toggle('active', x.dataset.type === targetType);
    });

    load();
  });
});

function switchTab(t) {
  type = t;
  document.querySelectorAll('.bottom-tabs .tab').forEach((x) => {
    x.classList.toggle('active', x.dataset.type === t);
  });
  load();
}

// Theme handling
function updateThemeText() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const label = $('drawerThemeText');
  if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ph_theme', next);
  updateThemeText();
}

$('themeBtn')?.addEventListener('click', toggleTheme);
$('drawerThemeBtn')?.addEventListener('click', toggleTheme);
updateThemeText();

// Sign out handlers
function handleSignOut() {
  if (confirm('Are you sure you want to sign out?')) {
    API.setToken(null);
    location.replace('/auth.html');
  }
}
$('drawerSignOutBtn')?.addEventListener('click', handleSignOut);
$('pmSignOutBtn')?.addEventListener('click', handleSignOut);

// ============ Modals Handling ============
function openModal(id) {
  const m = $(id);
  if (m) {
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const m = $(id);
  if (m) {
    m.hidden = true;
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  ['uploadModal', 'limitModal', 'profileModal', 'helpModal'].forEach(closeModal);
}

$('uploadModalClose')?.addEventListener('click', () => closeModal('uploadModal'));
$('limitModalClose')?.addEventListener('click', () => closeModal('limitModal'));
$('limitDismissBtn')?.addEventListener('click', () => closeModal('limitModal'));
$('profileModalClose')?.addEventListener('click', () => closeModal('profileModal'));
$('helpModalClose')?.addEventListener('click', () => closeModal('helpModal'));

// Upload Modal open triggers
function showUploadModal() {
  closeDrawer();
  closeModal('limitModal');
  openModal('uploadModal');
}
$('drawerUploadLink')?.addEventListener('click', (e) => { e.preventDefault(); showUploadModal(); });
$('drawerUnlockBtn')?.addEventListener('click', showUploadModal);
$('bannerUploadBtn')?.addEventListener('click', showUploadModal);
$('limitUploadBtn')?.addEventListener('click', showUploadModal);

// Profile Modal open trigger
function showProfileModal() {
  closeDrawer();
  openModal('profileModal');
}
$('drawerProfileBtn')?.addEventListener('click', showProfileModal);

// Help Modal open trigger
function showHelpModal() {
  closeDrawer();
  if (user && user.email && $('helpEmail')) {
    $('helpEmail').value = user.email;
  }
  openModal('helpModal');
}
$('drawerHelpBtn')?.addEventListener('click', showHelpModal);

// Help form submission
$('helpForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('helpSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting report...';

  try {
    const reason = $('helpReason').value;
    const details = $('helpDetails').value.trim();
    const email = $('helpEmail').value.trim();

    await API.post('/search/help', { reason, details, email });
    toast('Your issue report has been submitted to the admin team.');
    closeModal('helpModal');
    $('helpDetails').value = '';
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Issue to Admin';
  }
});

// ============ Quota UI Updates ============
function updateQuotaUI(quota) {
  if (!quota) return;
  const isStudent = user && user.role === 'student';
  const quotaCard = $('drawerQuotaCard');
  const quotaBanner = $('quotaBanner');

  if (!isStudent || quota.isUnlimited) {
    if (quotaCard) quotaCard.hidden = true;
    if (quotaBanner) quotaBanner.style.display = 'none';
    return;
  }

  if (quotaCard) quotaCard.hidden = false;
  if (quotaBanner) quotaBanner.style.display = 'flex';

  const rem = quota.remaining;
  const total = quota.totalAllowed;
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((rem / total) * 100))) : 0;

  const pill = $('quotaPill');
  if (pill) {
    pill.textContent = rem + ' left';
    pill.classList.toggle('empty', rem <= 0);
  }
  const fill = $('quotaFill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('empty', rem <= 0);
  }
  const sub = $('quotaSub');
  if (sub) {
    sub.textContent = rem > 0
      ? rem + ' of ' + total + ' downloads available'
      : '0 downloads left — upload a resource to unlock +5!';
  }

  const bannerText = $('bannerQuotaText');
  if (bannerText) {
    bannerText.innerHTML = rem > 0
      ? '<b>' + rem + '</b> of ' + total + ' downloads remaining'
      : '<span style="color:var(--danger);font-weight:700">Limit reached (0 remaining)</span>';
  }

  const pmUsed = $('pmDownloadsUsed');
  const pmLeft = $('pmDownloadsLeft');
  if (pmUsed) pmUsed.textContent = quota.usedDownloads;
  if (pmLeft) pmLeft.textContent = quota.remaining;
}

// ============ Trust Carousel Click Handling ============
document.querySelectorAll('.trust-card').forEach((cardEl) => {
  cardEl.addEventListener('click', () => {
    const raw = cardEl.dataset.trust;
    if (!raw) return;
    const [sub, lvl] = raw.split(':');
    type = 'books';
    if ($('subject')) $('subject').value = sub;
    if ($('level')) $('level').value = lvl;
    if ($('categoryFilter')) $('categoryFilter').value = '';
    if ($('q')) $('q').value = '';
    load();
    grid.scrollIntoView({ behavior: 'smooth' });
    toast(`Filtered to ${sub} (${lvl})`);
  });
});

// ============ Data Fetching & Rendering ============
async function loadFacets() {
  try {
    const [p, b] = await Promise.all([API.get('/papers/facets'), API.get('/books/facets')]);
    const fill = (el, values) => {
      if (!el) return;
      el.innerHTML = el.firstElementChild.outerHTML + values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
    };
    fill($('subject'), [...new Set([...p.subjects, ...b.subjects])].sort());
    fill($('level'), [...new Set([...p.levels, ...b.levels])].sort());
    fill($('year'), p.years);
  } catch (e) { /* filters stay empty */ }
}

const PDF_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';

function card(item) {
  const isPaper = item._type ? item._type === 'paper' : (item.year !== undefined || item.exam_board !== undefined);
  const coll = isPaper ? 'papers' : 'books';
  const kind = isPaper ? 'paper' : 'book';
  const key = kind + ':' + item.id;
  const ref = coll + ':' + item.id;

  const art = !isPaper && item.cover_path
    ? '<img src="/' + esc(item.cover_path) + '" alt="" loading="lazy">'
    : PDF_SVG;

  const sizeStr = formatSize(item.file_size);

  return '<article class="card">' +
    '<div class="card-top">' +
      '<span class="ico">' + art + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap">' +
          '<span class="tag pdf">PDF</span>' +
          '<span class="tag size"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> ' + esc(sizeStr) + '</span>' +
          (item.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-weight:600;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime Cloud</span>' : '') +
          (item.category ? '<span class="tag ok" style="font-weight:700">' + esc(item.category) + '</span>' : '') +
        '</div>' +
        '<h3>' + esc(item.title) + '</h3>' +
      '</div>' +
    '</div>' +
    '<div class="tags">' +
      '<span class="tag subject">' + esc(item.subject) + '</span>' +
      '<span class="tag">' + esc(item.level) + '</span>' +
      (isPaper && item.year ? '<span class="tag">' + item.year + '</span>' : '') +
      (isPaper && item.exam_board ? '<span class="tag">' + esc(item.exam_board) + '</span>' : '') +
      (!isPaper && item.author ? '<span class="tag">' + esc(item.author) + '</span>' : '') +
    '</div>' +
    '<div class="card-foot">' +
      '<span class="dlcount" style="display:inline-flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ' + item.downloads.toLocaleString() + ' dl</span>' +
      '<span class="acts">' +
        '<button class="btn sm" data-save="' + key + '">' + (savedSet.has(key) ? 'Saved' : 'Save') + '</button>' +
        '<button class="btn sm" data-pv="' + ref + '">Preview</button>' +
        '<button class="btn sm" data-rp="' + ref + '" title="Report broken file" aria-label="Report broken file"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button>' +
        '<button class="btn sm primary" data-dl="' + ref + '" style="display:inline-flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>' +
      '</span>' +
    '</div>' +
  '</article>';
}

async function load() {
  empty.hidden = true;
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');

  try {
    if (type === 'saved') {
      if (!user) {
        grid.innerHTML = '';
        empty.hidden = false;
        empty.innerHTML = 'Sign in to see your saved resources. <a href="/auth.html">Sign in</a>';
        countEl.textContent = '';
        return;
      }
      const { items } = await API.get('/search/mine');
      countEl.textContent = items.length + ' saved resource' + (items.length === 1 ? '' : 's');
      if (!items.length) {
        grid.innerHTML = '';
        empty.hidden = false;
        empty.textContent = 'Nothing saved yet.';
        return;
      }
      grid.innerHTML = items.map(card).join('');
      return;
    }

    let items = [];
    let total = 0;

    if (type === 'all') {
      // Load both past papers and textbooks immediately!
      const [pRes, bRes] = await Promise.all([
        API.get('/papers?' + params()),
        API.get('/books?' + params())
      ]);

      const papersList = (pRes.items || []).map((i) => ({ ...i, _type: 'paper' }));
      const booksList = (bRes.items || []).map((i) => ({ ...i, _type: 'book' }));

      total = (pRes.total || 0) + (bRes.total || 0);

      // Merge and sort
      const sortVal = $('sort') ? $('sort').value : 'recent';
      if (sortVal === 'popular') {
        items = [...booksList, ...papersList].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      } else if (sortVal === 'title') {
        items = [...booksList, ...papersList].sort((a, b) => a.title.localeCompare(b.title));
      } else {
        // Interleave textbooks and past papers nicely
        items = [];
        const maxLen = Math.max(booksList.length, papersList.length);
        for (let i = 0; i < maxLen; i++) {
          if (booksList[i]) items.push(booksList[i]);
          if (papersList[i]) items.push(papersList[i]);
        }
      }
    } else {
      const res = await API.get('/' + type + '?' + params());
      items = (res.items || []).map((i) => ({ ...i, _type: type === 'books' ? 'book' : 'paper' }));
      total = res.total || 0;
    }

    countEl.textContent = total + ' resource' + (total === 1 ? '' : 's') + ' available for download';

    if (!items.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.textContent = 'Nothing matched your search or category filter. Try clearing a filter.';
      return;
    }

    grid.innerHTML = items.map(card).join('');
  } catch (e) {
    toast(e.message, true);
    grid.innerHTML = '';
  }
}

// Download & Bookmark Click Handlers with Quota Enforcement
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
      if (!user) return location.replace('/auth.html');
      const [coll, id] = dlBtn.dataset.dl.split(':');

      if (user.role === 'student' && user.quota && !user.quota.isUnlimited) {
        if (user.quota.remaining <= 0) {
          openModal('limitModal');
          toast('Download limit reached. Upload a new file to unlock!', true);
          return;
        }
      }

      const token = API.token();
      const downloadUrl = API.base + '/' + coll + '/' + id + '/download?t=' + encodeURIComponent(token);

      window.location.href = downloadUrl;
      toast('Download starting...');

      setTimeout(async () => {
        try {
          const freshQuota = await API.getQuota();
          if (freshQuota) {
            user.quota = freshQuota;
            updateQuotaUI(freshQuota);
          }
        } catch (_) {}
      }, 1200);
    }
  } catch (err) { toast(err.message, true); }
});

// Bottom tabs click navigation
document.querySelectorAll('.bottom-tabs .tab:not(.profile-tab)').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.bottom-tabs .tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  type = t.dataset.type;
  if ($('categoryFilter')) $('categoryFilter').value = '';
  load();
}));

let dt;
['q', 'level', 'subject', 'categoryFilter', 'year', 'sort'].forEach((id) => {
  $(id)?.addEventListener('input', () => {
    clearTimeout(dt);
    dt = setTimeout(load, 250);
  });
  $(id)?.addEventListener('change', () => {
    clearTimeout(dt);
    dt = setTimeout(load, 150);
  });
});

// ============ Student Upload Form Handling ============
$('suType')?.addEventListener('change', () => {
  const isBook = $('suType').value === 'books';
  $('suYearWrap').hidden = isBook;
  $('suBoardWrap').hidden = isBook;
  $('suAuthorWrap').hidden = !isBook;
  $('suCoverWrap').hidden = !isBook;
});

$('studentUploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('suSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Uploading & verifying...';

  try {
    const fd = new FormData();
    const typeValue = $('suType').value;
    const isBook = typeValue === 'books';

    fd.append('title', $('suTitle').value.trim());
    fd.append('subject', $('suSubject').value.trim());
    fd.append('level', $('suLevel').value);
    if ($('suDesc').value.trim()) fd.append('description', $('suDesc').value.trim());

    if (!isBook) {
      if ($('suYear').value) fd.append('year', $('suYear').value);
      if ($('suBoard').value.trim()) fd.append('exam_board', $('suBoard').value.trim());
    } else {
      if ($('suAuthor').value.trim()) fd.append('author', $('suAuthor').value.trim());
      if ($('suCover').files[0]) fd.append('cover', $('suCover').files[0]);
    }

    if ($('suFile').files[0]) {
      fd.append('file', $('suFile').files[0]);
    } else {
      throw new Error('Please select a file to upload.');
    }

    const res = await API.upload('/' + typeValue, fd);

    toast(res.message || 'Resource uploaded! +5 downloads unlocked.');
    e.target.reset();
    closeAllModals();

    if (res.quota) {
      user.quota = res.quota;
      updateQuotaUI(res.quota);
    } else {
      const q = await API.getQuota();
      if (q) { user.quota = q; updateQuotaUI(q); }
    }

    await loadFacets();
    await load();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit & Unlock +5 Downloads';
  }
});

// ============ Profile Modal Password Form ============
$('pmPwForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = $('pmCurrentPw').value;
  const next = $('pmNewPw').value;
  try {
    await API.post('/auth/password', { current, next });
    toast('Password updated successfully!');
    $('pmPwForm').reset();
  } catch (err) {
    toast(err.message, true);
  }
});

// ============ App Initialization ============
(async function init() {
  user = await API.me();
  if (!user) {
    location.replace('/auth.html');
    return;
  }
  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const firstName = (user.name || 'Student').split(' ')[0];
  const initial = (user.name || 'M').charAt(0).toUpperCase();

  $('drawerName').textContent = user.name || 'Student';
  $('drawerEmail').textContent = user.email || '';
  $('drawerAvatar').textContent = initial;

  $('pmName').textContent = user.name || 'Student';
  $('pmEmail').textContent = user.email || '';
  $('pmAvatar').textContent = initial;
  $('pmBadge').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  if ($('userBtn')) $('userBtn').textContent = firstName;
  if ($('headerAvatarInitial')) $('headerAvatarInitial').textContent = initial;

  const email = (user.email || '').toLowerCase().trim();
  const isAdmin = user.role === 'admin' || email === 'muhebrewwinston@gmail.com';
  const isTeacher = user.role === 'teacher';

  const roleSwitcher = $('adminRoleSwitcher');
  const studentBadge = $('drawerStudentBadge');
  const teacherBadge = $('drawerTeacherBadge');
  const adminLink = $('drawerAdminLink');
  const teacherLink = $('drawerTeacherLink');

  if (isAdmin) {
    if (roleSwitcher) roleSwitcher.hidden = false;
    if (studentBadge) studentBadge.hidden = true;
    if (teacherBadge) teacherBadge.hidden = true;
    if (adminLink) adminLink.hidden = false;
    if (teacherLink) teacherLink.hidden = false;

    $('roleTabAdmin')?.addEventListener('click', () => { location.href = '/admin.html'; });
    $('roleTabTeacher')?.addEventListener('click', () => { location.href = '/teacher.html'; });
    $('roleTabStudent')?.addEventListener('click', () => {
      closeDrawer();
      toast('Switched to Student Library view');
    });
  } else if (isTeacher) {
    if (roleSwitcher) roleSwitcher.hidden = true;
    if (studentBadge) studentBadge.hidden = true;
    if (teacherBadge) teacherBadge.hidden = false;
    if (adminLink) adminLink.hidden = true;
    if (teacherLink) teacherLink.hidden = false;
  } else {
    if (roleSwitcher) roleSwitcher.hidden = true;
    if (studentBadge) studentBadge.hidden = false;
    if (teacherBadge) teacherBadge.hidden = true;
    if (adminLink) adminLink.hidden = true;
    if (teacherLink) teacherLink.hidden = true;
  }

  updateQuotaUI(user.quota);

  try {
    const m = await API.get('/search/mine');
    m.items.forEach((i) => savedSet.add((i._type || 'paper') + ':' + i.id));
  } catch (e) { /* ignore */ }

  try {
    const s = await API.get('/search/stats');
    $('statPapers').textContent = s.papers;
    $('statBooks').textContent = s.books;
    $('statDl').textContent = s.downloads.toLocaleString();
  } catch (e) { /* ignore */ }

  await loadFacets();

  // Immediately start loading books and papers onto the display!
  await load();
})();
