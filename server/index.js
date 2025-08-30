const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================== HEALTH ==================
app.get("/api/healthz", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ================== DB ==================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ================== HELPERS ==================
function toHHMM(t) {
    if (!t) return "";
    const s = String(t);
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
}

function toYYYYMMDD(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function normalizeOptions(raw) {
    let arr = [];
    try {
        if (!raw) arr = [];
        else if (Array.isArray(raw)) arr = raw;
        else if (typeof raw === "object") arr = [raw];
        else arr = JSON.parse(raw);
    } catch {
        const parts = String(raw).split(",").map(x => x.trim()).filter(Boolean);
        arr = parts.map(p => ({ text: p, requireNote: false }));
    }
    arr = arr.map(o =>
        (typeof o === "string")
            ? { text: o, requireNote: false }
            : { text: String(o.text || ""), requireNote: !!o.requireNote }
    );
    return { arr, json: JSON.stringify(arr) };
}

// 🟡 Debug – כל המשימות ישירות מה־DB
app.get("/api/tasks", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM tasks ORDER BY id DESC");
        res.json({ success: true, tasks: result.rows });
    } catch (err) {
        console.error("❌ /api/tasks error:", err);
        res.json({ success: false, error: err.message });
    }
});


// ================== HEALTH ==================
app.get("/api/test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ success: true, time: result.rows[0] });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ================== TASKS ==================
app.post("/api/getInitData", async (req, res) => {
  try {
    // ברירת מחדל: user
    let role = "user";
    try {
      const token = req.body?.token;
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query("SELECT role FROM members WHERE id=$1", [decoded.id]);
        if (userResult.rows.length) {
          role = userResult.rows[0].role;
        }
      }
    } catch (_) {}

    const [tasksResult, membersResult] = await Promise.all([
      pool.query("SELECT id, task_name, task_date, task_time, options, notes FROM tasks ORDER BY task_date NULLS LAST, task_time NULLS LAST"),
      pool.query("SELECT username, display_name FROM members WHERE active = true ORDER BY id")
    ]);

    const tasks = tasksResult.rows.map(r => {
      const { json } = normalizeOptions(r.options);
      return {
        id: r.id,
        "משימה": r.task_name || "",
        "תאריך": toYYYYMMDD(r.task_date),
        "שעה": toHHMM(r.task_time),
        "אפשרויות": json,
        "דגשים": r.notes || ""
      };
    });

    const members = membersResult.rows.map(m => m.display_name || m.username);

    if (role === "admin") {
      // 🔑 אדמין מקבל הכל
      const responsesResult = await pool.query(`
        SELECT r.id, r.task_id, r.member_name, r.status, r.note,
               t.task_name, t.task_date, t.task_time
        FROM responses r
        JOIN tasks t ON r.task_id = t.id
      `);

      const responses = responsesResult.rows.map(r => ({
        "משימה": r.task_name,
        "תאריך": toYYYYMMDD(r.task_date),
        "שעה": toHHMM(r.task_time),
        "סטטוס": r.status,
        "שם": r.member_name,
        "הערה": r.note || ""
      }));

      return res.json({ success: true, role, tasks, members, responses });
    } else {
      // 🔑 יוזר רגיל מקבל סיכום מצומצם
      const summaryResult = await pool.query(`
        SELECT t.task_name, t.task_date, t.task_time, r.status, COUNT(*) as count
        FROM responses r
        JOIN tasks t ON r.task_id = t.id
        GROUP BY t.task_name, t.task_date, t.task_time, r.status
      `);

      // ✅ החזרת responseCounts ו-responseCountsByDay (לשני המצבים בפרונט)
      const responseCounts = summaryResult.rows.map(r => ({
        "משימה": r.task_name,
        "תאריך": toYYYYMMDD(r.task_date),
        "שעה": toHHMM(r.task_time),
        "סטטוס": r.status,
        "count": Number(r.count)
      }));

      const responseCountsByDay = summaryResult.rows.map(r => ({
        "משימה": r.task_name,
        "תאריך": toYYYYMMDD(r.task_date),
        "סטטוס": r.status,
        "count": Number(r.count)
      }));

      return res.json({ success: true, role, tasks, members, responseCounts, responseCountsByDay });
    }
  } catch (err) {
    console.error("❌ getInitData error:", err);
    res.json({ success: false, error: err.message });
  }
});


app.post("/api/addTask", async (req, res) => {
    try {
        const { משימה, תאריך, שעה, אפשרויות, דגשים, task_name, task_date, task_time, options, notes } = req.body;

        const name = משימה || task_name || "";
        const date = תאריך || task_date || "";
        const time = שעה || task_time || "";
        const rawOptions = אפשרויות || options || "[]";
        const extraNotes = דגשים || notes || "";

        const { json } = normalizeOptions(rawOptions);

        await pool.query(
            "INSERT INTO tasks (task_name, task_date, task_time, options, notes) VALUES ($1,$2,$3,$4,$5)",
            [name, date, time, json, extraNotes]
        );

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});


app.post("/api/removeTask", async (req, res) => {
    try {
        let task = req.body.task || req.body["משימה"];
        let date = req.body.date || req.body["תאריך"];
        let time = req.body.time || req.body["שעה"];

        // 🟡 תמיכה במקרה שהגיע nested
        if (typeof task === "object" && task.task) {
            date = task.date || date;
            time = task.time || time;
            task = task.task;
        }

        console.log("🗑️ removeTask normalized:", { task, date, time });

        if (!task || !date) {
            return res.json({ success: false, error: "Missing task/date" });
        }

        let query, params;
        if (time) {
            if (time.length === 5) time = time + ":00"; // להבטיח פורמט HH:mm:ss
            query = "DELETE FROM tasks WHERE task_name=$1 AND task_date=$2 AND task_time=$3";
            params = [task, date, time];
        } else {
            // 🟡 אם אין שעה – מחיקה של כל המשימות לאותו יום
            query = "DELETE FROM tasks WHERE task_name=$1 AND task_date=$2";
            params = [task, date];
        }

        const result = await pool.query(query, params);

        console.log("🗑️ removeTask deleted:", result.rowCount);

        res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
        console.error("❌ removeTask error:", err);
        res.json({ success: false, error: err.message });
    }
});

app.post("/api/updateTask", async (req, res) => {
    try {
        let {
            oldTask, oldDate, oldTime,
            newTask, newDate, newTime,
            options, notes
        } = req.body;

        if (typeof oldTask === "object" && oldTask.task) {
            oldDate = oldTask.date || oldDate;
            oldTime = oldTask.time || oldTime;
            oldTask = oldTask.task;
        }

        if (!oldTask || !oldDate) {
            return res.json({ success: false, error: "Missing oldTask/oldDate" });
        }

        if (newTime && newTime.length === 5) newTime += ":00";
        if (oldTime && oldTime.length === 5) oldTime += ":00";

        // ✅ הגנה – אם options לא קיים נחזיר "[]"
        const { json } = normalizeOptions(options || "[]");

        let query, params;
        if (oldTime) {
            query = `
        UPDATE tasks 
        SET task_name=$1, task_date=$2, task_time=$3, options=$4, notes=$5
        WHERE task_name=$6 AND task_date=$7 AND task_time=$8
      `;
            params = [
                newTask || oldTask,
                newDate || oldDate,
                newTime || oldTime,
                json,
                notes || "",
                oldTask,
                oldDate,
                oldTime
            ];
        } else {
            query = `
        UPDATE tasks 
        SET task_name=$1, task_date=$2, task_time=COALESCE($3, task_time), options=$4, notes=$5
        WHERE task_name=$6 AND task_date=$7
      `;
            params = [
                newTask || oldTask,
                newDate || oldDate,
                newTime || null,
                json,
                notes || "",
                oldTask,
                oldDate
            ];
        }

        const result = await pool.query(query, params);

        // ✅ נחזיר אובייקט ברור ולא undefined
        return res.json({
            success: true,
            updated: result.rowCount,
            newTask: newTask || oldTask,
            newDate: newDate || oldDate,
            newTime: newTime || oldTime,
        });

    } catch (err) {
        console.error("❌ updateTask error:", err);
        return res.json({ success: false, error: err.message });
    }
});

// ================== RESPONSES ==================
app.post("/api/postResponse", async (req, res) => {
    try {
        const task = req.body.task || req.body["משימה"];
        const date = req.body.date || req.body["תאריך"];
        const time = req.body.time || req.body["שעה"];
        const status = req.body.status || req.body["סטטוס"];
        const note = req.body.note || req.body["הערה"];
        const member = req.body.member || req.body["שם"];

        if (!task || !date || !member || !status) {
            return res.status(400).json({ success: false, error: "Missing fields", debug: req.body });
        }

        const taskRes = await pool.query(
            "SELECT id FROM tasks WHERE task_name=$1 AND task_date=$2 AND (task_time=$3 OR $3 IS NULL) LIMIT 1",
            [task, date, time || null]
        );
        if (taskRes.rows.length === 0) return res.json({ success: false, error: "Task not found" });

        const taskId = taskRes.rows[0].id;

        await pool.query(
            `INSERT INTO responses (task_id, member_name, status, note)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (task_id, member_name)
       DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
            [taskId, member, status, note || ""]
        );

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ================== MEMBERS ==================
app.post("/api/getMembers", async (req, res) => {
    try {
        const result = await pool.query("SELECT username, display_name FROM members WHERE active = true ORDER BY username");
        res.json({ success: true, members: result.rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post("/api/addMember", async (req, res) => {
    const { username, display_name } = req.body;
    if (!username || !display_name) return res.json({ success: false, error: "Missing username/display_name" });

    try {
        const result = await pool.query(
            "INSERT INTO members (username, display_name, password_hash, role, active) VALUES ($1,$2,$3,'user',true) RETURNING *",
            [username.toLowerCase(), display_name, username.toLowerCase() + "11"]
        );
        res.json({ success: true, member: result.rows[0] });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post("/api/removeMember", async (req, res) => {
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: "Missing username" });

    try {
        const result = await pool.query("DELETE FROM members WHERE username=$1", [username.toLowerCase()]);
        res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ================== AUTH ==================
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: "Missing username/password" });

    try {
        const result = await pool.query("SELECT * FROM members WHERE username = $1 AND active = true", [username.toLowerCase()]);
        if (result.rows.length === 0) return res.json({ success: false, error: "User not found" });

        const user = result.rows[0];
        const valid = password === user.password_hash;
        if (!valid) return res.json({ success: false, error: "Invalid password" });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "6h" });

        res.json({
            success: true,
            token,
            role: user.role,
            username: user.username,
            displayName: user.display_name || user.username
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post("/api/me", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false, error: "No token" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query("SELECT id, username, role, display_name FROM members WHERE id = $1", [decoded.id]);
        if (result.rows.length === 0) return res.json({ success: false, error: "User not found" });

        const user = result.rows[0];
        res.json({ success: true, username: user.username, role: user.role, displayName: user.display_name });
    } catch {
        res.json({ success: false, error: "Invalid token" });
    }
});

app.post("/api/logout", (req, res) => {
    res.json({ success: true });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});