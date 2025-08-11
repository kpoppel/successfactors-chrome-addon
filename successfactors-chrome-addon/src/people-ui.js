// src/people-ui.js
// Renders a table of all employees with Name, Birthday, Title, Team, and Manager.
import { getDatabase } from './common.js';
import { initializeTableHandlers, resetTableInitialization } from './people-ui-table-handlers.js';

class PeopleTableGenerator {
    constructor(db) {
        this.db = db;
        this.teamNames = db.getAllTeamNames();
        this.managers = db.getAllManagers();
        console.log('Database loaded:', this.db);
    }

    async generatePeopleTable() {
        // Load template
        const templateResponse = await fetch(chrome.runtime.getURL('templates/people-ui-table.html'));
        let template = await templateResponse.text();

        // Replace placeholders
        const replacements = {
            '{{headers}}': this.generateHeaders(),
            '{{tableContent}}': this.generateTableContent()
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.replace(placeholder, value);
        }

        return template;
    }

    generateHeaders() {
        const sortableColumns = ['Name', 'Birthday', 'Title', 'Team(s)', 'Legal Manager', 'Functional Manager', 'External', 'Virtual Teams'];
        const headers = [...sortableColumns, 'Actions'];
        
        return headers.map(header => {
            if (header === 'External') {
                return `<th data-column="external">
                    <div class="header-content">
                        <div class="header-title">
                            ${header}
                            <span class="sort-indicator"></span>
                        </div>
                        <select class="column-search" data-column="external">
                            <option value="">All</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                        </select>
                    </div>
                </th>`;
            }
            if (header === 'Virtual Teams') {
                return `<th data-column="virtual_team">
                    <div class="header-content">
                        <div class="header-title">${header}</div>
                        <input type="text" class="column-search" data-column="virtual_team" placeholder="Search virtual teams...">
                    </div>
                </th>`;
            }
            if (header === 'Actions') {
                return `<th><button class="add-person-button" title="Add new person">➕</button></th>`;
            }

            const columnName = header.toLowerCase()
                .replace('(s)', '')
                .replace(' ', '_');
            return `<th data-column="${columnName}">
                <div class="header-content">
                    <div class="header-title">
                        ${header}
                        <span class="sort-indicator"></span>
                    </div>
                    <input type="text" class="column-search" data-column="${columnName}" placeholder="Search...">
                </div>
            </th>`;
        }).join('');
    }

    generateTableContent() {
        const people = this.db.getAllPeople();
        return people.map(person => this.generateTableRow(person)).join('');
    }

    generateTableRow(person) {
        const availableTeams = this.teamNames.filter(team => team !== person.team_name);
        
        const cells = [
            { value: person.name || '', editable: true },
            { value: person.birthday || '', editable: true },
            { value: person.title || '', editable: true },
            { value: this.db.getPersonTeam(person.name) || '', options: this.teamNames },
            { value: person.legal_manager || '', options: this.managers },
            { value: person.functional_manager || '', options: this.managers },
            { value: person.external, type: 'external' },  // Pass the boolean value directly
            { 
                value: person.virtual_team || [], 
                type: 'virtual_team',
                options: availableTeams,
                mainTeam: person.team_name 
            },
            { value: '🗑️', type: 'button' }
        ];
        console.log('Generating row for person:', person, 'with cells:', cells);
        return `
            <tr data-userid="${person.userId}">
                ${cells.map(cell => this.generateTableCell(cell)).join('')}
            </tr>
        `;
    }

    generateTableCell(cellConfig) {
        if (cellConfig.type === 'button') {
            return `<td><button class="table-button delete-row">${cellConfig.value}</button></td>`;
        }
        
        if (cellConfig.type === 'external') {
            return `<td>
                <select class="table-select external-select">
                    <option value="true" ${cellConfig.value === true ? 'selected' : ''}>Yes</option>
                    <option value="false" ${cellConfig.value === false ? 'selected' : ''}>No</option>
                </select>
            </td>`;
        }

        if (cellConfig.type === 'virtual_team') {
            const displayValue = Array.isArray(cellConfig.value) ? cellConfig.value.join(', ') : '';
            const options = cellConfig.options.map(team => {
                const checked = Array.isArray(cellConfig.value) && 
                              cellConfig.value.includes(team) ? 'checked' : '';
                return `
                    <div class="virtual-team-option">
                        <label>
                            <input type="checkbox" value="${team}" ${checked}>
                            <span>${team}</span>
                        </label>
                    </div>`;
            }).join('');

            return `
                <td class="virtual-team-cell">
                    <div class="virtual-team-display">${displayValue || 'Click to select teams'}</div>
                    <div class="virtual-team-dropdown">
                        <div class="virtual-team-options">${options}</div>
                        <div class="virtual-team-actions">
                            <button type="button" class="virtual-team-done">Done</button>
                        </div>
                    </div>
                </td>`;
        }
        
        if (cellConfig.options) {
            const options = cellConfig.options.map(option => {
                const selected = option === cellConfig.value ? 'selected' : '';
                return `<option value="${option}" ${selected}>${option}</option>`;
            }).join('');

            return `
                <td style="position: relative;">
                    <select class="table-select">
                        <option value=""></option>
                        ${options}
                    </select>
                </td>`;
        }
        
        if (cellConfig.editable) {
            return `
                <td class="editable" contenteditable="true">
                    ${cellConfig.value}
                </td>`;
        }
        
        if (cellConfig.type === 'readonly') {
            return `<td class="readonly">${cellConfig.value}</td>`;
        }
        
        return `<td>${cellConfig.value}</td>`;
    }
}

export async function showPeopleTab() {
    const tab = document.getElementById('people-tab');
    tab.innerHTML = 'Loading...';

    // Load and inject CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('styles/people-ui-table.css');
    if (!document.querySelector('link[href="' + cssLink.href + '"]')) {
        document.head.appendChild(cssLink);
    }

    try {
        const db = await getDatabase();
        const tableGenerator = new PeopleTableGenerator(db);
        const tableHtml = await tableGenerator.generatePeopleTable();
        
        tab.innerHTML = tableHtml;
        setupExportButton(tab, db);

        // Add event handlers after the table is rendered
        addEventHandlers(db);
        
        // Reset initialization flag and initialize table handlers
        resetTableInitialization();
        initializeTableHandlers();
    } catch (error) {
        console.error('Error loading people UI:', error);
        tab.innerHTML = 'Error loading people data.';
    }
}

function setupExportButton(container, db) {
    const exportButton = container.querySelector('.export-button');
    if (!exportButton) return;

    exportButton.addEventListener('click', async () => {
        try {
            const yaml = db.exportToYaml();
            
            // Use File System Access API if available
            if ('showSaveFilePicker' in window) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'database.yaml',
                    types: [{
                        description: 'YAML File',
                        accept: {
                            'application/x-yaml': ['.yaml', '.yml']
                        }
                    }]
                });
                
                const writable = await handle.createWritable();
                await writable.write(yaml);
                await writable.close();
            } else {
                // Fallback for browsers without File System Access API
                const blob = new Blob([yaml], { type: 'application/x-yaml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'database.yaml';
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Failed to export:', err);
                alert('Export failed. Please try again.');
            }
        }
    });
}

function addEventHandlers(db) {
    // Add new person handler
    const addButton = document.querySelector('.add-person-button');
    if (addButton) {
        addButton.addEventListener('click', async () => {
            // Create normalized person in database
            const person = db.normalizePerson({
                name: 'New Person',
                external: true,
                team_name: '',
                title: '',
                birthday: '',
                legal_manager: '',
                functional_manager: ''
            });
            
            db.updatePersonData(person);

            // Re-render only the table content
            const tableGenerator = new PeopleTableGenerator(db);
            const table = document.querySelector('#peopleTable');
            table.innerHTML = `
                <thead>
                    ${tableGenerator.generateHeaders()}
                </thead>
                <tbody>
                    ${tableGenerator.generateTableContent()}
                </tbody>
            `;

            // Re-initialize handlers
            addEventHandlers(db);
            initializeTableHandlers();

            // Find and focus the new person's row
            const rows = table.getElementsByTagName('tr');
            for (const row of rows) {
                const nameCell = row.cells[0];
                if (nameCell && nameCell.textContent.trim() === 'New Person') {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    nameCell.focus();
                    const range = document.createRange();
                    range.selectNodeContents(nameCell);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    break;
                }
            }
        });
    }

    // Add delete row handlers
    const deleteButtons = document.querySelectorAll('.delete-row');
    deleteButtons.forEach(button => {
        button.addEventListener('click', () => {
            const row = button.closest('tr');
            const name = row.cells[0].textContent.trim();
            
            if (confirm(`Are you sure you want to delete ${name}?`)) {
                db.removePerson(name);
                row.remove();
            }
        });
    });

    // Add cell edit handlers
    document.querySelectorAll('.editable').forEach(cell => {
        // Handle blur event (when focus leaves the cell)
        cell.addEventListener('blur', () => {
            handleCellEdit(cell, db);
        });

        // Handle Enter key
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cell.blur();
            }
        });
    });

    // Handle select changes
    document.querySelectorAll('.table-select').forEach(select => {
        select.addEventListener('change', () => handleSelectChange(select, db));
    });

    // Replace the virtual team handlers section in addEventHandlers
    document.querySelectorAll('.virtual-team-cell').forEach(cell => {
        const display = cell.querySelector('.virtual-team-display');
        const dropdown = cell.querySelector('.virtual-team-dropdown');
        const doneButton = cell.querySelector('.virtual-team-done');
        const checkboxes = cell.querySelectorAll('input[type="checkbox"]');
        
        display.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close any other open dropdowns
            document.querySelectorAll('.virtual-team-dropdown.show').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            dropdown.classList.add('show');
        });

        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const selectedTeams = Array.from(cell.querySelectorAll('input:checked'))
                    .map(input => input.value);
                display.textContent = selectedTeams.length ? selectedTeams.join(', ') : 'Click to select teams';
            });
        });

        doneButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedTeams = Array.from(cell.querySelectorAll('input:checked'))
                .map(input => input.value);
            
            const row = cell.closest('tr');
            const userId = row.dataset.userid;
            db.updatePersonByUserId(userId, { virtual_team: selectedTeams });
            
            dropdown.classList.remove('show');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!cell.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation());
    });
}

function handleCellEdit(cell, db) {
    const row = cell.closest('tr');
    const userId = row.dataset.userid;
    const columnIndex = Array.from(row.cells).indexOf(cell);
    
    // Map column index to property name
    const propertyMap = {
        0: 'name',
        1: 'birthday',
        2: 'title',
        3: 'team_name',
        4: 'legal_manager',
        5: 'functional_manager'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const updates = {
        [property]: cell.textContent.trim()
    };

    // Update the database using userId
    db.updatePersonByUserId(userId, updates);
}

function handleSelectChange(select, db) {
    const row = select.closest('tr');
    const userId = row.dataset.userid;
    const columnIndex = Array.from(row.cells).indexOf(select.closest('td'));
    
    const propertyMap = {
        3: 'team_name',
        4: 'legal_manager',
        5: 'functional_manager',
        6: 'external'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const updates = {
        [property]: property === 'external' ? select.value === 'true' : select.value
    };

    // Update the database using userId
    db.updatePersonByUserId(userId, updates);
}
