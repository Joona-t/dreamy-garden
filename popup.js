/* popup.js — Dreamy Garden toolbar popup logic
   Must be a separate file; Chrome extensions block inline scripts via CSP. */
document.getElementById('play-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
});
