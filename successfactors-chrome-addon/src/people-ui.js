// src/people-ui.js
// Renders a table of all employees with Name, Birthday, Title, Team, and Manager.

export async function showPeopleTab() {
    const tab = document.getElementById('people-tab');
    tab.innerHTML = 'Loading...';
    // Load new YAML file
    const response = await fetch('config/people.yaml');
    const yamlText = await response.text();
    const data_people = jsyaml.load(yamlText);

    const response_teams = await fetch('config/groups.yaml');
    const yamlText_teams = await response_teams.text();
    const data_teams = jsyaml.load(yamlText_teams);

    tab.innerHTML = '';
    tab.appendChild(renderPeopleTable(data_people, data_teams));
}

export function renderPeopleTable(data_people, data_group) {
    // Extract people and teams
    const people = Array.isArray(data_people?.people) ? data_people.people : [];
    const teamsArr = Array.isArray(data_group?.teams) ? data_group.teams : [];

    // Helper: get unique managers
    const managers = [...new Set(people.map(p => p.line_manager).filter(Boolean))].sort();
    // Helper: get unique team names
    const teamNames = teamsArr.map(t => t.name);
    // Helper: get unique titles
    const titles = [...new Set(people.map(p => p.title).filter(Boolean))].sort();

    // Helper: map person name to team name
    const personToTeam = {};
    teamsArr.forEach(team => {
        (team.members || []).forEach(member => {
            personToTeam[member] = team.name;
        });
    });

    // Table state for sorting
    let currentSort = { col: null, asc: true };
    let tablePeople = [...people];
    let filterState = { Title: new Set(titles), Team: new Set(teamNames), Manager: new Set(managers) };

    // Create table and header
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'block';
    container.style.width = '100%';
    container.style.height = '100%';
    const table = document.createElement('table');
    table.className = 'people-table';
    table.style.width = '100%';
    table.style.height = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columns = ['Name', 'Birthday', 'Title', 'Team', 'Manager', ''];
    columns.forEach((col, i) => {
        const th = document.createElement('th');
        th.style.padding = '8px';
        th.style.background = '#f5f5f5';
        th.style.border = '1px solid #ddd';
        if (col && col !== '') {
            th.textContent = col;
            th.style.cursor = 'pointer';
            if (col === 'Manager' || col === 'Team' || col === 'Title') {
                th.onclick = (e) => showFilterSortPopup(e, col);
                th.title = 'Filter/Sort by ' + col;
            } else {
                th.onclick = () => sortTable(col);
                th.title = 'Sort by ' + col;
            }
        } else {
            // Plus button in last header cell
            const addBtn = document.createElement('button');
            addBtn.title = 'Add row';
            addBtn.innerHTML = '➕';
            addBtn.style.fontSize = '18px';
            addBtn.style.border = 'none';
            addBtn.style.background = 'none';
            addBtn.style.cursor = 'pointer';
            addBtn.onclick = () => {
                tbody.appendChild(createRow());
            };
            th.appendChild(addBtn);
        }
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');
    function createRow(person = {name: '', birthday: '', title: '', line_manager: ''}) {
        const tr = document.createElement('tr');
        // Name
        let td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = person.name || '';
        td.onfocus = () => td.classList.add('editing');
        td.onblur = () => td.classList.remove('editing');
        tr.appendChild(td);
        // Birthday
        td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = person.birthday || '';
        td.onfocus = () => td.classList.add('editing');
        td.onblur = () => td.classList.remove('editing');
        tr.appendChild(td);
        // Title
        td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = person.title || '';
        td.onfocus = () => td.classList.add('editing');
        td.onblur = () => td.classList.remove('editing');
        tr.appendChild(td);
        // Team (dropdown)
        td = document.createElement('td');
        const selectTeam = document.createElement('select');
        selectTeam.style.width = '100%';
        selectTeam.style.height = '100%';
        selectTeam.style.border = 'none';
        selectTeam.style.background = 'transparent';
        selectTeam.style.font = 'inherit';
        teamNames.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team;
            opt.textContent = team;
            if ((personToTeam[person.name] || '') === team) opt.selected = true;
            selectTeam.appendChild(opt);
        });
        selectTeam.onfocus = () => td.classList.add('editing');
        selectTeam.onblur = () => td.classList.remove('editing');
        td.appendChild(selectTeam);
        tr.appendChild(td);
        // Manager (dropdown)
        td = document.createElement('td');
        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.height = '100%';
        select.style.border = 'none';
        select.style.background = 'transparent';
        select.style.font = 'inherit';
        managers.forEach(mgr => {
            const opt = document.createElement('option');
            opt.value = mgr;
            opt.textContent = mgr;
            if (mgr === person.line_manager) opt.selected = true;
            select.appendChild(opt);
        });
        select.onfocus = () => td.classList.add('editing');
        select.onblur = () => td.classList.remove('editing');
        td.appendChild(select);
        tr.appendChild(td);
        // Remove button
        const tdRemove = document.createElement('td');
        tdRemove.style.textAlign = 'center';
        const removeBtn = document.createElement('button');
        removeBtn.title = 'Remove row';
        removeBtn.innerHTML = '🗑️';
        removeBtn.style.border = 'none';
        removeBtn.style.background = 'none';
        removeBtn.style.cursor = 'pointer';
        removeBtn.onclick = () => {
            tr.remove();
        };
        tdRemove.appendChild(removeBtn);
        tr.appendChild(tdRemove);
        return tr;
    }
    function renderTableRows() {
        tbody.innerHTML = '';
        // Apply filters
        let filtered = tablePeople.filter(person => {
            const team = personToTeam[person.name] || '';
            return filterState.Title.has(person.title) && filterState.Team.has(team) && filterState.Manager.has(person.line_manager);
        });
        filtered.forEach(person => tbody.appendChild(createRow(person)));
    }
    renderTableRows();
    table.appendChild(tbody);

    // Sorting logic
    function sortTable(col, asc = null) {
        let key;
        switch (col) {
            case 'Name': key = 'name'; break;
            case 'Birthday': key = 'birthday'; break;
            case 'Title': key = 'title'; break;
            case 'Manager': key = 'line_manager'; break;
            case 'Team': key = 'team'; break;
            default: key = null;
        }
        if (!key) return;
        // For Team, use personToTeam
        tablePeople.sort((a, b) => {
            let aVal, bVal;
            if (key === 'team') {
                aVal = personToTeam[a.name] || '';
                bVal = personToTeam[b.name] || '';
            } else {
                aVal = a[key] || '';
                bVal = b[key] || '';
            }
            if (aVal < bVal) return (asc === null ? currentSort.asc : asc) ? -1 : 1;
            if (aVal > bVal) return (asc === null ? currentSort.asc : asc) ? 1 : -1;
            return 0;
        });
        // Toggle sort direction if same column
        if (asc === null) {
            if (currentSort.col === col) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort.col = col;
                currentSort.asc = true;
            }
        } else {
            currentSort.col = col;
            currentSort.asc = asc;
        }
        renderTableRows();
    }

    // Popup for filter/sort (Excel-like)
    let popupDiv = null;
    function showFilterSortPopup(e, col) {
        if (popupDiv) popupDiv.remove();
        popupDiv = document.createElement('div');
        popupDiv.style.position = 'absolute';
        popupDiv.style.zIndex = 1000;
        popupDiv.style.background = '#fff';
        popupDiv.style.border = '1px solid #aaa';
        popupDiv.style.padding = '10px';
        popupDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        popupDiv.style.top = (e.target.offsetTop + e.target.offsetHeight) + 'px';
        popupDiv.style.left = e.target.offsetLeft + 'px';
        // Asc/desc sort
        const ascBtn = document.createElement('button');
        ascBtn.textContent = 'Sort Ascending';
        ascBtn.onclick = () => { sortTable(col, true); popupDiv.remove(); };
        const descBtn = document.createElement('button');
        descBtn.textContent = 'Sort Descending';
        descBtn.onclick = () => { sortTable(col, false); popupDiv.remove(); };
        popupDiv.appendChild(ascBtn);
        popupDiv.appendChild(descBtn);
        popupDiv.appendChild(document.createElement('hr'));
        // All/None toggles
        const allNoneDiv = document.createElement('div');
        allNoneDiv.style.marginBottom = '6px';
        const allBtn = document.createElement('button');
        allBtn.textContent = 'All';
        allBtn.onclick = () => {
            values.forEach(val => filterState[col].add(val));
            renderTableRows();
            showFilterSortPopup(e, col); // Refresh popup
        };
        const noneBtn = document.createElement('button');
        noneBtn.textContent = 'None';
        noneBtn.onclick = () => {
            filterState[col].clear();
            renderTableRows();
            showFilterSortPopup(e, col); // Refresh popup
        };
        allNoneDiv.appendChild(allBtn);
        allNoneDiv.appendChild(noneBtn);
        popupDiv.appendChild(allNoneDiv);
        // Checkbox list
        let values = [];
        if (col === 'Manager') values = managers;
        else if (col === 'Team') values = teamNames;
        else if (col === 'Title') values = titles;
        values.forEach(val => {
            const label = document.createElement('label');
            label.style.display = 'block';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = filterState[col].has(val);
            cb.onchange = () => {
                if (cb.checked) filterState[col].add(val);
                else filterState[col].delete(val);
                renderTableRows();
            };
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + val));
            popupDiv.appendChild(label);
        });
        // Close on click outside
        setTimeout(() => {
            document.addEventListener('mousedown', closePopup, { once: true });
        }, 0);
        function closePopup(ev) {
            if (!popupDiv.contains(ev.target)) popupDiv.remove();
        }
        container.appendChild(popupDiv);
        e.stopPropagation();
    }

    // Add style for hover and editing
    if (!document.getElementById('people-table-style')) {
        const style = document.createElement('style');
        style.id = 'people-table-style';
        style.textContent = `
        .people-table tbody tr {
            transition: background 0.2s;
        }
        .people-table tbody tr:hover {
            background: #f3f7fb !important;
        }
        .people-table td:focus, .people-table td.editing,
        .people-table select:focus, .people-table select.editing {
            background: #e6f7ff !important;
            outline: none;
        }
        .people-table td, .people-table th {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .people-table {
            width: 100%;
            height: 100%;
            border-spacing: 0;
        }
        .people-table tbody tr:nth-child(even) {
            background: #fafbfc;
        }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(table);
    return container;
}
