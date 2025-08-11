### Run as:
#  python3 python/convert_to_new_format.py config/teams.yaml config/organisation.yaml config/people-teams-organisation.generated.yaml

#!/usr/bin/env python3
import yaml
import sys
from collections import defaultdict

# Usage: python3 convert_to_new_format.py teams.yaml organisation.yaml output.yaml

def main():
    if len(sys.argv) != 4:
        print("Usage: python3 convert_to_new_format.py teams.yaml organisation.yaml output.yaml")
        sys.exit(1)
    teams_path, org_path, out_path = sys.argv[1:4]

    with open(teams_path) as f:
        teams_data = yaml.safe_load(f)
    with open(org_path) as f:
        org_data = yaml.safe_load(f)

    # Build people dict (name -> {birthday, title})
    people_dict = {}
    for team in teams_data['teams']:
        for member in team['members']:
            if 'name' in member:
                people_dict[member['name']] = {
                    'name': member['name'],
                    'birthday': member.get('birthday', ''),
                    'title': member.get('title', '')
                }
    # Add also members to people_dict if not already present
    for team in teams_data['teams']:
        for member in team['members']:
            if 'also' in member:
                n = member['also']
                if n not in people_dict:
                    people_dict[n] = {'name': n, 'birthday': '', 'title': ''}

    # Build team manager info from org_data
    org_map = {entry['team']: entry for entry in org_data.get('organisation', [])}

    # Build team memberships
    team_members = defaultdict(list)
    team_extended = defaultdict(list)
    for team in teams_data['teams']:
        tname = team['name']
        for member in team['members']:
            if 'name' in member:
                team_members[tname].append(member['name'])
            elif 'also' in member:
                team_extended[tname].append(member['also'])

    # Build teams section
    teams_out = []
    for team in teams_data['teams']:
        tname = team['name']
        org = org_map.get(tname, {})
        t = {
            'name': tname,
            'members': team_members[tname],
            'extended_members': team_extended[tname]
        }
        if 'product_owner' in org:
            t['product_owner'] = org['product_owner']
        if 'functional_manager' in org:
            t['functional_manager'] = org['functional_manager']
        if 'line_manager' in org:
            t['functional_manager'] = org['line_manager']
        if 'project_lead' in org:
            t['project_leader'] = org['project_lead']
        teams_out.append(t)

    # Build people section
    people_out = list(people_dict.values())
    people_out.sort(key=lambda p: p['name'])

    # Build a map of person name to set of teams
    person_teams = defaultdict(set)
    for team in teams_data['teams']:
        tname = team['name']
        for member in team['members']:
            if 'name' in member:
                person_teams[member['name']].add(tname)
            elif 'also' in member:
                person_teams[member['also']].add(tname)

    # Assign line_manager for each person: use the line_manager from the first team they are in (from organisation.yaml)
    for person in people_dict.values():
        teams = sorted(person_teams[person['name']])
        line_manager = ''
        for t in teams:
            org = org_map.get(t, {})
            if 'line_manager' in org:
                line_manager = org['line_manager']
                break
        person['line_manager'] = line_manager

    out = {'people': people_out, 'teams': teams_out}
    with open(out_path, 'w') as f:
        yaml.dump(out, f, sort_keys=False, allow_unicode=True)

if __name__ == '__main__':
    main()
