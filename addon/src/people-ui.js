// src/people-ui.js
// Renders a table of all employees with Name, Birthday, Title, Team, and Manager.
import { getDatabase, showNotification, reloadDatabase } from './common.js';
import { initializeTableHandlers, resetTableInitialization } from './people-ui-table-handlers.js';
import { addPendingChange, loadPendingChanges, saveToServer as saveToServerCommon, loadLocal } from './team-db-sync.js';
import { storageManager } from './storage-manager.js';

class PeopleTableGenerator {
    constructor(db) {
        this.db = db;
        this.teamNames = db.getAllTeamNames();
        this.managers = db.getAllManagers();
        this._pendingPromise = loadPendingChanges();
        console.log('Database loaded:', this.db);
    }

    async generatePeopleTable() {
        // Await pending changes
        this._pending = await this._pendingPromise;
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
        const sortableColumns = ['Name', 'Birthday', 'Title', 'Team(s)', 'Legal Manager', 'Functional Manager', 'Ext./Mgr.', 'Virtual Teams'];
        const headers = [...sortableColumns, 'Actions'];
        
        return headers.map(header => {
            if (header === 'Ext./Mgr.') {
                return `<th data-column="external">
                    <div class="header-content">
                        <div class="header-title">
                            ${header}
                            <span class="sort-indicator"></span>
                        </div>
                        <details class="flag-filter-dropdown">
                            <summary class="column-search">All</summary>
                            <div class="flag-filters">
                                <label><input type="checkbox" class="column-search" data-column="external">Ext.</label>
                                <label><input type="checkbox" class="column-search" data-column="manager">Mgr.</label>
                            </div>
                        </details>
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
            { value: person.team_name || '', options: this.teamNames },
            { value: person.legal_manager || '', options: this.managers },
            { value: person.functional_manager || '', options: this.managers },
            { external: person.external, manager: person.manager, type: 'flags' },
            { 
                value: person.virtual_team || [], 
                type: 'virtual_team',
                options: availableTeams,
                mainTeam: person.team_name 
            },
            { value: '🗑️', type: 'button' }
        ];
        console.log('Generating row for person:', person, 'with cells:', cells);
        const pending = (this._pending && this._pending.people && this._pending.people.includes(person.name));
        return `
            <tr class="${pending ? 'pending-row' : ''}" data-userid="${person.userId}">
                ${cells.map(cell => this.generateTableCell(cell)).join('')}
            </tr>
        `;
    }

    generateTableCell(cellConfig) {
        if (cellConfig.type === 'button') {
            return `<td><button class="table-button delete-row">${cellConfig.value}</button></td>`;
        }
        
        if (cellConfig.type === 'flags') {
            const selected = [cellConfig.external && 'Ext.', cellConfig.manager && 'Mgr.'].filter(Boolean).join(', ') || 'No';
            return `<td class="person-flags">
                <details class="flag-dropdown">
                    <summary>${selected}</summary>
                    <div class="flag-options">
                        <label><input type="checkbox" class="person-flag" data-field="external" ${cellConfig.external ? 'checked' : ''}>External</label>
                        <label><input type="checkbox" class="person-flag" data-field="manager" ${cellConfig.manager ? 'checked' : ''}>Manager</label>
                    </div>
                </details>
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
            const legacyOption = cellConfig.value && !cellConfig.options.includes(cellConfig.value)
                ? `<option value="${cellConfig.value}" selected disabled>${cellConfig.value}</option>` : '';

            return `
                <td style="position: relative;">
                    <select class="table-select">
                        <option value=""></option>
                        ${options}${legacyOption}
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
        await setupExportButton(tab, db);

        // Rows with pending changes are highlighted inline; use the main Save button to persist changes to server.

        // Add event handlers after the table is rendered
        addEventHandlers(db);
        
        // Reset initialization flag and initialize table handlers
        resetTableInitialization();
        initializeTableHandlers();
    } catch (error) {
        console.error('Error loading people UI:', error);
        tab.innerHTML = `<div class="uk-alert-danger" uk-alert>
            <p><strong>Error loading people data:</strong> ${error.message}</p>
            <p>Please check that either a server URL is configured or a local database file is available.</p>
        </div>`;
    }
}

async function setupExportButton(container, db) {
    const primary = container.querySelector('#exportPrimary');
    const toggle = container.querySelector('#exportTogglePeople');
    const dropdown = container.querySelector('#exportDropdownPeople');
    const saveFile = container.querySelector('#save-to-file-people');
    const saveServer = container.querySelector('#save-to-server-people');
    if (!primary || !toggle || !dropdown) return;

    async function saveToFile(yaml) {
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'database.yaml',
                    types: [{ description: 'YAML File', accept: { 'application/x-yaml': ['.yaml', '.yml'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(yaml);
                await writable.close();
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    showNotification(false, 'Save canceled');
                    return;
                }
                throw err;
            }
        } else {
            const blob = new Blob([yaml], { type: 'application/x-yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'database.yaml';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    async function doPrimaryAction() {
        const yaml = db.exportToYaml();
        const items = await storageManager.getMultiple(['server_url', 'teamdb_email', 'teamdb_token']);
        const serverUrl = items.server_url;
        if (serverUrl) {
            try {
                // Prepare local entry for common saveToServer function
                const localEntry = await loadLocal();
                if (!localEntry) {
                    throw new Error('No local data to save');
                }
                const result = await saveToServerCommon(localEntry, serverUrl, items.teamdb_email, items.teamdb_token);
                const message = result.message || 'Saved to server';
                showNotification(true, message);
                // refresh the database in-place so pending-row highlights are removed
                try {
                    await reloadDatabase();
                    await showPeopleTab();
                } catch (e) {
                    console.warn('In-place reload failed, falling back to full reload:', e);
                    location.reload();
                }
            } catch (err) {
                console.error(err);
                showNotification(false, 'Save to server failed: ' + err.message);
            }
        } else {
            try {
                await saveToFile(yaml);
                showNotification(true, 'Saved to file');
            } catch (err) {
                console.error(err);
                showNotification(false, 'Save to file failed: ' + err.message);
            }
        }
    }

    // Toggle dropdown visibility
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Set primary label and dropdown visibility based on configured server_url
    const serverUrl = await storageManager.get('server_url', '');
    const hasServer = serverUrl.trim().length > 0;
    if (hasServer) {
        primary.textContent = 'Save to Server';
        primary.title = 'Save to Server';
        toggle.style.display = 'flex';
        if (saveFile) saveFile.style.display = 'block';
        if (saveServer) saveServer.style.display = 'none';
    } else {
        primary.textContent = 'Save to File';
        primary.title = 'Save to File';
        toggle.style.display = 'none';
        if (saveFile) saveFile.style.display = 'none';
        if (saveServer) saveServer.style.display = 'block';
    }

    primary.addEventListener('click', async () => { await doPrimaryAction(); });

    if (saveFile) {
        saveFile.addEventListener('click', async () => {
            dropdown.style.display = 'none';
            const yaml = db.exportToYaml();
            try {
                await saveToFile(yaml);
                showNotification(true, 'Saved to file');
            } catch (err) {
                console.error(err);
                showNotification(false, 'Save to file failed: ' + err.message);
            }
        });
    }

    if (saveServer) {
        saveServer.addEventListener('click', async () => {
            dropdown.style.display = 'none';
            const yaml = db.exportToYaml();
            try {
                const items = await storageManager.getMultiple(['server_url', 'teamdb_email', 'teamdb_token']);
                const localEntry = await loadLocal();
                if (!localEntry) {
                    throw new Error('No local data to save');
                }
                const result = await saveToServerCommon(localEntry, items.server_url, items.teamdb_email, items.teamdb_token);
                const message = result.message || 'Saved to server';
                showNotification(true, message);
            } catch (err) {
                console.error(err);
                showNotification(false, 'Save to server failed: ' + err.message);
            }
        });
    }
}

function refreshManagerOptions(db) {
    const managers = db.getAllManagers();
    document.querySelectorAll('#peopleTable tbody tr').forEach(personRow => {
        [4, 5].forEach(index => {
            const select = personRow.cells[index].querySelector('select');
            const selected = select.value;
            select.replaceChildren(new Option('', ''), ...managers.map(name => new Option(name, name)));
            if (selected && !managers.includes(selected)) {
                select.add(new Option(selected, selected, true, true));
                select.options[select.selectedIndex].disabled = true;
            } else {
                select.value = selected;
            }
        });
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
                functional_manager: '',
                manager: false
            });
            
            db.updatePersonData(person);
            await addPendingChange('people', person.name);

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
        button.addEventListener('click', async () => {
            const row = button.closest('tr');
            const name = row.cells[0].textContent.trim();
            
            if (confirm(`Are you sure you want to delete ${name}?`)) {
                db.removePerson(name);
                await addPendingChange('people', name);
                row.classList.add('pending-row');
                row.remove();
                refreshManagerOptions(db);
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

    document.querySelectorAll('.person-flag').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            const row = checkbox.closest('tr');
            const dropdown = checkbox.closest('.flag-dropdown');
            const flags = dropdown.querySelectorAll('.person-flag');
            dropdown.querySelector('summary').textContent = Array.from(flags)
                .filter(flag => flag.checked)
                .map(flag => flag.dataset.field === 'external' ? 'Ext.' : 'Mgr.')
                .join(', ') || 'None';
            db.updatePersonByUserId(row.dataset.userid, { [checkbox.dataset.field]: checkbox.checked });
            await addPendingChange('people', row.cells[0].textContent.trim());
            row.classList.add('pending-row');
            if (checkbox.dataset.field === 'manager') {
                refreshManagerOptions(db);
            }
            document.querySelector('.flag-filters .column-search:checked')
                ?.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    document.querySelectorAll('.flag-dropdown').forEach(dropdown => {
        dropdown.addEventListener('toggle', () => {
            if (dropdown.open) {
                document.querySelectorAll('.flag-dropdown[open]').forEach(other => {
                    if (other !== dropdown) other.open = false;
                });
            }
        });
    });
    document.addEventListener('click', (event) => {
        document.querySelectorAll('.flag-dropdown[open]').forEach(dropdown => {
            if (!dropdown.contains(event.target)) dropdown.open = false;
        });
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

        doneButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            const selectedTeams = Array.from(cell.querySelectorAll('input:checked'))
                .map(input => input.value);
            
            const row = cell.closest('tr');
            const userId = row.dataset.userid;
            db.updatePersonByUserId(userId, { virtual_team: selectedTeams });
            // Mark person as pending by name (read name cell)
            try {
                const personName = row.cells[0].textContent.trim();
                await addPendingChange('people', personName);
                row.classList.add('pending-row');
            } catch (e) {
                console.error('Failed to mark pending change for virtual team:', e);
            }
            
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

async function handleCellEdit(cell, db) {
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
    if (property === 'name') refreshManagerOptions(db);
    try {
        const name = updates.name || row.cells[0].textContent.trim();
        await addPendingChange('people', name);
        row.classList.add('pending-row');
    } catch (e) {
        console.error('Failed to mark pending change for edit:', e);
    }
}

async function handleSelectChange(select, db) {
    const row = select.closest('tr');
    const userId = row.dataset.userid;
    const columnIndex = Array.from(row.cells).indexOf(select.closest('td'));
    
    const propertyMap = {
        3: 'team_name',
        4: 'legal_manager',
        5: 'functional_manager'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const updates = {
        [property]: select.value
    };

    // Update the database using userId
    db.updatePersonByUserId(userId, updates);
    try {
        const name = row.cells[0].textContent.trim();
        await addPendingChange('people', name);
        row.classList.add('pending-row');
    } catch (e) {
        console.error('Failed to mark pending change for select change:', e);
    }
}
