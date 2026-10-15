/**
 * ============================================================================
 * CHEMLAB 3D - INTERACTIVE VIRTUAL LAB EXPERIMENT SIMULATION ENGINE
 * ============================================================================
 * 1. Volumetric Acid-Base Titration (HCl + NaOH with Phenolphthalein Indicator)
 * 2. Meniscus Precision Reading Minigame with Pipette
 * 3. Bunsen Heating Test with Flame Physics & Boiling Simulation
 */

// Global Practicum State
const PracticumState = {
  currentExp: 'titrasi',

  // 1. Titration State
  titration: {
    buretteTotal: 50.0,
    dispensedNaOH: 0.0,
    hasPPIndicator: false,
    ppDropsCount: 0,
    isFlowing: false,
    flowIntervalId: null,
    isStirrerOn: false,
    currentPH: 1.0,
    targetEndpoint: 20.0, // Equivalence at 20.0 mL of NaOH
    isComplete: false
  },

  // 2. Meniscus State
  meniscus: {
    targetVolume: 42.5,
    cylinderCurrentVolume: 42.5,
    pipetteVolume: 5.0
  },

  // 3. Bunsen State
  bunsen: {
    isGasOpen: true,
    isIgnited: false,
    collarMode: 'blue', // 'blue' (hot) or 'yellow' (sooty)
    currentTemp: 27.0,
    tempIntervalId: null,
    isBoiling: false
  }
};

// Initialize Workbench on DOM load
window.addEventListener('DOMContentLoaded', () => {
  initPracticumWorkbench();
});

function initPracticumWorkbench() {
  updateTitrationUI();
  updateMeniscusUI();
  updateBunsenUI();
}

/**
 * Switch Active Experiment Workbench
 */
function switchLabExperiment(expId) {
  PracticumState.currentExp = expId;

  // Toggle Sub-nav Buttons
  document.querySelectorAll('#tab-praktikum .sub-nav-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`btn-lab-${expId}`);
  if (targetBtn) targetBtn.classList.add('active');

  // Toggle Experiment Container Cards
  document.querySelectorAll('.lab-experiment-container').forEach(c => c.classList.remove('active'));
  const targetCard = document.getElementById(`lab-exp-${expId}`);
  if (targetCard) targetCard.classList.add('active');

  playWebAudioTone('click');
}

/**
 * Reset Current Active Experiment
 */
function resetCurrentLab() {
  const exp = PracticumState.currentExp;
  if (exp === 'titrasi') {
    resetTitration();
  } else if (exp === 'meniskus') {
    resetMeniscus();
  } else if (exp === 'bunsen') {
    resetBunsen();
  }
  showAppNotification('Meja praktikum telah diatur ulang ke kondisi awal.');
  playWebAudioTone('reset');
}

/* ==========================================================================
   1. TITRASI ASAM-BASA (HCL + NAOH & FENOLFTALEIN)
   ========================================================================== */

/**
 * Step 2: Add Phenolphthalein (PP) Indicator
 */
function addPhenolphthalein() {
  const t = PracticumState.titration;
  if (t.hasPPIndicator) {
    showAppNotification('Indikator Fenolftalein (PP) sudah ditambahkan (3 tetes).');
    return;
  }

  t.ppDropsCount = 3;
  t.hasPPIndicator = true;
  playWebAudioTone('drip');

  // Update SOP Step Highlight
  updateSopStep(2);

  // Update Telemetry & UI
  document.getElementById('disp-indicator-state').textContent = 'Ditambahkan (3 Tetes PP)';
  document.getElementById('disp-indicator-state').className = 'color-cyan';

  const feedback = document.getElementById('titration-feedback');
  if (feedback) {
    feedback.innerHTML = `<i class="fa-solid fa-check-circle color-emerald"></i> Indikator PP berhasil ditambahkan! Larutan tetap bening karena suasana asam (pH < 8.2). Sekarang buka kran buret secara bertahap.`;
  }

  showAppNotification('3 tetes Indikator PP ditambahkan ke dalam Erlenmeyer.');
}

/**
 * Toggle Magnetic Stirrer
 */
function toggleStirrer() {
  const t = PracticumState.titration;
  t.isStirrerOn = !t.isStirrerOn;

  const knob = document.getElementById('stir-knob');
  const led = document.getElementById('stirrer-led');
  const pellet = document.getElementById('stirrer-pellet');
  const vortex = document.getElementById('liquid-vortex');
  const stateDisp = document.getElementById('disp-stirrer-state');

  if (t.isStirrerOn) {
    if (knob) knob.classList.add('active');
    if (led) led.classList.add('active');
    if (pellet) pellet.classList.add('spinning');
    if (vortex) vortex.style.display = 'block';
    if (stateDisp) {
      stateDisp.textContent = 'Aktif (Berputar 400 RPM)';
      stateDisp.className = 'color-emerald';
    }
    playWebAudioTone('hum');
  } else {
    if (knob) knob.classList.remove('active');
    if (led) led.classList.remove('active');
    if (pellet) pellet.classList.remove('spinning');
    if (vortex) vortex.style.display = 'none';
    if (stateDisp) {
      stateDisp.textContent = 'Mati';
      stateDisp.className = '';
    }
  }
}

/**
 * Add Single Drop of NaOH (+0.5 mL)
 */
function dispenseNaOHDrop() {
  if (!PracticumState.titration.hasPPIndicator) {
    showAppNotification('Peringatan: Tambahkan indikator PP terlebih dahulu sebelum memulai titrasi!');
    return;
  }

  if (PracticumState.titration.dispensedNaOH >= 50.0) {
    showAppNotification('Buret kosong! Volume 50 mL NaOH telah habis.');
    return;
  }

  triggerBuretteDropAnimation();
  addNaOHAmount(0.5);
  playWebAudioTone('drip');
}

/**
 * Toggle Continuous Slow Flow of NaOH
 */
function toggleContinuousFlow() {
  const t = PracticumState.titration;

  if (!t.hasPPIndicator) {
    showAppNotification('Peringatan: Tambahkan indikator PP terlebih dahulu sebelum membuka kran!');
    return;
  }

  const handle = document.getElementById('stopcock-handle');
  const flowIcon = document.getElementById('flow-btn-icon');
  const flowText = document.getElementById('flow-btn-text');

  if (!t.isFlowing) {
    // Open Stopcock
    t.isFlowing = true;
    if (handle) handle.classList.add('open');
    if (flowText) flowText.textContent = 'Tutup Kran Buret';
    if (flowIcon) flowIcon.className = 'fa-solid fa-faucet color-emerald';

    updateSopStep(3);

    t.flowIntervalId = setInterval(() => {
      if (t.dispensedNaOH >= 50.0 || t.isComplete) {
        toggleContinuousFlow();
        return;
      }
      triggerBuretteDropAnimation();
      addNaOHAmount(0.25);
      playWebAudioTone('drip');
    }, 450);

  } else {
    // Close Stopcock
    t.isFlowing = false;
    clearInterval(t.flowIntervalId);
    t.flowIntervalId = null;
    if (handle) handle.classList.remove('open');
    if (flowText) flowText.textContent = 'Alirkan Perlahan (Kran Buka)';
    if (flowIcon) flowIcon.className = 'fa-solid fa-faucet-drip';

    // Rekam capaian titrasi ke Portal Guru jika sudah ada cairan yang dialirkan
    if (typeof window.recordStudentLabActivity === 'function' && t.dispensedNaOH > 0) {
      window.recordStudentLabActivity('titration', {
        volume: t.dispensedNaOH,
        ph: t.currentPH,
        endpointAchieved: t.isComplete
      });
    }
  }
}

/**
 * Fast Stopcock Toggle on Click
 */
function toggleStopcockFast() {
  toggleContinuousFlow();
}

/**
 * Animate Droplet Falling from Burette Tip
 */
function triggerBuretteDropAnimation() {
  const drop = document.getElementById('burette-falling-drop');
  if (drop) {
    drop.classList.remove('animate-drop');
    void drop.offsetWidth; // Trigger reflow
    drop.classList.add('animate-drop');
  }
}

/**
 * Add specified volume of NaOH (mL) and compute Chemical Reactions
 */
function addNaOHAmount(volIncrement) {
  const t = PracticumState.titration;
  t.dispensedNaOH = Math.min(50.0, parseFloat((t.dispensedNaOH + volIncrement).toFixed(2)));

  // Chemical Calculation:
  // Initial: 20 mL HCl 0.1 M (2.0 mmol H+)
  // Added: V mL NaOH 0.1 M (0.1 * V mmol OH-)
  // Equivalence point: Exactly 20.0 mL of NaOH
  const vAdded = t.dispensedNaOH;
  let ph = 1.0;

  if (vAdded < 19.5) {
    // Strong Acid Excess
    const mmolAcidLeft = (20.0 * 0.1) - (vAdded * 0.1);
    const totalVolume = 20.0 + vAdded;
    const concH = mmolAcidLeft / totalVolume;
    ph = -Math.log10(concH);
    ph = Math.max(1.0, ph);
  } else if (vAdded >= 19.5 && vAdded <= 20.2) {
    // Near & At Equivalence Point (Steep S-Curve Jump)
    if (vAdded < 20.0) {
      ph = 4.5 + ((vAdded - 19.5) / 0.5) * 2.5; // pH 4.5 to 7.0
    } else {
      ph = 7.0 + ((vAdded - 20.0) / 0.2) * 2.5; // pH 7.0 to 9.5
    }
  } else {
    // Strong Base Excess
    const mmolBaseExcess = (vAdded * 0.1) - (20.0 * 0.1);
    const totalVolume = 20.0 + vAdded;
    const concOH = mmolBaseExcess / totalVolume;
    const pOH = -Math.log10(concOH);
    ph = Math.min(13.5, 14.0 - pOH);
  }

  t.currentPH = parseFloat(ph.toFixed(2));

  // Determine Liquid Color in Erlenmeyer based on Phenolphthalein Range (8.2 - 10.0)
  updateFlaskLiquidColor(ph, vAdded);

  // Update UI Telemetry
  updateTitrationUI();
}

/**
 * Update Flask Liquid Color based on pH
 */
function updateFlaskLiquidColor(ph, vAdded) {
  const flaskLiquid = document.getElementById('titration-flask-liquid');
  const feedback = document.getElementById('titration-feedback');
  if (!flaskLiquid) return;

  if (ph < 8.2) {
    // Colorless (Asam / Netral)
    flaskLiquid.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
  } else if (ph >= 8.2 && ph <= 9.2 && vAdded >= 19.8 && vAdded <= 20.5) {
    // Perfect Endpoint: Faint Permanent Pink (Merah Muda Samar)
    flaskLiquid.style.backgroundColor = 'rgba(244, 114, 182, 0.75)';
    PracticumState.titration.isComplete = true;
    updateSopStep(4);

    if (feedback) {
      feedback.innerHTML = `
        <i class="fa-solid fa-trophy color-gold"></i>
        <strong>SEMPURNA! TITIK AKHIR TITRASI TERCAPAI!</strong>
        Volume NaOH: ${vAdded.toFixed(2)} mL (pH ${ph.toFixed(2)}). Warna merah muda bertahan stabil!
      `;
    }
    playWebAudioTone('victory');

    // Hubungkan capaian titrasi sempurna ke Portal Guru
    if (typeof window.recordStudentLabActivity === 'function') {
      window.recordStudentLabActivity('titration', {
        volume: vAdded,
        ph: ph,
        endpointAchieved: true
      });
    }
  } else {
    // Over-titrated (Terlalu Basa / Merah Lembayung Pekat)
    flaskLiquid.style.backgroundColor = 'rgba(192, 38, 211, 0.9)';
    if (feedback) {
      feedback.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation color-amber"></i>
        <strong>Titrasi Lewat Batas (Over-titrated)!</strong>
        Volume NaOH: ${vAdded.toFixed(2)} mL (pH ${ph.toFixed(2)}). Penambahan basa terlalu banyak sehingga warna menjadi ungu pekat!
      `;
    }

    if (typeof window.recordStudentLabActivity === 'function' && vAdded >= 21.0) {
      window.recordStudentLabActivity('titration', {
        volume: vAdded,
        ph: ph,
        endpointAchieved: false
      });
    }
  }
}

/**
 * Update Titration Telemetry DOM
 */
function updateTitrationUI() {
  const t = PracticumState.titration;

  const dispVolNaOH = document.getElementById('disp-vol-naoh');
  const dispVolBurette = document.getElementById('disp-vol-buret');
  const dispPH = document.getElementById('disp-ph-val');
  const buretteLiquidBar = document.getElementById('burette-liquid-bar');
  const phPointer = document.getElementById('ph-pointer');

  if (dispVolNaOH) dispVolNaOH.textContent = `${t.dispensedNaOH.toFixed(2)} mL`;
  if (dispVolBurette) dispVolBurette.textContent = `${(50.0 - t.dispensedNaOH).toFixed(2)} mL`;
  if (dispPH) {
    dispPH.textContent = `${t.currentPH.toFixed(2)} ${t.currentPH < 7 ? '(Asam)' : (t.currentPH === 7 ? '(Netral)' : '(Basa)')}`;
  }

  // Update Burette liquid height (0 to 100%)
  if (buretteLiquidBar) {
    const pct = ((50.0 - t.dispensedNaOH) / 50.0) * 100;
    buretteLiquidBar.style.height = `${pct}%`;
  }

  // Update pH meter pointer position (pH 1 to 14 maps to 0% to 100%)
  if (phPointer) {
    const leftPct = Math.min(100, Math.max(0, ((t.currentPH - 1) / 13) * 100));
    phPointer.style.left = `${leftPct}%`;
  }
}

/**
 * Highlight Active SOP Step
 */
function updateSopStep(stepNum) {
  for (let i = 1; i <= 4; i++) {
    const sopElem = document.getElementById(`sop-t-${i}`);
    if (sopElem) {
      if (i === stepNum) {
        sopElem.classList.add('current');
      } else {
        sopElem.classList.remove('current');
      }
    }
  }
  const badge = document.getElementById('titrasi-step-badge');
  if (badge) badge.textContent = `Langkah ${stepNum} / 4`;
}

/**
 * Reset Titration Bench
 */
function resetTitration() {
  const t = PracticumState.titration;
  if (t.isFlowing) toggleContinuousFlow();

  t.dispensedNaOH = 0.0;
  t.hasPPIndicator = false;
  t.ppDropsCount = 0;
  t.currentPH = 1.0;
  t.isComplete = false;

  const flaskLiquid = document.getElementById('titration-flask-liquid');
  if (flaskLiquid) flaskLiquid.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';

  const indState = document.getElementById('disp-indicator-state');
  if (indState) {
    indState.textContent = 'Belum Ditambahkan';
    indState.className = '';
  }

  const feedback = document.getElementById('titration-feedback');
  if (feedback) {
    feedback.innerHTML = `<i class="fa-solid fa-info-circle"></i> Mulailah dengan meneteskan indikator Fenolftalein (PP) ke dalam Erlenmeyer!`;
  }

  updateSopStep(1);
  updateTitrationUI();
}

/* ==========================================================================
   2. PENGUKURAN PRESISI MENISKUS & PIPET
   ========================================================================== */

function dispensePipetteIntoCylinder() {
  const m = PracticumState.meniscus;
  m.cylinderCurrentVolume = parseFloat((m.cylinderCurrentVolume + 0.5).toFixed(1));
  if (m.cylinderCurrentVolume > 50.0) m.cylinderCurrentVolume = 35.0; // Wrap around

  updateMeniscusUI();
  playWebAudioTone('drip');
  showAppNotification(`Cairan ditambahkan ke gelas ukur (+0.5 mL). Volume saat ini: ${m.cylinderCurrentVolume} mL`);
}

function changeCylinderTarget(targetVol) {
  PracticumState.meniscus.targetVolume = targetVol;
  PracticumState.meniscus.cylinderCurrentVolume = targetVol;
  updateMeniscusUI();
  playWebAudioTone('click');
}

function updateMeniscusUI() {
  const m = PracticumState.meniscus;
  const fluid = document.getElementById('cylinder-fluid');
  const lensCurve = document.getElementById('lens-liquid-curve');

  // Cylinder scale is 35 mL (0%) to 50 mL (100%)
  const minVol = 35.0;
  const maxVol = 50.0;
  const pct = Math.max(10, Math.min(95, ((m.cylinderCurrentVolume - minVol) / (maxVol - minVol)) * 100));

  if (fluid) fluid.style.height = `${pct}%`;
  if (lensCurve) lensCurve.style.height = `${(pct * 1.2)}px`;
}

function verifyMeniscusReading() {
  const inputElem = document.getElementById('meniscus-user-input');
  const feedback = document.getElementById('meniscus-check-feedback');
  if (!inputElem || !feedback) return;

  const userVal = parseFloat(inputElem.value);
  const correctVal = PracticumState.meniscus.cylinderCurrentVolume;

  if (isNaN(userVal)) {
    feedback.innerHTML = `<span class="color-red"><i class="fa-solid fa-triangle-exclamation"></i> Masukkan angka volume terlebih dahulu!</span>`;
    return;
  }

  const diff = Math.abs(userVal - correctVal);
  if (diff <= 0.2) {
    feedback.innerHTML = `
      <span class="color-emerald">
        <i class="fa-solid fa-circle-check"></i> <strong>Luar Biasa, Pembacaan Sangat Akurat!</strong>
        Anda membaca ${userVal} mL (Kunci Nilai: ${correctVal} mL). Mata Anda sejajar dengan meniskus bawah!
      </span>
    `;
    playWebAudioTone('victory');
  } else {
    feedback.innerHTML = `
      <span class="color-amber">
        <i class="fa-solid fa-triangle-exclamation"></i> Kurang tepat. Anda memasukkan ${userVal} mL. Nilai yang tepat adalah ${correctVal} mL. Perhatikan dasar cekungan cairan!
      </span>
    `;
    playWebAudioTone('beep');
  }

  // Hubungkan nilai presisi meniskus ke Portal Guru
  if (typeof window.recordStudentLabActivity === 'function') {
    window.recordStudentLabActivity('meniscus', {
      userVal: userVal,
      correctVal: correctVal,
      diff: diff
    });
  }
}

function resetMeniscus() {
  PracticumState.meniscus.cylinderCurrentVolume = 42.5;
  PracticumState.meniscus.targetVolume = 42.5;
  const input = document.getElementById('meniscus-user-input');
  const fb = document.getElementById('meniscus-check-feedback');
  if (input) input.value = '';
  if (fb) fb.innerHTML = '';
  updateMeniscusUI();
}

/* ==========================================================================
   3. PEMANASAN LARUTAN DENGAN PEMBAKAR BUNSEN
   ========================================================================== */

function igniteBunsen() {
  const b = PracticumState.bunsen;
  if (!b.isGasOpen) {
    showAppNotification('Katup gas tertutup! Buka katup gas terlebih dahulu.');
    return;
  }

  b.isIgnited = true;
  playWebAudioTone('ignite');

  const flame = document.getElementById('bunsen-flame');
  if (flame) {
    flame.classList.add('active');
    if (b.collarMode === 'yellow') {
      flame.classList.add('yellow');
    } else {
      flame.classList.remove('yellow');
    }
  }

  // Start temperature climb interval
  if (!b.tempIntervalId) {
    b.tempIntervalId = setInterval(updateBunsenHeatingTick, 800);
  }

  const fb = document.getElementById('bunsen-feedback');
  if (fb) {
    fb.innerHTML = `<i class="fa-solid fa-fire color-cyan"></i> Api Bunsen menyala! Mengamati perpindahan kalor dan kenaikan suhu larutan.`;
  }

  updateBunsenUI();
}

function toggleBunsenCollar() {
  const b = PracticumState.bunsen;
  b.collarMode = (b.collarMode === 'blue') ? 'yellow' : 'blue';

  const flame = document.getElementById('bunsen-flame');
  if (flame && b.isIgnited) {
    if (b.collarMode === 'yellow') {
      flame.classList.add('yellow');
    } else {
      flame.classList.remove('yellow');
    }
  }

  playWebAudioTone('click');
  updateBunsenUI();

  const fb = document.getElementById('bunsen-feedback');
  if (fb) {
    if (b.collarMode === 'blue') {
      fb.innerHTML = `<i class="fa-solid fa-wind color-cyan"></i> Katup udara terbuka: Api biru panas tanpa jelaga (pembakaran sempurna).`;
    } else {
      fb.innerHTML = `<i class="fa-solid fa-wind color-amber"></i> Katup udara tertutup: Api kuning berjelaga (pembakaran tidak sempurna).`;
    }
  }
}

function toggleBunsenGas() {
  const b = PracticumState.bunsen;
  b.isGasOpen = !b.isGasOpen;
  if (!b.isGasOpen && b.isIgnited) {
    extinguishBunsen();
  }
  playWebAudioTone('click');
  showAppNotification(b.isGasOpen ? 'Katup gas dibuka.' : 'Katup gas ditutup.');
}

function extinguishBunsen() {
  const b = PracticumState.bunsen;
  b.isIgnited = false;
  clearInterval(b.tempIntervalId);
  b.tempIntervalId = null;

  const flame = document.getElementById('bunsen-flame');
  const bubbles = document.getElementById('boil-bubbles');
  if (flame) flame.classList.remove('active');
  if (bubbles) bubbles.classList.remove('active');

  const fb = document.getElementById('bunsen-feedback');
  if (fb) {
    fb.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Api Bunsen dipadamkan. Suhu perlahan mendingin.`;
  }

  updateBunsenUI();
  playWebAudioTone('extinguish');

  // Hubungkan capaian pemanasan Bunsen ke Portal Guru jika sudah ada pemanasan
  if (typeof window.recordStudentLabActivity === 'function' && b.currentTemp > 35.0) {
    window.recordStudentLabActivity('bunsen', {
      maxTemp: b.currentTemp,
      flameMode: b.collarMode,
      isBoiling: b.isBoiling
    });
  }
}

function updateBunsenHeatingTick() {
  const b = PracticumState.bunsen;
  if (!b.isIgnited) return;

  const rate = (b.collarMode === 'blue') ? 4.5 : 2.0; // Blue flame heats twice as fast
  b.currentTemp = Math.min(100.0, parseFloat((b.currentTemp + rate).toFixed(1)));

  const bubbles = document.getElementById('boil-bubbles');
  if (b.currentTemp >= 95.0) {
    b.isBoiling = true;
    if (bubbles) bubbles.classList.add('active');
    playWebAudioTone('bubble');

    // Hubungkan capaian mendidih ke Portal Guru
    if (!b.hasRecordedBoil) {
      b.hasRecordedBoil = true;
      if (typeof window.recordStudentLabActivity === 'function') {
        window.recordStudentLabActivity('bunsen', {
          maxTemp: b.currentTemp,
          flameMode: b.collarMode,
          isBoiling: true
        });
      }
    }
  } else {
    b.isBoiling = false;
    if (bubbles) bubbles.classList.remove('active');
  }

  updateBunsenUI();
}

function updateBunsenUI() {
  const b = PracticumState.bunsen;
  const tempDisp = document.getElementById('bunsen-temp-disp');
  const flameType = document.getElementById('bunsen-flame-type');
  const boilStatus = document.getElementById('bunsen-boil-status');

  if (tempDisp) tempDisp.textContent = `${b.currentTemp.toFixed(1)} °C`;
  if (flameType) {
    if (!b.isIgnited) {
      flameType.textContent = 'Padam (OFF)';
      flameType.className = '';
    } else if (b.collarMode === 'blue') {
      flameType.textContent = 'Api Biru (Non-Luminous ~1100°C)';
      flameType.className = 'color-cyan';
    } else {
      flameType.textContent = 'Api Kuning (Luminous ~700°C)';
      flameType.className = 'color-amber';
    }
  }

  if (boilStatus) {
    if (b.currentTemp >= 98.0) {
      boilStatus.textContent = 'Mendidih (Titik Didih Air 100°C)';
      boilStatus.className = 'color-red';
    } else if (b.currentTemp > 60.0) {
      boilStatus.textContent = 'Panas (Penguapan)';
      boilStatus.className = 'color-amber';
    } else {
      boilStatus.textContent = 'Suhu Ruang Normal';
      boilStatus.className = '';
    }
  }
}

function resetBunsen() {
  extinguishBunsen();
  PracticumState.bunsen.currentTemp = 27.0;
  PracticumState.bunsen.collarMode = 'blue';
  PracticumState.bunsen.isGasOpen = true;
  PracticumState.bunsen.hasRecordedBoil = false;
  updateBunsenUI();
}
