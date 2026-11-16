const THEME_KEY = "solution_architect_theme_v1";
const THEME_VALUES = new Set(["system", "light", "dark"]);
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const toggle = document.querySelector("#guide-theme-toggle");

function loadPreference() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEME_VALUES.has(value) ? value : "light";
  } catch {
    return "light";
  }
}

function applyPreference(preference) {
  const resolved = preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b1119" : "#eef3f6");
  if (toggle) {
    toggle.setAttribute("aria-checked", String(resolved === "dark"));
    toggle.title = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}

let preference = loadPreference();
applyPreference(preference);

toggle?.addEventListener("click", () => {
  const resolved = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  preference = resolved === "dark" ? "light" : "dark";
  applyPreference(preference);
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* The visual choice remains active for this page. */ }
});

const handleSystemThemeChange = () => { if (preference === "system") applyPreference(preference); };
if (typeof systemTheme.addEventListener === "function") systemTheme.addEventListener("change", handleSystemThemeChange);
else systemTheme.addListener?.(handleSystemThemeChange);
