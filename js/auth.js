let mode = 'login';
let pendingEmail = '';
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

// Check existing login
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

function showCard(cardId) {
  ['mainAuthCard', 'verifyCard', 'forgotCard'].forEach((id) => {
    $(id).hidden = id !== cardId;
  });
}

function render() {
  showCard('mainAuthCard');
  const reg = mode === 'register';
  $('title').innerHTML = reg ? 'Create your <span>account</span>' : 'Welcome <span>back</span>';
  $('sub').textContent = reg ? 'Free for Malawi secondary school students. Verify email to begin.' : 'Download Malawi secondary school resources.';
  $('submit').textContent = reg ? 'Create account' : 'Sign in';
  $('hintText').textContent = reg ? 'Already have an account?' : 'No account?';
  $('toggle').textContent = reg ? 'Sign in' : 'Create one';
  ['nameField', 'schoolField', 'levelField'].forEach((i) => { $(i).hidden = !reg; });
  $('password').autocomplete = reg ? 'new-password' : 'current-password';
  document.title = (reg ? 'Create account' : 'Sign in') + ' - Muhebrew Library';
}

$('toggle').onclick = (e) => {
  e.preventDefault();
  mode = mode === 'login' ? 'register' : 'login';
  render();
};

$('eye').onclick = () => {
  const p = $('password');
  p.type = p.type === 'password' ? 'text' : 'password';
};

const themeBtn = $('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    localStorage.setItem('ph_theme', dark ? 'light' : 'dark');
  });
}

// ============ Main Login & Registration Form ============
$('form').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('submit');
  btn.disabled = true;

  try {
    const email = $('email').value.trim().toLowerCase();
    pendingEmail = email;

    if (mode === 'register') {
      const body = {
        name: $('name').value.trim(),
        email,
        password: $('password').value,
        school: $('school').value.trim(),
        level: $('level').value
      };

      const res = await API.post('/auth/register', body);

      if (res.requireVerification) {
        toast('Verification code sent to ' + email);
        $('verifyEmailTarget').textContent = email;
        showCard('verifyCard');
        $('verifyCode').focus();
        return;
      }

      if (res.token) {
        API.setToken(res.token);
        redirectAfterAuth(res.user);
      }
    } else {
      // Login flow
      const res = await API.post('/auth/login', { email, password: $('password').value });

      if (res.token) {
        API.setToken(res.token);
        redirectAfterAuth(res.user);
      }
    }
  } catch (err) {
    // If login blocked due to unverified email
    if (err.status === 403 && pendingEmail) {
      toast('Please verify your email first', true);
      $('verifyEmailTarget').textContent = pendingEmail;
      showCard('verifyCard');
      $('verifyCode').focus();
      return;
    }
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

// ============ Email Verification Flow ============
$('verifyForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('verifySubmit');
  btn.disabled = true;

  try {
    const code = $('verifyCode').value.trim();
    const res = await API.post('/auth/verify-email', { email: pendingEmail, code });

    toast(res.message || 'Email verified successfully!');
    if (res.token) {
      API.setToken(res.token);
      setTimeout(() => redirectAfterAuth(res.user), 500);
    } else {
      showCard('mainAuthCard');
      mode = 'login';
      render();
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

$('resendCodeBtn').onclick = async () => {
  if (!pendingEmail) return;
  const btn = $('resendCodeBtn');
  btn.disabled = true;
  try {
    await API.post('/auth/resend-code', { email: pendingEmail });
    toast('New verification code sent to ' + pendingEmail);
  } catch (err) {
    toast(err.message, true);
  } finally {
    setTimeout(() => { btn.disabled = false; }, 4000);
  }
};

$('verifyBackToLogin').onclick = (e) => {
  e.preventDefault();
  showCard('mainAuthCard');
  mode = 'login';
  render();
};

// ============ Forgot Password Flow ============
$('forgotPwLink').onclick = (e) => {
  e.preventDefault();
  showCard('forgotCard');
  $('forgotStepA').hidden = false;
  $('forgotStepB').hidden = true;
  $('forgotSub').textContent = 'Enter your registered email to receive a 6-digit password reset code.';
  if ($('email').value) $('forgotEmail').value = $('email').value;
  $('forgotEmail').focus();
};

$('forgotBackToLogin').onclick = (e) => {
  e.preventDefault();
  showCard('mainAuthCard');
  mode = 'login';
  render();
};

$('forgotStepA').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('forgotSendBtn');
  btn.disabled = true;

  try {
    const email = $('forgotEmail').value.trim().toLowerCase();
    pendingEmail = email;

    const res = await API.post('/auth/forgot-password', { email });
    toast(res.message || 'Reset code sent to your email.');

    $('forgotStepA').hidden = true;
    $('forgotStepB').hidden = false;
    $('forgotSub').textContent = 'Enter the 6-digit code sent to ' + email + ' and choose a new password.';
    $('resetCode').focus();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

$('forgotStepB').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('resetSaveBtn');
  btn.disabled = true;

  try {
    const code = $('resetCode').value.trim();
    const newPassword = $('resetNewPw').value;

    const res = await API.post('/auth/reset-password', {
      email: pendingEmail,
      code,
      newPassword
    });

    toast(res.message || 'Password reset successfully!');
    setTimeout(() => {
      showCard('mainAuthCard');
      mode = 'login';
      render();
      $('password').value = '';
    }, 1200);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
};

render();
