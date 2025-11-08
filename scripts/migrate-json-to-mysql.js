/* Migration: Import JSON files into MySQL tables */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function readJson(fp, fallback){
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return fallback; }
}

async function ensureSchema(conn){
  await conn.query(`CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(255) PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    role ENUM('user','creator') NOT NULL,
    creator_subscribed TINYINT(1) DEFAULT 0,
    creator_subscribed_until BIGINT NULL,
    created_at BIGINT NOT NULL
  )`);
  await conn.query(`CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    paid TINYINT(1) DEFAULT 0,
    paid_at BIGINT NULL,
    INDEX (email)
  )`);
  await conn.query(`CREATE TABLE IF NOT EXISTS movies (
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

async function main(){
  const engine = String(process.env.DB_ENGINE || 'mysql').toLowerCase();
  if (engine !== 'mysql') {
    throw new Error('This migration script is for MySQL only. Set DB_ENGINE=mysql in .env');
  }
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'FEDF_DATABASE',
    connectionLimit: 5
  };
  // Ensure database exists
  const bootstrap = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await bootstrap.end();
  }
  const pool = await mysql.createPool(cfg);
  const conn = await pool.getConnection();
  try {
    console.log('Ensuring schema...');
    await ensureSchema(conn);

    const dataDir = path.join(__dirname, '..', 'data');
    const usersPath = path.join(dataDir, 'users.json');
    const moviesPath = path.join(dataDir, 'movies.json');
    const ordersPath = path.join(dataDir, 'orders.json');

    const users = await readJson(usersPath, []);
    const movies = await readJson(moviesPath, []);
    const orders = await readJson(ordersPath, []);

    console.log(`Users to import: ${users.length}`);
    for (const u of users){
      const creatorSubscribed = u.creatorSubscribed ? 1 : 0;
      const creatorSubscribedUntil = u.creatorSubscribedUntil || null;
      const createdAt = u.createdAt || Date.now();
      await conn.query(
        `INSERT INTO users (email, password, role, creator_subscribed, creator_subscribed_until, created_at)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE password=VALUES(password), role=VALUES(role), creator_subscribed=VALUES(creator_subscribed), creator_subscribed_until=VALUES(creator_subscribed_until)`,
        [u.email, u.password, u.role, creatorSubscribed, creatorSubscribedUntil, createdAt]
      );
    }

    console.log(`Orders to import: ${orders.length}`);
    for (const o of orders){
      await conn.query(
        `INSERT INTO orders (email, paid, paid_at) VALUES (?,?,?)`,
        [o.email, o.paid ? 1 : 0, o.paidAt || o.paid_at || null]
      );
    }

    console.log(`Movies to import: ${movies.length}`);
    for (const m of movies){
      await conn.query(
        `INSERT INTO movies (id, title, description, category, poster, source_type, video_path, video_url, creator_email, created_at, approved)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), category=VALUES(category), poster=VALUES(poster), source_type=VALUES(source_type), video_path=VALUES(video_path), video_url=VALUES(video_url), creator_email=VALUES(creator_email), created_at=VALUES(created_at), approved=VALUES(approved)`,
        [m.id, m.title, m.description || '', m.category, m.poster || null, m.sourceType, m.videoPath || null, m.videoUrl || null, m.creatorEmail, m.createdAt || Date.now(), m.approved ? 1 : 0]
      );
    }

    console.log('Migration completed successfully.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
