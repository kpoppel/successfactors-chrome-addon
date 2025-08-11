// calendar-events.js - Calendar event handling module
// This module can be used both in browser extension context and in standalone HTML

export class CalendarEventHandler {
    constructor(container = null, cakeEmojiSrc = null) {
        this.container = container || document; // fallback to document for standalone use
        this.cakeEmojiSrc = cakeEmojiSrc;
        this.initialized = false;
        this.pastDatesHidden = true; // Track state internally
    }

    // Initialize all event listeners
    init() {
        if (this.initialized) return;
        
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(() => {
            this.highlightCurrentDate();
            this.renderBirthdayIcons();
            this.setupEventListeners();
            this.hidePastDates(); // Apply default hide past dates
            
            this.initialized = true;
        }, 10);
    }

    setupEventListeners() {
        // Search input
        const searchInput = this.container.querySelector('#searchInput') || document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keyup', () => this.searchNames());
            console.log('Search input event listener attached');
        } else {
            console.log('Search input not found');
        }

        // Hide past dates toggle button
        const hidePastDatesButton = this.container.querySelector('#hidePastDates');
        if (hidePastDatesButton) {
            console.log('Toggle button found:', hidePastDatesButton);
            hidePastDatesButton.addEventListener('click', () => {
                console.log('Toggle button clicked! Internal state was:', this.pastDatesHidden);
                // Toggle our internal state
                this.pastDatesHidden = !this.pastDatesHidden;
                console.log('New internal state:', this.pastDatesHidden);
                
                // Update button appearance based on state
                if (this.pastDatesHidden) {
                    hidePastDatesButton.style.backgroundColor = '#007acc';
                    hidePastDatesButton.style.color = 'white';
                    hidePastDatesButton.classList.add('active');
                    console.log('Calling hidePastDates()');
                    this.hidePastDates();
                } else {
                    hidePastDatesButton.style.backgroundColor = '#f0f0f0';
                    hidePastDatesButton.style.color = '#333';
                    hidePastDatesButton.classList.remove('active');
                    console.log('Calling showAllDates()');
                    this.showAllDates();
                }
            });
            console.log('Hide past dates toggle button event listener attached');
        } else {
            console.log('Hide past dates toggle button not found');
        }

        // Team filter buttons
        this.setupTeamFilters();
        
        // Set "All" filter as active by default
        this.setDefaultActiveFilter();

        // Header click handlers
        this.setupHeaderClickHandlers();
    }

    setupTeamFilters() {
        // Find all collapsible elements for team filtering
        this.container.querySelectorAll('.collapsible').forEach(element => {
            element.addEventListener('click', () => {
                const text = element.textContent.trim();
                let teamName;
                
                if (text === 'All') teamName = 'all';
                else if (text === 'Absent today') teamName = 'absences';
                else if (text === 'Birthdays') teamName = 'birthdays';
                else teamName = text.replace(' ', '_');
                
                // Reset all filter buttons to inactive state
                this.container.querySelectorAll('.collapsible').forEach(btn => {
                    btn.style.backgroundColor = '#f0f0f0';
                    btn.style.color = '#333';
                    btn.classList.remove('active');
                });
                
                // Set clicked button to active state
                element.style.backgroundColor = '#007acc';
                element.style.color = 'white';
                element.classList.add('active');
                
                this.filterTeam(teamName);
            });
        });
    }

    setDefaultActiveFilter() {
        // Find the "All" filter button and make it active
        const allFilterButton = Array.from(this.container.querySelectorAll('.collapsible')).find(btn => 
            btn.textContent.trim() === 'All'
        );
        
        if (allFilterButton) {
            allFilterButton.style.backgroundColor = '#007acc';
            allFilterButton.style.color = 'white';
            allFilterButton.classList.add('active');
            console.log('Set "All" filter as default active filter');
        }
    }

    resetToAllFilter() {
        // Reset all filter buttons to inactive state
        this.container.querySelectorAll('.collapsible').forEach(btn => {
            btn.style.backgroundColor = '#f0f0f0';
            btn.style.color = '#333';
            btn.classList.remove('active');
        });
        
        // Find and activate the "All" filter button
        const allFilterButton = Array.from(this.container.querySelectorAll('.collapsible')).find(btn => 
            btn.textContent.trim() === 'All'
        );
        
        if (allFilterButton) {
            allFilterButton.style.backgroundColor = '#007acc';
            allFilterButton.style.color = 'white';
            allFilterButton.classList.add('active');
        }
        
        // Apply the "All" filter
        this.filterTeam('all');
        console.log('Reset team filter to "All"');
    }

    setupHeaderClickHandlers() {
        // Month headers
        this.container.querySelectorAll('thead tr:first-child th').forEach((th, index) => {
            if (index > 0 && th.textContent.trim()) {
                th.addEventListener('click', () => {
                    const monthIndex = new Date(`${th.textContent} 1, 2000`).getMonth();
                    this.resetToAllFilter(); // Reset team filter first
                    this.filterByMonth(monthIndex);
                });
            }
        });

        // Week headers
        this.container.querySelectorAll('thead tr:nth-child(2) th').forEach((th, index) => {
            if (index > 0 && th.textContent.includes('CW')) {
                th.addEventListener('click', () => {
                    const weekNumber = parseInt(th.textContent.replace('CW', ''), 10);
                    this.resetToAllFilter(); // Reset team filter first
                    this.filterByWeek(weekNumber);
                });
            }
        });

        // Date headers
        this.container.querySelectorAll('thead tr:last-child th').forEach((th, index) => {
            if (index > 0 && th.dataset.date) {
                th.addEventListener('click', () => {
                    const dateString = th.dataset.date;
                    if (dateString) {
                        this.resetToAllFilter(); // Reset team filter first
                        this.filterByDay(dateString);
                    }
                });
            }
        });
    }

    filterTeam(team) {
        this.container.querySelectorAll('tbody tr').forEach(row => {
            if (team === 'all') {
                row.classList.remove('hidden');
            } else if (team === 'birthdays') {
                const currentMonth = new Date().getMonth() + 1;
                const nextMonth = (currentMonth % 12) + 1;
                const birthdayMonth = parseInt(row.getAttribute('data-birthday-month'));
                if (birthdayMonth === currentMonth || birthdayMonth === nextMonth) {
                    row.classList.remove('hidden');
                } else {
                    row.classList.add('hidden');
                }
            } else if (team === 'absences') {
                // Find the current date cell index
                const currentDateCell = this.container.querySelector('thead tr:last-child th.current-date');
                if (!currentDateCell) {
                    row.classList.add('hidden');
                    return;
                }
                const dateRow = this.container.querySelector('thead tr:last-child');
                const allDateCells = Array.from(dateRow.children);
                const currentIndex = allDateCells.indexOf(currentDateCell);

                // Check if the cell at today's date has absence or non-working class
                const todayCell = row.children[currentIndex];
                if (todayCell && (todayCell.classList.contains('absence') || 
                    todayCell.classList.contains('absence_planned') || 
                    todayCell.classList.contains('absence_cancelled') || 
                    todayCell.classList.contains('non-working'))) {
                    row.classList.remove('hidden');
                } else {
                    row.classList.add('hidden');
                }
            } else {
                row.classList.add('hidden');
            }
        });

        if (team !== 'all' && team !== 'birthdays' && team !== 'absences') {
            this.container.querySelectorAll('.' + team).forEach(row => {
                row.classList.remove('hidden');
            });
        }
    }

    searchNames() {
        // Reset team filter to "All" when searching
        this.resetToAllFilter();
        
        const input = this.container.querySelector('#searchInput') || document.getElementById('searchInput');
        const filter = input.value.toLowerCase();
        this.container.querySelectorAll('tbody tr').forEach(row => {
            const name = row.querySelector('td').textContent.toLowerCase();
            if (name.includes(filter)) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
            }
        });
    }

    highlightCurrentDate() {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        console.log('Looking for current date:', todayString);
        
        const dateHeaders = this.container.querySelectorAll('thead tr:last-child th');
        console.log('Found', dateHeaders.length, 'date header cells');
        
        let foundCurrent = false;
        dateHeaders.forEach(th => {
            if (th.dataset.date === todayString) {
                th.classList.add('current-date');
                foundCurrent = true;
                console.log('Found and highlighted current date cell');
            } else {
                th.classList.remove('current-date');
            }
        });
        
        if (!foundCurrent) {
            console.log('Current date not found in headers. Available dates:', 
                Array.from(dateHeaders).map(th => th.dataset.date).filter(date => date));
        }
    }

    getCurrentDayOfYear() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    hidePastDates() {
        console.log('hidePastDates() called');
        
        // Find the date row first
        const dateRow = this.container.querySelector('thead tr:last-child');
        if (!dateRow) {
            console.log('No date row found');
            return;
        }
        
        const allDateCells = Array.from(dateRow.children);
        console.log('Found', allDateCells.length, 'date cells');
        
        // Find the current date cell within this row
        let fullRowCurrentIndex = -1;
        let currentDateCell = null;
        
        allDateCells.forEach((cell, index) => {
            if (cell.classList.contains('current-date')) {
                fullRowCurrentIndex = index;
                currentDateCell = cell;
            }
        });
        
        console.log('Current date cell found:', currentDateCell);
        console.log('Current date index:', fullRowCurrentIndex, 'out of', allDateCells.length, 'cells');
        
        if (fullRowCurrentIndex === -1) {
            console.log('No current date cell found in date row, skipping hidePastDates');
            return;
        }

        // Hide all date headers up to current date
        allDateCells.forEach((th, index) => {
            if (index > 0 && index < fullRowCurrentIndex) {
                th.classList.add('hidden');
            }
        });

        // Hide corresponding week headers
        const weekHeaders = this.container.querySelectorAll('thead tr:nth-child(2) th');
        let dateIndex = 1; // Skip the "Date" label column

        for (let i = 1; i < weekHeaders.length; i++) {
            const weekHeader = weekHeaders[i];
            const originalColspan = parseInt(weekHeader.getAttribute('colspan') || 1);
            let visibleDays = 0;

            // Count visible days in this week
            for (let j = 0; j < originalColspan; j++) {
                const dayCell = allDateCells[dateIndex + j];
                if (dayCell && !dayCell.classList.contains('hidden')) {
                    visibleDays++;
                }
            }

            if (visibleDays === 0) {
                weekHeader.classList.add('hidden');
            } else {
                // Update colspan to match number of visible days
                weekHeader.setAttribute('colspan', visibleDays);
            }
            dateIndex += originalColspan;
        }

        // Handle month headers visibility and adjust colspans
        const monthHeaders = this.container.querySelectorAll('thead tr:first-child th');
        dateIndex = 1; // Reset date index for month headers

        for (let i = 1; i < monthHeaders.length; i++) {
            const monthHeader = monthHeaders[i];
            const originalColspan = parseInt(monthHeader.getAttribute('colspan') || 1);
            let visibleDays = 0;

            // Count visible days in this month
            for (let j = 0; j < originalColspan; j++) {
                const dayCell = allDateCells[dateIndex + j];
                if (dayCell && !dayCell.classList.contains('hidden')) {
                    visibleDays++;
                }
            }

            if (visibleDays === 0) {
                monthHeader.classList.add('hidden');
            } else {
                // Update colspan to match number of visible days
                monthHeader.setAttribute('colspan', visibleDays);
            }
            dateIndex += originalColspan;
        }

        // Hide corresponding data cells in tbody
        this.container.querySelectorAll('tbody tr').forEach(row => {
            Array.from(row.children).forEach((cell, index) => {
                if (index > 0 && index < fullRowCurrentIndex) {
                    cell.classList.add('hidden');
                }
            });
        });
    }

    showAllDates() {
        // Show all cells except those hidden by other filters
        this.container.querySelectorAll('th.hidden, td.hidden').forEach(cell => {
            if (cell.classList.contains('hidden') && 
                !cell.parentElement.classList.contains('hidden')) {
                cell.classList.remove('hidden');
            }
        });

        // Restore original colspans for week headers
        const weekHeaders = this.container.querySelectorAll('thead tr:nth-child(2) th');
        weekHeaders.forEach(header => {
            const originalColspan = header.getAttribute('data-original-colspan');
            if (originalColspan) {
                header.setAttribute('colspan', originalColspan);
            }
        });

        // Restore original colspans for month headers
        const monthHeaders = this.container.querySelectorAll('thead tr:first-child th');
        monthHeaders.forEach(header => {
            const originalColspan = header.getAttribute('data-original-colspan');
            if (originalColspan) {
                header.setAttribute('colspan', originalColspan);
            }
        });

        // Show all data cells in tbody
        this.container.querySelectorAll('tbody tr').forEach(row => {
            Array.from(row.children).forEach(cell => {
                cell.classList.remove('hidden');
            });
        });
    }

    togglePastDates() {
        console.log('togglePastDates() called');
        const hidePastDatesCheckbox = this.container.querySelector('#hidePastDates');
        console.log('Checkbox found:', hidePastDatesCheckbox, 'checked:', hidePastDatesCheckbox?.checked);
        
        if (hidePastDatesCheckbox && hidePastDatesCheckbox.checked) {
            console.log('Calling hidePastDates()');
            this.hidePastDates();
        } else {
            console.log('Calling showAllDates()');
            this.showAllDates();
        }
    }

    renderBirthdayIcons() {
        document.querySelectorAll('.birthday').forEach(cell => {
            if (this.cakeEmojiSrc) {
                cell.innerHTML = `<img src="${this.cakeEmojiSrc}" alt="Birthday" style="width:20px;height:20px;">`;
            } else {
                cell.innerHTML = '🎂'; // Fallback to emoji
            }
        });
    }

    filterByMonth(monthIndex) {
        document.querySelectorAll('tbody tr').forEach(row => {
            let hasAbsence = false;
            Array.from(row.children).forEach((cell, index) => {
                if (index > 0 && cell.classList.contains('absence')) {
                    const cellMonth = new Date(cell.dataset.date).getMonth();
                    if (cellMonth === monthIndex) {
                        hasAbsence = true;
                    }
                }
            });
            if (hasAbsence) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
            }
        });
    }

    filterByWeek(weekNumber) {
        document.querySelectorAll('tbody tr').forEach(row => {
            let hasAbsence = false;
            Array.from(row.children).forEach((cell, index) => {
                if (index > 0 && cell.classList.contains('absence')) {
                    const cellWeek = this.getWeekNumber(new Date(cell.dataset.date));
                    if (cellWeek === weekNumber) {
                        hasAbsence = true;
                    }
                }
            });
            if (hasAbsence) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
            }
        });
    }

    filterByDay(dateString) {
        // Find the index of the clicked date cell
        const dateCell = Array.from(document.querySelectorAll('thead tr:last-child th')).find(th => th.dataset.date === dateString);
        if (!dateCell) return;

        const dateRow = document.querySelector('thead tr:last-child');
        const allDateCells = Array.from(dateRow.children);
        const targetIndex = allDateCells.indexOf(dateCell);

        document.querySelectorAll('tbody tr').forEach(row => {
            // Check if the cell at target date has absence or non-working class
            const targetCell = row.children[targetIndex];
            if (targetCell && (
                targetCell.classList.contains('absence') || 
                targetCell.classList.contains('absence_planned') || 
                targetCell.classList.contains('absence_cancelled') || 
                targetCell.classList.contains('non-working'))) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
            }
        });
    }

    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear + (firstDayOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60000) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }
}

// For standalone HTML usage (non-module context)
if (typeof window !== 'undefined' && !window.calendarEventHandler) {
    window.CalendarEventHandler = CalendarEventHandler;
}
