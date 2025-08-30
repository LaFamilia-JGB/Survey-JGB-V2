import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🟢 Health Check endpoint
app.get("/api/healthz", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// חיבור ל-Neon (Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// בריאות השרת מול DB
app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ ok: true, time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// מאזינים
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
