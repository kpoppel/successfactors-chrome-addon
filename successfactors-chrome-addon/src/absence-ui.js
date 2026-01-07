// src/absence-ui.js
// Renders a table of all employees with their absence information
import { getDatabase } from './common.js';
import { initializeTableHandlers, resetTableInitialization } from './absence-ui-table-handlers.js';
import { calculateTotalAvailableHolidays, calculateRemainingHolidays } from './holiday-accrual-calculator.js';

// Holiday urgency color constants
const HOLIDAY_COLORS = {
    NOTICE: '#ffffcc',   // light yellow - 8-6 weeks left
    WARNING: '#ffcc99',  // light orange - 6-4 weeks left  
    CRITICAL: '#ffcccc'  // light red - <4 weeks left
};

class AbsenceTableGenerator {
    constructor(db) {
        this.db = db;
        this.absenceTypes = db.getAllAbsenceTypes();
        this.orderedAbsenceTypes = this.getOrderedAbsenceTypes();
        this.showExtraColumns = false; // Default to hidden
        console.log('Database loaded:', this.db);
        console.log('Available absence types:', this.absenceTypes);
        console.log('Ordered absence types:', this.orderedAbsenceTypes);
    }

    /**
     * Get the priority column configuration
     * This can be easily modified to change the column order
     */
    getPriorityColumns() {
        return ['Extra Holiday', 'Holiday', 'Vacation'];
    }

    /**
     * Get priority absence types that exist in the data
     */
    getPriorityAbsenceTypes() {
        const priorityColumns = this.getPriorityColumns();
        return this.orderedAbsenceTypes.filter(type => priorityColumns.includes(type));
    }

    /**
     * Get non-priority absence types (extra columns)
     */
    getNonPriorityAbsenceTypes() {
        const priorityColumns = this.getPriorityColumns();
        return this.orderedAbsenceTypes.filter(type => !priorityColumns.includes(type));
    }

    /**
     * Orders absence types with priority columns first, then the rest alphabetically
     */
    getOrderedAbsenceTypes() {
        const priorityColumns = this.getPriorityColumns();
        const orderedTypes = [];
        
        // Add priority columns first (only if they exist in the data)
        priorityColumns.forEach(priorityType => {
            if (this.absenceTypes.includes(priorityType)) {
                orderedTypes.push(priorityType);
            }
        });
        
        // Add remaining columns alphabetically
        const remainingTypes = this.absenceTypes
            .filter(type => !priorityColumns.includes(type))
            .sort();
        
        orderedTypes.push(...remainingTypes);
        
        return orderedTypes;
    }

    /**
     * Calculate holiday urgency based on expiration dates and remaining days
     */
    calculateHolidayUrgency(person, remainingHolidays) {
        const today = new Date();
        const currentYear = today.getFullYear();
        
        // Key dates
        const extraHolidayExpiry = new Date(currentYear, 7, 31); // Aug 31st
        const standardHolidayExpiry = new Date(currentYear, 11, 31); // Dec 31st
        
        let urgencyData = {
            color: null,
            tooltip: null,
            weeksLeft: null,
            daysLeft: null,
            reason: null
        };
        
        let tooltipParts = [];
        let highestSeverity = 0;

        if (person.site === 'LY') {
            // For LY: Check both special and standard holidays
            const specialDays = remainingHolidays.specialRemaining || 0;
            const standardDays = remainingHolidays.standardRemaining || 0;
            
            // Check special holidays first
            if (specialDays > 0) {
                const msLeft = extraHolidayExpiry - today;
                const weeksLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24 * 7));
                
                let specialSeverity = 0;
                let specialColor = null;
                
                // Time-based urgency for special days (no percentage-based for extra holidays)
                if (weeksLeft <= 8 && weeksLeft > 0) {
                    if (weeksLeft <= 4) {
                        specialSeverity = 3;
                        specialColor = HOLIDAY_COLORS.CRITICAL;
                    } else if (weeksLeft <= 6) {
                        specialSeverity = 2;
                        specialColor = HOLIDAY_COLORS.WARNING;
                    } else {
                        specialSeverity = 1;
                        specialColor = HOLIDAY_COLORS.NOTICE;
                    }
                    tooltipParts.push(`${specialDays} special holidays expire in ${weeksLeft} weeks (Aug 31st)`);
                }
                
                if (specialSeverity > highestSeverity) {
                    highestSeverity = specialSeverity;
                    urgencyData.color = specialColor;
                }
            }
            
            // Always check standard days for LY site (even if special days exist)
            if (standardDays > 0) {
                const msLeft = standardHolidayExpiry - today;
                const weeksLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24 * 7));
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                // Account for 4 months of new holidays (Sep-Dec = ~8.3 days at 2.08/month)
                const newHolidaysToAccrue = 4 * 2.08;
                const effectiveRemaining = Math.max(0, standardDays - newHolidaysToAccrue);
                
                let standardSeverity = 0;
                let standardColor = null;
                
                // Time-based urgency for standard days
                if (weeksLeft <= 8 && weeksLeft > 0 && effectiveRemaining > 0) {
                    if (weeksLeft <= 4) {
                        standardSeverity = Math.max(standardSeverity, 3);
                        standardColor = HOLIDAY_COLORS.CRITICAL;
                    } else if (weeksLeft <= 6) {
                        standardSeverity = Math.max(standardSeverity, 2);
                        standardColor = HOLIDAY_COLORS.WARNING;
                    } else {
                        standardSeverity = Math.max(standardSeverity, 1);
                        standardColor = HOLIDAY_COLORS.NOTICE;
                    }
                    tooltipParts.push(`${effectiveRemaining.toFixed(1)} standard holidays need to be taken in ${weeksLeft} weeks (after accounting for ${newHolidaysToAccrue.toFixed(1)} new days to accrue)`);
                }
                
                // Percentage-based urgency for standard days
                if (daysLeft > 0) {
                    const percentageOfTimeLeft = standardDays / daysLeft;
                    let percentageSeverity = 0;
                    
                    if (percentageOfTimeLeft >= 0.4) {
                        percentageSeverity = 3;
                        tooltipParts.push(`${standardDays} standard holidays = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (CRITICAL)`);
                    } else if (percentageOfTimeLeft >= 0.3) {
                        percentageSeverity = 2;
                        tooltipParts.push(`${standardDays} standard holidays = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (WARNING)`);
                    } else if (percentageOfTimeLeft >= 0.2) {
                        percentageSeverity = 1;
                        tooltipParts.push(`${standardDays} standard holidays = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (NOTICE)`);
                    }
                    
                    if (percentageSeverity > standardSeverity) {
                        standardSeverity = percentageSeverity;
                        if (percentageSeverity === 3) standardColor = HOLIDAY_COLORS.CRITICAL;
                        else if (percentageSeverity === 2) standardColor = HOLIDAY_COLORS.WARNING;
                        else if (percentageSeverity === 1) standardColor = HOLIDAY_COLORS.NOTICE;
                    }
                }
                
                if (standardSeverity > highestSeverity) {
                    highestSeverity = standardSeverity;
                    urgencyData.color = standardColor;
                }
            }
        } else {
            // For ERL: Check vacation days expiring Dec 31st
            const totalRemaining = parseFloat(remainingHolidays.displayText) || 0;
            if (totalRemaining > 0) {
                const msLeft = standardHolidayExpiry - today;
                const weeksLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24 * 7));
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                // Account for 4 months of new holidays (Sep-Dec = ~10 days at 2.5/month)
                const newHolidaysToAccrue = 4 * 2.5;
                const effectiveRemaining = Math.max(0, totalRemaining - newHolidaysToAccrue);
                
                let erlSeverity = 0;
                let erlColor = null;
                
                // Time-based urgency
                if (weeksLeft <= 8 && weeksLeft > 0 && effectiveRemaining > 0) {
                    if (weeksLeft <= 4) {
                        erlSeverity = Math.max(erlSeverity, 3);
                        erlColor = HOLIDAY_COLORS.CRITICAL;
                    } else if (weeksLeft <= 6) {
                        erlSeverity = Math.max(erlSeverity, 2);
                        erlColor = HOLIDAY_COLORS.WARNING;
                    } else {
                        erlSeverity = Math.max(erlSeverity, 1);
                        erlColor = HOLIDAY_COLORS.NOTICE;
                    }
                    tooltipParts.push(`${effectiveRemaining.toFixed(1)} holidays need to be taken in ${weeksLeft} weeks (after accounting for ${newHolidaysToAccrue.toFixed(1)} new days to accrue)`);
                }
                
                // Percentage-based urgency for ERL vacation days
                if (daysLeft > 0) {
                    const percentageOfTimeLeft = totalRemaining / daysLeft;
                    let percentageSeverity = 0;
                    
                    if (percentageOfTimeLeft >= 0.4) {
                        percentageSeverity = 3;
                        tooltipParts.push(`${totalRemaining} vacation days = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (CRITICAL)`);
                    } else if (percentageOfTimeLeft >= 0.3) {
                        percentageSeverity = 2;
                        tooltipParts.push(`${totalRemaining} vacation days = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (WARNING)`);
                    } else if (percentageOfTimeLeft >= 0.2) {
                        percentageSeverity = 1;
                        tooltipParts.push(`${totalRemaining} vacation days = ${(percentageOfTimeLeft * 100).toFixed(1)}% of remaining time until Dec 31st (NOTICE)`);
                    }
                    
                    if (percentageSeverity > erlSeverity) {
                        erlSeverity = percentageSeverity;
                        if (percentageSeverity === 3) erlColor = HOLIDAY_COLORS.CRITICAL;
                        else if (percentageSeverity === 2) erlColor = HOLIDAY_COLORS.WARNING;
                        else if (percentageSeverity === 1) erlColor = HOLIDAY_COLORS.NOTICE;
                    }
                }
                
                if (erlSeverity > highestSeverity) {
                    highestSeverity = erlSeverity;
                    urgencyData.color = erlColor;
                }
            }
        }
        
        // Combine all tooltip parts with newlines
        if (tooltipParts.length > 0) {
            urgencyData.tooltip = tooltipParts.join('\n');
        }

        return urgencyData;
    }

    /**
     * Get numerical severity of a color for comparison
     */
    getColorSeverity(color) {
        switch (color) {
            case HOLIDAY_COLORS.NOTICE: return 1;
            case HOLIDAY_COLORS.WARNING: return 2;
            case HOLIDAY_COLORS.CRITICAL: return 3;
            default: return 0;
        }
    }

    async generateAbsenceTable() {
        // Load template
        const templateResponse = await fetch(chrome.runtime.getURL('templates/absence-ui-table.html'));
        let template = await templateResponse.text();

        // Generate dynamic table headers and content
        const tableHeaders = this.generateTableHeaders();
        const tableContent = this.generateTableContent();

        // Replace placeholders
        const replacements = {
            '{{tableHeaders}}': tableHeaders,
            '{{tableContent}}': tableContent
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.replace(placeholder, value);
        }

        return template;
    }

    generateTableHeaders() {
        let headers = '';
        
        // Generate headers for priority absence types
        const priorityTypes = this.getPriorityAbsenceTypes();
        priorityTypes.forEach(absenceType => {
            const columnId = this.getColumnId(absenceType);
            headers += `
                <th data-column="${columnId}" class="priority-column">
                    <div class="header-content">
                        <div class="header-title">${absenceType}<span class="sort-indicator"></span></div>
                        <input type="text" class="column-search" data-column="${columnId}" placeholder="Search...">
                    </div>
                </th>
            `;
        });

        // Add toggle column for extra columns
        const nonPriorityTypes = this.getNonPriorityAbsenceTypes();
        if (nonPriorityTypes.length > 0) {
            const toggleSymbol = this.showExtraColumns ? '−' : '+';
            const toggleTitle = this.showExtraColumns ? 'Hide extra columns' : 'Show extra columns';
            headers += `
                <th class="toggle-column" data-toggle="extra-columns">
                    <div class="header-content">
                        <div class="header-title toggle-button" title="${toggleTitle}">${toggleSymbol}</div>
                    </div>
                </th>
            `;

            // Generate headers for non-priority absence types (extra columns)
            if (this.showExtraColumns) {
                nonPriorityTypes.forEach(absenceType => {
                    const columnId = this.getColumnId(absenceType);
                    headers += `
                        <th data-column="${columnId}" class="extra-column">
                            <div class="header-content">
                                <div class="header-title">${absenceType}<span class="sort-indicator"></span></div>
                                <input type="text" class="column-search" data-column="${columnId}" placeholder="Search...">
                            </div>
                        </th>
                    `;
                });
            }
        }

        return headers;
    }

    getColumnId(absenceType) {
        // Convert absence type name to a valid column ID
        return 'spent_' + absenceType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    /**
     * Toggle the visibility of extra columns and regenerate the table
     */
    async toggleExtraColumns() {
        this.showExtraColumns = !this.showExtraColumns;
        
        // Regenerate and update the table
        const tableHtml = await this.generateAbsenceTable();
        const tableContainer = document.querySelector('#absenceTable').parentElement;
        tableContainer.innerHTML = tableHtml.match(/<table[\s\S]*<\/table>/)[0];
        
        // Re-initialize table handlers
        const { resetTableInitialization, initializeTableHandlers } = await import('./absence-ui-table-handlers.js');
        resetTableInitialization();
        initializeTableHandlers();
        
        // Re-add absence event handlers by calling the global function
        window.reAddAbsenceEventHandlers();
        
        // Re-add toggle event handlers
        this.addToggleEventHandlers();
    }

    /**
     * Add event handlers for the toggle buttons
     */
    addToggleEventHandlers() {
        // Add click handlers for toggle buttons in headers only
        const toggleHeaders = document.querySelectorAll('.toggle-column .toggle-button');
        toggleHeaders.forEach(button => {
            button.addEventListener('click', () => {
                this.toggleExtraColumns();
            });
            button.style.cursor = 'pointer';
        });
    }

    generateTableContent() {
        const people = this.db.getAllPeople();
        // Filter out external users
        const internalPeople = people.filter(person => !person.external);
        return internalPeople.map(person => this.generateTableRow(person)).join('');
    }

    generateTableRow(person) {
        const availableHolidays = calculateTotalAvailableHolidays(person);
        const spentByType = this.db.getSpentDaysByType(person.userId);
        
        // Calculate remaining holidays using site-specific spending breakdown
        let remainingHolidays;
        if (person.site === 'LY') {
            // For LY: Pass specific breakdown to calculator
            remainingHolidays = calculateRemainingHolidays(person, {
                extraHoliday: spentByType['Extra Holiday'] || 0,
                holiday: spentByType['Holiday'] || 0,
                total: (spentByType['Holiday'] || 0) + (spentByType['Extra Holiday'] || 0)
            });
        } else {
            // For ERL: Use "Vacation" absence type for spending
            const totalSpent = spentByType['Vacation'] || 0;
            remainingHolidays = calculateRemainingHolidays(person, totalSpent);
        }
        
        // Base cells
        const cells = [
            { value: person.name || '', readonly: true },
            { value: person.site || 'LY', type: 'site', options: ['LY', 'ERL'] },
            { value: person.carry_over_holidays || 0, type: 'carry_over_holidays', editable: true },
            { value: availableHolidays, type: 'available_holidays', readonly: true },
            { value: remainingHolidays, type: 'remaining_holidays', readonly: true, person: person }
        ];

        // Add spent days cells for priority absence types
        const priorityTypes = this.getPriorityAbsenceTypes();
        priorityTypes.forEach(absenceType => {
            const spentDays = spentByType[absenceType] || 0;
            cells.push({
                value: spentDays,
                type: 'spent_days',
                readonly: true,
                absenceType: absenceType,
                cssClass: 'priority-column'
            });
        });

        // Add toggle column for extra columns
        const nonPriorityTypes = this.getNonPriorityAbsenceTypes();
        if (nonPriorityTypes.length > 0) {
            // Empty cell for toggle column in data rows (only header has the toggle button)
            cells.push({
                value: '',
                type: 'toggle_column',
                readonly: true,
                cssClass: 'toggle-column'
            });

            // Add spent days cells for non-priority absence types (if shown)
            if (this.showExtraColumns) {
                nonPriorityTypes.forEach(absenceType => {
                    const spentDays = spentByType[absenceType] || 0;
                    cells.push({
                        value: spentDays,
                        type: 'spent_days',
                        readonly: true,
                        absenceType: absenceType,
                        cssClass: 'extra-column'
                    });
                });
            }
        }

        console.log('Generating row for person:', person, 'with cells:', cells);
        return `
            <tr data-userid="${person.userId}">
                ${cells.map(cell => this.generateTableCell(cell)).join('')}
            </tr>
        `;
    }

    generateTableCell(cellConfig) {
        const cssClass = cellConfig.cssClass || '';
        
        if (cellConfig.type === 'carry_over_holidays') {
            return `<td class="${cssClass}"><input type="number" class="table-input carry-over-input" value="${cellConfig.value}" min="0" max="999"></td>`;
        }
        
        if (cellConfig.type === 'site') {
            return `<td class="${cssClass}">
                <select class="table-select site-select">
                    ${cellConfig.options.map(option => 
                        `<option value="${option}" ${option === cellConfig.value ? 'selected' : ''}>${option}</option>`
                    ).join('')}
                </select>
            </td>`;
        }
        
        if (cellConfig.type === 'available_holidays') {
            return `<td class="${cssClass}"><span class="readonly-text available-holidays">${cellConfig.value}</span></td>`;
        }
        
        if (cellConfig.type === 'remaining_holidays') {
            const remainingData = cellConfig.value;
            const siteClass = remainingData.site?.toLowerCase() || 'ly';
            
            // Calculate urgency coloring
            const urgency = this.calculateHolidayUrgency(cellConfig.person, remainingData);
            const styleAttr = urgency.color ? ` style="background-color: ${urgency.color};"` : '';
            const tooltipAttr = urgency.tooltip ? ` title="${urgency.tooltip}"` : '';
            
            if (remainingData.site === 'ERL') {
                return `<td class="${cssClass}"${styleAttr}${tooltipAttr}><span class="readonly-text remaining-holidays remaining-${siteClass}">${remainingData.displayText}</span></td>`;
            } else {
                // LY site: Show special/standard split with tooltips
                return `<td class="${cssClass}"${styleAttr}${tooltipAttr}>
                    <div class="remaining-holidays remaining-${siteClass}">
                        <span class="special-days" title="Special days (expire Aug 31st)">${remainingData.specialRemaining || 0}</span>
                        <span class="separator">/</span>
                        <span class="standard-days" title="Standard days (carry-over + monthly accrued)">${remainingData.standardRemaining || 0}</span>
                    </div>
                </td>`;
            }
        }
        
        if (cellConfig.type === 'toggle_column') {
            // Only show toggle button if there's a value (header), otherwise empty cell
            if (cellConfig.value) {
                return `<td class="toggle-cell ${cssClass}"><span class="toggle-button" title="Toggle extra columns">${cellConfig.value}</span></td>`;
            } else {
                return `<td class="toggle-cell ${cssClass}"></td>`;
            }
        }
        
        if (cellConfig.type === 'spent_days') {
            const displayValue = cellConfig.value > 0 ? cellConfig.value : '';
            return `<td class="${cssClass}"><span class="readonly-text spent-days" title="${cellConfig.absenceType} days spent">${displayValue}</span></td>`;
        }
        
        if (cellConfig.readonly) {
            return `<td class="${cssClass}"><span class="readonly-text">${cellConfig.value}</span></td>`;
        }

        return `<td class="${cssClass}">${cellConfig.value}</td>`;
    }
}

let currentTableGenerator = null; // Store the current table generator instance
let currentDatabase = null; // Store the current database instance

// Global function to re-add absence event handlers after table regeneration
window.reAddAbsenceEventHandlers = function() {
    if (currentDatabase) {
        addAbsenceEventHandlers(currentDatabase);
    }
};

export async function showAbsenceTab() {
    const tab = document.getElementById('absence-tab');
    tab.innerHTML = 'Loading...';

    // Load and inject CSS (use absence-specific styles)
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('styles/absence-ui-table.css');
    if (!document.querySelector('link[href="' + cssLink.href + '"]')) {
        document.head.appendChild(cssLink);
    }

    try {
        const db = await getDatabase();
        currentDatabase = db; // Store for later use
        currentTableGenerator = new AbsenceTableGenerator(db);
        const tableHtml = await currentTableGenerator.generateAbsenceTable();
        
        tab.innerHTML = tableHtml;

        // Add event handlers after the table is rendered
        addAbsenceEventHandlers(db);
        
        // Add toggle event handlers
        currentTableGenerator.addToggleEventHandlers();
        
        // Reset initialization flag and initialize table handlers
        resetTableInitialization();
        initializeTableHandlers();
    } catch (error) {
        console.error('Error loading absence UI:', error);
        tab.innerHTML = `<div class="uk-alert-danger" uk-alert>
            <p><strong>Error loading absence data:</strong> ${error.message}</p>
            <p>Please check that either a server URL is configured or a local database file is available.</p>
        </div>`;
    }
}

function addAbsenceEventHandlers(db) {
    // Function to recalculate and update both available and remaining holidays for a row
    function updateHolidayDisplays(row, person) {
        const availableHolidaysElement = row.querySelector('.available-holidays');
        const remainingHolidaysElement = row.querySelector('.remaining-holidays');
        
        if (availableHolidaysElement) {
            const updatedHolidays = calculateTotalAvailableHolidays(person);
            availableHolidaysElement.textContent = updatedHolidays;
        }
        
        if (remainingHolidaysElement) {
            // Recalculate remaining holidays using site-specific spending breakdown
            const spentByType = db.getSpentDaysByType(person.userId);
            let remainingHolidays;
            
            if (person.site === 'LY') {
                // For LY: Pass specific breakdown to calculator
                remainingHolidays = calculateRemainingHolidays(person, {
                    extraHoliday: spentByType['Extra Holiday'] || 0,
                    holiday: spentByType['Holiday'] || 0,
                    total: (spentByType['Holiday'] || 0) + (spentByType['Extra Holiday'] || 0)
                });
            } else {
                // For ERL: Use "Vacation" absence type for spending
                const totalSpent = spentByType['Vacation'] || 0;
                remainingHolidays = calculateRemainingHolidays(person, totalSpent);
            }
            
            // Calculate urgency coloring for the updated data
            const tableGenerator = currentTableGenerator; // Access the current generator instance
            const urgency = tableGenerator ? tableGenerator.calculateHolidayUrgency(person, remainingHolidays) : { color: null, tooltip: null };
            
            // Apply background color based on urgency
            const parentCell = remainingHolidaysElement.closest('td');
            if (parentCell) {
                parentCell.style.backgroundColor = urgency.color || '';
                parentCell.title = urgency.tooltip || '';
            }
            
            if (remainingHolidays.site === 'ERL') {
                remainingHolidaysElement.textContent = remainingHolidays.displayText;
            } else {
                // Update LY site display
                const specialElement = remainingHolidaysElement.querySelector('.special-days');
                const standardElement = remainingHolidaysElement.querySelector('.standard-days');
                
                if (specialElement) specialElement.textContent = remainingHolidays.specialRemaining || 0;
                if (standardElement) standardElement.textContent = remainingHolidays.standardRemaining || 0;
            }
        }
    }

    // Add event handlers for carry-over holiday inputs
    const carryOverInputs = document.querySelectorAll('.carry-over-input');
    carryOverInputs.forEach(input => {
        input.addEventListener('blur', (event) => {
            const row = event.target.closest('tr');
            const userId = row.dataset.userid;
            const newValue = parseInt(event.target.value) || 0;
            
            // Update the database
            const success = db.updatePersonByUserId(userId, { 
                carry_over_holidays: newValue 
            });
            
            if (success) {
                console.log(`Updated carry-over holidays for ${userId} to ${newValue}`);
                // Update holiday displays (carry-over affects both available and remaining)
                const person = db.queryPerson(userId);
                if (person) {
                    updateHolidayDisplays(row, person);
                }
                // Visual feedback - briefly highlight the input
                event.target.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    event.target.style.backgroundColor = '';
                }, 1000);
            } else {
                console.error(`Failed to update carry-over holidays for ${userId}`);
                event.target.style.backgroundColor = '#f8d7da';
                setTimeout(() => {
                    event.target.style.backgroundColor = '';
                }, 1000);
            }
        });
        
        // Also save on Enter key
        input.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.target.blur(); // Trigger the blur event
            }
        });
    });

    // Add event handlers for site selects
    const siteSelects = document.querySelectorAll('.site-select');
    siteSelects.forEach(select => {
        select.addEventListener('change', (event) => {
            const row = event.target.closest('tr');
            const userId = row.dataset.userid;
            const newValue = event.target.value;
            
            // Update the database
            const success = db.updatePersonByUserId(userId, { 
                site: newValue 
            });
            
            if (success) {
                console.log(`Updated site for ${userId} to ${newValue}`);
                // Update holiday displays (site affects both available and remaining calculations)
                const person = db.queryPerson(userId);
                if (person) {
                    updateHolidayDisplays(row, person);
                }
                // Visual feedback - briefly highlight the select
                event.target.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    event.target.style.backgroundColor = '';
                }, 1000);
            } else {
                console.error(`Failed to update site for ${userId}`);
                event.target.style.backgroundColor = '#f8d7da';
                setTimeout(() => {
                    event.target.style.backgroundColor = '';
                }, 1000);
            }
        });
    });
}
