import yaml
import json
import base64
from jinja2 import Template

# Load organisation data from YAML
with open('config/organisation.yaml', 'r') as file:
    organisation_data = yaml.safe_load(file)

# Load team data from YAML
with open('config/teams.yaml', 'r') as file:
    team_data = yaml.safe_load(file)

# Load holiday data from JSON
with open('output/holiday_data.json', 'r') as file:
    holiday_data = json.load(file)

# Map user IDs to base64-encoded image data
user_images = {}
with open("silhouette.jpg", "rb") as img_file:
    user_images['fallback'] = f"data:image/jpeg;base64,{base64.b64encode(img_file.read()).decode('utf-8')}"
for result in holiday_data['d']['results']:
    user_id = result.get('userId')
    if user_id:
        image_path = f"output/img/{user_id}.jpg"
        try:
            with open(image_path, "rb") as img_file:
                user_images[user_id] = f"data:image/jpeg;base64,{base64.b64encode(img_file.read()).decode('utf-8')}"
        except FileNotFoundError:
            # Use silhouette.jpg as fallback
            with open("silhouette.jpg", "rb") as img_file:
                user_images[user_id] = f"data:image/jpeg;base64,{base64.b64encode(img_file.read()).decode('utf-8')}"

# HTML template for the organization chart
html_template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Organization Chart</title>
    <style>
        body { font-family: Arial, sans-serif; }
        .team { border: 5px solid #272a91; padding: 10px; margin-bottom: 20px; border-radius: 10px; display: flex; flex-wrap: wrap; align-items: flex-start; position: relative; width: fit-content; }
        .team h2 { color: #4CAF50; margin: 0; padding: 0 10px; font-size: 18px; position: absolute; top: -15px; left: 20px; background: white; }
        .details-container { display: flex; flex-direction: column; margin-right: 20px; }
        .details { display: flex; flex-direction: column; align-items: center; margin-bottom: 10px; }
        .details img { width: 50px; height: 50px; object-fit: cover; border-radius: 50%; margin-bottom: 5px; }
        .details div { text-align: center; font-size: 12px; }
        .member-container { display: flex; flex-wrap: wrap; justify-content: flex-start; flex-grow: 1; }
        .member { text-align: center; margin: 10px; }
        .member img { width: 100px; height: 100px; object-fit: cover; }
        .member .name { font-weight: bold; font-size: 12px; margin-top: 10px; text-align: center; width: 100px; word-wrap: break-word; }
        .member .title { font-size: 12px; margin-top: 5px; text-align: center; width: 100px; word-wrap: break-word; }
    </style>
</head>
<body>
    <h1>Organization Chart</h1>
    {% for team in organisation %}
    <div class="team">
        <h2>{{ team.team }}</h2>
        <div class="details-container">
            {% if team.product_owner %}
            <div class="details">
                {% set po_user_id = holiday_data['d']['results'] | selectattr('username', 'equalto', team.product_owner) | map(attribute='userId') | first %}
                {% if po_user_id and po_user_id in user_images %}
                <img src="{{ user_images[po_user_id] }}" alt="{{ team.product_owner }}">
                {% else %}
                <img src="{{ user_images['fallback'] }}" alt="No Image Available">
                {% endif %}
                <div><strong>Product Owner</strong><br>{{ team.product_owner }}</div>
            </div>
            {% endif %}
            {% if team.line_manager %}
            <div class="details">
                {% set lm_user_id = holiday_data['d']['results'] | selectattr('username', 'equalto', team.line_manager) | map(attribute='userId') | first %}
                {% if lm_user_id and lm_user_id in user_images %}
                <img src="{{ user_images[lm_user_id] }}" alt="{{ team.line_manager }}">
                {% else %}
                <img src="{{ user_images['fallback'] }}" alt="No Image Available">
                {% endif %}
                <div><strong>Line Manager</strong><br>{{ team.line_manager }}</div>
            </div>
            {% endif %}
            {% if team.project_lead %}
            <div class="details">
                {% set pl_user_id = holiday_data['d']['results'] | selectattr('username', 'equalto', team.project_lead) | map(attribute='userId') | first %}
                {% if pl_user_id and pl_user_id in user_images %}
                <img src="{{ user_images[pl_user_id] }}" alt="{{ team.project_lead }}">
                {% else %}
                <img src="{{ user_images['fallback'] }}" alt="No Image Available">
                {% endif %}
                <div><strong>Project Lead</strong><br>{{ team.project_lead }}</div>
            </div>
            {% endif %}
        </div>
        <div class="member-container">
            {% if team.team in team_map %}
            {% for member in team_map[team.team] %}
            <div class="member">
                {% set user_id = holiday_data['d']['results'] | selectattr('username', 'equalto', member.name) | map(attribute='userId') | first %}
                {% if user_id and user_id in user_images %}
                <img src="{{ user_images[user_id] }}" alt="{{ member_name }}">
                {% else %}
                <img src="{{ user_images['fallback'] }}" alt="No Image Available">
                {% endif %}
                <div class="name">{{ member.name }}</div>
                <div class="title">{{ member.title }}</div>
            </div>
            {% endfor %}
            {% endif %}
        </div>
    </div>
    {% endfor %}
</body>
</html>
"""

# Map teams from organisation.yaml to members in teams.yaml
team_map = {}
for team in team_data['teams']:
    resolved_members = []
    for member in team['members']:
        if 'also' in member:
            # Find the person with the same name as the 'also' key
            resolved_member = next(
                (m for t in team_data['teams'] for m in t['members'] if 'name' in m and m['name'] == member['also']),
                None
            )
            if resolved_member:
                resolved_members.append(resolved_member)
            else:
                resolved_members.append(member)  # Fallback to the original member if no match is found
        else:
            resolved_members.append(member)
    team_map[team['name']] = resolved_members

# Render the HTML
template = Template(html_template)
html_content = template.render(organisation=organisation_data['organisation'], team_map=team_map, holiday_data=holiday_data, user_images=user_images)

# Save the HTML to a file
with open('output/org_chart.html', 'w') as file:
    file.write(html_content)

print("Organization chart generated: output/org_chart.html")
