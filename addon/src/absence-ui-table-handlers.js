let currentSortColumn = null;  // Start with null so first sort doesn't toggle
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
    const table = document.getElementById('absenceTable');
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

    // Get column index dynamically
    const columnIndex = Array.from(headers).findIndex(h => h.getAttribute('data-column') === columnName);

    if (columnIndex === -1) return;

    // Sort rows
    rows.sort((a, b) => {
        let aValue = a.cells[columnIndex]?.textContent?.trim() || '';
        let bValue = b.cells[columnIndex]?.textContent?.trim() || '';

        // Handle site column specially (select values)
        if (columnName === 'site') {
            const aSelect = a.cells[columnIndex]?.querySelector('select');
            const bSelect = b.cells[columnIndex]?.querySelector('select');
            
            if (aSelect && bSelect) {
                aValue = aSelect.value;
                bValue = bSelect.value;
                return currentSortDirection === 'asc' ? 
                    aValue.localeCompare(bValue) : 
                    bValue.localeCompare(aValue);
            }
        }

        // Handle carry-over holidays column specially (numeric sort)
        if (columnName === 'carry_over_holidays') {
            const aInput = a.cells[columnIndex]?.querySelector('input');
            const bInput = b.cells[columnIndex]?.querySelector('input');
            
            if (aInput && bInput) {
                const aNum = parseInt(aInput.value) || 0;
                const bNum = parseInt(bInput.value) || 0;
                return currentSortDirection === 'asc' ? aNum - bNum : bNum - aNum;
            }
        }

        // Handle available holidays column specially (numeric sort)
        if (columnName === 'available_holidays') {
            const aText = a.cells[columnIndex]?.textContent?.trim() || '0';
            const bText = b.cells[columnIndex]?.textContent?.trim() || '0';
            
            const aNum = parseFloat(aText) || 0;
            const bNum = parseFloat(bText) || 0;
            return currentSortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Handle remaining holidays column specially (numeric sort)
        if (columnName === 'remaining_holidays') {
            let aNum = 0;
            let bNum = 0;
            
            // For ERL sites, get the simple number
            const aSimple = a.cells[columnIndex]?.textContent?.trim();
            const bSimple = b.cells[columnIndex]?.textContent?.trim();
            
            // Check if this is a simple number (ERL site)
            if (aSimple && !isNaN(parseFloat(aSimple))) {
                aNum = parseFloat(aSimple) || 0;
            } else {
                // For LY sites, sum up special + standard days
                const aSpecial = a.cells[columnIndex]?.querySelector('.special-days');
                const aStandard = a.cells[columnIndex]?.querySelector('.standard-days');
                if (aSpecial && aStandard) {
                    aNum = (parseFloat(aSpecial.textContent) || 0) + (parseFloat(aStandard.textContent) || 0);
                }
            }
            
            if (bSimple && !isNaN(parseFloat(bSimple))) {
                bNum = parseFloat(bSimple) || 0;
            } else {
                // For LY sites, sum up special + standard days
                const bSpecial = b.cells[columnIndex]?.querySelector('.special-days');
                const bStandard = b.cells[columnIndex]?.querySelector('.standard-days');
                if (bSpecial && bStandard) {
                    bNum = (parseFloat(bSpecial.textContent) || 0) + (parseFloat(bStandard.textContent) || 0);
                }
            }
            
            return currentSortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Handle spent days columns (those starting with 'spent_')
        if (columnName.startsWith('spent_')) {
            const aText = a.cells[columnIndex]?.textContent?.trim() || '0';
            const bText = b.cells[columnIndex]?.textContent?.trim() || '0';
            
            const aNum = parseFloat(aText) || 0;
            const bNum = parseFloat(bText) || 0;
            return currentSortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // String comparison for other columns
        const comparison = aValue.localeCompare(bValue);
        return currentSortDirection === 'asc' ? comparison : -comparison;
    });

    // Clear and re-append sorted rows
    tbody.innerHTML = '';
    rows.forEach(row => {
        tbody.appendChild(row);
        addRowHoverEffect(row);
    });
}

function applyFilters() {
    const table = document.getElementById('absenceTable');
    const tbody = table.getElementsByTagName('tbody')[0];
    const rows = Array.from(tbody.getElementsByTagName('tr'));
    const searchInputs = document.querySelectorAll('.column-search');

    // Get all filter values
    const filters = {};
    searchInputs.forEach(input => {
        const column = input.dataset.column;
        const value = input.value.toLowerCase().trim();
        if (value) {
            filters[column] = value;
        }
    });

    console.log('Applying filters:', filters);

    // Filter rows
    rows.forEach(row => {
        let shouldShow = true;
        const cells = Array.from(row.cells);

        // Check each filter
        Object.entries(filters).forEach(([column, filterValue]) => {
            const columnIndex = {
                'name': 0,
                'site': 1,
                'carry_over_holidays': 2,
                'available_holidays': 3
            }[column];

            if (columnIndex !== undefined && cells[columnIndex]) {
                let cellText = '';

                // Handle special columns
                if (column === 'site') {
                    const select = cells[columnIndex].querySelector('select');
                    cellText = select ? select.value.toLowerCase() : '';
                    
                    // For site column, match exact values
                    if (cellText !== filterValue.toLowerCase()) {
                        shouldShow = false;
                    }
                    return; // Skip the general includes check for site
                } else if (column === 'carry_over_holidays') {
                    const input = cells[columnIndex].querySelector('input');
                    cellText = input ? input.value.toLowerCase() : '';
                } else if (column === 'available_holidays') {
                    cellText = cells[columnIndex].textContent.toLowerCase();
                } else {
                    cellText = cells[columnIndex].textContent.toLowerCase();
                }

                if (!cellText.includes(filterValue)) {
                    shouldShow = false;
                }
            }
        });

        row.style.display = shouldShow ? '' : 'none';
    });
}

// Global flag to prevent multiple initializations
let tableHandlersInitialized = false;

export function initializeTableHandlers() {
    if (tableHandlersInitialized) {
        console.log('Table handlers already initialized');
        return;
    }

    console.log('Initializing absence table handlers');

    // Add click handlers for sortable headers
    const sortableHeaders = document.querySelectorAll('#absenceTable th[data-column]');
    sortableHeaders.forEach(header => {
        const headerTitle = header.querySelector('.header-title');
        if (headerTitle) {
            headerTitle.addEventListener('click', () => {
                const column = header.getAttribute('data-column');
                sortTable(column);
            });
            headerTitle.style.cursor = 'pointer';
        }
    });

    // Add event listeners for search inputs
    const searchInputs = document.querySelectorAll('.column-search');
    searchInputs.forEach(input => {
        input.addEventListener('input', applyFilters);
        input.addEventListener('change', applyFilters);
    });

    // Add hover effects to all existing rows
    const rows = document.querySelectorAll('#absenceTable tbody tr');
    rows.forEach(addRowHoverEffect);

    // Set initial sort if we have data
    if (document.querySelectorAll('#absenceTable tbody tr').length > 0) {
        sortTable('name');  // This will set currentSortColumn to 'name' and direction to 'asc'
    }

    tableHandlersInitialized = true;
}

export function resetTableInitialization() {
    tableHandlersInitialized = false;
}
