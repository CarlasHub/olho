const form = document.getElementById("optionsForm");
const status = document.getElementById("status");
const autoSave = document.getElementById("autoSave");
const soundToggle = document.getElementById("soundToggle");

const DEFAULTS = {
  autoSave: true,
  soundToggle: false
};

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

async function loadOptions() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  autoSave.checked = stored.autoSave;
  soundToggle.checked = stored.soundToggle;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({
    autoSave: autoSave.checked,
    soundToggle: soundToggle.checked
  });
  showStatus("Preferences saved.");
});

loadOptions();
