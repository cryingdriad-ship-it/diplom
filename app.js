const authCardEl = document.getElementById("authCard");
const appCardEl = document.getElementById("appCard");
const appMessageEl = document.getElementById("appMessage");
const modelStatusEl = document.getElementById("model-status");

const registerFormEl = document.getElementById("registerForm");
const registerEmailEl = document.getElementById("registerEmail");
const registerPasswordEl = document.getElementById("registerPassword");
const loginFormEl = document.getElementById("loginForm");
const loginEmailEl = document.getElementById("loginEmail");
const loginPasswordEl = document.getElementById("loginPassword");
const accountEmailEl = document.getElementById("accountEmail");
const logoutButtonEl = document.getElementById("logoutButton");

const fileInputEl = document.getElementById("image-input");
const imagePreviewEl = document.getElementById("image-preview");
const analyzeButtonEl = document.getElementById("analyze-button");
const clearButtonEl = document.getElementById("clear-button");
const gramsInputEl = document.getElementById("grams-input");
const entryDateEl = document.getElementById("entry-date");
const viewDateEl = document.getElementById("view-date");
const refreshDayEl = document.getElementById("refresh-day");
const goalSelectEl = document.getElementById("goal-select");
const installButtonEl = document.getElementById("install-button");

const chipsEl = document.getElementById("prediction-chips");
const guessedFoodEl = document.getElementById("guessed-food");
const sourceEl = document.getElementById("nutrition-source");
const gramsEl = document.getElementById("detected-grams");
const caloriesEl = document.getElementById("calories");
const proteinsEl = document.getElementById("proteins");
const fatsEl = document.getElementById("fats");
const carbsEl = document.getElementById("carbs");
const confidenceEl = document.getElementById("confidence");
const saveEntryButtonEl = document.getElementById("save-entry");

const totalCaloriesEl = document.getElementById("total-calories");
const targetCaloriesEl = document.getElementById("target-calories");
const targetPercentEl = document.getElementById("target-percent");
const targetProgressEl = document.getElementById("target-progress");
const macroRatioEl = document.getElementById("macro-ratio");
const emptyLogEl = document.getElementById("empty-log");
const diaryListEl = document.getElementById("daily-list");
const clearDayButtonEl = document.getElementById("clear-day");

const weekAverageEl = document.getElementById("weekly-average");
const historyListEl = document.getElementById("history-list");

const CALORIE_TARGETS = { loss: 1700, maintain: 2000, gain: 2400 };

let model = null;
let currentUser = null;
let currentImageData = "";
let currentAnalysis = null;
let currentDayEntries = [];
let currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
let deferredPrompt = null;

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function setMessage(text, isError = false) {
  appMessageEl.textContent = text;
  appMessageEl.classList.toggle("error", Boolean(isError));
}

function setModelStatus(text, ok = false) {
  modelStatusEl.textContent = text;
  modelStatusEl.classList.toggle("ok", ok);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    if (response.status === 401) {
      currentUser = null;
      renderAuthState();
    }
    throw new Error(data.error || "Помилка сервера");
  }
  return data;
}

function renderAuthState() {
  const authenticated = Boolean(currentUser);
  authCardEl.classList.toggle("hidden", authenticated);
  appCardEl.classList.toggle("hidden", !authenticated);
  accountEmailEl.textContent = authenticated ? currentUser.email : "—";
  updateAnalyzeButtonState();
}

function updateAnalyzeButtonState() {
  analyzeButtonEl.disabled = !model || !currentImageData || !currentUser;
}

function setNutritionResult(result = null) {
  guessedFoodEl.textContent = result ? result.foodName : "—";
  sourceEl.textContent = result ? result.source : "—";
  gramsEl.textContent = result ? `${round(result.grams)} г` : "—";
  caloriesEl.textContent = result ? `${round(result.calories)}` : "—";
  proteinsEl.textContent = result ? `${round(result.protein)}` : "—";
  fatsEl.textContent = result ? `${round(result.fat)}` : "—";
  carbsEl.textContent = result ? `${round(result.carbs)}` : "—";
  confidenceEl.textContent = result ? `${round(result.confidence * 100)}%` : "—";
}

function clearCurrentAnalysis() {
  currentImageData = "";
  currentAnalysis = null;
  chipsEl.innerHTML = "";
  setNutritionResult(null);
  saveEntryButtonEl.disabled = true;
  imagePreviewEl.hidden = true;
  imagePreviewEl.removeAttribute("src");
  fileInputEl.value = "";
  updateAnalyzeButtonState();
}

function renderTotals() {
  const target = CALORIE_TARGETS[goalSelectEl.value] || CALORIE_TARGETS.maintain;
  const calories = round(currentDayTotals.calories);
  const percent = target ? Math.min(200, round((calories / target) * 100)) : 0;

  totalCaloriesEl.textContent = `${calories} ккал`;
  targetCaloriesEl.textContent = `${target} ккал`;
  targetPercentEl.textContent = `${percent}%`;
  targetProgressEl.value = Math.min(percent, 100);
  macroRatioEl.textContent = `${round(currentDayTotals.protein)} / ${round(currentDayTotals.fat)} / ${round(currentDayTotals.carbs)} г`;
}

function renderDiary(entries) {
  diaryListEl.innerHTML = "";
  emptyLogEl.hidden = entries.length > 0;

  entries.forEach((entry) => {
    const localTime = new Date(entry.createdAt).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${entry.foodName} (${round(entry.grams)} г)</strong>
        <small>${localTime} • ${round(entry.calories)} ккал • ${entry.source}</small>
      </div>
      <button class="remove" data-id="${entry.id}" type="button">Видалити</button>
    `;
    diaryListEl.appendChild(li);
  });
}

function renderHistory(days, weeklyAverageCalories) {
  historyListEl.innerHTML = "";
  [...days]
    .reverse()
    .forEach((day) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${day.date}</strong><small>${round(day.calories)} ккал</small>`;
      historyListEl.appendChild(li);
    });
  weekAverageEl.textContent = `${round(weeklyAverageCalories)} ккал`;
}

async function loadDayDiary(date) {
  const data = await api(`/api/diary/day?date=${encodeURIComponent(date)}`);
  currentDayEntries = data.entries || [];
  currentDayTotals = data.totals || { calories: 0, protein: 0, fat: 0, carbs: 0 };
  renderDiary(currentDayEntries);
  renderTotals();
}

async function loadHistory(days = 30) {
  const data = await api(`/api/diary/history?days=${days}`);
  renderHistory(data.days || [], data.weeklyAverageCalories || 0);
}

async function handleImageSelect(file) {
  const reader = new FileReader();
  reader.onload = () => {
    currentImageData = String(reader.result || "");
    imagePreviewEl.src = currentImageData;
    imagePreviewEl.hidden = false;
    updateAnalyzeButtonState();
  };
  reader.readAsDataURL(file);
}

async function loadModel() {
  try {
    setModelStatus("Завантаження AI-моделі...");
    if (typeof mobilenet === "undefined") {
      throw new Error("MobileNet недоступний");
    }
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setModelStatus("Модель готова до аналізу", true);
    updateAnalyzeButtonState();
  } catch (error) {
    setModelStatus("Помилка завантаження AI-моделі");
    modelStatusEl.classList.add("error");
    setMessage(error.message, true);
  }
}

async function analyzeImage() {
  if (!currentUser || !model || !currentImageData) {
    return;
  }
  analyzeButtonEl.disabled = true;
  analyzeButtonEl.textContent = "Аналіз...";
  setMessage("Виконується AI-аналіз та запит до food API...");

  try {
    const predictions = await model.classify(imagePreviewEl, 3);
    const top = predictions[0];
    if (!top) {
      throw new Error("AI не розпізнав страву");
    }

    chipsEl.innerHTML = "";
    predictions.forEach((p) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${p.className} — ${round(p.probability * 100)}%`;
      chipsEl.appendChild(chip);
    });

    const grams = Math.max(1, Number(gramsInputEl.value || 250));
    const estimate = await api("/api/food/estimate", {
      method: "POST",
      body: JSON.stringify({ query: top.className, grams })
    });

    currentAnalysis = {
      foodName: estimate.foodName,
      grams: estimate.grams,
      calories: estimate.calories,
      protein: estimate.protein,
      fat: estimate.fat,
      carbs: estimate.carbs,
      source: estimate.source,
      confidence: top.probability
    };
    setNutritionResult(currentAnalysis);
    saveEntryButtonEl.disabled = false;
    setMessage("Аналіз завершено. Можна зберігати у щоденник.");
  } catch (error) {
    setNutritionResult(null);
    setMessage(error.message || "Помилка аналізу", true);
  } finally {
    analyzeButtonEl.textContent = "AI-аналіз";
    updateAnalyzeButtonState();
  }
}

async function saveEntry() {
  if (!currentAnalysis || !currentUser) {
    return;
  }
  const dateKey = entryDateEl.value || todayKey();
  await api("/api/diary/entries", {
    method: "POST",
    body: JSON.stringify({ ...currentAnalysis, dateKey })
  });
  saveEntryButtonEl.disabled = true;
  if (viewDateEl.value === dateKey) {
    await loadDayDiary(dateKey);
  }
  await loadHistory(30);
  setMessage("Запис додано до щоденника.");
}

async function deleteEntry(entryId) {
  await api(`/api/diary/entries/${entryId}`, { method: "DELETE" });
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
}

async function clearCurrentDay() {
  const ids = currentDayEntries.map((entry) => entry.id);
  for (const id of ids) {
    await api(`/api/diary/entries/${id}`, { method: "DELETE" });
  }
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
}

async function submitRegister(event) {
  event.preventDefault();
  const email = registerEmailEl.value.trim();
  const password = registerPasswordEl.value;
  const user = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  currentUser = user;
  renderAuthState();
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
  setMessage("Акаунт створено, ви увійшли в систему.");
  registerFormEl.reset();
}

async function submitLogin(event) {
  event.preventDefault();
  const email = loginEmailEl.value.trim();
  const password = loginPasswordEl.value;
  const user = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  currentUser = user;
  renderAuthState();
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
  setMessage("Успішний вхід.");
  loginFormEl.reset();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  currentUser = null;
  renderAuthState();
  clearCurrentAnalysis();
  diaryListEl.innerHTML = "";
  historyListEl.innerHTML = "";
  weekAverageEl.textContent = "0 ккал";
  currentDayEntries = [];
  currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  renderTotals();
  setMessage("Ви вийшли з акаунту.");
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButtonEl.hidden = false;
  });
  installButtonEl.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButtonEl.hidden = true;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

async function checkAuth() {
  const data = await api("/api/auth/me");
  currentUser = data.authenticated ? data.user : null;
  renderAuthState();
  if (currentUser) {
    await loadDayDiary(viewDateEl.value || todayKey());
    await loadHistory(30);
  }
}

function wireEvents() {
  registerFormEl.addEventListener("submit", (event) => {
    submitRegister(event).catch((error) => setMessage(error.message, true));
  });
  loginFormEl.addEventListener("submit", (event) => {
    submitLogin(event).catch((error) => setMessage(error.message, true));
  });
  logoutButtonEl.addEventListener("click", () => {
    logout().catch((error) => setMessage(error.message, true));
  });

  fileInputEl.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  });
  analyzeButtonEl.addEventListener("click", () => {
    analyzeImage().catch((error) => setMessage(error.message, true));
  });
  clearButtonEl.addEventListener("click", clearCurrentAnalysis);
  saveEntryButtonEl.addEventListener("click", () => {
    saveEntry().catch((error) => setMessage(error.message, true));
  });

  clearDayButtonEl.addEventListener("click", () => {
    clearCurrentDay().catch((error) => setMessage(error.message, true));
  });
  refreshDayEl.addEventListener("click", () => {
    loadDayDiary(viewDateEl.value || todayKey()).catch((error) => setMessage(error.message, true));
  });
  viewDateEl.addEventListener("change", () => {
    const date = viewDateEl.value || todayKey();
    loadDayDiary(date).catch((error) => setMessage(error.message, true));
  });
  goalSelectEl.addEventListener("change", renderTotals);

  diaryListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("remove")) {
      const id = Number(target.dataset.id);
      if (id) {
        deleteEntry(id).catch((error) => setMessage(error.message, true));
      }
    }
  });
}

async function init() {
  const today = todayKey();
  entryDateEl.value = today;
  viewDateEl.value = today;
  setNutritionResult(null);
  renderTotals();
  wireEvents();
  initInstallPrompt();
  registerServiceWorker();
  await checkAuth();
  await loadModel();
}

init().catch((error) => setMessage(error.message || "Помилка ініціалізації", true));
