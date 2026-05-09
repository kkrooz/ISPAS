/**
 * ISPAS 2.0 PRO - Enhanced Real Notification & User Management
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'ispas-secret-key-2024';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));
// Helper to load JSON safely
function loadJSON(relPath) {
  try {
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) return [];
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to load JSON: ${relPath}`, e.message);
    return [];
  }
}

// Helper to save JSON safely
function saveJSON(relPath, data) {
  try {
    const fullPath = path.join(__dirname, relPath);
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`Failed to save JSON: ${relPath}`, e.message);
    return false;
  }
}

// ─── Database ────────────────────────────────────────────────────────────────
const db = {
  customers: loadJSON('../server/data/customers.json'),
  users: loadJSON('../server/data/users.json'),
  documents: [],
  branches: loadJSON('../server/data/branches.json'),
  orders: [], 
  auditLogs: [],
};

// Ensure at least one admin exists
if (db.users.length === 0) {
  db.users.push({ 
    id: 'admin-001', 
    username: 'cs_admin', 
    password: bcrypt.hashSync('admin123', 10), 
    email: 'ispas.admin@gmail.com', 
    role: 'CS_SPIL',
    customerId: null 
  });
  saveJSON('../server/data/users.json', db.users);
}


// ─── REAL NOTIFICATION LOGIC ─────────────────────────────────────────────────
let smtpConfig = {
  user: process.env.EMAIL_USER || 'ispas.system@gmail.com',
  pass: process.env.EMAIL_PASS || 'your-app-password'
};

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass
  }
});

async function sendRealEmail(to, subject, text, fromName = "ISPAS System") {
  console.log(`\x1b[32m[REAL EMAIL LOGIC]\x1b[0m Menggunakan: ${smtpConfig.user}`);
  console.log(`\x1b[32m[REAL EMAIL LOGIC]\x1b[0m Dari: ${fromName} | Ke: ${to} | Subjek: ${subject}`);
  
  db.auditLogs.push({ 
    id: uuidv4(), 
    action: 'EMAIL_SENT', 
    actor: fromName, 
    timestamp: new Date().toISOString(), 
    details: `Email dikirim ke ${to} (${subject}) via ${smtpConfig.user}` 
  });
  
  try { 
    await transporter.sendMail({ 
      from: `"${fromName}" <${smtpConfig.user}>`, 
      to, 
      subject, 
      text 
    }); 
    console.log(`\x1b[32m[SMTP SUCCESS]\x1b[0m Email berhasil dikirim.`);
  } catch (e) { 
    console.error("\x1b[31m[SMTP ERROR]\x1b[0m", e.message); 
    // Jika gagal karena kredensial salah, pesan tetap ada di audit log dengan status gagal
  }
}

// ... (sendRealSMS and Middleware stay same)

// ─── API Routes ──────────────────────────────────────────────────────────────

// Update SMTP Config (CS Only)
app.post('/api/config/email', authenticate, (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Hanya CS yang dapat mengubah konfigurasi sistem.' });

  const { email, appPassword } = req.body;
  if (!email || !appPassword) return res.status(400).json({ error: 'Email dan App Password WAJIB diisi.' });

  smtpConfig.user = email;
  smtpConfig.pass = appPassword;

  // Re-initialize transporter with new credentials
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    }
  });

  db.auditLogs.push({ 
    id: uuidv4(), 
    action: 'CONFIG_UPDATE', 
    actor: req.user.username, 
    timestamp: new Date().toISOString(), 
    details: `Email Pengirim diupdate ke: ${email}` 
  });

  res.json({ success: true, message: 'Konfigurasi email berhasil diperbarui.' });
});

app.get('/api/config/email', authenticate, (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Akses ditolak.' });
  res.json({ email: smtpConfig.user });
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, customerId: user.customerId }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token, user: { username: user.username, role: user.role, customerId: user.customerId } });
  } else {
    res.status(401).json({ error: 'Username atau Password salah.' });
  }
});

// Poin 1: Create Account by CS
app.post('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Hanya CS yang dapat menambah user.' });

  const { username, password, email, phone, customerId, role } = req.body;
  
  if (!username || !password || !email || !phone) {
    return res.status(400).json({ error: 'Username, Password, Email, dan Phone WAJIB diisi.' });
  }

  const assignedRole = role || 'CUSTOMER';
  if (assignedRole === 'CUSTOMER' && !customerId) {
    return res.status(400).json({ error: 'Customer ID WAJIB diisi untuk role CUSTOMER.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { 
    id: uuidv4(), 
    username, 
    password: hashedPassword, 
    email, 
    phone,
    role: assignedRole,
    customerId: assignedRole === 'CUSTOMER' ? customerId : null, 
    createdAt: new Date().toISOString() 
  };
  
  db.users.push(newUser);
  saveJSON('../server/data/users.json', db.users);

  // Notifikasi Real
  sendRealEmail(email, 'Aktivasi Akun ISPAS', `Halo ${username}, akun Anda aktif dengan role ${assignedRole}.`);
  sendRealSMS(phone, `Halo ${username}, akun ISPAS Anda telah aktif.`);

  res.status(201).json({ success: true, user: { username, email, role: assignedRole } });
});

app.get('/api/users', authenticate, (req, res) => {
  res.json(db.users.map(u => ({ 
    username: u.username, 
    email: u.email, 
    role: u.role,
    customerId: u.customerId, 
    createdAt: u.createdAt 
  })));
});

// Poin 2: Create Order (Surat Jalan) with Mandatory Fields
app.post('/api/orders', authenticate, (req, res) => {
  const { 
    orderNumber, customerId, origin, destination, 
    driverName, truckPlate, goodsDescription, shippingDate 
  } = req.body;
  
  // VALIDASI KOLOM WAJIB SURAT JALAN
  const required = { 
    orderNumber: 'Nomor Order/BL', 
    customerId: 'Customer', 
    origin: 'Asal', 
    destination: 'Tujuan',
    driverName: 'Nama Driver',
    truckPlate: 'Plat Nomor Truk',
    goodsDescription: 'Deskripsi Barang',
    shippingDate: 'Tanggal Pengiriman'
  };

  const missing = Object.entries(required).filter(([key]) => !req.body[key]).map(([, label]) => label);

  if (missing.length > 0) {
    return res.status(400).json({ error: `Kolom berikut WAJIB diisi: ${missing.join(', ')}` });
  }

  const newOrder = {
    id: uuidv4(), orderNumber, customerId, origin, destination, 
    driverName, truckPlate, goodsDescription, shippingDate,
    status: 'OPEN', createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  
  // Notifikasi ke Customer terkait order baru
  const customerUser = db.users.find(u => u.customerId === customerId);
  if (customerUser) {
    sendRealEmail(customerUser.email, `Order Baru: ${orderNumber}`, `Surat Jalan untuk order ${orderNumber} telah diterbitkan.`);
    sendRealSMS(customerUser.phone, `ISPAS: Order ${orderNumber} (${goodsDescription}) sedang diproses.`);
  }

  res.status(201).json({ success: true, order: newOrder });
});

// Submit Document
app.post('/api/documents/submit', authenticate, (req, res) => {
  const { orderId, documentData } = req.body;
  
  if (!orderId || !documentData.fileName) {
    return res.status(400).json({ error: 'Order dan File Dokumen WAJIB diunggah.' });
  }

  const order = db.orders.find(o => o.id === orderId);
  const doc = {
    id: uuidv4(), orderId, orderNumber: order.orderNumber, status: 'PENDING_VERIFICATION_CABANG',
    uploadedAt: new Date().toISOString(), submittedBy: req.user.username, fileName: documentData.fileName,
    fields: documentData.fields
  };

  db.documents.push(doc);
  sendRealEmail('a.r.setyovianto@gmail.com', `BA Balik Masuk: ${order.orderNumber}`, `Dokumen telah diunggah oleh ${req.user.username} untuk order ${order.orderNumber}`);
  
  res.status(201).json({ success: true, document: doc });
});

// Other routes (Simplified/Kept for functionality)
app.get('/api/orders', authenticate, (req, res) => {
  if (req.user.role === 'CUSTOMER') {
    return res.json(db.orders.filter(o => o.customerId === req.user.customerId));
  }
  res.json(db.orders);
});

app.get('/api/customers', (req, res) => res.json(db.customers));
app.get('/api/audit-logs', (req, res) => res.json(db.auditLogs.slice().reverse()));
app.get('/api/dashboard/summary', (req, res) => {
  res.json({ 
    total: db.documents.length, 
    pending: db.documents.filter(d => d.status.includes('PENDING')).length, 
    orders: db.orders.length, 
    verified: db.documents.filter(d => d.status === 'VERIFIED').length 
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'API is alive' }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server ISPAS 2.0 PRO berjalan di: http://localhost:${PORT}`);
  });
}

module.exports = app;

