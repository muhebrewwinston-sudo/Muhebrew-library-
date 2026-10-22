let mode = 'login';
const $ = (id) => document.getElementById(id);

function isAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const email = (user.email || '').toLowerCase().trim();
  const adminEmails = ['muhebrewwinston@gmail.com', 'admin@muhebrew.com', 'admin@library.mw'];
  if (adminEmails.includes(email) || email.startsWith('admin@')) return true;
  return false;
}

function redirectAfterAuth(user) {
  if (isAdmin(user)) {
    location.href = '/admin.html';
  } else {
    location.href = '/';
  }
}

// If already logged in, redirect away to the appropriate dashboard
(async function checkExistingAuth() {
  if (API.token()) {
    try {
      const u = await API.me();
      if (u) {
        redirectAfterAuth(u);
      }
    } catch (_) {}
  }
})();

function render() {
  const reg = mode === 'register';
  $('title').innerHTML = reg ? 'Create your <span>account</span>' : 'Welcome <span>back</span>';
  $('sub').textContent = reg ? 'Free for Malawi secondary school students and teachers.' : 'Download Malawi secondary school resources.';
  $('submit').textContent = reg ? 'Create account' : 'Sign in';
  $('hintText').textContent = reg ? 'Already have an account?' : 'No account?';
  $('toggle').textContent = reg ? 'Sign in' : 'Create one';
  ['nameField', 'extraFields', 'roleField', 'levelField'].forEach((i) => { $(i).hidden = !reg; });
  $('password').autocomplete = reg ? 'new-password' : 'current-password';
  document.title = (reg ? 'Create account' : 'Sign in') + ' - Muhebrew Library';
}

$('toggle').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; render(); };
$('eye').onclick = () => { const p = $('password'); p.type = p.type === 'password' ? 'text' : 'password'; };

const themeBtn = $('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
  });
}

$('form').onsubmit = async (e) => {
  e.preventDefault();
  $('submit').disabled = true;
  try {
    const email = $('email').value.trim().toLowerCase();
    const body = { email, password: $('password').value };
    if (mode === 'register') {
      Object.assign(body, {
        name: $('name').value,
        school: $('school').value,
        level: $('level').value,
        role: $('role').value
      });
    }
    const r = await API.post('/auth/' + mode, body);
    API.setToken(r.token);

    // Determine user & role from response or API.me()
    let user = r.user;
    if (!user && r.role) {
      user = { role: r.role, email };
    }
    if (!user) {
      try { user = await API.me(); } catch (_) {}
    }
    if (!user) {
      user = { role: mode === 'register' ? $('role').value : undefined, email };
    }

    redirectAfterAuth(user);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('submit').disabled = false;
  }
};
