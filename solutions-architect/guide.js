const THEME_KEY = "solution_architect_theme_v1";
const THEME_VALUES = new Set(["system", "light", "dark"]);
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const select = document.querySelector("#guide-theme-select");

function loadPreference() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEME_VALUES.has(value) ? value : "system";
  } catch {
    return "system";
  }
}

function applyPreference(preference) {
  const resolved = preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  if (select) select.value = preference;
}

let preference = loadPreference();
applyPreference(preference);

select?.addEventListener("change", () => {
  if (!THEME_VALUES.has(select.value)) return;
  preference = select.value;
  applyPreference(preference);
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* The visual choice remains active for this page. */ }
});

const handleSystemThemeChange = () => { if (preference === "system") applyPreference(preference); };
if (typeof systemTheme.addEventListener === "function") systemTheme.addEventListener("change", handleSystemThemeChange);
else systemTheme.addListener?.(handleSystemThemeChange);
