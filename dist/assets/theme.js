export function setTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem('safe-theme', document.documentElement.dataset.theme); } catch {}
  const button = document.getElementById('theme-toggle');
  if (button) { button.textContent = theme === 'dark' ? '☀ Modo claro' : '◐ Modo escuro'; button.setAttribute('aria-pressed', String(theme === 'dark')); }
}
let initial = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
try { initial = localStorage.getItem('safe-theme') || initial; } catch {}
setTheme(initial);
document.getElementById('theme-toggle')?.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
