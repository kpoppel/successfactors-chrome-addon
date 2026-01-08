# Python Utilities for SuccessFactors Chrome Addon

This directory contains Python scripts designed to process and visualize data extracted from the SuccessFactors platform. These utilities generate various outputs such as YAML configurations, HTML visualizations, and calendar files.

## Scripts Overview

### 1. `generate_teams_yaml.py`
- **Purpose**: Generates a `teams_template.yaml` file based on holiday data.
- **Input**: `output/holiday_data.json`
- **Output**: `config/teams_template.yaml`
- **Key Features**:
  - Assigns users to a default team.
  - Includes placeholders for user birthdays.

### 2. `generate_org_chart.py`
- **Purpose**: Creates an HTML organization chart based on team and holiday data.
- **Input**:
  - `config/organisation.yaml`
  - `config/teams.yaml`
  - `output/holiday_data.json`
  - Images from `output/img/`
- **Output**: `output/org_chart.html`
- **Key Features**:
  - Displays team structure with roles such as Product Owner, Line Manager, and Project Lead.
  - Includes user images (fallback to a silhouette if unavailable).

### 3. `generate_calendar.py`
- **Purpose**: Generates a calendar view and `.ics` file for team holidays and absences.
- **Input**:
  - `config/teams.yaml`
  - `output/holiday_data.json`
  - `cake_emoji.png` (for birthday icons)
- **Output**:
  - `output/calendar.html`
  - `output/birthdays.ics`
- **Key Features**:
  - Interactive HTML calendar with filters for teams, absences, and birthdays.
  - `.ics` file for importing birthdays into calendar applications.

### 4. `generate_absence_stats.py`
- **Purpose**: Generates an HTML report of absence statistics for team members.
- **Input**:
  - `config/teams.yaml`
  - `output/holiday_data.json`
- **Output**: `output/absence_stats.html`
- **Key Features**:
  - Displays absence types and remaining holiday days.
  - Highlights critical thresholds with color-coded cells.

### 5. `fetch_data.py`
- **Purpose**: Fetches holiday and absence data from the SuccessFactors platform.
- **Input**:
  - Requires `X-Ajax-Token` and `JSESSIONID` for authentication.
  - User IDs to fetch data for.
- **Output**: `output/holiday_data.json`
- **Key Features**:
  - Interacts with the SuccessFactors API to retrieve data.
  - Saves raw data in JSON format for further processing by other scripts.

### 6. `fetch_images.py`
- **Purpose**: Downloads user profile images from the SuccessFactors platform.
- **Input**:
  - Requires `X-Ajax-Token` and `JSESSIONID` for authentication.
  - User IDs to fetch images for.
- **Output**: Images saved in `output/img/` directory.
- **Key Features**:
  - Fetches profile images for team members.
  - Saves images using user IDs as filenames for easy integration with other scripts.

### 7. `matplot_calendar.py`
- **Purpose**: Generates a visual calendar using Matplotlib to display team holidays and absences.
- **Input**:
  - `config/teams.yaml`
  - `output/holiday_data.json`
- **Output**: `output/calendar_plot.png`
- **Key Features**:
  - Creates a graphical calendar visualization.
  - Highlights holidays, absences, and non-working days with distinct colors.
  - Saves the calendar as a PNG image for easy sharing and integration.

## Usage Instructions

1. **Prepare Input Files**:
   - Ensure `holiday_data.json` is available in the `output/` directory.
   - Update `teams.yaml` and `organisation.yaml` in the `config/` directory.
   - Add user images to `output/img/` (named by user ID).

2. **Run Scripts**:
   - Execute each script as needed:
     ```bash
     python fetch_data.py
     python fetch_images.py
     python generate_teams_yaml.py
     python generate_org_chart.py
     python generate_calendar.py
     python generate_absence_stats.py
     python matplot_calendar.py
     ```

3. **View Outputs**:
   - Generated files will be saved in the `output/` directory.
   - Open `.html` files in a browser for visualization.
   - Import `.ics` files into calendar applications.
   - View the calendar plot image (`calendar_plot.png`) using any image viewer.

## Dependencies

- Python 3.x
- Required libraries:
  - `PyYAML`
  - `Jinja2`
  - `ics`
  - `requests`
  - `matplotlib`
- Install dependencies using:
  ```bash
  pip install pyyaml jinja2 ics requests matplotlib
  ```

## Notes

- Ensure the directory structure matches the expected paths for input and output files.
- Customize YAML files and images to reflect your organization's data.

## License

These scripts are part of the SuccessFactors Chrome Addon project and are licensed under the MIT License.
