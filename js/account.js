// "Change my password" form (admin + teacher pages)
(function () {
  const f = document.getElementById('pwForm');
  if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await API.post('/auth/password', { current: document.getElementById('pwCurrent').value, next: document.getElementById('pwNew').value });
      toast('Password changed');
      f.reset();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
})();
