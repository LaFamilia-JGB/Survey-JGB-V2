// init-users.js
import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// רשימת אדמינים
const ADMIN_LIST = [
  "roeeh", "bars", "bens", "dvirb", "yuvali", "jhonatanv", "yossiz", "liamm", "omera"
];

// רשימת יוזרים רגילים
const USER_LIST = [
  "avrahamm", "orele", "oriv", "eyals", "itayk",
  "eliavl", "elias", "benm", "dvirs", "davidy",
  "zive", "yohaib", "yonil", "yiftacht",
  "matand", "matanz", "noams", "idom", "shayelc"
];

async function initUsers() {
  try {
    // הכנסה של כל האדמינים
    for (const u of ADMIN_LIST) {
      await pool.query(
        `INSERT INTO members (username, salt, password_hash, role, active, display_name)
         VALUES ($1, '', $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING`,
        [u, u + "1936", "admin", true, u]
      );
      console.log("✅ Added admin:", u);
    }

    // הכנסה של כל המשתמשים הרגילים
    for (const u of USER_LIST) {
      await pool.query(
        `INSERT INTO members (username, salt, password_hash, role, active, display_name)
         VALUES ($1, '', $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING`,
        [u, u + "11", "user", true, u]
      );
      console.log("✅ Added user:", u);
    }

    console.log("🎉 All users inserted successfully!");
  } catch (err) {
    console.error("❌ Error inserting users:", err);
  } finally {
    await pool.end();
  }
}

initUsers();
