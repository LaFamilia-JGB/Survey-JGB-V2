import dotenv from "dotenv";
import pkg from "pg";

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 🟡 רשימת היוזרים עם שם בעברית
const displayNames = {
  avrahamm: "אברהם מזרחי",
  orele: "אוראל אליהו",
  oriv: "אורי ורדה",
  eyals: "אייל סטרוק",
  itayk: "איתי קופקין",
  eliavl: "אליאב לולו",
  elias: "אליה שמואל",
  benm: "בן מורי",
  bens: "בן שמואל",
  bars: "בר שמואל",
  dvirb: "דביר בן נחום",
  dvirs: "דביר שלמה",
  davidy: "דוד יוסף",
  zive: "זיו אפי",
  yuvali: "יובל אילוביץ",
  yohaib: "יוחאי ביסראור",
  yonil: "יוני חי לוי",
  jhonatanv: "יונתן וגט",
  yossiz: "יוסי זיגדון",
  yiftacht: "יפתח תורגמן",
  liamm: "ליאם מסיקה",
  matand: "מתן דיין",
  matanz: "מתן צדיק",
  noams: "נועם סהר",
  omera: "עומר אביצדק",
  idom: "עידו מלול",
  roeeh: "רועי חזן",
  shayelc: "שיאל כדורי"
};

async function updateDisplayNames() {
  try {
    for (const [username, displayName] of Object.entries(displayNames)) {
      const result = await pool.query(
        "UPDATE members SET display_name = $1 WHERE username = $2",
        [displayName, username]
      );
      if (result.rowCount > 0) {
        console.log(`✅ עודכן: ${username} → ${displayName}`);
      } else {
        console.log(`⚠️ לא נמצא יוזר: ${username}`);
      }
    }
  } catch (err) {
    console.error("❌ Error updating display names:", err);
  } finally {
    await pool.end();
  }
}

updateDisplayNames();
