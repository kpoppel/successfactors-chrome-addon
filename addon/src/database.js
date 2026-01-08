//import yaml from 'js-yaml';

/**
 * Represents the merged database containing people, teams, and holiday information
 * Import using
 * ```javascript
 * import Database from './database.js';
 * ```
 */
export default class Database {
    constructor() {
        this.people = new Map(); // name -> person data (merged from yaml and json)
        this.teams = new Map();  // team_name -> team data
        this.managers = new Map(); // manager_name -> managed people
        this.projects = []; // array of project data
        this._lastGeneratedId = 0;  // For generating unique IDs
        this._onUpdateCallback = null; // Callback for when data is updated
    }

    /**
     * Sets a callback function to be called when the database is updated
     */
    setOnUpdateCallback(callback) {
        this._onUpdateCallback = callback;
    }

    /**
     * Calls the update callback if one is set
     */
    _notifyUpdate() {
        if (this._onUpdateCallback) {
            this._onUpdateCallback();
        }
    }

    /**
     * Generates a unique user ID for external users
     */
    generateUniqueUserId() {
        this._lastGeneratedId++;
        return `ext_${this._lastGeneratedId}`;
    }

    /**
     * Filters and transforms raw employeeTime data from the API
     * Removes unnecessary fields and allows for flexible filtering
     */
    filterEmployeeTimeData(rawEmployeeTimeArray) {
        // Fields to exclude from the stored data
        const excludedFields = new Set([
            '__metadata',
            'userId',
            'externalCode',
            'displayQuantity'
        ]);

        // Additional fields that can be excluded via configuration
        // This allows for future experimentation with what data to keep
        const configurableExclusions = new Set([
            // Add field names here if you want to exclude them in the future
            // 'flexibleRequesting',
            // 'leaveOfAbsence',
            // 'undeterminedEndDate'
        ]);

        return rawEmployeeTimeArray.map(entry => {
            const filteredEntry = {};
            
            // Copy all fields except excluded ones
            Object.keys(entry).forEach(key => {
                if (!excludedFields.has(key) && !configurableExclusions.has(key)) {
                    filteredEntry[key] = entry[key];
                }
            });
            
            return filteredEntry;
        });
    }

    /**
     * Normalizes person data by setting default values and fixing relationships
     */
    normalizePerson(person, legalManager = null) {
        return {
            ...person,
            userId: person.userId || this.generateUniqueUserId(),
            legal_manager: legalManager || person.legal_manager || person.line_manager,
            functional_manager: person.functional_manager || person.legal_manager || person.line_manager,
            external: person.external === true || person.external === 'true',  // Ensure boolean value
            virtual_team: Array.isArray(person.virtual_team) ? person.virtual_team : [],
            carry_over_holidays: person.carry_over_holidays || 0,
            site: person.site || 'LY',
            holidays: person.holidays || [],
            nonWorkingDates: person.nonWorkingDates || [],
            employeeTime: person.employeeTime || []
        };
    }

    /**
     * Generates a short name suggestion from a team name
     * Rules: First 3 letters in uppercase, '&' or 'and' becomes 'N'
     */
    generateShortName(teamName) {
        if (!teamName) return '';
        
        // Replace ' & ' or ' and ' with 'N'
        let processed = teamName
            .replace(/\s+&\s+/gi, 'N')
            .replace(/\s+and\s+/gi, 'N');
        
        // Remove special characters and spaces, take first 3 letters
        processed = processed.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
        
        return processed;
    }

    /**
     * Normalizes team data by setting default values
     */
    normalizeTeam(teamName, virtual = false) {
        return {
            name: teamName,
            short_name: '',
            members: new Set(),
            virtual: Boolean(virtual)
        };
    }

    /**
     * Updates internal maps with normalized person data
     */
    updatePersonData(person) {
        // Update people map
        this.people.set(person.name, person);

        // Update primary team mapping
        if (person.team_name) {
            if (!this.teams.has(person.team_name)) {
                this.teams.set(
                    person.team_name, 
                    this.normalizeTeam(person.team_name)
                );
            }
            this.teams.get(person.team_name).members.add(person.name);
        }

        // Update virtual team mappings
        if (Array.isArray(person.virtual_team)) {
            person.virtual_team.forEach(teamName => {
                if (!this.teams.has(teamName)) {
                    this.teams.set(teamName, this.normalizeTeam(teamName, true));
                }
                this.teams.get(teamName).members.add(person.name);
            });
        }

        // Update manager mappings
        if (person.legal_manager) {
            if (!this.managers.has(person.legal_manager)) {
                this.managers.set(person.legal_manager, new Set());
            }
            this.managers.get(person.legal_manager).add(person.name);
        }
    }

    /**
     * Loads data from the YAML database file
     */
    loadYamlData(yamlData) {
        let data = null;
        if (typeof yamlData === 'string') {
            data = jsyaml.load(yamlData);
        } else if (yamlData && typeof yamlData === 'object') {
            // Already-parsed object (e.g. received from server as JSON)
            data = yamlData;
        } else {
            throw new Error('Invalid database input; expected YAML string or object');
        }
        this._lastGeneratedId = 0;  // Reset ID counter before loading

        // Load teams first to ensure they exist
        if (!data || !data.database) {
            throw new Error('Database object missing required "database" key');
        }

        if (data.database.teams) {
            for (const teamData of data.database.teams) {
                this.teams.set(teamData.name, {
                    name: teamData.name,
                    short_name: teamData.short_name || '',
                    members: new Set(),
                    extended_members: teamData.extended_members || [],
                    product_owner: teamData.product_owner || '',
                    functional_manager: teamData.functional_manager || '',
                    virtual: Boolean(teamData.virtual)
                });
            }
        }

        // Load projects
        if (data.database.projects) {
            this.projects = data.database.projects.map(project => ({
                name: project.name,
                project_lead: project.project_lead || ''
            }));
        }

        // Load people
        for (const personData of data.database.people) {
            const person = this.normalizePerson({
                ...personData,
                ...this.people.get(personData.name),
                // Handle external status explicitly
                external: personData.external === true || personData.external === 'true',
            });
            this.updatePersonData(person);
        }
    }

    /**
     * Loads holiday data from the JSON format
     */
    loadHolidayData(jsonData) {
        for (const entry of jsonData.d.results) {
            const existingPerson = this.people.get(entry.username) || {};
            
            // Filter and transform employeeTime data if it exists
            const rawEmployeeTime = entry.employeeTimeNav?.results || [];
            const filteredEmployeeTime = this.filterEmployeeTimeData(rawEmployeeTime);
            
            const person = this.normalizePerson({
                ...existingPerson,
                userId: entry.userId,
                name: entry.username,
                holidays: JSON.parse(entry.holidays || '[]'),
                nonWorkingDates: JSON.parse(entry.nonWorkingDates || '[]'),
                employeeTime: filteredEmployeeTime
            });
            this.updatePersonData(person);
        }
    }

    /**
     * Queries a person by their user ID
     */
    queryPerson(userId) {
        return Array.from(this.people.values()).find(person => person.userId === userId);
    }

    /**
     * Queries a person by their name
     */
    queryPersonByName(name) {
        return this.people.get(name);
    }

    /**
     * Gets all members of a team
     */
    queryTeam(teamName) {
        return this.teams.get(teamName);
    }

    /**
     * Gets all people managed by a manager
     */
    queryManagersTeam(managerName) {
        return Array.from(this.managers.get(managerName) || []);
    }

    /**
     * Gets holiday data for a specific person
     */
    queryHolidays(userName, fromDate, toDate) {
        const person = this.people.get(userName);
        if (!person) return null;

        return {
            holidays: person.holidays.filter(h => 
                h.date >= fromDate && h.date <= toDate),
            nonWorkingDates: person.nonWorkingDates.filter(d => 
                d.date >= fromDate && d.date <= toDate)
        };
    }

    /**
     * Exports the database back to YAML format
     */
    exportToYaml() {
        const data = {
            version: new Date().toISOString().split('T')[0].replace(/-/g, ''),
            database: {
            people: Array.from(this.people.values()).map(person => ({
                name: person.name,
                birthday: person.birthday || '',
                title: person.title || '',
                external: Boolean(person.external),
                team_name: person.team_name || '',
                virtual_team: person.virtual_team || [],  // Always export as array
                legal_manager: person.legal_manager || '',
                functional_manager: person.functional_manager || person.legal_manager || '',
                carry_over_holidays: person.carry_over_holidays || 0,
                site: person.site || 'LY'
            })),
            teams: Array.from(this.teams.values())
                .filter(team => team.name !== 'N/A')
                .map(team => {
                // Create basic team structure
                const teamData = {
                    name: team.name,
                    short_name: team.short_name || '',
                    functional_manager: team.functional_manager || ''
                };
                // Only add product_owner if it exists
                if (team.product_owner) {
                    teamData.product_owner = team.product_owner;
                }
                return teamData;
                }),
            projects: (this.projects || []).map(project => ({
                name: project.name,
                project_lead: project.project_lead || ''
            }))
            }
        };
        return jsyaml.dump(data, { quotingType: '"', lineWidth: -1 });
    }

    /**
     * Calculates spent days by absence type for a person
     * @param {string} userId - The user ID to calculate for
     * @param {Date} fromDate - Start date for calculation (optional, defaults to current year start)
     * @param {Date} toDate - End date for calculation (optional, defaults to current date)
     * @returns {Object} Object with absence type names as keys and spent days as values
     */
    getSpentDaysByType(userId, fromDate = null, toDate = null) {
        const person = this.queryPerson(userId);
        if (!person || !person.employeeTime) {
            return {};
        }

        // Default date range: current year up to today
        if (!fromDate) {
            fromDate = new Date(new Date().getFullYear(), 0, 1); // Jan 1st of current year
        }
        if (!toDate) {
            toDate = new Date(); // Today
        }

        const fromTimestamp = fromDate.getTime();
        const toTimestamp = toDate.getTime();
        const spentByType = {};

        person.employeeTime.forEach(entry => {
            // Parse the SuccessFactors date format: /Date(timestamp)/
            const startDateMatch = entry.startDate?.match(/\/Date\((\d+)\)\//);
            
            if (!startDateMatch) return;
            
            const startTimestamp = parseInt(startDateMatch[1]);
            
            // Check if the absence falls within our date range
            if (startTimestamp >= fromTimestamp && startTimestamp <= toTimestamp) {
                const days = parseFloat(entry.quantityInDays) || 0;
                const absenceType = entry.timeTypeName || 'Unknown';
                
                if (!spentByType[absenceType]) {
                    spentByType[absenceType] = 0;
                }
                spentByType[absenceType] += days;
            }
        });

        return spentByType;
    }

    /**
     * Gets all unique absence types from employeeTime data
     */
    getAllAbsenceTypes() {
        const absenceTypes = new Set();
        this.people.forEach(person => {
            if (person.employeeTime && Array.isArray(person.employeeTime)) {
                person.employeeTime.forEach(entry => {
                    if (entry.timeTypeName) {
                        absenceTypes.add(entry.timeTypeName);
                    }
                });
            }
        });
        return Array.from(absenceTypes).sort();
    }

    /**
     * Gets all unique titles in the database
     */
    getAllTitles() {
        const titles = new Set();
        this.people.forEach(person => {
            if (person.title) titles.add(person.title);
        });
        return Array.from(titles).sort();
    }

    /**
     * Gets all unique managers in the database
     */
    getAllManagers() {
        const managers = new Set();
        this.people.forEach(person => {
            if (person.legal_manager) managers.add(person.legal_manager);
            if (person.functional_manager) managers.add(person.functional_manager);
        });
        return Array.from(managers).sort();
    }

    /**
     * Gets all team names
     */
    getAllTeamNames() {
        return Array.from(this.teams.keys()).sort();
    }

    /**
     * Gets all people as an array for table display
     */
    getAllPeople(sort_by = null) {
        let peopleArray = Array.from(this.people.values()).map(person => ({
            name: person.name,
            userId: person.userId || '',
            title: person.title || '',
            birthday: person.birthday || '',
            team_name: person.team_name || '',
            virtual_team: person.virtual_team || [],
            legal_manager: person.legal_manager || '',
            functional_manager: person.functional_manager || '',
            external: person.external || false,
            carry_over_holidays: person.carry_over_holidays || 0,
            site: person.site || 'LY',
            hasHolidayData: Boolean(person.userId && !String(person.userId).startsWith('ext_')),
            holidays: person.holidays || [],
            nonWorkingDates: person.nonWorkingDates || [],
            employeeTime: person.employeeTime || []
        }));

        if (sort_by && peopleArray.length > 0 && sort_by in peopleArray[0]) {
            peopleArray.sort((a, b) => {
                if (a[sort_by] === undefined) return 1;
                if (b[sort_by] === undefined) return -1;
                if (typeof a[sort_by] === 'string' && typeof b[sort_by] === 'string') {
                    return a[sort_by].localeCompare(b[sort_by]);
                }
                if (a[sort_by] < b[sort_by]) return -1;
                if (a[sort_by] > b[sort_by]) return 1;
                return 0;
            });
        }

        return peopleArray;
    }

    /**
     * Gets a person's team name
     */
    getPersonTeam(username) {
        for (const [teamName, team] of this.teams.entries()) {
            if (team.members.has(username)) {
                return teamName;
            }
        }
        return '';
    }

    /**
     * Removes a person in the database
     */
    removePerson(name) {
        const person = this.people.get(name);
        if (!person) return false;

        // Remove from people map
        this.people.delete(name);

        // Remove from team
        if (person.team_name && this.teams.has(person.team_name)) {
            this.teams.get(person.team_name).members.delete(name);
        }

        // Remove from managers' lists
        if (person.legal_manager && this.managers.has(person.legal_manager)) {
            this.managers.get(person.legal_manager).delete(name);
        }

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Updates a person's details in the database
     */
    updatePerson(name, updates) {
        console.log(`Updating person: ${name}`, updates);
        const person = this.people.get(name);
        if (!person) return false;

        // Handle manager updates
        if (updates.legal_manager && person.legal_manager !== updates.legal_manager) {
            // Remove from old manager's list
            if (this.managers.has(person.legal_manager)) {
                this.managers.get(person.legal_manager).delete(name);
            }
        }

        // Handle team updates
        if (updates.team_name && person.team_name !== updates.team_name) {
            // Remove from old team
            if (this.teams.has(person.team_name)) {
                this.teams.get(person.team_name).members.delete(name);
            }
        }

        // Create updated person object
        const updatedPerson = {
            ...person,
            ...updates,
            // Ensure these fields are properly carried over
            virtual_team: person.virtual_team,
            external: person.external,
            holidays: person.holidays || [],
            nonWorkingDates: person.nonWorkingDates || [],
            employeeTime: person.employeeTime || []
        };

        // Update all relationships using existing method
        this.updatePersonData(updatedPerson);
        console.log(`Person updated: ${name}`, updatedPerson);
        console.log(queryPersonByName(name));
        
        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Updates a person's details in the database using their userID
     */
    updatePersonByUserId(userId, updates) {
        console.log(`Updating person by userID: ${userId}`, updates);
        const person = this.queryPerson(userId);
        if (!person) return false;

        // Handle manager updates
        if (updates.legal_manager && person.legal_manager !== updates.legal_manager) {
            if (this.managers.has(person.legal_manager)) {
                this.managers.get(person.legal_manager).delete(person.name);
            }
        }

        // Handle team updates
        if (updates.team_name && person.team_name !== updates.team_name) {
            if (this.teams.has(person.team_name)) {
                this.teams.get(person.team_name).members.delete(person.name);
            }
        }

        // If name is being updated, we need to handle all references
        if (updates.name && updates.name !== person.name) {
            // Remove old name from all collections
            this.people.delete(person.name);
            if (person.team_name && this.teams.has(person.team_name)) {
                this.teams.get(person.team_name).members.delete(person.name);
            }
        }

        // Create updated person object
        const updatedPerson = {
            ...person,
            ...updates
        };

        // Update all relationships using existing method
        this.updatePersonData(updatedPerson);
        console.log(`Person updated: ${userId}`, updatedPerson);
        
        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Gets all teams as an array for table display
     */
    getAllTeams() {
        return Array.from(this.teams.values()).map(team => ({
            name: team.name,
            short_name: team.short_name || '',
            product_owner: team.product_owner || '',
            functional_manager: team.functional_manager || '',
            members: Array.from(team.members || []),
            virtual: team.virtual || false
        }));
    }

    /**
     * Gets all projects as an array for table display
     */
    getAllProjects() {
        return this.projects.map(project => ({
            name: project.name || '',
            project_lead: project.project_lead || ''
        }));
    }

    /**
     * Updates a team's details in the database
     */
    updateTeam(name, updates) {
        const team = this.teams.get(name);
        if (!team) return false;

        // If name is being changed, we need to update all people references
        if (updates.name && updates.name !== name) {
            // Update all people who are members of this team
            team.members.forEach(memberName => {
                const person = this.people.get(memberName);
                if (person && person.team_name === name) {
                    person.team_name = updates.name;
                }
            });

            // Remove old team entry and create new one
            this.teams.delete(name);
            const updatedTeam = {
                ...team,
                ...updates
            };
            this.teams.set(updates.name, updatedTeam);
        } else {
            // Just update the existing team
            const updatedTeam = {
                ...team,
                ...updates
            };
            this.teams.set(name, updatedTeam);
        }

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Updates a project's details in the database
     */
    updateProject(name, updates) {
        const projectIndex = this.projects.findIndex(p => p.name === name);
        if (projectIndex === -1) return false;

        this.projects[projectIndex] = {
            ...this.projects[projectIndex],
            ...updates
        };

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Adds a new team to the database
     */
    addTeam(teamData) {
        const normalizedTeam = this.normalizeTeam(teamData.name, teamData.virtual || false);
        normalizedTeam.short_name = teamData.short_name || '';
        normalizedTeam.product_owner = teamData.product_owner || '';
        normalizedTeam.functional_manager = teamData.functional_manager || '';
        
        this.teams.set(teamData.name, normalizedTeam);

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Adds a new project to the database
     */
    addProject(projectData) {
        this.projects.push({
            name: projectData.name || '',
            project_lead: projectData.project_lead || ''
        });

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }

    /**
     * Removes a team from the database
     */
    removeTeam(name) {
        const status = this.teams.delete(name);

        // Notify that database has been updated
        this._notifyUpdate();
        return status;
    }

    /**
     * Removes a project from the database
     */
    removeProject(name) {
        const projectIndex = this.projects.findIndex(p => p.name === name);
        if (projectIndex === -1) return false;
        
        this.projects.splice(projectIndex, 1);

        // Notify that database has been updated
        this._notifyUpdate();
        return true;
    }
}
