/**
 * ISPAS 1.0 - Integrated Smart Verification
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

// Ensure at least one admin and fixed roles exist
if (db.users.length <= 1) {
  const fixedUsers = [
    { 
      id: 'admin-001', 
      username: 'cs_admin', 
      password: bcrypt.hashSync('admin123', 10), 
      email: 'ispas.admin@gmail.com', 
      role: 'CS_SPIL',
      customerId: null 
    },
    { 
      id: 'isdo-001', 
      username: 'isdo_pusat', 
      password: bcrypt.hashSync('isdo123', 10), 
      email: 'isdo.pusat@gmail.com', 
      role: 'ISDO',
      customerId: null 
    },
    { 
      id: 'isdr-001', 
      username: 'isdr_cabang', 
      password: bcrypt.hashSync('isdr123', 10), 
      email: 'isdr.cabang@gmail.com', 
      role: 'ISDR',
      customerId: null 
    },
    { 
      id: 'wh-001', 
      username: 'gudang_vendor', 
      password: bcrypt.hashSync('gudang123', 10), 
      email: 'vendor.gudang@gmail.com', 
      role: 'WAREHOUSE',
      customerId: null 
    }
  ];
  // Filter out existing to avoid duplicates if partially filled
  fixedUsers.forEach(fu => {
    if (!db.users.find(u => u.username === fu.username)) {
      db.users.push(fu);
    }
  });
  saveJSON('../server/data/users.json', db.users);
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token tidak valid' });
    req.user = decoded;
    next();
  });
}

// ─── REAL NOTIFICATION LOGIC ─────────────────────────────────────────────────
let smtpConfig = {
  user: process.env.EMAIL_USER || 'ispas.system@gmail.com',
  pass: process.env.EMAIL_PASS || '' // Use App Password
};

const fonnteToken = process.env.FONNTE_TOKEN || ''; // Fonnte API Token

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass
  }
});

async function sendRealEmail(to, subject, text, fromName = "ISPAS System") {
  console.log(`[EMAIL] Attempting to send to: ${to}`);
  if (!smtpConfig.pass) {
    const errorMsg = "[EMAIL FAIL] No App Password configured in Environment Variables.";
    console.warn(errorMsg);
    db.auditLogs.push({ id: uuidv4(), action: 'EMAIL_ERROR', actor: 'System', timestamp: new Date().toISOString(), details: errorMsg });
    return;
  }
  
  try { 
    await transporter.sendMail({ from: `"${fromName}" <${smtpConfig.user}>`, to, subject, text }); 
    const successMsg = `Email berhasil terkirim ke ${to}`;
    console.log(`[EMAIL SUCCESS] ${successMsg}`);
    db.auditLogs.push({ id: uuidv4(), action: 'EMAIL_SENT', actor: fromName, timestamp: new Date().toISOString(), details: successMsg });
  } catch (e) { 
    const errorMsg = `[EMAIL ERROR] Gagal kirim ke ${to}: ${e.message}`;
    console.error(errorMsg);
    db.auditLogs.push({ id: uuidv4(), action: 'EMAIL_ERROR', actor: 'System', timestamp: new Date().toISOString(), details: errorMsg });
  }
}

async function sendRealWA(phone, message) {
  console.log(`[WA] Attempting to send to: ${phone}`);
  if (!fonnteToken) {
    const errorMsg = "[WA FAIL] No Fonnte Token configured in Environment Variables.";
    console.warn(errorMsg);
    db.auditLogs.push({ id: uuidv4(), action: 'WA_ERROR', actor: 'System', timestamp: new Date().toISOString(), details: errorMsg });
    return;
  }

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': fonnteToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: phone, message: message })
    });
    const result = await response.json();
    if (result.status) {
      const successMsg = `WhatsApp berhasil terkirim ke ${phone}`;
      console.log(`[WA SUCCESS] ${successMsg}`);
      db.auditLogs.push({ id: uuidv4(), action: 'WA_SENT', actor: 'ISPAS System', timestamp: new Date().toISOString(), details: successMsg });
    } else {
      const errorMsg = `[WA FONNTE ERROR] ${result.reason || 'Unknown error'}`;
      console.error(errorMsg);
      db.auditLogs.push({ id: uuidv4(), action: 'WA_ERROR', actor: 'System', timestamp: new Date().toISOString(), details: errorMsg });
    }
  } catch (e) {
    const errorMsg = `[WA FETCH ERROR] Gagal terhubung ke Fonnte: ${e.message}`;
    console.error(errorMsg);
    db.auditLogs.push({ id: uuidv4(), action: 'WA_ERROR', actor: 'System', timestamp: new Date().toISOString(), details: errorMsg });
  }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Login
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

// Create User
app.post('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Hanya CS yang dapat akses.' });
  
  const { username, password, email, phone, companyName, role } = req.body;
  
  if (!username || !password || !email || !phone) {
    return res.status(400).json({ error: 'Username, Password, Email, dan Phone WAJIB diisi.' });
  }

  const assignedRole = role || 'CUSTOMER';
  const needsCustomer = (assignedRole === 'CUSTOMER' || assignedRole === 'VENDOR');
  
  if (needsCustomer && !companyName) {
    return res.status(400).json({ error: `Nama Perusahaan WAJIB diisi untuk role ${assignedRole}.` });
  }

  let finalCustomerId = null;
  if (needsCustomer) {
    let existingCust = db.customers.find(c => c.name.toLowerCase() === companyName.trim().toLowerCase());
    if (existingCust) {
      finalCustomerId = existingCust.id;
    } else {
      finalCustomerId = `cust-${Date.now()}`;
      const newCust = {
        id: finalCustomerId,
        name: companyName.trim(),
        segment: 'General',
        deliveryType: 'DIGITAL',
        slaDays: 30,
        minPages: 1,
        requiresStamp: false,
        requiresSignature: false,
        requiredFields: [],
        contact: email,
        notes: 'Auto-created by CS during user registration.'
      };
      db.customers.push(newCust);
      saveJSON('../server/data/customers.json', db.customers);
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { 
    id: uuidv4(), 
    username, 
    password: hashedPassword, 
    email, 
    phone, 
    role: assignedRole, 
    customerId: finalCustomerId, 
    createdAt: new Date().toISOString() 
  };
  
  db.users.push(newUser);
  saveJSON('../server/data/users.json', db.users);

  sendRealEmail(email, 'Aktivasi ISPAS', `Halo ${username}, akun Anda aktif dengan role ${assignedRole}.`);
  sendRealWA(phone, `ISPAS: Akun ${username} aktif.`);
  
  res.status(201).json({ success: true, user: { username, role: assignedRole } });
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

// Notify Deadline
app.post('/api/notify-deadline', authenticate, async (req, res) => {
  const { orderNumber, driverName, deadline } = req.body;
  const user = db.users.find(u => u.username === driverName);
  
  const message = `PENGINGAT ISPAS: Order ${orderNumber} memiliki batas waktu hingga ${new Date(deadline).toLocaleString()}. Mohon segera selesaikan pengiriman.`;
  
  if (user && user.phone) {
    sendRealWA(user.phone, message);
  }
  
  if (user && user.email) {
    await sendRealEmail(user.email, 'Pengingat Batas Waktu Pengiriman', message);
  }

  res.json({ success: true, message: 'Notifikasi terkirim' });
});

// ─── LOGISTICS COST ENGINE ──────────────────────────────────────────────────
/**
 * Menghitung estimasi biaya logistik berdasarkan komponen standar industri PT SPIL.
 * Rujukan: KOMPETITOR_LOGISTIK_DATA.md
 */
function calculateLogisticsCost(params) {
  const {
    distance = 0,         // Jarak dalam KM
    isRentContainer = false,
    containerType = 'DRY', // DRY, REEFER, FLAT_RACK
    containerSize = '20',  // 20, 40
    loadWeight = 0,        // Berat muatan dalam Ton
    hasTrailer = true,     // Menggunakan gandengan
    isReschedule = false,
    delayHours = 0
  } = params;

  // 1. Biaya Sewa Container (Harian / Per Trip)
  let rentCost = isRentContainer ? (containerSize === '20' ? 300000 : 500000) : 0;

  // 2. Biaya Bensin (Solar B40)
  // Rata-rata 1L:3KM, Harga Rp 29.000/L
  const fuelConsumption = distance / 3;
  const fuelCost = fuelConsumption * 29000;

  // 3. Biaya Uang Saku Sopir (Berdasarkan Jarak & Beban)
  // Base Rp 300.000 + Insentif KM + Insentif Beban
  const driverPocketMoney = 300000 + (distance * 500) + (loadWeight * 5000);

  // 4. Biaya Beban Muatan (Surcharge per Ton > 15 Ton)
  const weightSurcharge = loadWeight > 15 ? (loadWeight - 15) * 20000 : 0;

  // 5. Biaya Dimensi (Panjang Container & Tipe)
  let dimensionSurcharge = containerSize === '40' ? 200000 : 0;
  if (containerType === 'REEFER') dimensionSurcharge += 500000; // Biaya listrik/pendingin
  if (containerType === 'FLAT_RACK') dimensionSurcharge += 300000; // Penanganan khusus

  // 6. Biaya Gandengan (Trailer)
  const trailerCost = hasTrailer ? 150000 : 0;

  // 7. Biaya Reschedule (Jika ada)
  let rescheduleCost = 0;
  if (isReschedule) {
    // Penalti dasar + biaya tunggu per jam
    rescheduleCost = 200000 + (delayHours * 50000);
  }

  const totalBaseCost = rentCost + fuelCost + driverPocketMoney + weightSurcharge + dimensionSurcharge + trailerCost;
  
  return {
    baseCost: Math.round(totalBaseCost),
    rescheduleCost: Math.round(rescheduleCost),
    totalCost: Math.round(totalBaseCost + rescheduleCost),
    breakdown: {
      fuel: Math.round(fuelCost),
      driver: Math.round(driverPocketMoney),
      weight: Math.round(weightSurcharge),
      rent: rentCost,
      trailer: trailerCost
    }
  };
}

// Create Order (CS or ISDO)
app.post('/api/orders', authenticate, (req, res) => {
  const { 
    orderNumber, customerId, origin, destination, driverName, truckPlate, 
    goodsDescription, shippingDate, deadline, distance, loadWeight, 
    containerSize, containerType, isRentContainer, hasTrailer 
  } = req.body;
  
  // Calculate Initial Cost using our Engine
  const costResults = calculateLogisticsCost({
    distance: parseFloat(distance) || 0,
    loadWeight: parseFloat(loadWeight) || 0,
    containerSize: containerSize || '20',
    containerType: containerType || 'DRY',
    isRentContainer: isRentContainer === true,
    hasTrailer: hasTrailer !== false
  });

  const initialStatus = req.user.role === 'CS_SPIL' ? 'WAITING_ISDO' : 'OPEN';
  
  const newOrder = { 
    id: uuidv4(), 
    orderNumber, 
    customerId, 
    origin, 
    destination, 
    driverName, 
    truckPlate, 
    goodsDescription, 
    shippingDate, 
    deadline, 
    distance: parseFloat(distance) || 0,
    loadWeight: parseFloat(loadWeight) || 0,
    containerSize: containerSize || '20',
    containerType: containerType || 'DRY',
    status: initialStatus, 
    warehouseStatus: 'WAITING_CONFIRMATION',
    unloadingSchedule: deadline,
    baseCost: costResults.baseCost,
    dynamicCost: 0,
    totalCost: costResults.totalCost,
    costBreakdown: costResults.breakdown,
    verificationErrors: [],
    createdAt: new Date().toISOString() 
  };
  db.orders.push(newOrder);
  res.status(201).json({ success: true, order: newOrder });
});

// Finalize Order (ISDO only)
app.patch('/api/orders/:id/publish', authenticate, (req, res) => {
  if (req.user.role !== 'ISDO') return res.status(403).json({ error: 'Hanya ISDO yang dapat menerbitkan surat jalan.' });
  
  const { id } = req.params;
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
  
  order.status = 'OPEN';
  db.auditLogs.push({ id: uuidv4(), action: 'PUBLISH_ORDER', actor: req.user.username, timestamp: new Date().toISOString(), details: `ISDO menerbitkan Surat Jalan ${order.orderNumber}` });
  res.json({ success: true, order });
});

// Update Warehouse Schedule & Cost
app.put('/api/orders/:id/schedule', authenticate, (req, res) => {
  const { id } = req.params;
  const { warehouseStatus, unloadingSchedule } = req.body;
  const order = db.orders.find(o => o.id === id);

  if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
  if (req.user.role !== 'CUSTOMER' && req.user.role !== 'CS_SPIL') {
    return res.status(403).json({ error: 'Hanya Customer atau CS yang dapat mengatur jadwal.' });
  }

  const oldDeadline = new Date(order.deadline);
  const newSchedule = new Date(unloadingSchedule);
  
  let dynamicCost = 0;

  if (newSchedule > oldDeadline) {
    const diffMs = newSchedule - oldDeadline;
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    
    // Recalculate using Engine for Consistency
    const rescheduleResults = calculateLogisticsCost({
      isReschedule: true,
      delayHours: diffHours
    });
    dynamicCost = rescheduleResults.rescheduleCost;
  }

  order.warehouseStatus = warehouseStatus;
  order.unloadingSchedule = unloadingSchedule;
  order.dynamicCost = dynamicCost;
  order.totalCost = order.baseCost + dynamicCost;

  res.json({ success: true, order });
});

// Update Order Status (for Trucker or CS)
app.patch('/api/orders/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const order = db.orders.find(o => o.id === id);

  if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
  
  const oldStatus = order.status;
  order.status = status;
  
  const logMsg = `Status Order ${order.orderNumber} diubah dari ${oldStatus} ke ${status} oleh ${req.user.username}`;
  db.auditLogs.push({ 
    id: uuidv4(), 
    action: 'STATUS_UPDATE', 
    actor: req.user.username, 
    timestamp: new Date().toISOString(), 
    details: logMsg 
  });

  res.json({ success: true, order });
});

app.get('/api/orders', authenticate, (req, res) => {
  if (req.user.role === 'CUSTOMER') return res.json(db.orders.filter(o => o.customerId === req.user.customerId));
  if (req.user.role === 'TRUCKER') return res.json(db.orders.filter(o => o.driverName === req.user.username));
  if (req.user.role === 'ISDO') return res.json(db.orders.filter(o => o.status === 'WAITING_ISDO' || o.status === 'OPEN'));
  if (req.user.role === 'ISDR') return res.json(db.orders.filter(o => ['DELIVERED', 'ERROR_FOUND', 'VERIFIED', 'SENT_TO_AR'].includes(o.status)));
  if (req.user.role === 'WAREHOUSE' || req.user.role === 'VENDOR') return res.json(db.orders); // Vendors/Warehouse see overall inbound logistics
  res.json(db.orders);
});

// Verification logic for ISDR
app.patch('/api/orders/:id/verify', authenticate, (req, res) => {
  if (req.user.role !== 'ISDR') return res.status(403).json({ error: 'Hanya ISDR yang dapat melakukan verifikasi.' });
  
  const { id } = req.params;
  const { errors, isCorrect, returnToVendor } = req.body; 
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
  
  order.verificationErrors = errors || [];
  
  if (returnToVendor) {
    order.status = 'RETURNED_TO_VENDOR';
  } else {
    order.status = isCorrect ? 'VERIFIED' : 'ERROR_FOUND';
  }
  
  const logMsg = returnToVendor ? `Order ${order.orderNumber} dikembalikan ke Vendor.` : 
                (isCorrect ? `Order ${order.orderNumber} telah diverifikasi (LENGKAP).` : `Order ${order.orderNumber} ditemukan kesalahan/tidak lengkap.`);
  
  db.auditLogs.push({ id: uuidv4(), action: 'VERIFICATION', actor: req.user.username, timestamp: new Date().toISOString(), details: logMsg });
  
  res.json({ success: true, order });
});

// Send to AR (ISDR only)
app.post('/api/orders/:id/send-to-ar', authenticate, (req, res) => {
  if (req.user.role !== 'ISDR') return res.status(403).json({ error: 'Hanya ISDR yang dapat mengirim ke AR.' });
  
  const { id } = req.params;
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
  
  order.status = 'SENT_TO_ACCOUNTING';
  db.auditLogs.push({ id: uuidv4(), action: 'SEND_TO_AR', actor: req.user.username, timestamp: new Date().toISOString(), details: `Surat Jalan ${order.orderNumber} telah dikirim ke Departemen AR (Accounting).` });
  
  res.json({ success: true, order });
});

// Submit Doc
app.post('/api/documents/submit', authenticate, (req, res) => {
  const { orderId, documentData } = req.body;
  const doc = { id: uuidv4(), orderId, status: 'PENDING', uploadedAt: new Date().toISOString(), submittedBy: req.user.username, fileName: documentData.fileName };
  db.documents.push(doc);
  res.status(201).json({ success: true, document: doc });
});

app.get('/api/customers', (req, res) => res.json(db.customers));
app.get('/api/audit-logs', (req, res) => res.json(db.auditLogs.slice().reverse()));
app.get('/api/dashboard/summary', (req, res) => {
  res.json({ total: db.documents.length, pending: db.documents.filter(d => d.status === 'PENDING').length, orders: db.orders.length });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
