const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyDNoDrNzGhKq6RrSTOtykdy6eUW-SqhIZyMNN7Ce1kW9MG0rpTqTcIoxjqKC4BnIUu/exec";

const API = {
  // שולח תגובה חדשה (POST)
  async postResponse(payload){
    const form = new URLSearchParams(payload);
    const resp = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: form
    });
    return resp.text();
  },

  // משיג את כל השורות (doGet מחזיר JSON של כל השורות)
  async getAllRows(){
    const resp = await fetch(WEB_APP_URL + "?action=getAll");
    return resp.json();
  }
};
