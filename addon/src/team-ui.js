// src/team-ui.js
// Renders tables for teams and projects with Name, Product Owner, Functional Manager, and Project Lead.
import { getDatabase, showNotification, reloadDatabase } from './common.js';
import { addPendingChange, loadPendingChanges, saveToServer as saveToServerCommon, loadLocal } from './team-db-sync.js';
import { initializeTeamTableHandlers, resetTeamTableInitialization } from './team-ui-table-handlers.js';
import { storageManager } from './storage-manager.js';

class TeamTableGenerator {
    constructor(db) {
        this.db = db;
        this.managers = db.getAllManagers();
        this.people = db.getAllPeople().map(p => p.name);
        this._pendingPromise = loadPendingChanges();
        console.log('Database loaded for team UI:', this.db);
    }

    async generateTeamUI() {
        // Await pending changes
        this._pending = await this._pendingPromise;
        // Load template
        const templateResponse = await fetch(chrome.runtime.getURL('templates/team-ui-table.html'));
        let template = await templateResponse.text();

        // Replace placeholders
        const replacements = {
            '{{teamsTableContent}}': this.generateTeamsTableContent(),
            '{{projectsTableContent}}': this.generateProjectsTableContent()
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.replace(placeholder, value);
        }

        return template;
    }

    generateTeamsTableContent() {
        const teams = this.db.getAllTeams();
        return teams.map(team => this.generateTeamRow(team)).join('');
    }

    generateProjectsTableContent() {
        const projects = this.db.getAllProjects();
        return projects.map(project => this.generateProjectRow(project)).join('');
    }

    generateTeamRow(team) {
        const assignedCount = Array.isArray(team.members) ? team.members.length : 0;
        const pending = (this._pending && this._pending.teams && this._pending.teams.includes(team.name));
        const cells = [
            { value: team.name || '', editable: true },
            { value: team.short_name || '', editable: true },
            { value: String(assignedCount), editable: false },
            { value: team.product_owner || '', options: this.people },
            { value: team.functional_manager || '', options: this.managers }
        ];

        const cellsHtml = cells.map(cell => this.generateTableCell(cell)).join('');
        const deleteButton = '<td><button class="table-button delete-team" title="Delete team">🗑️</button></td>';
        
        return `<tr class="${pending ? 'pending-row' : ''}" data-teamname="${team.name}">${cellsHtml}${deleteButton}</tr>`;
    }

    generateProjectRow(project) {
        const cells = [
            { value: project.name || '', editable: true },
            { value: project.project_lead || '', options: this.people }
        ];

        const cellsHtml = cells.map(cell => this.generateTableCell(cell)).join('');
        const deleteButton = '<td><button class="table-button delete-project" title="Delete project">🗑️</button></td>';
        
        return `<tr data-projectname="${project.name}">${cellsHtml}${deleteButton}</tr>`;
    }

    generateTableCell(cellConfig) {
        const { value, editable, options, type } = cellConfig;

        if (options) {
            // Generate select dropdown
            const emptyOption = '<option value="">-- Select --</option>';
            const optionsHtml = options.map(option => 
                `<option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>`
            ).join('');
            
            return `<td><select class="table-select">${emptyOption}${optionsHtml}</select></td>`;
        } else if (editable) {
            // Generate editable cell
            return `<td class="editable" contenteditable="true">${value}</td>`;
        } else {
            // Generate readonly cell
            return `<td class="readonly">${value}</td>`;
        }
    }
}

export async function showTeamTab() {
    const tab = document.getElementById('team-tab');
    tab.innerHTML = 'Loading...';

    // Load and inject CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('styles/team-ui-table.css');
    if (!document.querySelector('link[href="' + cssLink.href + '"]')) {
        document.head.appendChild(cssLink);
    }

    try {
        const db = await getDatabase();
        const tableGenerator = new TeamTableGenerator(db);
        const tableHtml = await tableGenerator.generateTeamUI();
        
        tab.innerHTML = tableHtml;
        await setupExportButton(tab, db);

        // Rows with pending changes are highlighted inline; use the main Save button to persist to server.

        // Add event handlers after the tables are rendered
        addEventHandlers(db);
        resetTeamTableInitialization();
        initializeTeamTableHandlers();
    } catch (error) {
        console.error('Error loading team UI:', error);
        tab.innerHTML = `<div class="uk-alert-danger" uk-alert>
            <p><strong>Error loading team data:</strong> ${error.message}</p>
            <p>Please check that either a server URL is configured or a local database file is available.</p>
        </div>`;
    }
}

async function setupExportButton(container, db) {
    const primary = container.querySelector('#exportPrimary');
    const toggle = container.querySelector('#exportToggleTeam');
    const dropdown = container.querySelector('#exportDropdownTeam');
    const saveFile = container.querySelector('#save-to-file-team');
    const saveServer = container.querySelector('#save-to-server-team');
    if (!primary || !toggle || !dropdown) return;

    async function saveToFile(yaml) {
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'database.yaml',
                    types: [{
                        description: 'YAML File',
                        accept: { 'application/x-yaml': ['.yaml', '.yml'] }
                    }]
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
                    await showTeamTab();
                } catch (e) {
                    console.warn('In-place reload failed, falling back to full reload:', e);
                    location.reload();
                }
            } catch (err) {
                console.error('Save to server failed:', err);
                showNotification(false, 'Save to server failed: ' + err.message);
            }
        } else {
            try {
                await saveToFile(yaml);
                showNotification(true, 'Saved to file');
            } catch (err) {
                console.error('Save to file failed:', err);
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

    primary.addEventListener('click', async () => {
        await doPrimaryAction();
    });

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

function addEventHandlers(db) {
    // Add new team handler
    const addTeamButton = document.querySelector('.add-team-button');
    if (addTeamButton) {
        addTeamButton.addEventListener('click', async () => {
            const newTeamName = 'New Team';
            const newTeamData = {
                name: newTeamName,
                short_name: db.generateShortName(newTeamName),
                product_owner: '',
                functional_manager: ''
            };
            
            db.addTeam(newTeamData);
            await addPendingChange('teams', newTeamData.name);
            // Refresh the team tab
            showTeamTab();
        });
    }

    // Add new project handler
    const addProjectButton = document.querySelector('.add-project-button');
    if (addProjectButton) {
        addProjectButton.addEventListener('click', () => {
            const newProjectData = {
                name: 'New Project',
                project_lead: ''
            };
            
            db.addProject(newProjectData);
            // Refresh the team tab
            showTeamTab();
        });
    }

    // Add delete team handlers
    const deleteTeamButtons = document.querySelectorAll('.delete-team');
    deleteTeamButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const row = e.target.closest('tr');
            const teamName = row.dataset.teamname;
            
            if (confirm(`Are you sure you want to delete the team "${teamName}"?`)) {
                db.removeTeam(teamName);
                await addPendingChange('teams', teamName);
                row.remove();
            }
        });
    });

    // Add delete project handlers
    const deleteProjectButtons = document.querySelectorAll('.delete-project');
    deleteProjectButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const projectName = row.dataset.projectname;
            
            if (confirm(`Are you sure you want to delete the project "${projectName}"?`)) {
                db.removeProject(projectName);
                row.remove();
            }
        });
    });

    // Add cell edit handlers for teams
    document.querySelectorAll('#teamsTable .editable').forEach(cell => {
        cell.addEventListener('blur', () => handleTeamCellEdit(cell, db));
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cell.blur();
            }
        });
    });

    // Add cell edit handlers for projects
    document.querySelectorAll('#projectsTable .editable').forEach(cell => {
        cell.addEventListener('blur', () => handleProjectCellEdit(cell, db));
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cell.blur();
            }
        });
    });

    // Handle select changes for teams
    document.querySelectorAll('#teamsTable .table-select').forEach(select => {
        select.addEventListener('change', () => handleTeamSelectChange(select, db));
    });

    // Handle select changes for projects
    document.querySelectorAll('#projectsTable .table-select').forEach(select => {
        select.addEventListener('change', () => handleProjectSelectChange(select, db));
    });
}

async function handleTeamCellEdit(cell, db) {
    const row = cell.closest('tr');
    const teamName = row.dataset.teamname;
    const columnIndex = Array.from(row.cells).indexOf(cell);
    
    // Map column index to property name
    const propertyMap = {
        0: 'name',
        1: 'short_name',
        3: 'product_owner',
        4: 'functional_manager'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const newValue = cell.textContent.trim();
    const updates = {
        [property]: newValue
    };

    // If name is being changed, auto-suggest short name if short_name is empty
    if (property === 'name' && newValue) {
        const shortNameCell = row.cells[1]; // Short Name is column index 1
        const currentShortName = shortNameCell.textContent.trim();
        
        // Only auto-suggest if short name is empty
        if (!currentShortName) {
            const suggestedShortName = db.generateShortName(newValue);
            shortNameCell.textContent = suggestedShortName;
            updates.short_name = suggestedShortName;
        }
        
        row.dataset.teamname = newValue;
    }

    db.updateTeam(teamName, updates);
    await addPendingChange('teams', updates.name || teamName);
    try { row.classList.add('pending-row'); } catch (e) {}
}

async function handleProjectCellEdit(cell, db) {
    const row = cell.closest('tr');
    const projectName = row.dataset.projectname;
    const columnIndex = Array.from(row.cells).indexOf(cell);
    
    // Map column index to property name
    const propertyMap = {
        0: 'name',
        1: 'project_lead'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const newValue = cell.textContent.trim();
    const updates = {
        [property]: newValue
    };

    // If name is being changed, update the dataset attribute
    if (property === 'name') {
        row.dataset.projectname = newValue;
    }

    db.updateProject(projectName, updates);
    await addPendingChange('projects', updates.name || projectName);
    try { row.classList.add('pending-row'); } catch (e) {}
}

async function handleTeamSelectChange(select, db) {
    const row = select.closest('tr');
    const teamName = row.dataset.teamname;
    const columnIndex = Array.from(row.cells).indexOf(select.closest('td'));
    
    const propertyMap = {
        3: 'product_owner',
        4: 'functional_manager'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const updates = {
        [property]: select.value
    };

    db.updateTeam(teamName, updates);
    await addPendingChange('teams', teamName);
    try { select.closest('tr').classList.add('pending-row'); } catch (e) {}
}

function handleProjectSelectChange(select, db) {
    const row = select.closest('tr');
    const projectName = row.dataset.projectname;
    const columnIndex = Array.from(row.cells).indexOf(select.closest('td'));
    
    const propertyMap = {
        1: 'project_lead'
    };

    const property = propertyMap[columnIndex];
    if (!property) return;

    const updates = {
        [property]: select.value
    };

    db.updateProject(projectName, updates);
}
