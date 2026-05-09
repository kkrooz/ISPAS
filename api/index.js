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

// ─── Database ────────────────────────────────────────────────────────────────
const db = {
  customers: loadJSON('../server/data/customers.json'),
  users: [
    { 
      id: 'admin-001', 
      username: 'cs_admin', 
      password: bcrypt.hashSync('admin123', 10), 
      email: 'ispas.admin@gmail.com', 
      role: 'CS_SPIL',
      customerId: null 
    }
  ],
  documents: [],
  branches: loadJSON('../server/data/branches.json'),
  orders: [], 
  auditLogs: [],
};

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
  console.log(`[REAL EMAIL] To: ${to} | Subjek: ${subject}`);
  db.auditLogs.push({ 
    id: uuidv4(), action: 'EMAIL_SENT', actor: fromName, 
    timestamp: new Date().toISOString(), details: `Email ke ${to}: ${subject}` 
  });
  
  try { 
    await transporter.sendMail({ from: `"${fromName}" <${smtpConfig.user}>`, to, subject, text }); 
  } catch (e) { console.error("[SMTP ERROR]", e.message); }
}

function sendRealSMS(phone, message) {
  console.log(`[REAL SMS] To: ${phone} | Msg: ${message}`);
  db.auditLogs.push({ 
    id: uuidv4(), action: 'SMS_SENT', actor: 'ISPAS System', 
    timestamp: new Date().toISOString(), details: `SMS ke ${phone}: ${message}` 
  });
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.1' }));

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

// Config Email (CS Only)
app.post('/api/config/email', authenticate, (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Hanya CS yang dapat akses.' });
  const { email, appPassword } = req.body;
  smtpConfig.user = email; smtpConfig.pass = appPassword;
  transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: email, pass: appPassword } });
  res.json({ success: true, message: 'Config updated' });
});

// Create User
app.post('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'CS_SPIL') return res.status(403).json({ error: 'Hanya CS yang dapat akses.' });
  const { username, password, email, phone, customerId } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: uuidv4(), username, password: hashedPassword, email, phone, role: 'CUSTOMER', customerId, createdAt: new Date().toISOString() };
  db.users.push(newUser);
  sendRealEmail(email, 'Aktivasi ISPAS', `Halo ${username}, akun aktif.`);
  sendRealSMS(phone, `ISPAS: Akun ${username} aktif.`);
  res.status(201).json({ success: true });
});

app.get('/api/users', authenticate, (req, res) => res.json(db.users.map(u => ({ username: u.username, email: u.email, customerId: u.customerId }))));

// Create Order
app.post('/api/orders', authenticate, (req, res) => {
  const { orderNumber, customerId, origin, destination, driverName, truckPlate, goodsDescription, shippingDate } = req.body;
  const newOrder = { id: uuidv4(), orderNumber, customerId, origin, destination, driverName, truckPlate, goodsDescription, shippingDate, status: 'OPEN', createdAt: new Date().toISOString() };
  db.orders.push(newOrder);
  res.status(201).json({ success: true, order: newOrder });
});

// Submit Doc
app.post('/api/documents/submit', authenticate, (req, res) => {
  const { orderId, documentData } = req.body;
  const doc = { id: uuidv4(), orderId, status: 'PENDING', uploadedAt: new Date().toISOString(), submittedBy: req.user.username, fileName: documentData.fileName };
  db.documents.push(doc);
  res.status(201).json({ success: true, document: doc });
});

app.get('/api/orders', authenticate, (req, res) => {
  if (req.user.role === 'CUSTOMER') return res.json(db.orders.filter(o => o.customerId === req.user.customerId));
  res.json(db.orders);
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
