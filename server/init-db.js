import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        task_name TEXT NOT NULL,
        task_date DATE NOT NULL,
        task_time TIME,
        options JSONB DEFAULT '[]',
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
        response_date DATE,
        response_time TIME,
        member_name TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        display_name TEXT,
        active BOOLEAN DEFAULT TRUE
      );
    `);

    console.log("✅ Tables created successfully!");
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  } finally {
    pool.end();
  }
}

init();
