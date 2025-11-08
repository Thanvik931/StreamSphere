(function(){
  const logoutBtn = document.getElementById('logoutBtn');

  const uploadForm = document.getElementById('uploadForm');
  const titleEl = document.getElementById('title');
  const posterEl = document.getElementById('poster');
  const sourceTypeEl = document.getElementById('sourceType');
  const fileRow = document.getElementById('fileRow');
  const urlRow = document.getElementById('urlRow');
  const videoEl = document.getElementById('video');
  const videoUrlEl = document.getElementById('videoUrl');
  const categoryEl = document.getElementById('category');
  const descEl = document.getElementById('description');
  const uploadMsg = document.getElementById('uploadMsg');
  const uploadError = document.getElementById('uploadError');
  const myUploads = document.getElementById('myUploads');

  function getSession(){
    try { return JSON.parse(localStorage.getItem('ss_user')||'null'); } catch(_) { return null; }
  }
  const session = getSession();
  if (!session || session.role !== 'creator') {
    window.location.href = 'login.html';
    return;
  }

  logoutBtn.addEventListener('click', () => {
    try { localStorage.removeItem('ss_user'); } catch(_) {}
    window.location.href = 'login.html';
  });

  sourceTypeEl.addEventListener('change', () => {
    const v = sourceTypeEl.value;
    if (v === 'file') { fileRow.style.display = ''; urlRow.style.display = 'none'; }
    else { fileRow.style.display = 'none'; urlRow.style.display = ''; }
  });

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadError.textContent = '';
    uploadMsg.textContent = '';
    const title = (titleEl.value || '').trim();
    if (!title) {
      uploadError.textContent = 'Please enter a title.';
      return;
    }
    async function presign(kind, file){
      const res = await fetch('/api/s3/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: kind, filename: file.name, contentType: file.type || 'application/octet-stream' }) });
      if (!res.ok) throw new Error('presign failed');
      return await res.json();
    }
    async function put(url, file){
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      if (!r.ok) throw new Error('upload failed');
    }

    const st = sourceTypeEl.value;
    let finalPosterUrl = null;
    let finalVideoUrl = null;
    let useUrls = false;

    // Try S3 path first
    try {
      if (posterEl.files && posterEl.files[0]){
        const p = await presign('poster', posterEl.files[0]);
        await put(p.url, posterEl.files[0]);
        finalPosterUrl = p.publicUrl;
        useUrls = true;
      }
      if (st === 'file'){
        if (!videoEl.files || !videoEl.files[0]) { uploadError.textContent = 'Please choose an MP4 file.'; return; }
        const v = await presign('video', videoEl.files[0]);
        await put(v.url, videoEl.files[0]);
        finalVideoUrl = v.publicUrl;
        useUrls = true;
      }
    } catch (_) {
      // S3 not configured or failed; will fall back
      useUrls = false;
    }

    let body;
    let headers;
    if (useUrls) {
      body = JSON.stringify({
        email: session.email,
        title,
        category: (categoryEl && categoryEl.value) || 'movie',
        description: (descEl && descEl.value) || '',
        videoUrl: st === 'file' ? finalVideoUrl : (videoUrlEl.value || '').trim(),
        posterUrl: finalPosterUrl
      });
      headers = { 'Content-Type': 'application/json' };
    } else {
      const fd = new FormData();
      fd.append('email', session.email);
      fd.append('title', title);
      fd.append('category', (categoryEl && categoryEl.value) || 'movie');
      fd.append('description', (descEl && descEl.value) || '');
      if (st === 'file') {
        if (!videoEl.files || !videoEl.files[0]) { uploadError.textContent = 'Please choose an MP4 file.'; return; }
        fd.append('video', videoEl.files[0]);
      } else {
        const urlVal = (videoUrlEl.value || '').trim();
        if (!urlVal) { uploadError.textContent = 'Please enter a video URL.'; return; }
        fd.append('videoUrl', urlVal);
      }
      if (posterEl.files && posterEl.files[0]) fd.append('poster', posterEl.files[0]);
      body = fd;
      headers = undefined;
    }

    try {
      const res = await fetch('/api/movies', { method: 'POST', body, headers });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      uploadMsg.textContent = 'Uploaded successfully';
      titleEl.value = '';
      videoEl.value = '';
      videoUrlEl.value = '';
      posterEl.value = '';
      if (descEl) descEl.value = '';
      if (categoryEl) categoryEl.value = 'movie';
      await loadMyUploads();
    } catch (err) {
      console.error(err);
      uploadError.textContent = err.message || 'Upload failed';
    }
  });

  async function loadMyUploads(){
    try {
      const res = await fetch('/api/movies/public');
      const data = await res.json();
      const list = (data.movies || []).filter(m => m.creatorEmail === session.email);
      myUploads.innerHTML = list.map(m => `
        <div class="movie-card">
          <img src="${m.poster || ''}" class="movie-poster"/>
          <div class="movie-info">
            <div class="movie-title">${m.title}</div>
            <div class="movie-genre">${m.sourceType === 'file' ? 'MP4' : 'URL'}</div>
          </div>
        </div>
      `).join('') || '<div class="no-results">No uploads yet.</div>';
    } catch (err) {
      myUploads.innerHTML = '<div class="error">Failed to load uploads.</div>';
    }
  }

  loadMyUploads();
})();
