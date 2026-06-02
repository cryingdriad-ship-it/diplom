function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`UI element with id "${id}" not found`);
  return element;
}

const FIREBASE_CONFIG = window.MYFITNESSPAL_FIREBASE_CONFIG || null;
const CALORIE_TARGETS = { loss: 1700, maintain: 2000, gain: 2400 };
const GUEST_LOG_STORAGE_KEY = "myfitnesspal_guest_entries_v1";
const LOCAL_AUTH_STORAGE_KEY = "myfitnesspal_local_auth_users_v1";
const LOCAL_PROFILE_STORAGE_PREFIX = "myfitnesspal_profile_v1_";

const LOCAL_FOOD_DB = [
  { keys: ["banana"], calories: 105, protein: 1.3, fat: 0.4, carbs: 27, name: "Banana" },
  { keys: ["apple"], calories: 95, protein: 0.5, fat: 0.3, carbs: 25, name: "Apple" },
  { keys: ["pizza"], calories: 285, protein: 12, fat: 10, carbs: 36, name: "Pizza slice" },
  { keys: ["burger"], calories: 354, protein: 17, fat: 17, carbs: 31, name: "Cheeseburger" },
  { keys: ["salad"], calories: 120, protein: 4, fat: 7, carbs: 10, name: "Mixed salad" },
  { keys: ["rice"], calories: 205, protein: 4.3, fat: 0.4, carbs: 45, name: "Cooked rice" },
  { keys: ["chicken"], calories: 220, protein: 40, fat: 5, carbs: 0, name: "Chicken breast" }
];
const FOOD_HINT_KEYWORDS = [
  "pizza",
  "burger",
  "cheeseburger",
  "hotdog",
  "sandwich",
  "salad",
  "pasta",
  "spaghetti",
  "noodle",
  "rice",
  "chicken",
  "steak",
  "beef",
  "fish",
  "salmon",
  "sushi",
  "soup",
  "fries",
  "cake",
  "bread",
  "egg",
  "omelet",
  "apple",
  "banana",
  "orange"
];

const landingViewEl = byId("landingView");
const landingHomeScreenEl = byId("landingHomeScreen");
const landingRegisterScreenEl = byId("landingRegisterScreen");
const landingLoginScreenEl = byId("landingLoginScreen");
const landingInfoScreenEl = byId("landingInfoScreen");
const landingContactsScreenEl = byId("landingContactsScreen");
const dashboardLogoHomeButtonEl = byId("dashboardLogoHomeButton");
const dashboardInfoButtonEl = byId("dashboardInfoButton");
const dashboardContactsButtonEl = byId("dashboardContactsButton");
const calorieGaugeEl = byId("calorieGauge");
const gaugeCaloriesEl = byId("gauge-calories");
const statProteinEl = byId("stat-protein");
const statToTargetEl = byId("stat-to-target");
const vizProteinBarEl = byId("viz-protein-bar");
const vizFatBarEl = byId("viz-fat-bar");
const vizCarbBarEl = byId("viz-carb-bar");
const dashboardViewEl = byId("dashboardView");
const appMessageEl = byId("appMessage");
const modelStatusEl = byId("model-status");
const logoHomeButtonEl = byId("logoHomeButton");
const navInfoButtonEl = byId("navInfoButton");
const navContactsButtonEl = byId("navContactsButton");
const navSignInButtonEl = byId("navSignInButton");
const navGetStartedButtonEl = byId("navGetStartedButton");
const heroRegisterButtonEl = byId("heroRegisterButton");
const heroLoginButtonEl = byId("heroLoginButton");
const registerFormEl = byId("registerForm");
const registerEmailEl = byId("registerEmail");
const registerPasswordEl = byId("registerPassword");
const switchToLoginButtonEl = byId("switchToLoginButton");
const loginFormEl = byId("loginForm");
const loginEmailEl = byId("loginEmail");
const loginPasswordEl = byId("loginPassword");
const switchToRegisterButtonEl = byId("switchToRegisterButton");
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
const profileSexEl = byId("profile-sex");
const profileWeightEl = byId("profile-weight");
const profileHeightEl = byId("profile-height");
const profileAgeEl = byId("profile-age");
const detectedItemsListEl = byId("detected-items-list");
const addItemButtonEl = byId("add-item-button");
const recalculateItemsButtonEl = byId("recalculate-items-button");
const manualFoodQueryEl = byId("manual-food-query");
const manualSearchButtonEl = byId("manual-search-button");
const toggleSettingsButtonEl = byId("toggle-settings-button");
const settingsPanelEl = byId("settings-panel");
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
let landingScreen = "home"; // home | register | login | info | contacts
let forceLandingView = false;
let localDiaryEntries = [];
let firebaseAuthApi = null;
let firebaseAuth = null;
let currentDetectedItems = [];
let currentProviderSource = "Manual";
let currentConfidence = 0;
let settingsPanelCollapsed = false;
let profileSettings = {
  sex: "female",
  heightCm: 165,
  weightKg: 65,
  ageYears: 30,
  goalMode: "maintain"
};

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function activeDateKey() {
  return entryDateEl.value || todayKey();
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

function hasSessionAccess() {
  return isGuestMode() || isAuthenticatedMode();
}

function canUseDashboard() {
  return !forceLandingView && hasSessionAccess();
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

function getLocalProfileKey() {
  if (isGuestMode()) return `${LOCAL_PROFILE_STORAGE_PREFIX}guest`;
  if (isAuthenticatedMode() && !isServerUser()) return `${LOCAL_PROFILE_STORAGE_PREFIX}${currentUser.email}`;
  return `${LOCAL_PROFILE_STORAGE_PREFIX}guest`;
}

function normalizeProfile(partial = {}) {
  const sex = String(partial.sex || profileSettings.sex || "female").toLowerCase() === "male" ? "male" : "female";
  const goalMode = ["loss", "maintain", "gain"].includes(String(partial.goalMode)) ? String(partial.goalMode) : "maintain";
  const heightCm = Math.min(230, Math.max(120, Number(partial.heightCm || 165)));
  const weightKg = Math.min(250, Math.max(35, Number(partial.weightKg || 65)));
  const ageYears = Math.min(100, Math.max(14, Number(partial.ageYears || 30)));
  return {
    sex,
    heightCm: round(heightCm),
    weightKg: round(weightKg),
    ageYears: Math.round(ageYears),
    goalMode
  };
}

function applyProfileToForm() {
  profileSexEl.value = profileSettings.sex;
  profileWeightEl.value = String(profileSettings.weightKg);
  profileHeightEl.value = String(profileSettings.heightCm);
  profileAgeEl.value = String(profileSettings.ageYears);
  goalSelectEl.value = profileSettings.goalMode;
}

function readLocalProfile() {
  try {
    const raw = localStorage.getItem(getLocalProfileKey());
    if (!raw) return normalizeProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return normalizeProfile();
  }
}

function writeLocalProfile() {
  localStorage.setItem(getLocalProfileKey(), JSON.stringify(profileSettings));
}

function readProfileFromForm() {
  return normalizeProfile({
    sex: profileSexEl.value,
    weightKg: profileWeightEl.value,
    heightCm: profileHeightEl.value,
    ageYears: profileAgeEl.value,
    goalMode: goalSelectEl.value
  });
}

async function saveProfileSettings() {
  profileSettings = readProfileFromForm();
  if (isServerUser()) {
    try {
      const payload = {
        sex: profileSettings.sex,
        heightCm: profileSettings.heightCm,
        weightKg: profileSettings.weightKg,
        ageYears: profileSettings.ageYears,
        goalMode: profileSettings.goalMode
      };
      const data = await api("/api/profile", { method: "PUT", body: JSON.stringify(payload) });
      profileSettings = normalizeProfile(data.profile || profileSettings);
    } catch (error) {
      setMessage(`Не вдалося зберегти профіль: ${error.message}`, true);
    }
  } else if (canUseDashboard()) {
    writeLocalProfile();
  }
  applyProfileToForm();
  renderTotals();
}

async function loadProfileSettings(authMePayload = null) {
  if (isServerUser()) {
    if (authMePayload?.profile) {
      profileSettings = normalizeProfile(authMePayload.profile);
    } else {
      try {
        const data = await api("/api/profile");
        profileSettings = normalizeProfile(data.profile || {});
      } catch {
        profileSettings = normalizeProfile();
      }
    }
    applyProfileToForm();
    return;
  }
  if (canUseDashboard()) {
    profileSettings = readLocalProfile();
  } else {
    profileSettings = normalizeProfile();
  }
  applyProfileToForm();
}

function renderSettingsPanelState() {
  settingsPanelEl.classList.toggle("hidden", settingsPanelCollapsed);
  toggleSettingsButtonEl.textContent = settingsPanelCollapsed ? "Показати налаштування" : "Сховати налаштування";
}

function toggleSettingsPanel() {
  settingsPanelCollapsed = !settingsPanelCollapsed;
  renderSettingsPanelState();
}

function renderView() {
  landingViewEl.classList.remove("landing-mode-home", "landing-mode-register", "landing-mode-login", "landing-mode-info", "landing-mode-contacts");
  landingViewEl.classList.add(`landing-mode-${landingScreen}`);

  if (canUseDashboard()) {
    landingViewEl.classList.add("hidden");
    dashboardViewEl.classList.remove("hidden");
  } else {
    landingViewEl.classList.remove("hidden");
    dashboardViewEl.classList.add("hidden");
    landingHomeScreenEl.classList.toggle("hidden", landingScreen !== "home");
    landingRegisterScreenEl.classList.toggle("hidden", landingScreen !== "register");
    landingLoginScreenEl.classList.toggle("hidden", landingScreen !== "login");
    landingInfoScreenEl.classList.toggle("hidden", landingScreen !== "info");
    landingContactsScreenEl.classList.toggle("hidden", landingScreen !== "contacts");
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

function showLandingScreen(screen) {
  forceLandingView = true;
  landingScreen = screen;
  renderView();
  landingViewEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showRegisterScreen() {
  showLandingScreen("register");
}

function showLoginScreen() {
  if (forceLandingView && hasSessionAccess()) {
    forceLandingView = false;
    renderView();
    return;
  }
  showLandingScreen("login");
}

function showHomeScreen() {
  showLandingScreen("home");
}

function showInfoScreen() {
  showLandingScreen("info");
}

function showContactsScreen() {
  showLandingScreen("contacts");
}

function updateAnalyzeButtonState() {
  const canAnalyze = !!currentImageData;
  startProcessButtonEl.disabled = !canAnalyze;
  analyzeButtonEl.disabled = !canAnalyze || !canUseDashboard();
}

function deriveFallbackCandidates(predictions = []) {
  const seen = new Set();
  const result = [];
  for (const prediction of predictions) {
    const className = String(prediction?.className || "").toLowerCase();
    if (!className) continue;
    const matched = FOOD_HINT_KEYWORDS.find((keyword) => className.includes(keyword));
    const label = matched || className.split(",")[0].trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result.slice(0, 5);
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
    if (existing) throw new Error("Акаунт з таким email вже існує.");
    users.push({ email, password });
    writeLocalAuthUsers(users);
    currentUser = { id: `local-${email}`, email };
    sessionMode = "user";
    setMessage("Бекенд недоступний: зареєстровано в локальному режимі браузера.");
    return;
  }

  if (!existing) {
    throw new Error("Акаунт з таким email не знайдено. Спочатку зареєструйтесь.");
  }
  if (existing.password !== password) {
    throw new Error("Невірний пароль для цього акаунта.");
  }
  currentUser = { id: `local-${email}`, email };
  sessionMode = "user";
  setMessage("Бекенд недоступний: вхід виконано в локальному режимі браузера.");
}

function humanizeAuthError(error, registerMode) {
  const code = String(error?.code || "");
  if (registerMode) {
    if (code.includes("email-already-in-use")) return "Акаунт з таким email вже існує.";
    if (code.includes("weak-password")) return "Пароль занадто слабкий. Використайте щонайменше 6 символів.";
  } else {
    if (code.includes("user-not-found")) return "Акаунт з таким email не знайдено. Спочатку зареєструйтесь.";
    if (code.includes("wrong-password")) return "Невірний пароль для цього акаунта.";
    if (code.includes("invalid-login-credentials")) return "Акаунт не знайдено або пароль невірний.";
  }
  if (code.includes("invalid-email")) return "Некоректний формат email.";

  const message = String(error?.message || "");
  const lower = message.toLowerCase();
  if (registerMode && (lower.includes("вже існує") || lower.includes("already exists"))) {
    return "Акаунт з таким email вже існує.";
  }
  if (!registerMode && (lower.includes("невірний") || lower.includes("неверный") || lower.includes("invalid"))) {
    return "Акаунт не знайдено або пароль невірний.";
  }
  return message || "Сталася помилка авторизації.";
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
  const protein = Math.max(0, Number(result?.protein || 0));
  const fat = Math.max(0, Number(result?.fat || 0));
  const carbs = Math.max(0, Number(result?.carbs || 0));
  const total = Math.max(1, protein + fat + carbs);
  vizProteinBarEl.style.width = `${Math.round((protein / total) * 100)}%`;
  vizFatBarEl.style.width = `${Math.round((fat / total) * 100)}%`;
  vizCarbBarEl.style.width = `${Math.round((carbs / total) * 100)}%`;
}

function clearCurrentAnalysis() {
  currentImageData = "";
  currentAnalysis = null;
  currentDetectedItems = [];
  currentProviderSource = "Manual";
  currentConfidence = 0;
  chipsEl.innerHTML = "";
  renderDetectedItemsEditor();
  setNutritionResult(null);
  saveEntryButtonEl.disabled = true;
  imagePreviewEl.hidden = true;
  imagePreviewEl.removeAttribute("src");
  fileInputEl.value = "";
  dashboardPhotoInputEl.value = "";
  manualFoodQueryEl.value = "";
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

function estimateTargetCalories(profile) {
  const sexAdjustment = profile.sex === "male" ? 5 : -161;
  const bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.ageYears) + sexAdjustment;
  const maintenance = Math.max(1200, bmr * 1.35);
  const adjustment = profile.goalMode === "loss" ? -350 : profile.goalMode === "gain" ? 300 : 0;
  return round(Math.max(1200, maintenance + adjustment));
}

function renderTotals() {
  const target = estimateTargetCalories(profileSettings) || CALORIE_TARGETS[profileSettings.goalMode] || CALORIE_TARGETS.maintain;
  const calories = round(currentDayTotals.calories);
  const percent = target ? Math.min(200, round((calories / target) * 100)) : 0;
  const gaugePercent = Math.min(100, Math.max(0, percent));
  const delta = round(target - calories);
  totalCaloriesEl.textContent = `${calories} ккал`;
  targetCaloriesEl.textContent = `${target} ккал`;
  targetPercentEl.textContent = `${percent}%`;
  targetProgressEl.value = Math.min(percent, 100);
  macroRatioEl.textContent = `${round(currentDayTotals.protein)} / ${round(currentDayTotals.fat)} / ${round(currentDayTotals.carbs)} г`;
  gaugeCaloriesEl.textContent = `${Math.round(calories)}`;
  calorieGaugeEl.style.setProperty("--gauge", String(gaugePercent));
  statProteinEl.textContent = `${round(currentDayTotals.protein)} грам`;
  statToTargetEl.textContent = delta >= 0 ? `${delta} kcal` : `+${Math.abs(delta)} kcal`;
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
  if (typeof mobilenet === "undefined") {
    model = null;
    setModelStatus("MobileNet недоступний — використовується серверне AI-розпізнавання.", true);
    updateAnalyzeButtonState();
    return;
  }
  try {
    setModelStatus("Завантаження AI-моделі...");
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setModelStatus("Модель готова до аналізу", true);
  } catch {
    model = null;
    setModelStatus("MobileNet не завантажено — використовується серверне AI-розпізнавання.", true);
  }
  updateAnalyzeButtonState();
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

function makeDetectedItem(label = "", grams = 150) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: String(label || "").trim() || "unknown food",
    grams: Math.max(1, Number(grams || 150)),
    selected: true,
    estimate: null
  };
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function buildCombinedAnalysis(items, sourceProvider, confidence) {
  const selected = items.filter((item) => item.selected && item.estimate);
  if (!selected.length) return null;
  const summary = {
    foodName: selected.map((item) => item.estimate.foodName || item.label).join(" + "),
    grams: round(selected.reduce((sum, item) => sum + Number(item.estimate.grams || item.grams || 0), 0)),
    calories: round(selected.reduce((sum, item) => sum + Number(item.estimate.calories || 0), 0)),
    protein: round(selected.reduce((sum, item) => sum + Number(item.estimate.protein || 0), 0)),
    fat: round(selected.reduce((sum, item) => sum + Number(item.estimate.fat || 0), 0)),
    carbs: round(selected.reduce((sum, item) => sum + Number(item.estimate.carbs || 0), 0)),
    source: `Combined (${selected.length}) / ${sourceProvider}`,
    confidence
  };
  return summary;
}

function renderDetectedItemsEditor() {
  detectedItemsListEl.innerHTML = "";
  if (!currentDetectedItems.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "status";
    placeholder.textContent = "Після аналізу тут з’явиться список страв.";
    detectedItemsListEl.appendChild(placeholder);
    return;
  }
  currentDetectedItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "detected-item-row";
    row.dataset.id = item.id;
    const kcal = item.estimate ? `${round(item.estimate.calories)} ккал` : "— ккал";
    row.innerHTML = `
      <label class="item-check">
        <input type="checkbox" data-action="toggle" ${item.selected ? "checked" : ""} />
      </label>
      <input data-action="label" type="text" value="${escapeHtmlAttr(item.label)}" placeholder="Назва страви" />
      <input data-action="grams" type="number" min="1" max="2000" value="${Math.round(item.grams)}" />
      <strong class="item-kcal">${kcal}</strong>
      <button class="btn outline-accent item-find" data-action="find" type="button">Знайти</button>
      <button class="btn ghost item-remove" data-action="remove" type="button">×</button>
    `;
    const meta = document.createElement("small");
    meta.className = "status";
    meta.textContent = item.estimate
      ? `${round(item.estimate.protein)} / ${round(item.estimate.fat)} / ${round(item.estimate.carbs)} г Б/Ж/В`
      : `Позиція ${index + 1}: змініть назву або натисніть «Знайти», щоб перерахувати з бази`;
    row.appendChild(meta);
    detectedItemsListEl.appendChild(row);
  });
}

async function estimateItem(query, grams) {
  try {
    return await api("/api/food/estimate", {
      method: "POST",
      body: JSON.stringify({ query, grams })
    });
  } catch {
    return localEstimate(query, grams);
  }
}

async function recalculateSingleItem(itemId) {
  const targetItem = currentDetectedItems.find((item) => item.id === itemId);
  if (!targetItem) {
    return;
  }
  const normalizedLabel = String(targetItem.label || "").trim() || "unknown food";
  const grams = Math.max(1, Number(targetItem.grams || 1));
  targetItem.label = normalizedLabel;
  targetItem.grams = grams;
  targetItem.estimate = await estimateItem(normalizedLabel, grams);
}

async function addManualItemFromSearch() {
  const query = String(manualFoodQueryEl.value || "").trim();
  if (!query) {
    setMessage("Вкажіть назву страви для пошуку в базі.", true);
    return;
  }
  const grams = Math.max(1, Number(gramsInputEl.value || 100));
  const estimate = await estimateItem(query, grams);
  const item = makeDetectedItem(query, grams);
  item.estimate = estimate;
  currentDetectedItems.push(item);
  manualFoodQueryEl.value = "";
  renderDetectedItemsEditor();
  syncCurrentAnalysisFromItems("Manual search");
  setMessage(`Страву «${estimate.foodName || query}» додано з бази.`);
}

async function recalculateDetectedItems() {
  if (!currentDetectedItems.length) return;
  const updatedItems = [];
  for (const item of currentDetectedItems) {
    const normalizedLabel = String(item.label || "").trim() || "unknown food";
    const grams = Math.max(1, Number(item.grams || 1));
    if (!item.selected) {
      updatedItems.push({ ...item, label: normalizedLabel, grams, estimate: item.estimate || null });
      continue;
    }
    const estimate = await estimateItem(normalizedLabel, grams);
    updatedItems.push({
      ...item,
      label: normalizedLabel,
      grams,
      estimate
    });
  }
  currentDetectedItems = updatedItems;
  renderDetectedItemsEditor();
}

function syncCurrentAnalysisFromItems(provider = currentProviderSource, confidence = currentConfidence) {
  currentProviderSource = provider || "Manual";
  currentConfidence = Number(confidence || 0);
  currentAnalysis = buildCombinedAnalysis(currentDetectedItems, currentProviderSource, currentConfidence);
  setNutritionResult(currentAnalysis);
  saveEntryButtonEl.disabled = !currentAnalysis;
}

async function analyzeImage() {
  if (!currentImageData) return;
  if (!canUseDashboard()) enterGuestMode();

  analyzeButtonEl.disabled = true;
  startProcessButtonEl.disabled = true;
  analyzeButtonEl.textContent = "Аналіз...";
  startProcessButtonEl.textContent = "Процес...";
  setMessage("Йде AI-аналіз фото...");

  try {
    let predictions = [];
    if (model) {
      predictions = await model.classify(imagePreviewEl, 5);
    }
    const fallbackCandidates = deriveFallbackCandidates(predictions);
    const fallbackLabel = fallbackCandidates[0] || predictions[0]?.className || "unknown food";
    let labels = [fallbackLabel];
    let provider = "MobileNet";
    let providerDiagnostics = "";
    let recognizedGrams = null;

    try {
      const recognition = await api("/api/food/recognize", {
        method: "POST",
        body: JSON.stringify({ imageData: currentImageData, fallbackLabel, fallbackCandidates })
      });
      labels = recognition.labels?.length ? recognition.labels : [fallbackLabel];
      provider = recognition.provider || provider;
      providerDiagnostics = recognition.providerDiagnostics || "";
      recognizedGrams = Number(recognition.estimatedGrams || 0) > 0 ? Number(recognition.estimatedGrams) : null;
    } catch {}

    renderPredictionChips(labels);
    manualFoodQueryEl.value = labels[0] || "";
    currentProviderSource = provider;
    currentConfidence = predictions[0]?.probability || 0;
    const baseGrams = Math.max(1, Number(recognizedGrams || gramsInputEl.value || 250));
    if (recognizedGrams) {
      gramsInputEl.value = String(Math.round(baseGrams));
    }
    const topLabels = labels.slice(0, 4);
    const splitGrams = Math.max(1, Math.round(baseGrams / Math.max(1, topLabels.length)));
    currentDetectedItems = topLabels.map((label, index) => {
      const itemGrams = recognizedGrams && topLabels.length > 1 ? splitGrams : baseGrams;
      const item = makeDetectedItem(label, itemGrams);
      item.selected = index < 2 || topLabels.length === 1;
      return item;
    });
    if (!currentDetectedItems.length) {
      currentDetectedItems = [makeDetectedItem(fallbackLabel, baseGrams)];
    }
    renderDetectedItemsEditor();
    await recalculateDetectedItems();
    syncCurrentAnalysisFromItems();
    const debugNote = providerDiagnostics ? ` Причина fallback: ${providerDiagnostics}.` : "";
    setMessage(
      `Процес завершено. Оберіть потрібні позиції, за потреби відредагуйте, потім натисніть «Додати у щоденник».${debugNote}`
    );
  } catch (error) {
    currentAnalysis = null;
    currentDetectedItems = [];
    renderDetectedItemsEditor();
    setNutritionResult(null);
    setMessage(error.message || "Помилка аналізу", true);
  } finally {
    analyzeButtonEl.textContent = "AI-аналіз";
    startProcessButtonEl.textContent = "Запустити процес";
    updateAnalyzeButtonState();
  }
}

async function saveEntry() {
  if (!canUseDashboard()) return;
  const selectedItems = currentDetectedItems.filter((item) => item.selected && item.estimate);
  if (!selectedItems.length && !currentAnalysis) return;
  const dateKey = activeDateKey();
  const entriesToSave = selectedItems.length
    ? selectedItems.map((item) => ({
        foodName: item.estimate.foodName || item.label,
        grams: item.estimate.grams || item.grams,
        calories: item.estimate.calories,
        protein: item.estimate.protein,
        fat: item.estimate.fat,
        carbs: item.estimate.carbs,
        source: `${item.estimate.source} / ${currentProviderSource}`,
        confidence: currentConfidence
      }))
    : [{ ...currentAnalysis }];
  if (isServerUser()) {
    for (const entry of entriesToSave) {
      await api("/api/diary/entries", {
        method: "POST",
        body: JSON.stringify({ ...entry, dateKey })
      });
    }
  } else {
    entriesToSave
      .slice()
      .reverse()
      .forEach((entry) => {
        localDiaryEntries.unshift({
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dateKey,
          createdAt: new Date().toISOString()
        });
      });
    writeLocalDiary();
  }
  saveEntryButtonEl.disabled = true;
  await loadDayDiary(activeDateKey());
  await loadHistory(30);
  setMessage(`Додано записів: ${entriesToSave.length}.`);
}

async function deleteEntry(entryId) {
  if (isServerUser()) {
    await api(`/api/diary/entries/${entryId}`, { method: "DELETE" });
  } else {
    localDiaryEntries = localDiaryEntries.filter((entry) => String(entry.id) !== String(entryId));
    writeLocalDiary();
  }
  await loadDayDiary(activeDateKey());
  await loadHistory(30);
}

async function clearCurrentDay() {
  const selectedDate = activeDateKey();
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
  if (!email || password.length < 6) throw new Error("Вкажіть коректний email і пароль (мінімум 6 символів).");

  try {
    if (firebaseAuth && firebaseAuthApi) {
      const credential = await firebaseAuthApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
      await syncFirebaseSession(credential.user);
    } else {
      await localAuth(email, password, true);
    }
  } catch (error) {
    throw new Error(humanizeAuthError(error, true));
  }

  landingScreen = "home";
  forceLandingView = false;
  localDiaryEntries = readLocalDiary();
  await loadProfileSettings();
  registerFormEl.reset();
  renderView();
  await loadDayDiary(activeDateKey());
  await loadHistory(30);
  setMessage(firebaseAuth ? "Регистрация через Firebase успешна." : "Регистрация успешна.");
}

async function submitLogin(event) {
  event.preventDefault();
  const email = loginEmailEl.value.trim().toLowerCase();
  const password = loginPasswordEl.value;
  if (!email || !password) throw new Error("Вкажіть email і пароль.");

  try {
    if (firebaseAuth && firebaseAuthApi) {
      const credential = await firebaseAuthApi.signInWithEmailAndPassword(firebaseAuth, email, password);
      await syncFirebaseSession(credential.user);
    } else {
      await localAuth(email, password, false);
    }
  } catch (error) {
    throw new Error(humanizeAuthError(error, false));
  }

  landingScreen = "home";
  forceLandingView = false;
  localDiaryEntries = readLocalDiary();
  await loadProfileSettings();
  loginFormEl.reset();
  renderView();
  await loadDayDiary(activeDateKey());
  await loadHistory(30);
  setMessage(firebaseAuth ? "Вход через Firebase выполнен." : "Вход выполнен.");
}

function enterGuestMode() {
  sessionMode = "guest";
  currentUser = null;
  landingScreen = "home";
  forceLandingView = false;
  localDiaryEntries = readLocalDiary();
  loadProfileSettings().catch(() => {});
  renderView();
  loadDayDiary(activeDateKey()).catch((error) => setMessage(error.message, true));
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
  landingScreen = "home";
  forceLandingView = false;
  currentDayEntries = [];
  currentDayTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  profileSettings = normalizeProfile();
  applyProfileToForm();
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
  let authPayload = null;
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
      authPayload = data;
      currentUser = data.authenticated ? data.user : null;
      sessionMode = currentUser ? "user" : "anonymous";
    } catch {
      currentUser = null;
      sessionMode = "anonymous";
    }
  }

  landingScreen = "home";
  forceLandingView = false;
  localDiaryEntries = canUseDashboard() ? readLocalDiary() : [];
  await loadProfileSettings(authPayload);
  renderView();
  if (canUseDashboard()) {
    await loadDayDiary(activeDateKey());
    await loadHistory(30);
  }
}

function wireEvents() {
  logoHomeButtonEl.addEventListener("click", showHomeScreen);
  dashboardLogoHomeButtonEl.addEventListener("click", showHomeScreen);
  navInfoButtonEl.addEventListener("click", showInfoScreen);
  navContactsButtonEl.addEventListener("click", showContactsScreen);
  dashboardInfoButtonEl.addEventListener("click", showInfoScreen);
  dashboardContactsButtonEl.addEventListener("click", showContactsScreen);
  navSignInButtonEl.addEventListener("click", showLoginScreen);
  navGetStartedButtonEl.addEventListener("click", showRegisterScreen);
  heroRegisterButtonEl.addEventListener("click", showRegisterScreen);
  heroLoginButtonEl.addEventListener("click", showLoginScreen);
  switchToLoginButtonEl.addEventListener("click", showLoginScreen);
  switchToRegisterButtonEl.addEventListener("click", showRegisterScreen);

  registerFormEl.addEventListener("submit", (event) => {
    submitRegister(event).catch((error) => setMessage(error.message, true));
  });
  loginFormEl.addEventListener("submit", (event) => {
    submitLogin(event).catch((error) => setMessage(error.message, true));
  });
  guestModeButtonEl.addEventListener("click", enterGuestMode);

  switchToAccountButtonEl.addEventListener("click", showLoginScreen);
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
    loadDayDiary(activeDateKey()).catch((error) => setMessage(error.message, true));
  });
  entryDateEl.addEventListener("change", () => {
    viewDateEl.value = activeDateKey();
    loadDayDiary(activeDateKey()).catch((error) => setMessage(error.message, true));
  });
  const onProfileInput = () => {
    profileSettings = readProfileFromForm();
    renderTotals();
  };
  const onProfileChange = () => {
    saveProfileSettings().catch((error) => setMessage(error.message, true));
  };
  goalSelectEl.addEventListener("input", onProfileInput);
  goalSelectEl.addEventListener("change", onProfileChange);
  profileSexEl.addEventListener("change", onProfileChange);
  profileWeightEl.addEventListener("input", onProfileInput);
  profileWeightEl.addEventListener("change", onProfileChange);
  profileHeightEl.addEventListener("input", onProfileInput);
  profileHeightEl.addEventListener("change", onProfileChange);
  profileAgeEl.addEventListener("input", onProfileInput);
  profileAgeEl.addEventListener("change", onProfileChange);
  toggleSettingsButtonEl.addEventListener("click", toggleSettingsPanel);

  addItemButtonEl.addEventListener("click", () => {
    currentDetectedItems.push(makeDetectedItem("manual food", Number(gramsInputEl.value || 150)));
    renderDetectedItemsEditor();
    syncCurrentAnalysisFromItems("Manual edit");
  });
  manualSearchButtonEl.addEventListener("click", () => {
    addManualItemFromSearch().catch((error) => setMessage(error.message, true));
  });
  manualFoodQueryEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addManualItemFromSearch().catch((error) => setMessage(error.message, true));
  });
  recalculateItemsButtonEl.addEventListener("click", () => {
    recalculateDetectedItems()
      .then(() => {
        syncCurrentAnalysisFromItems();
        setMessage("Позиції перераховано. Можна додавати в щоденник.");
      })
      .catch((error) => setMessage(error.message, true));
  });
  detectedItemsListEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const rowEl = target.closest(".detected-item-row");
    if (!rowEl) return;
    const item = currentDetectedItems.find((entry) => entry.id === rowEl.dataset.id);
    if (!item) return;
    const action = target.dataset.action;
    if (action === "toggle" && target instanceof HTMLInputElement) {
      item.selected = target.checked;
      renderDetectedItemsEditor();
      syncCurrentAnalysisFromItems();
      return;
    }
    if (action === "label" && target instanceof HTMLInputElement) {
      item.label = String(target.value || "").trim() || "unknown food";
    }
    if (action === "grams" && target instanceof HTMLInputElement) {
      item.grams = Math.max(1, Number(target.value || item.grams || 1));
    }
    recalculateSingleItem(item.id)
      .then(() => {
        renderDetectedItemsEditor();
        syncCurrentAnalysisFromItems();
      })
      .catch((error) => setMessage(error.message, true));
  });
  detectedItemsListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const rowEl = target.closest(".detected-item-row");
    if (!rowEl) return;
    if (target.dataset.action === "find") {
      recalculateSingleItem(rowEl.dataset.id)
        .then(() => {
          renderDetectedItemsEditor();
          syncCurrentAnalysisFromItems();
          setMessage("Позицію перераховано з бази.");
        })
        .catch((error) => setMessage(error.message, true));
      return;
    }
    if (target.dataset.action !== "remove") return;
    currentDetectedItems = currentDetectedItems.filter((item) => item.id !== rowEl.dataset.id);
    renderDetectedItemsEditor();
    syncCurrentAnalysisFromItems();
  });

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
  renderDetectedItemsEditor();
  applyProfileToForm();
  renderSettingsPanelState();
  setNutritionResult(null);
  renderTotals();
  wireEvents();
  initInstallPrompt();
  registerServiceWorker();
  await initFirebase();
  await checkAuth();
  await loadModel();
  setMessage("Оберіть «Зареєструватись» або «Продовжити як гість» для старту.");
}

init().catch((error) => {
  setMessage(error.message || "Критическая ошибка инициализации.", true);
});
