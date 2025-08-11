let currentSortColumn = 'name';
let currentSortDirection = 'asc';

function addRowHoverEffect(tr) {
    tr.style.transition = 'background-color 0.2s';
    tr.addEventListener('mouseenter', () => {
        tr.style.backgroundColor = '#b5c5f0ff';
    });
    tr.addEventListener('mouseleave', () => {
        tr.style.backgroundColor = '';
    });
}

function sortTable(columnName, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.getElementsByTagName('tbody')[0];
    const rows = Array.from(tbody.getElementsByTagName('tr'));

    // Reset all headers in this table
    const headers = table.getElementsByTagName('th');
    Array.from(headers).forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });

    // Determine new sort direction
    if (currentSortColumn === columnName) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = columnName;
        currentSortDirection = 'asc';
    }

    console.log(`Sorting ${tableId} by ${columnName} in ${currentSortDirection} order`);

    // Add sort indicator to current header
    const currentHeader = Array.from(headers).find(h => h.getAttribute('data-column') === columnName);
    if (currentHeader) {
        currentHeader.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }

    // Get column index based on table and column
    let columnIndex;
    if (tableId === 'teamsTable') {
        columnIndex = {
            'name': 0,
            'product_owner': 1,
            'functional_manager': 2
        }[columnName];
    } else if (tableId === 'projectsTable') {
        columnIndex = {
            'name': 0,
            'project_lead': 1
        }[columnName];
    }

    if (columnIndex === undefined) return;

    // Sort rows
    rows.sort((a, b) => {
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];
        
        let aText = '';
        let bText = '';
        
        // Check if cells contain select elements
        const aSelect = aCell?.querySelector('select');
        const bSelect = bCell?.querySelector('select');
        
        if (aSelect) {
            // For select elements, get the selected option value or text
            aText = aSelect.value || '';
        } else {
            aText = aCell?.textContent?.trim() || '';
        }
        
        if (bSelect) {
            // For select elements, get the selected option value or text
            bText = bSelect.value || '';
        } else {
            bText = bCell?.textContent?.trim() || '';
        }
        
        const comparison = aText.localeCompare(bText, undefined, { numeric: true });
        return currentSortDirection === 'asc' ? comparison : -comparison;
    });

    // Re-append rows in new order
    rows.forEach(row => tbody.appendChild(row));
}

function filterTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const searchInputs = table.querySelectorAll('.column-search');
    const rows = Array.from(table.getElementsByTagName('tbody')[0].getElementsByTagName('tr'));
    
    let columnIndices;
    if (tableId === 'teamsTable') {
        columnIndices = {
            'name': 0,
            'product_owner': 1,
            'functional_manager': 2
        };
    } else if (tableId === 'projectsTable') {
        columnIndices = {
            'name': 0,
            'project_lead': 1
        };
    }
    
    rows.forEach(row => {
        let visible = true;
        
        searchInputs.forEach(input => {
            const column = input.getAttribute('data-column');
            const searchValue = input.value.toLowerCase().trim();
            const columnIndex = columnIndices[column];
            
            if (searchValue && columnIndex !== undefined) {
                const cell = row.cells[columnIndex];
                let cellText = '';
                
                // Check if the cell contains a select element
                const selectElement = cell?.querySelector('select');
                if (selectElement) {
                    // For select elements, get the selected option value
                    cellText = selectElement.value?.toLowerCase().trim() || '';
                } else {
                    // For regular text content
                    cellText = cell?.textContent?.toLowerCase().trim() || '';
                }
                
                if (!cellText.includes(searchValue)) {
                    visible = false;
                }
            }
        });
        
        row.style.display = visible ? '' : 'none';
    });
}

// Add a flag to track initialization
let isTeamTableInitialized = false;

export function resetTeamTableInitialization() {
    isTeamTableInitialized = false;
    console.log('Team table initialization reset');
}

export function initializeTeamTableHandlers() {
    // Prevent double initialization
    if (isTeamTableInitialized) {
        console.log('Team table handlers already initialized');
        return;
    }

    const teamsTable = document.getElementById('teamsTable');
    const projectsTable = document.getElementById('projectsTable');
    
    if (!teamsTable && !projectsTable) {
        console.log('No team tables found, initialization skipped');
        return;
    }

    // Initialize teams table
    if (teamsTable) {
        const teamsHeaders = teamsTable.querySelectorAll('th');
        console.log('Teams headers found:', teamsHeaders.length);
        
        // Add search handlers for teams table
        const teamsSearchInputs = teamsTable.querySelectorAll('.column-search');
        teamsSearchInputs.forEach(input => {
            input.addEventListener('input', () => filterTable('teamsTable'));
            input.addEventListener('keyup', () => filterTable('teamsTable'));
            // Prevent clicks on search inputs from triggering column sort
            input.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
        
        // Add sort handlers for teams table
        teamsHeaders.forEach(header => {
            const column = header.getAttribute('data-column');
            if (column) {
                header.addEventListener('click', () => {
                    console.log(`Teams header clicked: ${column}`);
                    sortTable(column, 'teamsTable');
                });
            }
        });

        // Add hover effects for teams table
        const teamsRows = teamsTable.querySelectorAll('tbody tr');
        teamsRows.forEach(row => addRowHoverEffect(row));

        // Perform initial sort by name for teams table
        sortTable('name', 'teamsTable');
    }
    
    // Initialize projects table
    if (projectsTable) {
        const projectsHeaders = projectsTable.querySelectorAll('th');
        console.log('Projects headers found:', projectsHeaders.length);
        
        // Add search handlers for projects table
        const projectsSearchInputs = projectsTable.querySelectorAll('.column-search');
        projectsSearchInputs.forEach(input => {
            input.addEventListener('input', () => filterTable('projectsTable'));
            input.addEventListener('keyup', () => filterTable('projectsTable'));
            // Prevent clicks on search inputs from triggering column sort
            input.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
        
        // Add sort handlers for projects table
        projectsHeaders.forEach(header => {
            const column = header.getAttribute('data-column');
            if (column) {
                header.addEventListener('click', () => {
                    console.log(`Projects header clicked: ${column}`);
                    sortTable(column, 'projectsTable');
                });
            }
        });

        // Add hover effects for projects table
        const projectsRows = projectsTable.querySelectorAll('tbody tr');
        projectsRows.forEach(row => addRowHoverEffect(row));

        // Perform initial sort by name for projects table
        sortTable('name', 'projectsTable');
    }
    
    // Mark as initialized
    isTeamTableInitialized = true;
}

// Create an observer instance to watch for table changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            const teamsTable = document.getElementById('teamsTable');
            const projectsTable = document.getElementById('projectsTable');
            if ((teamsTable || projectsTable) && !isTeamTableInitialized) {
                console.log('Team tables detected, initializing handlers');
                initializeTeamTableHandlers();
                break;
            }
        }
    }
});

// Only initialize if tables exist and not already initialized
const teamsTable = document.getElementById('teamsTable');
const projectsTable = document.getElementById('projectsTable');
if (!(teamsTable || projectsTable)) {
    console.log('Team tables not present, starting observer');
    observer.observe(document.body, { childList: true, subtree: true });
} else if (!isTeamTableInitialized) {
    console.log('Team tables found, initializing handlers');
    initializeTeamTableHandlers();
}

console.log('Team UI Table Handlers loaded.');
