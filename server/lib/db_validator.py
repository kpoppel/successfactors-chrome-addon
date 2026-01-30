from __future__ import annotations
from typing import Any, Dict, List, Tuple


class ValidationError(Exception):
    def __init__(self, message: str, path: Tuple[str, ...] | None = None):
        super().__init__(message)
        self.path = path or ()


def _is_mapping(obj: Any) -> bool:
    return isinstance(obj, dict)


def validate_database(db: Any) -> None:
    """Strict schema validation for the YAML database.

    Expected layout:
    version: '<YYYYMMDD>'
    database:
      people: [ {name, birthday, title, external, team_name, virtual_team, legal_manager, functional_manager, carry_over_holidays, site}, ... ]
      teams: [ {name, product_owner, functional_manager}, ... ]
      projects: [ {name, project_lead}, ... ]

    Raises ValidationError on failure.
    """
    if not _is_mapping(db):
        raise ValidationError('Document must be a mapping/dictionary', path=())

    # Validate version at top-level
    version = db.get('version')
    if not isinstance(version, str) or not version.isdigit() or len(version) != 8:
        raise ValidationError("'version' must be a date string like '20260107'", path=('version',))

    if 'database' not in db or not _is_mapping(db['database']):
        raise ValidationError("'database' mapping is required", path=('database',))

    inner = db['database']

    # Required lists
    people = inner.get('people')
    teams = inner.get('teams')
    projects = inner.get('projects', [])

    if not isinstance(people, list):
        raise ValidationError("'people' must be a list", path=('database','people'))
    if not isinstance(teams, list):
        raise ValidationError("'teams' must be a list", path=('database','teams'))
    if not isinstance(projects, list):
        raise ValidationError("'projects' must be a list", path=('database','projects'))

    # Validation helpers
    from datetime import datetime
    def _check_str(val, path):
        if not isinstance(val, str):
            raise ValidationError('must be a string', path=path)

    def _check_bool(val, path):
        if not isinstance(val, bool):
            raise ValidationError('must be a boolean', path=path)

    def _check_int(val, path):
        if not isinstance(val, int):
            raise ValidationError('must be an integer', path=path)

    def _check_date_or_empty(val, path):
        if val == '' or val is None:
            return
        if not isinstance(val, str):
            raise ValidationError('birthday must be an ISO date string or empty', path=path)
        try:
            datetime.strptime(val, '%Y-%m-%d')
        except Exception:
            raise ValidationError('birthday must be ISO date yyyy-mm-dd or empty', path=path)

    def _check_list_of_str(val, path):
        if not isinstance(val, list):
            raise ValidationError('must be a list', path=path)
        for i, item in enumerate(val):
            if not isinstance(item, str):
                raise ValidationError('list items must be strings', path=path + (str(i),))

    # Validate people entries
    for idx, person in enumerate(people):
        ppath = ('database','people',str(idx))
        if not _is_mapping(person):
            raise ValidationError('person entry must be a mapping', path=ppath)
        # name
        if 'name' not in person:
            raise ValidationError('person.name is required', path=ppath+('name',))
        _check_str(person.get('name'), ppath+('name',))
        # birthday
        _check_date_or_empty(person.get('birthday',''), ppath+('birthday',))
        # title
        if 'title' in person:
            _check_str(person.get('title'), ppath+('title',))
        # external
        if 'external' in person:
            _check_bool(person.get('external'), ppath+('external',))
        # team_name
        if 'team_name' in person:
            _check_str(person.get('team_name'), ppath+('team_name',))
        # virtual_team
        if 'virtual_team' in person:
            _check_list_of_str(person.get('virtual_team'), ppath+('virtual_team',))
        # legal_manager
        if 'legal_manager' in person:
            _check_str(person.get('legal_manager'), ppath+('legal_manager',))
        # functional_manager
        if 'functional_manager' in person:
            _check_str(person.get('functional_manager'), ppath+('functional_manager',))
        # carry_over_holidays
        if 'carry_over_holidays' in person:
            _check_int(person.get('carry_over_holidays'), ppath+('carry_over_holidays',))
        # site
        if 'site' in person:
            _check_str(person.get('site'), ppath+('site',))

    # Validate teams
    for idx, team in enumerate(teams):
        tpath = ('database','teams',str(idx))
        if not _is_mapping(team):
            raise ValidationError('team entry must be a mapping', path=tpath)
        if 'name' not in team:
            raise ValidationError('team.name is required', path=tpath+('name',))
        _check_str(team.get('name'), tpath+('name',))
        if 'short_name' in team:
            _check_str(team.get('short_name'), tpath+('short_name',))
        if 'product_owner' in team:
            _check_str(team.get('product_owner'), tpath+('product_owner',))
        if 'functional_manager' in team:
            _check_str(team.get('functional_manager'), tpath+('functional_manager',))
        # Optional parent_team field for nested team relationships
        if 'parent_team' in team:
            _check_str(team.get('parent_team'), tpath+('parent_team',))

    # Validate projects
    for idx, proj in enumerate(projects):
        ppath = ('database','projects',str(idx))
        if not _is_mapping(proj):
            raise ValidationError('project entry must be a mapping', path=ppath)
        if 'name' not in proj:
            raise ValidationError('project.name is required', path=ppath+('name',))
        _check_str(proj.get('name'), ppath+('name',))
        if 'project_lead' in proj:
            _check_str(proj.get('project_lead'), ppath+('project_lead',))
