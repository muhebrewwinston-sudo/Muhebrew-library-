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

// Drawer toggle event listeners
$('drawerOpenBtn')?.addEventListener('click', openDrawer);
$('drawerCloseBtn')?.addEventListener('click', closeDrawer);
$('drawerBackdrop')?.addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDrawer();
    closeAllModals();
  }
});

// Bottom navigation "Profile" tab opens drawer / profile
$('bottomProfileTab')?.addEventListener('click', () => {
  openDrawer();
});

$('headerAvatarBtn')?.addEventListener('click', () => {
  openDrawer();
});

$('userBtn')?.addEventListener('click', () => {
  openDrawer();
});

// Drawer tab shortcuts
document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetType = btn.dataset.drawerTab;
    closeDrawer();
    switchTab(targetType);
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
  ['uploadModal', 'limitModal', 'profileModal'].forEach(closeModal);
}

$('uploadModalClose')?.addEventListener('click', () => closeModal('uploadModal'));
$('limitModalClose')?.addEventListener('click', () => closeModal('limitModal'));
$('limitDismissBtn')?.addEventListener('click', () => closeModal('limitModal'));
$('profileModalClose')?.addEventListener('click', () => closeModal('profileModal'));

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

  // Drawer widget
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

  // Banner
  const bannerText = $('bannerQuotaText');
  if (bannerText) {
    bannerText.innerHTML = rem > 0
      ? '<b>' + rem + '</b> of ' + total + ' downloads remaining'
      : '<span style="color:var(--danger);font-weight:700">Limit reached (0 remaining)</span>';
  }

  // Profile modal numbers
  const pmUsed = $('pmDownloadsUsed');
  const pmLeft = $('pmDownloadsLeft');
  if (pmUsed) pmUsed.textContent = quota.usedDownloads;
  if (pmLeft) pmLeft.textContent = quota.remaining;
}

// ============ Data Fetching & Rendering ============
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

      // Check student quota before triggering download
      if (user.role === 'student' && user.quota && !user.quota.isUnlimited) {
        if (user.quota.remaining <= 0) {
          openModal('limitModal');
          toast('Download limit reached. Upload a new file to unlock!', true);
          return;
        }
      }

      // Download with token passed via query parameter for auth verification
      const token = API.token();
      const downloadUrl = API.base + '/' + coll + '/' + id + '/download?t=' + encodeURIComponent(token);

      // Trigger download
      window.location.href = downloadUrl;
      toast('Download starting...');

      // Refresh live quota from backend
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
  load();
}));

let dt;
['q', 'level', 'subject', 'year', 'sort'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(load, 280); }));

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

    // Upload succeeded!
    toast(res.message || 'Resource uploaded! +5 downloads unlocked.');
    e.target.reset();
    closeAllModals();

    // Update user quota
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

  // Set user profile info in drawer
  const firstName = (user.name || 'Student').split(' ')[0];
  const initial = (user.name || 'M').charAt(0).toUpperCase();

  $('drawerName').textContent = user.name || 'Student';
  $('drawerEmail').textContent = user.email || '';
  $('drawerAvatar').textContent = initial;

  // Profile modal info
  $('pmName').textContent = user.name || 'Student';
  $('pmEmail').textContent = user.email || '';
  $('pmAvatar').textContent = initial;
  $('pmBadge').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  // Desktop user button & mobile avatar initial
  if ($('userBtn')) $('userBtn').textContent = firstName;
  if ($('headerAvatarInitial')) $('headerAvatarInitial').textContent = initial;

  // Role visibility & switcher logic:
  // - Admin (e.g. muhebrewwinston@gmail.com): has access to open all 3 areas (Admin, Teacher, Student)
  // - Student: has access ONLY to student area (no admin icon, no teacher portal)
  // - Teacher: has access ONLY to teacher area (no admin dashboard)
  const email = (user.email || '').toLowerCase().trim();
  const isAdmin = user.role === 'admin' || email === 'muhebrewwinston@gmail.com';
  const isTeacher = user.role === 'teacher';
  const isStudent = !isAdmin && !isTeacher;

  const roleSwitcher = $('adminRoleSwitcher');
  const studentBadge = $('drawerStudentBadge');
  const teacherBadge = $('drawerTeacherBadge');
  const adminLink = $('drawerAdminLink');
  const teacherLink = $('drawerTeacherLink');

  if (isAdmin) {
    // Admin: Interactive 3-badge switcher allowing Admin to open all areas
    if (roleSwitcher) roleSwitcher.hidden = false;
    if (studentBadge) studentBadge.hidden = true;
    if (teacherBadge) teacherBadge.hidden = true;
    if (adminLink) adminLink.hidden = false;
    if (teacherLink) teacherLink.hidden = false;

    // Attach role tab actions for Admin
    $('roleTabAdmin')?.addEventListener('click', () => {
      location.href = '/admin.html';
    });
    $('roleTabTeacher')?.addEventListener('click', () => {
      location.href = '/teacher.html';
    });
    $('roleTabStudent')?.addEventListener('click', () => {
      closeDrawer();
      toast('Switched to Student Library view');
    });
  } else if (isTeacher) {
    // Teacher: Single Teacher badge and teacher uploads link
    if (roleSwitcher) roleSwitcher.hidden = true;
    if (studentBadge) studentBadge.hidden = true;
    if (teacherBadge) teacherBadge.hidden = false;
    if (adminLink) adminLink.hidden = true;
    if (teacherLink) teacherLink.hidden = false;
  } else {
    // Student: Single Student badge only. STRICTLY no Admin or Teacher icons/links!
    if (roleSwitcher) roleSwitcher.hidden = true;
    if (studentBadge) studentBadge.hidden = false;
    if (teacherBadge) teacherBadge.hidden = true;
    if (adminLink) adminLink.hidden = true;
    if (teacherLink) teacherLink.hidden = true;
  }

  // Update Quota UI (students only; admins & teachers have unlimited downloads)
  updateQuotaUI(user.quota);

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
