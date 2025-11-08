(function(){
  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const togglePw = document.getElementById('togglePw');
  const errorEl = document.getElementById('error');
  const remember = document.getElementById('remember');

  try {
    const raw = localStorage.getItem('ss_user');
    if (raw) {
      window.location.href = 'Index.html';
      return;
    }
  } catch (_) {}

  togglePw.addEventListener('click', () => {
    const isPw = password.type === 'password';
    password.type = isPw ? 'text' : 'password';
    togglePw.textContent = isPw ? 'Hide' : 'Show';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const emailVal = email.value.trim().toLowerCase();
    const pwVal = password.value.trim();

    if (!emailVal || !pwVal) {
      errorEl.textContent = 'Please enter both email and password.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      errorEl.textContent = 'Please enter a valid email address.';
      return;
    }
    if (pwVal.length < 4) {
      errorEl.textContent = 'Password must be at least 4 characters.';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, password: pwVal })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        errorEl.textContent = data.error || 'Login failed.';
        return;
      }
      const session = { ...data.user, ts: Date.now(), remember: !!remember.checked };
      try { localStorage.setItem('ss_user', JSON.stringify(session)); } catch(_) {}
      window.location.href = 'Index.html';
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Network error. Please try again.';
    }
  });
})();
