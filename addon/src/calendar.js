import { imageToBase64, parseDate, downloadFile, getDatabase } from './common.js';

function getDateRangeFromDatabase(database) {
    const dates = [];
    for (const person of database.people.values()) {
        if (person.nonWorkingDates) {
            dates.push(...person.nonWorkingDates.map(d => new Date(d.date)));
        }
        if (person.holidays) {
            dates.push(...person.holidays.map(d => new Date(d.date)));
        }
    }
    
    if (dates.length === 0) {
        // Fallback to current year if no data
        const currentYear = new Date().getFullYear();
        return {
            startDate: new Date(currentYear, 0, 1),
            endDate: new Date(currentYear, 11, 31)
        };
    }
    
    return {
        startDate: new Date(Math.min(...dates)),
        endDate: new Date(Math.max(...dates))
    };
}

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
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
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
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
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
        // const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const utcCurrent = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
        const utcStart = Date.UTC(currentDate.getUTCFullYear(), 0, 0);
        const dayOfYear = Math.floor((utcCurrent - utcStart) / (1000 * 60 * 60 * 24));

        const dateString = currentDate.toISOString().split('T')[0];
        headers += `<th class="sticky sticky-top ${monthClass}" data-dayofyear="${dayOfYear}" data-date="${dateString}">${String(currentDate.getDate()).padStart(2, '0')}</th>`;
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    return headers;
}

function generateTeamFilters(database) {
    let filters = "";
    for (const team of database.teams.values()) {
        filters += `<div class='collapsible toggle-button' style='display: block; padding: 5px 15px; cursor: pointer; background-color: #f0f0f0; color: #333; border-radius: 3px; margin: 2px 0;'>${team.name}</div>`;
    }
    return filters;
}

function generateBirthdayFilter(include_birthdays) {
    if (!include_birthdays) {
        return '';
    }
    return `<div id="birthdayFilter" class="collapsible toggle-button" style="display: block; padding: 5px 15px; cursor: pointer; background-color: #f0f0f0; color: #333; border-radius: 3px; margin: 2px 0;">Birthdays</div>`;
}

function normalizeTeamName(name) {
        console.log('Normalizing team name class:', name, '->', name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
        return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        //console.log('Normalizing team name:', name, '->', name.replace(' ', '_'));
        //return name.replace(' ', '_');
    }


function generatePersonRows(database, startDate, endDate, include_birthdays) {
    let rows = "";
    
    // Process each person in the database
    const people = database.getAllPeople('name');
    console.log(people);
    for (const person of people) {
        // Skip people without team assignment or holiday data
        // NOTE: Comment this if you want to see all people regardless of data completeness
        if (!person.team_name || person.hasHolidayData === false) { //(!person.holidays && !person.nonWorkingDates)) {
            console.log('Skipping person without team or holiday data:', person.name);
            continue;
        }

        // Get all teams this person belongs to (including virtual teams)
        const teamClasses = [];
        if (person.team_name) {
            teamClasses.push(normalizeTeamName(person.team_name));
        }
        if (person.virtual_team && Array.isArray(person.virtual_team)) {
            person.virtual_team.forEach(teamName => {
                teamClasses.push(normalizeTeamName(teamName));
            });
        }

        // Precompute absences and date-specific data
        const nonWorkingDates = new Set((person.nonWorkingDates || []).map(d => d.date));
        const holidays = new Set((person.holidays || []).map(d => d.date));
        const absences = new Set();
        const pendingApproval = new Set();
        const pendingCancellation = new Set();

        if (person.employeeTime && Array.isArray(person.employeeTime)) {
            person.employeeTime.forEach(absence => {
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

        const birthday = person.birthday ? new Date(person.birthday) : null;
        if (include_birthdays) {
            // Generate row start with birthday info
            const teamClassesStr = teamClasses.join(' ');
            rows += birthday ? 
                `<tr class='${teamClassesStr}' data-birthday-month='${birthday.getMonth() + 1}'><td class='sticky sticky-left'>${person.name}</td>` :
                `<tr class='${teamClassesStr}'><td class='sticky sticky-left'>${person.name}</td>`;
        } else {
            const teamClassesStr = teamClasses.join(' ');
            rows += `<tr class='${teamClassesStr}'><td class='sticky sticky-left'>${person.name}</td>`;
        }

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

            if (include_birthdays && birthday && 
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
    }
    return rows;
}

// Export version for browser extension UI (returns just the calendar content without full HTML structure)
export async function generateCalendarHtml(database, cakeEmojiBase64) {
    const { startDate, endDate } = getDateRangeFromDatabase(database);
    const dateRangeTitle = `${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`;

    // Load content-only template (just the calendar content, no HTML document structure)
    const templateResponse = await fetch(chrome.runtime.getURL('templates/calendar-content.html'));
    let template = await templateResponse.text();

    // Replace placeholders
    const replacements = {
        '{{dateRangeTitle}}': dateRangeTitle,
        '{{birthdayFilter}}': generateBirthdayFilter(true),
        '{{teamFilters}}': generateTeamFilters(database),
        '{{monthHeaders}}': generateMonthHeaders(startDate, endDate),
        '{{weekHeaders}}': generateWeekHeaders(startDate, endDate),
        '{{dateHeaders}}': generateDateHeaders(startDate, endDate),
        '{{personRows}}': generatePersonRows(database, startDate, endDate, true)
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(placeholder, value);
    }

    return template;
}

// Internal version for download functionality
async function generateCalendarHtmlForDownload(database) {
    const { startDate, endDate } = getDateRangeFromDatabase(database);
    const dateRangeTitle = `${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })} - ${endDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    const cakeEmojiBase64 = await imageToBase64('images/cake_emoji.png');

    // Read the CalendarEventHandler source code to inline it
    const calendarEventsResponse = await fetch(chrome.runtime.getURL('src/calendar-events.js'));
    const calendarEventsCode = await calendarEventsResponse.text();
    
    // Extract just the class definition and helper functions, remove export and module-specific code
    const classCode = calendarEventsCode
        .replace(/export\s+class\s+CalendarEventHandler/g, 'class CalendarEventHandler')
        .replace(/export\s*{[^}]*};?/g, '')
        .replace(/import\s+{[^}]*}\s+from\s+['"][^'"]*['"];?/g, '')
        .replace(/\/\/ For standalone HTML usage[\s\S]*$/, ''); // Remove the standalone compatibility code at the end

    // Read the CSS file to inline it
    const cssResponse = await fetch(chrome.runtime.getURL('styles/calendar.css'));
    const cssContent = await cssResponse.text();

    // Read the calendar content template and process its placeholders
    const contentResponse = await fetch(chrome.runtime.getURL('templates/calendar-content.html'));
    let contentTemplate = await contentResponse.text();
    
    // Replace placeholders in the content template
    const contentReplacements = {
        '{{dateRangeTitle}}': dateRangeTitle,
        '{{birthdayFilter}}': generateBirthdayFilter(false),
        '{{teamFilters}}': generateTeamFilters(database),
        '{{monthHeaders}}': generateMonthHeaders(startDate, endDate),
        '{{weekHeaders}}': generateWeekHeaders(startDate, endDate),
        '{{dateHeaders}}': generateDateHeaders(startDate, endDate),
        '{{personRows}}': generatePersonRows(database, startDate, endDate, false)
    };

    for (const [placeholder, value] of Object.entries(contentReplacements)) {
        contentTemplate = contentTemplate.replace(placeholder, value);
    }

    // Load standalone template (with placeholder for embedded content, JavaScript and CSS)
    const templateResponse = await fetch(chrome.runtime.getURL('templates/calendar-standalone.html'));
    let template = await templateResponse.text();

    // Replace placeholders in the standalone template
    const replacements = {
        '{{calendarContent}}': contentTemplate,
        '{{cakeEmoji}}': cakeEmojiBase64,
        '{{calendarEventHandlerCode}}': classCode,
        '{{calendarCSS}}': cssContent
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(placeholder, value);
    }

    // Inject a generated timestamp footer (only for the downloadable standalone HTML)
    const generatedAt = new Date().toLocaleString();
    template = template.replace('{{generatedAtFooter}}', `Calendar generated: ${generatedAt}`);

    return template;
}

export async function generateCalendarAndDownload() {
    console.log('generateCalendarAndDownload() called');
    // Get the database instance which already contains all the necessary data
    const database = await getDatabase();
    console.log('Generating calendar with database - people count:', database.people.size);

    // Generate the calendar HTML using the database
    const htmlContent = await generateCalendarHtmlForDownload(database);

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