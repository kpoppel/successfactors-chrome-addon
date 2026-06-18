import Database from './database.js';
import { generateCalendarHtml } from './calendar.js';
import { CalendarEventHandler } from './calendar-events.js';
import { generateOrgChartHtml } from './orgchart.js';
import { imageToBase64 } from './common.js';

function toSuccessFactorsDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `/Date(${Date.UTC(year, month - 1, day)})/`;
}

function calculateInclusiveDays(startDateStr, endDateStr) {
    const start = new Date(`${startDateStr}T00:00:00Z`);
    const end = new Date(`${endDateStr}T00:00:00Z`);
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function mergeExternalAbsencesIntoDatabase(db, externalAbsences) {
    if (!Array.isArray(externalAbsences) || externalAbsences.length === 0) return;

    const groupedByEmail = new Map();
    externalAbsences.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const email = (item.email || '').trim().toLowerCase();
        if (!email || !item.start_date || !item.end_date) return;
        if (!groupedByEmail.has(email)) groupedByEmail.set(email, []);
        groupedByEmail.get(email).push(item);
    });

    groupedByEmail.forEach((items, email) => {
        const existing = db.queryPersonByName(email) || {};
        const converted = items.map(item => ({
            startDate: toSuccessFactorsDate(item.start_date),
            endDate: toSuccessFactorsDate(item.end_date),
            quantityInDays: String(calculateInclusiveDays(item.start_date, item.end_date)),
            timeTypeName: item.absence_type || 'external-absence',
            approvalStatus: 'APPROVED',
            source: 'external_portal',
        }));
        const existingEmployeeTime = Array.isArray(existing.employeeTime)
            ? existing.employeeTime.filter(entry => entry?.source !== 'external_portal')
            : [];

        const person = db.normalizePerson({
            ...existing,
            userId: existing.userId || `ext_${email.replace(/[^a-z0-9]+/g, '_')}`,
            name: email,
            title: existing.title || 'External',
            external: true,
            team_name: existing.team_name || 'External',
            employeeTime: [...existingEmployeeTime, ...converted],
            holidays: existing.holidays || [],
            nonWorkingDates: existing.nonWorkingDates || [],
        });
        db.updatePersonData(person);
    });
}

async function fetchJson(url) {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
        const text = await resp.text().catch(() => resp.statusText);
        throw new Error(`${resp.status} ${text}`);
    }
    return await resp.json();
}

async function buildDatabase() {
    const dbDoc = await fetchJson('/api/teamdb');
    const db = new Database();
    db.loadYamlData(dbDoc);

    try {
        const sf = await fetchJson('/api/public/sf/absence-data');
        if (sf && sf.data && sf.data.d && Array.isArray(sf.data.d.results)) {
            db.loadHolidayData(sf.data);
        }
    } catch (e) {
        console.warn('No public SF absence payload available:', e.message);
    }

    try {
        const ext = await fetchJson('/api/public/external/absences');
        if (ext && Array.isArray(ext.items)) {
            mergeExternalAbsencesIntoDatabase(db, ext.items);
        }
    } catch (e) {
        console.warn('No public external absences available:', e.message);
    }

    return db;
}

async function renderCalendar(db) {
    const root = document.getElementById('public-view-root');
    if (!document.querySelector('link[href="/addon/styles/calendar.css"]')) {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = '/addon/styles/calendar.css';
        document.head.appendChild(cssLink);
    }
    const cakeEmojiBase64 = await imageToBase64('images/cake_emoji.png');
    const htmlContent = await generateCalendarHtml(db, cakeEmojiBase64);
    root.innerHTML = htmlContent;
    const handler = new CalendarEventHandler(root, cakeEmojiBase64);
    handler.init();
}

async function renderOrgChart(db) {
    const root = document.getElementById('public-view-root');
    const orgHtml = await generateOrgChartHtml(db, false);
    const parser = new DOMParser();
    const doc = parser.parseFromString(orgHtml, 'text/html');
    const bodyContent = doc.body.innerHTML;
    const styleNode = doc.head.querySelector('style');
    root.innerHTML = `${styleNode ? `<style>${styleNode.innerHTML}</style>` : ''}${bodyContent}`;
}

async function main() {
    const root = document.getElementById('public-view-root');
    const mode = window.__TEAMDB_PUBLIC_MODE__ || new URLSearchParams(window.location.search).get('mode') || 'calendar';
    try {
        const db = await buildDatabase();
        if (mode === 'orgchart') {
            await renderOrgChart(db);
        } else {
            await renderCalendar(db);
        }
    } catch (error) {
        root.innerHTML = `<div style="color:#b00020;background:#fff1f1;border:1px solid #ffcdd2;padding:12px;border-radius:8px"><strong>Error loading ${mode}:</strong> ${error.message}</div>`;
    }
}

main();
