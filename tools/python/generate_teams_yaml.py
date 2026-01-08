import json
import yaml

def load_data():
    with open('output/holiday_data.json', 'r') as file:
        return json.load(file)['d']['results']

def generate_teams_yaml():
    data = load_data()
    teams = {}
    
    for item in data:
        username = item['username']
        team_name = "Default Team"  # Assign all users to a default team
        if team_name not in teams:
            teams[team_name] = []
        teams[team_name].append({
            'name': username,
            'birthday': '1900-01-01'  # Placeholder for birthday
        })
    
    teams_yaml = {'teams': [{'name': team, 'members': members} for team, members in teams.items()]}
    
    with open('config/teams_template.yaml', 'w') as file:
        yaml.dump(teams_yaml, file, default_flow_style=False)

if __name__ == "__main__":
    generate_teams_yaml()
