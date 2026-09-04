/* The folder picker lives in this page rather than in the popup: opening a
   system dialog from the toolbar popup closes it, and the chosen handle would
   die with the page that asked for it. */
const elements = {
    supported: document.getElementById('supported'),
    unsupported: document.getElementById('unsupported'),
    current: document.getElementById('current'),
    choose: document.getElementById('choose'),
    forget: document.getElementById('forget'),
    confirm: document.getElementById('confirm'),
    message: document.getElementById('message')
};

function say(text, isError = false) {
    elements.message.textContent = text || '';
    elements.message.classList.toggle('error', Boolean(isError));
}

async function show() {
    const handle = await SaveFolder.recall();

    if (!handle) {
        elements.current.textContent = 'No folder chosen yet — Download saves to the browser’s download folder.';
        elements.forget.classList.add('hidden');
        elements.confirm.classList.add('hidden');
        return;
    }

    const state = await SaveFolder.permission(handle);
    elements.current.innerHTML = 'Saving into <span class="folder-name"></span>';
    elements.current.querySelector('.folder-name').textContent = handle.name;
    elements.forget.classList.remove('hidden');

    /* Chrome drops folder access between sessions unless it was granted for
       good. Confirming it here beats confirming it from the popup, which the
       permission prompt would close. */
    elements.confirm.classList.toggle('hidden', state === 'granted');
    if (state !== 'granted') {
        say('Chrome needs you to confirm access to this folder again before the next save.');
    }
}

elements.choose.addEventListener('click', async () => {
    try {
        const handle = await SaveFolder.choose();
        await show();
        say(`Articles will be saved into "${handle.name}".`);
    } catch (error) {
        // The picker throws this when the user closes it; that is not a failure.
        if (error && error.name === 'AbortError') return;
        console.error('[Options] Could not choose the folder:', error);
        say(`Could not use that folder: ${error.message}`, true);
    }
});

elements.confirm.addEventListener('click', async () => {
    try {
        const handle = await SaveFolder.recall();
        const state = await SaveFolder.permission(handle, { request: true });
        await show();
        say(state === 'granted'
            ? 'Access confirmed — saving works again.'
            : 'Access is still refused. Choose the folder again to restore it.', state !== 'granted');
    } catch (error) {
        say(`Could not confirm access: ${error.message}`, true);
    }
});

elements.forget.addEventListener('click', async () => {
    try {
        await SaveFolder.forget();
        await show();
        say('Download saves to the browser’s download folder again.');
    } catch (error) {
        say(`Could not forget the folder: ${error.message}`, true);
    }
});

(async () => {
    const target = SaveFolder.isSupported() ? elements.supported : elements.unsupported;
    target.classList.remove('hidden');
    if (SaveFolder.isSupported()) await show();
})();
