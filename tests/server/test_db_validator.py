import unittest

from server.lib.db_validator import ValidationError, validate_database


class DatabaseSchemaTests(unittest.TestCase):
    def setUp(self):
        self.document = {
            'version': '20260929',
            'schema_version': '2.0',
            'database': {
                'last_team_timestamp': 1790754202865,
                'people': [{'name': 'Manager', 'manager': True, 'external': True}],
                'teams': [],
            },
        }

    def test_current_and_newer_minor_versions(self):
        validate_database(self.document)
        self.document['schema_version'] = '2.5'
        validate_database(self.document)

    def test_unsupported_major_or_missing_version(self):
        for version in ('3.0', '1.9', '2', None):
            with self.subTest(version=version), self.assertRaises(ValidationError):
                self.document['schema_version'] = version
                validate_database(self.document)

    def test_manager_must_be_boolean(self):
        self.document['database']['people'][0]['manager'] = 'true'
        with self.assertRaises(ValidationError):
            validate_database(self.document)

    def test_manager_can_be_omitted_in_legacy_person(self):
        del self.document['database']['people'][0]['manager']
        validate_database(self.document)

    def test_team_ids_are_required_and_unique(self):
        teams = self.document['database']['teams']
        teams.extend([{'id': 'T00000001', 'name': 'Alpha', 'short_name': 'OLD'},
                      {'id': 'T00000002', 'name': 'Beta', 'short_name': 'NEW'}])
        validate_database(self.document)
        teams[0]['short_name'] = 'CHANGED'
        validate_database(self.document)

        for invalid in ('T00000001', 'ABCD', 'T123', 'T00000000000', '', None):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                teams[1]['id'] = invalid
                validate_database(self.document)
        del teams[1]['id']
        with self.assertRaises(ValidationError):
            validate_database(self.document)

    def test_team_ids_must_not_exceed_high_water_mark(self):
        inner = self.document['database']
        inner['teams'].append({'id': 'T00000002', 'name': 'Current'})
        validate_database(self.document)

        inner['last_team_timestamp'] = 1
        with self.assertRaises(ValidationError):
            validate_database(self.document)

    def test_high_water_mark_must_be_a_safe_non_negative_integer(self):
        inner = self.document['database']
        for timestamp in (None, -1, True, 1.5, '1790754202865', 9007199254740992):
            with self.subTest(timestamp=timestamp), self.assertRaises(ValidationError):
                inner['last_team_timestamp'] = timestamp
                validate_database(self.document)


if __name__ == '__main__':
    unittest.main()