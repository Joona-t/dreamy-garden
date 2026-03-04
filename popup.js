/* popup.js — Dreamy Garden toolbar popup logic */
'use strict';

// Dark mode
chrome.storage.local.get(['darkMode'], ({ darkMode }) => {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
});
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  chrome.storage.local.set({ darkMode: !isDark });
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}
document.getElementById('btnDarkMode').addEventListener('click', toggleTheme);

const playBtn = document.getElementById('play-btn');
const toggle  = document.getElementById('newtab-toggle');

playBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') + '?play=1' });
});

chrome.storage.local.get('gameOnNewTab', ({ gameOnNewTab }) => {
    setToggleUI(gameOnNewTab !== false);
});

toggle.addEventListener('click', () => {
    const newState = !toggle.classList.contains('active');
    setToggleUI(newState);
    chrome.storage.local.set({ gameOnNewTab: newState });
});

toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle.click();
    }
});

function setToggleUI(enabled) {
    toggle.classList.toggle('active', enabled);
    toggle.setAttribute('aria-checked', String(enabled));
}
