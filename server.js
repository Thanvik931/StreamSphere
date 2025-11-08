const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'data') : path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const USE_DB = !!process.env.DATABASE_URL;
const USE_MYSQL = String(process.env.DB_ENGINE || '').toLowerCase() === 'mysql';
let pool = null;
async function initDb() {
  if (!USE_DB) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    creator_subscribed BOOLEAN DEFAULT false,
    creator_subscribed_until BIGINT,
    created_at BIGINT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    paid BOOLEAN DEFAULT false,
    paid_at BIGINT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    poster TEXT,
    source_type TEXT NOT NULL,
    video_path TEXT,
    video_url TEXT,
    creator_email TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    approved BOOLEAN DEFAULT true
  )`);
}

function toUserRow(u){
  return { email: u.email, password: u.password, role: u.role, creatorSubscribed: !!u.creator_subscribed, creatorSubscribedUntil: u.creator_subscribed_until };
}

// MySQL support
let mypool = null;
async function initMySQL() {
  if (!USE_MYSQL) return;
  if (mypool) return;
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'FEDF_DATABASE';

  // First, connect without database and ensure DB exists
  const bootstrap = await mysql.createConnection({ host, port, user, password });
  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await bootstrap.end();
  }

  mypool = await mysql.createPool({
    host, port, user, password, database: dbName, connectionLimit: 10
  });
  await mypool.query(`CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(255) PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    role ENUM('user','creator') NOT NULL,
    creator_subscribed TINYINT(1) DEFAULT 0,
    creator_subscribed_until BIGINT NULL,
    created_at BIGINT NOT NULL
  )`);
  await mypool.query(`CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    paid TINYINT(1) DEFAULT 0,
    paid_at BIGINT NULL,
    INDEX (email)
  )`);
  await mypool.query(`CREATE TABLE IF NOT EXISTS movies (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category ENUM('movie','webseries','sports') NOT NULL,
    poster VARCHAR(512) NULL,
    source_type ENUM('file','url') NOT NULL,
    video_path VARCHAR(512) NULL,
    video_url VARCHAR(1024) NULL,
    creator_email VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    approved TINYINT(1) DEFAULT 1,
    INDEX (creator_email),
    INDEX (created_at)
  )`);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || ''); } catch (_) { return fallback; }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
if (!fs.existsSync(MOVIES_FILE)) writeJson(MOVIES_FILE, []);
if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/', express.static(__dirname));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

const S3_ENABLED = !!process.env.S3_BUCKET;
let s3 = null;
if (S3_ENABLED) {
  s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1', credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } : undefined });
}

app.post('/api/s3/presign', async (req, res) => {
  if (!S3_ENABLED) return res.status(404).json({ error: 'S3 not configured' });
  const { type, filename, contentType } = req.body || {};
  if (!type || !filename || !contentType) return res.status(400).json({ error: 'Missing fields' });
  const ext = path.extname(filename || '').toLowerCase();
  const key = `${type}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
  try {
    const cmd = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    const publicBase = process.env.S3_PUBLIC_BASE || `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;
    const publicUrl = `${publicBase}/${key}`;
    res.json({ ok: true, url, key, publicUrl });
  } catch (e) {
    res.status(500).json({ error: 'Presign failed' });
  }
});

async function findUser(email) {
  if (USE_MYSQL) {
    await initMySQL();
    const [rows] = await mypool.query('SELECT email, password, role, creator_subscribed, creator_subscribed_until FROM users WHERE email=?', [email]);
    const r = rows[0];
    return r ? { email: r.email, password: r.password, role: r.role, creatorSubscribed: !!r.creator_subscribed, creatorSubscribedUntil: r.creator_subscribed_until } : undefined;
  }
  if (USE_DB) {
    const r = await pool.query('SELECT email, password, role, creator_subscribed, creator_subscribed_until FROM users WHERE email=$1', [email]);
    return r.rows[0] ? toUserRow(r.rows[0]) : undefined;
  }
  const users = readJson(USERS_FILE, []);
  return users.find(u => u.email === email);
}
async function saveUser(user) {
  if (USE_MYSQL) {
    await initMySQL();
    await mypool.query(
      `INSERT INTO users (email, password, role, creator_subscribed, creator_subscribed_until, created_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE password=VALUES(password), role=VALUES(role), creator_subscribed=VALUES(creator_subscribed), creator_subscribed_until=VALUES(creator_subscribed_until)`,
      [user.email, user.password, user.role, user.creatorSubscribed ? 1 : 0, user.creatorSubscribedUntil || null, user.createdAt]
    );
    return user;
  }
  if (USE_DB) {
    await pool.query(
      `INSERT INTO users (email, password, role, creator_subscribed, creator_subscribed_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET password=EXCLUDED.password, role=EXCLUDED.role, creator_subscribed=EXCLUDED.creator_subscribed, creator_subscribed_until=EXCLUDED.creator_subscribed_until`,
      [user.email, user.password, user.role, !!user.creatorSubscribed, user.creatorSubscribedUntil || null, user.createdAt]
    );
    return user;
  }
  const users = readJson(USERS_FILE, []);
  const idx = users.findIndex(u => u.email === user.email);
  if (idx >= 0) users[idx] = user; else users.push(user);
  writeJson(USERS_FILE, users);
  return user;
}

app.post('/api/register', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  const e = String(email).toLowerCase();
  const existing = await findUser(e);
  if (existing) return res.status(409).json({ error: 'User exists' });
  let creatorSubscribed = false;
  let creatorSubscribedUntil = undefined;
  if (role === 'creator') {
    if (USE_MYSQL) {
      await initMySQL();
      const [rows] = await mypool.query('SELECT paid, paid_at FROM orders WHERE email=? AND paid=1 LIMIT 1', [e]);
      const paid = rows && rows[0];
      if (paid) {
        creatorSubscribed = true;
        const paidAt = paid.paid_at || Date.now();
        creatorSubscribedUntil = paidAt + 30*24*60*60*1000;
      }
    } else if (USE_DB) {
      const or = await pool.query('SELECT paid, paid_at FROM orders WHERE email=$1 AND paid=true LIMIT 1', [e]);
      const paid = or.rows[0];
      if (paid) {
        creatorSubscribed = true;
        const paidAt = paid.paid_at || Date.now();
        creatorSubscribedUntil = paidAt + 30*24*60*60*1000;
      }
    } else {
      const orders = readJson(ORDERS_FILE, []);
      const paid = orders.find(o => (o.email === e) && o.paid === true);
      if (paid) {
        creatorSubscribed = true;
        const paidAt = paid.paidAt || Date.now();
        creatorSubscribedUntil = paidAt + 30*24*60*60*1000;
      }
    }
  }
  const user = { email: e, password, role, creatorSubscribed, creatorSubscribedUntil, createdAt: Date.now() };
  await saveUser(user);
  res.json({ ok: true, user: { email: user.email, role: user.role, creatorSubscribed: user.creatorSubscribed, creatorSubscribedUntil: user.creatorSubscribedUntil } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const e = String(email||'').toLowerCase();
  const user = await findUser(e);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, user: { email: user.email, role: user.role, creatorSubscribed: user.creatorSubscribed, creatorSubscribedUntil: user.creatorSubscribedUntil } });
});

app.post('/api/movies', upload.fields([{ name: 'poster', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const { email, title, videoUrl, category, description, posterUrl } = req.body;
  if (!email || !title) return res.status(400).json({ error: 'Missing fields' });
  const user = await findUser(String(email).toLowerCase());
  if (!user || user.role !== 'creator') return res.status(403).json({ error: 'Not a creator' });

  const usingJsonUrls = !!(posterUrl || videoUrl);
  const posterFile = usingJsonUrls ? null : (req.files && req.files.poster && req.files.poster[0]);
  const videoFile = usingJsonUrls ? null : (req.files && req.files.video && req.files.video[0]);

  const record = {
    id: 'mv_' + Date.now(),
    title,
    description: description || '',
    category: ['movie','webseries','sports'].includes((category||'').toLowerCase()) ? category.toLowerCase() : 'movie',
    poster: posterFile ? ('/uploads/' + posterFile.filename) : (posterUrl || null),
    sourceType: videoFile ? 'file' : 'url',
    videoPath: videoFile ? ('/uploads/' + videoFile.filename) : null,
    videoUrl: videoFile ? null : (videoUrl || null),
    creatorEmail: user.email,
    createdAt: Date.now(),
    approved: true
  };
  if (process.env.VERCEL && !usingJsonUrls) {
    return res.status(400).json({ error: 'Provide S3 URLs for posterUrl/videoUrl on this deployment' });
  }
  if (USE_MYSQL) {
    await initMySQL();
    await mypool.query(
      `INSERT INTO movies (id, title, description, category, poster, source_type, video_path, video_url, creator_email, created_at, approved)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [record.id, record.title, record.description, record.category, record.poster, record.sourceType, record.videoPath, record.videoUrl, record.creatorEmail, record.createdAt, record.approved ? 1 : 0]
    );
  } else if (USE_DB) {
    await pool.query(
      `INSERT INTO movies (id, title, description, category, poster, source_type, video_path, video_url, creator_email, created_at, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [record.id, record.title, record.description, record.category, record.poster, record.sourceType, record.videoPath, record.videoUrl, record.creatorEmail, record.createdAt, record.approved]
    );
  } else {
    const movies = readJson(MOVIES_FILE, []);
    movies.push(record);
    writeJson(MOVIES_FILE, movies);
  }
  res.json({ ok: true, movie: record });
});

app.get('/api/movies/public', async (req, res) => {
  if (USE_MYSQL) {
    await initMySQL();
    const [rows] = await mypool.query('SELECT id, title, description, category, poster, source_type, video_path, video_url, creator_email, created_at, approved FROM movies WHERE approved=1 ORDER BY created_at DESC');
    const movies = rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      category: row.category,
      poster: row.poster,
      sourceType: row.source_type,
      videoPath: row.video_path,
      videoUrl: row.video_url,
      creatorEmail: row.creator_email,
      createdAt: row.created_at,
      approved: !!row.approved
    }));
    return res.json({ ok: true, movies });
  }
  if (USE_DB) {
    const r = await pool.query('SELECT id, title, description, category, poster, source_type, video_path, video_url, creator_email, created_at, approved FROM movies WHERE approved=true ORDER BY created_at DESC');
    const movies = r.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      category: row.category,
      poster: row.poster,
      sourceType: row.source_type,
      videoPath: row.video_path,
      videoUrl: row.video_url,
      creatorEmail: row.creator_email,
      createdAt: row.created_at,
      approved: row.approved
    }));
    return res.json({ ok: true, movies });
  }
  const movies = readJson(MOVIES_FILE, []);
  res.json({ ok: true, movies: movies.filter(m => m.approved) });
});

if (require.main === module) {
  initDb().catch(err => { console.error('DB init failed', err); });
  initMySQL().catch(err => { console.error('MySQL init failed', err); });
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.\n` +
        `On Windows PowerShell you can find and stop the process using:\n` +
        `  netstat -ano | findstr :${PORT}\n` +
        `  taskkill /PID <PID> /F\n` +
        `Or start the app on a different port: set PORT=3001; npm start`);
      process.exit(1);
    }
    throw err;
  });
}

module.exports = app;
