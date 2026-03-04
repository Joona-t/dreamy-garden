/* popup.js — Dreamy Garden toolbar popup logic */
'use strict';

// Theme system
const THEMES = ['dark', 'retro', 'beige', 'slate'];
function applyTheme(t) {
  THEMES.forEach(n => document.body.classList.remove('theme-' + n));
  document.body.classList.add('theme-' + t);
  const btn = document.getElementById('themeTab');
  if (btn) btn.textContent = t;
}
function cycleTheme() {
  const cur = THEMES.find(t => document.body.classList.contains('theme-' + t)) || 'retro';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}
chrome.storage.local.get(['theme', 'darkMode'], ({ theme, darkMode }) => {
  if (!theme && darkMode) theme = 'dark';
  applyTheme(theme || 'retro');
});
document.getElementById('themeTab').addEventListener('click', cycleTheme);

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
