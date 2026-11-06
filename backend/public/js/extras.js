// Live download counter + clean in-app "report file" modal
// "When student is has click the report bar directly on uploaded file .. 
// should not shows the information of web like that on first page but should shows only the email of client"
(function () {
  // Create in-app report modal DOM once
  let reportModal = document.getElementById('reportFileModal');
  if (!reportModal) {
    reportModal = document.createElement('div');
    reportModal.id = 'reportFileModal';
    reportModal.className = 'modal';
    reportModal.hidden = true;
    reportModal.innerHTML = `
      <div class="modal-box" style="height:auto;max-height:90vh;max-width:440px;overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,0.3)">
        <div class="modal-bar">
          <div style="display:flex;align-items:center;gap:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <b style="font-size:14.5px;color:var(--text)">Report Issue with File</b>
          </div>
          <span class="spacer"></span>
          <button class="btn sm" id="rfCloseBtn" type="button" aria-label="Close">&times;</button>
        </div>
        <form id="reportFileForm" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
          <!-- Client Email Display: Shows ONLY client email, never web domain info -->
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--muted)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <span>Client / Student Email:</span>
              <span class="tag ok" style="font-size:10px;padding:2px 6px">Verified Client</span>
            </div>
            <b id="rfClientEmail" style="font-size:13.5px;color:var(--text);display:block;word-break:break-all">client@example.com</b>
            <input type="email" id="rfClientEmailInput" placeholder="Enter your email address" style="display:none;width:100%;margin-top:6px;padding:7px 10px;font-size:13px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
          </div>

          <div>
            <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Target Resource:</label>
            <b id="rfFileTitle" style="font-size:13.5px;color:var(--primary);display:block;line-height:1.3">-</b>
          </div>

          <div>
            <label for="rfReasonSelect" style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px">What is wrong with this file?</label>
            <select id="rfReasonSelect" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px" required>
              <option value="Missing or blank pages">Missing or blank pages</option>
              <option value="Wrong subject or class level">Wrong subject or class level</option>
              <option value="Corrupted file / won't open">Corrupted file / won't open</option>
              <option value="Incorrect exam year or marking key">Incorrect exam year or marking key</option>
              <option value="Blurry or unreadable text">Blurry or unreadable text</option>
              <option value="Other problem">Other problem</option>
            </select>
          </div>

          <div>
            <label for="rfDetailsInput" style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px">Additional Details (optional):</label>
            <textarea id="rfDetailsInput" rows="3" placeholder="Explain the problem (e.g. page 3 is cut off, wrong answers in marking scheme)..." style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;resize:vertical"></textarea>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
            <button type="button" class="btn sm" id="rfCancelBtn">Cancel</button>
            <button type="submit" class="btn sm primary" id="rfSubmitBtn" style="padding:6px 14px">Submit Report</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(reportModal);
  }

  let currentReportTarget = null;

  const closeReportModal = () => {
    reportModal.hidden = true;
    currentReportTarget = null;
  };

  document.getElementById('rfCloseBtn')?.addEventListener('click', closeReportModal);
  document.getElementById('rfCancelBtn')?.addEventListener('click', closeReportModal);
  reportModal.addEventListener('click', (e) => { if (e.target === reportModal) closeReportModal(); });

  document.addEventListener('click', async (e) => {
    // 1. Download counter click
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      const [coll, id] = dl.dataset.dl.split(':');
      const label = dl.closest('.card')?.querySelector('.dlcount');
      setTimeout(async () => {
        try {
          const r = await API.get('/' + coll + '/' + id);
          if (label && r && r.item) label.textContent = r.item.downloads.toLocaleString() + ' downloads';
        } catch (_) { /* ignore */ }
      }, 1500);
    }

    // 2. Report button click: open in-app modal (NO browser window.prompt!)
    const rp = e.target.closest('[data-rp]');
    if (rp) {
      e.preventDefault();
      const [coll, id] = rp.dataset.rp.split(':');
      currentReportTarget = { coll, id };

      const card = rp.closest('.card');
      const title = card ? (card.querySelector('h3')?.textContent || 'This file') : 'This file';
      const fileTitleEl = document.getElementById('rfFileTitle');
      if (fileTitleEl) fileTitleEl.textContent = title;

      // Determine client's email (persisted user)
      let clientEmail = '';
      try {
        const cachedUser = JSON.parse(localStorage.getItem('ph_user') || sessionStorage.getItem('ph_user') || '{}');
        if (cachedUser && cachedUser.email) clientEmail = cachedUser.email;
      } catch (_) {}

      if (!clientEmail) {
        const me = await API.me().catch(() => null);
        if (me && me.email) clientEmail = me.email;
      }

      const emailDisplay = document.getElementById('rfClientEmail');
      const emailInput = document.getElementById('rfClientEmailInput');

      if (clientEmail) {
        if (emailDisplay) {
          emailDisplay.textContent = clientEmail;
          emailDisplay.style.display = 'block';
        }
        if (emailInput) {
          emailInput.value = clientEmail;
          emailInput.style.display = 'none';
        }
      } else {
        if (emailDisplay) emailDisplay.style.display = 'none';
        if (emailInput) {
          emailInput.style.display = 'block';
          emailInput.value = '';
          emailInput.required = true;
        }
      }

      const detailsInput = document.getElementById('rfDetailsInput');
      if (detailsInput) detailsInput.value = '';
      const reasonSelect = document.getElementById('rfReasonSelect');
      if (reasonSelect) reasonSelect.selectedIndex = 0;

      reportModal.hidden = false;
    }
  });

  // Report form submit
  document.getElementById('reportFileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentReportTarget) return;

    const btn = document.getElementById('rfSubmitBtn');
    if (btn) btn.disabled = true;

    const reason = document.getElementById('rfReasonSelect')?.value || 'Broken file';
    const details = document.getElementById('rfDetailsInput')?.value.trim() || '';
    const emailInput = document.getElementById('rfClientEmailInput');
    const emailDisplay = document.getElementById('rfClientEmail');
    const email = (emailInput && emailInput.style.display !== 'none' ? emailInput.value.trim() : emailDisplay?.textContent) || '';

    try {
      await API.post('/' + currentReportTarget.coll + '/' + currentReportTarget.id + '/report', {
        reason,
        details,
        email
      });
      toast('✓ Report submitted! Admin team will check this file.');
      closeReportModal();
    } catch (err) {
      toast(err.message || 'Could not submit report.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();
