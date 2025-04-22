import datetime
import yaml
import json
import re
from ics import Calendar, Event
import base64
import gzip

def load_teams():
    with open('config/teams.yaml', 'r') as file:
        return yaml.safe_load(file)['teams']

def load_data():
    with open('output/holiday_data.json', 'r') as file:
        return json.load(file)['d']['results']

def load_image():
    with open('cake_emoji.png', 'rb') as file:
        return base64.b64encode(file.read()).decode('utf-8')
    
def get_date_range(data):
    dates = []
    for item in data:
        non_working_dates = json.loads(item['nonWorkingDates'])
        dates.extend([datetime.datetime.strptime(date['date'], '%Y-%m-%d').date() for date in non_working_dates])
    start_date = min(dates)
    end_date = max(dates)
    return start_date, end_date

def parse_date(date_str):
    match = re.search(r'/Date\((\d+)\)/', date_str)
    if match:
        timestamp = int(match.group(1)) // 1000
        return datetime.datetime.fromtimestamp(timestamp).date()
    return None

def generate_html():
    teams = load_teams()
    data = load_data()
    cake_emoji_base64 = load_image()
    start_date, end_date = get_date_range(data)
    date_range_title = f"{start_date.strftime('%B %Y')} - {end_date.strftime('%B %Y')}"

    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendar View</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
        }}
        .calendar-container {{
            display: flex;
            flex-direction: column;
            height: 100vh;
        }}
        .header {{
            text-align: center;
            padding: 10px;
            background-color: #f0f0f0;
            border-bottom: 1px solid #ccc;
        }}
        .calendar {{
            display: flex;
            flex: 1;
            overflow: hidden;
        }}
        .row-titles {{
            overflow-y: auto;
            background-color: #f9f9f9;
            border-right: 1px solid #ccc;
            white-space: nowrap;
        }}
        .calendar-view {{
            flex: 1;
            overflow: auto;
            position: relative;
        }}
        .calendar-view table {{
            width: 100%;
            border-collapse: collapse;
        }}
        .calendar-view th, .calendar-view td {{
            border: 1px solid #ccc;
            padding: 5px;
            text-align: center;
        }}
        .sticky {{
            position: sticky;
            background-color: #fff;
            z-index: 1;
        }}
        .sticky-top {{
            top: 0;
        }}
        .sticky-left {{
            left: 0;
        }}
        .sticky-both {{
            top: 0;
            left: 0;
            z-index: 2;
        }}
        thead>tr:nth-child(2) th {{
             top: 29px;
        }}
        .collapsible {{
            cursor: pointer;
            display: block;
            padding: 5px 15px 5px 10px;
        }}
        .hidden {{
            display: none;
        }}
        .non-working {{
            background-color: grey !important;
        }}
        .absence {{
            background-color: blue !important;
            color: white;
        }}
        .absence_planned {{
            background-color: #00ff9e !important;
            color: white;
        }}
        .absence_cancelled {{
            background-color: #fff2e0 !important;
            color: white;
        }}
        .month-alternate {{
            background-color: #f0f0f0;
        }}
        .birthday {{
            text-align: center;
        }}
        .even-month-header {{
            background-color: rgba(211, 211, 211, 1.0);
        }}
        .even-month {{
            background-color: rgba(211, 211, 211, 0.5);
        }}
        .current-date {{
            background-color: rgba(255, 191, 191, 1.0) !important;
        }}
    </style>
</head>
<body>
    <div class="calendar-container">
        <div class="header">
            <h1>{date_range_title}</h1>
        </div>
        <div class="calendar">
            <div class="row-titles">
                <input type="text" id="searchInput" onkeyup="searchNames()" placeholder="Search for names..">
                <label style="display: block; padding: 5px 15px;"><input type="checkbox" id="hidePastDates" checked onchange="togglePastDates()"> Hide past dates</label>
                <div class="collapsible" onclick="filterTeam('all')">All</div>
                <div class="collapsible" onclick="filterTeam('absences')">Absent today</div>
                <div class="collapsible" onclick="filterTeam('birthdays')">Birthdays</div>
                {generate_team_filters(teams)}
            </div>
            <div class="calendar-view">
                <table>
                    <thead>
                        <tr>
                            <th class="sticky sticky-both" rowspan="1">&nbsp;</th>
                            <!-- Generate month headers -->
                            {generate_month_headers(start_date, end_date)}
                        </tr>
                        <tr>
                            <!-- Generate date headers -->
                            <th class="sticky sticky-both" rowspan="1">&nbsp;</th>
                            {generate_date_headers(start_date, end_date)}
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Generate rows for each person -->
                        {generate_person_rows(teams, data, start_date, end_date)}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <script>
        const cakeEmojiBase64 = "{cake_emoji_base64}";

        function filterTeam(team) {{
            document.querySelectorAll('tbody tr').forEach(function(row) {{
                if (team === 'all') {{
                    row.classList.remove('hidden');
                }} else if (team === 'birthdays') {{
                    const currentMonth = new Date().getMonth() + 1;
                    const nextMonth = (currentMonth % 12) + 1;
                    const birthdayMonth = parseInt(row.getAttribute('data-birthday-month'));
                    if (birthdayMonth === currentMonth || birthdayMonth === nextMonth) {{
                        row.classList.remove('hidden');
                    }} else {{
                        row.classList.add('hidden');
                    }}
                }} else if (team === 'absences') {{
                    // Find the current date cell index
                    const currentDateCell = document.querySelector('thead tr:last-child th.current-date');
                    if (!currentDateCell) {{
                        row.classList.add('hidden');
                        return;
                    }}
                    const dateRow = document.querySelector('thead tr:last-child');
                    const allDateCells = Array.from(dateRow.children);
                    const currentIndex = allDateCells.indexOf(currentDateCell);
                    
                    // Check if the cell at today's date has absence or non-working class
                    const todayCell = row.children[currentIndex];
                    if (todayCell && (todayCell.classList.contains('absence') || todayCell.classList.contains('absence_planned') || todayCell.classList.contains('absence_cancelled') || todayCell.classList.contains('non-working'))) {{
                        row.classList.remove('hidden');
                    }} else {{
                        row.classList.add('hidden');
                    }}
                }} else {{
                    row.classList.add('hidden');
                }}
            }});
            if (team !== 'all' && team !== 'birthdays' && team !== 'absences') {{
                document.querySelectorAll('.' + team).forEach(function(row) {{
                    row.classList.remove('hidden');
                }});
            }}
        }}

        function searchNames() {{
            const input = document.getElementById('searchInput');
            const filter = input.value.toLowerCase();
            document.querySelectorAll('tbody tr').forEach(function(row) {{
                const name = row.querySelector('td').textContent.toLowerCase();
                if (name.includes(filter)) {{
                    row.classList.remove('hidden');
                }} else {{
                    row.classList.add('hidden');
                }}
            }});
        }}

        function highlightCurrentDate() {{
            const currentDate = new Date();
            const currentDay = currentDate.getDate();
            const currentMonth = currentDate.toLocaleString('en-GB', {{ month: 'long' }});
            let monthFound = false;
            let monthNum = 0;
            let dayNum = 1;
            let done = false;

            document.querySelectorAll('thead th').forEach(function(th) {{
                if (done) {{
                    return;
                }}
                if (th.textContent === currentMonth) {{
                    monthFound = true;
                }} else if (monthFound && th.textContent == currentDay) {{
                    if (dayNum != monthNum) {{
                        dayNum += 1;
                    }} else {{
                        th.classList.add('current-date');
                        done = true;
                    }}
                }} else if (!monthFound) {{
                    monthNum += 1;
                }}
            }});
        }}

        function getCurrentDayOfYear() {{
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 0);
            const diff = now - start;
            const oneDay = 1000 * 60 * 60 * 24;
            return Math.floor(diff / oneDay);
        }}

        function hidePastDates() {{
            // Find the current date cell
            const currentDateCell = document.querySelector('thead tr:last-child th.current-date');
            if (!currentDateCell) return;

            const dateRow = document.querySelector('thead tr:last-child');
            const allDateCells = Array.from(dateRow.children);
            const fullRowCurrentIndex = allDateCells.indexOf(currentDateCell);

            // Hide all date headers up to current date
            allDateCells.forEach((th, index) => {{
                if (index > 0 && index < fullRowCurrentIndex) {{
                    th.classList.add('hidden');
                }}
            }});

            // Hide corresponding data cells in tbody
            document.querySelectorAll('tbody tr').forEach(row => {{
                Array.from(row.children).forEach((cell, index) => {{
                    if (index > 0 && index < fullRowCurrentIndex) {{
                        cell.classList.add('hidden');
                    }}
                }});
            }});

            // Handle month headers visibility and adjust colspans
            const monthHeaders = document.querySelectorAll('thead tr:first-child th');
            let dateIndex = 1; // Skip the "Date" label column
            
            for (let i = 1; i < monthHeaders.length; i++) {{
                const monthHeader = monthHeaders[i];
                const originalColspan = parseInt(monthHeader.getAttribute('colspan') || 1);
                let visibleDays = 0;

                // Count visible days in this month
                for (let j = 0; j < originalColspan; j++) {{
                    const dayCell = allDateCells[dateIndex + j];
                    if (dayCell && !dayCell.classList.contains('hidden')) {{
                        visibleDays++;
                    }}
                }}

                if (visibleDays === 0) {{
                    monthHeader.classList.add('hidden');
                }} else {{
                    // Update colspan to match number of visible days
                    monthHeader.setAttribute('colspan', visibleDays);
                }}
                dateIndex += originalColspan;
            }}
        }}

        function showAllDates() {{
            // Show all cells except those hidden by other filters
            document.querySelectorAll('th.hidden, td.hidden').forEach(cell => {{
                if (cell.classList.contains('hidden') && 
                    !cell.parentElement.classList.contains('hidden')) {{
                    cell.classList.remove('hidden');
                }}
            }});

            // Restore original colspans for month headers
            const monthHeaders = document.querySelectorAll('thead tr:first-child th');
            monthHeaders.forEach(header => {{
                const originalColspan = header.getAttribute('data-original-colspan');
                if (originalColspan) {{
                    header.setAttribute('colspan', originalColspan);
                }}
            }});
        }}

        function togglePastDates() {{
            const hidePastDatesCheckbox = document.getElementById('hidePastDates');
            if (hidePastDatesCheckbox.checked) {{
                hidePastDates();
            }} else {{
                showAllDates();
            }}
        }}

        document.addEventListener('DOMContentLoaded', function() {{
            highlightCurrentDate();
            hidePastDates();
            renderBirthdayIcons();
        }});

        function renderBirthdayIcons() {{
            document.querySelectorAll('.birthday').forEach(function(cell) {{
                cell.innerHTML = `<img src="data:image/png;base64,${{cakeEmojiBase64}}" alt="Birthday" style="width:20px;height:20px;">`;
            }});
        }}

        document.addEventListener('DOMContentLoaded', renderBirthdayIcons);
    </script>
</body>
</html>
    """
    return html_content

def generate_team_filters(teams):
    filters = ""
    for team in teams:
        filters += f"<div class='collapsible' onclick=\"filterTeam('{team['name'].replace(' ', '_')}')\">{team['name']}</div>"
    return filters

def generate_month_headers(start_date, end_date):
    headers = ""
    current_date = start_date
    month = current_date.month
    colspan = 0
    while current_date <= end_date:
        if current_date.month != month:
            month_class = "even-month-header" if month % 2 == 0 else ""
            headers += f"<th class='sticky sticky-top {month_class}' colspan='{colspan}' data-original-colspan='{colspan}'>{datetime.date(1900, month, 1).strftime('%B')}</th>"
            month = current_date.month
            colspan = 0
        colspan += 1
        current_date += datetime.timedelta(days=1)
    month_class = "even-month-header" if month % 2 == 0 else ""
    headers += f"<th class='sticky sticky-top {month_class}' colspan='{colspan}' data-original-colspan='{colspan}'>{datetime.date(1900, month, 1).strftime('%B')}</th>"
    return headers

def generate_date_headers(start_date, end_date):
    headers = ""
    current_date = start_date
    while current_date <= end_date:
        month_class = "even-month-header" if current_date.month % 2 == 0 else ""
        day_of_year = current_date.timetuple().tm_yday
        headers += f"<th class='sticky sticky-top {month_class}' data-dayofyear='{day_of_year}'>{current_date.strftime('%d')}</th>"
        current_date += datetime.timedelta(days=1)
    return headers

def generate_person_rows(teams, data, start_date, end_date):
    rows = ""
    # Create a mapping of members to all teams they belong to
    member_to_teams = {}
    for team in teams:
        for member in team['members']:
            if 'name' in member:
                member_name = member['name']
                if member_name not in member_to_teams:
                    member_to_teams[member_name] = set()
                member_to_teams[member_name].add(team['name'].replace(' ', '_'))
            if 'also' in member:
                also_names = member['also'] if isinstance(member['also'], list) else [member['also']]
                for also_name in also_names:
                    if also_name not in member_to_teams:
                        member_to_teams[also_name] = set()
                    member_to_teams[also_name].add(team['name'].replace(' ', '_'))

    for team in teams:
        team_class = team['name'].replace(' ', '_')
        for member in team['members']:
            if 'name' not in member:
                continue
            user_data = next((item for item in data if item['username'] == member['name']), None)

            # Precompute absences and other date-specific data for the user
            non_working_dates = set()
            holidays = set()
            absences = set()
            pending_approval = set()
            pending_cancellation = set()

            if user_data:
                non_working_dates = {datetime.datetime.strptime(date['date'], '%Y-%m-%d').date() for date in json.loads(user_data['nonWorkingDates'])}
                holidays = {datetime.datetime.strptime(date['date'], '%Y-%m-%d').date() for date in json.loads(user_data['holidays'])}

                for absence in user_data['employeeTimeNav']['results']:
                    start_absence = parse_date(absence['startDate'])
                    end_absence = parse_date(absence['endDate'])
                    if start_absence and end_absence:
                        absence_range = {start_absence + datetime.timedelta(days=i) for i in range((end_absence - start_absence).days + 1)}
                        if absence['approvalStatus'] == 'APPROVED':
                            absences.update(absence_range)
                        elif absence['approvalStatus'] == 'PENDING':
                            pending_approval.update(absence_range)
                        elif absence['approvalStatus'] == 'PENDING_CANCELLATION':
                            pending_cancellation.update(absence_range)

            # Handle birthdays in the name column
            if member['birthday'] != "":
                birthday_month = datetime.datetime.strptime(member['birthday'], '%Y-%m-%d').month
                rows += f"<tr class='{' '.join(member_to_teams[member['name']])}' data-birthday-month='{birthday_month}'><td class='sticky sticky-left'>{member['name']}</td>"
            else:
                rows += f"<tr class='{' '.join(member_to_teams[member['name']])}'><td class='sticky sticky-left'>{member['name']}</td>"

            current_date = start_date
            while current_date <= end_date:
                cell_class = ""
                cell_content = ""

                if current_date in non_working_dates:
                    cell_class = "non-working"
                elif current_date in holidays or current_date in absences:
                    cell_class = "absence"
                elif current_date in pending_approval:
                    cell_class = "absence_planned"
                elif current_date in pending_cancellation:
                    cell_class = "absence_cancelled"

                if member['birthday'] != "" and current_date.strftime('%m-%d') == datetime.datetime.strptime(member['birthday'], '%Y-%m-%d').strftime('%m-%d'):
                    cell_class += " birthday"

                month_class = "even-month" if current_date.month % 2 == 0 else ""
                if cell_class == "" and month_class == "" and cell_content == "":
                    rows += f"<td></td>"
                else:
                    rows += f"<td class='{cell_class} {month_class}'>{cell_content}</td>"

                current_date += datetime.timedelta(days=1)
            rows += "</tr>"
    return rows

def generate_ics():
    teams = load_teams()
    calendar = Calendar()
    for team in teams:
        for member in team['members']:
            if 'birthday' in member:
                if member['birthday'] == "":
                    continue
                event = Event()
                event.name = f"{member['name']}'s Birthday"
                event.begin = datetime.datetime.strptime(member['birthday'], '%Y-%m-%d').replace(year=datetime.datetime.now().year)
                event.make_all_day()
                calendar.events.add(event)
    return calendar

def generate_compressed_html(content):
    """
    Function to compress the HTML content and encode it in base64.
    The compressed content is unpacked by the JavaScript code in the generated HTML file.
    This compresses the calendar file from ~860kB to ~40Kb.
        
    :param content: The HTML content to compress
    :return: The compressed and base64 encoded HTML content
    """
    # Compress the content
    compressed_content = gzip.compress(content.encode('utf-8'))

    # Base64 encode the compressed content
    base64_encoded_content = base64.b64encode(compressed_content).decode('utf-8')

    # Generate the HTML
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Holiday Calendar</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.0.3/pako.min.js"></script>
    </head>
    <body>
        <div id="content"></div>
        <script>
            function loadAndExecuteScripts(htmlString) {{
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlString;
                const scripts = tempDiv.querySelectorAll('script');
                scripts.forEach(script => {{
                    const newScript = document.createElement('script');
                    Array.from(script.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.appendChild(document.createTextNode(script.innerHTML));
                    document.body.appendChild(newScript);
                }});
                document.getElementById('content').innerHTML = tempDiv.innerHTML;
            }}

            const compressedData = '{base64_encoded_content}';
            const decodedData = atob(compressedData);
            const uint8Array = Uint8Array.from(decodedData, char => char.charCodeAt(0));
            const decompressedData = pako.inflate(uint8Array, {{ to: 'string' }});
            loadAndExecuteScripts(decompressedData);
        </script>
    </body>
    </html>
    """
    return html

if __name__ == "__main__":
    # Generate HTML calendar overview file
    html_content = generate_html()
    compressed_html_content = generate_compressed_html(html_content)
    with open("output/calendar.html", "w") as file:
        file.write(compressed_html_content)

    # Generate .ics file
    calendar = generate_ics()
    with open("output/birthdays.ics", "w") as file:
        file.writelines(calendar)
