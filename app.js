function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`UI element with id "${id}" not found`);
  return element;
}

const FIREBASE_CONFIG = window.MYFITNESSPAL_FIREBASE_CONFIG || null;
const CALORIE_TARGETS = { loss: 1700, maintain: 2000, gain: 2400 };
const GUEST_LOG_STORAGE_KEY = "myfitnesspal_guest_entries_v1";
const LOCAL_AUTH_STORAGE_KEY = "myfitnesspal_local_auth_users_v1";

const LOCAL_FOOD_DB = [
  { keys: ["banana"], calories: 105, protein: 1.3, fat: 0.4, carbs: 27, name: "Banana" },
  { keys: ["apple"], calories: 95, protein: 0.5, fat: 0.3, carbs: 25, name: "Apple" },
  { keys: ["pizza"], calories: 285, protein: 12, fat: 10, carbs: 36, name: "Pizza slice" },
  { keys: ["burger"], calories: 354, protein: 17, fat: 17, carbs: 31, name: "Cheeseburger" },
  { keys: ["salad"], calories: 120, protein: 4, fat: 7, carbs: 10, name: "Mixed salad" },
  { keys: ["rice"], calories: 205, protein: 4.3, fat: 0.4, carbs: 45, name: "Cooked rice" },
  { keys: ["chicken"], calories: 220, protein: 40, fat: 5, carbs: 0, name: "Chicken breast" }
];

const landingViewEl = byId("landingView");
const authCardEl = byId("authCard");
const dashboardViewEl = byId("dashboardView");
const appMessageEl = byId("appMessage");
const modelStatusEl = byId("model-status");
const navSignInButtonEl = byId("navSignInButton");
const navGetStartedButtonEl = byId("navGetStartedButton");
const registerFormEl = byId("registerForm");
const registerEmailEl = byId("registerEmail");
const registerPasswordEl = byId("registerPassword");
const loginFormEl = byId("loginForm");
const loginEmailEl = byId("loginEmail");
const loginPasswordEl = byId("loginPassword");
const guestModeButtonEl = byId("guestModeButton");
const accountEmailEl = byId("accountEmail");
const sessionModeBadgeEl = byId("sessionModeBadge");
const logoutButtonEl = byId("logoutButton");
const switchToAccountButtonEl = byId("switchToAccountButton");
const fileInputEl = byId("image-input");
const dashboardPhotoInputEl = byId("dashboard-photo-input");
const imagePreviewEl = byId("image-preview");
const startProcessButtonEl = byId("startProcessButton");
const analyzeButtonEl = byId("analyze-button");
const clearButtonEl = byId("clear-button");
const gramsInputEl = byId("grams-input");
const entryDateEl = byId("entry-date");
const viewDateEl = byId("view-date");
const refreshDayEl = byId("refresh-day");
const goalSelectEl = byId("goal-select");
const installButtonEl = byId("install-button");
const chipsEl = byId("prediction-chips");
const guessedFoodEl = byId("guessed-food");
const sourceEl = byId("nutrition-source");
const gramsEl = byId("detected-grams");
const caloriesEl = byId("calories");
const proteinsEl = byId("proteins");
const fatsEl = byId("fats");
const carbsEl = byId("carbs");
const confidenceEl = byId("confidence");
const saveEntryButtonEl = byId("save-entry");
const totalCaloriesEl = byId("total-calories");
const targetCaloriesEl = byId("target-calories");
const targetPercentEl = byId("target-percent");
const targetProgressEl = byId("target-progress");
const macroRatioEl = byId("macro-ratio");
const emptyLogEl = byId("empty-log");
const diaryListEl = byId("daily-list");
const clearDayButtonEl = byId("clear-day");
const weekAverageEl = byId("weekly-average");
const historyListEl = byId("history-list");

let model = null;
let currentUser = null;
let currentImageData = "";
let currentAnalysis = null;
let currentDayEntries = [];
let currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
let deferredPrompt = null;
let sessionMode = "anonymous"; // anonymous | guest | user
let authPanelOpen = false;
let localDiaryEntries = [];
let firebaseAuthApi = null;
let firebaseAuth = null;

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

function isGuestMode() {
  return sessionMode === "guest";
}

function isAuthenticatedMode() {
  return sessionMode === "user" && Boolean(currentUser);
}

function isServerUser() {
  return isAuthenticatedMode() && Number.isInteger(currentUser?.id);
}

function canUseDashboard() {
  return isGuestMode() || isAuthenticatedMode();
}

function getLocalDiaryKey() {
  if (isGuestMode()) return GUEST_LOG_STORAGE_KEY;
  if (isAuthenticatedMode() && !isServerUser()) return `myfitnesspal_local_user_diary_${currentUser.email}`;
  return GUEST_LOG_STORAGE_KEY;
}

function readLocalDiary() {
  try {
    const raw = localStorage.getItem(getLocalDiaryKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDiary() {
  localStorage.setItem(getLocalDiaryKey(), JSON.stringify(localDiaryEntries));
}

function readLocalAuthUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAuthUsers(users) {
  localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(users));
}

function renderView() {
  if (canUseDashboard()) {
    landingViewEl.classList.add("hidden");
    dashboardViewEl.classList.remove("hidden");
  } else {
    landingViewEl.classList.remove("hidden");
    dashboardViewEl.classList.add("hidden");
    authCardEl.classList.toggle("hidden", !authPanelOpen);
  }

  switchToAccountButtonEl.classList.toggle("hidden", !isGuestMode());
  if (isAuthenticatedMode()) {
    accountEmailEl.textContent = currentUser.email;
    sessionModeBadgeEl.textContent = isServerUser() ? "Режим: акаунт (server)" : "Режим: акаунт (local)";
  } else if (isGuestMode()) {
    accountEmailEl.textContent = "Гість";
    sessionModeBadgeEl.textContent = "Режим: гість";
  } else {
    accountEmailEl.textContent = "—";
    sessionModeBadgeEl.textContent = "Не авторизовано";
  }
  updateAnalyzeButtonState();
}

function showAuthPanel() {
  if (isGuestMode()) {
    sessionMode = "anonymous";
    currentUser = null;
  }
  authPanelOpen = true;
  renderView();
  authCardEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateAnalyzeButtonState() {
  const canAnalyze = !!model && !!currentImageData;
  startProcessButtonEl.disabled = !canAnalyze;
  analyzeButtonEl.disabled = !canAnalyze || !canUseDashboard();
}

function setInputFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentImageData = String(reader.result || "");
    imagePreviewEl.src = currentImageData;
    imagePreviewEl.hidden = false;
    updateAnalyzeButtonState();
  };
  reader.readAsDataURL(file);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, { credentials: "include", ...options, headers });
  } catch {
    throw new Error("Бекенд недоступний. Запустіть: python3 backend.py");
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || "Сервер повернув помилку.");
  }
  return data;
}

async function initFirebase() {
  if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return false;
  try {
    const firebaseAppApi = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js");
    firebaseAuthApi = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js");
    const app = firebaseAppApi.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebaseAuthApi.getAuth(app);
    return true;
  } catch {
    setMessage("Firebase SDK не инициализирован, использую fallback-авторизацию.", true);
    return false;
  }
}

async function syncFirebaseSession(firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const result = await api("/api/auth/firebase", {
    method: "POST",
    body: JSON.stringify({ idToken })
  });
  currentUser = { id: result.id, email: result.email, firebaseUid: result.firebaseUid };
  sessionMode = "user";
}

async function localAuth(email, password, registerMode) {
  try {
    const endpoint = registerMode ? "/api/auth/register" : "/api/auth/login";
    const user = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    currentUser = { id: user.id, email: user.email };
    sessionMode = "user";
    return;
  } catch (error) {
    if (!String(error.message || "").includes("Бекенд недоступний")) {
      throw error;
    }
  }

  const users = readLocalAuthUsers();
  const existing = users.find((u) => u.email === email);
  if (registerMode) {
    if (existing) throw new Error("Пользователь уже существует (local mode).");
    users.push({ email, password });
    writeLocalAuthUsers(users);
    currentUser = { id: `local-${email}`, email };
    sessionMode = "user";
    setMessage("Бекенд недоступен: зарегистрировано в локальном режиме браузера.");
    return;
  }

  if (!existing || existing.password !== password) {
    throw new Error("Неверный email или пароль (local mode).");
  }
  currentUser = { id: `local-${email}`, email };
  sessionMode = "user";
  setMessage("Бекенд недоступен: вход выполнен в локальном режиме браузера.");
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
  dashboardPhotoInputEl.value = "";
  updateAnalyzeButtonState();
}

function calcTotals(entries) {
  return {
    calories: round(entries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0)),
    protein: round(entries.reduce((sum, entry) => sum + Number(entry.protein || 0), 0)),
    fat: round(entries.reduce((sum, entry) => sum + Number(entry.fat || 0), 0)),
    carbs: round(entries.reduce((sum, entry) => sum + Number(entry.carbs || 0), 0))
  };
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
  if (isServerUser()) {
    const data = await api(`/api/diary/day?date=${encodeURIComponent(date)}`);
    currentDayEntries = data.entries || [];
    currentDayTotals = data.totals || { calories: 0, protein: 0, fat: 0, carbs: 0 };
  } else if (canUseDashboard()) {
    currentDayEntries = localDiaryEntries.filter((entry) => entry.dateKey === date);
    currentDayTotals = calcTotals(currentDayEntries);
  } else {
    currentDayEntries = [];
    currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
  renderDiary(currentDayEntries);
  renderTotals();
}

async function loadHistory(days = 30) {
  if (isServerUser()) {
    const data = await api(`/api/diary/history?days=${days}`);
    renderHistory(data.days || [], data.weeklyAverageCalories || 0);
    return;
  }
  if (!canUseDashboard()) {
    renderHistory([], 0);
    return;
  }

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  const byDate = {};
  localDiaryEntries.forEach((entry) => {
    byDate[entry.dateKey] = (byDate[entry.dateKey] || 0) + Number(entry.calories || 0);
  });

  const daysList = [];
  const weekly = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const value = round(byDate[key] || 0);
    daysList.push({ date: key, calories: value });
    const threshold = new Date(today);
    threshold.setDate(today.getDate() - 6);
    if (date >= threshold) weekly.push(value);
  }
  const weeklyAverageCalories = weekly.length ? round(weekly.reduce((acc, item) => acc + item, 0) / weekly.length) : 0;
  renderHistory(daysList, weeklyAverageCalories);
}

async function loadModel() {
  try {
    setModelStatus("Завантаження AI-моделі...");
    if (typeof mobilenet === "undefined") throw new Error("MobileNet недоступний");
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setModelStatus("Модель готова до аналізу", true);
    updateAnalyzeButtonState();
  } catch (error) {
    setModelStatus("Помилка завантаження AI-моделі");
    setMessage(error.message, true);
  }
}

function renderPredictionChips(labels) {
  chipsEl.innerHTML = "";
  labels.forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = label;
    chipsEl.appendChild(chip);
  });
}

function localEstimate(query, grams) {
  const normalized = (query || "").toLowerCase();
  const found = LOCAL_FOOD_DB.find((item) => item.keys.some((key) => normalized.includes(key)));
  const base = found || { calories: 220, protein: 10, fat: 8, carbs: 25, name: query || "Unknown food" };
  const m = Math.max(1, Number(grams || 100)) / 100;
  return {
    foodName: base.name,
    grams: Math.max(1, Number(grams || 100)),
    calories: round(base.calories * m),
    protein: round(base.protein * m),
    fat: round(base.fat * m),
    carbs: round(base.carbs * m),
    source: "Local fallback"
  };
}

async function analyzeImage() {
  if (!model || !currentImageData) return;
  if (!canUseDashboard()) enterGuestMode();

  analyzeButtonEl.disabled = true;
  startProcessButtonEl.disabled = true;
  analyzeButtonEl.textContent = "Аналіз...";
  startProcessButtonEl.textContent = "Процес...";
  setMessage("Йде AI-аналіз фото...");

  try {
    const predictions = await model.classify(imagePreviewEl, 3);
    const fallbackLabel = predictions[0]?.className || "unknown food";
    let labels = [fallbackLabel];
    let provider = "MobileNet";
    let providerDiagnostics = "";

    try {
      const recognition = await api("/api/food/recognize", {
        method: "POST",
        body: JSON.stringify({ imageData: currentImageData, fallbackLabel })
      });
      labels = recognition.labels?.length ? recognition.labels : [fallbackLabel];
      provider = recognition.provider || provider;
      providerDiagnostics = recognition.providerDiagnostics || "";
    } catch {}

    renderPredictionChips(labels);
    const grams = Math.max(1, Number(gramsInputEl.value || 250));
    let estimate = null;
    try {
      estimate = await api("/api/food/estimate", {
        method: "POST",
        body: JSON.stringify({ query: labels[0], grams })
      });
    } catch {
      estimate = localEstimate(labels[0], grams);
    }

    currentAnalysis = {
      foodName: estimate.foodName,
      grams: estimate.grams,
      calories: estimate.calories,
      protein: estimate.protein,
      fat: estimate.fat,
      carbs: estimate.carbs,
      source: `${estimate.source} / ${provider}`,
      confidence: predictions[0]?.probability || 0
    };
    setNutritionResult(currentAnalysis);
    saveEntryButtonEl.disabled = false;
    const debugNote = providerDiagnostics ? ` Причина fallback: ${providerDiagnostics}.` : "";
    setMessage(`Процес завершено. Натисніть «Додати у щоденник».${debugNote}`);
  } catch (error) {
    currentAnalysis = null;
    setNutritionResult(null);
    setMessage(error.message || "Помилка аналізу", true);
  } finally {
    analyzeButtonEl.textContent = "AI-аналіз";
    startProcessButtonEl.textContent = "Запустити процес";
    updateAnalyzeButtonState();
  }
}

async function saveEntry() {
  if (!currentAnalysis || !canUseDashboard()) return;
  const dateKey = entryDateEl.value || todayKey();
  if (isServerUser()) {
    await api("/api/diary/entries", {
      method: "POST",
      body: JSON.stringify({ ...currentAnalysis, dateKey })
    });
  } else {
    localDiaryEntries.unshift({
      ...currentAnalysis,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dateKey,
      createdAt: new Date().toISOString()
    });
    writeLocalDiary();
  }
  saveEntryButtonEl.disabled = true;
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
}

async function deleteEntry(entryId) {
  if (isServerUser()) {
    await api(`/api/diary/entries/${entryId}`, { method: "DELETE" });
  } else {
    localDiaryEntries = localDiaryEntries.filter((entry) => String(entry.id) !== String(entryId));
    writeLocalDiary();
  }
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
}

async function clearCurrentDay() {
  const selectedDate = viewDateEl.value || todayKey();
  if (isServerUser()) {
    for (const entry of currentDayEntries) {
      await api(`/api/diary/entries/${entry.id}`, { method: "DELETE" });
    }
  } else {
    localDiaryEntries = localDiaryEntries.filter((entry) => entry.dateKey !== selectedDate);
    writeLocalDiary();
  }
  await loadDayDiary(selectedDate);
  await loadHistory(30);
}

async function submitRegister(event) {
  event.preventDefault();
  const email = registerEmailEl.value.trim().toLowerCase();
  const password = registerPasswordEl.value;
  if (!email || password.length < 6) throw new Error("Введите корректный email и пароль (мин. 6 символов).");

  if (firebaseAuth && firebaseAuthApi) {
    const credential = await firebaseAuthApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
    await syncFirebaseSession(credential.user);
  } else {
    await localAuth(email, password, true);
  }

  authPanelOpen = false;
  localDiaryEntries = readLocalDiary();
  registerFormEl.reset();
  renderView();
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
  setMessage(firebaseAuth ? "Регистрация через Firebase успешна." : "Регистрация успешна.");
}

async function submitLogin(event) {
  event.preventDefault();
  const email = loginEmailEl.value.trim().toLowerCase();
  const password = loginPasswordEl.value;
  if (!email || !password) throw new Error("Введите email и пароль.");

  if (firebaseAuth && firebaseAuthApi) {
    const credential = await firebaseAuthApi.signInWithEmailAndPassword(firebaseAuth, email, password);
    await syncFirebaseSession(credential.user);
  } else {
    await localAuth(email, password, false);
  }

  authPanelOpen = false;
  localDiaryEntries = readLocalDiary();
  loginFormEl.reset();
  renderView();
  await loadDayDiary(viewDateEl.value || todayKey());
  await loadHistory(30);
  setMessage(firebaseAuth ? "Вход через Firebase выполнен." : "Вход выполнен.");
}

function enterGuestMode() {
  sessionMode = "guest";
  currentUser = null;
  authPanelOpen = false;
  localDiaryEntries = readLocalDiary();
  renderView();
  loadDayDiary(viewDateEl.value || todayKey()).catch((error) => setMessage(error.message, true));
  loadHistory(30).catch((error) => setMessage(error.message, true));
  setMessage("Гостевой режим включён.");
}

async function logout() {
  if (firebaseAuth && firebaseAuthApi) {
    await firebaseAuthApi.signOut(firebaseAuth);
  }
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  currentUser = null;
  sessionMode = "anonymous";
  authPanelOpen = true;
  currentDayEntries = [];
  currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  renderView();
  renderDiary([]);
  renderHistory([], 0);
  renderTotals();
  setMessage("Вы вышли из аккаунта.");
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButtonEl.hidden = false;
  });
  installButtonEl.addEventListener("click", async () => {
    if (!deferredPrompt) return;
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
  if (firebaseAuth && firebaseAuthApi) {
    const firebaseUser = await new Promise((resolve) => {
      const unsub = firebaseAuthApi.onAuthStateChanged(firebaseAuth, (user) => {
        unsub();
        resolve(user);
      });
    });
    if (firebaseUser) {
      try {
        await syncFirebaseSession(firebaseUser);
      } catch {
        currentUser = null;
        sessionMode = "anonymous";
      }
    } else {
      currentUser = null;
      sessionMode = "anonymous";
    }
  } else {
    try {
      const data = await api("/api/auth/me");
      currentUser = data.authenticated ? data.user : null;
      sessionMode = currentUser ? "user" : "anonymous";
    } catch {
      currentUser = null;
      sessionMode = "anonymous";
    }
  }

  authPanelOpen = !canUseDashboard();
  localDiaryEntries = canUseDashboard() ? readLocalDiary() : [];
  renderView();
  if (canUseDashboard()) {
    await loadDayDiary(viewDateEl.value || todayKey());
    await loadHistory(30);
  }
}

function wireEvents() {
  navSignInButtonEl.addEventListener("click", showAuthPanel);
  navGetStartedButtonEl.addEventListener("click", showAuthPanel);

  registerFormEl.addEventListener("submit", (event) => {
    submitRegister(event).catch((error) => setMessage(error.message, true));
  });
  loginFormEl.addEventListener("submit", (event) => {
    submitLogin(event).catch((error) => setMessage(error.message, true));
  });
  guestModeButtonEl.addEventListener("click", enterGuestMode);

  switchToAccountButtonEl.addEventListener("click", showAuthPanel);
  logoutButtonEl.addEventListener("click", () => {
    logout().catch((error) => setMessage(error.message, true));
  });

  fileInputEl.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) setInputFile(file);
  });
  dashboardPhotoInputEl.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) setInputFile(file);
  });

  startProcessButtonEl.addEventListener("click", () => {
    analyzeImage().catch((error) => setMessage(error.message, true));
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
    loadDayDiary(viewDateEl.value || todayKey()).catch((error) => setMessage(error.message, true));
  });
  goalSelectEl.addEventListener("change", renderTotals);

  diaryListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("remove")) {
      deleteEntry(target.dataset.id).catch((error) => setMessage(error.message, true));
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
  await initFirebase();
  await checkAuth();
  await loadModel();
  setMessage("Нажмите Sign In для открытия окна регистрации/входа или выберите гостевой режим.");
}

init().catch((error) => {
  setMessage(error.message || "Критическая ошибка инициализации.", true);
});
