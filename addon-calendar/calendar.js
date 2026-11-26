import { SfClient, AuthError, loadTree } from './api.js';
import { loadSettings, resolveDateRange } from './settings.js';

const statusEl = document.getElementById('status');
const chooserEl = document.getElementById('chooser');

function setStatus(text, isError = false) {
    statusEl.hidden = !text;
    statusEl.textContent = text;
    statusEl.className = isError ? 'error' : '';
}

function parseSfDate(value) {
    const m = /\/Date\((-?\d+)\)\//.exec(value);
    return m ? new Date(parseInt(m[1], 10)) : null;
}

const isoDay = (d) => d.toISOString().slice(0, 10);

function addDays(d, n) {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + n);
    return r;
}

function isoWeek(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

// Maps ISO date -> { cls, title } for one person.
function buildDayMap(person) {
    const days = new Map();
    const put = (date, cls, title, rank) => {
        const cur = days.get(date);
        if (!cur || cur.rank < rank) days.set(date, { cls, title, rank });
    };
    for (const h of person.holidays) put(h.date, 'absence', 'Holiday', 3);
    for (const n of person.nonWorkingDates) put(n.date, 'non-working', '', 4);
    const classByStatus = { APPROVED: ['absence', 2], PENDING: ['absence_planned', 1], PENDING_CANCELLATION: ['absence_cancelled', 1] };
    for (const a of person.employeeTime) {
        const entry = classByStatus[a.approvalStatus];
        const start = parseSfDate(a.startDate);
        const end = parseSfDate(a.endDate);
        if (!entry || !start || !end) continue;
        for (let d = start; d <= end; d = addDays(d, 1)) {
            put(isoDay(d), entry[0], a.timeTypeName || '', entry[1]);
        }
    }
    return days;
}

function el(tag, props = {}, text) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    if (text !== undefined) e.textContent = text;
    return e;
}

function renderCalendar(people, from, to, fetchedAt) {
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    const today = isoDay(new Date());
    const dates = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

    document.getElementById('title').textContent =
        `${people[0].name} - ${people.length} people - ${from} to ${to}`;
    document.getElementById('generated').textContent = `Data fetched: ${new Date(fetchedAt).toLocaleString()}`;

    // Header rows, with column ranges so colspans can be recomputed when past dates are hidden.
    const thead = el('thead');
    const groupRows = [
        { key: (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: (d) => d.toLocaleString('default', { month: 'long', timeZone: 'UTC' }), even: (d) => d.getUTCMonth() % 2 === 1 },
        { key: (d) => `${addDays(d, 4 - (d.getUTCDay() || 7)).getUTCFullYear()}-${isoWeek(d)}`, label: (d) => `CW${isoWeek(d)}`, even: () => false }
    ];
    for (const row of groupRows) {
        const tr = el('tr');
        tr.appendChild(el('th', { className: 'corner' }, ''));
        let i = 0;
        while (i < dates.length) {
            const k = row.key(dates[i]);
            let j = i;
            while (j < dates.length && row.key(dates[j]) === k) j++;
            const th = el('th', { className: row.even(dates[i]) ? 'even-month' : '' }, row.label(dates[i]));
            th.dataset.from = i;
            th.dataset.to = j - 1;
            th.colSpan = j - i;
            tr.appendChild(th);
            i = j;
        }
        thead.appendChild(tr);
    }
    const dayRow = el('tr');
    dayRow.appendChild(el('th', { className: 'corner' }, ''));
    for (const d of dates) {
        const iso = isoDay(d);
        const th = el('th', { className: [d.getUTCMonth() % 2 === 1 ? 'even-month' : '', iso < today ? 'past' : ''].join(' ').trim() },
            String(d.getUTCDate()).padStart(2, '0'));
        th.dataset.date = iso;
        if (iso === today) th.classList.add('current-date');
        dayRow.appendChild(th);
    }
    thead.appendChild(dayRow);

    // Body: one row per person in tree order; data-anc lists self plus all ancestors for subtree filters.
    const byId = new Map(people.map(p => [p.userId, p]));
    const managerIds = new Set(people.map(p => p.managerId).filter(Boolean));
    const tbody = el('tbody');
    for (const person of people) {
        const anc = [];
        for (let p = person; p; p = byId.get(p.managerId)) anc.push(p.userId);
        const days = buildDayMap(person);
        const tr = el('tr');
        tr.dataset.anc = ' ' + anc.join(' ') + ' ';
        tr.dataset.name = person.name.toLowerCase();
        const nameCell = el('td', { className: managerIds.has(person.userId) ? 'name manager' : 'name' }, person.name);
        nameCell.style.paddingLeft = `${4 + person.depth * 14}px`;
        tr.appendChild(nameCell);
        let absentToday = false;
        for (const d of dates) {
            const iso = isoDay(d);
            const day = days.get(iso);
            const cls = [day?.cls, d.getUTCMonth() % 2 === 1 ? 'even-month' : '', iso < today ? 'past' : ''].filter(Boolean).join(' ');
            const td = el('td', { className: cls });
            if (day?.title) td.title = day.title;
            if (iso === today) {
                td.classList.add('current-date');
                absentToday = day?.cls === 'absence';
            }
            tr.appendChild(td);
        }
        tr.dataset.absentToday = absentToday;
        tbody.appendChild(tr);
    }

    const table = document.getElementById('table');
    table.replaceChildren(thead, tbody);
    setupFilters(people, managerIds, table, dates, today);
}

function setupFilters(people, managerIds, table, dates, today) {
    const filtersEl = document.getElementById('filters');
    const searchInput = document.getElementById('searchInput');
    const rows = [...table.tBodies[0].rows];
    let current = { type: 'all' };

    const apply = () => {
        const q = searchInput.value.trim().toLowerCase();
        for (const row of rows) {
            let show = true;
            if (current.type === 'absent') show = row.dataset.absentToday === 'true';
            else if (current.type === 'manager') show = row.dataset.anc.includes(` ${current.id} `);
            if (show && q) show = row.dataset.name.includes(q);
            row.classList.toggle('hidden', !show);
        }
    };

    const buttons = [];
    const add = (label, filter, indent = 0) => {
        const b = el('div', { className: 'filter' }, label);
        b.style.marginLeft = `${indent * 10}px`;
        b.addEventListener('click', () => {
            buttons.forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            current = filter;
            apply();
        });
        buttons.push(b);
        filtersEl.appendChild(b);
        return b;
    };

    const pastBtn = el('div', { className: 'filter active' }, 'Hide past dates');
    pastBtn.addEventListener('click', () => {
        pastBtn.classList.toggle('active');
        setPastHidden(pastBtn.classList.contains('active'));
    });
    filtersEl.replaceChildren(pastBtn);

    add('All', { type: 'all' }).classList.add('active');
    add('Absent today', { type: 'absent' });
    for (const p of people) {
        if (managerIds.has(p.userId)) add(p.name, { type: 'manager', id: p.userId }, p.depth);
    }

    searchInput.oninput = apply;

    const firstVisible = dates.findIndex(d => isoDay(d) >= today);
    function setPastHidden(hidden) {
        table.classList.toggle('hide-past', hidden);
        const cut = hidden ? (firstVisible === -1 ? dates.length : firstVisible) : 0;
        for (const th of table.tHead.querySelectorAll('th[data-from]')) {
            const from = Math.max(Number(th.dataset.from), cut);
            const to = Number(th.dataset.to);
            th.hidden = from > to;
            th.colSpan = Math.max(1, to - from + 1);
        }
    }
    setPastHidden(true);
}

const cacheKey = (settings, from, to) => [settings.sf_host, settings.root_query.trim(), from, to].join('|');

async function run(rootId, settings, client) {
    chooserEl.hidden = true;
    const { from, to } = resolveDateRange(settings);
    setStatus('Loading reporting tree...');
    try {
        const people = await loadTree(client, rootId, from, to,
            (n, queried, pending) => setStatus(`Loaded ${n} people (${queried} queries, ${pending} pending)...`));
        const fetchedAt = Date.now();
        await chrome.storage.local.set({ tree_cache: { key: cacheKey(settings, from, to), rootId, people, fetchedAt } });
        setStatus('');
        document.getElementById('calendar').hidden = false;
        renderCalendar(people, from, to, fetchedAt);
    } catch (e) {
        handleError(e, settings);
    }
}

function handleError(e, settings) {
    if (e instanceof AuthError) {
        setStatus(`${e.message}. Log in to https://${settings.sf_host} in another tab (open the Team Absence Calendar once), then reload this page.`, true);
    } else {
        setStatus(e.message, true);
    }
}

async function main(forceRefresh = false) {
    const settings = await loadSettings();
    const query = settings.root_query.trim();
    if (!query) {
        setStatus('No root person configured. Open the extension options and set a name or user ID.', true);
        return;
    }
    const { from, to } = resolveDateRange(settings);
    const { x_ajax_token, tree_cache } = await chrome.storage.local.get(['x_ajax_token', 'tree_cache']);
    if (!forceRefresh && tree_cache?.key === cacheKey(settings, from, to)) {
        setStatus('');
        document.getElementById('calendar').hidden = false;
        return renderCalendar(tree_cache.people, from, to, tree_cache.fetchedAt);
    }
    const client = new SfClient(settings.sf_host, x_ajax_token);

    if (/^\d+$/.test(query)) return run(query, settings, client);

    setStatus(`Looking up "${query}"...`);
    let matches;
    try {
        matches = await client.findUsers(query);
    } catch (e) {
        return handleError(e, settings);
    }
    if (matches.length === 0) return setStatus(`No user found matching "${query}".`, true);
    if (matches.length === 1) return run(matches[0].userId, settings, client);

    setStatus('Several people match. Pick one:');
    chooserEl.hidden = false;
    chooserEl.replaceChildren(...matches.map(m => {
        const b = el('button', {}, `${m.name} (${m.userId})`);
        b.addEventListener('click', () => run(m.userId, settings, client));
        return b;
    }));
}

document.getElementById('refresh').addEventListener('click', () => main(true));
main();
