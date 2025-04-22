import { imageToBase64, parseDate, getDateRange, downloadFile } from './common.js';

function generateMonthHeaders(startDate, endDate) {
    let headers = '';
    let currentDate = new Date(startDate);
    let month = currentDate.getMonth();
    let colspan = 0;
    
    while (currentDate <= endDate) {
        if (currentDate.getMonth() !== month) {
            // Invert the even/odd logic by using (month + 1) % 2
            const monthClass = (month + 1) % 2 === 0 ? 'even-month-header' : '';
            headers += `<th class="sticky sticky-top ${monthClass}" colspan="${colspan}" data-original-colspan="${colspan}">${new Date(1900, month, 1).toLocaleString('default', { month: 'long' })}</th>`;
            month = currentDate.getMonth();
            colspan = 0;
        }
        colspan++;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    // Invert the even/odd logic here as well
    const monthClass = (month + 1) % 2 === 0 ? 'even-month-header' : '';
    headers += `<th class="sticky sticky-top ${monthClass}" colspan="${colspan}" data-original-colspan="${colspan}">${new Date(1900, month, 1).toLocaleString('default', { month: 'long' })}</th>`;
    return headers;
}

function generateWeekHeaders(startDate, endDate) {
    let headers = '';
    let currentDate = new Date(startDate);
    let currentWeek = getWeekNumber(currentDate);
    let colspan = 0;

    while (currentDate <= endDate) {
        const weekNumber = getWeekNumber(currentDate);

        if (weekNumber !== currentWeek) {
            headers += `<th class="sticky sticky-top" colspan="${colspan}" data-original-colspan="${colspan}">CW${currentWeek}</th>`;
            currentWeek = weekNumber;
            colspan = 0;
        }

        colspan++;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Add the last week number
    headers += `<th class="sticky sticky-top" colspan="${colspan}" data-original-colspan="${colspan}">CW${currentWeek}</th>`;
    return headers;
}

function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOffset = (firstDayOfYear.getDay() + 6) % 7; // Adjust to make Monday the first day
    const adjustedFirstDay = new Date(firstDayOfYear);
    adjustedFirstDay.setDate(firstDayOfYear.getDate() - dayOffset);

    const dayOfWeek = (date.getDay() + 6) % 7; // Adjust to make Monday = 0
    const adjustedDate = new Date(date);
    adjustedDate.setDate(date.getDate() - dayOfWeek);

    const pastDaysOfYear = (adjustedDate - adjustedFirstDay + (adjustedFirstDay.getTimezoneOffset() - adjustedDate.getTimezoneOffset()) * 60000) / 86400000;
    return Math.ceil((pastDaysOfYear + 1) / 7);
}

function generateDateHeaders(startDate, endDate) {
    let headers = '';
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const monthClass = (currentDate.getMonth() + 1) % 2 === 0 ? 'even-month-header' : '';
        const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const dateString = currentDate.toISOString().split('T')[0];
        headers += `<th class="sticky sticky-top ${monthClass}" data-dayofyear="${dayOfYear}" data-date="${dateString}">${String(currentDate.getDate()).padStart(2, '0')}</th>`;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return headers;
}

function generateTeamFilters(teams) {
    let filters = "";
    for (const team of teams) {
        filters += `<div class='collapsible' onclick="filterTeam('${team.name.replace(' ', '_')}')">${team.name}</div>`;
    }
    return filters;
}

function generatePersonRows(teams, data, startDate, endDate) {
    let rows = "";
    // Create a mapping of members to all teams they belong to
    const memberToTeams = new Map();
    teams.forEach(team => {
        team.members.forEach(member => {
            if (member.name) {
                if (!memberToTeams.has(member.name)) {
                    memberToTeams.set(member.name, new Set());
                }
                memberToTeams.get(member.name).add(team.name.replace(' ', '_'));
            }
            if (member.also) {
                const alsoNames = Array.isArray(member.also) ? member.also : [member.also];
                alsoNames.forEach(alsoName => {
                    if (!memberToTeams.has(alsoName)) {
                        memberToTeams.set(alsoName, new Set());
                    }
                    memberToTeams.get(alsoName).add(team.name.replace(' ', '_'));
                });
            }
        });
    });

    teams.forEach(team => {
        team.members.forEach(member => {
            if (!member.name) return;
            
            const userData = data.find(item => item.username === member.name);
            if (!userData) return;

            // Precompute absences and date-specific data
            const nonWorkingDates = new Set(JSON.parse(userData.nonWorkingDates).map(d => d.date));
            const holidays = new Set(JSON.parse(userData.holidays).map(d => d.date));
            const absences = new Set();
            const pendingApproval = new Set();
            const pendingCancellation = new Set();

            if (userData.employeeTimeNav) {
                userData.employeeTimeNav.results.forEach(absence => {
                    const start = parseDate(absence.startDate);
                    const end = parseDate(absence.endDate);
                    if (!start || !end) return;

                    // Create dates using UTC to avoid timezone offset issues
                    const utcStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
                    const utcEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

                    const currentDate = new Date(Date.UTC(utcStart.getUTCFullYear(), utcStart.getUTCMonth(), utcStart.getUTCDate()));
                    while (currentDate <= utcEnd) {
                        const dateStr = currentDate.toISOString().split('T')[0];
                        if (absence.approvalStatus === 'APPROVED') {
                            absences.add(dateStr);
                        } else if (absence.approvalStatus === 'PENDING') {
                            pendingApproval.add(dateStr);
                        } else if (absence.approvalStatus === 'PENDING_CANCELLATION') {
                            pendingCancellation.add(dateStr);
                        }
                        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                    }
                });
            }

            // Generate row start with birthday info
            const birthday = member.birthday ? new Date(member.birthday) : null;
            const teamClasses = Array.from(memberToTeams.get(member.name)).join(' ');
            rows += birthday ? 
                `<tr class='${teamClasses}' data-birthday-month='${birthday.getMonth() + 1}'><td class='sticky sticky-left'>${member.name}</td>` :
                `<tr class='${teamClasses}'><td class='sticky sticky-left'>${member.name}</td>`;

            // Generate date cells
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                // Use UTC methods to avoid DST issues
                const dateStr = currentDate.toISOString().split('T')[0];
                const classes = [];
                
                if (nonWorkingDates.has(dateStr)) classes.push('non-working');
                else if (holidays.has(dateStr) || absences.has(dateStr)) classes.push('absence');
                else if (pendingApproval.has(dateStr)) classes.push('absence_planned');
                else if (pendingCancellation.has(dateStr)) classes.push('absence_cancelled');

                if (birthday && 
                    currentDate.getUTCMonth() === birthday.getUTCMonth() && 
                    currentDate.getUTCDate() === birthday.getUTCDate()) {
                    classes.push('birthday');
                }
                if ((currentDate.getUTCMonth() + 1) % 2 === 0) classes.push('even-month');

                const classString = classes.length ? ` class='${classes.join(' ')}'` : '';
                rows += `<td${classString} data-date="${dateStr}"></td>`;

                // Use UTC methods to increment the date
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            rows += "</tr>";
        });
    });
    return rows;
}

async function generateCalendarHtml(absenceData, teams) {
    const { startDate, endDate } = getDateRange(absenceData.d.results);
    const dateRangeTitle = `${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    const cakeEmojiBase64 = await imageToBase64('images/cake_emoji.png');

    // Load template
    const templateResponse = await fetch(chrome.runtime.getURL('templates/calendar.html'));
    let template = await templateResponse.text();

    // Replace placeholders
    const replacements = {
        '{{dateRangeTitle}}': dateRangeTitle,
        '{{teamFilters}}': generateTeamFilters(teams),
        '{{monthHeaders}}': generateMonthHeaders(startDate, endDate),
        '{{weekHeaders}}': generateWeekHeaders(startDate, endDate),
        '{{dateHeaders}}': generateDateHeaders(startDate, endDate),
        '{{personRows}}': generatePersonRows(teams, absenceData.d.results, startDate, endDate),
        '{{cakeEmoji}}': cakeEmojiBase64
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(placeholder, value);
    }

    return template;
}

export async function generateCalendarAndDownload(absenceData) {
    // Fetch team data from the extension's config files
    const teamsResponse = await fetch(chrome.runtime.getURL('config/teams.yaml'));
    const teams = jsyaml.load(await teamsResponse.text());

    // Generate the calendar HTML
    const htmlContent = await generateCalendarHtml(absenceData, teams.teams);

    // Compress the HTML content using pako
    const compressed = pako.gzip(htmlContent);
    const base64Encoded = btoa(String.fromCharCode.apply(null, compressed));

    // Create the wrapper HTML with decompression logic
    const wrapperHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Holiday Calendar</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.0.3/pako.min.js"></script>
</head>
<body>
    <div id="content"></div>
    <script>
        function loadAndExecuteScripts(htmlString) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            const scripts = tempDiv.querySelectorAll('script');
            scripts.forEach(script => {
                const newScript = document.createElement('script');
                Array.from(script.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(script.innerHTML));
                document.body.appendChild(newScript);
            });
            document.getElementById('content').innerHTML = tempDiv.innerHTML;
        }

        const compressedData = '${base64Encoded}';
        const decodedData = atob(compressedData);
        const uint8Array = Uint8Array.from(decodedData, char => char.charCodeAt(0));
        const decompressedData = pako.inflate(uint8Array, { to: 'string' });
        loadAndExecuteScripts(decompressedData);
    </script>
</body>
</html>
`;

    // Create and trigger download
    downloadFile(wrapperHtml, 'calendar.html', 'text/html');
}