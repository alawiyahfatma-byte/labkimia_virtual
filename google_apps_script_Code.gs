/**
 * =====================================================================
 * BACKEND GOOGLE APPS SCRIPT - CHEMLAB 3D VIRTUAL
 * GURU PENGAMPU: IBU FATMA ALAWIYAH, S.Pd.,Gr.
 * =====================================================================
 * 
 * PANDUAN PEMASANGAN:
 * 1. Buka Google Spreadsheet baru di Google Drive Anda.
 * 2. Klik menu: Ekstensi > Apps Script.
 * 3. Hapus semua kode yang ada di editor, lalu tempel (paste) seluruh kode di bawah ini.
 * 4. Klik ikon Disket (Simpan) di toolbar atas.
 * 5. Klik tombol: Deploy (Terapkan) > New deployment (Deployment baru).
 * 6. Pilih jenis: Web app (Aplikasi web).
 *    - Description: ChemLab 3D Fatma Alawiyah
 *    - Execute as (Jalankan sebagai): Me (Email Google Anda)
 *    - Who has access (Siapa yang memiliki akses): Anyone (Siapa saja)  <-- PENTING!
 * 7. Klik "Deploy", lalu klik "Authorize access" (Izinkan Akses akun Google Anda).
 * 8. Salin "Web app URL" (URL yang berakhiran /exec).
 * 9. Buka Dashboard Guru di aplikasi ChemLab 3D > Tab "Integrasi Apps Script & Sheets",
 *    lalu tempel URL tersebut dan klik "Simpan URL".
 * =====================================================================
 */

/**
 * Handle HTTP GET Request
 * Berfungsi untuk tes konektivitas (health check) dari web laboratorium
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Backend Google Apps Script ChemLab 3D (Ibu Fatma Alawiyah) Aktif & Terhubung!',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle HTTP POST Request
 * Menerima dan mencatat data Kuis, LKPD PBL, dan Jurnal Refleksi Siswa secara realtime
 */
function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // -------------------------------------------------------------
    // 1. SIMPAN REKAP NILAI SISWA (LAB + KUIS) ATAU SINKRONISASI MASSAL
    // -------------------------------------------------------------
    if (data.action === 'saveQuiz' || data.action === 'syncAll') {
      var sheetScores = getOrCreateSheet(ss, 'Rekap_Nilai_Siswa', [
        'Timestamp', 'Nama Siswa', 'NISN', 'Kelas', 'Sekolah', 'Nilai Lab Praktikum', 'Nilai Kuis Teori', 'Nilai Akhir Kumulatif', 'Predikat', 'Status Kelulusan'
      ], '#1e3a8a');
      
      if (data.action === 'syncAll' && data.submissions && data.submissions.length > 0) {
        data.submissions.forEach(function(s) {
          sheetScores.appendRow([
            s.timestamp || new Date().toLocaleString('id-ID'),
            s.name || '-',
            s.nisn || '-',
            s.className || '-',
            s.school || 'SMAN 1 Abung Tinggi',
            s.labScore !== undefined ? s.labScore : 0,
            s.quizScore !== undefined ? s.quizScore : 0,
            s.finalScore !== undefined ? s.finalScore : 0,
            s.predicate || '-',
            s.status || '-'
          ]);
        });
      } else if (data.action === 'saveQuiz') {
        sheetScores.appendRow([
          data.timestamp || new Date().toLocaleString('id-ID'),
          data.name || '-',
          data.nisn || '-',
          data.className || '-',
          data.school || 'SMAN 1 Abung Tinggi',
          data.labScore !== undefined ? data.labScore : 0,
          data.quizScore !== undefined ? data.quizScore : 0,
          data.finalScore !== undefined ? data.finalScore : 0,
          data.predicate || '-',
          data.status || '-'
        ]);
      }
    }

    // -------------------------------------------------------------
    // 2. SIMPAN LOG AKTIVITAS PRAKTIKUM LAB SISWA REAL-TIME
    // -------------------------------------------------------------
    if (data.action === 'saveLabActivity') {
      var sheetLab = getOrCreateSheet(ss, 'Log_Aktivitas_Lab', [
        'Timestamp', 'Nama Siswa', 'NISN', 'Kelas', 'Sekolah', 'Nama Aktivitas', 'Skor Aktivitas', 'Detail Parameter', 'Total Nilai Lab', 'Nilai Akhir'
      ], '#0e7490');

      sheetLab.appendRow([
        data.timestamp || new Date().toLocaleString('id-ID'),
        data.name || '-',
        data.nisn || '-',
        data.className || '-',
        data.school || 'SMAN 1 Abung Tinggi',
        data.activityName || '-',
        data.activityScore !== undefined ? data.activityScore : 0,
        data.activityDetail || '-',
        data.labScore !== undefined ? data.labScore : 0,
        data.finalScore !== undefined ? data.finalScore : 0
      ]);
    }

    // -------------------------------------------------------------
    // 3. SIMPAN LEMBAR KERJA PESERTA DIDIK (LKPD) DIGITAL PBL
    // -------------------------------------------------------------
    if (data.action === 'saveLKPD') {
      var sheetLKPD = getOrCreateSheet(ss, 'Data_LKPD_PBL', [
        'Timestamp', 'Nama Siswa', 'Kelas', 'Fase 1: Identifikasi Masalah Cuka', 'Fase 2: Hipotesis & Reaksi', 'Fase 3: Data Titrasi & Kesimpulan'
      ], '#0369a1');

      sheetLKPD.appendRow([
        data.timestamp || new Date().toLocaleString('id-ID'),
        data.name || '-',
        data.className || '-',
        data.q1 || '-',
        data.q2 || '-',
        data.q3 || '-'
      ]);
    }

    // -------------------------------------------------------------
    // 4. SIMPAN JURNAL REFLEKSI METAKOGNISI SISWA (3-2-1 MODEL)
    // -------------------------------------------------------------
    if (data.action === 'saveReflection') {
      var sheetRef = getOrCreateSheet(ss, 'Refleksi_Siswa', [
        'Timestamp', 'Nama Siswa', 'Kelas', 'Perasaan Mood', 'Rating Bintang (1-5)', '3 Hal Baru Dipelajari', '2 Hal Menantang', '1 Komitmen Aksi di Lab'
      ], '#047857');

      sheetRef.appendRow([
        data.timestamp || new Date().toLocaleString('id-ID'),
        data.name || '-',
        data.className || '-',
        data.mood || 'Sangat Antusias',
        data.rating || 5,
        data.q1 || '-',
        data.q2 || '-',
        data.q3 || '-'
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data berhasil dicatat ke Google Spreadsheet!'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Fungsi Pembantu: Membuat Sheet baru dengan header gaya profesional jika belum ada
 */
function getOrCreateSheet(ss, sheetName, headers, headerColor) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    
    // Format Header Baris Pertama
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground(headerColor || '#1e3a8a');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    
    sheet.setFrozenRows(1);
    
    // Auto-fit kolom agar terbaca rapi
    for (var i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }
  return sheet;
}
