const CONCURRENCY = 5;

export class AuthError extends Error {}

export class SfClient {
    constructor(host, token) {
        this.base = `https://${host}/odata/v2`;
        this.token = token;
    }

    async get(url) {
        const headers = { accept: 'application/json' };
        if (this.token) headers['x-ajax-token'] = this.token;
        const response = await fetch(url, { credentials: 'include', headers });
        if (response.status === 401 || response.status === 403) {
            throw new AuthError(`Not authorised (HTTP ${response.status})`);
        }
        if (!response.ok) throw new Error(`SuccessFactors request failed: HTTP ${response.status}`);
        return response.json();
    }

    // Returns [{userId, name}] for a name fragment.
    async findUsers(name) {
        // defaultFullName is not filterable (HTTP 400); match every word against firstName or lastName.
        const filter = name.trim().split(/\s+/)
            .map(t => t.replace(/'/g, "''"))
            .map(t => `(substringof('${t}',firstName) eq true or substringof('${t}',lastName) eq true)`)
            .join(' and ');
        const url = `${this.base}/User?$select=userId,firstName,lastName&$top=20&$filter=${encodeURIComponent(filter).replace(/'/g, '%27')}`;
        const data = await this.get(url);
        return data.d.results.map(u => ({ userId: u.userId, name: `${u.firstName} ${u.lastName}` }));
    }

    async queryReports(userId, from, to, includeSelf) {
        const groups = includeSelf
            ? "(userGroup eq 'SELECTED_USER' or userGroup eq 'DIRECT_REPORT')"
            : "userGroup eq 'DIRECT_REPORT'";
        const filter = `userId eq '${userId}' and ${groups} and skipJobInfoRead eq false and viewKey eq 'keyMonthView'`;
        const select = 'nonWorkingDates,userGroup,username,userId,holidays,employeeTimeNav/startDate,employeeTimeNav/endDate,employeeTimeNav/timeTypeName,employeeTimeNav/approvalStatus';
        const url = `${this.base}/restricted/TeamAbsences,TeamAbsenceCalendar,TeamAbsenceCalendarUserConfig/TeamAbsenceCalendar`
            + `?$skip=0&$top=5000&$filter=${encodeURIComponent(filter).replace(/'/g, '%27')}`
            + `&$select=${select}&$expand=employeeTimeNav&fromDate=${from}&toDate=${to}`;
        const data = await this.get(url);
        return data.d.results;
    }
}

function toPerson(entry, managerId, depth) {
    return {
        userId: entry.userId,
        name: entry.username,
        managerId,
        depth,
        holidays: JSON.parse(entry.holidays || '[]'),
        nonWorkingDates: JSON.parse(entry.nonWorkingDates || '[]'),
        employeeTime: entry.employeeTimeNav?.results || []
    };
}

/**
 * Walks the reporting tree below rootId. Every discovered person is queried
 * as a manager; people who return no reports are leaves.
 * Returns people in depth-first order.
 */
export async function loadTree(client, rootId, from, to, onProgress) {
    const people = new Map();
    const children = new Map();
    const queue = [rootId];
    const seen = new Set([rootId]);
    let queried = 0;

    async function visit(managerId) {
        const isRoot = managerId === rootId;
        const entries = await client.queryReports(managerId, from, to, isRoot);
        const depth = (isRoot ? 0 : people.get(managerId).depth) + 1;
        const kids = [];
        for (const entry of entries) {
            if (entry.userId === managerId && !isRoot) continue;
            if (isRoot && entry.userId === rootId) {
                people.set(rootId, toPerson(entry, null, 0));
                continue;
            }
            if (people.has(entry.userId)) continue;
            people.set(entry.userId, toPerson(entry, managerId, depth));
            kids.push(entry.userId);
            if (!seen.has(entry.userId)) {
                seen.add(entry.userId);
                queue.push(entry.userId);
            }
        }
        children.set(managerId, kids);
        queried++;
        onProgress?.(people.size, queried, queue.length);
    }

    // Level-synchronised pool: parents are always registered before their children are visited.
    while (queue.length) {
        const batch = queue.splice(0, CONCURRENCY);
        await Promise.all(batch.map(visit));
    }

    if (!people.has(rootId)) throw new Error(`No data returned for user ${rootId}`);

    const ordered = [];
    (function walk(id) {
        const p = people.get(id);
        if (!p) return;
        ordered.push(p);
        const kids = (children.get(id) || [])
            .map(k => people.get(k))
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const k of kids) walk(k.userId);
    })(rootId);
    return ordered;
}
