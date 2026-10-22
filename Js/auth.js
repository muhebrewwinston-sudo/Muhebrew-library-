let mode = 'login';
const $ = (id) => document.getElementById(id);

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

$('form').onsubmit = async (e) => {
  e.preventDefault();
  $('submit').disabled = true;
  try {
    const body = { email: $('email').value.trim().toLowerCase(), password: $('password').value };
    if (mode === 'register') Object.assign(body, { name: $('name').value, school: $('school').value, level: $('level').value, role: $('role').value });
    const r = await API.post('/auth/' + mode, body);
    API.setToken(r.token);
    location.href = '/';
  } catch (err) { toast(err.message, true); }
  finally { $('submit').disabled = false; }
};
