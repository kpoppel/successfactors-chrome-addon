// calendar-ui.js
import { generateCalendarHtml } from './calendar.js';
import { CalendarEventHandler } from './calendar-events.js';
import { getDatabase, imageToBase64 } from './common.js';

let calendarEventHandler = null;

export async function showCalendarTab() {
    const tab = document.getElementById('calendar-tab');
    tab.innerHTML = 'Loading...';
    
    // Load and inject CSS if not already loaded
    if (!document.querySelector('link[href*="calendar.css"]')) {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = chrome.runtime.getURL('styles/calendar.css');
        document.head.appendChild(cssLink);
    }
    
    try {
        // Get the database instance
        const database = await getDatabase();
        console.log('Generating calendar with database - people count:', database.people.size);
        
        // Get cake emoji as base64 for birthday icons
        const cakeEmojiBase64 = await imageToBase64('images/cake_emoji.png');
        
        // Generate the calendar HTML (content only, not full document)
        const htmlContent = await generateCalendarHtml(database, cakeEmojiBase64);
        
        // Insert the HTML into the tab
        tab.innerHTML = htmlContent;
        
        // Initialize event handler with the tab container
        calendarEventHandler = new CalendarEventHandler(tab, cakeEmojiBase64);
        calendarEventHandler.init();
        
    } catch (error) {
        console.error('Error generating calendar:', error);
        tab.innerHTML = `<div class="uk-alert-danger" uk-alert>
            <p><strong>Error loading calendar:</strong> ${error.message}</p>
            <p>Please check that either a server URL is configured or a local database file is available.</p>
        </div>`;
    }
}
