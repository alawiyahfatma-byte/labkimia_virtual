/**
 * ============================================================================
 * CHEMLAB 3D - THREE.JS 3D / AR / VR INTERACTIVE LABORATORY APPARATUS ENGINE
 * ============================================================================
 * 16 Procedural Glassware & Apparatus Models with PBR Borosilicate Glass & Porcelain,
 * Auto-Framing Viewport (No Cropping), 360 OrbitControls, AR Camera Stream,
 * VR Stereoscopic Render, and Indonesian Speech Synthesis (TTS).
 */

// Global 3D State Object
const Lab3DState = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  currentApparatusId: 'erlenmeyer',
  currentModelGroup: null,
  liquidMesh: null,
  currentLiquidColor: 0x2563eb, // Default CuSO4 Blue
  currentLiquidHex: '#2563eb',
  currentLiquidName: 'Larutan Tembaga(II) Sulfat CuSO4 (Biru)',
  isAutoRotating: false,
  isXRayActive: false,
  isARActive: false,
  isVRActive: false,
  arStream: null,
  animationFrameId: null,
  anatomyPoints: [],
  // Pouring & Draining Animation State
  isPouring: false,
  isDraining: false,
  pouringStartTime: 0,
  drainStartTime: 0,
  pouringDuration: 1.85,
  drainStartProgress: 1.0,
  pouringStreamGroup: null,
  toastTimeoutId: null
};

// 3D Mouth & Stream Injection Points for Realistic Liquid Pouring Simulation
const APPARATUS_MOUTH_DATA = {
  erlenmeyer: { x: 0, y: 5.7, z: 0, streamStart: 8.2, streamWidth: 0.16 },
  beaker: { x: 0, y: 4.8, z: 0, streamStart: 7.2, streamWidth: 0.22 },
  cylinder: { x: 0, y: 7.5, z: 0, streamStart: 9.8, streamWidth: 0.14 },
  pipette: { x: 0, y: 5.8, z: 0, streamStart: 8.0, streamWidth: 0.08 },
  testtube: { x: 0, y: 4.45, z: 0, streamStart: 6.8, streamWidth: 0.11 },
  volumetric: { x: 0, y: 7.2, z: 0, streamStart: 9.6, streamWidth: 0.12 },
  burette: { x: -0.6, y: 7.9, z: 0, streamStart: 10.2, streamWidth: 0.11 },
  corong: { x: 0, y: 5.0, z: 0, streamStart: 7.4, streamWidth: 0.18 },
  cawan: { x: 0, y: 1.5, z: 0, streamStart: 3.8, streamWidth: 0.22 },
  arloji: { x: 0, y: 0.8, z: 0, streamStart: 3.0, streamWidth: 0.16 },
  mortar: { x: 0, y: 1.6, z: 0, streamStart: 3.8, streamWidth: 0.20 },
  pipetvolume: { x: 0, y: 9.4, z: 0, streamStart: 12.2, streamWidth: 0.10 }
};

/**
 * Procedural Web Audio API Laboratory Sound Synthesizer
 * Synthesizes realistic fluid acoustics (acoustic resonance sweep + bubble modulation + chime drop)
 * Completely offline, zero external file dependencies!
 */
class LabAudioSynth {
  constructor() {
    this.ctx = null;
    this.activeNodes = [];
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPouringSound(durationSec = 1.85) {
    this.init();
    if (!this.ctx) return;
    this.stopAll();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Generate White Noise Buffer
    const bufferSize = Math.floor(ctx.sampleRate * Math.min(durationSec + 0.4, 4));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = false;

    // Resonant Bandpass Filter - Frequency rises as vessel cavity fills (Acoustic Physics)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(11, now);
    bandpass.frequency.setValueAtTime(420, now);
    bandpass.frequency.exponentialRampToValueAtTime(1180, now + durationSec);

    // Peaking Filter for fluid glug resonance
    const peakFilter = ctx.createBiquadFilter();
    peakFilter.type = 'peaking';
    peakFilter.Q.setValueAtTime(6.5, now);
    peakFilter.gain.setValueAtTime(9, now);
    peakFilter.frequency.setValueAtTime(560, now);
    peakFilter.frequency.exponentialRampToValueAtTime(1350, now + durationSec);

    // Master Volume Gain Envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.22, now + 0.12);
    gainNode.gain.setValueAtTime(0.22, now + durationSec - 0.18);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec + 0.15);

    // Connect audio processing chain
    whiteNoise.connect(bandpass);
    bandpass.connect(peakFilter);
    peakFilter.connect(gainNode);
    gainNode.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + durationSec + 0.2);

    this.activeNodes.push(whiteNoise, gainNode);

    // Play final water droplet chime as liquid reaches top
    setTimeout(() => {
      this.playDropChime();
    }, Math.max(0, (durationSec - 0.08) * 1000));
  }

  playDropChime() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  playDrainSound() {
    this.init();
    if (!this.ctx) return;
    this.stopAll();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.85;

    const bufferSize = Math.floor(ctx.sampleRate * (duration + 0.2));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(6, now);
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + duration + 0.1);

    this.activeNodes.push(whiteNoise, gain);
  }

  playCrystalClink() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1760, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  stopAll() {
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {}
    });
    this.activeNodes = [];
  }
}

const LabSFX = {
  synth: null,
  isMuted: false,
  init() {
    if (!this.synth) this.synth = new LabAudioSynth();
  },
  playPour(dur = 1.85) {
    if (this.isMuted) return;
    this.init();
    if (this.synth) this.synth.playPouringSound(dur);
  },
  playDrain() {
    if (this.isMuted) return;
    this.init();
    if (this.synth) this.synth.playDrainSound();
  },
  playCrystal() {
    if (this.isMuted) return;
    this.init();
    if (this.synth) this.synth.playCrystalClink();
  },
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.synth) this.synth.stopAll();
    return this.isMuted;
  }
};

// Chemistry Apparatus Catalog with Rich Pedagogical Data (16 Essential Lab Tools)
const ApparatusCatalog = [
  {
    id: 'erlenmeyer',
    name: 'Labu Erlenmeyer (Conical Flask)',
    category: 'Wadah Reaksi & Titrasi',
    icon: 'fa-flask',
    function: 'Digunakan untuk menampung larutan, mencampur zat melalui penggoyangan (swirling) tanpa risiko tumpah, dan wadah utama larutan analit saat titrasi asam-basa.',
    material: 'Kaca Borosilikat (Pyrex 3.3) tahan perubahan termal ekstrem hingga 500°C.',
    mistakes: 'Bukan alat ukur kuantitatif presisi! Garis skala pada Erlenmeyer hanya berupa estimasi kasar dengan margin kesalahan ±5%.',
    sop: 'Pegang leher sempit labu dengan ibu jari dan telunjuk, goyangkan pergelangan tangan memutar searah jarum jam secara konsisten saat proses titrasi.',
    anatomy: [
      { name: 'Bibir Labu Diperkuat', desc: 'Bibir kaca tebal tahan benturan dan memudahkan pemasangan sumbat karet/gabus.' },
      { name: 'Leher Mengerucut', desc: 'Mencegah cipratan cairan ke luar saat larutan digoyang kuat.' },
      { name: 'Dasar Datar Luas', desc: 'Memberikan kestabilan tinggi saat diletakkan di atas magnetic stirrer.' }
    ],
    audioText: 'Labu Erlenmeyer adalah wadah berbentuk kerucut dengan leher sempit. Sangat ideal untuk titrasi karena larutan dapat diaduk dengan memutar labu tanpa risiko memercik ke luar.'
  },
  {
    id: 'beaker',
    name: 'Gelas Kimia (Beaker Glass 250 mL)',
    category: 'Wadah Preparasi & Pelarutan',
    icon: 'fa-glass-water',
    function: 'Digunakan untuk menyiapkan larutan, melarutkan zat padat, memanaskan cairan, dan menampung filtrat hasil penyaringan.',
    material: 'Kaca Borosilikat berdinding tebal tahan api bunsen dan hotplate.',
    mistakes: 'Sering disalahgunakan untuk mengukur volume analitik kuantitatif. Beaker hanya untuk perkiraan kasar.',
    sop: 'Selalu gunakan batang pengaduk saat melarutkan solut, dan gunakan penjepit beaker khusus jika gelas dalam kondisi panas.',
    anatomy: [
      { name: 'Paruh Tuang (Spout)', desc: 'Memungkinkan penuangan cairan yang rapi tanpa menetes ke dinding luar.' },
      { name: 'Skala Mililiter', desc: 'Garis tera volume perkiraan dari 50 mL hingga 250 mL.' }
    ],
    audioText: 'Gelas Kimia atau beaker digunakan sebagai wadah serbaguna untuk melarutkan bahan dan menampung cairan. Memiliki paruh untuk menuang cairan dengan rapi.'
  },
  {
    id: 'cylinder',
    name: 'Gelas Ukur (Graduated Cylinder 100 mL)',
    category: 'Pengukuran Volume Semi-Presisi',
    icon: 'fa-ruler-vertical',
    function: 'Digunakan untuk mengukur volume cairan dengan tingkat ketelitian menengah (toleransi ±0.5 mL) untuk keperluan reaksi sehari-hari.',
    material: 'Kaca Borosilikat Kelas B dengan kalibrasi skala suhu 20°C (In/Ex).',
    mistakes: 'Membaca meniskus dari atas atau bawah yang menyebabkan kesalahan paralaks, atau memanaskan gelas ukur langsung di atas api.',
    sop: 'Letakkan di meja datar, posisikan mata sejajar garis cekungan cairan, dan baca nilai pada dasar meniskus cekung terendah.',
    anatomy: [
      { name: 'Dasar Heksagonal', desc: 'Mencegah silinder terguling jika tersenggol di meja lab.' },
      { name: 'Garis Skala Presisi', desc: 'Skala garis terukir rapi dengan interval per 1 mL.' }
    ],
    audioText: 'Gelas ukur digunakan untuk mengukur volume cairan dengan ketelitian sedang. Bacalah selalu pada bagian dasar meniskus cekung dengan mata sejajar.'
  },
  {
    id: 'pipette',
    name: 'Pipet Tetes (Dropper Pipette)',
    category: 'Pemindahan Cairan Skala Mikro',
    icon: 'fa-eye-dropper',
    function: 'Digunakan untuk mengambil dan memindahkan cairan dalam volume kecil tetes demi tetes (1 tetes standar ~ 0.05 mL).',
    material: 'Kaca kapiler transparan dengan pentol karet hisap fleksibel (karet silikon merah/hitam).',
    mistakes: 'Memegang pipet dalam posisi terbalik atau mendatar sehingga cairan masuk ke dalam karet hisap dan mengkontaminasi pentol karet.',
    sop: 'Pegang tegak lurus (90 derajat), tekan karet sebelum memasukkan ujung pipet ke cairan, lalu lepas perlahan.',
    anatomy: [
      { name: 'Pentol Karet Hisap (Bulb)', desc: 'Menghasilkan tekanan negatif untuk menyedot dan mendorong cairan.' },
      { name: 'Ujung Kapiler Tapered', desc: 'Menghasilkan tetesan dengan ukuran volume konsisten.' }
    ],
    audioText: 'Pipet tetes berfungsi memindahkan cairan tetes demi tetes. Jangan pernah membalik pipet agar cairan tidak merusak karet hisap.'
  },
  {
    id: 'bunsen',
    name: 'Pembakar Bunsen (Bunsen Burner)',
    category: 'Sumber Pemanas Pembakaran',
    icon: 'fa-fire-burner',
    function: 'Alat pemanas laboratorium yang menghasilkan nyala api gas terkontrol untuk sterilisasi, pemanasan reagen, dan uji nyala ion logam.',
    material: 'Kuningan lapis krom, pipa besi cor, dan katup pengatur gas kuningan.',
    mistakes: 'Menyalakan api dengan katup udara terbuka penuh (bisa menyebabkan api masuk ke dalam cerobong) atau menggunakan api kuning yang menghasilkan jelaga hitam.',
    sop: 'Tutup lubang udara terlebih dahulu saat menyalakan korek api, lalu buka lubang perlahan hingga nyala api berubah biru transparan tanpa jelaga.',
    anatomy: [
      { name: 'Cincin Pengatur Udara (Collar)', desc: 'Mengatur pasokan oksigen untuk mengubah api dari kuning ke biru panas.' },
      { name: 'Cerobong Api Logam (Barrel)', desc: 'Ruang pencampuran antara gas alam dengan oksigen udara.' },
      { name: 'Pondasi Besi Berat (Base)', desc: 'Menjaga pembakar tetap stabil dan tidak mudah roboh.' }
    ],
    audioText: 'Pembakar Bunsen menghasilkan api laboratorium. Atur katup udara untuk mendapatkan api biru yang sangat panas dan tidak berjelaga.'
  },
  {
    id: 'testtube',
    name: 'Tabung Reaksi & Rak (Test Tube & Rack)',
    category: 'Uji Kualitatif Skala Kecil',
    icon: 'fa-vial',
    function: 'Digunakan untuk mereaksikan zat dalam jumlah kecil (2-10 mL), uji perubahan warna, pembentukan endapan, dan uji gas kualitatif.',
    material: 'Kaca tipis borosilikat dengan dasar bulat setengah lingkaran; rak terbuat dari akrilik/kayu tahan zat kimia.',
    mistakes: 'Mengarahkan mulut tabung ke wajah sendiri atau teman saat memanaskan tabung, dan mengisi tabung lebih dari sepertiga kapasitas.',
    sop: 'Jepit tabung menggunakan penjepit kayu pada 1/3 bagian atas, miringkan 45 derajat saat dipanaskan di api bunsen.',
    anatomy: [
      { name: 'Dasar Bulat U-Shape', desc: 'Memudahkan sirkulasi konveksi panas cairan secara merata.' },
      { name: 'Rak Penyangga Lubang Tabung', desc: 'Menjaga tabung tetap tegak dan tertata rapi saat pengamatan.' }
    ],
    audioText: 'Tabung reaksi digunakan untuk mereaksikan bahan kimia dalam jumlah sedikit. Selalu arahkan mulut tabung ke tempat aman saat dipanaskan.'
  },
  {
    id: 'volumetric',
    name: 'Labu Ukur (Volumetric Flask 100 mL)',
    category: 'Pengukuran Presisi Tinggi (Kuantitatif)',
    icon: 'fa-wine-bottle',
    function: 'Digunakan untuk membuat larutan standar dengan konsentrasi sangat presisi dan pengenceran volume tepat hingga tanda tera.',
    material: 'Kaca Borosilikat Kalibrasi TC/IN Kelas A dengan toleransi ketelitian tinggi (±0.08 mL).',
    mistakes: 'Melarutkan zat padat langsung di dalam labu ukur atau mengocok labu tanpa menekan sumbat penutup dengan ibu jari.',
    sop: 'Larutkan zat terlebih dahulu di beaker, tuang lewat corong, tambahkan akuades hingga mendekati leher, lalu gunakan pipet tetes hingga dasar meniskus tepat menyentuh garis tera.',
    anatomy: [
      { name: 'Garis Tera Kalibrasi', desc: 'Garis lingkaran tipis yang menandai batas volume eksak pada suhu 20°C.' },
      { name: 'Tutup Asah Kaca (Stopper)', desc: 'Mencegah penguapan larutan saat proses homogenisasi kocok balik.' }
    ],
    audioText: 'Labu ukur adalah alat ukur volume paling teliti untuk membuat larutan baku. Isi larutan hingga batas garis tera pada leher labu.'
  },
  {
    id: 'burette',
    name: 'Buret & Statif (Burette 50 mL)',
    category: 'Aparatus Titrasi Volumetri',
    icon: 'fa-syringe',
    function: 'Alat ukur volumetri berbentuk pipa silinder panjang berskala dengan kran presisi di ujung bawah untuk mengeluarkan cairan titran secara bertahap.',
    material: 'Kaca borosilikat tebal dengan skala terbalik (0 mL di atas, 50 mL di bawah) dan keran Teflon (PTFE).',
    mistakes: 'Lupa mengeluarkan gelembung udara pada ujung buret sebelum titrasi dimulai, atau salah membaca skala terbalik.',
    sop: 'Bilas buret dengan larutan titran sebelum diisi, pastikan tidak ada kebocoran, dan kendalikan kran dengan tangan kiri melingkari kran buret.',
    anatomy: [
      { name: 'Keran Teflon (Stopcock)', desc: 'Mengatur laju tetesan dari aliran cepat hingga tetes per detik yang presisi.' },
      { name: 'Klem & Statif Besi', desc: 'Memegang buret tegak lurus sempurna sepanjang pengujian berlangsung.' }
    ],
    audioText: 'Buret digunakan untuk mengeluarkan volume larutan secara akurat saat titrasi. Skalanya terbalik dengan angka nol berada di paling atas.'
  },
  {
    id: 'corong',
    name: 'Corong Kaca & Kertas Saring (Filter Funnel)',
    category: 'Pemisahan Campuran & Filtrasi',
    icon: 'fa-filter',
    function: 'Digunakan untuk memindahkan cairan ke wadah bermulut kecil tanpa tumpah, dan tempat meletakkan kertas saring saat proses pemisahan endapan filtrasi gravitasi.',
    material: 'Kaca Borosilikat tebal dengan sudut kemiringan kerucut standar 60° dan batang pipa panjang.',
    mistakes: 'Menuangkan suspensi melebihi tepi atas kertas saring sehingga partikel endapan lolos ke filtrat.',
    sop: 'Lipat kertas saring menjadi empat bagian, basahi sedikit dengan akuades agar melekat erat pada dinding corong, dan tempelkan ujung tangkai corong ke dinding gelas penampung.',
    anatomy: [
      { name: 'Mulut Kerucut 60°', desc: 'Sudut ideal untuk menopang lipatan kertas saring lipat/lingkaran.' },
      { name: 'Batang Pipa Miring (Stem)', desc: 'Ujung dipotong miring agar filtrat mengalir lancar tanpa membentuk gelembung udara.' }
    ],
    audioText: 'Corong kaca digunakan untuk filtrasi dan memindahkan cairan ke wadah sempit. Pasang kertas saring dan basahi sedikit agar melekat sempurna.'
  },
  {
    id: 'cawan',
    name: 'Cawan Penguap Porselen (Evaporating Dish)',
    category: 'Pemanasan & Kristalisasi',
    icon: 'fa-bowl-rice',
    function: 'Digunakan untuk memisahkan pelarut dari zat terlarut melalui penguapan suhu tinggi serta proses kristalisasi garam.',
    material: 'Porselen glasir tahan api langsung hingga suhu 1050°C.',
    mistakes: 'Memegang cawan panas langsung dengan tangan terbuka atau meletakkannya di meja basah dingin yang memicu retakan termal.',
    sop: 'Letakkan di atas kasa kawat dan kaki tiga, panaskan perlahan, dan gunakan tang krusibel (crucible tongs) saat mengangkat.',
    anatomy: [
      { name: 'Permukaan Cekung Luas', desc: 'Memperluas bidang kontak penguapan uap pelarut ke udara.' },
      { name: 'Bibir Tuang Runcing', desc: 'Memudahkan menuangkan sisa larutan pekat atau kristal.' }
    ],
    audioText: 'Cawan penguap porselen tahan suhu sangat tinggi. Digunakan untuk menguapkan pelarut dan membentuk kristal zat padat.'
  },
  {
    id: 'arloji',
    name: 'Kaca Arloji (Watch Glass)',
    category: 'Penimbangan & Penutup Beaker',
    icon: 'fa-circle-dot',
    function: 'Digunakan sebagai wadah saat menimbang bahan kimia padat di neraca analitik, penutup gelas beaker saat pemanasan agar uap tidak hilang, dan wadah pengeringan kristal.',
    material: 'Kaca bening melengkung tahan zat kimia asam dan basa.',
    mistakes: 'Memanaskan kaca arloji secara langsung di atas api bunsen (bisa pecah seketika karena bukan wadah pemanas langsung).',
    sop: 'Tara neraca terlebih dahulu bersama kaca arloji sebelum meletakkan serbuk kimia, dan bersihkan dengan kertas hisap setelah digunakan.',
    anatomy: [
      { name: 'Lengkungan Cembung-Cekung', desc: 'Mencegah butiran zat padat menggelinding jatuh saat proses penimbangan.' }
    ],
    audioText: 'Kaca arloji berbentuk piringan melengkung bening. Berfungsi untuk menimbang serbuk kimia dan menutup beaker saat pemanasan.'
  },
  {
    id: 'mortar',
    name: 'Mortal dan Alu Porselen (Mortar & Pestle)',
    category: 'Preparasi Sampel & Penghalusan',
    icon: 'fa-mortar-pestle',
    function: 'Digunakan untuk menghancurkan, menggiling, dan menghaluskan padatan kristal atau simplisia kimia menjadi serbuk halus homogen.',
    material: 'Porselen pualam tebal dengan bagian dalam bertekstur kasar unglazed untuk meningkatkan friksi penggerusan.',
    mistakes: 'Memukul alu ke dasar mortal seperti palu yang dapat memecahkan mangkuk porselen.',
    sop: 'Gerakkan alu dengan gerakan memutar melingkar (grinding) sambil ditekan kuat secara bertahap.',
    anatomy: [
      { name: 'Mangkuk Mortal Kasar', desc: 'Bagian dalam tanpa glasir memberikan gesekan maksimal untuk menghaluskan kristal.' },
      { name: 'Alu Penghalus (Pestle)', desc: 'Kepala penggerus bulat dengan pegangan ergonomis.' }
    ],
    audioText: 'Mortal dan alu digunakan untuk menghaluskan zat padat kimia. Gerakkan alu secara memutar melingkar dan jangan memukulnya.'
  },
  {
    id: 'spatula',
    name: 'Spatula Logam & Sendok Tanduk (Lab Spatula)',
    category: 'Pengambilan Reagen Padat',
    icon: 'fa-spoon',
    function: 'Digunakan untuk mengambil bahan kimia padat berupa serbuk, butiran, atau kristal dari botol reagen ke wadah timbang secara presisi.',
    material: 'Baja tahan karat (Stainless Steel AISI 316) tahan korosi kimia asam-basa kuat dengan tatakan porselen.',
    mistakes: 'Menggunakan spatula yang kotor atau basah sehingga mengkontaminasi seluruh botol reagen stok, atau menggunakan bilah untuk menggores botol kaca.',
    sop: 'Selalu bersihkan dan keringkan bilah serta sendok sebelum dan sesudah mengambil bahan. Gunakan ujung pipih untuk memecah bongkahan dan ujung sendok untuk menyendok butiran padatan.',
    anatomy: [
      { name: 'Ujung Sendok Cekung (Spoon Scoop)', desc: 'Mangkuk sendok oval cekung untuk menyendok serbuk atau kristal padatan kimia dalam takaran terukur.' },
      { name: 'Batang Pegangan Anti-Slip (Knurled Grip)', desc: 'Batang baja tahan karat silindris dengan alur gerigi anti-selip agar stabil saat digenggam memakai sarung tangan lab.' },
      { name: 'Ujung Bilah Pipih (Flat Chisel Blade)', desc: 'Bilah pipih tipis dengan ujung bersudut tajam untuk memecah gumpalan dan mengambil reagen kristal mikro.' },
      { name: 'Tatakan Porselen Berlekuk (Porcelain Rest)', desc: 'Dudukan porselen berlekuk kembar untuk menjaga bilah dan sendok tetap higienis terangkat aman di atas meja lab.' }
    ],
    audioText: 'Spatula logam laboratorium memiliki dua sisi fungsional: ujung sendok cekung untuk menyendok serbuk, dan ujung bilah pipih untuk memecah kristal atau mengambil reagen tipis. Dilengkapi tatakan porselen agar tidak mengkontaminasi meja praktikum.'
  },
  {
    id: 'tripod',
    name: 'Kaki Tiga & Kasa Kawat (Tripod & Wire Gauze)',
    category: 'Penopang Aparatus Pemanasan',
    icon: 'fa-table-cells-large',
    function: 'Alat penopang wadah kaca (beaker, erlenmeyer, cawan) di atas pembakar Bunsen, dilengkapi kawat kasa untuk meratakan distribusi panas api.',
    material: 'Besi baja tahan panas dengan pelat keramik asbes sintetis tahan api pada kawat kasa.',
    mistakes: 'Memanaskan wadah kaca langsung di atas cincin besi tanpa kawat kasa (dapat menyebabkan tegangan lokal dan kaca pecah).',
    sop: 'Letakkan kasa kawat tepat di tengah lingkaran kaki tiga, lalu tempatkan wadah di atas lingkaran putih keramik peredam panas.',
    anatomy: [
      { name: 'Cincin Lingkaran Penyangga', desc: 'Menahan kasa kawat tetap kokoh dan rata horizontal.' },
      { name: 'Tiga Kaki Besi Silinder', desc: 'Konfigurasi tripod stabil di atas segala permukaan meja laboratorium.' },
      { name: 'Kasa Kawat Lingkaran Keramik', desc: 'Mencegah api langsung mengenai satu titik kaca dengan menyebarkan panas merata.' }
    ],
    audioText: 'Kaki tiga dan kasa kawat berfungsi menopang wadah saat dipanaskan di atas bunsen. Kasa keramik meratakan panas api agar kaca tidak pecah.'
  },
  {
    id: 'termometer',
    name: 'Termometer Laboratorium Celcius (Lab Thermometer)',
    category: 'Instrumen Pengukuran Suhu',
    icon: 'fa-temperature-half',
    function: 'Digunakan untuk mengukur suhu larutan atau sistem reaksi secara presisi pada rentang -10°C hingga 110°C.',
    material: 'Kaca kapiler kedap udara berisi cairan alkohol merah atau raksa yang memuai secara linear terhadap suhu.',
    mistakes: 'Menggunakan termometer sebagai batang pengaduk larutan (dapat mematahkan bola sensor reservoir kaca).',
    sop: 'Celupkan reservoir sensor ke tengah cairan tanpa menyentuh dinding atau dasar wadah yang sedang dipanaskan.',
    anatomy: [
      { name: 'Reservoir Bola Kaca (Bulb)', desc: 'Wadah cairan pengembang yang sensitif terhadap kontak panas larutan.' },
      { name: 'Pipa Kapiler Skala Celcius', desc: 'Saluran kapiler mikro dengan garis pembagian suhu per 1°C.' }
    ],
    audioText: 'Termometer laboratorium digunakan untuk mengukur suhu cairan. Jangan pernah menggunakannya untuk mengaduk larutan agar tidak patah.'
  },
  {
    id: 'pipetvolume',
    name: 'Pipet Gondok / Volumetrik (Volumetric Pipette 25 mL)',
    category: 'Pemindahan Volume Presisi Analitik',
    icon: 'fa-vial-circle-check',
    function: 'Digunakan untuk memindahkan cairan dalam volume tertentu secara eksak (25,00 mL) dengan tingkat presisi analitik tertinggi pada analisis kuantitatif.',
    material: 'Kaca Borosilikat Kalibrasi Ex/TD Kelas A (toleransi ±0.03 mL pada 20°C) dilengkapi bola hisap karet 3-katup.',
    mistakes: 'Meniup tetesan terakhir di ujung pipa (pipet volumetrik dikalibrasi pabrik untuk menyisakan sedikit cairan kapiler di ujung delivery tip).',
    sop: 'Pasang bola hisap (pipette filler 3-katup). Tekan katup A untuk membuang udara, celupkan tip ke cairan, tekan katup S untuk menghisap larutan hingga melewati garis tera, seka dinding luar kaca, lalu tekan katup E perlahan hingga cekungan meniskus tepat menyentuh garis tera.',
    anatomy: [
      { name: 'Tabung Gondok / Bulb Tengah', desc: 'Bagian tengah tabung yang menggembung bulat oval (gondok) untuk menampung kapasitas utama 25 mL larutan analit.' },
      { name: 'Garis Kalibrasi Tunggal (Garis Tera)', desc: 'Cincin tera terukir emas presisi tinggi yang menandai batas volume eksak 25.00 mL pada suhu kalibrasi 20°C.' },
      { name: 'Ujung Kapiler Tapered (Delivery Tip)', desc: 'Ujung penetesan kapiler runcing presisi yang diatur untuk memberikan laju alir stabil dan akurat.' },
      { name: 'Bola Hisap Karet 3-Katup (Pipette Filler)', desc: 'Alat hisap karet ergonomis dengan katup A (Aspirate), S (Suction), dan E (Empty) untuk keamanan pemipetan tanpa hisapan mulut.' }
    ],
    audioText: 'Pipet gondok atau pipet volumetrik digunakan untuk memindahkan volume cairan dengan ketelitian sangat tinggi, tepat dua puluh lima mililiter. Cairan dihisap menggunakan bola hisap karet hingga garis tera. Jangan pernah meniup tetesan terakhir di ujung kapiler.'
  }
];

// Initialize 3D Engine on DOM load
window.addEventListener('DOMContentLoaded', () => {
  init3DLabEngine();
  populateApparatusCatalog();
});

/**
 * Initialize Three.js Scene, Camera, WebGLRenderer, Lights, and OrbitControls
 */
function init3DLabEngine() {
  const container = document.getElementById('canvas-3d-wrapper');
  const canvas = document.getElementById('webgl-canvas');
  if (!container || !canvas || typeof THREE === 'undefined') return;

  // Scene
  Lab3DState.scene = new THREE.Scene();

  // Camera (initial position will be auto-framed per apparatus)
  const width = container.clientWidth;
  const height = container.clientHeight;
  Lab3DState.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  Lab3DState.camera.position.set(0, 4, 18);

  // Renderer with Transparent Alpha for pristine Blue-White CSS background
  Lab3DState.renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  Lab3DState.renderer.setSize(width, height);
  Lab3DState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Lab3DState.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  Lab3DState.renderer.toneMappingExposure = 1.1;

  // OrbitControls
  if (typeof THREE.OrbitControls !== 'undefined') {
    Lab3DState.controls = new THREE.OrbitControls(Lab3DState.camera, Lab3DState.renderer.domElement);
    Lab3DState.controls.enableDamping = true;
    Lab3DState.controls.dampingFactor = 0.05;
    Lab3DState.controls.maxDistance = 45;
    Lab3DState.controls.minDistance = 4;
    Lab3DState.controls.target.set(0, 0, 0);
  }

  // Lighting System (Studio Lighting for Glassware & Porcelain in White-Blue Theme)
  setup3DLighting();

  // Load Initial Model (Erlenmeyer)
  loadApparatusModel('erlenmeyer');

  // Handle Resize
  window.addEventListener('resize', onWindowResize3D);

  // Start Animation Loop
  animate3DLoop();
}

/**
 * Studio Lighting Setup for Pristine Blue-White Theme & Sparkling Glass
 */
function setup3DLighting() {
  const scene = Lab3DState.scene;
  
  // Ambient Light (Bright Clinical Studio Illumination)
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);

  // Key Light (Crisp White Directional)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(10, 14, 12);
  scene.add(keyLight);

  // Fill Light (Soft Sky Blue Reflection)
  const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.6);
  fillLight.position.set(-10, 8, -6);
  scene.add(fillLight);

  // Rim Light (Sharp Highlight for Glass Borosilicate Edges)
  const rimLight = new THREE.PointLight(0x0284c7, 1.2, 25);
  rimLight.position.set(0, -2, -6);
  scene.add(rimLight);

  // Clean Blue Laboratory Grid Floor Plate
  const gridHelper = new THREE.GridHelper(20, 20, 0x0284c7, 0x93c5fd);
  gridHelper.position.y = -2.8;
  scene.add(gridHelper);
}

/**
 * Main 3D Animation & Render Loop
 */
function animate3DLoop() {
  Lab3DState.animationFrameId = requestAnimationFrame(animate3DLoop);

  const controls = Lab3DState.controls;
  if (controls) {
    if (Lab3DState.isAutoRotating) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2.0;
    } else {
      controls.autoRotate = false;
    }
    controls.update();
  }

  // Animate Flame if Bunsen is loaded
  if (Lab3DState.currentApparatusId === 'bunsen' && Lab3DState.currentModelGroup) {
    const flameMesh = Lab3DState.currentModelGroup.getObjectByName('bunsenFlameMesh');
    if (flameMesh) {
      const time = performance.now() * 0.005;
      flameMesh.scale.x = 1 + Math.sin(time * 3) * 0.08;
      flameMesh.scale.z = 1 + Math.cos(time * 3.5) * 0.08;
      flameMesh.scale.y = 1 + Math.sin(time * 5) * 0.12;
    }
  }

  // Handle Liquid Pouring & Draining Simulation Frames
  if (Lab3DState.isPouring && Lab3DState.liquidMesh) {
    updatePouringFrame();
  } else if (Lab3DState.isDraining && Lab3DState.liquidMesh) {
    updateDrainingFrame();
  }

  // Animate Liquid Meniscus wave
  if (Lab3DState.liquidMesh && !Lab3DState.isPouring) {
    const time = performance.now() * 0.002;
    Lab3DState.liquidMesh.rotation.y = time * 0.2;
  }

  // Render Stereo VR or Normal View
  renderSceneFrame();
}

/**
 * Render scene either in standard view or VR stereo split-screen
 */
function renderSceneFrame() {
  const renderer = Lab3DState.renderer;
  const scene = Lab3DState.scene;
  const camera = Lab3DState.camera;
  if (!renderer || !scene || !camera) return;

  if (Lab3DState.isVRActive) {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const halfWidth = width / 2;

    renderer.setScissorTest(true);

    // Left Eye
    renderer.setScissor(0, 0, halfWidth, height);
    renderer.setViewport(0, 0, halfWidth, height);
    camera.aspect = halfWidth / height;
    camera.updateProjectionMatrix();
    camera.position.x -= 0.08;
    renderer.render(scene, camera);

    // Right Eye
    renderer.setScissor(halfWidth, 0, halfWidth, height);
    renderer.setViewport(halfWidth, 0, halfWidth, height);
    camera.position.x += 0.16;
    renderer.render(scene, camera);
    camera.position.x -= 0.08;

    renderer.setScissorTest(false);
  } else {
    renderer.render(scene, camera);
  }
}

/**
 * Handle Window / Canvas Resizing
 */
function onWindowResize3D() {
  const container = document.getElementById('canvas-3d-wrapper');
  const camera = Lab3DState.camera;
  const renderer = Lab3DState.renderer;
  if (!container || !camera || !renderer) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

/**
 * Glass Material Factory: Realistic PBR Borosilicate Glass (Bold & Clearly Visible, NOT Transparent!)
 */
function createPBRGlassMaterial(options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: options.color || 0x0284c7, // Vibrant Royal Cyan-Blue Glass
    metalness: 0.15,
    roughness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 0.95,
    transparent: true,
    opacity: options.opacity || 0.88, // 88% solid, bold, fully visible!
    transmission: 0.0, // 0 transmission - absolutely NO washed-out invisibility!
    depthWrite: true,
    side: THREE.DoubleSide
  });
}

/**
 * Graduation Scale Material Factory (Crisp White Enamel Print)
 */
function createGraduationMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide
  });
}

/**
 * Rim Material Factory (Solid Reinforced Glass Lip)
 */
function createRimMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x1e40af, // Deep solid royal navy rim
    roughness: 0.2,
    metalness: 0.25
  });
}

/**
 * Liquid Material Factory: 100% Solid Opaque Vibrant Chemical Solution
 */
function createPBRLiquidMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.08,
    roughness: 0.18,
    transparent: false, // 100% SOLID OPAQUE, NEVER TRANSPARENT!
    opacity: 1.0,
    side: THREE.DoubleSide
  });
}

/**
 * Porcelain Material Factory: High-grade Laboratory White Glazed Ceramic
 */
function createPorcelainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.05,
    roughness: 0.18,
    side: THREE.DoubleSide
  });
}

/**
 * Metal Material Factory: Stainless Steel & Cast Iron
 */
function createSteelMaterial(color = 0x94a3b8) {
  return new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.85,
    roughness: 0.25
  });
}

/**
 * Auto-Framing Function: Ensures Entire Model Fits in Viewport Without Any Cropping!
 */
function fitApparatusInView(group) {
  if (!Lab3DState.camera || !group) return;

  // Compute bounding box
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Center model at origin
  group.position.x = -center.x;
  group.position.y = -center.y;
  group.position.z = -center.z;

  // Calculate required camera distance with generous padding (1.6x)
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = Lab3DState.camera.fov * (Math.PI / 180);
  let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  cameraZ *= 1.62; // 62% breathing margin so tall burette / stand is 100% visible

  // Position camera smoothly
  Lab3DState.camera.position.set(0, maxDim * 0.15, Math.max(cameraZ, 13));
  Lab3DState.camera.lookAt(0, 0, 0);

  if (Lab3DState.controls) {
    Lab3DState.controls.target.set(0, 0, 0);
    Lab3DState.controls.minDistance = 4;
    Lab3DState.controls.maxDistance = 50;
    Lab3DState.controls.update();
  }
}

/**
 * Configure Liquid Mesh Geometry, Fixed Bottom Anchor & Metadata
 */
function setupLiquidMesh(mesh, apparatusId) {
  if (!mesh) return;
  mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;
  const initialScaleX = mesh.scale.x || 1.0;
  const initialScaleY = mesh.scale.y || 1.0;
  const initialScaleZ = mesh.scale.z || 1.0;
  const initialPosY = mesh.position.y;
  const bottomY = initialPosY + bbox.min.y * initialScaleY;
  const topY = initialPosY + bbox.max.y * initialScaleY;
  const height = topY - bottomY;

  mesh.userData.liquidInfo = {
    apparatusId: apparatusId || Lab3DState.currentApparatusId,
    initialScaleX: initialScaleX,
    initialScaleY: initialScaleY,
    initialScaleZ: initialScaleZ,
    initialPosY: initialPosY,
    bboxMinY: bbox.min.y,
    bboxMaxY: bbox.max.y,
    bottomY: bottomY,
    topY: topY,
    height: height,
    currentProgress: 1.0
  };

  Lab3DState.liquidMesh = mesh;
  setLiquidFillLevel(mesh, 1.0);
}

/**
 * Scale Liquid Level Proportionally with Physics-Anchored Bottom
 */
function setLiquidFillLevel(mesh, p) {
  if (!mesh || !mesh.userData || !mesh.userData.liquidInfo) return;
  const info = mesh.userData.liquidInfo;
  const safeP = Math.max(0.0001, Math.min(1.0, p));
  info.currentProgress = safeP;

  // Scale Y proportionally
  mesh.scale.y = info.initialScaleY * safeP;

  // Keep bottom anchored at info.bottomY!
  // bottom = mesh.position.y + bboxMinY * mesh.scale.y == info.bottomY
  mesh.position.y = info.bottomY - (info.bboxMinY * mesh.scale.y);

  if (safeP <= 0.005) {
    mesh.visible = false;
  } else {
    mesh.visible = true;
  }
}

/**
 * Clean up active pouring stream & particle systems
 */
function cleanupPouringStream() {
  if (Lab3DState.pouringStreamGroup) {
    if (Lab3DState.pouringStreamGroup.parent) {
      Lab3DState.pouringStreamGroup.parent.remove(Lab3DState.pouringStreamGroup);
    }
    Lab3DState.pouringStreamGroup = null;
  }
  if (Lab3DState.currentModelGroup) {
    const bulb = Lab3DState.currentModelGroup.getObjectByName('pipetteFillerBulb');
    if (bulb && bulb.userData && bulb.userData.originalY !== undefined) {
      bulb.position.y = bulb.userData.originalY;
    }
    const stopper = Lab3DState.currentModelGroup.getObjectByName('flaskStopper');
    if (stopper && stopper.userData && stopper.userData.originalY !== undefined) {
      stopper.position.y = stopper.userData.originalY;
    }
  }
}

/**
 * Load or Switch Current 3D Apparatus Model
 */
function loadApparatusModel(apparatusId) {
  Lab3DState.currentApparatusId = apparatusId;
  const scene = Lab3DState.scene;
  if (!scene) return;

  // Cancel any running liquid animations & clean up streams
  Lab3DState.isPouring = false;
  Lab3DState.isDraining = false;
  cleanupPouringStream();

  // Remove Previous Model
  if (Lab3DState.currentModelGroup) {
    scene.remove(Lab3DState.currentModelGroup);
    Lab3DState.currentModelGroup = null;
    Lab3DState.liquidMesh = null;
  }

  // Create New Model Group
  const group = new THREE.Group();
  group.name = `apparatus_${apparatusId}`;

  // Procedural Construction for All 16 Apparatuses
  switch (apparatusId) {
    case 'erlenmeyer':
      buildErlenmeyerModel(group);
      break;
    case 'beaker':
      buildBeakerModel(group);
      break;
    case 'cylinder':
      buildCylinderModel(group);
      break;
    case 'pipette':
      buildPipetteModel(group);
      break;
    case 'bunsen':
      buildBunsenModel(group);
      break;
    case 'testtube':
      buildTestTubeModel(group);
      break;
    case 'volumetric':
      buildVolumetricFlaskModel(group);
      break;
    case 'burette':
      buildBuretteModel(group);
      break;
    case 'corong':
      buildCorongModel(group);
      break;
    case 'cawan':
      buildCawanModel(group);
      break;
    case 'arloji':
      buildArlojiModel(group);
      break;
    case 'mortar':
      buildMortarModel(group);
      break;
    case 'spatula':
      buildSpatulaModel(group);
      break;
    case 'tripod':
      buildTripodModel(group);
      break;
    case 'termometer':
      buildTermometerModel(group);
      break;
    case 'pipetvolume':
      buildPipetVolumeModel(group);
      break;
    default:
      buildErlenmeyerModel(group);
  }

  scene.add(group);
  Lab3DState.currentModelGroup = group;

  // Auto-fit apparatus in viewport with generous padding so NOTHING is cut off!
  fitApparatusInView(group);

  // Update DOM UI Details & Liquid Simulation State
  updateApparatusInfoUI(apparatusId);
  syncLiquidControlsForApparatus(apparatusId);
}

/* ==========================================================================
   PROCEDURAL 3D APPARATUS BUILDERS (16 MODELS)
   ========================================================================== */

/** 1. Labu Erlenmeyer (Conical Flask) */
function buildErlenmeyerModel(group) {
  const glassMat = createPBRGlassMaterial();
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();
  const rimMat = createRimMaterial();

  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(3.0, 0),
    new THREE.Vector2(3.0, 0.3),
    new THREE.Vector2(1.0, 4.0),
    new THREE.Vector2(1.0, 5.5),
    new THREE.Vector2(1.2, 5.7),
    new THREE.Vector2(0.95, 5.7),
    new THREE.Vector2(0.85, 4.0),
    new THREE.Vector2(2.7, 0.3),
    new THREE.Vector2(0, 0.2)
  ];
  const latheGeo = new THREE.LatheGeometry(points, 48);
  const flaskMesh = new THREE.Mesh(latheGeo, glassMat);
  group.add(flaskMesh);

  // Solid Reinforced Lip Rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 16, 36), rimMat);
  rim.position.y = 5.7;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // White graduation scale rings (50, 100, 150, 200 mL)
  [
    { y: 1.0, r: 2.65 },
    { y: 1.8, r: 2.22 },
    { y: 2.6, r: 1.78 },
    { y: 3.4, r: 1.34 }
  ].forEach(mark => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(mark.r, 0.025, 8, 36), gradMat);
    ring.position.y = mark.y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  });

  // Solid Liquid Inside
  const liquidGeo = new THREE.CylinderGeometry(1.7, 2.65, 1.8, 36);
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  liquidMesh.position.y = 1.05;
  group.add(liquidMesh);
  setupLiquidMesh(liquidMesh, 'erlenmeyer');
}

/** 2. Gelas Kimia (Beaker Glass 250 mL) */
function buildBeakerModel(group) {
  const glassMat = createPBRGlassMaterial();
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();
  const rimMat = createRimMaterial();

  const beakerGeo = new THREE.CylinderGeometry(2.3, 2.3, 4.8, 48, 1, true);
  const beakerMesh = new THREE.Mesh(beakerGeo, glassMat);
  beakerMesh.position.y = 2.4;
  group.add(beakerMesh);

  const bottomGeo = new THREE.CylinderGeometry(2.3, 2.3, 0.25, 48);
  const bottomMesh = new THREE.Mesh(bottomGeo, glassMat);
  bottomMesh.position.y = 0.125;
  group.add(bottomMesh);

  const spoutGeo = new THREE.ConeGeometry(0.5, 0.7, 16);
  const spoutMesh = new THREE.Mesh(spoutGeo, glassMat);
  spoutMesh.position.set(2.3, 4.6, 0);
  spoutMesh.rotation.z = -Math.PI / 3;
  group.add(spoutMesh);

  // Solid Lip Rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.08, 16, 48), rimMat);
  rim.position.y = 4.8;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // Graduation Rings (50, 100, 150, 200, 250 mL)
  [1.2, 2.0, 2.8, 3.6, 4.2].forEach(yPos => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.31, 0.025, 8, 48), gradMat);
    ring.position.y = yPos;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  });

  // Solid Liquid Inside
  const liquidGeo = new THREE.CylinderGeometry(2.18, 2.18, 2.8, 36);
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  liquidMesh.position.y = 1.5;
  group.add(liquidMesh);
  setupLiquidMesh(liquidMesh, 'beaker');
}

/** 3. Gelas Ukur (Graduated Cylinder 100 mL) */
function buildCylinderModel(group) {
  const glassMat = createPBRGlassMaterial();
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();
  const rimMat = createRimMaterial();

  const baseGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.35, 6);
  const baseMat = createSteelMaterial(0x1e293b);
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = 0.18;
  group.add(baseMesh);

  const bodyGeo = new THREE.CylinderGeometry(1.0, 1.0, 7.2, 36, 1, true);
  const bodyMesh = new THREE.Mesh(bodyGeo, glassMat);
  bodyMesh.position.y = 3.9;
  group.add(bodyMesh);

  // Top Rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.04, 0.06, 16, 36), rimMat);
  rim.position.y = 7.5;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // Fine Scale Graduation Rings along height
  for (let y = 1.0; y <= 7.0; y += 0.6) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.015, 0.02, 8, 32), gradMat);
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Solid Liquid
  const liquidGeo = new THREE.CylinderGeometry(0.92, 0.92, 4.6, 32);
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  liquidMesh.position.y = 2.65;
  group.add(liquidMesh);
  setupLiquidMesh(liquidMesh, 'cylinder');
}

/** 4. Pipet Tetes (Dropper Pipette) */
function buildPipetteModel(group) {
  const glassMat = createPBRGlassMaterial();
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();

  const tubeGeo = new THREE.CylinderGeometry(0.35, 0.35, 4.8, 24);
  const tubeMesh = new THREE.Mesh(tubeGeo, glassMat);
  tubeMesh.position.y = 3.4;
  group.add(tubeMesh);

  // Measurement marks on stem
  [2.2, 3.2, 4.2].forEach(yPos => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.015, 8, 24), gradMat);
    ring.position.y = yPos;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  });

  const tipGeo = new THREE.ConeGeometry(0.35, 1.4, 24, 1, true);
  const tipMesh = new THREE.Mesh(tipGeo, glassMat);
  tipMesh.rotation.x = Math.PI;
  tipMesh.position.y = 0.7;
  group.add(tipMesh);

  // Solid Crimson Rubber Bulb
  const bulbGeo = new THREE.SphereGeometry(0.85, 24, 24);
  bulbGeo.scale(1, 1.4, 1);
  const bulbMesh = new THREE.Mesh(bulbGeo, rubberMat);
  bulbMesh.position.y = 6.4;
  group.add(bulbMesh);

  // Collar ring
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 16, 24), new THREE.MeshStandardMaterial({ color: 0x991b1b }));
  collar.position.y = 5.8;
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  // Solid Liquid Inside
  const fluidGeo = new THREE.CylinderGeometry(0.26, 0.26, 2.2, 16);
  const fluidMesh = new THREE.Mesh(fluidGeo, liquidMat);
  fluidMesh.position.y = 2.2;
  group.add(fluidMesh);
  setupLiquidMesh(fluidMesh, 'pipette');
}

/** 5. Pembakar Bunsen (Bunsen Burner) */
function buildBunsenModel(group) {
  const brassMat = createSteelMaterial(0xd97706);
  const ironMat = createSteelMaterial(0x1e293b);

  const baseGeo = new THREE.CylinderGeometry(2.3, 2.5, 0.6, 32);
  const baseMesh = new THREE.Mesh(baseGeo, ironMat);
  baseMesh.position.y = 0.3;
  group.add(baseMesh);

  const barrelGeo = new THREE.CylinderGeometry(0.65, 0.65, 4.2, 32);
  const barrelMesh = new THREE.Mesh(barrelGeo, brassMat);
  barrelMesh.position.y = 2.7;
  group.add(barrelMesh);

  const collarGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.75, 24);
  const collarMesh = new THREE.Mesh(collarGeo, ironMat);
  collarMesh.position.y = 1.2;
  group.add(collarMesh);

  // Gas inlet nozzle pipe
  const inletGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.4, 16);
  const inletMesh = new THREE.Mesh(inletGeo, brassMat);
  inletMesh.position.set(1.4, 0.6, 0);
  inletMesh.rotation.z = Math.PI / 2;
  group.add(inletMesh);

  // Animated 3D Flame
  const flameGroup = new THREE.Group();
  flameGroup.name = 'bunsenFlameMesh';
  flameGroup.position.y = 4.8;

  const innerFlameGeo = new THREE.ConeGeometry(0.42, 1.8, 24);
  const innerFlame = new THREE.Mesh(innerFlameGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  innerFlame.position.y = 0.9;
  flameGroup.add(innerFlame);

  const outerFlameGeo = new THREE.ConeGeometry(0.68, 3.0, 24);
  const outerFlame = new THREE.Mesh(outerFlameGeo, new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.85 }));
  outerFlame.position.y = 1.5;
  flameGroup.add(outerFlame);

  group.add(flameGroup);
}

/** 6. Tabung Reaksi & Rak (Test Tube & Rack) */
function buildTestTubeModel(group) {
  const glassMat = createPBRGlassMaterial();
  const rackMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.55 });
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const liquidMat2 = createPBRLiquidMaterial(0xdb2777);
  const rimMat = createRimMaterial();

  const rackBase = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.38, 2.4), rackMat);
  rackBase.position.y = 0.2;
  group.add(rackBase);

  const rackTop = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.38, 2.4), rackMat);
  rackTop.position.y = 3.2;
  group.add(rackTop);

  [-3.2, 3.2].forEach(x => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.2, 16), rackMat);
    post.position.set(x, 1.7, 0);
    group.add(post);
  });

  [-2.2, 0, 2.2].forEach((xPos, idx) => {
    const tubeGroup = new THREE.Group();
    tubeGroup.position.set(xPos, 0.5, 0);

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 4.3, 24, 1, true), glassMat);
    tube.position.y = 2.3;
    tubeGroup.add(tube);

    const hemi = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
    hemi.position.y = 0.15;
    tubeGroup.add(hemi);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 16, 24), rimMat);
    rim.position.y = 4.45;
    rim.rotation.x = Math.PI / 2;
    tubeGroup.add(rim);

    if (idx === 0) {
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.8, 20), liquidMat2);
      liq.position.y = 1.05;
      tubeGroup.add(liq);
    } else if (idx === 1) {
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 2.6, 20), liquidMat);
      liq.position.y = 1.45;
      tubeGroup.add(liq);
      setupLiquidMesh(liq, 'testtube');
    }
    group.add(tubeGroup);
  });
}

/** 7. Labu Ukur (Volumetric Flask 100 mL) */
function buildVolumetricFlaskModel(group) {
  const glassMat = createPBRGlassMaterial();
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const rimMat = createRimMaterial();

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(2.2, 36, 36), glassMat);
  bulb.scale.set(1, 0.9, 1);
  bulb.position.y = 2.0;
  group.add(bulb);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 4.0, 32), glassMat);
  neck.position.y = 5.2;
  group.add(neck);

  // Garis Tera (Gold Calibration Mark)
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 16, 32), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
  mark.position.y = 5.6;
  mark.rotation.x = Math.PI / 2;
  group.add(mark);

  // Neck Lip
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 16, 24), rimMat);
  rim.position.y = 7.2;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // Ground Glass Stopper
  const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  stopper.position.y = 7.6;
  stopper.name = 'flaskStopper';
  group.add(stopper);

  // Solid Liquid Inside
  const liq = new THREE.Mesh(new THREE.SphereGeometry(2.05, 32, 32), liquidMat);
  liq.scale.set(1, 0.85, 1);
  liq.position.y = 1.9;
  group.add(liq);
  setupLiquidMesh(liq, 'volumetric');
}

/** 8. Buret & Statif (Burette 50 mL on Retort Stand) */
function buildBuretteModel(group) {
  const glassMat = createPBRGlassMaterial();
  const ironMat = createSteelMaterial(0x1e293b);
  const rodMat = createSteelMaterial(0x94a3b8);
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();

  // Stand Base & Rod
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 3.0), ironMat);
  base.position.set(-1.0, 0.22, 0);
  group.add(base);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8.4, 16), rodMat);
  rod.position.set(-2.2, 4.4, 0);
  group.add(rod);

  // Clamps
  [3.2, 6.2].forEach(yPos => {
    const clampArm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.25), ironMat);
    clampArm.position.set(-1.4, yPos, 0);
    group.add(clampArm);
  });

  // Burette Tube
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7.2, 24), glassMat);
  tube.position.set(-0.6, 4.3, 0);
  group.add(tube);

  // Fine Scale Graduation Rings along Burette
  for (let y = 1.8; y <= 7.5; y += 0.45) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.015, 8, 20), gradMat);
    ring.position.set(-0.6, y, 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Teflon Stopcock Valve
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.75, 16), createSteelMaterial(0x0284c7));
  valve.rotation.z = Math.PI / 2;
  valve.position.set(-0.6, 1.1, 0);
  group.add(valve);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), createSteelMaterial(0x0f172a));
  handle.position.set(-0.6, 1.1, 0.45);
  group.add(handle);

  // Solid Liquid Column
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.0, 20), liquidMat);
  liq.position.set(-0.6, 4.0, 0);
  group.add(liq);
  setupLiquidMesh(liq, 'burette');
}

/** 9. Corong Kaca & Kertas Saring (Filter Funnel) */
function buildCorongModel(group) {
  const glassMat = createPBRGlassMaterial();
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  const rimMat = createRimMaterial();

  const coneGeo = new THREE.ConeGeometry(2.4, 2.8, 36, 1, true);
  const cone = new THREE.Mesh(coneGeo, glassMat);
  cone.position.y = 3.6;
  group.add(cone);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.08, 16, 36), rimMat);
  rim.position.y = 5.0;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const stemGeo = new THREE.CylinderGeometry(0.28, 0.28, 3.8, 24);
  const stem = new THREE.Mesh(stemGeo, glassMat);
  stem.position.y = 0.5;
  group.add(stem);

  const filterGeo = new THREE.ConeGeometry(2.15, 2.3, 24, 1, true);
  const filterMesh = new THREE.Mesh(filterGeo, paperMat);
  filterMesh.position.y = 3.8;
  group.add(filterMesh);

  // Liquid Cone inside paper filter
  const funnelLiq = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.8, 24, 1, false), createPBRLiquidMaterial(Lab3DState.currentLiquidColor));
  funnelLiq.rotation.x = Math.PI;
  funnelLiq.position.y = 3.6;
  group.add(funnelLiq);
  setupLiquidMesh(funnelLiq, 'corong');
}

/** 10. Cawan Penguap Porselen (Evaporating Dish) */
function buildCawanModel(group) {
  const porcelainMat = createPorcelainMaterial();
  const crystalMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);

  const points = [];
  for (let a = 0; a <= Math.PI / 2; a += 0.1) {
    points.push(new THREE.Vector2(Math.sin(a) * 2.8, (1 - Math.cos(a)) * 1.5));
  }
  const dishGeo = new THREE.LatheGeometry(points, 48);
  const dish = new THREE.Mesh(dishGeo, porcelainMat);
  dish.position.y = 0.1;
  group.add(dish);

  const spoutGeo = new THREE.ConeGeometry(0.4, 0.6, 16);
  const spout = new THREE.Mesh(spoutGeo, porcelainMat);
  spout.position.set(2.8, 1.5, 0);
  spout.rotation.z = -Math.PI / 3;
  group.add(spout);

  const liq = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.2, 0.4, 32), crystalMat);
  liq.position.y = 0.6;
  group.add(liq);
  setupLiquidMesh(liq, 'cawan');
}

/** 11. Kaca Arloji (Watch Glass) */
function buildArlojiModel(group) {
  const glassMat = createPBRGlassMaterial();
  const rimMat = createRimMaterial();

  const points = [];
  for (let a = 0; a <= 0.65; a += 0.05) {
    points.push(new THREE.Vector2(Math.sin(a) * 3.5, (1 - Math.cos(a)) * 0.8));
  }
  const glassGeo = new THREE.LatheGeometry(points, 48);
  const watchGlass = new THREE.Mesh(glassGeo, glassMat);
  watchGlass.position.y = 0.2;
  group.add(watchGlass);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.06, 16, 48), rimMat);
  rim.position.y = 0.72;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const crystalGroup = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const cryGeo = new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12);
    const cry = new THREE.Mesh(cryGeo, createPBRLiquidMaterial(Lab3DState.currentLiquidColor));
    cry.position.set((Math.random() - 0.5) * 1.8, 0.35 + Math.random() * 0.15, (Math.random() - 0.5) * 1.8);
    crystalGroup.add(cry);
  }
  group.add(crystalGroup);

  const watchLiq = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.16, 32), createPBRLiquidMaterial(Lab3DState.currentLiquidColor));
  watchLiq.position.y = 0.35;
  group.add(watchLiq);
  setupLiquidMesh(watchLiq, 'arloji');
}

/** 12. Mortal dan Alu Porselen (Mortar & Pestle) */
function buildMortarModel(group) {
  const porcelainMat = createPorcelainMaterial();

  const points = [];
  points.push(new THREE.Vector2(1.2, 0));
  points.push(new THREE.Vector2(2.6, 0));
  points.push(new THREE.Vector2(2.8, 2.2));
  points.push(new THREE.Vector2(2.5, 2.2));
  points.push(new THREE.Vector2(2.0, 0.5));
  points.push(new THREE.Vector2(0, 0.5));

  const mortarGeo = new THREE.LatheGeometry(points, 48);
  const mortar = new THREE.Mesh(mortarGeo, porcelainMat);
  group.add(mortar);

  const pestleGroup = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 3.8, 24), porcelainMat);
  stem.position.y = 1.9;
  pestleGroup.add(stem);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 24), porcelainMat);
  head.position.y = 0.2;
  pestleGroup.add(head);

  pestleGroup.rotation.z = Math.PI / 5;
  pestleGroup.position.set(-0.6, 0.6, 0);
  group.add(pestleGroup);

  const mortarLiq = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.7, 0.45, 32), createPBRLiquidMaterial(Lab3DState.currentLiquidColor));
  mortarLiq.position.y = 0.55;
  group.add(mortarLiq);
  setupLiquidMesh(mortarLiq, 'mortar');
}

/** 13. Spatula Logam & Sendok Tanduk (Lab Spatula) */
function buildSpatulaModel(group) {
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.15,
    side: THREE.DoubleSide
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.35
  });

  const spatulaGroup = new THREE.Group();
  spatulaGroup.name = 'spatulaMeshGroup';

  // 1. Central Cylindrical Stainless Steel Shaft / Handle (Horizontal resting at y = 1.05)
  const shaftGeo = new THREE.CylinderGeometry(0.13, 0.13, 4.4, 24);
  const shaft = new THREE.Mesh(shaftGeo, steelMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0, 1.05, 0);
  spatulaGroup.add(shaft);

  // Knurled Anti-Slip Ribbed Grip Bands along Center Handle
  for (let x = -1.1; x <= 1.1; x += 0.22) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 8, 24), gripMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, 1.05, 0);
    spatulaGroup.add(ring);
  }

  // 2. LEFT END: Ujung Bilah Pipih (Flat Chisel Spatula Blade)
  // Transition neck: tapers and flattens out smoothly
  const bladeNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.5, 20), steelMat);
  bladeNeck.rotation.z = Math.PI / 2;
  bladeNeck.scale.set(1.0, 1.0, 0.35);
  bladeNeck.position.set(-2.45, 1.05, 0);
  spatulaGroup.add(bladeNeck);

  // Flat Blade with Rounded Chisel Tip and Beveled Edge
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.27);
  bladeShape.lineTo(-1.6, -0.27);
  bladeShape.quadraticCurveTo(-1.95, -0.27, -1.95, 0);
  bladeShape.quadraticCurveTo(-1.95, 0.27, -1.6, 0.27);
  bladeShape.lineTo(0, 0.27);
  bladeShape.closePath();

  const bladeExtrude = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016
  });
  const bladeMesh = new THREE.Mesh(bladeExtrude, steelMat);
  bladeMesh.rotation.x = Math.PI / 2;
  bladeMesh.position.set(-2.7, 1.05, 0.02);
  spatulaGroup.add(bladeMesh);

  // 3. RIGHT END: Ujung Sendok Cekung (Concave Spoon Scoop)
  // Curved neck sloping gently upward
  const spoonNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.5, 20), steelMat);
  spoonNeck.rotation.z = -Math.PI / 2;
  spoonNeck.position.set(2.45, 1.08, 0);
  spatulaGroup.add(spoonNeck);

  // Authentic Hollow Concave Oval Spoon Bowl (Open concave cavity facing +Y)
  const spoonGeo = new THREE.SphereGeometry(1.0, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const spoonBowl = new THREE.Mesh(spoonGeo, steelMat);
  spoonBowl.scale.set(0.95, 0.38, 0.48);
  spoonBowl.position.set(3.7, 1.15, 0);
  spatulaGroup.add(spoonBowl);

  // Stamped Reinforcement Lip Rim around Spoon Bowl Edge
  const spoonRim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 10, 36), steelMat);
  spoonRim.scale.set(1.82, 0.92, 1.0);
  spoonRim.rotation.x = Math.PI / 2;
  spoonRim.position.set(3.7, 1.15, 0);
  spatulaGroup.add(spoonRim);

  // 4. Sample Reagent Crystals Resting Inside the Concave Scoop
  const crystalGroup = new THREE.Group();
  crystalGroup.name = 'spatulaCrystals';
  for (let i = 0; i < 12; i++) {
    const cryGeo = new THREE.DodecahedronGeometry(0.065 + Math.random() * 0.045);
    const cryMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
    const cry = new THREE.Mesh(cryGeo, cryMat);
    cry.position.set(
      3.45 + (Math.random() - 0.5) * 0.5,
      1.06 + Math.random() * 0.12,
      (Math.random() - 0.5) * 0.28
    );
    cry.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    crystalGroup.add(cry);
  }
  spatulaGroup.add(crystalGroup);

  // 5. Sleek Porcelain Laboratory Spatula Rest Base with Twin Cradle Notches
  const porcelainMat = createPorcelainMaterial();
  const restBase = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.38, 2.2), porcelainMat);
  restBase.position.set(0, 0.19, 0);
  group.add(restBase);

  // Twin support pillars with cradle grooves at x = -1.6 and x = +1.6
  [-1.6, 1.6].forEach(xPos => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, 0.72, 20), porcelainMat);
    pillar.position.set(xPos, 0.65, 0);
    group.add(pillar);

    const saddle = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.06, 12, 24), porcelainMat);
    saddle.position.set(xPos, 1.04, 0);
    group.add(saddle);
  });

  // Subtle tilt for three-dimensional perspective depth
  spatulaGroup.rotation.y = 0.16;
  spatulaGroup.rotation.x = 0.06;
  group.add(spatulaGroup);
}

/** 14. Kaki Tiga & Kasa Kawat (Tripod & Wire Gauze) */
function buildTripodModel(group) {
  const ironMat = createSteelMaterial(0x1e293b);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.2, 16, 32), ironMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 4.2;
  group.add(ring);

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 16), ironMat);
    leg.position.set(Math.cos(angle) * 2.2, 2.1, Math.sin(angle) * 2.2);
    leg.rotation.z = (Math.cos(angle) * Math.PI) / 18;
    leg.rotation.x = (-Math.sin(angle) * Math.PI) / 18;
    group.add(leg);
  }

  const gauze = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 3.6), createSteelMaterial(0x64748b));
  gauze.position.y = 4.3;
  group.add(gauze);

  const ceramicCircle = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 32), createPorcelainMaterial());
  ceramicCircle.position.y = 4.35;
  group.add(ceramicCircle);
}

/** 15. Termometer Laboratorium (Lab Thermometer) */
function buildTermometerModel(group) {
  const glassMat = createPBRGlassMaterial();
  const redFluidMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.2 });
  const gradMat = createGraduationMaterial();

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 7.8, 24), glassMat);
  tube.position.y = 4.2;
  group.add(tube);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 24), redFluidMat);
  bulb.position.y = 0.5;
  group.add(bulb);

  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 16), redFluidMat);
  col.position.y = 2.75;
  group.add(col);

  for (let y = 1.2; y <= 7.2; y += 0.5) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.015, 8, 20), gradMat);
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 16, 24), glassMat);
  ring.position.y = 8.2;
  group.add(ring);
}

/** 16. Pipet Gondok / Volumetrik (Volumetric Pipette 25 mL) */
function buildPipetVolumeModel(group) {
  const glassMat = createPBRGlassMaterial({ color: 0x0284c7, opacity: 0.88 });
  const liquidMat = createPBRLiquidMaterial(Lab3DState.currentLiquidColor);
  const gradMat = createGraduationMaterial();

  // 1. High-Precision Double-Walled Borosilicate Glass Body via LatheGeometry
  const glassPoints = [];
  const stepsFlare = 10;
  const stepsBulb = 14;

  // Outer profile from capillary delivery tip to top fire-polished mouth
  glassPoints.push(new THREE.Vector2(0.14, 0.2));  // Tip delivery orifice outer
  glassPoints.push(new THREE.Vector2(0.20, 0.6));
  glassPoints.push(new THREE.Vector2(0.26, 1.0));  // Lower slender stem
  glassPoints.push(new THREE.Vector2(0.26, 4.2));

  // Lower flare expanding smoothly into the volumetric bulb
  for (let i = 1; i <= stepsFlare; i++) {
    const t = i / stepsFlare;
    const y = 4.2 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 0.26 + (1.28 - 0.26) * s;
    glassPoints.push(new THREE.Vector2(r, y));
  }

  // Central bulb body (gondok) with gentle spherical barrel convexity
  for (let i = 1; i <= stepsBulb; i++) {
    const t = i / stepsBulb;
    const y = 5.2 + t * 2.2;
    const r = 1.28 + 0.07 * Math.sin(t * Math.PI);
    glassPoints.push(new THREE.Vector2(r, y));
  }

  // Upper contraction neck tapering back to upper capillary stem
  for (let i = 1; i <= stepsFlare; i++) {
    const t = i / stepsFlare;
    const y = 7.4 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 1.28 - (1.28 - 0.26) * s;
    glassPoints.push(new THREE.Vector2(r, y));
  }

  // Upper stem extending to top mouth
  glassPoints.push(new THREE.Vector2(0.26, 11.1));
  glassPoints.push(new THREE.Vector2(0.32, 11.2));  // Top fire-polished rim lip outer
  glassPoints.push(new THREE.Vector2(0.20, 11.2));  // Top rim lip inner

  // Inner profile returning down to orifice (forming realistic double-walled glass)
  glassPoints.push(new THREE.Vector2(0.18, 11.1));
  glassPoints.push(new THREE.Vector2(0.18, 8.4));

  for (let i = stepsFlare; i >= 1; i--) {
    const t = i / stepsFlare;
    const y = 7.4 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 1.20 - (1.20 - 0.18) * s;
    glassPoints.push(new THREE.Vector2(r, y));
  }

  for (let i = stepsBulb; i >= 1; i--) {
    const t = i / stepsBulb;
    const y = 5.2 + t * 2.2;
    const r = 1.20 + 0.07 * Math.sin(t * Math.PI);
    glassPoints.push(new THREE.Vector2(r, y));
  }

  for (let i = stepsFlare; i >= 1; i--) {
    const t = i / stepsFlare;
    const y = 4.2 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 0.18 + (1.20 - 0.18) * s;
    glassPoints.push(new THREE.Vector2(r, y));
  }

  glassPoints.push(new THREE.Vector2(0.18, 1.0));
  glassPoints.push(new THREE.Vector2(0.12, 0.6));
  glassPoints.push(new THREE.Vector2(0.07, 0.2));  // Tip orifice inner

  const glassGeo = new THREE.LatheGeometry(glassPoints, 48);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  group.add(glassMesh);

  // 2. Continuous Solid Inner Liquid Column (Fills from tip up to golden Garis Tera at y = 9.4)
  const liqPoints = [];
  liqPoints.push(new THREE.Vector2(0, 0.2)); // Tip center
  liqPoints.push(new THREE.Vector2(0.065, 0.2));
  liqPoints.push(new THREE.Vector2(0.115, 0.6));
  liqPoints.push(new THREE.Vector2(0.175, 1.0));
  liqPoints.push(new THREE.Vector2(0.175, 4.2));

  for (let i = 1; i <= stepsFlare; i++) {
    const t = i / stepsFlare;
    const y = 4.2 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 0.175 + (1.19 - 0.175) * s;
    liqPoints.push(new THREE.Vector2(r, y));
  }

  for (let i = 1; i <= stepsBulb; i++) {
    const t = i / stepsBulb;
    const y = 5.2 + t * 2.2;
    const r = 1.19 + 0.07 * Math.sin(t * Math.PI);
    liqPoints.push(new THREE.Vector2(r, y));
  }

  for (let i = 1; i <= stepsFlare; i++) {
    const t = i / stepsFlare;
    const y = 7.4 + t * 1.0;
    const s = t * t * (3 - 2 * t);
    const r = 1.19 - (1.19 - 0.175) * s;
    liqPoints.push(new THREE.Vector2(r, y));
  }

  // Upper stem cavity up to Garis Tera line
  liqPoints.push(new THREE.Vector2(0.175, 9.4));
  liqPoints.push(new THREE.Vector2(0, 9.4)); // Meniscus top cap

  const liqGeo = new THREE.LatheGeometry(liqPoints, 36);
  const liqMesh = new THREE.Mesh(liqGeo, liquidMat);
  group.add(liqMesh);
  setupLiquidMesh(liqMesh, 'pipetvolume');

  // 3. Markings & Standard Metrological Calibrations
  // Golden Amber Garis Tera (Exact 25.00 mL Calibration Line)
  const goldMarkMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.92,
    roughness: 0.18
  });
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.02, 16, 36), goldMarkMat);
  mark.rotation.x = Math.PI / 2;
  mark.position.y = 9.4;
  group.add(mark);

  // ISO 648 Standard Color-Code Blue Band (25 mL)
  const isoBandMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, side: THREE.DoubleSide });
  const isoBand = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.038, 16, 36), isoBandMat);
  isoBand.rotation.x = Math.PI / 2;
  isoBand.position.y = 10.3;
  group.add(isoBand);

  // Specification Graduation Rings
  [8.9, 9.8].forEach(yPos => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.012, 8, 36), gradMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = yPos;
    group.add(ring);
  });

  // Etched Technical Specification Badge Collar on the Central Bulb
  const specRing = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.018, 8, 48), gradMat);
  specRing.rotation.x = Math.PI / 2;
  specRing.position.y = 6.3;
  group.add(specRing);

  // 4. Authentic 3-Valve Red Rubber Pipette Filler (Bola Hisap Karet 3-Katup / Propipet)
  const fillerGroup = new THREE.Group();
  fillerGroup.name = 'pipetteFillerBulb';

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626, // Laboratory vulcanized crimson red rubber
    roughness: 0.70,
    metalness: 0.04
  });
  const valveMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b, // Darker valve body
    roughness: 0.65,
    metalness: 0.06
  });
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
  });

  // Adapter collar fitting securely over glass top mouth
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 24), rubberMat);
  collar.position.y = 11.45;
  fillerGroup.add(collar);

  // Lower valve housing & Valve S (Suction / Hisap Cairan)
  const valveS = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 20), valveMat);
  valveS.position.y = 11.9;
  fillerGroup.add(valveS);

  const btnS = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), badgeMat);
  btnS.rotation.x = Math.PI / 2;
  btnS.position.set(0, 11.9, 0.28);
  fillerGroup.add(btnS);

  // Side branch & Valve E (Empty / Buang/Keluarkan Cairan)
  const armE = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.55, 16), valveMat);
  armE.rotation.z = -Math.PI / 2.3;
  armE.position.set(0.38, 11.85, 0);
  fillerGroup.add(armE);

  const btnE = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), badgeMat);
  btnE.rotation.z = -Math.PI / 2;
  btnE.position.set(0.66, 11.85, 0);
  fillerGroup.add(btnE);

  // Main elastic rubber suction bulb
  const mainBulb = new THREE.Mesh(new THREE.SphereGeometry(0.88, 28, 28), rubberMat);
  mainBulb.scale.set(1.0, 1.24, 1.0);
  mainBulb.position.y = 12.85;
  fillerGroup.add(mainBulb);

  // Top neck & Valve A (Aspirate / Buang Udara)
  const valveA = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 20), valveMat);
  valveA.position.y = 14.1;
  fillerGroup.add(valveA);

  const btnA = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), badgeMat);
  btnA.rotation.x = Math.PI / 2;
  btnA.position.set(0, 14.1, 0.24);
  fillerGroup.add(btnA);

  group.add(fillerGroup);
}

/* ==========================================================================
   DOM CATALOG POPULATION & INTERACTIVE CONTROLS
   ========================================================================== */

/**
 * Populate Apparatus Catalog in Side Column DOM (Shows 16 Tools)
 */
function populateApparatusCatalog() {
  const container = document.getElementById('apparatus-catalog-list');
  const countBadge = document.getElementById('apparatus-count');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${ApparatusCatalog.length} Alat 3D`;
  container.innerHTML = '';

  const catalogTheme = {
    erlenmeyer: { bg: '#2563eb', color: '#ffffff' },
    beaker: { bg: '#0284c7', color: '#ffffff' },
    cylinder: { bg: '#0891b2', color: '#ffffff' },
    pipette: { bg: '#e11d48', color: '#ffffff' },
    bunsen: { bg: '#d97706', color: '#ffffff' },
    testtube: { bg: '#4f46e5', color: '#ffffff' },
    volumetric: { bg: '#7c3aed', color: '#ffffff' },
    burette: { bg: '#2563eb', color: '#ffffff' },
    corong: { bg: '#059669', color: '#ffffff' },
    cawan: { bg: '#ea580c', color: '#ffffff' },
    arloji: { bg: '#0284c7', color: '#ffffff' },
    mortar: { bg: '#475569', color: '#ffffff' },
    spatula: { bg: '#64748b', color: '#ffffff' },
    tripod: { bg: '#334155', color: '#ffffff' },
    termometer: { bg: '#dc2626', color: '#ffffff' },
    pipetvolume: { bg: '#0284c7', color: '#ffffff' }
  };

  ApparatusCatalog.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.className = `apparatus-item-btn ${idx === 0 ? 'active' : ''}`;
    btn.id = `cat-btn-${item.id}`;
    btn.onclick = () => selectApparatus(item.id);

    const theme = catalogTheme[item.id] || { bg: '#0284c7', color: '#ffffff' };

    btn.innerHTML = `
      <div class="cat-icon-badge" style="background: ${theme.bg}; color: ${theme.color};">
        <i class="fa-solid ${item.icon}"></i>
      </div>
      <div class="cat-text-wrap">
        <span class="cat-name">${item.name}</span>
        <span class="cat-category">${item.category}</span>
      </div>
    `;
    container.appendChild(btn);
  });
}

/**
 * Select Apparatus from Catalog List
 */
function selectApparatus(apparatusId) {
  document.querySelectorAll('.apparatus-item-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`cat-btn-${apparatusId}`);
  if (targetBtn) targetBtn.classList.add('active');

  loadApparatusModel(apparatusId);
}

/**
 * Update UI Labels and Pedagogical Details
 */
function updateApparatusInfoUI(apparatusId) {
  const data = ApparatusCatalog.find(item => item.id === apparatusId);
  if (!data) return;

  const titleElem = document.getElementById('apparatus-display-title');
  const catElem = document.getElementById('apparatus-display-category');
  const funcElem = document.getElementById('detail-function');
  const matElem = document.getElementById('detail-material');
  const mistElem = document.getElementById('detail-mistake');
  const sopElem = document.getElementById('detail-sop');

  if (titleElem) titleElem.textContent = data.name;
  if (catElem) catElem.textContent = data.category;
  if (funcElem) funcElem.textContent = data.function;
  if (matElem) matElem.textContent = data.material;
  if (mistElem) mistElem.textContent = data.mistakes;
  if (sopElem) sopElem.textContent = data.sop;

  const calloutBox = document.getElementById('anatomy-callout');
  const callTitle = document.getElementById('callout-title');
  const callDesc = document.getElementById('callout-desc');
  if (calloutBox && callTitle && callDesc && data.anatomy && data.anatomy.length > 0) {
    callTitle.textContent = data.anatomy[0].name;
    callDesc.textContent = data.anatomy[0].desc;
  }
}

/**
 * Change Liquid Chemical Color in 3D Apparatus with Realistic Pouring Simulation
 */
function changeLiquidColor(colorHex, nameDesc) {
  let finalColor = 0x2563eb;
  if (typeof colorHex === 'string' && colorHex.startsWith('#')) {
    finalColor = parseInt(colorHex.replace('#', '0x'), 16);
  } else if (!isNaN(parseInt(colorHex))) {
    finalColor = parseInt(colorHex);
  }

  Lab3DState.currentLiquidColor = finalColor;
  Lab3DState.currentLiquidHex = colorHex;
  Lab3DState.currentLiquidName = nameDesc;

  // Update active state on selector bubbles
  updateActiveBubbleUI(colorHex);

  // Update liquid name text & color dot indicator
  const nameText = document.getElementById('liquid-name-text');
  const dotElem = document.getElementById('liquid-dot');
  if (dotElem) dotElem.style.backgroundColor = colorHex;

  // Handle Spatula specifically for solid chemical reagent crystal sampling
  if (Lab3DState.currentApparatusId === 'spatula') {
    if (nameText) nameText.textContent = `Sampel Kristal: ${nameDesc}`;

    if (Lab3DState.currentModelGroup) {
      const crystals = Lab3DState.currentModelGroup.getObjectByName('spatulaCrystals');
      if (crystals) {
        crystals.children.forEach(c => {
          if (c.material) {
            c.material.color.setHex(finalColor);
            c.material.needsUpdate = true;
          }
        });
      }
    }

    const progressBar = document.getElementById('liquid-progress-bar');
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.style.backgroundColor = colorHex;
    }
    const badge = document.getElementById('liquid-status-badge');
    if (badge) {
      badge.className = 'liquid-status-badge badge-full';
      badge.innerHTML = `<i class="fa-solid fa-gem"></i> Kristal Reagen Siap`;
    }

    LabSFX.playCrystal();
    showCanvasPouringToast(`✨ Mengambil kristal sampel ${nameDesc} dengan spatula!`, false);
    if (typeof showAppNotification === 'function') {
      showAppNotification(`Kristal reagen diambil: ${nameDesc}`);
    }
    clearTimeout(Lab3DState.toastTimeoutId);
    Lab3DState.toastTimeoutId = setTimeout(() => {
      hideCanvasPouringToast();
    }, 2500);
    return;
  }

  if (nameText) nameText.textContent = nameDesc;

  // Check if current apparatus can hold liquids
  if (!Lab3DState.liquidMesh) {
    const appObj = ApparatusCatalog.find(item => item.id === Lab3DState.currentApparatusId);
    const toolName = appObj ? appObj.name.split(' (')[0] : 'Alat';
    if (typeof showAppNotification === 'function') {
      showAppNotification(`⚠️ ${toolName} bukan wadah penampung larutan. Pilih Buret, Erlenmeyer, atau Gelas Kimia untuk simulasi cairan!`);
    }
    showCanvasPouringToast(`⚠️ ${toolName} bukan wadah cairan`, false);
    return;
  }

  // Start realistic fluid injection & pouring simulation
  startLiquidPouringSimulation(finalColor, colorHex, nameDesc);
}

/**
 * Initialize 3D Stream Injection, Droplets, Aeration Bubbles & Surface Ripples
 */
function startLiquidPouringSimulation(finalColor, colorHex, nameDesc) {
  const mesh = Lab3DState.liquidMesh;
  if (!mesh || !mesh.userData || !mesh.userData.liquidInfo) return;

  // Clean previous pouring stream
  cleanupPouringStream();

  Lab3DState.isPouring = true;
  Lab3DState.isDraining = false;
  Lab3DState.pouringStartTime = performance.now();
  Lab3DState.pouringDuration = 1.85;

  // Update liquid material color
  mesh.material.color.setHex(finalColor);
  mesh.material.opacity = 1.0;
  mesh.material.transparent = false;
  mesh.material.roughness = 0.18;
  mesh.material.needsUpdate = true;

  // Start from bottom so liquid level rises up
  setLiquidFillLevel(mesh, 0.001);

  // If volumetric flask has a stopper or pipet has a filler bulb, lift it up during pouring
  if (Lab3DState.currentModelGroup) {
    const stopper = Lab3DState.currentModelGroup.getObjectByName('flaskStopper');
    if (stopper) {
      if (stopper.userData.originalY === undefined) stopper.userData.originalY = stopper.position.y;
      stopper.position.y = 8.6;
    }
    const bulb = Lab3DState.currentModelGroup.getObjectByName('pipetteFillerBulb');
    if (bulb) {
      if (bulb.userData.originalY === undefined) bulb.userData.originalY = bulb.position.y;
      bulb.position.y = bulb.userData.originalY + 1.8;
    }
  }

  // Determine mouth coordinates for stream injection
  const appData = APPARATUS_MOUTH_DATA[Lab3DState.currentApparatusId] || {
    x: 0,
    y: mesh.position.y + 3.0,
    z: 0,
    streamStart: mesh.position.y + 5.5,
    streamWidth: 0.15
  };

  // Create Pouring Stream Group
  const streamGroup = new THREE.Group();
  streamGroup.name = 'pouringStreamGroup';

  // 1. Translucent liquid stream column
  const streamMat = new THREE.MeshStandardMaterial({
    color: finalColor,
    roughness: 0.1,
    metalness: 0.08,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
  });

  const streamGeo = new THREE.CylinderGeometry(appData.streamWidth * 0.7, appData.streamWidth, 1.0, 16);
  const streamMesh = new THREE.Mesh(streamGeo, streamMat);
  streamGroup.add(streamMesh);

  // 2. Top nozzle / source glowing drop
  const nozzleGeo = new THREE.SphereGeometry(appData.streamWidth * 1.3, 16, 16);
  const nozzleMesh = new THREE.Mesh(nozzleGeo, streamMat);
  nozzleMesh.position.set(appData.x, appData.streamStart, appData.z);
  streamGroup.add(nozzleMesh);

  // 3. Falling droplets along stream
  const droplets = [];
  const dropGeo = new THREE.SphereGeometry(appData.streamWidth * 0.45, 10, 10);
  for (let i = 0; i < 7; i++) {
    const drop = new THREE.Mesh(dropGeo, streamMat);
    drop.userData = {
      speed: 1.1 + Math.random() * 0.7,
      wobbleAngle: Math.random() * Math.PI * 2
    };
    streamGroup.add(drop);
    droplets.push(drop);
  }

  // 4. Surface splash rings
  const splashRings = [];
  for (let i = 0; i < 2; i++) {
    const ringGeo = new THREE.TorusGeometry(appData.streamWidth * 1.5, appData.streamWidth * 0.22, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: finalColor,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    streamGroup.add(ringMesh);
    splashRings.push(ringMesh);
  }

  // 5. Internal rising aeration bubbles
  const bubbles = [];
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    roughness: 0.1
  });
  const bubbleGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const maxRadius = 0.45;
  for (let i = 0; i < 14; i++) {
    const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    bubble.userData = {
      relY: Math.random(),
      relX: (Math.random() - 0.5) * maxRadius,
      relZ: (Math.random() - 0.5) * maxRadius,
      speed: 0.7 + Math.random() * 0.8,
      driftSpeed: 3.0 + Math.random() * 4.0
    };
    streamGroup.add(bubble);
    bubbles.push(bubble);
  }

  streamGroup.userData = {
    mouth: appData,
    streamMesh: streamMesh,
    nozzleMesh: nozzleMesh,
    droplets: droplets,
    splashRings: splashRings,
    bubbles: bubbles
  };

  // Add stream group to liquidMesh's parent so coordinate space aligns precisely
  const targetParent = mesh.parent || Lab3DState.currentModelGroup;
  if (targetParent) {
    targetParent.add(streamGroup);
  }
  Lab3DState.pouringStreamGroup = streamGroup;

  // Play synthesized fluid pouring audio
  LabSFX.playPour(1.85);

  // Update UI Elements
  updateLiquidUIProgress(0.0, false);
  const appObj = ApparatusCatalog.find(a => a.id === Lab3DState.currentApparatusId);
  const appName = appObj ? appObj.name.split(' (')[0] : 'Alat Lab';
  showCanvasPouringToast(`💧 Menuangkan ${nameDesc} ke dalam ${appName}...`, true);
}

/**
 * Update Active Frame of Pouring Simulation
 */
function updatePouringFrame() {
  const mesh = Lab3DState.liquidMesh;
  if (!mesh || !mesh.userData || !mesh.userData.liquidInfo) {
    cleanupPouringStream();
    Lab3DState.isPouring = false;
    return;
  }

  const now = performance.now();
  const elapsed = (now - Lab3DState.pouringStartTime) / 1000;
  const duration = Lab3DState.pouringDuration || 1.85;
  const rawP = Math.min(1.0, elapsed / duration);

  // Physics-inspired decelerating fluid fill easing curve
  const p = 1 - Math.pow(1 - rawP, 2.4);

  // Update liquid level
  setLiquidFillLevel(mesh, p);

  // Slosh oscillation during fill
  const info = mesh.userData.liquidInfo;
  const slosh = Math.sin(elapsed * 18) * 0.02 * (1 - rawP);
  mesh.scale.x = info.initialScaleX * (1 + slosh);
  mesh.scale.z = info.initialScaleZ * (1 - slosh);

  // Current liquid top surface Y in mesh's parent coords
  const currentSurfaceY = info.bottomY + (info.topY - info.bottomY) * p;

  // Update Pouring Stream Object
  const pGroup = Lab3DState.pouringStreamGroup;
  if (pGroup && pGroup.userData) {
    const mouth = pGroup.userData.mouth;
    const streamMesh = pGroup.userData.streamMesh;
    const droplets = pGroup.userData.droplets || [];
    const splashRings = pGroup.userData.splashRings || [];
    const bubbles = pGroup.userData.bubbles || [];

    // Stream cylinder height and position
    const streamHeight = Math.max(0.02, mouth.streamStart - currentSurfaceY);
    const streamCenterY = currentSurfaceY + streamHeight / 2;
    if (streamMesh) {
      streamMesh.scale.set(mouth.streamWidth, streamHeight, mouth.streamWidth);
      streamMesh.position.set(mouth.x, streamCenterY, mouth.z);

      // Fade out stream near completion
      if (rawP > 0.90) {
        const fade = (1.0 - rawP) / 0.10;
        streamMesh.material.opacity = fade * 0.88;
      }
    }

    // Falling droplets along stream line
    droplets.forEach((drop, idx) => {
      const dropProgress = (elapsed * drop.userData.speed + idx * 0.16) % 1.0;
      const dropY = mouth.streamStart - dropProgress * streamHeight;
      const wobble = Math.sin(elapsed * 15 + drop.userData.wobbleAngle) * (mouth.streamWidth * 0.25);
      drop.position.set(mouth.x + wobble, dropY, mouth.z);
      drop.visible = (rawP < 0.94 && dropProgress < 0.95);
    });

    // Surface splash ripples at currentSurfaceY
    splashRings.forEach((ring, idx) => {
      const phase = (elapsed * 4.0 + idx * 0.5) % 1.0;
      ring.position.set(mouth.x, currentSurfaceY + 0.02, mouth.z);
      const ringScale = 1.0 + phase * 1.6;
      ring.scale.set(ringScale, ringScale, ringScale);
      ring.material.opacity = Math.max(0, (1.0 - phase) * (1.0 - rawP) * 0.8);
      ring.visible = (rawP < 0.96);
    });

    // Internal rising aeration bubbles inside the liquid volume
    bubbles.forEach(b => {
      if (p > 0.05 && rawP < 0.98) {
        b.visible = true;
        const bProgress = (b.userData.relY + elapsed * b.userData.speed) % 1.0;
        const bY = info.bottomY + bProgress * (currentSurfaceY - info.bottomY);
        const drift = Math.sin(elapsed * b.userData.driftSpeed) * 0.04;
        b.position.set(
          mesh.position.x + b.userData.relX + drift,
          bY,
          mesh.position.z + b.userData.relZ
        );
      } else {
        b.visible = false;
      }
    });
  }

  // Update DOM progress & status badge
  updateLiquidUIProgress(rawP, false);

  // Update in-canvas live HUD percentage
  const pct = Math.round(rawP * 100);
  const appObj = ApparatusCatalog.find(a => a.id === Lab3DState.currentApparatusId);
  const appName = appObj ? appObj.name.split(' (')[0] : 'Alat Lab';
  showCanvasPouringToast(`💧 Menuangkan ${Lab3DState.currentLiquidName} ke dalam ${appName}... [${pct}%]`, true);

  // Check completion
  if (rawP >= 1.0) {
    Lab3DState.isPouring = false;
    cleanupPouringStream();

    // Reset scales cleanly
    mesh.scale.x = info.initialScaleX;
    mesh.scale.z = info.initialScaleZ;
    updateLiquidUIProgress(1.0, true);

    // Restore stopper on volumetric flask and filler bulb on pipette
    if (Lab3DState.currentModelGroup) {
      const stopper = Lab3DState.currentModelGroup.getObjectByName('flaskStopper');
      if (stopper && stopper.userData && stopper.userData.originalY !== undefined) {
        stopper.position.y = stopper.userData.originalY;
      }
      const bulb = Lab3DState.currentModelGroup.getObjectByName('pipetteFillerBulb');
      if (bulb && bulb.userData && bulb.userData.originalY !== undefined) {
        bulb.position.y = bulb.userData.originalY;
      }
    }

    showCanvasPouringToast(`✅ ${appName} terisi penuh dengan ${Lab3DState.currentLiquidName}!`, false);
    if (typeof showAppNotification === 'function') {
      showAppNotification(`Alat terisi penuh: ${Lab3DState.currentLiquidName}`);
    }

    // Auto fade HUD toast after 2.5s
    clearTimeout(Lab3DState.toastTimeoutId);
    Lab3DState.toastTimeoutId = setTimeout(() => {
      hideCanvasPouringToast();
    }, 2500);
  }
}

/**
 * Update Active Frame of Draining Simulation
 */
function updateDrainingFrame() {
  const mesh = Lab3DState.liquidMesh;
  if (!mesh || !mesh.userData || !mesh.userData.liquidInfo) {
    Lab3DState.isDraining = false;
    return;
  }

  const now = performance.now();
  const elapsed = (now - Lab3DState.drainStartTime) / 1000;
  const duration = 0.85;
  const rawP = Math.min(1.0, elapsed / duration);
  const startP = Lab3DState.drainStartProgress || 1.0;
  const p = Math.max(0.0001, (1.0 - rawP) * startP);

  setLiquidFillLevel(mesh, p);
  updateLiquidUIProgress(p, false, true);

  const pct = Math.round(p * 100);
  showCanvasPouringToast(`🌊 Mengosongkan larutan... [${pct}%]`, true);

  if (rawP >= 1.0) {
    Lab3DState.isDraining = false;
    setLiquidFillLevel(mesh, 0.0001);
    updateLiquidUIProgress(0.0, true, true);
    showCanvasPouringToast(`Wadah telah dikosongkan. Siap diisi kembali!`, false);

    clearTimeout(Lab3DState.toastTimeoutId);
    Lab3DState.toastTimeoutId = setTimeout(() => {
      hideCanvasPouringToast();
    }, 2000);
  }
}

/**
 * Refill Current Liquid (Re-runs Pouring Simulation)
 */
function refillCurrentLiquid() {
  const hex = Lab3DState.currentLiquidHex || '#2563eb';
  const name = Lab3DState.currentLiquidName || 'Larutan Kimia';
  changeLiquidColor(hex, name);
}

/**
 * Empty / Drain Current Liquid
 */
function emptyCurrentLiquid() {
  if (!Lab3DState.liquidMesh) return;
  cleanupPouringStream();
  Lab3DState.isPouring = false;
  Lab3DState.isDraining = true;
  Lab3DState.drainStartTime = performance.now();

  const info = Lab3DState.liquidMesh.userData.liquidInfo;
  Lab3DState.drainStartProgress = (info && info.currentProgress) ? info.currentProgress : 1.0;

  LabSFX.playDrain();
  showCanvasPouringToast('Mengosongkan wadah alat lab...', true);
}

/**
 * Toggle Pouring Audio SFX (Mute / Unmute)
 */
function toggleLiquidSFX() {
  const isMuted = LabSFX.toggleMute();
  const icon = document.getElementById('sfx-icon');
  const btn = document.getElementById('btn-toggle-sfx');

  if (icon) {
    icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  }
  if (btn) {
    if (isMuted) {
      btn.classList.add('muted');
      btn.title = 'Suara SFX dimatikan (Klik untuk aktifkan)';
    } else {
      btn.classList.remove('muted');
      btn.title = 'Suara SFX aktif (Klik untuk bisukan)';
    }
  }

  if (typeof showAppNotification === 'function') {
    showAppNotification(isMuted ? 'Suara efek menuang cairan dibisukan' : 'Suara efek menuang cairan diaktifkan');
  }
}

/**
 * Update UI Elements for Liquid Progress Bar & Badges
 */
function updateLiquidUIProgress(progress, isFinished, isDraining = false) {
  const pct = Math.round(progress * 100);
  const progressBar = document.getElementById('liquid-progress-bar');
  const badge = document.getElementById('liquid-status-badge');

  if (progressBar) {
    progressBar.style.width = `${pct}%`;
    progressBar.style.backgroundColor = Lab3DState.currentLiquidHex || '#2563eb';
  }

  if (badge) {
    if (isDraining) {
      if (isFinished) {
        badge.className = 'liquid-status-badge badge-empty';
        badge.innerHTML = `<i class="fa-solid fa-circle-notch"></i> Wadah Kosong (0%)`;
      } else {
        badge.className = 'liquid-status-badge badge-draining';
        badge.innerHTML = `<i class="fa-solid fa-water fa-spin"></i> Mengosongkan... ${pct}%`;
      }
    } else {
      if (isFinished) {
        badge.className = 'liquid-status-badge badge-full';
        badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Terisi Penuh (100%)`;
      } else {
        badge.className = 'liquid-status-badge badge-pouring';
        badge.innerHTML = `<i class="fa-solid fa-bottle-droplet fa-bounce"></i> Mengisi Alat... ${pct}%`;
      }
    }
  }
}

/**
 * Update Active Border on Selected Color Bubble
 */
function updateActiveBubbleUI(colorHex) {
  const bubbles = document.querySelectorAll('.color-bubble');
  bubbles.forEach(b => {
    const bColor = b.getAttribute('data-color');
    if (bColor && colorHex && bColor.toLowerCase() === colorHex.toLowerCase()) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
}

/**
 * Synchronize Liquid Controls When Apparatus Model is Switched
 */
function syncLiquidControlsForApparatus(apparatusId) {
  const hasLiquid = !!Lab3DState.liquidMesh;
  const bubbles = document.querySelectorAll('.color-bubble');
  const refillBtn = document.getElementById('btn-refill-liquid');
  const emptyBtn = document.getElementById('btn-empty-liquid');
  const badge = document.getElementById('liquid-status-badge');
  const nameText = document.getElementById('liquid-name-text');
  const dotElem = document.getElementById('liquid-dot');
  const progressBar = document.getElementById('liquid-progress-bar');

  if (apparatusId === 'spatula') {
    // Spatula is active for solid crystal chemical reagent sampling
    bubbles.forEach(b => { b.disabled = false; });
    if (refillBtn) refillBtn.disabled = false;
    if (emptyBtn) emptyBtn.disabled = true;

    if (badge) {
      badge.className = 'liquid-status-badge badge-full';
      badge.innerHTML = `<i class="fa-solid fa-gem"></i> Kristal Reagen Padat`;
    }
    if (nameText) nameText.textContent = `Sampel Kristal: ${Lab3DState.currentLiquidName || 'Tembaga(II) Sulfat CuSO4 (Biru)'}`;
    if (dotElem) dotElem.style.backgroundColor = Lab3DState.currentLiquidHex || '#2563eb';
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.style.backgroundColor = Lab3DState.currentLiquidHex || '#2563eb';
    }
    updateActiveBubbleUI(Lab3DState.currentLiquidHex || '#2563eb');
    return;
  }

  if (hasLiquid) {
    bubbles.forEach(b => { b.disabled = false; });
    if (refillBtn) refillBtn.disabled = false;
    if (emptyBtn) emptyBtn.disabled = false;

    if (badge) {
      badge.className = 'liquid-status-badge badge-full';
      badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Terisi Penuh (100%)`;
    }
    if (nameText) nameText.textContent = Lab3DState.currentLiquidName || 'Larutan Tembaga(II) Sulfat CuSO4 (Biru)';
    if (dotElem) dotElem.style.backgroundColor = Lab3DState.currentLiquidHex || '#2563eb';
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.style.backgroundColor = Lab3DState.currentLiquidHex || '#2563eb';
    }
    updateActiveBubbleUI(Lab3DState.currentLiquidHex || '#2563eb');
  } else {
    // Apparatus is a non-liquid tool (Bunsen, Tripod, Termometer)
    bubbles.forEach(b => { b.disabled = true; });
    if (refillBtn) refillBtn.disabled = true;
    if (emptyBtn) emptyBtn.disabled = true;

    const appObj = ApparatusCatalog.find(a => a.id === apparatusId);
    const toolName = appObj ? appObj.name.split(' (')[0] : 'Alat';

    if (badge) {
      badge.className = 'liquid-status-badge badge-dry';
      badge.innerHTML = `<i class="fa-solid fa-ban"></i> Bukan Wadah Cairan`;
    }
    if (nameText) nameText.textContent = `${toolName} bukan wadah larutan (Pilih Pipet Gondok, Buret, Erlenmeyer, dll)`;
    if (dotElem) dotElem.style.backgroundColor = '#94a3b8';
    if (progressBar) progressBar.style.width = '0%';
  }
}

/**
 * In-Canvas Live Floating Toast / HUD
 */
function showCanvasPouringToast(text, isSpinning) {
  const toast = document.getElementById('canvas-pouring-toast');
  const textElem = document.getElementById('canvas-toast-text');
  if (!toast || !textElem) return;

  textElem.textContent = text;
  toast.classList.add('active');

  const icon = toast.querySelector('.toast-icon');
  if (icon) {
    if (isSpinning) {
      icon.className = 'fa-solid fa-bottle-droplet fa-bounce toast-icon';
    } else {
      icon.className = 'fa-solid fa-circle-check toast-icon';
    }
  }
}

function hideCanvasPouringToast() {
  const toast = document.getElementById('canvas-pouring-toast');
  if (toast) toast.classList.remove('active');
}

/**
 * Toggle 3D Auto-Rotation
 */
function toggleAutoRotate() {
  Lab3DState.isAutoRotating = !Lab3DState.isAutoRotating;
  const btn = document.getElementById('btn-toggle-autorotate');
  if (btn) {
    if (Lab3DState.isAutoRotating) {
      btn.classList.add('active');
      btn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause Rotasi`;
    } else {
      btn.classList.remove('active');
      btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Auto-Rotate`;
    }
  }
}

/**
 * Toggle X-Ray / Anatomy View Mode
 */
function toggleXRayView() {
  Lab3DState.isXRayActive = !Lab3DState.isXRayActive;
  const calloutBox = document.getElementById('anatomy-callout');
  const btn = document.getElementById('btn-xray-view');

  if (Lab3DState.isXRayActive) {
    if (calloutBox) calloutBox.classList.add('active');
    if (btn) btn.classList.add('active');
    if (typeof showAppNotification === 'function') {
      showAppNotification('Mode Anatomi / X-Ray Aktif: Menampilkan bagian-bagian penting alat.');
    }
  } else {
    if (calloutBox) calloutBox.classList.remove('active');
    if (btn) btn.classList.remove('active');
  }
}

/**
 * Toggle Augmented Reality (AR) Camera Stream Mode
 */
async function toggleARMode() {
  const videoElem = document.getElementById('ar-camera-video');
  const crosshair = document.getElementById('ar-crosshair');
  const btn = document.getElementById('btn-mode-ar');
  if (!videoElem || !btn) return;

  if (!Lab3DState.isARActive) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoElem.srcObject = stream;
      videoElem.classList.add('active');
      if (crosshair) crosshair.classList.add('active');
      btn.classList.add('active');
      btn.innerHTML = `<i class="fa-solid fa-camera-rotate"></i> Matikan AR`;
      Lab3DState.arStream = stream;
      Lab3DState.isARActive = true;
      if (typeof showAppNotification === 'function') {
        showAppNotification('Mode AR Aktif! Arahkan kamera ke meja untuk memproyeksikan alat lab 3D.');
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      videoElem.style.background = 'radial-gradient(circle, #e0f2fe, #bfdbfe)';
      videoElem.classList.add('active');
      if (crosshair) crosshair.classList.add('active');
      btn.classList.add('active');
      Lab3DState.isARActive = true;
      if (typeof showAppNotification === 'function') {
        showAppNotification('Simulasi AR Meja Lab diaktifkan.');
      }
    }
  } else {
    if (Lab3DState.arStream) {
      Lab3DState.arStream.getTracks().forEach(track => track.stop());
      Lab3DState.arStream = null;
    }
    videoElem.classList.remove('active');
    if (crosshair) crosshair.classList.remove('active');
    btn.classList.remove('active');
    btn.innerHTML = `<i class="fa-solid fa-camera"></i> Mode AR`;
    Lab3DState.isARActive = false;
    if (typeof showAppNotification === 'function') {
      showAppNotification('Mode AR dinonaktifkan.');
    }
  }
}

/**
 * Toggle Virtual Reality (VR) Stereo Cardboard Mode
 */
function toggleVRMode() {
  Lab3DState.isVRActive = !Lab3DState.isVRActive;
  const divider = document.getElementById('vr-split-divider');
  const btn = document.getElementById('btn-mode-vr');

  if (Lab3DState.isVRActive) {
    if (divider) divider.classList.add('active');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = `<i class="fa-solid fa-vr-cardboard"></i> Matikan VR`;
    }
    if (typeof showAppNotification === 'function') {
      showAppNotification('Mode VR Stereo Cardboard Aktif! Pasang smartphone ke headset VR.');
    }
  } else {
    if (divider) divider.classList.remove('active');
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = `<i class="fa-solid fa-vr-cardboard"></i> Mode VR Stereo`;
    }
    onWindowResize3D();
    if (typeof showAppNotification === 'function') {
      showAppNotification('Mode VR dinonaktifkan.');
    }
  }
}

/**
 * Text-to-Speech (TTS) Voiceover in Bahasa Indonesia
 */
function speakCurrentApparatus() {
  const data = ApparatusCatalog.find(item => item.id === Lab3DState.currentApparatusId);
  if (!data) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(data.audioText);
    utterance.lang = 'id-ID';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang.includes('id') || v.name.toLowerCase().includes('indonesia'));
    if (idVoice) utterance.voice = idVoice;

    window.speechSynthesis.speak(utterance);
    if (typeof showAppNotification === 'function') {
      showAppNotification(`Memutar suara penjelasan: ${data.name}`);
    }
  } else {
    if (typeof showAppNotification === 'function') {
      showAppNotification('Fitur pembacaan suara tidak didukung browser ini.');
    }
  }
}
