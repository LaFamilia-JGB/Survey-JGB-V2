function showLoading(text = "טוען...") {
  if (!document.getElementById("loadingOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "loadingOverlay";
    overlay.innerHTML = `
      <div class="spinner"></div>
      <p>${text}</p>
    `;
    document.body.appendChild(overlay);
  } else {
    document.querySelector("#loadingOverlay p").innerText = text;
    document.getElementById("loadingOverlay").style.display = "flex";
  }
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}
