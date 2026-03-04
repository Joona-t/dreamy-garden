/* newtab-gate.js — Check toggle before loading the game engine.
   Reads chrome.storage.local on page load; if game is disabled,
   shows a "napping" screen instead of injecting game.js. */
'use strict';

(async function gate() {
    const forcePlay = new URLSearchParams(location.search).has('play');
    const { gameOnNewTab } = await chrome.storage.local.get('gameOnNewTab');

    if (!forcePlay && gameOnNewTab === false) {
        document.querySelector('.game-root').style.display = 'none';
        const paused = document.getElementById('paused-screen');
        paused.style.display = '';

        document.getElementById('enable-btn').addEventListener('click', async () => {
            await chrome.storage.local.set({ gameOnNewTab: true });
            location.reload();
        });
        return;
    }

    const s = document.createElement('script');
    s.src = 'game.js';
    document.body.appendChild(s);
})();
