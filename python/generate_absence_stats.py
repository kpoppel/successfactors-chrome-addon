import datetime
import yaml
import json
import re

def load_teams():
    with open('config/teams.yaml', 'r') as file:
        return yaml.safe_load(file)['teams']

def load_data():
    with open('output/holiday_data.json', 'r') as file:
        return json.load(file)['d']['results']

def calculate_accrued_time(today):
    current_year = today.year
    sept_first = datetime.date(current_year, 9, 1)
    
    # If we're past September, we're in the current period
    if today < sept_first:
        sept_first = datetime.date(current_year - 1, 9, 1)
    
    months_passed = (today.year - sept_first.year) * 12 + today.month - sept_first.month
    accrued = min(25, round(2.08 * months_passed, 2))
    extra = 5
    
    return [accrued, extra]

def get_regular_holiday_color(days_left):
    """Color based on remaining days"""
    if days_left < 0:
        #print(f"Days left < 0: {days_left}")
        return '#e6b3ff'  # purple
    if days_left <= 5:
        #print(f"Days left <=5: {days_left}")
        return ''  # no color
    if days_left <= 10:
        #print(f"Days left <=10: {days_left}")
        return '#ffffcc'  # yellow
    if days_left <= 15:
        return '#ffcc99'  # orange
    return '#ffcccc'  # red

def get_extra_holiday_color(days_left, today, aug_end):
    """Special coloring for extra holidays in August"""
    if today.month != 8:
        return ''
        
    days_until_end = (aug_end - today).days
    weeks_left = days_until_end // 7
    
    if days_left == 0:
        return ''  # no color if days are spent
        
    if weeks_left >= 3:
        return '#ffffcc'  # yellow - first week
    elif weeks_left >= 2:
        return '#ffcc99'  # orange - second week
    elif weeks_left >= 1:
        return '#ffcccc'  # red - third week
    return '#e6b3ff'  # purple - fourth week

def get_cell_color(days_left, today, deadline, is_extra=False):
    if is_extra:
        return get_extra_holiday_color(days_left, today, deadline)
    return get_regular_holiday_color(days_left)

def calculate_absences(teams, data):
    """
    Calculate absence statistics for all team members.
    Returns:
        tuple: (stats, all_types_set) where
            stats: dict of person stats including team and absence types
            all_types_set: set of all found absence types
    """
    stats = {}
    all_types_set = set()
    
    for team in teams:
        for member in team['members']:
            if 'name' not in member:
                continue
            user_data = next((item for item in data if item['username'] == member['name']), None)
            if user_data and 'employeeTimeNav' in user_data:
                stats[member['name']] = {
                    'team': team['name'],
                    'types': {}
                }
                for absence in user_data['employeeTimeNav']['results']:
                    time_type = absence.get('timeTypeName', 'Unknown').lower().replace(' ', '-')
                    days_spent = float(absence.get('quantityInDays', 0))
                    stats[member['name']]['types'][time_type] = stats[member['name']]['types'].get(time_type, 0) + days_spent
                    all_types_set.add(time_type)
    
    print(stats)
    print(all_types_set)
    return stats, all_types_set

def generate_absence_stats_html(today):
    teams = load_teams()
    data = load_data()
    [accrued, extra] = calculate_accrued_time(today)
    year_end = datetime.date(today.year, 12, 31)
    aug_end = datetime.date(today.year, 8, 31)
    
    # Calculate absence statistics
    stats, all_types_set = calculate_absences(teams, data)
    
    # Define the desired order for absence types
    predefined_order = ['time-off', 'holiday', 'extra-holiday', 'vacation', 'sickness', 'part-time-sick-(with-full-pay)', "child's-sick-day", 'day-off-with-pay']
    
    # Get unique absence types and sort them
    all_types = sorted(all_types_set, key=lambda x: (predefined_order.index(x) if x in predefined_order else len(predefined_order), x))

    # Generate HTML table
    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Absence Statistics</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; position: sticky; top: 0; cursor: pointer; }}
        th.sortable {{ position: relative; }}
        th.sortable::after {{
            content: '';
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            border: 5px solid transparent;
        }}
        th.sortable.asc::after {{
            border-bottom-color: black;
        }}
        th.sortable.desc::after {{
            border-top-color: black;
        }}
        .filters {{ margin-bottom: 20px; }}
        .hidden {{ display: none; }}
        input[type="text"] {{ width: 100%; box-sizing: border-box; }}
        select {{ width: 100%; }}
        .days-remaining {{ font-size: 0.8em; color: #666; }}
        .disabled-cell {{ 
            background-color: #f0f0f0; 
            color: #999;
        }}
    </style>
</head>
<body>
    <h1>Absence Statistics {today.strftime('%Y-%m-%d')}</h1>
    <table id="absenceTable">
        <thead>
            <tr>
                <th>
                    <input type="text" id="nameSearch" onkeyup="searchNames()" placeholder="Search for names..">
                </th>
                <th>
                    <select id="teamDropdown" onchange="filterTeam()">
                        <option value="all">All</option>
                        {' '.join(f'<option value="{team["name"].replace(" ", "_")}">{team["name"]}</option>' for team in teams)}
                    </select>
                </th>
                <th class="sortable" onclick="sortTable(2)">
                    Available Days
                    <label style="float: left">
                        <input type="checkbox" id="showTotalDays" onclick="event.stopPropagation(); toggleDaysDisplay()">
                        Show Total
                    </label>
                </th>
                {' '.join(f'<th class="sortable" onclick="sortTable({i + 3})">{type}</th>' for i, type in enumerate(all_types))}
            </tr>
        </thead>
        <tbody>
    """

    # Modify row generation
    for name, data in sorted(stats.items()):
        team_class = data['team'].replace(' ', '_')
        has_holiday = 'holiday' in data['types'] or 'extra-holiday' in data['types']
        has_vacation = 'vacation' in data['types']
        has_time_off = 'time-off' in data['types']
        
        if has_holiday:    # DK fields
            accrued_remaining = accrued - data['types'].get('holiday', 0)
            extra_remaining = extra - data['types'].get('extra-holiday', 0)
            remaining_days = round(accrued_remaining + extra_remaining, 2)
        elif has_vacation: # DE fields
            accrued_remaining = accrued - data['types'].get('vacation', 0)
            remaining_days = round(accrued_remaining, 2)
        elif has_time_off: # fields for DK/DE where not direct report
            accrued_time_off = accrued - data['types'].get('time-off', 0)
            remaining_days = round(accrued_time_off, 2)
            
        print(f"Name: {name}, Remaining Days: {remaining_days}, Team: {data['team']}")
        html_content += f'''<tr class='{team_class}'>
            <td>{name}</td>
            <td>{data['team']}</td>
            <td data-remaining="{remaining_days}" data-total="{remaining_days}">{remaining_days}</td>'''
        
        for absence_type in all_types:
            cell_style = ''
            count = data['types'].get(absence_type, '-')
            if absence_type not in ['vacation', 'holiday', 'time-off', 'extra-holiday']:
                if count == '-':
                    cell_style = 'class="disabled-cell"'
            else:
                count = data['types'].get(absence_type, 0)
                if absence_type == 'extra-holiday':
                    color = get_cell_color(remaining_days, today, year_end, is_extra=True)
                else:
                    color = get_cell_color(remaining_days, today, year_end, is_extra=False)
                cell_style = f'style="background-color: {color}"' if color else ''
                
            html_content += f'<td {cell_style}>{count}</td>'
        
        html_content += "</tr>"

    html_content += """
        </tbody>
    </table>
    <script>
        let currentSortColumn = -1;
        let currentSortDirection = 'none'; // 'asc', 'desc', or 'none'

        function filterTeam() {
            const selectedTeam = document.getElementById('teamDropdown').value;
            document.querySelectorAll('tbody tr').forEach(function(row) {
                if (selectedTeam === 'all') {
                    row.classList.remove('hidden');
                } else if (row.classList.contains(selectedTeam)) {
                    row.classList.remove('hidden');
                } else {
                    row.classList.add('hidden');
                }
            });
        }

        function searchNames() {
            const input = document.getElementById('nameSearch');
            const filter = input.value.toLowerCase();
            document.querySelectorAll('tbody tr').forEach(function(row) {
                const name = row.querySelector('td').textContent.toLowerCase();
                if (name.includes(filter)) {
                    row.classList.remove('hidden');
                } else {
                    row.classList.add('hidden');
                }
            });
        }

        function toggleDaysDisplay() {
            const showTotal = document.getElementById('showTotalDays').checked;
            document.querySelectorAll('tbody tr td:nth-child(3)').forEach(cell => {
                cell.textContent = showTotal ? cell.dataset.total : cell.dataset.remaining;
            });
            
            // Re-sort if the column is currently sorted
            if (currentSortColumn === 2) {
                sortTable(2);
            }
        }

        function sortTable(columnIndex) {
            const table = document.getElementById("absenceTable");
            const rows = Array.from(table.rows).slice(1); // Exclude header row
            const isNumeric = columnIndex > 1; // Numeric sorting for absence columns
            const isAvailableDays = columnIndex === 2; // Special handling for available days column
            const showTotal = isAvailableDays && document.getElementById('showTotalDays').checked;

            // Determine the next sort direction
            let direction;
            if (currentSortColumn === columnIndex) {
                if (currentSortDirection === 'none') {
                    direction = 'desc';
                } else if (currentSortDirection === 'desc') {
                    direction = 'asc';
                } else {
                    direction = 'none';
                }
            } else {
                direction = 'desc';
            }

            currentSortColumn = columnIndex;
            currentSortDirection = direction;

            if (direction === 'none') {
                // Reset to default sorting by name
                rows.sort((a, b) => a.cells[0].textContent.trim().localeCompare(b.cells[0].textContent.trim()));
            } else {
                rows.sort((a, b) => {
                    const cellA = a.cells[columnIndex].textContent.trim();
                    const cellB = b.cells[columnIndex].textContent.trim();
                    
                    // Handle disabled cells in sorting
                    if (cellA === '-' && cellB === '-') return 0;
                    if (cellA === '-') return direction === 'asc' ? 1 : -1;
                    if (cellB === '-') return direction === 'asc' ? -1 : 1;
                    
                    if (isAvailableDays) {
                        const valueA = showTotal ? cellA.dataset.total : cellA.dataset.remaining;
                        const valueB = showTotal ? cellB.dataset.total : cellB.dataset.remaining;
                        const [accruedA] = valueA.split('/').map(Number);
                        const [accruedB] = valueB.split('/').map(Number);
                        return direction === "asc" ? accruedA - accruedB : accruedB - accruedA;
                    }
                    if (isNumeric) {
                        return direction === "asc" ? cellA - cellB : cellB - cellA;
                    } else {
                        return direction === "asc" ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
                    }
                });
            }

            const tbody = table.querySelector("tbody");
            rows.forEach(row => tbody.appendChild(row));

            // Update sort icons
            document.querySelectorAll('th.sortable').forEach(th => th.classList.remove('asc', 'desc'));
            if (direction !== 'none') {
                const header = table.rows[0].cells[columnIndex];
                header.classList.add(direction);
            }
        }
    </script>
</body>
</html>
    """
    return html_content

if __name__ == "__main__":
    # Generate absence statistics
    today = datetime.date.today()
    # Test extra holiday coloring:
    # today = datetime.date(2025, 8, 2)
    # today = datetime.date(2025, 8, 15)
    # today = datetime.date(2025, 8, 22)
    # today = datetime.date(2025, 8, 31)

    #today = datetime.date(2024, 9, 30)
    #today = datetime.date(2025, 12, 31)

    stats_html = generate_absence_stats_html(today)
    with open("output/absence_stats.html", "w") as file:
        file.write(stats_html)
