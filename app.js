const API_URL = 'https://script.google.com/macros/s/AKfycbx-Ee_dFBDnGsX9oda_-KmaKUmn64YD_Rx7VzRL37VLH7nsWfKy00fIkJFQrZ-HxSJU/exec';

let SESSION = JSON.parse(localStorage.getItem('mutabaah_session') || 'null');
let INDIKATOR_LIST = [];
let CHECKED_IDS = new Set();
let SOUND_ENABLED = true;

// === ENGINE EFEK SUARA CERIA (WEB AUDIO API) ===
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type = 'pop') {
  if (!SOUND_ENABLED) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'check') {
      // Nada naik ceria saat mencentang amalan
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);       // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'uncheck') {
      // Nada lembut saat batal centang
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(311.13, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'success') {
      // Melodi arpeggio 3 nada saat simpan / berhasil
      [523.25, 659.25, 1046.5].forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.16, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.25);
      });
    } else {
      // Bunyi "pop" ringan untuk setiap klik tombol umum
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  } catch (e) {
    // Abaikan jika browser memblokir audio sebelum interaksi pertama
  }
}

// Bunyi klik otomatis untuk semua tombol dengan class .btn-sound
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-sound')) {
    playSound('pop');
  }
});

// Tombol mute / unmute suara di topbar
document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
  SOUND_ENABLED = !SOUND_ENABLED;
  e.target.textContent = SOUND_ENABLED ? '🔊' : '🔇';
  if (SOUND_ENABLED) playSound('check');
});

// === KOMUNIKASI KE BACKEND APPS SCRIPT ===
async function apiCall(action, payload = {}) {
  const body = { action, token: SESSION ? SESSION.token : '', ...payload };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

function showView(id) {
  ['view-login', 'view-change-pass', 'view-dashboard'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('login-msg');
  msg.textContent = 'Memeriksa akun...';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await apiCall('login', { username, password });
    if (!res.ok) { msg.textContent = res.error || 'Login gagal.'; return; }
    SESSION = res;
    localStorage.setItem('mutabaah_session', JSON.stringify(SESSION));
    msg.textContent = '';
    playSound('success');
    if (res.wajib_ganti_password) showView('view-change-pass');
    else initDashboard();
  } catch (err) {
    msg.textContent = 'Gagal terhubung ke server. Pastikan URL Web App sudah benar.';
  }
});

document.getElementById('form-change-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('new-password').value;
  const res = await apiCall('changePassword', { new_password: newPassword });
  if (!res.ok) { document.getElementById('changepass-msg').textContent = res.error; return; }
  SESSION.wajib_ganti_password = false;
  localStorage.setItem('mutabaah_session', JSON.stringify(SESSION));
  playSound('success');
  initDashboard();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('mutabaah_session');
  SESSION = null;
  showView('view-login');
});

async function initDashboard() {
  showView('view-dashboard');
  const u = SESSION.user;
  document.getElementById('user-badge').textContent = `${u.nama} • ${u.role.toUpperCase()}`;
  ['panel-santri', 'panel-ortu', 'panel-musyrif', 'panel-admin'].forEach(p => document.getElementById(p).classList.add('hidden'));

  if (u.role === 'santri') {
    document.getElementById('panel-santri').classList.remove('hidden');
    document.getElementById('santri-greeting').textContent = `Assalamu'alaikum, ${u.nama}! 👋`;
    document.getElementById('santri-date').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const res = await apiCall('getSantriDashboard');
    if (res.ok) {
      INDIKATOR_LIST = res.indikator || [];
      CHECKED_IDS = new Set((res.logs_hari_ini || []).map(l => l.indikator_id));
      renderSantriCards();
    }
  } else if (u.role === 'ortu') {
    document.getElementById('panel-ortu').classList.remove('hidden');
    const res = await apiCall('getRingkasanOrtu');
    if (res.ok) {
      document.getElementById('ortu-anak-nama').textContent = `Ananda ${res.anak.nama}`;
      document.getElementById('ortu-anak-info').textContent = `Kelas ${res.anak.kelas} • Total Poin Pekan Ini: ${res.total_poin_pekan} ⭐`;
      renderOrtuChart(res.grafik || []);
    }
  } else if (u.role === 'musyrif') {
    document.getElementById('panel-musyrif').classList.remove('hidden');
    const res = await apiCall('getBinaan');
    if (res.ok) {
      const box = document.getElementById('musyrif-santri-list');
      box.innerHTML = (res.santri || []).map(s => `
        <div class="list-row">
          <div><strong>${s.nama}</strong> <span class="cat-tag">Kelas ${s.kelas}</span></div>
          <button class="btn-verif btn-sound" onclick="verifikasiSantri('${s.siswa_id}')">Verifikasi ✅</button>
        </div>`).join('');
    }
  } else if (u.role === 'admin') {
    document.getElementById('panel-admin').classList.remove('hidden');
    loadAdminIndikator();
  }
}

function updateLivePoin() {
  let total = 0;
  INDIKATOR_LIST.forEach(ind => {
    if (CHECKED_IDS.has(ind.indikator_id)) total += Number(ind.poin || 0);
  });
  document.getElementById('santri-live-poin').textContent = `${total} ⭐`;
}

function renderSantriCards() {
  const grid = document.getElementById('santri-indikator-list');
  grid.innerHTML = '';
  INDIKATOR_LIST.forEach(ind => {
    const checked = CHECKED_IDS.has(ind.indikator_id);
    const card = document.createElement('div');
    card.className = `ind-card ${checked ? 'checked' : ''}`;
    card.innerHTML = `
      <div>
        <strong>${ind.nama}</strong><br>
        <span class="cat-tag">${ind.kategori} • +${ind.poin} poin</span>
      </div>
      <div class="ind-check-circle">${checked ? '✓' : ''}</div>`;
    card.onclick = () => {
      if (CHECKED_IDS.has(ind.indikator_id)) {
        CHECKED_IDS.delete(ind.indikator_id);
        playSound('uncheck');
      } else {
        CHECKED_IDS.add(ind.indikator_id);
        playSound('check');
      }
      renderSantriCards();
    };
    grid.appendChild(card);
  });
  updateLivePoin();
}

document.getElementById('btn-simpan-mutabaah').addEventListener('click', async () => {
  const msg = document.getElementById('santri-status-msg');
  msg.textContent = 'Menyimpan catatan kebaikan...';
  const res = await apiCall('simpanMutabaah', {
    indikator_ids: Array.from(CHECKED_IDS),
    catatan: document.getElementById('santri-catatan').value
  });
  if (res.ok) {
    playSound('success');
    msg.textContent = 'Alhamdulillah, mutaba\'ah hari ini berhasil tersimpan! 🌟';
  } else {
    msg.textContent = res.error || 'Gagal menyimpan.';
  }
});

function renderOrtuChart(grafik) {
  new Chart(document.getElementById('chart-ortu'), {
    type: 'bar',
    data: {
      labels: grafik.map(g => g.tanggal),
      datasets: [{
        label: 'Poin Ibadah Harian',
        data: grafik.map(g => g.poin),
        backgroundColor: '#facc15',
        borderColor: '#0284c7',
        borderWidth: 2,
        borderRadius: 10
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

async function verifikasiSantri(siswa_id) {
  const res = await apiCall('verifikasi', { siswa_id, status_verifikasi: 'Terverifikasi' });
  if (res.ok) playSound('success');
  alert(res.ok ? 'Alhamdulillah, laporan santri berhasil diverifikasi!' : res.error);
}

async function loadAdminIndikator() {
  const res = await apiCall('getIndikator');
  if (!res.ok) return;
  document.getElementById('admin-indikator-list').innerHTML = res.indikator.map(i => `
    <div class="list-row">
      <div><strong>${i.nama}</strong> <span class="cat-tag">${i.kategori} • ${i.poin} poin</span></div>
      <span>${i.aktif === 'Ya' ? '✅ Aktif' : '⏸️ Nonaktif'}</span>
    </div>`).join('');
}

document.getElementById('form-tambah-indikator').addEventListener('submit', async (e) => {
  e.preventDefault();
  await apiCall('adminKelolaIndikator', {
    sub_action: 'tambah',
    nama: document.getElementById('ind-nama').value,
    kategori: document.getElementById('ind-kategori').value,
    poin: Number(document.getElementById('ind-poin').value)
  });
  playSound('success');
  e.target.reset();
  loadAdminIndikator();
});

if (SESSION && SESSION.token) {
  if (SESSION.wajib_ganti_password) showView('view-change-pass');
  else initDashboard();
}
