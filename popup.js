/* popup.js — Dreamy Garden toolbar popup logic */
'use strict';

// Theme — uses shared lovespark-theme.js
LoveSparkTheme.init();

// aria-expanded tracking for theme dropdown
(function trackDropdownAria() {
  const toggle = document.getElementById('themeToggle');
  const menu = document.getElementById('themeMenu');
  if (toggle && menu) {
    const observer = new MutationObserver(() => {
      toggle.setAttribute('aria-expanded', String(menu.classList.contains('open')));
    });
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
})();

const playBtn = document.getElementById('play-btn');
const toggle  = document.getElementById('newtab-toggle');

playBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') + '?play=1' });
});

chrome.storage.local.get(['gameOnNewTab'], ({ gameOnNewTab }) => {
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

/* ── Author / Ko-fi Footer ── */
document.body.insertAdjacentHTML('beforeend', LoveSparkFooter.render());
