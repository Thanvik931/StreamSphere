(function(){
  const form = document.getElementById('registerForm');
  const email = document.getElementById('rEmail');
  const pw1 = document.getElementById('rPassword');
  const pw2 = document.getElementById('rPassword2');
  const roleSel = document.getElementById('rRole');
  const toggle1 = document.getElementById('togglePw1');
  const toggle2 = document.getElementById('togglePw2');
  const errorEl = document.getElementById('rError');

  toggle1.addEventListener('click', () => {
    const isPw = pw1.type === 'password';
    pw1.type = isPw ? 'text' : 'password';
    toggle1.textContent = isPw ? 'Hide' : 'Show';
  });
  toggle2.addEventListener('click', () => {
    const isPw = pw2.type === 'password';
    pw2.type = isPw ? 'text' : 'password';
    toggle2.textContent = isPw ? 'Hide' : 'Show';
  });

  async function createAccount(emailVal, p1, role) {
    const res = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: p1, role })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Registration failed.');
    const session = { ...data.user, ts: Date.now(), remember: true };
    try { localStorage.setItem('ss_user', JSON.stringify(session)); } catch(_) {}
    if (role === 'creator') window.location.href = 'creator.html'; else window.location.href = 'Index.html';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const emailVal = email.value.trim().toLowerCase();
    const p1 = pw1.value.trim();
    const p2 = pw2.value.trim();
    const role = (roleSel && roleSel.value) || 'user';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      errorEl.textContent = 'Please enter a valid email address.';
      return;
    }
    if (p1.length < 4) {
      errorEl.textContent = 'Password must be at least 4 characters.';
      return;
    }
    if (p1 !== p2) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }

    try {
      await createAccount(emailVal, p1, role);
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || 'Network error. Please try again.';
    }
  });
})();
