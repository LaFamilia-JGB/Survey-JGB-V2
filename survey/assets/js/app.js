const APPS = (function(){
  let rows = []; // מהשרת
  async function loadRows(){
    rows = await API.getAllRows();
    return rows;
  }

  // d = ISO date string -> יום בשבוע עברי
  function hebDayName(dateStr){
    const d = new Date(dateStr);
    const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    return days[d.getDay()];
  }

  // ---------- Index ----------
  async function initTasksPage(){
    await loadRows();
    // נסרוק לפי משימות ייחודיות (task name + date + time)
    const tasksMap = {};
    for(const r of rows){
      const key = `${r.משימה}||${r.תאריך}||${r.שעה}`;
      if(!tasksMap[key]) tasksMap[key] = {name:r.משימה, date:r.תאריך, time:r.שעה};
    }
    const tasks = Object.values(tasksMap).sort((a,b)=> new Date(a.date) - new Date(b.date));
    const list = document.getElementById('tasks-list');
    list.innerHTML = tasks.map(t=>`
      <div class="task-item">
        <div>
          <strong>${t.name}</strong><div class="task-meta">${t.date} • ${hebDayName(t.date)} • שעה ${t.time}</div>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="location.href='respond.html?task=${encodeURIComponent(t.name)}&date=${encodeURIComponent(t.date)}&time=${encodeURIComponent(t.time)}'">פתח</button>
        </div>
      </div>
    `).join('') || '<p class="muted">אין משימות</p>';
  }

  // ---------- Respond ----------
  function getQueryParams(){
    const qs = new URLSearchParams(location.search);
    const obj = {};
    for(const [k,v] of qs.entries()) obj[k]=v;
    return obj;
  }

  async function initRespondPage(){
    await loadRows();
    const q = getQueryParams();
    const title = q.task || 'משימה';
    document.getElementById('taskTitle').innerText = title;
    document.getElementById('taskMeta').innerText = `${q.date || ''} • ${q.time || ''}`;
    document.getElementById('taskId').value = `${title}||${q.date||''}||${q.time||''}`;
    // name field
    const inputName = document.getElementById('inputName');
    inputName.value = '';
    // ריסט של אירועים
    const radios = document.querySelectorAll('input[name="status"]');
    radios.forEach(r=>{
      r.addEventListener('change', ()=>{
        const reasonReq = document.getElementById('reasonReq');
        if(r.value === 'לא מגיע' && r.checked) reasonReq.style.display='inline';
        else reasonReq.style.display='none';
      });
    });
  }

  async function submitResponse(){
    const name = document.getElementById('inputName').value.trim();
    if(!name){ alert('מלא/י שם'); return; }
    const status = document.querySelector('input[name="status"]:checked');
    if(!status){ alert('בחר/י סטטוס'); return; }
    const st = status.value;
    const reason = document.getElementById('reason').value.trim();
    if(st === 'לא מגיע' && !reason){ alert('שדה סיבה חובה עבור "לא מגיע"'); return; }
    const note = document.getElementById('note').value.trim();
    const taskId = document.getElementById('taskId').value;
    // payload בהתאם למבנה הגיליון: משימה, תאריך, שעה, שם, סטטוס, סיבה, הערה
    const [task, date, time] = taskId.split('||');
    const payload = {
      action: 'addResponse',
      משימה: task,
      תאריך: date,
      שעה: time,
      שם: name,
      סטטוס: st,
      סיבה: reason,
      הערה: note
    };
    await API.postResponse(payload);
    alert('התשובה נשמרה');
    location.href = 'index.html';
  }

  // ---------- Admin ----------
  async function initAdminPage(){
    await loadRows();
    // אסוף משימות
    const tasks = {};
    for(const r of rows){
      const key = `${r.משימה}||${r.תאריך}||${r.שעה}`;
      tasks[key] = {name:r.משימה, date:r.תאריך, time:r.שעה};
    }
    const sel = document.getElementById('taskSelect');
    sel.innerHTML = Object.keys(tasks).map(k=>{
      const t = tasks[k];
      return `<option value="${k}">${t.name} • ${t.date} • שעה ${t.time}</option>`;
    }).join('');
    sel.addEventListener('change', ()=> renderSummary(sel.value));
    if(sel.options.length) renderSummary(sel.value);
  }

  function renderSummary(taskKey){
    // סינון על אותה משימה
    const [task, date, time] = taskKey.split('||');
    const filtered = rows.filter(r=> r.משימה === task && r.תאריך === date && r.שעה === time);
    // חלוקה
    const ok = filtered.filter(r=> r.סטטוס === 'מגיע');
    const no = filtered.filter(r=> r.סטטוס === 'לא מגיע');
    const partial = filtered.filter(r=> r.סטטוס === 'מגיע רק למשחק');
    // לא הגיבו: כאן נניח שיש רשימת משתתפים - אם אין, 'לא הגיבו' = שורות עם סטטוס ריק
    const noReply = filtered.filter(r=> !r.סטטוס || r.סטטוס.trim()==='');
    const container = document.getElementById('summary');
    function renderList(arr, status){
      return arr.map((r,i)=>`<div class="name-row"><div>${i+1}. ${r.שם || '(אין שם)'} ${r.הערה?`(<span class="muted">${r.הערה}</span>)`:''}</div><div>${status==='no'?`– ${r.סיבה || ''}`:''}</div></div>`).join('');
    }
    container.innerHTML = `
      <div class="category"><h3>✅ מגיעים (${ok.length})</h3>${renderList(ok,'ok') || '<p class="muted">ריק</p>'}</div>
      <div class="category"><h3>❌ לא מגיעים (${no.length})</h3>${renderList(no,'no') || '<p class="muted">ריק</p>'}</div>
      <div class="category"><h3>🟨 מגיעים רק למשחק (${partial.length})</h3>${renderList(partial,'partial') || '<p class="muted">ריק</p>'}</div>
      <div class="category"><h3>❓ לא הגיבו (${noReply.length})</h3>${renderList(noReply,'unknown') || '<p class="muted">ריק</p>'}</div>
    `;
    // שמירת המידע הזמין לזמנית לשימוש בכפתור העתק
    window._currentSummary = {task, date, time, ok, no, partial, noReply};
  }

  // יוצר טקסט לוואטסאפ לפי פורמט המבוקש ועותק ללוח
  async function copyWhatsappText(){
    if(!window._currentSummary){ alert('בחר/י משימה ראשית'); return; }
    const s = window._currentSummary;
    function linesFor(arr, icon){
      if(!arr.length) return 'אין\n\n';
      return arr.map((r,i)=>`${i+1}. ${r.שם || '(אין שם)'}${r.הערה?` (${r.הערה})` : ''}${icon==='no' && r.סיבה?` – ${r.סיבה}`:''}`).join('\n') + '\n\n';
    }
    const dayName = hebDayName(s.date);
    const text = `📋 ${s.task} – ${s.date} ${dayName} שעה ${s.time}\n\n✅ מגיעים:\n${linesFor(s.ok,'ok')}❌ לא מגיעים:\n${linesFor(s.no,'no')}🟨 מגיעים רק למשחק:\n${linesFor(s.partial,'partial')}❓ לא הגיבו:\n${linesFor(s.noReply,'unknown')}🟨 סה"כ: ${s.ok.length}\n`;
    try{
      await navigator.clipboard.writeText(text);
      alert('הטקסט הועתק ללוח');
    }catch(e){ prompt('העתק ידנית את הטקסט:', text); }
  }

  // פונקציה לדגימה: מועדון סינכרון/עדכון ל-Google Sheets (לפשטות נשלח payload נוסף)
  async function syncToSheets(){
    if(!window._currentSummary){ alert('בחר/י משימה'); return; }
    // לשלוח לכל שורה פקודה לעדכון — כאן נשלח בקשה אחת עם action
    const payload = { action: 'syncSummary', task: window._currentSummary.task, date: window._currentSummary.date, time: window._currentSummary.time };
    await API.postResponse(payload);
    alert('הבקשה לעדכון נשלחה לשרת.');
  }

  return {
    initTasksPage, initRespondPage, submitResponse, initAdminPage, copyWhatsappText, syncToSheets
  };
})();
