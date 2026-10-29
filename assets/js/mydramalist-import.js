// API Gateway HTTP API in front of the Lambda in lambda/mdl-proxy/ — fetches
// MyDramaList server-side (Python's urllib, not Node's fetch/https, since
// Node's TLS client gets hit with Cloudflare's JS challenge on this site)
// and adds the CORS header the browser needs.
const MDL_PROXY_ENDPOINT = 'https://c6u6x63iif.execute-api.us-east-1.amazonaws.com';

function normalizeMyDramaListUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) {
        return null;
    }
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    if (!/^https?:\/\/(www\.)?mydramalist\.com\/dramalist\//i.test(url)) {
        return null;
    }
    return url;
}

function tierIndexForScore(score, numTiers) {
    if (Number.isNaN(score)) {
        return numTiers - 1;
    }
    const clamped = Math.min(10, Math.max(0, score));
    const idx = Math.floor(((10 - clamped) / 10) * numTiers);
    return Math.min(numTiers - 1, Math.max(0, idx));
}

async function fetchMyDramaListHtml(url) {
    const proxied = `${MDL_PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxied);
    if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Couldn't reach MyDramaList (HTTP ${response.status}). Try again in a moment.`);
    }
    return response.text();
}

function parseMyDramaListEntries(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('table.msv2-table tbody tr');
    const entries = [];

    rows.forEach((row) => {
        const titleAnchor = row.querySelector('.msv2-item--title a.title');
        const img = row.querySelector('.msv2-item--cover img');
        if (!titleAnchor || !img) {
            return;
        }

        const title = titleAnchor.getAttribute('title') || titleAnchor.textContent.trim();
        const poster = img.getAttribute('data-src') || img.getAttribute('src');
        const scoreEl = row.querySelector('.msv2-i-score .score');
        const scoreText = scoreEl ? scoreEl.textContent.trim() : '';
        const score = scoreText === '' ? NaN : parseFloat(scoreText);

        entries.push({ title, poster, score });
    });

    return entries;
}

function clearAllTierContent() {
    document.querySelectorAll('#tableBody tr').forEach((row) => {
        const content = row.children[1];
        if (content) {
            content.innerHTML = '';
        }
    });
}

function addEntryToBoard(entry) {
    const rows = document.querySelectorAll('#tableBody tr');
    const tierIdx = tierIndexForScore(entry.score, rows.length);
    const content = rows[tierIdx].children[1];

    return fetch(entry.poster)
        .then((res) => {
            if (!res.ok) {
                throw new Error('poster fetch failed');
            }
            return res.blob();
        })
        .then((blob) => new Promise((resolve) => {
            loadImageAndAddToDOM(blob, false, (el) => {
                el.alt = entry.title;
                el.title = Number.isNaN(entry.score) ? entry.title : `${entry.title} (${entry.score})`;
                content.appendChild(el);
                resolve();
            });
        }));
}

function setMdlImportStatus(message, isError) {
    const status = document.getElementById('mdlImportStatus');
    if (!status) {
        return;
    }
    status.textContent = message;
    status.classList.toggle('text-danger', !!isError);
}

async function importFromMyDramaList() {
    const input = document.getElementById('mdlUrlInput');
    const button = document.getElementById('btn-mdl-import');
    const url = normalizeMyDramaListUrl(input.value);

    if (!url) {
        setMdlImportStatus('Please paste a MyDramaList list URL, e.g. https://mydramalist.com/dramalist/123456/completed', true);
        return;
    }

    const hasExistingContent = document.querySelectorAll('#tableBody td img').length > 0;
    if (hasExistingContent && !window.confirm('This will clear the current tier list and replace it with your MyDramaList ratings. Continue?')) {
        return;
    }

    button.disabled = true;
    setMdlImportStatus('Fetching your list…', false);

    try {
        const html = await fetchMyDramaListHtml(url);
        const entries = parseMyDramaListEntries(html);

        if (entries.length === 0) {
            throw new Error('No dramas found on that page. Make sure the list is public and the URL points to a MyDramaList list page.');
        }

        clearAllTierContent();
        setMdlImportStatus(`Loading ${entries.length} posters…`, false);

        let loaded = 0;
        let failed = 0;
        await Promise.all(entries.map((entry) => addEntryToBoard(entry)
            .then(() => { loaded += 1; })
            .catch(() => { failed += 1; })));

        setMdlImportStatus(
            failed === 0
                ? `Imported ${loaded} dramas from MyDramaList.`
                : `Imported ${loaded} dramas (${failed} poster${failed === 1 ? '' : 's'} failed to load).`,
            failed > 0 && loaded === 0
        );
    } catch (err) {
        setMdlImportStatus(err.message || 'Something went wrong while importing your list.', true);
    } finally {
        button.disabled = false;
    }
}
