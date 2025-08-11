let currentSortColumn = 'name';  // Changed from empty string
let currentSortDirection = 'asc';  // Changed from 'none'

function addRowHoverEffect(tr) {
    tr.style.transition = 'background-color 0.2s';
    tr.addEventListener('mouseenter', () => {
        tr.style.backgroundColor = '#b5c5f0ff';
    });
    tr.addEventListener('mouseleave', () => {
        tr.style.backgroundColor = '';
    });
}

function sortTable(columnName) {
    const table = document.getElementById('peopleTable');
    const tbody = table.getElementsByTagName('tbody')[0];
    const rows = Array.from(tbody.getElementsByTagName('tr'));

    // Reset all headers
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

    console.log(`Sorting by ${columnName} in ${currentSortDirection} order`);

    // Add sort indicator to current header
    const currentHeader = Array.from(headers).find(h => h.getAttribute('data-column') === columnName);
    if (currentHeader) {
        currentHeader.classList.add(`sort-${currentSortDirection}`);
    }

    // Get column index
    const columnIndex = {
        'name': 0,
        'birthday': 1,
        'title': 2,
        'team': 3,
        'legal_manager': 4,
        'functional_manager': 5,
        'external': 6
    }[columnName];

    // Sort rows
    rows.sort((a, b) => {
        let aValue, bValue;
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];

        // Handle select elements
        const aSelect = aCell.querySelector('select');
        const bSelect = bCell.querySelector('select');

        aValue = aSelect ? aSelect.value : aCell.textContent.trim();
        bValue = bSelect ? bSelect.value : bCell.textContent.trim();

        // Special handling for external column
        if (columnName === 'external') {
            return currentSortDirection === 'asc' ? 
                aValue.localeCompare(bValue) : 
                bValue.localeCompare(aValue);
        }
        
        if (currentSortDirection === 'asc') {
            return aValue.localeCompare(bValue);
        } else {
            return bValue.localeCompare(aValue);
        }
    });

    // Re-append rows in new order
    rows.forEach(row => tbody.appendChild(row));
}

function filterTable() {
    const table = document.getElementById('peopleTable');
    const searchInputs = table.querySelectorAll('.column-search');
    const rows = Array.from(table.getElementsByTagName('tbody')[0].getElementsByTagName('tr'));
    
    const columnIndices = {
        'name': 0,
        'birthday': 1,
        'title': 2,
        'team': 3,
        'legal_manager': 4,
        'functional_manager': 5,
        'external': 6,
        'virtual_team': 7
    };
    
    rows.forEach(row => {
        let showRow = true;
        searchInputs.forEach(input => {
            if (!input.value.trim()) return;
            const columnName = input.dataset.column;
            const columnIndex = columnIndices[columnName];
            
            const cell = row.cells[columnIndex];
            let cellValue = cell.querySelector('select') ? 
                cell.querySelector('select').value : 
                cell.textContent.trim();

            // Special handling for external column search
            if (columnName === 'external') {
                const searchVal = input.value.toLowerCase();
                cellValue = cellValue.toLowerCase();
                
                // Map true/yes and false/no values
                const isMatch = 
                    (searchVal === 'true' && (cellValue === 'true' || cellValue === 'yes')) ||
                    (searchVal === 'false' && (cellValue === 'false' || cellValue === 'no')) ||
                    (searchVal === 'yes' && (cellValue === 'true' || cellValue === 'yes')) ||
                    (searchVal === 'no' && (cellValue === 'false' || cellValue === 'no')) ||
                    cellValue.includes(searchVal);
                
                if (!isMatch) {
                    showRow = false;
                }
                return;
            }

            // Special handling for virtual team search
            if (columnName === 'virtual_team') {
                const searchVal = input.value.toLowerCase();
                const teams = cellValue.split(',').map(t => t.trim().toLowerCase());
                if (!teams.some(team => team.includes(searchVal))) {
                    showRow = false;
                }
                return;
            }

            // Normal search for other columns
            if (!cellValue.toLowerCase().includes(input.value.toLowerCase())) {
                showRow = false;
            }
        });
        row.style.display = showRow ? '' : 'none';
    });
}

// Add a flag to track initialization
let isInitialized = false;

export function resetTableInitialization() {
    isInitialized = false;
    console.log('People table initialization reset');
}

export function initializeTableHandlers() {
    // Prevent double initialization
    if (isInitialized) {
        console.log('Table handlers already initialized, skipping');
        return;
    }

    const headers = document.querySelectorAll('#peopleTable th');
    console.log('Headers found:', headers.length);
    
    // Add search handlers
    const searchInputs = document.querySelectorAll('.column-search');
    searchInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            e.stopPropagation();
            filterTable();
        });
        
        // Prevent sorting when clicking search input
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    headers.forEach(header => {
        const columnName = header.getAttribute('data-column');
        if (columnName) {
            const headerTitle = header.querySelector('.header-title');
            if (headerTitle) {
                headerTitle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sortTable(columnName);
                });
                console.log('Header click listener added for column:', columnName);
            }
        }
    });

    const rows = document.querySelectorAll('#peopleTable tbody tr');
    rows.forEach(row => addRowHoverEffect(row));

    // Perform initial sort by name
    sortTable('name');
    
    // Mark as initialized
    isInitialized = true;
}

// Create an observer instance to watch for table changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            const table = document.getElementById('peopleTable');
            if (table && !isInitialized) {
                console.log('Table found through observer, initializing handlers');
                initializeTableHandlers();
                observer.disconnect();
                break;
            }
        }
    }
});

// Only initialize if table exists and not already initialized
const table = document.getElementById('peopleTable');
if (!table) {
    console.log('Table not present, starting observer');
    observer.observe(document.body, { childList: true, subtree: true });
} else if (!isInitialized) {
    console.log('Table already present, initializing handlers');
    initializeTableHandlers();
}

console.log('People UI Table Handlers loaded.');