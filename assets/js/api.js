/* ============================================================
 * API לקוח (JSONP) עבור Google Apps Script Web App
 * ============================================================ */

/** 🔗 כתובת ה-Web App (ה-URL מה-Deploy של Apps Script) */
const API_BASE = "https://script.google.com/macros/s/AKfycbykPEuRnDCMgzy9gwXEdEXXrZHR3CXslTZlXdwGRuJIAb6FKpyZJcyQuqAd7uEKSV9v/exec";

/* ======================= JSONP helper ======================= */
function _jsonp(action, data = {}, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = "jsonp_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    const cleanup = (script, timer) => {
      try { delete window[cb]; } catch { }
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    window[cb] = (payload) => {
      cleanup(script, timer);
      resolve(payload);
    };

    const params = new URLSearchParams();
    params.set("action", action);
    params.set("callback", cb);
    if (data && Object.keys(data).length) params.set("body", JSON.stringify(data));

    // מניעת קאש ע"י ts
    const script = document.createElement("script");
    script.src = `${API_BASE}?${params.toString()}&ts=${Date.now()}`;
    script.async = true;
    script.onerror = () => { cleanup(script, timer); reject(new Error("JSONP network error")); };

    const timer = setTimeout(() => { cleanup(script, timer); reject(new Error("JSONP timeout")); }, timeoutMs);
    document.head.appendChild(script);
  });
}

/* ======================= Auth (localStorage) ======================= */
const Auth = {
  get token() { try { return localStorage.getItem("token") || ""; } catch { return ""; } },
  set token(v) { try { v ? localStorage.setItem("token", v) : localStorage.removeItem("token"); } catch { } },

  get role() { try { return localStorage.getItem("role") || "guest"; } catch { return "guest"; } },
  set role(v) { try { v ? localStorage.setItem("role", v) : localStorage.removeItem("role"); } catch { } },

  get username() { try { return localStorage.getItem("username") || ""; } catch { return ""; } },
  set username(v) { try { v ? localStorage.setItem("username", v) : localStorage.removeItem("username"); } catch { } },

  get displayName() { try { return localStorage.getItem("displayName") || ""; } catch { return ""; } },
  set displayName(v) { try { v ? localStorage.setItem("displayName", v) : localStorage.removeItem("displayName"); } catch { } },
};

/* ======================= עזרי קאש ======================= */
// קאש לפי תפקיד כדי לא "לדלוף" נתונים בין admin/user/guest
const INITCACHE_TTL_MS = 120 * 1000; // 120 שניות
function _initCacheKey() { return `initDataCache_v1_role_${Auth.role || "guest"}`; }

function _readInitCache() {
  try {
    const raw = localStorage.getItem(_initCacheKey());
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.data) return null;
    if (Date.now() - obj.ts > INITCACHE_TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}
function _writeInitCache(data) {
  try { localStorage.setItem(_initCacheKey(), JSON.stringify({ ts: Date.now(), data })); } catch { }
}
function _invalidateAllInitCaches() {
  ["guest", "user", "admin"].forEach(r => {
    try { localStorage.removeItem(`initDataCache_v1_role_${r}`); } catch { }
  });
}

/* ======================= עזרי נרמול ======================= */
function _normOptions(field) {
  if (!field) return "[]";
  if (Array.isArray(field)) {
    return JSON.stringify(field.map(it =>
      (typeof it === "string")
        ? ({ text: it, requireNote: false })
        : ({ text: String(it.text || ""), requireNote: !!it.requireNote })
    ));
  }
  const s = String(field).trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      return JSON.stringify(arr.map(it =>
        (typeof it === "string")
          ? ({ text: it, requireNote: false })
          : ({ text: String(it.text || ""), requireNote: !!it.requireNote })
      ));
    } catch {
      // ניפול לפורמט פסיקים
    }
  }
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  return JSON.stringify(parts.map(p => ({ text: p, requireNote: false })));
}

/* ======================= עטיפת קריאה שמזריקה token ======================= */
function _call(action, body = {}, opts) {
  if (Auth.token) body.token = Auth.token;
  return _jsonp(action, body, opts);
}

/* ======================= API ציבורי ======================= */
const API = (() => {
  /* ---- Auth ---- */
  async function login(username, password) {
    const r = await _jsonp("login", { username, password });
    if (!r?.success) throw new Error(r?.error || "login failed");
    Auth.token = r.token || "";
    Auth.role = r.role || "user";
    Auth.username = r.username || username || "";
    Auth.displayName = r.displayName || r.fullName || "";
    _invalidateAllInitCaches();
    return r;
  }

  async function me() {
    if (!Auth.token) return { success: false, error: "no token" };
    const r = await _jsonp("me", { token: Auth.token });
    if (r?.success) {
      Auth.role = r.role || Auth.role || "guest";
      Auth.username = r.username || Auth.username || "";
      Auth.displayName = r.displayName || r.fullName || Auth.displayName || "";
    } else {
      Auth.token = ""; Auth.role = "guest"; Auth.username = ""; Auth.displayName = "";
      _invalidateAllInitCaches();
    }
    return r;
  }

  async function logout() {
    const t = Auth.token;
    try { if (t) await _jsonp("logout", { token: t }); } catch { }
    Auth.token = ""; Auth.role = "guest"; Auth.username = ""; Auth.displayName = "";
    _invalidateAllInitCaches();
    return true;
  }

  /* ---- Data ---- */
  async function getInitData({ force = false } = {}) {
    if (!force) {
      const cached = _readInitCache();
      if (cached) return cached;
    }

    const resp = await _call("getInitData", {}); // השרת מחלץ token מה-body
    if (resp && !resp.error) {
      // עדכון פרטי משתמש אם חזרו
      if (resp.role) Auth.role = resp.role;
      if (resp.username) Auth.username = resp.username;
      if (resp.displayName) Auth.displayName = resp.displayName;

      // ודא ששדה "אפשרויות" הוא תמיד מחרוזת JSON אחידה
      if (Array.isArray(resp.tasks)) {
        resp.tasks = resp.tasks.map(t => ({
          ...t,
          "אפשרויות": _normOptions(t["אפשרויות"])
        }));
      }
      _writeInitCache(resp);
      return resp;
    }

    // fallback לקאש הישן אם יש
    const fb = _readInitCache();
    if (fb) return fb;
    throw new Error(resp?.error || "Failed to load init data");
  }

  /* ---- Mutations (מנקים קאש אוטומטית על הצלחה) ---- */
  async function addTask(taskObjOrName, date, time, options, notes) {
    let payload;
    if (typeof taskObjOrName === "object") {
      const t = taskObjOrName;
      payload = {
        "משימה": t["משימה"] || "",
        "תאריך": t["תאריך"] || "",
        "שעה": t["שעה"] || "",
        "אפשרויות": _normOptions(t["אפשרויות"]),
        "דגשים": t["דגשים"] || ""
      };
    } else {
      payload = {
        "משימה": String(taskObjOrName || ""),
        "תאריך": date || "",
        "שעה": time || "",
        "אפשרויות": _normOptions(options),
        "דגשים": notes || ""
      };
    }
    const r = await _call("addTask", payload);
    if (!r?.success) throw new Error(r?.error || "addTask failed");
    _invalidateAllInitCaches();
    return r;
  }

  async function removeTask(taskOrObj, date, time) {
    const p = (typeof taskOrObj === "object") ? taskOrObj : { task: taskOrObj, date, time };
    const r = await _call("removeTask", p);
    if (!r?.success) {
      if (r?.debug) console.warn("removeTask debug:", r.debug);
      throw new Error(r?.error || "removeTask failed");
    }
    _invalidateAllInitCaches();
    return r;
  }

  // payload = { oldTask, oldDate, oldTime, newTask, newDate, newTime, options, notes }
  async function updateTask(payload) {
    const r = await _call("updateTask", payload);
    if (!r?.success) throw new Error(r?.error || "updateTask failed");
    _invalidateAllInitCaches();
    return r;
  }

  // alias לשרתים ישנים
  async function editTask(payload) {
    const r = await _call("editTask", payload);
    if (!r?.success) throw new Error(r?.error || "editTask failed");
    _invalidateAllInitCaches();
    return r;
  }

  // תגובה למשימה
  async function postResponse(objOrTask, date, time, status, note = "", member = "") {
    const p = (typeof objOrTask === "object")
      ? objOrTask
      : { task: objOrTask, date, time, status, note, member };
    const r = await _call("postResponse", p);
    if (!r?.success) throw new Error(r?.error || "postResponse failed");
    _invalidateAllInitCaches();
    return r;
  }

  // משתתפים (גרסאות בסיסיות שקיימות אצלך)
  async function addMember(nameOrObj) {
    const p = (typeof nameOrObj === "object") ? nameOrObj : { name: nameOrObj };
    const r = await _call("addMember", p);
    if (!r?.success) throw new Error(r?.error || "addMember failed");
    _invalidateAllInitCaches();
    return r;
  }

  async function removeMember(nameOrObj) {
    const p = (typeof nameOrObj === "object") ? nameOrObj : { name: nameOrObj };
    const r = await _call("removeMember", p);
    if (!r?.success) throw new Error(r?.error || "removeMember failed");
    _invalidateAllInitCaches();
    return r;
  }

  /* ---- Helpers ---- */
  function isLoggedIn() { return !!Auth.token; }
  function isAdmin() { return (Auth.role === "admin"); }

  // החזרה החוצה
  return {
    // Auth
    login, me, logout,
    // Data
    getInitData,
    // Mutations
    addTask, removeTask, updateTask, editTask, postResponse,
    addMember, removeMember,
    // Helpers
    isLoggedIn, isAdmin,
    Auth,
    // קאש
    InitCache: {
      get: _readInitCache,
      set: _writeInitCache,
      clear: _invalidateAllInitCaches
    },
    clearInitCache: _invalidateAllInitCaches,   // שם ברור
    _clearInitCache: _invalidateAllInitCaches   // תאימות לאחור (אם נשארו קריאות ישנות)
  };
})();

// נחשוף ל־window (ליתר ביטחון בסביבת דפדפן רגילה)
window.API = API;

// תאימות אחורה לפונקציות שמצפות ל־getCachedData()
async function getCachedData() {
  return API.getInitData();
}
