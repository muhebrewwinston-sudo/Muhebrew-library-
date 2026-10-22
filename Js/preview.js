(function () {
  const m = document.createElement('div');
  m.className = 'modal';
  m.hidden = true;
  m.innerHTML = '<div class="modal-box"><div class="modal-bar"><b id="pvTitle">Preview</b><span class="spacer"></span>' +
    '<a class="btn sm" id="pvOpen" target="_blank" rel="noopener">Open in new tab</a>' +
    '<button class="btn sm" id="pvClose">Close</button></div><iframe id="pvFrame" title="PDF preview"></iframe></div>';
  document.body.appendChild(m);
  const close = () => { m.hidden = true; document.getElementById('pvFrame').src = 'about:blank'; };
  document.getElementById('pvClose').onclick = close;
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv]');
    if (!b) return;
    const [coll, id] = b.dataset.pv.split(':');
    const url = '/api/' + coll + '/' + id + '/preview';
    document.getElementById('pvTitle').textContent = b.closest('.card').querySelector('h3').textContent;
    document.getElementById('pvOpen').href = url;
    document.getElementById('pvFrame').src = url;
    m.hidden = false;
  });
})();
