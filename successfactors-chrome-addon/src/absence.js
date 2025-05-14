import { downloadFile } from './common.js';

const COLORS = {
    ABOVE: '#e6b3ff',  // purple - for negative balance
    CRIT: '#ffcccc',   // red - for >15 days
    WARN: '#ffcc99',   // orange - for 10-15 days
    NOTE: '#ffffcc',   // yellow - for 5-10 days
};

class AbsenceCalculator {
    constructor(teams, absenceData) {
        this.today = new Date();
        this.monthsPassed = this._calculateMonthsPassed();
        [this.accrued_dk, this.extra_dk] = this._calculateAccruedTimeDK();
        this.accrued_de = this._calculateAccruedTimeDE();
        [this.stats, this.allTypesSet] = this._calculateAbsences(teams, absenceData);
        
        // Calculate dates once
        this.yearEnd = new Date(Date.UTC(this.today.getUTCFullYear(), 11, 31));
        this.augEnd = new Date(Date.UTC(this.today.getUTCFullYear(), 7, 31));
        this.utcToday = new Date(Date.UTC(this.today.getUTCFullYear(), this.today.getUTCMonth(), this.today.getUTCDate()));
    }

    _calculateMonthsPassed() {
        const currentYear = this.today.getFullYear();
        const septFirst = new Date(currentYear, 8, 1); // September is month 8 (0-based)
        
        let referenceDate = this.today < septFirst ? 
            new Date(currentYear - 1, 8, 1) : 
            new Date(currentYear, 8, 1);
        
        const monthsPassed = (this.today.getFullYear() - referenceDate.getFullYear()) * 12 + 
                            (this.today.getMonth() - referenceDate.getMonth());
        return monthsPassed;
    }

    _calculateAccruedTimeDK() {
        const accrued_dk = Math.min(25, Math.round(2.08 * this.monthsPassed * 100) / 100);
        const extra_dk = 5;
        return [accrued_dk, extra_dk];
    }

    _calculateAccruedTimeDE() {
        const accrued_de = Math.min(30, Math.round(2.5 * this.monthsPassed * 100) / 100);
        return accrued_de;      
    }

    _calculateAbsences(teams, data) {
        const stats = {};
        const allTypesSet = new Set();
        
        teams.forEach(team => {
            team.members.forEach(member => {
                if (!member.name) return;
                
                const userData = data.find(item => item.username === member.name);
                if (!userData || !userData.employeeTimeNav) return;

                stats[member.name] = {
                    team: team.name,
                    types: {}
                };

                userData.employeeTimeNav.results.forEach(absence => {
                    const timeType = absence.timeTypeName?.toLowerCase().replace(' ', '-') || 'Unknown';
                    const daysSpent = parseFloat(absence.quantityInDays || 0);
                    stats[member.name].types[timeType] = (stats[member.name].types[timeType] || 0) + daysSpent;
                    allTypesSet.add(timeType);
                });
            });
        });
        
        return [stats, allTypesSet];
    }
}

class AbsenceHtmlGenerator {
    constructor(calculator) {
        this.calculator = calculator;
        this.predefinedOrder = ['time-off', 'holiday', 'extra-holiday', 'vacation', 'sickness', 'part-time-sick-(with-full-pay)', "child's-sick-day", 'day-off-with-pay'];
    }

    async generateAbsenceStatsHtml() {
        const allTypes = this.sortAbsenceTypes(this.calculator.allTypesSet);

        // Load template
        const templateResponse = await fetch(chrome.runtime.getURL('templates/absence.html'));
        let template = await templateResponse.text();

        // Replace placeholders
        const replacements = {
            '{{date}}': this.calculator.today.toISOString().split('T')[0],
            '{{tableContent}}': this.generateAbsenceTableContent(allTypes)
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.replace(placeholder, value);
        }

        template = template.replace(':root {', `:root {
            --color-above: ${COLORS.ABOVE};
            --color-crit: ${COLORS.CRIT};
            --color-warn: ${COLORS.WARN};
            --color-note: ${COLORS.NOTE};`);

        return template;
    }

    sortAbsenceTypes(allTypesSet) {
        return Array.from(allTypesSet).sort((a, b) => {
            const aIndex = this.predefinedOrder.indexOf(a);
            const bIndex = this.predefinedOrder.indexOf(b);
            if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    }

    generateAbsenceTableContent(allTypes) {
        const tableHeader = this.generateTableHeader(allTypes);
        const tableBody = this.generateTableBody(allTypes);
        return tableHeader + tableBody;
    }

    generateTableHeader(allTypes) {
        return `
            <thead>
                <tr>
                    <th><input type="text" id="nameSearch" onkeyup="searchNames()" placeholder="Search names..."></th>
                    <th>
                        <select id="teamDropdown" onchange="filterTeam()">
                            <option value="all">All</option>
                            ${Object.values(this.calculator.stats)
                                .map(data => data.team)
                                .filter((v, i, a) => a.indexOf(v) === i)
                                .map(team => 
                                    `<option value="${team.replace(' ', '_')}">${team}</option>`
                                ).join('')}
                        </select>
                    </th>
                    <th class="sortable" onclick="sortTable(2)">
                        Available Days
                        <label style="float: left">
                            <input type="checkbox" id="showTotalDays" onclick="event.stopPropagation(); toggleDaysDisplay()">
                            Show Total
                        </label>
                    </th>
                    ${allTypes.map((type, i) => 
                        `<th class="sortable" onclick="sortTable(${i + 3})">${type}</th>`
                    ).join('')}
                </tr>
            </thead>`;
    }

    generateTableBody(allTypes) {
        let bodyContent = '<tbody>';
        
        Object.entries(this.calculator.stats)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([name, data]) => {
                const row = this.generateTableRow(name, data, allTypes);
                bodyContent += row;
            });
        
        return bodyContent + '</tbody>';
    }

    calculateRemainingDays(data) {
        const types = data.types;
        const hasHoliday = types['holiday'] !== undefined || types['extra-holiday'] !== undefined;
        const hasVacation = types['vacation'] !== undefined;
        const hasTimeOff = types['time-off'] !== undefined;
        
        let remainingDays;
        let totalAccrued;
        if (hasHoliday) {    // DK fields
            const accruedRemaining = this.calculator.accrued_dk - (types['holiday'] || 0);
            const extraRemaining = this.calculator.extra_dk - (types['extra-holiday'] || 0);
            remainingDays = accruedRemaining + extraRemaining;
            totalAccrued = this.calculator.accrued_dk + this.calculator.extra_dk;
        } else if (hasVacation) { // DE fields
            console.log("Remaining days DE:", this.calculator.accrued_de, "Vacation days:", types['vacation']);
            remainingDays = this.calculator.accrued_de - (types['vacation'] || 0);
            totalAccrued = this.calculator.accrued_de;
        } else if (hasTimeOff) { // fields for DK/DE where not direct report
            remainingDays = this.calculator.accrued_de - (types['time-off'] || 0);
            totalAccrued = this.calculator.accrued_de;
        } else {
            // No holiday, vacation, or time-off - should not get here.
            remainingDays = 0;
            totalAccrued = 0;
        }
        
        return [remainingDays.toFixed(2), totalAccrued.toFixed(2)];
    }

    generateTableRow(name, data, allTypes) {
        const teamClass = data.team.replace(' ', '_');
        const [remainingDays, totalAccrued] = this.calculateRemainingDays(data);
        return `
            <tr class='${teamClass}'>
                <td>${name}</td>
                <td>${data.team}</td>
                <td data-remaining="${remainingDays}" data-total="${totalAccrued}">${remainingDays}</td>
                ${this.generateTypeCells(data, allTypes)}
            </tr>`;
    }

    getRegularHolidayColor(daysLeft) {
        if (daysLeft < 0) return COLORS.ABOVE;
        if (daysLeft <= 5) return '';
        if (daysLeft <= 10) return COLORS.NOTE;
        if (daysLeft <= 15) return COLORS.WARN;
        return COLORS.CRIT;
    }

    getExtraHolidayColor(daysLeft, today, augEnd) {
        if (today.getUTCMonth() !== 7) return '';

        const daysUntilEnd = Math.floor((augEnd - today) / (1000 * 60 * 60 * 24));
        const weeksLeft = Math.floor(daysUntilEnd / 7);
        
        if (daysLeft === 0) return '';
        if (weeksLeft >= 3) return COLORS.NOTE;
        if (weeksLeft >= 2) return COLORS.WARN;
        if (weeksLeft >= 1) return COLORS.CRIT;
        return COLORS.ABOVE;
    }

    getCellColor(daysLeft, today, deadline, isExtra = false) {
        return isExtra ? this.getExtraHolidayColor(daysLeft, today, deadline) : this.getRegularHolidayColor(daysLeft);
    }

    generateTypeCells(data, allTypes) {
        return allTypes.map(absenceType => {
            let cellStyle = '';
            let count = data.types[absenceType];
            console.log("Absence type:", absenceType, "Count:", count, "Logic:", (absenceType === 'vacation' || absenceType === 'holiday' || absenceType === 'time-off' || absenceType === 'extra-holiday') && count !== undefined);
            if ((absenceType === 'vacation' || absenceType === 'holiday' || 
                absenceType === 'time-off' || absenceType === 'extra-holiday') &&
                count !== undefined) {
                count = data.types[absenceType] || 0;

                if (absenceType === 'extra-holiday') {
                    const daysLeft = this.calculator.extra_dk - count;
                    const color = this.getCellColor(daysLeft, this.calculator.today, this.calculator.augEnd, true);
                    cellStyle = color ? ` style="background-color: ${color}"` : '';
                } else if (absenceType === 'vacation') {
                    const daysLeft = this.calculator.accrued_de - count;
                    const color = this.getCellColor(daysLeft, this.calculator.today, this.calculator.yearEnd);
                    cellStyle = color ? ` style="background-color: ${color}"` : '';
                } else {
                    const daysLeft = this.calculator.accrued_dk - count;
                    const color = this.getCellColor(daysLeft, this.calculator.today, this.calculator.yearEnd);
                    cellStyle = color ? ` style="background-color: ${color}"` : '';
                }
            } else {
                count = count || '-';
                if (count === '-') {
                    cellStyle = ' class="disabled-cell"';
                }
            }

            return `<td${cellStyle}>${count}</td>`;
        }).join('');
    }
}

export async function generateAbsenceAndDownload(absenceData) {
    const teamsResponse = await fetch(chrome.runtime.getURL('config/teams.yaml'));
    const teams = jsyaml.load(await teamsResponse.text());

    const calculator = new AbsenceCalculator(teams.teams, absenceData.d.results);
    const htmlGenerator = new AbsenceHtmlGenerator(calculator);

    console.log("Accrued time DK:", calculator.accrued_dk, "Extra time DK:", calculator.extra_dk, "Accrued time DE:", calculator.accrued_de);

    const statsHtml = await htmlGenerator.generateAbsenceStatsHtml();
    downloadFile(statsHtml, 'absence_stats.html', 'text/html');
}
