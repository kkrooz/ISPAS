# ISPAS — Integrated Smart Verification & Prescriptive Analytics System
## Sistem Verifikasi Dokumen BA Balik untuk PT SPIL

---

## 📋 Deskripsi Sistem

ISPAS adalah sistem manajemen verifikasi dokumen BA Balik (Bukti Angkut Balik) berbasis web yang dirancang khusus untuk menyelesaikan bottleneck operasional PT SPIL. Sistem ini mengimplementasikan 4 pilar utama:

1. **Customer-Specific Rule Engine** — validasi otomatis berdasarkan profil per pelanggan
2. **Progressive Branch Empowerment (VQI)** — scoring kepercayaan cabang yang terukur
3. **Prescriptive SLA Engine** — eskalasi proaktif multi-level sebelum SLA terlampaui
4. **Digital Twin + Compliance Gateway** — jalur modular fisik dan digital

---

## 🖥️ Pre-Requisites (Wajib Diinstall)

### 1. Node.js (v18 atau lebih baru)
- **Windows**: Unduh installer dari https://nodejs.org/en/download → pilih "LTS"
- **macOS**: `brew install node` (jika menggunakan Homebrew)
- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Verifikasi**: Buka terminal/cmd, jalankan `node --version` → harus muncul `v18.x.x` atau lebih baru

### 2. npm (biasanya sudah terinstall bersama Node.js)
- **Verifikasi**: `npm --version` → harus muncul `v8.x.x` atau lebih baru

### 3. Web Browser Modern
- Google Chrome, Mozilla Firefox, Microsoft Edge, atau Safari (terbaru)

### 4. Text Editor (Opsional, untuk kustomisasi)
- Visual Studio Code (https://code.visualstudio.com/) — DIREKOMENDASIKAN

---

## 🚀 Langkah-Langkah Instalasi & Menjalankan

### Langkah 1: Persiapkan Folder Proyek

Buat folder baru dan salin semua file ke dalamnya dengan struktur berikut:

```
ispas/
├── package.json
├── server/
│   ├── index.js
│   └── data/
│       ├── customers.json
│       └── branches.json
└── public/
    └── index.html
```

### Langkah 2: Install Dependencies

Buka terminal/Command Prompt, masuk ke folder proyek:

```bash
# Masuk ke folder proyek
cd ispas

# Install semua paket yang dibutuhkan
npm install
```

Output yang diharapkan:
```
added 75 packages in 3s
```

### Langkah 3: Jalankan Server

```bash
# Mode production (biasa)
npm start

# ATAU mode development dengan auto-restart (direkomendasikan saat pengembangan)
npm run dev
```

Output yang diharapkan:
```
╔═══════════════════════════════════════════════════════╗
║     ISPAS - PT SPIL v1.0.0                           ║
║     Integrated Smart Verification & Analytics        ║
║     Server berjalan di: http://localhost:3000       ║
╚═══════════════════════════════════════════════════════╝
```

### Langkah 4: Buka Aplikasi

Buka browser dan akses: **http://localhost:3000**

Aplikasi ISPAS siap digunakan! ✅

---

## 🗂️ Struktur File & Penjelasan

```
ispas/
├── package.json              # Konfigurasi proyek & dependencies
├── server/
│   ├── index.js              # Server utama (Express.js) — semua logika bisnis
│   └── data/
│       ├── customers.json    # Profil & rule engine per pelanggan
│       └── branches.json     # Data cabang & metrik VQI
└── public/
    └── index.html            # Frontend lengkap (dashboard, form, tabel)
```

### server/index.js
File utama server. Berisi:
- **Rule Engine**: fungsi `calculateConfidenceScore()` — menghitung skor dokumen vs profil pelanggan
- **SLA Engine**: fungsi `calculateSLAStatus()` — menghitung countdown dan level eskalasi
- **VQI Engine**: fungsi `calculateVQI()` — menghitung skor kepercayaan cabang
- **REST API endpoints**: semua route `/api/...`

### server/data/customers.json
Profil rule engine per pelanggan. Setiap objek pelanggan berisi:
- `requiredFields`: daftar field wajib beserta format regex dan bobot error
- `slaDays`: batas waktu penagihan
- `requiresStamp` / `requiresSignature`: persyaratan fisik
- `deliveryType`: `"DIGITAL"` atau `"PHYSICAL_REQUIRED"`

### server/data/branches.json
Data cabang beserta metrik historis untuk kalkulasi VQI:
- `accuracyRate`: persentase akurasi verifikasi
- `avgCycleTimeDays`: rata-rata waktu verifikasi dalam hari
- `slaComplianceRate`: persentase kepatuhan SLA

---

## 📡 API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/dashboard/summary` | Ringkasan KPI dashboard |
| GET | `/api/customers` | Semua profil pelanggan |
| GET | `/api/customers/:id` | Detail profil pelanggan |
| POST | `/api/documents/submit` | Submit dokumen BA Balik |
| GET | `/api/documents` | Daftar dokumen (filter: branchId, status, confidenceLevel) |
| POST | `/api/documents/:id/verify` | Verifikasi dokumen (APPROVE/REJECT/REQUEST_REVISION) |
| GET | `/api/escalations` | Dokumen yang memerlukan eskalasi SLA |
| GET | `/api/branches` | Data cabang beserta VQI |
| GET | `/api/audit-logs` | 50 log aktivitas terbaru |

### Contoh: Submit Dokumen via API

```bash
curl -X POST http://localhost:3000/api/documents/submit \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-001",
    "branchId": "branch-001",
    "documentData": {
      "fields": {
        "noBatch": "BTH-2024-001",
        "expDate": "31/12/2025",
        "noPO": "PO-98765",
        "jumlahBarang": "500"
      },
      "pageCount": 3,
      "hasStamp": true,
      "hasSignature": true
    }
  }'
```

---

## ⚙️ Konfigurasi Pelanggan Baru

Untuk menambahkan pelanggan baru, edit `server/data/customers.json`:

```json
{
  "id": "cust-004",
  "name": "PT Nama Pelanggan Baru",
  "segment": "Retail",
  "deliveryType": "DIGITAL",
  "slaDays": 45,
  "minPages": 2,
  "requiresStamp": true,
  "requiresSignature": true,
  "requiredFields": [
    {
      "key": "noPO",
      "label": "Nomor PO",
      "weight": 2,
      "format": "^PO-\\d{5}$",
      "formatLabel": "PO-NNNNN"
    },
    {
      "key": "jumlahBarang",
      "label": "Jumlah Barang",
      "weight": 1.5,
      "format": "^\\d+$",
      "formatLabel": "Angka"
    }
  ],
  "contact": "email@pelanggan.co.id",
  "notes": "Catatan khusus pelanggan ini."
}
```

**Penjelasan field `weight`**: Semakin tinggi bobot, semakin besar pengurangan confidence score jika field ini kosong atau tidak sesuai format.

---

## 🏭 Cara Menggunakan ISPAS

### 1. Submit Dokumen BA Balik (Simulasi VendorHUB)
1. Klik menu **Submit Dokumen** di sidebar
2. Pilih **Pelanggan** → sistem otomatis menampilkan Rule Engine untuk pelanggan tersebut
3. Pilih **Cabang** pengirim
4. Isi field sesuai dokumen: jumlah halaman, stempel, tanda tangan
5. Isi field khusus pelanggan (No. Batch, No. PO, dll.)
6. Klik **Submit & Jalankan Rule Engine**
7. Sistem langsung menampilkan **Confidence Score** dan daftar isu yang ditemukan

### 2. Verifikasi Dokumen (Dashboard Verifikator Cabang)
1. Klik menu **Verifikasi Cabang**
2. Filter berdasarkan level confidence jika diinginkan
3. Klik **Verifikasi** pada dokumen yang ingin diproses
4. Modal menampilkan **Checklist Terpersonalisasi** — item yang gagal disorot merah
5. Pilih tindakan: **Setujui**, **Minta Revisi**, atau **Tolak**

### 3. Pantau Eskalasi SLA (Prescriptive SLA Engine)
1. Klik menu **Eskalasi SLA**
2. Sistem menampilkan semua dokumen yang mendekati atau melampaui SLA
3. Setiap kartu menampilkan: level eskalasi, sisa hari, tindakan yang direkomendasikan, dan pihak yang perlu dihubungi
4. Klik **Kirim Notifikasi** untuk mensimulasikan pengiriman WhatsApp

### 4. Pantau VQI Cabang
1. Klik menu **Cabang & VQI**
2. Lihat skor VQI setiap cabang beserta tier audit (Hijau 5%, Kuning 15%, Merah 50%)
3. Metrik: Akurasi, Cycle Time, SLA Compliance

---

## 🔧 Pengembangan Lanjutan (Production)

### Mengganti Database In-Memory dengan Database Nyata

Install PostgreSQL adapter:
```bash
npm install pg sequelize
```

Ganti bagian `const db = { ... }` di `server/index.js` dengan koneksi Sequelize/PostgreSQL.

### Integrasi OCR (Computer Vision)

Untuk integrasi OCR nyata (pengganti input manual), tambahkan:
```bash
npm install tesseract.js
# ATAU gunakan Google Cloud Vision API / Azure Computer Vision
```

### Autentikasi Pengguna

```bash
npm install jsonwebtoken bcrypt express-session
```

### Deploy ke Server

**Menggunakan PM2 (Process Manager):**
```bash
npm install -g pm2
pm2 start server/index.js --name ispas
pm2 startup  # agar otomatis jalan saat server restart
pm2 save
```

**Menggunakan Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

---

## 🐛 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `node: command not found` | Node.js belum terinstall. Ikuti panduan pre-requisites. |
| `Error: Cannot find module 'express'` | Jalankan `npm install` terlebih dahulu. |
| `Port 3000 already in use` | Ganti PORT: `PORT=3001 npm start` |
| Dashboard tidak muncul data | Pastikan server berjalan, refresh browser, periksa console browser (F12) |
| `EACCES permission denied` | Linux/Mac: gunakan `sudo` atau ubah permission folder |

---

## 📊 Formula Kalkulasi

### Confidence Score
```
Score = 100
Untuk setiap field wajib yang kosong:  Score -= weight × 20
Untuk setiap field format tidak sesuai: Score -= weight × 10
Jika halaman < minimum:               Score -= 25
Jika stempel tidak ada (wajib):       Score -= 20
Jika tanda tangan tidak ada (wajib):  Score -= 20
Score = max(0, Score)

HIGH_CONFIDENCE  : Score ≥ 85
MEDIUM_CONFIDENCE: Score 70–84
LOW_CONFIDENCE   : Score < 70
```

### VQI (Vendor Quality Index)
```
VQI = (Akurasi × 0.5) + (Kecepatan × 0.3) + (SLA Compliance × 0.2)

VQI ≥ 85 → Jalur Hijau (audit 5%)
VQI 70–84 → Audit 15%
VQI < 70  → Audit 50%
```

### SLA Escalation Level
```
Sisa > 7 hari  → ON_TRACK
Sisa 4–7 hari  → Level 1: Notif Verifikator & SPV Cabang
Sisa 1–3 hari  → Level 2: Eskalasi ke ISDR Pusat
Sisa 0–1 hari  → Level 3: Eskalasi ke Finance & AM
Melampaui SLA  → CRITICAL: Notif Manajemen
```

---

## 📞 Kontak & Lisensi

Sistem ISPAS dikembangkan sebagai solusi kompetisi untuk PT SPIL.
Dapat dikembangkan lebih lanjut sesuai kebutuhan operasional.
