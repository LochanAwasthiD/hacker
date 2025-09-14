document.addEventListener('DOMContentLoaded', () => {
  // Remember email (login only)
  const loginEmail = document.getElementById('loginEmail');
  const rememberMe = document.getElementById('rememberMe');
  try {
    const saved = localStorage.getItem('mw_login_email');
    if (loginEmail && saved) {
      loginEmail.value = saved;
      if (rememberMe) rememberMe.checked = true;
    }
  } catch {}

  if (rememberMe && loginEmail) {
    const persist = () => {
      try {
        if (rememberMe.checked) localStorage.setItem('mw_login_email', loginEmail.value.trim());
        else localStorage.removeItem('mw_login_email');
      } catch {}
    };
    rememberMe.addEventListener('change', persist);
    loginEmail.addEventListener('input', persist);
  }

  // Clear password fields on load
  document.querySelectorAll('input[type="password"]').forEach(i => (i.value = ''));

  // Show/Hide password toggles (use data-toggle-password="#inputId")
  document.querySelectorAll('[data-toggle-password]').forEach(btn => {
    const target = document.querySelector(btn.getAttribute('data-toggle-password'));
    if (!target) return;
    btn.addEventListener('click', () => {
      const isPw = target.type === 'password';
      target.type = isPw ? 'text' : 'password';
      btn.textContent = isPw ? 'Hide password' : 'Show password';
    });
  });

  const emailOk = (v) => /\S+@\S+\.\S+/.test(String(v||'').trim());

  // Login validate
  const loginForm = document.querySelector('form[action="/auth/login"]');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      const email = loginForm.querySelector('input[name="email"]')?.value || '';
      const pass  = loginForm.querySelector('input[name="password"]')?.value || '';
      if (!emailOk(email)) { e.preventDefault(); alert('Please enter a valid email.'); return; }
      if (String(pass).length < 6) { e.preventDefault(); alert('Password must be at least 6 characters.'); return; }
      setTimeout(() => { loginForm.querySelector('input[name="password"]').value = ''; }, 0);
    });
  }

  // Signup validate
  const signupForm = document.querySelector('form[action="/auth/signup"]');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      const email = signupForm.querySelector('input[name="email"]')?.value || '';
      const pass  = signupForm.querySelector('input[name="password"]')?.value || '';
      const conf  = signupForm.querySelector('input[name="confirmPassword"]')?.value || '';
      const terms = document.getElementById('termsAgreement');
      if (!emailOk(email)) { e.preventDefault(); alert('Please enter a valid email.'); return; }
      if (String(pass).length < 6) { e.preventDefault(); alert('Password must be at least 6 characters.'); return; }
      if (pass !== conf) { e.preventDefault(); alert('Passwords do not match.'); return; }
      if (terms && !terms.checked) { e.preventDefault(); alert('Please agree to the Terms and Privacy Policy.'); return; }
      setTimeout(() => {
        signupForm.querySelector('input[name="password"]').value = '';
        signupForm.querySelector('input[name="confirmPassword"]').value = '';
      }, 0);
    });
  }
});
