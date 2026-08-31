(function initializeTheme() {
  const key = "solution_architect_theme_v1";
  const allowed = new Set(["light", "dark", "system"]);
  let preference = "light";

  try {
    const saved = localStorage.getItem(key);
    if (allowed.has(saved)) preference = saved;
  } catch { /* Light remains the safe first-use default. */ }

  const resolved = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b1119" : "#eef3f6");
}());
