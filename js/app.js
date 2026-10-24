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

$('headerAvatarBtn')?.addEventListener('click', openDrawer);
$('userBtn')?.addEventListener('click', openDrawer);

// Drawer Accordion expandable menus (Books, Papers, Marking keys)
document.querySelectorAll('.drawer-accordion-trigger').forEach((trigger) => {
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    const group = trigger.closest('.drawer-accordion-group');
    if (!group) return;
    const isExpanded = group.classList.contains('expanded');

    // Close any other open accordion groups
    document.querySelectorAll('.drawer-accordion-group').forEach((g) => {
      if (g !== group) {
        g.classList.remove('expanded');
        g.querySelector('.drawer-accordion-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });

    group.classList.toggle('expanded', !isExpanded);
    trigger.setAttribute('aria-expanded', !isExpanded ? 'true' : 'false');
  });
});

// Drawer tab switching
document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetType = btn.dataset.drawerTab;
    closeDrawer();
    if ($('categoryFilter')) $('categoryFilter').value = '';
    switchTab(targetType);
  });
});

// Drawer Sub-category Filter buttons (Books JCE/MSCE, Papers JCE/MSCE, Marking Keys JCE/MSCE, Notes)
document.querySelectorAll('[data-drawer-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const parts = btn.dataset.drawerFilter.split(':');
    const targetType = parts[0] || 'papers';
    const catOrLevel = parts[1] || '';
    const subLevel = parts[2] || '';

    closeDrawer();
    type = targetType;

    // Apply filters based on drawer selection
    if (catOrLevel === 'JCE' || catOrLevel === 'MSCE') {
      if ($('categoryFilter')) $('categoryFilter').value = '';
      if ($('level')) $('level').value = catOrLevel;
    } else {
      if ($('categoryFilter')) $('categoryFilter').value = catOrLevel;
      if ($('level')) $('level').value = subLevel;
    }
    if ($('q')) $('q').value = '';

    document.querySelectorAll('.bottom-tabs .tab').forEach((x) => {
      x.classList.toggle('active', x.dataset.type === targetType);
    });

    load();
  });
});

// Bottom tabs navigation click listener (3 tabs: Past papers | Books | Saved)
document.querySelectorAll('.bottom-tabs .tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetType = btn.dataset.type;
    if (targetType) {
      if ($('categoryFilter')) $('categoryFilter').value = '';
      if ($('level')) $('level').value = '';
      switchTab(targetType);
    }
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
let allLoadedItems = [];
let visibleItemCount = 6; // Show initial batch of 6 items on display page

function renderPagedItems() {
  const seeMoreWrap = $('seeMoreWrap');
  const seeMoreBtn = $('seeMoreBtn');
  const seeMoreBtnText = $('seeMoreBtnText');

  if (!allLoadedItems || !allLoadedItems.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'Nothing matched your search or category filter. Try clearing a filter.';
    if (seeMoreWrap) seeMoreWrap.hidden = true;
    return;
  }

  empty.hidden = true;
  const currentBatch = allLoadedItems.slice(0, visibleItemCount);
  grid.innerHTML = currentBatch.map(card).join('');

  if (allLoadedItems.length > visibleItemCount) {
    if (seeMoreWrap) seeMoreWrap.hidden = false;
    if (seeMoreBtnText) {
      seeMoreBtnText.textContent = `See more resources (${visibleItemCount} of ${allLoadedItems.length} shown)`;
    }
  } else {
    if (seeMoreWrap) seeMoreWrap.hidden = true;
  }
}

$('seeMoreBtn')?.addEventListener('click', () => {
  visibleItemCount += 6;
  renderPagedItems();
});

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

function card(item) {
  const isPaper = item._type ? item._type === 'paper' : (item.year !== undefined || item.exam_board !== undefined);
  const coll = isPaper ? 'papers' : 'books';
  const kind = isPaper ? 'paper' : 'book';
  const key = kind + ':' + item.id;
  const ref = coll + ':' + item.id;
  const isSaved = savedSet.has(key);

  const sizeStr = formatSize(item.file_size);
  const dlCountStr = (item.downloads || 0).toLocaleString();

  // Red PDF icon badge on the left
  const redPdfBadge = 
    '<div class="card-pdf-badge" aria-label="PDF Document">' +
      '<svg class="pdf-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/>' +
        '<line x1="16" y1="13" x2="8" y2="13"/>' +
        '<line x1="16" y1="17" x2="8" y2="17"/>' +
        '<line x1="10" y1="9" x2="8" y2="9"/>' +
      '</svg>' +
      '<span class="pdf-tag">PDF</span>' +
    '</div>';

  const visualCol = !isPaper && item.cover_path
    ? '<div class="card-cover-wrapper">' +
        '<img src="/' + esc(item.cover_path) + '" alt="" loading="lazy">' +
        '<span class="cover-pdf-pill">PDF</span>' +
      '</div>'
    : redPdfBadge;

  return '<article class="card">' +
    '<div class="card-header">' +
      visualCol +
      '<div class="card-header-body">' +
        '<h3 class="card-title">' + esc(item.title) + '</h3>' +
        '<div class="card-meta-row">' +
          '<span class="meta-item dlcount">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ' +
            dlCountStr + ' dl' +
          '</span>' +
          '<span class="meta-dot">&middot;</span>' +
          '<span class="meta-item">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> ' +
            esc(sizeStr) +
          '</span>' +
          (item.storage_provider === 'drime' ? 
            '<span class="meta-dot">&middot;</span>' +
            '<span class="meta-item drime-cloud-chip" title="Drime Cloud Hosted">' +
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime Cloud' +
            '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-chips">' +
      '<span class="chip chip-subject">' + esc(item.subject) + '</span>' +
      '<span class="chip chip-level">' + esc(item.level) + '</span>' +
      (isPaper && item.year ? '<span class="chip chip-year">' + item.year + '</span>' : '') +
      (isPaper && item.exam_board ? '<span class="chip chip-board">' + esc(item.exam_board) + '</span>' : '') +
      (item.category ? '<span class="chip chip-category">' + esc(item.category) + '</span>' : '') +
      (!isPaper && item.author ? '<span class="chip chip-author">' + esc(item.author) + '</span>' : '') +
    '</div>' +
    '<div class="card-actions">' +
      '<button class="btn sm act-save ' + (isSaved ? 'is-saved' : '') + '" data-save="' + key + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (isSaved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> ' +
        '<span class="save-label">' + (isSaved ? 'Saved' : 'Save') + '</span>' +
      '</button>' +
      '<button class="btn sm act-preview" data-pv="' + ref + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> ' +
        'Preview' +
      '</button>' +
      '<button class="btn sm act-report" data-rp="' + ref + '" title="Report broken file" aria-label="Report broken file">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ' +
        '<span>Report</span>' +
      '</button>' +
      '<button class="btn sm primary act-download" data-dl="' + ref + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ' +
        'Download' +
      '</button>' +
    '</div>' +
  '</article>';
}

async function load() {
  empty.hidden = true;
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
  if ($('seeMoreWrap')) $('seeMoreWrap').hidden = true;

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
      allLoadedItems = items;
      visibleItemCount = 6;
      renderPagedItems();
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

    allLoadedItems = items;
    visibleItemCount = 6; // Show initial batch of 6 items on display page
    renderPagedItems();
  } catch (e) {
    toast(e.message, true);
    grid.innerHTML = '';
    if ($('seeMoreWrap')) $('seeMoreWrap').hidden = true;
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
      const label = saveBtn.querySelector('.save-label');
      if (label) label.textContent = r.saved ? 'Saved' : 'Save';
      else saveBtn.textContent = r.saved ? 'Saved' : 'Save';
      const svg = saveBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', r.saved ? 'currentColor' : 'none');
      saveBtn.classList.toggle('is-saved', r.saved);
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

// ============ Student Upload Form Handling (3 Layers) ============
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

  let detectedSubject = 'Mathematics';
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

  const isMarkingKey = /\b(marking\s*key|marking\s*scheme|answers|solution|key)\b/i.test(lower);
  const isNotes = /\b(notes|revision|summary|guide|module|pamphlet)\b/i.test(lower);
  const isMock = /\b(mock|cluster|division|zone|district)\b/i.test(lower);
  const isTextbook = /\b(textbook|book|student\s*book|learners?\s*book|teachers?\s*guide)\b/i.test(lower);

  if (isMarkingKey) {
    detectedCategory = 'Marking Key';
  } else if (isNotes) {
    detectedCategory = 'Notes';
  } else if (isMock) {
    detectedCategory = 'Mock';
  } else if (isTextbook) {
    detectedType = 'books';
    detectedCategory = (detectedLevel === 'Form 1' || detectedLevel === 'Form 2') ? 'JCE' : 'MSCE';
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
    year: detectedYear
  };
}

// Layer 1 Button Switcher (Book, Paper, Notes)
function selectUploadType(t) {
  if ($('suType')) $('suType').value = t;

  ['btnTypeBook', 'btnTypePaper', 'btnTypeNotes'].forEach((id) => {
    $(id)?.classList.remove('active');
  });

  const yearWrap = $('suYearWrap');
  const catWrap = $('suCategoryWrap');
  const catSelect = $('suCategory');

  if (t === 'books') {
    $('btnTypeBook')?.classList.add('active');
    if (yearWrap) yearWrap.hidden = true;
    if (catSelect) catSelect.value = ($('suLevel')?.value === 'Form 1' || $('suLevel')?.value === 'Form 2') ? 'JCE' : 'MSCE';
    if ($('suTitle') && !$('suTitle').value) $('suTitle').placeholder = 'e.g. Senior Secondary Mathematics Form 4';
  } else if (t === 'notes') {
    $('btnTypeNotes')?.classList.add('active');
    if (yearWrap) yearWrap.hidden = true;
    if (catSelect) catSelect.value = 'Notes';
    if ($('suTitle') && !$('suTitle').value) $('suTitle').placeholder = 'e.g. Biology Form 3 Study Revision Notes';
  } else {
    $('btnTypePaper')?.classList.add('active');
    if (yearWrap) yearWrap.hidden = false;
    if (catSelect) catSelect.value = 'MANEB';
    if ($('suTitle') && !$('suTitle').value) $('suTitle').placeholder = 'e.g. MANEB Mathematics Paper 1 (2024)';
  }
}

$('btnTypeBook')?.addEventListener('click', () => selectUploadType('books'));
$('btnTypePaper')?.addEventListener('click', () => selectUploadType('papers'));
$('btnTypeNotes')?.addEventListener('click', () => selectUploadType('notes'));

// Layer 2: File Picker & Auto-Trace
$('suFileDropBox')?.addEventListener('click', () => {
  $('suFile')?.click();
});

$('suFile')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const nameEl = $('suFileNameDisplay');
  const sizeEl = $('suFileSizeDisplay');
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = formatSize(file.size);

  const traced = clientAutoTrace(file.name, file.size);
  if ($('suTitle')) $('suTitle').value = traced.title;
  if ($('suSubject')) $('suSubject').value = traced.subject;
  if ($('suLevel')) $('suLevel').value = traced.level;
  if ($('suYear') && traced.year) $('suYear').value = traced.year;

  if (traced.type === 'books') {
    selectUploadType('books');
  } else if (traced.category === 'Notes') {
    selectUploadType('notes');
  } else {
    selectUploadType('papers');
  }

  toast(`Auto-traced: ${traced.subject} (${traced.level})`);
});

// Layer 3: Submit Button Handler
$('studentUploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('suSubmitBtn');
  const btnText = $('suSubmitBtnText');
  btn.disabled = true;
  if (btnText) btnText.textContent = 'Uploading & unlocking +5...';

  try {
    const fd = new FormData();
    const typeValue = $('suType') ? $('suType').value : 'papers';
    const isBook = typeValue === 'books';
    const isNotes = typeValue === 'notes';
    const endpoint = isBook ? '/books' : '/papers';

    fd.append('title', $('suTitle').value.trim());
    fd.append('subject', $('suSubject').value);
    fd.append('level', $('suLevel').value);
    fd.append('category', isNotes ? 'Notes' : ($('suCategory') ? $('suCategory').value : (isBook ? 'MSCE' : 'MANEB')));

    if ($('suYear') && !isBook && !isNotes && $('suYear').value) {
      fd.append('year', $('suYear').value);
    }
    if (!isBook && !isNotes) {
      fd.append('exam_board', $('suCategory')?.value === 'Mock' ? 'Cluster Mock' : 'MANEB');
    }

    if ($('suFile').files[0]) {
      fd.append('file', $('suFile').files[0]);
    } else {
      throw new Error('Please select a file to upload.');
    }

    const res = await API.upload(endpoint, fd);

    toast(res.message || 'Resource submitted! +5 free downloads unlocked.');
    e.target.reset();
    if ($('suFileNameDisplay')) $('suFileNameDisplay').textContent = 'Tap to choose PDF document';
    if ($('suFileSizeDisplay')) $('suFileSizeDisplay').textContent = 'Auto-traces title, subject, and form level';
    closeAllModals();

    const q = await API.getQuota();
    if (q) {
      user.quota = q;
      updateQuotaUI(q);
    }

    await loadFacets();
    await load();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    if (btnText) btnText.textContent = 'Upload Resource & Unlock +5 Downloads';
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
  try {
    user = await API.me();
  } catch (_) {
    user = null;
  }

  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const roleSwitcher = $('adminRoleSwitcher');
  const studentBadge = $('drawerStudentBadge');
  const teacherBadge = $('drawerTeacherBadge');
  const adminLink = $('drawerAdminLink');
  const teacherLink = $('drawerTeacherLink');

  if (user) {
    const firstName = (user.name || 'Student').split(' ')[0];
    const initial = (user.name || 'K').charAt(0).toUpperCase();

    $('drawerName').textContent = user.name || 'Kamiza';
    $('drawerEmail').textContent = user.email || 'muhebrewwinston@gmail.com';
    $('drawerAvatar').textContent = initial;

    if ($('pmName')) $('pmName').textContent = user.name || 'Student';
    if ($('pmEmail')) $('pmEmail').textContent = user.email || '';
    if ($('pmAvatar')) $('pmAvatar').textContent = initial;
    if ($('pmBadge')) $('pmBadge').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

    if ($('userBtn')) $('userBtn').textContent = firstName;
    if ($('headerAvatarInitial')) $('headerAvatarInitial').textContent = initial;

    const email = (user.email || '').toLowerCase().trim();
    const isTeacher = user.role === 'teacher';

    if (user.role === 'student') {
      if (roleSwitcher) roleSwitcher.hidden = true;
      if (studentBadge) studentBadge.hidden = false;
      if (teacherBadge) teacherBadge.hidden = true;
      if (adminLink) adminLink.hidden = true;
      if (teacherLink) teacherLink.hidden = true;
    } else if (isTeacher) {
      if (roleSwitcher) roleSwitcher.hidden = true;
      if (studentBadge) studentBadge.hidden = true;
      if (teacherBadge) teacherBadge.hidden = false;
      if (adminLink) adminLink.hidden = true;
      if (teacherLink) teacherLink.hidden = false;
    } else {
      // Admin / Owner on student start bar:
      // Show the STUDENT badge below email exactly as in user's screenshot!
      if (studentBadge) studentBadge.hidden = false;
      if (teacherBadge) teacherBadge.hidden = true;
      if (roleSwitcher) roleSwitcher.hidden = false;
      if (adminLink) adminLink.hidden = false;
      if (teacherLink) teacherLink.hidden = false;

      $('roleTabAdmin')?.addEventListener('click', () => { location.href = '/admin.html'; });
      $('roleTabTeacher')?.addEventListener('click', () => { location.href = '/teacher.html'; });
      $('roleTabStudent')?.addEventListener('click', () => {
        closeDrawer();
        toast('Switched to Student Library view');
      });
    }

    updateQuotaUI(user.quota);
  } else {
    // Guest student / visitor view - shows default Kamiza student header matching screenshot!
    $('drawerName').textContent = 'Kamiza';
    $('drawerEmail').textContent = 'muhebrewwinston@gmail.com';
    $('drawerAvatar').textContent = 'K';
    if (studentBadge) studentBadge.hidden = false;
    if (teacherBadge) teacherBadge.hidden = true;
    if (roleSwitcher) roleSwitcher.hidden = true;
    if ($('headerAvatarInitial')) $('headerAvatarInitial').textContent = 'K';
  }

  try {
    const m = await API.get('/search/mine');
    if (m && m.items) {
      m.items.forEach((i) => savedSet.add((i._type || 'paper') + ':' + i.id));
    }
  } catch (e) { /* ignore */ }

  try {
    const s = await API.get('/search/stats');
    if ($('statPapers')) $('statPapers').textContent = s.papers;
    if ($('statBooks')) $('statBooks').textContent = s.books;
    if ($('statDl')) $('statDl').textContent = s.downloads.toLocaleString();
  } catch (e) { /* ignore */ }

  await loadFacets();

  // Immediately start loading books and papers onto the display!
  await load();
})();
