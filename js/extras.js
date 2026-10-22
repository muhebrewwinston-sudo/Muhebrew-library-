// Live download counter + "report broken file"
(function () {
  document.addEventListener('click', async (e) => {
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      const [coll, id] = dl.dataset.dl.split(':');
      const label = dl.closest('.card').querySelector('.dlcount');
      setTimeout(async () => {
        try { const r = await API.get('/' + coll + '/' + id); label.textContent = r.item.downloads.toLocaleString() + ' downloads'; } catch (_) { /* ignore */ }
      }, 1500);
    }
    const rp = e.target.closest('[data-rp]');
    if (rp) {
      const [coll, id] = rp.dataset.rp.split(':');
      const reason = prompt('What is wrong with this file? (e.g. blank pages, wrong subject)');
      if (reason === null) return;
      try { await API.post('/' + coll + '/' + id + '/report', { reason }); toast('Thanks! An admin will check it.'); }
      catch (err) { toast(err.message, true); }
    }
  });
})();
