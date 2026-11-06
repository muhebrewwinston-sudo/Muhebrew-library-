const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tbl = (head, rows) => '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';

// State management
let currentActiveView = 'view-dashboard';
let allFavoriteBooks = [];
let favBooksPage = 0;
const favBooksPageSize = 3;

let allFavoritePapers = [];
let favPapersPage = 0;
const favPapersPageSize = 3;

let progressionData = { signups: [], downloads: [], uploads: [] };
let activeProgTab = 'dl';
let progPage = 0;
const progPageSize = 3;

let isLogStreamPaused = false;
let lastLogIdSeen = 0;
let telemetryPollInterval = null;

// ============================================================================
// SINGLE-PAGE VIEW NAVIGATION SYSTEM (LIKE FACEBOOK VIEW SWITCHING)
// "what are in start bar should not appear on the first page of an admin...
// The first page should only shows library statistics and upload files column ..
// while those are in start bar should open one they own page when I click it"
// ============================================================================
function switchView(targetViewId) {
  const views = document.querySelectorAll('.admin-view');
  let targetExists = false;

  views.forEach((v) => {
    if (v.id === targetViewId) {
      v.hidden = false;
      v.classList.add('active');
      targetExists = true;
    } else {
      v.hidden = true;
      v.classList.remove('active');
    }
  });

  if (!targetExists) {
    const defaultView = $('view-dashboard');
    if (defaultView) {
      defaultView.hidden = false;
      defaultView.classList.add('active');
      targetViewId = 'view-dashboard';
    }
  }

  currentActiveView = targetViewId;
  closeStartBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update bottom navigation bar active state
  document.querySelectorAll('.bottom-tabs .tab').forEach((tab) => {
    const target = tab.getAttribute('data-view-target');
    if (target === targetViewId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Lazy-load data when specific view is opened
  if (targetViewId === 'view-database') {
    loadDatabaseStats();
  } else if (targetViewId === 'view-server') {
    fetchServerStats();
    fetchServerLogs();
  } else if (targetViewId === 'view-users') {
    loadUsers();
  } else if (targetViewId === 'view-pending') {
    loadPending();
  } else if (targetViewId === 'view-issues') {
    loadReports();
  } else if (targetViewId === 'view-progression') {
    loadProgression();
  }
}

// Global click delegation for view switching & back buttons
document.addEventListener('click', (e) => {
  const targetBtn = e.target.closest('[data-view-target]');
  if (targetBtn) {
    e.preventDefault();
    const viewId = targetBtn.getAttribute('data-view-target');
    switchView(viewId);
    return;
  }

  const backBtn = e.target.closest('[data-back-to]');
  if (backBtn) {
    e.preventDefault();
    const backId = backBtn.getAttribute('data-back-to') || 'view-dashboard';
    switchView(backId);
    return;
  }
});

// Start Bar (Side Drawer) Open / Close
function openStartBar() {
  const drawer = $('adminSideDrawer');
  const backdrop = $('adminDrawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeStartBar() {
  const drawer = $('adminSideDrawer');
  const backdrop = $('adminDrawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function isAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const email = (user.email || '').toLowerCase().trim();
  const adminEmails = ['muhebrewwinston@gmail.com', 'admin@muhebrew.com', 'admin@library.mw'];
  if (adminEmails.includes(email) || email.startsWith('admin@')) return true;
  return false;
}

function doSignOut() {
  if (confirm('Sign out from owner dashboard?')) {
    API.logout();
  }
}

// ============================================================================
// DESKTOP MODE FOR ADMIN PAGE
// "And only admin page can be in desktop mode"
// ============================================================================
function setDesktopMode(active) {
  if (active) {
    document.body.classList.add('desktop-mode-active');
    localStorage.setItem('admin_desktop_mode', 'true');
    if ($('startBarDesktopLabel')) $('startBarDesktopLabel').textContent = 'Desktop Mode: ON';
    toast('Desktop mode activated');
  } else {
    document.body.classList.remove('desktop-mode-active');
    localStorage.setItem('admin_desktop_mode', 'false');
    if ($('startBarDesktopLabel')) $('startBarDesktopLabel').textContent = 'Desktop Mode: OFF';
    toast('Mobile-friendly mode activated');
  }
}

function toggleDesktopMode() {
  const isDesktop = document.body.classList.contains('desktop-mode-active');
  setDesktopMode(!isDesktop);
}

$('desktopModeBtn')?.addEventListener('click', toggleDesktopMode);
$('startBarDesktopBtn')?.addEventListener('click', toggleDesktopMode);

// Initialize Admin Guard and Lifecycle
(async function guard() {
  // Apply saved desktop mode state
  if (localStorage.getItem('admin_desktop_mode') === 'true') {
    setDesktopMode(true);
  }

  const user = await API.me();
  if (!user) return location.replace('/auth.html');
  if (!isAdmin(user)) return location.replace('/');
  document.body.classList.remove('auth-protected');
  document.body.classList.add('auth-ready');

  const ownerBadge = $('ownerBadge');
  if (ownerBadge) {
    ownerBadge.textContent = (user.email || 'muhebrewwinston@gmail.com') + ' (Owner)';
  }

  // Header and Start Bar Sign-out triggers
  $('adminSignOutBtn')?.addEventListener('click', doSignOut);
  $('startBarSignOutBtn')?.addEventListener('click', doSignOut);

  // Start Bar Triggers
  $('adminDrawerOpenBtn')?.addEventListener('click', openStartBar);
  $('adminDrawerCloseBtn')?.addEventListener('click', closeStartBar);
  $('adminDrawerBackdrop')?.addEventListener('click', closeStartBar);

  // Logo Brand: clicking stays on First Page (Dashboard)
  $('adminLogoBrand')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('view-dashboard');
  });

  // Initial Load for First Page
  loadStats();
  initServerTelemetry();
  loadPendingBadgesOnly();
  loadGitStatus();
})();

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
}

$('themeBtn')?.addEventListener('click', toggleTheme);

// ============================================================================
// REAL SERVER MONITOR CHARTS (MATCHING USER SCREENSHOT: CPU, RAM, NETWORK)
// "CPU, RAM and Network under live server should shown in bars like how it shown it real server"
// ============================================================================

function generateAreaChartSvgPaths(dataPoints, maxY, width = 300, height = 120) {
  if (!dataPoints || dataPoints.length < 2) {
    return {
      line: `M 0,${height} L ${width},${height}`,
      area: `M 0,${height} L ${width},${height} Z`,
      lastCoord: { x: width, y: height }
    };
  }

  const n = dataPoints.length;
  const safeMax = Math.max(maxY, 0.01);
  const coords = dataPoints.map((val, idx) => {
    const x = (idx / (n - 1)) * width;
    const clamped = Math.max(0, Math.min(val, safeMax));
    const y = height - (clamped / safeMax) * (height - 12);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  const lineD = 'M ' + coords.map((c) => `${c.x},${c.y}`).join(' L ');
  const areaD = `M ${coords[0].x},${height} L ` + coords.map((c) => `${c.x},${c.y}`).join(' L ') + ` L ${coords[coords.length - 1].x},${height} Z`;

  return { line: lineD, area: areaD, lastCoord: coords[coords.length - 1] };
}

function updateServerCharts(history, currentStats) {
  if (!currentStats) return;

  // 1. CPU Chart (Real OS CPU: Scale 0 to maxCpuPercent e.g. 200%)
  const maxCpu = (currentStats.cpu && currentStats.cpu.maxPercent) ? currentStats.cpu.maxPercent : 200;
  const cpuPoints = (history && history.cpu && history.cpu.length >= 2)
    ? history.cpu
    : [1.0, 1.2, 1.5, 1.1, 1.4];
  const cpuPaths = generateAreaChartSvgPaths(cpuPoints, maxCpu, 300, 120);

  const cpuLine = $('cpuLinePath');
  const cpuArea = $('cpuAreaPath');
  if (cpuLine) cpuLine.setAttribute('d', cpuPaths.line);
  if (cpuArea) cpuArea.setAttribute('d', cpuPaths.area);

  const curCpuVal = (currentStats.cpu && typeof currentStats.cpu.currentPercent === 'number')
    ? currentStats.cpu.currentPercent
    : (cpuPoints[cpuPoints.length - 1] || 0);

  if ($('liveCpuBadge')) $('liveCpuBadge').textContent = `${curCpuVal.toFixed(2)}%`;
  if ($('cpuYAxis')) {
    $('cpuYAxis').innerHTML = `<span>${maxCpu.toFixed(2)}%</span><span>${(maxCpu / 2).toFixed(2)}%</span><span>0.00%</span>`;
  }
  if ($('cpuPulseCircle') && cpuPaths.lastCoord) {
    $('cpuPulseCircle').setAttribute('cx', cpuPaths.lastCoord.x);
    $('cpuPulseCircle').setAttribute('cy', cpuPaths.lastCoord.y);
  }
  if ($('cpuPulseRing') && cpuPaths.lastCoord) {
    $('cpuPulseRing').setAttribute('cx', cpuPaths.lastCoord.x);
    $('cpuPulseRing').setAttribute('cy', cpuPaths.lastCoord.y);
  }

  // 2. RAM / MEMORY Chart (Real Host 4GB RAM Scale: 0 to 4.00 GiB)
  const memData = currentStats.memory || {};
  const totalRamGiB = memData.totalGiB || 4.00;
  const usedRamGiB = typeof memData.usedGiB === 'number' ? memData.usedGiB : 0.26;

  const ramPoints = (history && history.ram && history.ram.length >= 2)
    ? history.ram
    : [usedRamGiB, usedRamGiB];
  const ramPaths = generateAreaChartSvgPaths(ramPoints, totalRamGiB, 300, 120);

  const ramLine = $('ramLinePath');
  const ramArea = $('ramAreaPath');
  if (ramLine) ramLine.setAttribute('d', ramPaths.line);
  if (ramArea) ramArea.setAttribute('d', ramPaths.area);

  if ($('liveRamBadge')) {
    $('liveRamBadge').textContent = memData.displayLabel || `${usedRamGiB.toFixed(2)} GiB / ${totalRamGiB.toFixed(2)} GiB`;
  }
  if ($('ramYAxis')) {
    $('ramYAxis').innerHTML = `<span>${totalRamGiB.toFixed(2)} GiB</span><span>${(totalRamGiB / 2).toFixed(2)} GiB</span><span>0.00 GiB</span>`;
  }
  if ($('ramPulseCircle') && ramPaths.lastCoord) {
    $('ramPulseCircle').setAttribute('cx', ramPaths.lastCoord.x);
    $('ramPulseCircle').setAttribute('cy', ramPaths.lastCoord.y);
  }
  if ($('ramPulseRing') && ramPaths.lastCoord) {
    $('ramPulseRing').setAttribute('cx', ramPaths.lastCoord.x);
    $('ramPulseRing').setAttribute('cy', ramPaths.lastCoord.y);
  }

  // 3. NETWORK Activity Chart (Real Throughput & Network I/O)
  const netData = currentStats.network || {};
  const netPoints = (history && history.network && history.network.length >= 2)
    ? history.network
    : [0.02, 0.04, 0.03];

  const highestSample = Math.max(...netPoints, 0.1);
  const netMaxAxis = highestSample > 30 ? 66.76 : (highestSample > 5 ? 10.00 : (highestSample > 1 ? 2.50 : 1.00));
  const netPaths = generateAreaChartSvgPaths(netPoints, netMaxAxis, 300, 120);

  const netLine = $('netLinePath');
  const netArea = $('netAreaPath');
  if (netLine) netLine.setAttribute('d', netPaths.line);
  if (netArea) netArea.setAttribute('d', netPaths.area);

  if ($('netInboundSpeed')) $('netInboundSpeed').textContent = netData.inboundSpeed || '0.00 KiB/s';
  if ($('netOutboundSpeed')) $('netOutboundSpeed').textContent = netData.outboundSpeed || '0.00 KiB/s';
  if ($('netYAxis')) {
    $('netYAxis').innerHTML = `<span>${netMaxAxis.toFixed(2)} MiB</span><span>${(netMaxAxis / 2).toFixed(2)} MiB</span><span>0.00 MiB</span>`;
  }
  if ($('netPulseCircle') && netPaths.lastCoord) {
    $('netPulseCircle').setAttribute('cx', netPaths.lastCoord.x);
    $('netPulseCircle').setAttribute('cy', netPaths.lastCoord.y);
  }
  if ($('netPulseRing') && netPaths.lastCoord) {
    $('netPulseRing').setAttribute('cx', netPaths.lastCoord.x);
    $('netPulseRing').setAttribute('cy', netPaths.lastCoord.y);
  }
}

async function initServerTelemetry() {
  fetchServerStats();
  fetchServerLogs();

  if (telemetryPollInterval) clearInterval(telemetryPollInterval);
  // Real 1-second live telemetry polling interval for moving graphs
  telemetryPollInterval = setInterval(() => {
    if (!isLogStreamPaused) {
      fetchServerStats();
      if (currentActiveView === 'view-server') {
        fetchServerLogs();
      }
    }
  }, 1000);

  $('btnRefreshServerStats')?.addEventListener('click', () => {
    fetchServerStats();
    fetchServerLogs();
    toast('Server stats refreshed');
  });

  $('btnToggleLogStream')?.addEventListener('click', () => {
    isLogStreamPaused = !isLogStreamPaused;
    const btn = $('btnToggleLogStream');
    const indicator = $('serverLiveIndicator');
    if (btn) {
      btn.textContent = isLogStreamPaused ? 'Resume' : 'Pause';
      btn.style.color = isLogStreamPaused ? '#fbbf24' : '#e2e8f0';
    }
    if (indicator) {
      indicator.innerHTML = isLogStreamPaused
        ? '<span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block"></span> <span>PAUSED</span>'
        : '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block"></span> <span>ONLINE · LIVE</span>';
    }
  });

  $('btnClearTerminalLogs')?.addEventListener('click', async () => {
    try {
      await API.post('/admin/clear-logs', {});
      const screen = $('serverTerminalScreen');
      if (screen) {
        screen.innerHTML = '<div class="terminal-line"><span class="terminal-time">[' + new Date().toLocaleTimeString() + ']</span> <span class="terminal-tag info">INFO</span> <span class="terminal-text">Console output cleared.</span></div>';
      }
      toast('Console logs cleared');
    } catch (_) {}
  });
}

async function fetchServerStats() {
  try {
    const res = await fetch(`${API.base}/admin/system-stats`, {
      headers: { Authorization: `Bearer ${API.token()}` }
    });
    if (!res.ok) return;
    const s = await res.json();
    updateServerCharts(s.history, s);
    if ($('serverLiveTicker')) {
      $('serverLiveTicker').textContent = 'Live · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } catch (_) {}
}

async function fetchServerLogs() {
  const screen = $('serverTerminalScreen');
  if (!screen) return;

  try {
    const res = await fetch(`${API.base}/admin/server-logs?since=${lastLogIdSeen}&limit=60`, {
      headers: { Authorization: `Bearer ${API.token()}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const newLogs = data.logs || [];

    if (newLogs.length > 0) {
      if (lastLogIdSeen === 0 && screen.children.length === 1 && screen.textContent.includes('Initializing')) {
        screen.innerHTML = '';
      }

      for (const log of newLogs) {
        if (log.id > lastLogIdSeen) lastLogIdSeen = log.id;
        const line = document.createElement('div');
        line.className = 'terminal-line';

        const tagClass = (log.level || 'info').toLowerCase();
        line.innerHTML = `
          <span class="terminal-time">[${esc(log.timeFormatted || log.timestamp.slice(11, 19))}]</span>
          <span class="terminal-tag ${tagClass}">${esc(log.level)}</span>
          <span class="terminal-text">${esc(log.message)}</span>
        `;
        screen.appendChild(line);
      }

      while (screen.children.length > 150) {
        screen.removeChild(screen.firstChild);
      }

      const chk = $('chkAutoScroll');
      if (!chk || chk.checked) {
        screen.scrollTop = screen.scrollHeight;
      }
    }
  } catch (_) {}
}

// ============================================================================
// DEDICATED DATABASE MANAGEMENT PAGE
// "and include database bar on the start"
// ============================================================================
async function loadDatabaseStats() {
  try {
    const res = await fetch(`${API.base}/admin/database-stats`, {
      headers: { Authorization: `Bearer ${API.token()}` }
    });
    if (!res.ok) return;
    const d = await res.json();

    if ($('dbStatsSize')) $('dbStatsSize').textContent = d.dbSizeFormatted || '4 KB';
    if ($('dbStatsTables')) $('dbStatsTables').textContent = (d.tables ? d.tables.length : 6);
    const totalRows = (d.tables || []).reduce((acc, t) => acc + t.rows, 0);
    if ($('dbStatsTotalRows')) $('dbStatsTotalRows').textContent = totalRows.toLocaleString();

    const tbody = $('dbTablesBody');
    if (tbody && d.tables) {
      const descriptions = {
        papers: 'Past exam papers, questions, and marking schemes',
        books: 'Curriculum textbooks, student books, and guides',
        users: 'Registered students, teachers, and system administrators',
        downloads: 'Download audit logs and user quota transactions',
        bookmarks: 'Saved user favorite papers and books',
        reports: 'Student issue reports and help requests'
      };

      tbody.innerHTML = d.tables.map((t) => `
        <tr>
          <td><code style="font-weight:700;color:var(--primary)">${esc(t.name)}</code></td>
          <td><b>${t.rows.toLocaleString()}</b> rows</td>
          <td style="color:var(--muted);font-size:12px">${esc(descriptions[t.name] || 'Application table')}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Database stats error:', err);
  }
}

$('btnOptimizeDb')?.addEventListener('click', async () => {
  const btn = $('btnOptimizeDb');
  btn.disabled = true;
  btn.textContent = 'Optimizing...';
  try {
    const res = await API.post('/admin/database-optimize', {});
    toast(res.message || 'Database optimized cleanly');
    loadDatabaseStats();
  } catch (err) {
    alert(`Optimization notice: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Optimize (VACUUM)';
  }
});

$('btnRefreshDbStats')?.addEventListener('click', () => {
  loadDatabaseStats();
  toast('Database stats refreshed');
});

// ============================================================================
// FIRST PAGE: LIBRARY STATS & FLIPPED FAVORITE BOOKS & PAPERS
// ============================================================================
async function loadStats() {
  try {
    const s = await API.get('/admin/stats');
    if ($('sUsers')) $('sUsers').textContent = s.users.toLocaleString();
    if ($('sDl')) $('sDl').textContent = s.downloads.toLocaleString();
    if ($('sPapers')) $('sPapers').textContent = s.papers.toLocaleString();
    if ($('sBooks')) $('sBooks').textContent = s.books.toLocaleString();
    if ($('s7')) $('s7').textContent = s.last7.toLocaleString() + ' downloads';

    if (s.drime && $('drimeCloudCount')) {
      $('drimeCloudCount').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> <b>${s.drime.totalCloudFiles} files</b> synced on Drime Cloud (Folder: <code style="word-break:break-all;overflow-wrap:anywhere">${esc(s.drime.folderId)}</code>)`;
    }

    allFavoriteBooks = s.favoriteBooks || [];
    favBooksPage = 0;
    renderFavBooksFlipped();

    allFavoritePapers = s.favoritePapers || [];
    favPapersPage = 0;
    renderFavPapersFlipped();
  } catch (err) {
    console.error('Stats error:', err);
  }
}

function renderFavBooksFlipped() {
  const container = $('favoriteBooksList');
  const indicator = $('favBooksPageIndicator');
  const btnPrev = $('btnFavBooksPrev');
  const btnNext = $('btnFavBooksNext');
  if (!container) return;

  if (!allFavoriteBooks.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">No textbooks uploaded yet.</p>';
    if (indicator) indicator.textContent = '0 / 0';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(allFavoriteBooks.length / favBooksPageSize) || 1;
  if (favBooksPage >= totalPages) favBooksPage = totalPages - 1;
  if (favBooksPage < 0) favBooksPage = 0;

  if (indicator) indicator.textContent = `${favBooksPage + 1} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = favBooksPage === 0;
  if (btnNext) btnNext.disabled = favBooksPage >= totalPages - 1;

  const startIdx = favBooksPage * favBooksPageSize;
  const pageItems = allFavoriteBooks.slice(startIdx, startIdx + favBooksPageSize);

  container.innerHTML = pageItems.map((b, idx) => {
    const globalRank = startIdx + idx + 1;
    const cleanTitle = b.title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').trim();
    return `
      <div class="flipped-item-row">
        <span style="font-weight:700;color:var(--primary);font-size:13px;width:22px;text-align:center">#${globalRank}</span>
        <div style="width:34px;height:44px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--border);flex-shrink:0;position:relative">
          <img src="${b.cover_path ? ('/' + esc(b.cover_path)) : ('/api/books/' + b.id + '/thumbnail')}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='grid'">
          <div style="display:none;width:100%;height:100%;place-items:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <span style="font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cleanTitle)}</span>
          <span style="font-size:11.5px;color:var(--muted)">${esc(b.subject)} · ${esc(b.level)}</span>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${b.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime</span>' : ''}
          <span class="tag ok" style="font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${b.downloads.toLocaleString()} dl</span>
        </div>
      </div>
    `;
  }).join('');
}

$('btnFavBooksPrev')?.addEventListener('click', () => {
  if (favBooksPage > 0) {
    favBooksPage--;
    renderFavBooksFlipped();
  }
});
$('btnFavBooksNext')?.addEventListener('click', () => {
  const totalPages = Math.ceil(allFavoriteBooks.length / favBooksPageSize) || 1;
  if (favBooksPage < totalPages - 1) {
    favBooksPage++;
    renderFavBooksFlipped();
  }
});

function renderFavPapersFlipped() {
  const container = $('favoritePapersList');
  const indicator = $('favPapersPageIndicator');
  const btnPrev = $('btnFavPapersPrev');
  const btnNext = $('btnFavPapersNext');
  if (!container) return;

  if (!allFavoritePapers.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">No past papers uploaded yet.</p>';
    if (indicator) indicator.textContent = '0 / 0';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(allFavoritePapers.length / favPapersPageSize) || 1;
  if (favPapersPage >= totalPages) favPapersPage = totalPages - 1;
  if (favPapersPage < 0) favPapersPage = 0;

  if (indicator) indicator.textContent = `${favPapersPage + 1} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = favPapersPage === 0;
  if (btnNext) btnNext.disabled = favPapersPage >= totalPages - 1;

  const startIdx = favPapersPage * favPapersPageSize;
  const pageItems = allFavoritePapers.slice(startIdx, startIdx + favPapersPageSize);

  container.innerHTML = pageItems.map((p, idx) => {
    const globalRank = startIdx + idx + 1;
    const isMarking = (p.category || '').toLowerCase().includes('mark') || (p.title || '').toLowerCase().includes('mark');
    const boardTag = isMarking ? 'KEY' : (p.exam_board ? p.exam_board.toUpperCase().slice(0, 6) : 'MANEB');
    const headerCls = isMarking ? 'key' : (boardTag.includes('MOCK') ? 'mock' : 'maneb');
    const cleanTitle = p.title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').trim();

    return `
      <div class="flipped-item-row">
        <span style="font-weight:700;color:var(--primary);font-size:13px;width:22px;text-align:center">#${globalRank}</span>
        <div style="width:34px;height:44px;border-radius:6px;overflow:hidden;background:#fff;border:1px solid var(--border);flex-shrink:0;position:relative">
          <img src="${p.cover_path ? ('/' + esc(p.cover_path)) : ('/api/papers/' + p.id + '/thumbnail')}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'">
          <div style="display:none;width:100%;height:100%;flex-direction:column">
            <div class="cover-sheet-header ${headerCls}" style="height:12px;font-size:6.5px">${esc(boardTag)}</div>
            <div class="cover-sheet-body" style="padding:1px"><div class="cover-sheet-subject" style="font-size:6.5px">${esc((p.subject||'').slice(0,5))}</div></div>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <span style="font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cleanTitle)}</span>
          <span style="font-size:11.5px;color:var(--muted)">${esc(p.subject)} · ${esc(p.level)} · ${esc(p.category || p.exam_board || '')}</span>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${p.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime</span>' : ''}
          <span class="tag ok" style="font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${p.downloads.toLocaleString()} dl</span>
        </div>
      </div>
    `;
  }).join('');
}

$('btnFavPapersPrev')?.addEventListener('click', () => {
  if (favPapersPage > 0) {
    favPapersPage--;
    renderFavPapersFlipped();
  }
});
$('btnFavPapersNext')?.addEventListener('click', () => {
  const totalPages = Math.ceil(allFavoritePapers.length / favPapersPageSize) || 1;
  if (favPapersPage < totalPages - 1) {
    favPapersPage++;
    renderFavPapersFlipped();
  }
});

// Load Start Bar counters
async function loadPendingBadgesOnly() {
  try {
    const { items } = await API.get('/admin/pending');
    const count = items ? items.length : 0;
    if ($('startBarPendingBadge')) $('startBarPendingBadge').textContent = count;
    if ($('pendingSectionBadge')) $('pendingSectionBadge').textContent = `${count} Pending`;

    const { users } = await API.get('/admin/users');
    const uCount = users ? users.length : 0;
    if ($('startBarUsersBadge')) $('startBarUsersBadge').textContent = uCount;
    if ($('usersCountBadge')) $('usersCountBadge').textContent = `${uCount} Users`;

    const { items: reports } = await API.get('/admin/reports');
    const openCount = reports ? reports.filter((i) => !i.resolved).length : 0;
    if ($('startBarIssuesBadge')) $('startBarIssuesBadge').textContent = openCount;
    if ($('issuesCountBadge')) $('issuesCountBadge').textContent = `${openCount} Open Issues`;
  } catch (_) {}
}

// ============================================================================
// DEDICATED PENDING TEACHERS REVIEW PAGE
// ============================================================================
async function loadPending() {
  const { items } = await API.get('/admin/pending');
  const count = items ? items.length : 0;
  if ($('startBarPendingBadge')) $('startBarPendingBadge').textContent = count;
  if ($('pendingSectionBadge')) $('pendingSectionBadge').textContent = `${count} Pending`;

  const pendingDiv = $('pending');
  if (!pendingDiv) return;

  pendingDiv.innerHTML = count
    ? tbl(['Title', 'Type', 'By', ''], items.map((r) => '<tr><td>' + esc(r.title) + '<br><small style="color:var(--muted)">' + esc(r.subject) + ' · ' + esc(r.level) + '</small></td><td>' +
        (r.t === 'papers' ? 'Paper' : 'Book') + '</td><td>' + esc(r.uploader || '-') + '</td><td style="white-space:nowrap">' +
        '<a class="btn sm" target="_blank" rel="noopener" href="' + API.base + '/' + r.t + '/' + r.id + '/preview?t=' + encodeURIComponent(API.token()) + '">Preview</a> ' +
        '<button class="btn sm primary" data-rv="approve:' + r.t + ':' + r.id + '">Approve</button> ' +
        '<button class="btn sm danger" data-rv="reject:' + r.t + ':' + r.id + '">Reject</button></td></tr>'))
    : '<p style="color:var(--muted);font-size:13px">Nothing waiting for review.</p>';
}

// ============================================================================
// DEDICATED REGISTERED USERS DIRECTORY PAGE
// ============================================================================
let cachedUsers = [];
async function loadUsers() {
  const { users } = await API.get('/admin/users');
  cachedUsers = users || [];
  renderUsersTable(cachedUsers);
}

function renderUsersTable(userList) {
  const count = userList.length;
  if ($('startBarUsersBadge')) $('startBarUsersBadge').textContent = count;
  if ($('usersCountBadge')) $('usersCountBadge').textContent = `${count} Users`;

  const tbody = document.querySelector('#usersTable tbody');
  if (tbody) {
    tbody.innerHTML = userList.map((u) =>
      '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td><select data-role="' + u.id + '">' +
      ['student', 'teacher', 'admin'].map((r) => '<option ' + (r === u.role ? 'selected' : '') + '>' + r + '</option>').join('') +
      '</select></td><td>' + esc(u.school || '-') + '</td><td>' + new Date(u.created_at + 'Z').toLocaleDateString() + '</td></tr>').join('');
  }
}

$('userSearchInput')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = cachedUsers.filter(u =>
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.school && u.school.toLowerCase().includes(q))
  );
  renderUsersTable(filtered);
});

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

// ============================================================================
// DEDICATED ISSUES & REPORTS PAGE
// ============================================================================
async function loadReports() {
  try {
    const { items } = await API.get('/admin/reports');
    const badge = $('issuesCountBadge');
    const openCount = items.filter((i) => !i.resolved).length;
    if (badge) {
      badge.textContent = openCount + ' Open Issue' + (openCount === 1 ? '' : 's');
      badge.className = openCount > 0 ? 'tag wait' : 'tag ok';
    }
    if ($('startBarIssuesBadge')) $('startBarIssuesBadge').textContent = openCount;

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

document.addEventListener('click', async (e) => {
  try {
    const rv = e.target.closest('[data-rv]');
    if (rv) {
      const [action, t, id] = rv.dataset.rv.split(':');
      if (action === 'reject' && !confirm('Reject and delete this upload?')) return;
      await API.post('/admin/review/' + t + '/' + id, { action });
      toast(action === 'approve' ? 'Approved' : 'Rejected');
      loadPending(); loadStats();
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
      loadReports(); loadStats();
    }
  } catch (err) { toast(err.message, true); }
});

// ============================================================================
// DEDICATED WEB PROGRESSION ACTIVITY PAGE (FLIPPED CARDS)
// ============================================================================
async function loadProgression() {
  try {
    progressionData = await API.get('/admin/progression');
    progPage = 0;
    renderProgressionFlipped();
  } catch (err) {
    console.error('Progression error:', err);
  }
}

function renderProgressionFlipped() {
  const container = $('progressionContent');
  const indicator = $('progPageIndicator');
  const label = $('progressionActiveLabel');
  const btnPrev = $('btnProgPrev');
  const btnNext = $('btnProgNext');
  if (!container) return;

  let currentList = [];
  if (activeProgTab === 'dl') {
    currentList = progressionData.downloads || [];
    if (label) label.textContent = 'Recent Downloads (Live Activity)';
  } else if (activeProgTab === 'users') {
    currentList = progressionData.signups || [];
    if (label) label.textContent = 'New Signups (Registered Accounts)';
  } else {
    currentList = progressionData.uploads || [];
    if (label) label.textContent = 'Recent Uploads (Published Resources)';
  }

  if (!currentList.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">No activity recorded in this category yet.</p>';
    if (indicator) indicator.textContent = '0 / 0';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(currentList.length / progPageSize) || 1;
  if (progPage >= totalPages) progPage = totalPages - 1;
  if (progPage < 0) progPage = 0;

  if (indicator) indicator.textContent = `${progPage + 1} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = progPage === 0;
  if (btnNext) btnNext.disabled = progPage >= totalPages - 1;

  const startIdx = progPage * progPageSize;
  const pageItems = currentList.slice(startIdx, startIdx + progPageSize);

  if (activeProgTab === 'dl') {
    container.innerHTML = pageItems.map((d) => `
      <div class="flipped-item-row">
        <div style="flex:1;min-width:0">
          <span style="font-weight:700;color:var(--primary);display:inline-flex;align-items:center;gap:4px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Downloaded:
          </span>
          <b>${esc(d.item_title)}</b>
          <div style="font-size:11px;color:var(--muted)">By ${esc(d.user_name || d.user_email || 'Student')}</div>
        </div>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap">${new Date(d.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('');
  } else if (activeProgTab === 'users') {
    container.innerHTML = pageItems.map((u) => `
      <div class="flipped-item-row">
        <div>
          <b>${esc(u.name)}</b> <span class="tag" style="font-size:10px">${esc(u.role)}</span>
          <div style="font-size:11px;color:var(--muted)">${esc(u.email)} ${u.school ? '· ' + esc(u.school) : ''}</div>
        </div>
        <span style="font-size:11px;color:var(--muted)">${new Date(u.created_at + 'Z').toLocaleDateString()}</span>
      </div>
    `).join('');
  } else {
    container.innerHTML = pageItems.map((up) => `
      <div class="flipped-item-row">
        <div>
          <b>${esc(up.title)}</b> <span class="tag ok" style="font-size:10px">${esc(up.t)}</span>
          ${up.storage_provider === 'drime' ? '<span class="tag" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:10px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Drime</span>' : ''}
          <div style="font-size:11px;color:var(--muted)">${esc(up.subject)} · ${esc(up.level)}</div>
        </div>
        <span style="font-size:11px;color:var(--muted)">${new Date(up.created_at + 'Z').toLocaleDateString()}</span>
      </div>
    `).join('');
  }
}

$('btnProgPrev')?.addEventListener('click', () => {
  if (progPage > 0) {
    progPage--;
    renderProgressionFlipped();
  }
});
$('btnProgNext')?.addEventListener('click', () => {
  let list = activeProgTab === 'dl' ? (progressionData.downloads || []) : (activeProgTab === 'users' ? (progressionData.signups || []) : (progressionData.uploads || []));
  const totalPages = Math.ceil(list.length / progPageSize) || 1;
  if (progPage < totalPages - 1) {
    progPage++;
    renderProgressionFlipped();
  }
});

$('progTabDl')?.addEventListener('click', () => {
  activeProgTab = 'dl';
  progPage = 0;
  $('progTabDl').className = 'btn sm primary';
  $('progTabUsers').className = 'btn sm';
  $('progTabUploads').className = 'btn sm';
  renderProgressionFlipped();
});

$('progTabUsers')?.addEventListener('click', () => {
  activeProgTab = 'users';
  progPage = 0;
  $('progTabDl').className = 'btn sm';
  $('progTabUsers').className = 'btn sm primary';
  $('progTabUploads').className = 'btn sm';
  renderProgressionFlipped();
});

$('progTabUploads')?.addEventListener('click', () => {
  activeProgTab = 'uploads';
  progPage = 0;
  $('progTabDl').className = 'btn sm';
  $('progTabUsers').className = 'btn sm';
  $('progTabUploads').className = 'btn sm primary';
  renderProgressionFlipped();
});

// ============================================================================
// RESOURCE UPLOADS (BULK MULTI-UPLOAD & SINGLE FILE)
// ============================================================================
$('modeTabBulk')?.addEventListener('click', () => {
  $('modeTabBulk').classList.add('primary');
  $('modeTabSingle')?.classList.remove('primary');
  if ($('bulkUploadPanel')) $('bulkUploadPanel').style.display = 'block';
  if ($('uploadForm')) $('uploadForm').style.display = 'none';
});

$('modeTabSingle')?.addEventListener('click', () => {
  $('modeTabSingle').classList.add('primary');
  $('modeTabBulk')?.classList.remove('primary');
  if ($('bulkUploadPanel')) $('bulkUploadPanel').style.display = 'none';
  if ($('uploadForm')) $('uploadForm').style.display = 'grid';
});

$('uType')?.addEventListener('change', () => {
  const val = $('uType').value;
  const isBook = val === 'book';
  $('yearWrap').hidden = isBook;
  $('boardWrap').hidden = isBook;
  $('authorWrap').hidden = !isBook;
  $('publisherWrap').hidden = !isBook;
  $('coverWrap').hidden = !isBook;

  if (isBook) {
    $('uCategory').value = 'MSCE';
  } else {
    $('uCategory').value = 'MANEB';
  }
});

$('uFile')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const traced = clientAutoTrace(file.name, file.size);
  if ($('uTitle')) $('uTitle').value = traced.title;
  if ($('uSubject')) $('uSubject').value = traced.subject;
  if ($('uLevel')) $('uLevel').value = traced.level;
  if ($('uCategory')) $('uCategory').value = traced.category;
  if ($('uType')) {
    $('uType').value = traced.type === 'books' ? 'book' : 'paper';
    $('uType').dispatchEvent(new Event('change'));
  }
  if ($('uYear')) $('uYear').value = traced.year;
  if ($('uBoard')) $('uBoard').value = traced.exam_board;
  toast(`Auto-traced: ${traced.subject} (${traced.level}, ${traced.year})`);
});

function clientAutoTrace(filename, size = 0) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  const cleanSpacing = nameWithoutExt.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = cleanSpacing.toLowerCase();

  const subjectPatterns = [
    { name: 'Physical Science', regex: /\b(physical\s*science|phys\s*sci|p\/s)\b/i },
    { name: 'Physics', regex: /\b(physics|phys|phy)\b/i },
    { name: 'Chemistry', regex: /\b(chemistry|chem|chm)\b/i },
    { name: 'Biology', regex: /\b(biology|biol?|bio)\b/i },
    { name: 'Mathematics', regex: /\b(math|maths|mathematics|algebra|geometry|mth)\b/i },
    { name: 'English', regex: /\b(english|grammar|literature|eng)\b/i },
    { name: 'Chichewa', regex: /\b(chichewa|chi\s*chewa|chinyanja|chic|chich)\b/i },
    { name: 'Geography', regex: /\b(geography|geog?|geo)\b/i },
    { name: 'History', regex: /\b(history|hist)\b/i },
    { name: 'Agriculture', regex: /\b(agriculture|agric?|agr)\b/i },
    { name: 'Social Studies', regex: /\b(social\s*studies|social|soc)\b/i },
    { name: 'Life Skills', regex: /\b(life\s*skills|life|ls)\b/i },
    { name: 'Computer Studies', regex: /\b(computer\s*studies|computer|ict|computing|cs)\b/i },
    { name: 'Bible Knowledge', regex: /\b(bible\s*knowledge|bible|bk|b\.k|religious|cre)\b/i },
    { name: 'Business Studies', regex: /\b(business\s*studies|business|bus|biz)\b/i },
    { name: 'Commerce', regex: /\b(commerce|comm)\b/i },
    { name: 'Home Economics', regex: /\b(home\s*economics|nutrition|he)\b/i },
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
  if (/\b(form\s*1|f1|grade\s*9)\b/i.test(lower)) detectedLevel = 'Form 1';
  else if (/\b(form\s*2|f2|grade\s*10|jce)\b/i.test(lower)) detectedLevel = 'Form 2';
  else if (/\b(form\s*3|f3|grade\s*11)\b/i.test(lower)) detectedLevel = 'Form 3';
  else if (/\b(form\s*4|f4|grade\s*12|msce)\b/i.test(lower)) detectedLevel = 'Form 4';

  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  const detectedYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  let detectedType = 'papers';
  let detectedCategory = 'MANEB';
  let examBoard = 'MANEB';

  const isMarkingKey = /\b(marking\s*key|marking\s*scheme|mark\s*scheme|marking|answers?|solution|key)\b/i.test(lower);
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

  const paperMatch = cleanSpacing.match(/\b(?:paper|p|pp)\s*([1-4]|i{1,3})\b/i);
  const paperStr = paperMatch ? ` Paper ${paperMatch[1].toUpperCase()}` : '';

  let title = cleanSpacing;
  if (detectedCategory === 'Marking Key') {
    title = `Marking Key - ${detectedSubject}${paperStr} ${detectedYear}`;
  } else if (detectedCategory === 'Notes') {
    title = `${detectedSubject} Study Revision Notes`;
  } else if (detectedType === 'books') {
    title = `${detectedSubject} Textbook`;
  } else {
    const prefix = isMock ? 'Cluster Mock' : 'MANEB';
    title = `${prefix} ${detectedSubject}${paperStr} ${detectedYear}`;
  }

  title = title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').replace(/\s+Form\s*[1-4]\s*$/i, '').trim();

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

// Bulk Upload State
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
  if (bulkQueue.length === 0 && $('bulkProgressWrapper')) {
    $('bulkProgressWrapper').hidden = true;
  }
};

function renderBulkQueue() {
  const container = $('bulkQueueContainer');
  const list = $('bulkQueueList');
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

const dropzone = $('bulkDropzone');
const fileInput = $('bulkFileInput');

if (dropzone && fileInput) {
  dropzone.addEventListener('click', () => fileInput.click());
  $('bulkSelectBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  $('bulkAddMoreBtn')?.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    addFilesToQueue(e.target.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files) {
      addFilesToQueue(e.dataTransfer.files);
    }
  });
}

$('bulkClearBtn')?.addEventListener('click', () => {
  if (confirm('Clear all items in the queue?')) {
    bulkQueue = [];
    renderBulkQueue();
    if ($('bulkProgressWrapper')) $('bulkProgressWrapper').hidden = true;
  }
});

$('bulkQuickLevel')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (!val) return;
  bulkQueue.forEach(item => { item.level = val; });
  renderBulkQueue();
  toast(`All files set to ${val}`);
});

$('bulkQuickCategory')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (!val) return;
  bulkQueue.forEach(item => {
    item.category = val;
    if (val === 'MSCE' || val === 'JCE') item.type = 'books';
    else item.type = 'papers';
  });
  renderBulkQueue();
  toast(`All files set to ${val}`);
});

$('bulkPublishBtn')?.addEventListener('click', async () => {
  const readyItems = bulkQueue.filter(i => i.status !== 'success');
  if (readyItems.length === 0) {
    return alert('All files have already been published!');
  }

  const pWrap = $('bulkProgressWrapper');
  const pBar = $('bulkProgressBar');
  const pPercent = $('bulkProgressPercent');
  const pTitle = $('bulkProgressTitle');
  const pSub = $('bulkProgressSub');
  const btn = $('bulkPublishBtn');

  if (pWrap) pWrap.hidden = false;
  if (btn) btn.disabled = true;

  let completed = 0;
  const total = readyItems.length;

  for (let i = 0; i < bulkQueue.length; i++) {
    const item = bulkQueue[i];
    if (item.status === 'success') continue;

    item.status = 'uploading';
    renderBulkQueue();

    if (pTitle) pTitle.textContent = `Publishing [${completed + 1}/${total}]: ${item.title}`;
    if (pSub) pSub.textContent = `Uploading file to Drime Cloud Storage...`;

    try {
      const fd = new FormData();
      fd.append('title', item.title);
      fd.append('subject', item.subject);
      fd.append('level', item.level);
      fd.append('category', item.category);
      fd.append('year', item.year);
      fd.append('exam_board', item.exam_board || item.category);
      if (item.type === 'books') {
        fd.append('author', item.author || 'Ministry of Education');
      }
      fd.append('file', item.file);

      const endpoint = item.type === 'books' ? '/books' : '/papers';
      await API.upload(endpoint, fd);

      item.status = 'success';
      item.error = null;
    } catch (err) {
      item.status = 'error';
      item.error = err.message || 'Upload failed';
    }

    completed++;
    const pct = Math.round((completed / total) * 100);
    if (pBar) pBar.style.width = `${pct}%`;
    if (pPercent) pPercent.textContent = `${pct}%`;
    renderBulkQueue();
  }

  if (btn) btn.disabled = false;
  if (pTitle) pTitle.textContent = 'Batch Publishing Complete!';
  if (pSub) pSub.textContent = `Successfully processed ${total} file(s). Files synced to Drime Cloud!`;
  toast('Bulk upload batch finished!');
  loadStats();
});

// Single Resource Upload Handler
$('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('uSubmit');
  const pWrap = $('uSingleProgressWrapper');
  const pBar = $('uSingleProgressBar');
  const pPercent = $('uSingleProgressPercent');
  const pTitle = $('uSingleProgressTitle');
  const pSub = $('uSingleProgressSub');

  const fileInput = $('uFile');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    return alert('Please select a document file to upload.');
  }

  btn.disabled = true;
  if (pWrap) pWrap.hidden = false;
  if (pBar) pBar.style.width = '20%';
  if (pPercent) pPercent.textContent = '20%';
  if (pTitle) pTitle.textContent = 'Analyzing and uploading file to server...';
  if (pSub) pSub.textContent = 'Preparing upload payload...';

  try {
    const isBook = $('uType').value === 'book';
    const endpoint = isBook ? '/books' : '/papers';
    const fd = new FormData();

    fd.append('title', $('uTitle').value.trim());
    fd.append('subject', $('uSubject').value);
    fd.append('level', $('uLevel').value);
    fd.append('category', $('uCategory').value);
    fd.append('description', $('uDesc').value.trim());
    if ($('uDrimeLink') && $('uDrimeLink').value.trim()) {
      fd.append('drime_url', $('uDrimeLink').value.trim());
    }

    if (isBook) {
      if ($('uAuthor').value.trim()) fd.append('author', $('uAuthor').value.trim());
      if ($('uPublisher').value.trim()) fd.append('publisher', $('uPublisher').value.trim());
      const cover = $('uCover').files[0];
      if (cover) fd.append('cover', cover);
    } else {
      if ($('uYear').value) fd.append('year', $('uYear').value);
      if ($('uBoard').value.trim()) fd.append('exam_board', $('uBoard').value.trim());
    }

    fd.append('file', fileInput.files[0]);

    if (pBar) pBar.style.width = '60%';
    if (pPercent) pPercent.textContent = '60%';
    if (pTitle) pTitle.textContent = 'Syncing to Drime Cloud Storage...';

    const res = await API.upload(endpoint, fd);

    if (pBar) pBar.style.width = '100%';
    if (pPercent) pPercent.textContent = '100%';
    if (pTitle) pTitle.textContent = 'Published & Live on Website!';
    if (pSub) pSub.textContent = 'File uploaded directly to Drime Cloud and added to library!';

    toast(res.message || 'Resource published successfully!');
    $('uploadForm').reset();
    setTimeout(() => { if (pWrap) pWrap.hidden = true; }, 3500);
    loadStats();
  } catch (err) {
    if (pTitle) pTitle.textContent = 'Upload Failed';
    if (pSub) pSub.textContent = err.message;
    alert(`Upload failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// Password Change Handler (Owner Account Security)
$('pwForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = $('pwCurrent').value;
  const newPassword = $('pwNew').value;
  try {
    await API.post('/auth/change-password', { currentPassword, newPassword });
    toast('Owner security credentials updated successfully!');
    $('pwForm').reset();
  } catch (err) {
    alert(`Password change failed: ${err.message}`);
  }
});

// Drime Cloud Sync Now
$('btnSyncDrime')?.addEventListener('click', async () => {
  const btn = $('btnSyncDrime');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> Syncing Muhebrew Folder...';
  try {
    const res = await fetch(`${API.base}/admin/sync-from-drime`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API.token()}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    if (data.ok) {
      alert(`Drime Cloud Sync Successful!\n• Folder: "${data.folderName || 'Muhebrew'}" (fngud8DkQTOTNvd1MmAXhszXKIm60k)\n• ${data.imported} new resource(s) imported\n• ${data.updated} resource(s) updated\n• ${data.removed || 0} file(s) removed\n• Total ${data.total} item(s) in Drime Cloud!`);
      if ($('drimeCloudCount')) {
        $('drimeCloudCount').innerHTML = `<b>Status:</b> ${data.total} item(s) active in library from Drime folder "Muhebrew".`;
      }
      loadStats();
    } else {
      alert(`Drime Sync Notice (${data.apiBase || 'https://app.drime.cloud/api/v1'}):\n${data.message || data.error || 'No files returned from Drime folder'}`);
    }
  } catch (err) {
    alert(`Drime Sync error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
});

// Git status and auto-deployment
async function loadGitStatus() {
  try {
    const res = await API.get('/admin/git-status');
    if ($('gitCommitHash')) $('gitCommitHash').textContent = res.current?.shortHash || 'v2.0.0';
    if ($('gitCommitDesc')) {
      const msg = res.current?.message || 'Updated';
      $('gitCommitDesc').textContent = msg.length > 40 ? msg.substring(0, 37) + '...' : msg;
    }
    if ($('webhookUrlInput')) $('webhookUrlInput').value = res.webhookUrl || `${location.origin}/api/webhook/github`;
    if ($('gitStatusBadge')) {
      if (res.hasUpdate) {
        $('gitStatusBadge').textContent = 'UPDATE AVAILABLE';
        $('gitStatusBadge').className = 'tag';
        $('gitStatusBadge').style.background = '#fef3c7';
        $('gitStatusBadge').style.color = '#b45309';
      } else {
        $('gitStatusBadge').textContent = 'UP TO DATE';
        $('gitStatusBadge').className = 'tag ok';
      }
    }
  } catch (err) {
    console.warn('Could not load git status:', err.message);
  }
}

$('btnToggleWebhookInfo')?.addEventListener('click', () => {
  const panel = $('gitWebhookDetails');
  if (panel) {
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';
    $('btnToggleWebhookInfo').textContent = isHidden ? 'Auto-Sync Settings ▴' : 'Auto-Sync Settings ▾';
  }
});

$('btnCopyWebhookUrl')?.addEventListener('click', () => {
  const input = $('webhookUrlInput');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      toast('✓ Webhook URL copied to clipboard!');
    }).catch(() => {
      document.execCommand('copy');
      toast('✓ Webhook URL copied!');
    });
  }
});

$('btnGitPull')?.addEventListener('click', async () => {
  const modal = $('gitPullModal');
  const statusEl = $('gitPullStatusText');
  const logEl = $('gitPullLogOutput');
  const reloadBtn = $('btnReloadAfterGit');

  if (modal) modal.hidden = false;
  if (statusEl) statusEl.textContent = 'Contacting GitHub repository & pulling latest code...';
  if (logEl) logEl.textContent = 'Executing: git fetch origin main && git reset --hard origin/main...';
  if (reloadBtn) reloadBtn.style.display = 'none';

  try {
    const res = await API.post('/admin/git-pull', { restart: false });
    if (res.ok) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#14532d;font-weight:700">✓ Server synced with GitHub successfully!</span>';
      if (logEl) logEl.textContent = res.logs || 'Git pull completed cleanly.';
      if (reloadBtn) reloadBtn.style.display = 'inline-flex';
      toast('✓ Server synced with GitHub!');
      loadGitStatus();
    } else {
      if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Sync failed: ' + esc(res.error || 'Unknown error') + '</span>';
      if (logEl) logEl.textContent = res.logs || res.error || 'Check server console for details.';
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Error: ' + esc(err.message) + '</span>';
  }
});

$('btnCloseGitModal')?.addEventListener('click', () => {
  if ($('gitPullModal')) $('gitPullModal').hidden = true;
});

$('btnReloadAfterGit')?.addEventListener('click', () => {
  location.reload();
});
