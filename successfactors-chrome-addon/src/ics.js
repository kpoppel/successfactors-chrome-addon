import { downloadFile } from './common.js';

export async function generateIcsAndDownload(absenceData) {
    const teamsResponse = await fetch(chrome.runtime.getURL('config/teams.yaml'));
    const teams = jsyaml.load(await teamsResponse.text());

    let calendarEvents = [];
    
    teams.teams.forEach(team => {
        team.members.forEach(member => {
            if (member.birthday && member.birthday !== "") {
                const birthday = new Date(member.birthday);
                const currentYear = new Date().getFullYear();
                const event = {
                    start: new Date(Date.UTC(currentYear, birthday.getMonth(), birthday.getDate())),
                    end: new Date(Date.UTC(currentYear, birthday.getMonth(), birthday.getDate() + 1)),
                    summary: `${member.name}'s Birthday`,
                };
                calendarEvents.push(event);
            }
        });
    });

    const icsContent = generateICS(calendarEvents);
    downloadFile(icsContent, 'birthdays.ics', 'text/calendar');
}

function generateICS(events) {
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//kpoppel//SFcalChrExt v1.0//EN',
    ];

    events.forEach(event => {
        icsContent.push(
            'BEGIN:VEVENT',
            `DTSTART;VALUE=DATE:${formatDate(event.start)}`,
            `DTEND;VALUE=DATE:${formatDate(event.end)}`,
            `SUMMARY:${event.summary}`,
            'TRANSP:TRANSPARENT',
            'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
            'X-MICROSOFT-CDO-IMPORTANCE:1',
            //'PRIORITY:5',
            //'RRULE:FREQ=YEARLY;BYMONTHDAY=24;BYMONTH=10',
             'END:VEVENT'
        );
    });

    icsContent.push('END:VCALENDAR');
    return icsContent.join('\r\n');
}

function formatDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('T')[0];
}
