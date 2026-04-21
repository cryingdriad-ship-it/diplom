const modelStatusEl = document.getElementById("model-status");
const fileInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const analyzeButton = document.getElementById("analyze-button");
const clearButton = document.getElementById("clear-button");
const guessedFoodEl = document.getElementById("guessed-food");
const confidenceEl = document.getElementById("confidence");
const caloriesEl = document.getElementById("calories");
const proteinsEl = document.getElementById("proteins");
const fatsEl = document.getElementById("fats");
const carbsEl = document.getElementById("carbs");
const saveEntryButton = document.getElementById("save-entry");
const diaryListEl = document.getElementById("daily-list");
const emptyLogEl = document.getElementById("empty-log");
const totalCaloriesEl = document.getElementById("total-calories");
const targetCaloriesEl = document.getElementById("target-calories");
const targetPercentEl = document.getElementById("target-percent");
const targetProgressEl = document.getElementById("target-progress");
const macroRatioEl = document.getElementById("macro-ratio");
const portionSliderEl = document.getElementById("portion-slider");
const portionValueEl = document.getElementById("portion-value");
const goalSelectEl = document.getElementById("goal-select");
const chipsEl = document.getElementById("prediction-chips");
const clearDayButton = document.getElementById("clear-day");
const installButton = document.getElementById("install-button");

const APP_STORAGE_KEY = "myfitnesspal_daily_log_v1";

const FOOD_DB = [
  {
    id: "salad",
    name: "Овочевий салат",
    aliases: ["salad", "greens", "vegetable", "lettuce", "spinach"],
    perServing: { calories: 120, protein: 4, fat: 7, carbs: 10 }
  },
  {
    id: "apple",
    name: "Яблуко",
    aliases: ["apple", "granny", "pomegranate"],
    perServing: { calories: 95, protein: 0.5, fat: 0.3, carbs: 25 }
  },
  {
    id: "banana",
    name: "Банан",
    aliases: ["banana", "plantain"],
    perServing: { calories: 105, protein: 1.3, fat: 0.4, carbs: 27 }
  },
  {
    id: "orange",
    name: "Апельсин",
    aliases: ["orange", "citrus"],
    perServing: { calories: 62, protein: 1.2, fat: 0.2, carbs: 15.4 }
  },
  {
    id: "pizza",
    name: "Піца (1 шматок)",
    aliases: ["pizza"],
    perServing: { calories: 285, protein: 12, fat: 10, carbs: 36 }
  },
  {
    id: "burger",
    name: "Бургер",
    aliases: ["burger", "cheeseburger", "hamburger", "sandwich"],
    perServing: { calories: 354, protein: 17, fat: 17, carbs: 31 }
  },
  {
    id: "fries",
    name: "Картопля фрі",
    aliases: ["fries", "french", "potato"],
    perServing: { calories: 312, protein: 3.4, fat: 15, carbs: 41 }
  },
  {
    id: "rice",
    name: "Рис",
    aliases: ["rice"],
    perServing: { calories: 205, protein: 4.3, fat: 0.4, carbs: 45 }
  },
  {
    id: "chicken",
    name: "Куряче філе",
    aliases: ["chicken", "hen", "meat", "roast", "grilled"],
    perServing: { calories: 220, protein: 40, fat: 5, carbs: 0 }
  },
  {
    id: "steak",
    name: "Яловичий стейк",
    aliases: ["beef", "steak", "sirloin", "meat"],
    perServing: { calories: 271, protein: 25, fat: 19, carbs: 0 }
  },
  {
    id: "pasta",
    name: "Паста",
    aliases: ["pasta", "spaghetti", "noodle", "macaroni"],
    perServing: { calories: 221, protein: 8, fat: 1.3, carbs: 43 }
  },
  {
    id: "soup",
    name: "Суп",
    aliases: ["soup", "broth"],
    perServing: { calories: 150, protein: 8, fat: 5, carbs: 18 }
  },
  {
    id: "fish",
    name: "Риба",
    aliases: ["fish", "salmon", "tuna", "trout"],
    perServing: { calories: 233, protein: 25, fat: 14, carbs: 0 }
  },
  {
    id: "cake",
    name: "Торт / Десерт",
    aliases: ["cake", "dessert", "chocolate", "ice cream", "cookie"],
    perServing: { calories: 350, protein: 4, fat: 18, carbs: 43 }
  }
];

let model = null;
let currentImageDataUrl = "";
let currentAnalysis = null;
let dailyLog = [];
let deferredPrompt = null;
const CALORIE_TARGETS = {
  loss: 1700,
  maintain: 2000,
  gain: 2400
};

function round(value) {
  return Math.round(value * 10) / 10;
}

function setModelStatus(text, isReady = false) {
  modelStatusEl.textContent = text;
  modelStatusEl.classList.toggle("ok", isReady);
}

function setNutritionResult(foodName, confidence, macros) {
  guessedFoodEl.textContent = foodName || "—";
  confidenceEl.textContent = confidence ? `${round(confidence * 100)}%` : "—";
  caloriesEl.textContent = macros ? `${round(macros.calories)}` : "0";
  proteinsEl.textContent = macros ? `${round(macros.protein)}` : "0";
  fatsEl.textContent = macros ? `${round(macros.fat)}` : "0";
  carbsEl.textContent = macros ? `${round(macros.carbs)}` : "0";
}

function estimatePortionMultiplier(confidence) {
  if (confidence >= 0.7) {
    return 1;
  }
  if (confidence >= 0.45) {
    return 0.9;
  }
  if (confidence >= 0.25) {
    return 0.8;
  }
  return 0.7;
}

function findFoodByPrediction(className) {
  const normalized = className.toLowerCase();
  for (const food of FOOD_DB) {
    const matched = food.aliases.some((alias) => normalized.includes(alias));
    if (matched) {
      return food;
    }
  }
  return null;
}

function buildFallbackFood(className) {
  return {
    id: "fallback",
    name: `Невизначена страва (${className})`,
    perServing: { calories: 220, protein: 10, fat: 8, carbs: 25 }
  };
}

function calculateMacros(food, confidence) {
  const confidenceMultiplier = estimatePortionMultiplier(confidence);
  const portionMultiplier = Number(portionSliderEl.value || 1);
  const multiplier = confidenceMultiplier * portionMultiplier;
  return {
    calories: food.perServing.calories * multiplier,
    protein: food.perServing.protein * multiplier,
    fat: food.perServing.fat * multiplier,
    carbs: food.perServing.carbs * multiplier
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readStoredLog() {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function writeStoredLog() {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(dailyLog));
}

function getTodayLog() {
  const key = todayKey();
  return dailyLog.filter((entry) => entry.dateKey === key);
}

function renderTotals() {
  const todayLog = getTodayLog();
  const totals = todayLog.reduce(
    (acc, entry) => {
      acc.calories += entry.calories;
      acc.protein += entry.protein;
      acc.fat += entry.fat;
      acc.carbs += entry.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const todayCalories = round(totals.calories);
  totalCaloriesEl.textContent = `${todayCalories}`;
  const target = CALORIE_TARGETS[goalSelectEl.value] || CALORIE_TARGETS.maintain;
  targetCaloriesEl.textContent = `${target}`;
  const percent = target ? Math.min(200, round((todayCalories / target) * 100)) : 0;
  targetPercentEl.textContent = `${percent}`;
  targetProgressEl.value = Math.min(100, percent);
  macroRatioEl.textContent = `${round(totals.protein)} / ${round(totals.fat)} / ${round(totals.carbs)} г`;
}

function renderLog() {
  diaryListEl.innerHTML = "";
  const todayLog = getTodayLog();
  emptyLogEl.hidden = todayLog.length > 0;

  for (const entry of todayLog) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${entry.foodName}</strong>
        <small>${entry.time} • ${round(entry.calories)} ккал</small>
      </div>
      <button class="remove" data-id="${entry.id}" type="button">Видалити</button>
    `;
    diaryListEl.appendChild(li);
  }
  renderTotals();
}

function clearCurrentAnalysis() {
  currentImageDataUrl = "";
  currentAnalysis = null;
  imagePreview.removeAttribute("src");
  imagePreview.hidden = true;
  fileInput.value = "";
  setNutritionResult("", 0, null);
  saveEntryButton.disabled = true;
  chipsEl.innerHTML = "";
  updateAnalyzeButtonState();
}

function updateAnalyzeButtonState() {
  analyzeButton.disabled = !model || !currentImageDataUrl;
}

function handleImageSelected(file) {
  const reader = new FileReader();
  reader.onload = () => {
    currentImageDataUrl = reader.result;
    imagePreview.src = currentImageDataUrl;
    imagePreview.hidden = false;
    updateAnalyzeButtonState();
  };
  reader.readAsDataURL(file);
}

async function loadModel() {
  try {
    setModelStatus("Завантаження AI-моделі...");
    if (typeof mobilenet === "undefined") {
      throw new Error("MobileNet library is unavailable.");
    }
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setModelStatus("Модель готова до аналізу", true);
    updateAnalyzeButtonState();
  } catch (error) {
    setModelStatus("Помилка завантаження моделі");
    modelStatusEl.classList.add("error");
    console.error(error);
  }
}

async function analyzeCurrentImage() {
  if (!model || !currentImageDataUrl) {
    return;
  }
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Аналіз...";

  try {
    const predictions = await model.classify(imagePreview, 3);
    const topPrediction = predictions[0];
    if (!topPrediction) {
      throw new Error("No predictions");
    }

    const foundFood = findFoodByPrediction(topPrediction.className);
    const selectedFood = foundFood || buildFallbackFood(topPrediction.className);
    const macros = calculateMacros(selectedFood, topPrediction.probability);

    currentAnalysis = {
      foodId: selectedFood.id,
      foodName: selectedFood.name,
      confidence: topPrediction.probability,
      ...macros
    };

    setNutritionResult(selectedFood.name, topPrediction.probability, macros);
    chipsEl.innerHTML = "";
    predictions.forEach((p) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${p.className} — ${round(p.probability * 100)}%`;
      chipsEl.appendChild(chip);
    });
    saveEntryButton.disabled = false;
  } catch (error) {
    console.error(error);
    setNutritionResult("Помилка аналізу", 0, {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    });
  } finally {
    updateAnalyzeButtonState();
    analyzeButton.textContent = "AI-аналіз";
  }
}

function saveCurrentEntry() {
  if (!currentAnalysis) {
    return;
  }
  const now = new Date();
  const entry = {
    ...currentAnalysis,
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    dateKey: todayKey(),
    time: now.toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
  dailyLog.unshift(entry);
  writeStoredLog();
  renderLog();
  saveEntryButton.disabled = true;
}

function removeEntry(entryId) {
  dailyLog = dailyLog.filter((entry) => entry.id !== entryId);
  writeStoredLog();
  renderLog();
}

function clearTodayEntries() {
  const key = todayKey();
  dailyLog = dailyLog.filter((entry) => entry.dateKey !== key);
  writeStoredLog();
  renderLog();
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.hidden = true;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("SW registration failed", error);
    });
  }
}

function wireEvents() {
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageSelected(file);
    }
  });
  analyzeButton.addEventListener("click", analyzeCurrentImage);
  saveEntryButton.addEventListener("click", saveCurrentEntry);
  clearButton.addEventListener("click", clearCurrentAnalysis);
  clearDayButton.addEventListener("click", clearTodayEntries);

  portionSliderEl.addEventListener("input", () => {
    portionValueEl.textContent = `${Number(portionSliderEl.value).toFixed(1)}x`;
  });

  goalSelectEl.addEventListener("change", renderTotals);

  diaryListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("remove")) {
      removeEntry(target.dataset.id);
    }
  });
}

function init() {
  dailyLog = readStoredLog();
  clearCurrentAnalysis();
  renderLog();
  wireEvents();
  initInstallPrompt();
  registerServiceWorker();
  loadModel();
}

init();
