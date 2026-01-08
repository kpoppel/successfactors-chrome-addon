import { downloadFile, getDatabase } from './common.js';

export async function generateIcsAndDownload() {
    console.log('generateIcsAndDownload() called');
    // Get the database instance which already contains all the necessary data
    const database = await getDatabase();
    console.log('Generating ICS with database - people count:', database.people.size);

    let calendarEvents = [];
    
    // Process each person in the database who has a birthday
    for (const person of database.people.values()) {
        if (person.birthday && person.birthday !== "") {
            const birthday = new Date(person.birthday);
            const currentYear = new Date().getFullYear();
            const event = {
                start: new Date(Date.UTC(currentYear, birthday.getMonth(), birthday.getDate())),
                end: new Date(Date.UTC(currentYear, birthday.getMonth(), birthday.getDate() + 1)),
                summary: `${person.name}'s Birthday`,
            };
            calendarEvents.push(event);
        }
    }

    console.log('Generated', calendarEvents.length, 'birthday events');
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
