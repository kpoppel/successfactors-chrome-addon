import json
import yaml
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
import matplotlib.image as mpimg
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

# Load JSON data
with open('output/holiday_data.json') as f:
    data = json.load(f)

# Load teams data
with open('config/teams.yaml') as f:
    teams = yaml.safe_load(f)['teams']

# Extract usernames, non-working dates, and employee absences
user_data = []

for result in data['d']['results']:
    username = result['username']
    user_non_working_dates = json.loads(result['nonWorkingDates'])
    non_working_dates = [datetime.strptime(date['date'], '%Y-%m-%d') for date in user_non_working_dates]
    
    absences = []
    for absence in result['employeeTimeNav']['results']:
        start_date = datetime.fromtimestamp(int(absence['startDate'][6:-2]) / 1000)
        end_date = datetime.fromtimestamp(int(absence['endDate'][6:-2]) / 1000)
        # Extend end date by one day for single-day absences
        if start_date == end_date:
            end_date += timedelta(days=1)
        absences.append((start_date, end_date))
    
    user_data.append((username, non_working_dates, absences))

# Order user data by teams with headlines
ordered_user_data = []
for team in teams:
    ordered_user_data.append((team['name'], None, None, None, None))  # Add team headline
    for member in team['members']:
        for user in user_data:
            if user[0] == member['name']:
                ordered_user_data.append((team['name'], member['name'], user[1], user[2], member.get('birthday')))

# Reverse the ordered_user_data list to ensure the first element appears at the top of the plot
ordered_user_data.reverse()

# Create a calendar view
valid_dates = [dates for _, _, dates, _, _ in ordered_user_data if dates is not None]
start_date = min(min(dates) for dates in valid_dates)
end_date = max(max(dates) for dates in valid_dates)
delta = end_date - start_date
print(f"Plotting {delta.days} days")
fig, ax = plt.subplots(figsize=(0.3*delta.days, len(ordered_user_data) * 0.5))  # Increase the width of the figure
ax.xaxis.set_major_locator(mdates.DayLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter('%d'))
ax.xaxis.set_minor_locator(mdates.DayLocator())
ax.xaxis.set_minor_formatter(mdates.DateFormatter('%d'))

# Add alternating background colors for each month
current_month = start_date.month
month_start_date = start_date.replace(day=1)
while month_start_date < end_date:
    next_month_start_date = (month_start_date + timedelta(days=32)).replace(day=1)
    if month_start_date.month % 2 == 0:
        ax.axvspan(month_start_date, next_month_start_date, color='lightgrey', alpha=0.5)
    month_start_date = next_month_start_date

# Plot non-working dates and absences for each user
for i, (team_name, username, non_working_dates, absences, birthday) in enumerate(ordered_user_data):
    if username is None:  # Plot a line for team headlines
        ax.axhline(y=i + 0.5, color='black', linewidth=1)
        continue
    for date in non_working_dates:
        ax.axvspan(date, date + timedelta(days=1), color='grey', alpha=0.3, ymin=i/len(ordered_user_data), ymax=(i+1)/len(ordered_user_data))
    
    for absence_start_date, absence_end_date in absences:
        ax.axvspan(absence_start_date, absence_end_date, color='blue', alpha=0.3, ymin=i/len(ordered_user_data), ymax=(i+1)/len(ordered_user_data))
    
    # Plot cake emoji for birthdays
    if birthday:
        cake_date = datetime.strptime(birthday, '%Y-%m-%d').replace(year=start_date.year)
        cake_date_center = cake_date + timedelta(days=0.5)  # Center the image
        cake_img = mpimg.imread('cake_emoji.png')
        imagebox = OffsetImage(cake_img, zoom=0.05)
        ab = AnnotationBbox(imagebox, (cake_date_center, i + 0.5), frameon=False)
        ax.add_artist(ab)

# Set y-axis labels
ax.set_yticks([i + 0.5 for i in range(len(ordered_user_data))])
yticklabels = [team_name if username is None else f"  {username}" for team_name, username, _, _, _ in ordered_user_data]
ax.set_yticklabels(yticklabels)

# Apply font properties to team names
for label, (team_name, username, _, _, _) in zip(ax.get_yticklabels(), ordered_user_data):
    if username is None:
        label.set_fontsize(20)
        label.set_fontweight('bold')
        label.set_ha('right')

ax.set_xlim([start_date, end_date])
ax.set_ylim([0, len(ordered_user_data)])
ax.yaxis.set_visible(True)

plt.title(f'Holiday Calendar View ({start_date.strftime("%Y-%m-%d")} to {end_date.strftime("%Y-%m-%d")})')
plt.show()
