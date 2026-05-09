# ISPAS 2.0 PRO — Integrated Smart Verification & Real Notification System

## 📋 Deskripsi
ISPAS 2.0 PRO adalah versi lanjutan dari sistem verifikasi dokumen BA Balik yang kini dilengkapi dengan manajemen pengguna (Auth), validasi Surat Jalan yang ketat, dan simulasi notifikasi riil melalui Email (Gmail) dan WhatsApp/SMS.

---

## 🚀 Fitur Utama (Update 2024)

1.  **Manajemen Akun Terpusat**: CS dapat membuat akun Customer dengan kredensial terenkripsi (Bcrypt) dan sesi aman (JWT).
2.  **Validasi Surat Jalan Mandatori**: Menjamin kelengkapan data operasional (Driver, Plat Nomor, Deskripsi Barang, dll.) sebelum diproses.
3.  **Real Notification Simulation**: Notifikasi aktivasi akun dan status order dikirim langsung ke Email & HP Customer.
4.  **Konfigurasi SMTP Dinamis**: CS dapat mengubah akun Gmail pengirim (App Password) langsung dari dashboard tanpa mengubah kode.
5.  **Direct Customer Support**: Fitur bagi customer untuk mengirim email langsung ke tim Customer Service melalui sistem.

---

## 🖥️ Cara Menjalankan

### 1. Instalasi
Pastikan Node.js terinstal, lalu jalankan:
```bash
npm install
```

### 2. Menjalankan Server
```bash
npm start
```
Akses di: **http://localhost:3000**

### 3. Data Login Default (Uji Coba)
*   **Username**: `cs_admin`
*   **Password**: `admin123`
*   **Role**: Customer Service (CS SPIL)

---

## ⚙️ Konfigurasi Notifikasi Riil

Untuk mengaktifkan pengiriman email asli ke Gmail:
1.  Login sebagai **cs_admin**.
2.  Masuk ke menu **Config**.
3.  Masukkan **Email Gmail** dan **App Password** (dibuat di Google Account Security).
4.  Sistem akan otomatis menggunakan akun tersebut untuk semua notifikasi.

---

## 🗂️ Struktur Proyek

```
ispas/
├── api/
│   └── index.js          # Backend Server (Express + Auth + SMTP)
├── public/
│   └── index.html        # Frontend SPA (React-style Vanilla JS)
├── server/
│   └── data/             # Database JSON (Customers, Branches, etc.)
└── package.json          # Dependencies
```

---

## 🛠️ Tech Stack
*   **Backend**: Node.js, Express, JWT, Bcrypt, Nodemailer.
*   **Frontend**: Vanilla HTML5/CSS3/JS (Modern UI).
*   **Database**: JSON-based Flat File (Scalable to PostgreSQL).
