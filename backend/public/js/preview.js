// Interactive Document Previewer & Reader Access
// "and on preview bar should not doing the file but just give the access to check the file"
(function () {
  let modal = document.getElementById('previewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-box" style="height:min(90vh, 750px);max-width:540px;display:flex;flex-direction:column;box-shadow:0 16px 40px rgba(0,0,0,0.35)">
        <!-- Header Bar -->
        <div class="modal-bar" style="padding:10px 14px;gap:8px">
          <div style="flex:1;min-width:0">
            <b id="pvTitle" style="font-size:13.5px;color:var(--text);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Document Preview</b>
            <span id="pvSub" style="font-size:11px;color:var(--muted);display:block">Check document pages &amp; content</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <a class="btn sm primary" id="pvOpen" target="_blank" rel="noopener" style="font-size:11.5px;padding:4px 10px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
              <span>Check File &nearr;</span>
            </a>
            <button class="btn sm" id="pvClose" type="button" aria-label="Close Preview" style="font-size:11.5px;padding:4px 10px">Close</button>
          </div>
        </div>

        <!-- Document Viewer Body -->
        <div id="pvViewerBody" style="flex:1;position:relative;overflow:auto;background:var(--surface-2);display:flex;flex-direction:column;align-items:center;padding:12px;min-height:280px">
          
          <!-- Loading State -->
          <div id="pvLoading" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--surface-2);z-index:2">
            <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
            <span style="font-size:12.5px;color:var(--muted)">Loading document preview...</span>
          </div>

          <!-- Canvas for PDF.js Rendering & Instant Real Cover Display -->
          <div id="pvCanvasWrap" style="width:100%;display:flex;justify-content:center;overflow:auto">
            <img id="pvCoverImg" style="max-width:100%;max-height:480px;box-shadow:0 4px 14px rgba(0,0,0,0.15);border-radius:6px;background:#ffffff;display:none;object-fit:contain" alt="Document Cover Page" />
            <canvas id="pvCanvas" style="max-width:100%;box-shadow:0 4px 14px rgba(0,0,0,0.15);border-radius:6px;background:#ffffff;display:none"></canvas>
          </div>

          <!-- Fallback / Direct Access Card (If PDF.js cannot render on mobile or cloud URL) -->
          <div id="pvFallback" style="display:none;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 16px">
            <div style="width:52px;height:52px;border-radius:12px;background:rgba(20,83,45,0.1);display:grid;place-items:center;margin-bottom:12px">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <b id="pvFallbackTitle" style="font-size:15px;color:var(--text);margin-bottom:6px">Access Document to Check</b>
            <p style="font-size:12.5px;color:var(--muted);max-width:320px;margin:0 0 16px;line-height:1.4">
              Click below to view and check all pages of this document in your browser's viewer:
            </p>
            <a id="pvFallbackBtn" href="#" target="_blank" rel="noopener" class="btn primary" style="padding:10px 20px;font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Open &amp; Check Full File &nearr;</span>
            </a>
          </div>
        </div>

        <!-- Bottom Page Controls Bar (Visible when multi-page document rendered) -->
        <div id="pvPaginationBar" style="display:none;padding:8px 14px;border-top:1px solid var(--border);background:var(--surface);justify-content:space-between;align-items:center;gap:8px">
          <button type="button" class="btn sm" id="pvPrevPage" style="font-size:11.5px">&lsaquo; Prev</button>
          <span id="pvPageCount" style="font-size:12px;font-weight:600;color:var(--text)">Page 1 of 1</span>
          <button type="button" class="btn sm" id="pvNextPage" style="font-size:11.5px">Next &rsaquo;</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  let currentPdfDoc = null;
  let currentPageNum = 1;
  let totalPages = 1;
  let currentRenderTask = null;

  const closePreview = () => {
    modal.hidden = true;
    currentPdfDoc = null;
    currentPageNum = 1;
    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch (_) {}
      currentRenderTask = null;
    }
    const canvas = document.getElementById('pvCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
    }
  };

  document.getElementById('pvClose')?.addEventListener('click', closePreview);
  modal.addEventListener('click', (e) => { if (e.target === modal) closePreview(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });

  async function renderPage(num) {
    if (!currentPdfDoc) return;
    currentPageNum = num;

    const pageCountEl = document.getElementById('pvPageCount');
    const prevBtn = document.getElementById('pvPrevPage');
    const nextBtn = document.getElementById('pvNextPage');

    if (pageCountEl) pageCountEl.textContent = `Page ${num} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = num <= 1;
    if (nextBtn) nextBtn.disabled = num >= totalPages;

    const canvas = document.getElementById('pvCanvas');
    const loading = document.getElementById('pvLoading');
    if (!canvas) return;

    try {
      const page = await currentPdfDoc.getPage(num);
      const containerWidth = Math.min(window.innerWidth - 48, 500);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: Math.max(scale, 0.8) });

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      if (currentRenderTask) {
        try { currentRenderTask.cancel(); } catch (_) {}
      }

      currentRenderTask = page.render({
        canvasContext: ctx,
        transform,
        viewport
      });

      await currentRenderTask.promise;
      canvas.style.display = 'block';
      if (loading) loading.style.display = 'none';
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      console.warn('[Preview] Page render error:', err);
      showFallbackView();
    }
  }

  function showFallbackView() {
    const loading = document.getElementById('pvLoading');
    const canvas = document.getElementById('pvCanvas');
    const fallback = document.getElementById('pvFallback');
    const pagination = document.getElementById('pvPaginationBar');

    if (loading) loading.style.display = 'none';
    if (canvas) canvas.style.display = 'none';
    if (pagination) pagination.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
  }

  document.getElementById('pvPrevPage')?.addEventListener('click', () => {
    if (currentPageNum > 1) renderPage(currentPageNum - 1);
  });

  document.getElementById('pvNextPage')?.addEventListener('click', () => {
    if (currentPageNum < totalPages) renderPage(currentPageNum + 1);
  });

  // Global listener for "Preview" clicks on resource cards
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pv]');
    if (!btn) return;
    e.preventDefault();

    const [coll, id] = btn.dataset.pv.split(':');
    const card = btn.closest('.card');
    const title = card ? (card.querySelector('h3')?.textContent || 'Document Preview') : 'Document Preview';

    const url = `${API.base}/${coll}/${id}/preview`;

    const titleEl = document.getElementById('pvTitle');
    const openBtn = document.getElementById('pvOpen');
    const fallbackBtn = document.getElementById('pvFallbackBtn');
    const fallbackTitle = document.getElementById('pvFallbackTitle');
    const loading = document.getElementById('pvLoading');
    const canvas = document.getElementById('pvCanvas');
    const fallback = document.getElementById('pvFallback');
    const pagination = document.getElementById('pvPaginationBar');

    if (titleEl) titleEl.textContent = title;
    if (fallbackTitle) fallbackTitle.textContent = title;
    if (openBtn) openBtn.href = url;
    if (fallbackBtn) fallbackBtn.href = url;

    if (loading) loading.style.display = 'flex';
    if (canvas) canvas.style.display = 'none';
    const coverImg = document.getElementById('pvCoverImg');
    if (coverImg) {
      coverImg.src = `${API.base}/${coll}/${id}/thumbnail`;
      coverImg.style.display = 'block';
    }
    if (fallback) fallback.style.display = 'none';
    if (pagination) pagination.style.display = 'none';

    modal.hidden = false;

    // Check if pdfjsLib is available
    if (window.pdfjsLib) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js';
        
        // Load PDF document stream
        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false
        });

        currentPdfDoc = await loadingTask.promise;
        totalPages = currentPdfDoc.numPages || 1;

        if (pagination) {
          pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        }

        await renderPage(1);
        if (coverImg) coverImg.style.display = 'none';
      } catch (err) {
        console.warn('[Preview] PDF.js load error, falling back to direct access:', err.message);
        showFallbackView();
      }
    } else {
      // If PDF.js not loaded, immediately give direct checking access
      showFallbackView();
    }
  });

  window.openPreview = function(ref, title = 'Document Inspection') {
    if (!ref) return;
    const [coll, id] = ref.split(':');
    const url = `${API.base}/${coll}/${id}/preview`;
    const thumbUrl = `${API.base}/${coll}/${id}/thumbnail`;

    const titleEl = document.getElementById('pvTitle');
    const openBtn = document.getElementById('pvOpen');
    const fallbackBtn = document.getElementById('pvFallbackBtn');
    const fallbackTitle = document.getElementById('pvFallbackTitle');
    const loading = document.getElementById('pvLoading');
    const canvas = document.getElementById('pvCanvas');
    const coverImg = document.getElementById('pvCoverImg');
    const fallback = document.getElementById('pvFallback');
    const pagination = document.getElementById('pvPaginationBar');

    if (titleEl) titleEl.textContent = title;
    if (fallbackTitle) fallbackTitle.textContent = title;
    if (openBtn) openBtn.href = url;
    if (fallbackBtn) fallbackBtn.href = url;

    // Show real cover image immediately
    if (coverImg) {
      coverImg.src = thumbUrl;
      coverImg.style.display = 'block';
    }
    if (loading) loading.style.display = 'flex';
    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.style.display = 'none';
    if (pagination) pagination.style.display = 'none';

    modal.hidden = false;

    if (window.pdfjsLib) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js';
        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        loadingTask.promise.then(async (pdf) => {
          currentPdfDoc = pdf;
          totalPages = currentPdfDoc.numPages || 1;
          if (pagination) pagination.style.display = totalPages > 1 ? 'flex' : 'none';
          await renderPage(1);
          if (coverImg) coverImg.style.display = 'none';
          if (loading) loading.style.display = 'none';
        }).catch(() => {
          if (loading) loading.style.display = 'none';
        });
      } catch (_) {
        if (loading) loading.style.display = 'none';
      }
    } else {
      if (loading) loading.style.display = 'none';
    }
  };
})();
