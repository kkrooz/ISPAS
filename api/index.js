/**
 * ISPAS - Integrated Smart Verification & Prescriptive Analytics System
 * Server utama untuk PT SPIL (Vercel version)
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── In-Memory Database ───────────────────────────────────────────────────────
// Paths updated to point to ../server/data
const db = {
  customers: require('../server/data/customers.json'),
  documents: [],
  branches: require('../server/data/branches.json'),
  escalations: [],
  auditLogs: [],
};

// ─── Utility: Hitung Confidence Score ────────────────────────────────────────
function calculateConfidenceScore(document, customerProfile) {
  let score = 100;
  const issues = [];

  for (const field of customerProfile.requiredFields) {
    if (!document.fields[field.key] || document.fields[field.key] === '') {
      score -= field.weight * 20;
      issues.push({ field: field.label, issue: 'Kosong / Tidak ditemukan', severity: 'HIGH' });
    } else if (field.format && !new RegExp(field.format).test(document.fields[field.key])) {
      score -= field.weight * 10;
      issues.push({ field: field.label, issue: `Format tidak sesuai (expected: ${field.formatLabel})`, severity: 'MEDIUM' });
    }
  }

  if (document.pageCount < customerProfile.minPages) {
    score -= 25;
    issues.push({
      field: 'Jumlah Halaman',
      issue: `Hanya ${document.pageCount} halaman, minimum ${customerProfile.minPages}`,
      severity: 'HIGH',
    });
  }

  if (customerProfile.requiresStamp && !document.hasStamp) {
    score -= 20;
    issues.push({ field: 'Stempel', issue: 'Stempel tidak terdeteksi', severity: 'HIGH' });
  }

  if (customerProfile.requiresSignature && !document.hasSignature) {
    score -= 20;
    issues.push({ field: 'Tanda Tangan', issue: 'Tanda tangan tidak terdeteksi', severity: 'HIGH' });
  }

  score = Math.max(0, score);

  let level = 'HIGH_CONFIDENCE';
  if (score < 70) level = 'LOW_CONFIDENCE';
  else if (score < 85) level = 'MEDIUM_CONFIDENCE';

  return { score, level, issues };
}

// ─── Utility: Hitung SLA Status ───────────────────────────────────────────────
function calculateSLAStatus(document, customerProfile) {
  const now = new Date();
  const uploadDate = new Date(document.uploadedAt);
  const slaDays = customerProfile.slaDays;
  const deadlineDate = new Date(uploadDate);
  deadlineDate.setDate(deadlineDate.getDate() + slaDays);

  const daysRemaining = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
  const daysElapsed = slaDays - daysRemaining;
  const percentUsed = Math.min(100, Math.round((daysElapsed / slaDays) * 100));

  let status = 'ON_TRACK';
  let escalationLevel = null;

  if (daysRemaining < 0) {
    status = 'BREACHED';
    escalationLevel = 'CRITICAL';
  } else if (daysRemaining <= 1) {
    status = 'CRITICAL';
    escalationLevel = 3;
  } else if (daysRemaining <= 3) {
    status = 'WARNING';
    escalationLevel = 2;
  } else if (daysRemaining <= 7) {
    status = 'ALERT';
    escalationLevel = 1;
  }

  return { daysRemaining, deadlineDate, percentUsed, status, escalationLevel };
}

// ─── Utility: Hitung VQI Branch ──────────────────────────────────────────────
function calculateVQI(branch) {
  const accuracy = branch.metrics.accuracyRate || 0;
  const speed = branch.metrics.avgCycleTimeDays
    ? Math.max(0, 100 - (branch.metrics.avgCycleTimeDays - 1) * 20)
    : 50;
  const slaCompliance = branch.metrics.slaComplianceRate || 0;
  const vqi = accuracy * 0.5 + speed * 0.3 + slaCompliance * 0.2;
  return Math.round(vqi);
}

// ─── API: Customer Profiles ───────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  res.json(db.customers);
});

app.get('/api/customers/:id', (req, res) => {
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer tidak ditemukan' });
  res.json(customer);
});

// ─── API: Submit Dokumen BA Balik ─────────────────────────────────────────────
app.post('/api/documents/submit', (req, res) => {
  const { customerId, branchId, documentData } = req.body;

  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) return res.status(400).json({ error: 'Customer tidak ditemukan' });

  const branch = db.branches.find((b) => b.id === branchId);
  if (!branch) return res.status(400).json({ error: 'Cabang tidak ditemukan' });

  const doc = {
    id: uuidv4(),
    customerId,
    branchId,
    customerName: customer.name,
    branchName: branch.name,
    status: 'PENDING_VERIFICATION',
    uploadedAt: new Date().toISOString(),
    fields: documentData.fields || {},
    pageCount: documentData.pageCount || 1,
    hasStamp: documentData.hasStamp || false,
    hasSignature: documentData.hasSignature || false,
    deliveryType: customer.deliveryType,
    trackingNumber: documentData.trackingNumber || null,
    verificationHistory: [],
  };

  const confidence = calculateConfidenceScore(doc, customer);
  const sla = calculateSLAStatus(doc, customer);

  doc.confidenceScore = confidence.score;
  doc.confidenceLevel = confidence.level;
  doc.validationIssues = confidence.issues;
  doc.slaStatus = sla;

  const vqi = calculateVQI(branch);
  let auditRequired = false;
  if (vqi < 70) auditRequired = Math.random() < 0.5;
  else if (vqi < 85) auditRequired = Math.random() < 0.15;
  else auditRequired = Math.random() < 0.05;

  doc.auditRequired = auditRequired;
  doc.branchVQI = vqi;

  db.documents.push(doc);

  db.auditLogs.push({
    id: uuidv4(),
    documentId: doc.id,
    action: 'DOCUMENT_SUBMITTED',
    actor: `VendorHUB - ${branch.name}`,
    timestamp: new Date().toISOString(),
    details: `Dokumen disubmit. Confidence: ${confidence.level} (${confidence.score}%)`,
  });

  res.status(201).json({
    success: true,
    document: doc,
    message: `Dokumen berhasil disubmit. Confidence Score: ${confidence.score}% (${confidence.level})`,
  });
});

// ─── API: Get All Documents ───────────────────────────────────────────────────
app.get('/api/documents', (req, res) => {
  const { branchId, status, confidenceLevel } = req.query;
  let docs = [...db.documents];

  if (branchId) docs = docs.filter((d) => d.branchId === branchId);
  if (status) docs = docs.filter((d) => d.status === status);
  if (confidenceLevel) docs = docs.filter((d) => d.confidenceLevel === confidenceLevel);

  docs = docs.map((doc) => {
    const customer = db.customers.find((c) => c.id === doc.customerId);
    if (customer) doc.slaStatus = calculateSLAStatus(doc, customer);
    return doc;
  });

  res.json(docs);
});

// ─── API: Verify Document ─────────────────────────────────────────────────────
app.post('/api/documents/:id/verify', (req, res) => {
  const { action, verifiedBy, notes } = req.body;
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

  const prevStatus = doc.status;

  if (action === 'APPROVE') {
    doc.status = 'VERIFIED';
    doc.verifiedAt = new Date().toISOString();
    doc.verifiedBy = verifiedBy;
    if (doc.deliveryType === 'DIGITAL') {
      doc.billingStatus = 'READY_TO_BILL';
      doc.billingTriggeredAt = new Date().toISOString();
    }
  } else if (action === 'REJECT') {
    doc.status = 'REJECTED';
    doc.rejectedAt = new Date().toISOString();
    doc.rejectionReason = notes;
  } else if (action === 'REQUEST_REVISION') {
    doc.status = 'REVISION_REQUESTED';
    doc.revisionRequestedAt = new Date().toISOString();
    doc.revisionNotes = notes;
  }

  doc.verificationHistory.push({
    action, actor: verifiedBy, timestamp: new Date().toISOString(), notes, fromStatus: prevStatus, toStatus: doc.status,
  });

  const branch = db.branches.find((b) => b.id === doc.branchId);
  if (branch) {
    branch.metrics.totalVerified = (branch.metrics.totalVerified || 0) + 1;
    if (action === 'APPROVE') {
      branch.metrics.approved = (branch.metrics.approved || 0) + 1;
      branch.metrics.accuracyRate = Math.round((branch.metrics.approved / branch.metrics.totalVerified) * 100);
    }
  }

  db.auditLogs.push({
    id: uuidv4(),
    documentId: doc.id,
    action: `DOCUMENT_${action}`,
    actor: verifiedBy,
    timestamp: new Date().toISOString(),
    details: notes || `Dokumen di-${action.toLowerCase()} oleh ${verifiedBy}`,
  });

  res.json({ success: true, document: doc });
});

// ─── API: Eskalasi SLA ────────────────────────────────────────────────────────
app.get('/api/escalations', (req, res) => {
  const escalations = [];
  db.documents
    .filter((d) => !['VERIFIED', 'REJECTED'].includes(d.status))
    .forEach((doc) => {
      const customer = db.customers.find((c) => c.id === doc.customerId);
      if (!customer) return;
      const sla = calculateSLAStatus(doc, customer);
      if (sla.escalationLevel) {
        escalations.push({
          documentId: doc.id,
          customerName: doc.customerName,
          branchName: doc.branchName,
          slaStatus: sla,
          escalationLevel: sla.escalationLevel,
          action: getEscalationAction(sla.escalationLevel),
          notifyTo: getEscalationTarget(sla.escalationLevel),
        });
      }
    });
  res.json(escalations.sort((a, b) => a.sla - b.sla));
});

function getEscalationAction(level) {
  const actions = {
    1: 'Notifikasi ke Verifikator Cabang & SPV via WhatsApp',
    2: 'Eskalasi ke Tim ISDR Pusat - Hubungi pelanggan penerima langsung',
    3: 'Eskalasi ke Finance & Account Manager - Pertimbangkan penagihan parsial',
    CRITICAL: 'PERINGATAN MANAJEMEN - SLA Terlampaui - Analisis Root Cause Diperlukan',
  };
  return actions[level] || 'Monitoring';
}

function getEscalationTarget(level) {
  const targets = {
    1: ['Verifikator Cabang', 'SPV Cabang'],
    2: ['Tim ISDR Pusat', 'SPV Regional'],
    3: ['Finance Manager', 'Account Manager'],
    CRITICAL: ['Direktur Operasional', 'CFO'],
  };
  return targets[level] || [];
}

// ─── API: Branch VQI & Metrics ────────────────────────────────────────────────
app.get('/api/branches', (req, res) => {
  const branches = db.branches.map((b) => ({
    ...b,
    vqi: calculateVQI(b),
    auditSampleRate: getAuditRate(calculateVQI(b)),
  }));
  res.json(branches);
});

function getAuditRate(vqi) {
  if (vqi >= 85) return 5;
  if (vqi >= 70) return 15;
  return 50;
}

// ─── API: Dashboard Summary ───────────────────────────────────────────────────
app.get('/api/dashboard/summary', (req, res) => {
  const docs = db.documents;
  const total = docs.length;
  const verified = docs.filter((d) => d.status === 'VERIFIED').length;
  const pending = docs.filter((d) => d.status === 'PENDING_VERIFICATION').length;
  const rejected = docs.filter((d) => d.status === 'REJECTED').length;
  const revision = docs.filter((d) => d.status === 'REVISION_REQUESTED').length;

  const highConf = docs.filter((d) => d.confidenceLevel === 'HIGH_CONFIDENCE').length;
  const medConf = docs.filter((d) => d.confidenceLevel === 'MEDIUM_CONFIDENCE').length;
  const lowConf = docs.filter((d) => d.confidenceLevel === 'LOW_CONFIDENCE').length;

  const activeDocs = docs.filter((d) => !['VERIFIED', 'REJECTED'].includes(d.status));
  const slaBreach = activeDocs.filter((d) => {
    const customer = db.customers.find((c) => c.id === d.customerId);
    if (!customer) return false;
    return calculateSLAStatus(d, customer).status === 'BREACHED';
  }).length;
  const slaCompliance = total > 0 ? Math.round(((total - slaBreach) / Math.max(total, 1)) * 100) : 100;

  res.json({
    total, verified, pending, rejected, revision,
    highConf, medConf, lowConf,
    slaBreach, slaCompliance,
    avgCycleTimeDays: 2.3,
    billingReady: docs.filter((d) => d.billingStatus === 'READY_TO_BILL').length,
  });
});

// ─── API: Audit Logs ──────────────────────────────────────────────────────────
app.get('/api/audit-logs', (req, res) => {
  res.json(db.auditLogs.slice().reverse().slice(0, 50));
});

// ─── Seed Documents (Demo Data) ───────────────────────────────────────────────
function seedDemoData() {
  const demoSubmissions = [
    { customerId: 'cust-001', branchId: 'branch-001', documentData: { fields: { noBatch: 'BTH-2024-001', expDate: '31/12/2025', noPO: 'PO-98765', jumlahBarang: '500' }, pageCount: 3, hasStamp: true, hasSignature: true, trackingNumber: 'JNE-789456' } },
    { customerId: 'cust-002', branchId: 'branch-002', documentData: { fields: { noPO: 'PO-11223', jumlahBarang: '1200', namaBarang: 'Sabun Cuci Piring' }, pageCount: 1, hasStamp: true, hasSignature: false } },
    { customerId: 'cust-003', branchId: 'branch-003', documentData: { fields: { noPO: 'PO-33445', jumlahBarang: '300', tipeMesin: 'CNC-X200' }, pageCount: 2, hasStamp: false, hasSignature: true } },
    { customerId: 'cust-001', branchId: 'branch-001', documentData: { fields: { noBatch: '', expDate: '13-25-2025', noPO: '', jumlahBarang: '250' }, pageCount: 2, hasStamp: false, hasSignature: false } },
  ];

  demoSubmissions.forEach((sub) => {
    const customer = db.customers.find((c) => c.id === sub.customerId);
    const branch = db.branches.find((b) => b.id === sub.branchId);
    if (!customer || !branch) return;

    const doc = {
      id: uuidv4(), ...sub, customerName: customer.name, branchName: branch.name,
      status: 'PENDING_VERIFICATION',
      uploadedAt: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString(),
      deliveryType: customer.deliveryType,
      verificationHistory: [],
      trackingNumber: sub.documentData.trackingNumber || null,
      fields: sub.documentData.fields, pageCount: sub.documentData.pageCount,
      hasStamp: sub.documentData.hasStamp, hasSignature: sub.documentData.hasSignature,
    };

    const confidence = calculateConfidenceScore(doc, customer);
    const sla = calculateSLAStatus(doc, customer);
    doc.confidenceScore = confidence.score;
    doc.confidenceLevel = confidence.level;
    doc.validationIssues = confidence.issues;
    doc.slaStatus = sla;
    doc.branchVQI = calculateVQI(branch);
    doc.auditRequired = Math.random() < 0.2;

    db.documents.push(doc);
  });
}

seedDemoData();

// ─── Serve Frontend (Local Dev) ───────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Start Server ─────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server berjalan di: http://localhost:${PORT}`);
  });
}

module.exports = app;
