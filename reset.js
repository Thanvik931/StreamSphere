(function(){
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const fEmail = document.getElementById('fEmail');
  const fError = document.getElementById('fError');
  const fInfo = document.getElementById('fInfo');
  const sendOtpBtn = document.getElementById('sendOtp');

  const otpInput = document.getElementById('otp');
  const newPw = document.getElementById('newPw');
  const newPw2 = document.getElementById('newPw2');
  const rError = document.getElementById('rError');
  const rSuccess = document.getElementById('rSuccess');
  const resetPwBtn = document.getElementById('resetPw');

  function getUsers(){
    try { return JSON.parse(localStorage.getItem('ss_users')||'[]'); } catch(_) { return []; }
  }

  function storeOtp(email, code){
    const key = 'ss_otp_' + email;
    const payload = { code, exp: Date.now() + 10*60*1000 };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch(_) {}
  }

  function readOtp(email){
    const key = 'ss_otp_' + email;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(_) { return null; }
  }

  function clearOtp(email){
    const key = 'ss_otp_' + email;
    try { localStorage.removeItem(key); } catch(_) {}
  }

  function updateUserPassword(email, newPassword){
    const users = getUsers();
    const idx = users.findIndex(u => u.email === email);
    if (idx >= 0) {
      users[idx].password = newPassword;
      try { localStorage.setItem('ss_users', JSON.stringify(users)); } catch(_) {}
      return true;
    }
    return false;
  }

  sendOtpBtn.addEventListener('click', () => {
    fError.textContent = '';
    fInfo.textContent = '';
    const email = (fEmail.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fError.textContent = 'Please enter a valid registered email address.';
      return;
    }
    const exists = getUsers().some(u => u.email === email);
    if (!exists) {
      fError.textContent = 'No account found for this email.';
      return;
    }
    const code = Math.floor(100000 + Math.random()*900000).toString();
    storeOtp(email, code);
    fInfo.textContent = 'An OTP has been sent to your email. (Demo OTP: ' + code + ')';
    step1.style.display = 'none';
    step2.style.display = 'block';
    step2.dataset.email = email;
  });

  resetPwBtn.addEventListener('click', () => {
    rError.textContent = '';
    rSuccess.textContent = '';
    const email = step2.dataset.email;
    const entered = (otpInput.value || '').trim();
    const p1 = (newPw.value || '').trim();
    const p2 = (newPw2.value || '').trim();

    const record = readOtp(email);
    if (!record) {
      rError.textContent = 'OTP expired or not generated. Please request a new OTP.';
      return;
    }
    if (Date.now() > record.exp) {
      clearOtp(email);
      rError.textContent = 'OTP expired. Please request a new OTP.';
      return;
    }
    if (entered !== record.code) {
      rError.textContent = 'Invalid OTP. Please check and try again.';
      return;
    }
    if (p1.length < 4) {
      rError.textContent = 'Password must be at least 4 characters.';
      return;
    }
    if (p1 !== p2) {
      rError.textContent = 'Passwords do not match.';
      return;
    }

    const ok = updateUserPassword(email, p1);
    if (!ok) {
      rError.textContent = 'Failed to reset password for this account.';
      return;
    }
    clearOtp(email);
    rSuccess.textContent = 'Password reset successful. Redirecting to login...';
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
  });
})();
