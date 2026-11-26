export const DEFAULTS = {
    sf_host: 'performancemanager5.successfactors.eu',
    root_query: '',          // person name or numeric user ID
    date_mode: 'rolling',    // 'rolling' | 'fixed'
    months_back: 1,
    months_forward: 6,
    from_date: '',           // YYYY-MM-DD, used when date_mode is 'fixed'
    to_date: ''
};

export async function loadSettings() {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
}

export function formatDate(d) {
    return d.toISOString().slice(0, 10);
}

export function resolveDateRange(s) {
    if (s.date_mode === 'fixed' && s.from_date && s.to_date) {
        return { from: s.from_date, to: s.to_date };
    }
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - Number(s.months_back), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + Number(s.months_forward) + 1, 0));
    return { from: formatDate(from), to: formatDate(to) };
}
