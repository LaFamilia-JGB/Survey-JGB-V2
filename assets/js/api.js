/** 🔗 בסיס ה-API (שרת Node/Express) */
const API_BASE = "https://survey-jgb-v2.onrender.com";

/* ======================= קריאה ל-API ======================= */
async function apiCall(path, method = "POST", data = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (data) opts.body = JSON.stringify(data);

  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) throw new Error("Network error: " + res.status);

  return await res.json();
}

/* ======================= Auth (localStorage) ======================= */
const Auth = {
  get token() { try { return localStorage.getItem("token") || ""; } catch { return ""; } },
  set token(v) { try { v ? localStorage.setItem("token", v) : localStorage.removeItem("token"); } catch {} },

  get role() { try { return localStorage.getItem("role") || "guest"; } catch { return "guest"; } },
  set role(v) { try { v ? localStorage.setItem("role", v) : localStorage.removeItem("role"); } catch {} },

  get username() { try { return localStorage.getItem("username") || ""; } catch { return ""; } },
  set username(v) { try { v ? localStorage.setItem("username", v) : localStorage.removeItem("username"); } catch {} },

  get displayName() { try { return localStorage.getItem("displayName") || ""; } catch { return ""; } },
  set displayName(v) { try { v ? localStorage.setItem("displayName", v) : localStorage.removeItem("displayName"); } catch {} },
};

/* ======================= Wrapper ======================= */
function _call(action, body = {}) {
  if (Auth.token) body.token = Auth.token;
  return apiCall("/" + action, "POST", body);
}

/* ======================= API Public ======================= */
const API = (() => {
  // --- Auth ---
  async function login(username, password) {
    const r = await _call("login", { username, password });
    if (!r?.success) throw new Error(r?.error || "login failed");
    Auth.token = r.token || "";
    Auth.role = r.role || "user";
    Auth.username = r.username || username || "";
    Auth.displayName = r.displayName || r.fullName || username;
    return r;
  }

  async function me() {
    if (!Auth.token) return { success: false, error: "no token" };
    const r = await _call("me", { token: Auth.token });
    if (r?.success) {
      Auth.role = r.role || "guest";
      Auth.username = r.username || "";
      Auth.displayName = r.displayName || Auth.username;
    } else {
      Auth.token = ""; Auth.role = "guest"; Auth.username = ""; Auth.displayName = "";
    }
    return r;
  }

  async function logout() {
    try { if (Auth.token) await _call("logout", { token: Auth.token }); } catch {}
    Auth.token = ""; Auth.role = "guest"; Auth.username = ""; Auth.displayName = "";
    return true;
  }

  // --- Data ---
  async function getInitData() {
    const resp = await _call("getInitData", {});
    if (resp?.success) return resp;
    throw new Error(resp?.error || "Failed to load init data");
  }

  async function addTask(taskObjOrName, date, time, options, notes) {
    const payload = (typeof taskObjOrName === "object")
      ? taskObjOrName
      : { task_name: taskObjOrName, task_date: date, task_time: time, options, notes };

    const r = await _call("addTask", payload);
    if (!r?.success) throw new Error(r?.error || "addTask failed");
    return r;
  }

  async function removeTask(task, date, time) {
    const r = await _call("removeTask", { task, date, time });
    if (!r?.success) throw new Error(r?.error || "removeTask failed");
    return r;
  }

  async function updateTask(payload) {
    const r = await _call("updateTask", payload);
    if (!r?.success) throw new Error(r?.error || "updateTask failed");
    return r;
  }

  async function postResponse(task, date, time, status, note = "", member = "") {
    if (!member) member = Auth.displayName || Auth.username || "אנונימי";

    const payload = { task, date, time, status, note, member };
    const r = await _call("postResponse", payload);
    if (!r?.success) throw new Error(r?.error || "postResponse failed");
    return r;
  }

  async function getMembers() {
    return await _call("getMembers", {});
  }

  // --- Helpers ---
  function isLoggedIn() { return !!Auth.token; }
  function isAdmin() { return Auth.role === "admin"; }

  return {
    login, me, logout,
    getInitData, addTask, removeTask, updateTask, postResponse, getMembers,
    isLoggedIn, isAdmin, Auth
  };
})();

/* ======================= חשיפה ל-window ======================= */
window.API = API;
