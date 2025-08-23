// 🔗 כתובת ה-Web App (ה-URL של ה-Deploy מה-Apps Script)
const API_BASE = "https://script.google.com/macros/s/AKfycbykPEuRnDCMgzy9gwXEdEXXrZHR3CXslTZlXdwGRuJIAb6FKpyZJcyQuqAd7uEKSV9v/exec";

/* ======================= JSONP helper ======================= */
function _jsonp(action, data = {}, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = "jsonp_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const cleanup = () => {
      try { delete window[cb]; } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };
    window[cb] = (payload) => { cleanup(); resolve(payload); };

    const params = new URLSearchParams();
    params.set("action", action);
    params.set("callback", cb);
    if (data && Object.keys(data).length) params.set("body", JSON.stringify(data));

    const script = document.createElement("script");
    // מניעת קאש בדפדפן
    script.src = `${API_BASE}?${params.toString()}&ts=${Date.now()}`;
    script.async = true;
    script.onerror = () => { cleanup(); reject(new Error("JSONP network error")); };

    const timer = setTimeout(() => { cleanup(); reject(new Error("JSONP timeout")); }, timeoutMs);
    document.head.appendChild(script);
  });
}

/* ======================= Auth (token/role + user info) ======================= */
const Auth = {
  get token()      { try { return localStorage.getItem("token") || ""; } catch { return ""; } },
  set token(v)     { try { v ? localStorage.setItem("token", v) : localStorage.removeItem("token"); } catch {} },

  get role()       { try { return localStorage.getItem("role") || "guest"; } catch { return "guest"; } },
  set role(v)      { try { v ? localStorage.setItem("role", v) : localStorage.removeItem("role"); } catch {} },

  get username()   { try { return localStorage.getItem("username") || ""; } catch { return ""; } },
  set username(v)  { try { v ? localStorage.setItem("username", v) : localStorage.removeItem("username"); } catch {} },

  get displayName(){ try { return localStorage.getItem("displayName") || ""; } catch { return ""; } },
  set displayName(v){try { v ? localStorage.setItem("displayName", v) : localStorage.removeItem("displayName"); } catch {} },
};

/* ======================= Cache ======================= */
// מפרידים קאש לפי role כדי למנוע חשיפה בין תפקידים
function _cacheKey() { return `initDataCache_v4_role_${Auth.role || "guest"}`; }
const CACHE_TTL_MS = 120 * 1000;

function _readCache() {
  try {
    const raw = localStorage.getItem(_cacheKey());
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.data) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.data;
  } catch { return null; }
}
function _writeCache(data) {
  try { localStorage.setItem(_cacheKey(), JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function _invalidateAllRoles() {
  ["guest", "user", "admin"].forEach(r => {
    try { localStorage.removeItem(`initDataCache_v4_role_${r}`); } catch {}
  });
}
function clearCache(){ _invalidateAllRoles(); }

/* ======================= עזר: נרמול אופציות ======================= */
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
    } catch { /* ניפול לפורמט פסיקים */ }
  }
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  return JSON.stringify(parts.map(p => ({ text: p, requireNote: false })));
}

/* ======================= עטיפה שמזריקה token ======================= */
function _withToken(body) {
  body = body || {};
  if (Auth.token) body.token = Auth.token;
  return body;
}
function jsonp(action, body) {
  return _jsonp(action, _withToken(body));
}

/* ======================= API ציבורי ======================= */
const API = (() => {
  /* ---- Auth ---- */
  async function login(username, password) {
    const r = await _jsonp("login", { username, password });
    if (!r?.success) throw new Error(r?.error || "login failed");
    // שומרים טוקן + פרטי משתמש, ומנקים קאש מכל התפקידים
    Auth.token      = r.token || "";
    Auth.role       = r.role  || "user";
    Auth.username   = r.username || username || "";
    Auth.displayName= r.displayName || r.fullName || "";
    _invalidateAllRoles();
    return r;
  }

  async function me() {
    if (!Auth.token) return { success:false, error:"no token" };
    const r = await _jsonp("me", { token: Auth.token });
    if (r?.success) {
      Auth.role        = r.role || Auth.role || "guest";
      Auth.username    = r.username || Auth.username || "";
      Auth.displayName = r.displayName || r.fullName || Auth.displayName || "";
      return r;
    }
    // אם פג תוקף — ניקוי מקומי + קאש
    Auth.token = ""; Auth.role = "guest"; Auth.username=""; Auth.displayName="";
    _invalidateAllRoles();
    return r;
  }

  async function logout() {
    const t = Auth.token;
    try { if (t) await _jsonp("logout", { token: t }); } catch {} // אם אין בשרת — יתעלם
    Auth.token=""; Auth.role="guest"; Auth.username=""; Auth.displayName="";
    _invalidateAllRoles();
    return true;
  }

  /* ---- Data ---- */
  async function getInitData({ force = false } = {}) {
    if (!force) {
      const c = _readCache();
      if (c) return c;
    }
    const resp = await jsonp("getInitData", {}); // השרת יכול להחזיר גם role/displayName
    if (resp && !resp.error) {
      if (resp.role)        Auth.role = resp.role;
      if (resp.username)    Auth.username = resp.username;
      if (resp.displayName) Auth.displayName = resp.displayName;

      // ודא ששדה "אפשרויות" תמיד נשמר כמחרוזת JSON
      if (Array.isArray(resp.tasks)) {
        resp.tasks = resp.tasks.map(t => ({
          ...t,
          "אפשרויות": _normOptions(t["אפשרויות"])
        }));
      }
      _writeCache(resp);
      return resp;
    }
    const fallback = _readCache();
    if (fallback) return fallback;
    throw new Error(resp?.error || "Failed to load init data");
  }

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
    const r = await jsonp("addTask", payload);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "addTask failed");
  }

  async function removeTask(taskOrObj, date, time) {
    const p = (typeof taskOrObj === "object")
      ? taskOrObj
      : { task: taskOrObj, date, time };
    const r = await jsonp("removeTask", p);
    if (r?.success) { _invalidateAllRoles(); return r; }
    if (r?.debug) console.warn("removeTask debug:", r.debug);
    throw new Error(r?.error || "removeTask failed");
  }

  async function postResponse(objOrTask, date, time, status, note = "", member = "") {
    const p = (typeof objOrTask === "object")
      ? objOrTask
      : { task: objOrTask, date, time, status, note, member };
    const r = await jsonp("postResponse", p);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "postResponse failed");
  }

  async function addMember(nameOrObj) {
    const p = (typeof nameOrObj === "object") ? nameOrObj : { name: nameOrObj };
    const r = await jsonp("addMember", p);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "addMember failed");
  }

  async function removeMember(nameOrObj) {
    const p = (typeof nameOrObj === "object") ? nameOrObj : { name: nameOrObj };
    const r = await jsonp("removeMember", p);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "removeMember failed");
  }

  // ✅ עדכון/עריכה
  async function updateTask(payload) {
    // payload = { oldTask, oldDate, oldTime, newTask, newDate, newTime, options, notes }
    const r = await jsonp("updateTask", payload);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "updateTask failed");
  }

  async function editTask(payload) {
    // payload = { oldTask, oldDate, oldTime, newTask, newDate, newTime, options, notes }
    const r = await jsonp("editTask", payload);
    if (r?.success) { _invalidateAllRoles(); return r; }
    throw new Error(r?.error || "editTask failed");
  }

  // עוזרים קטנים לצד לקוח
  function isLoggedIn(){ return !!Auth.token; }
  function isAdmin(){ return (Auth.role === 'admin'); }

  return {
    // Auth
    login, me, logout,
    // Data
    getInitData,
    addTask, removeTask, postResponse,
    addMember, removeMember,
    updateTask, editTask,
    // Helpers
    Auth, isLoggedIn, isAdmin, clearCache,
  };
})();

// תאימות אחורה לפונקציות שמצפות ל-getCachedData()
async function getCachedData() {
  return API.getInitData();
}
