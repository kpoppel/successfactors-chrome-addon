# SuccessFactors Holiday Calendar Chrome Extension

This Chrome extension is designed to interact with the SuccessFactors platform to extract and manage holiday and absence data for teams. It provides functionality to capture tokens and session information from web requests and cookies, enabling seamless integration with the SuccessFactors API.

# Features

- Utilises an active session to perform automated database queryies just as the active use would do by clicking buttons.
- Updates the browser action badge to indicate when tokens are successfully captured to indicate data processing is ready to commence.
- Provides an interface to load data into the browser's local storage and to subsequently download various visualisations of the data:
    - Holiday calendar
    - Absence data aggregation (detailed data only available to direct manager)
    - .ics file for loading birthday data into a calendar application
    - Organisation diagram
    - Download of the raw data for offline processing

# Installation

Refer to the INSTALLATION.md file.

# Permissions

This extension requires the following browser permissions:

- `webRequest` and `webRequestBlocking`: To listen to and modify web requests.
- `cookies`: To access cookies for extracting session information.
- `storage`: To store and retrieve tokens and session data.
- `webNavigation`: To detect navigation events and reset the badge.

# Flow in the program

`popup.html` is loaded first, setting up buttons and options for the extension. From there a few things can happen:
1. Load data in from the team calendar in SuccessFactors (functions in `src/api.js`)
2. Saving a team absence calendar (functions in `src/calendar.js`)
3. Saving a birthday list (functions in `src/ics.js`)
4. Saving an absence overview (early days on development) (functions in `src/absence.js`)
5. Saving an organisation chart (functions in `src/orgchart.js`)
6. Saving the raw data fetched from SuccessFactors (functions in `src/api.js`)
7. Setting options (functions in `options.js`)
8. Opening the full UI in a new browser tab.

## The database
In `src/databse.js` a representation of the data loaded from SuccessFactors and the file `config/databse.yaml` is gathered anf various functions to query, modify and export are implemented.  This is to have a single place to update the database while keeping the way to access it as stable as possible.
**note:** The popup buttons do not use the database but the raw data and other YAMl files directly. This must be updated.

Database documents use a top-level `schema_version` string in `major.minor` format, currently `"2.0"`. A new major version changes existing field semantics; a minor version only adds fields. Consumers should reject unsupported major versions and may ignore unknown fields from newer minor versions. The separate date-based `version` field is used for cache freshness, not schema compatibility.

People may set `manager: true` independently of `external: true`. Only people explicitly marked as managers appear in legal and functional manager selectors. When upgrading an older database, mark existing managers with `manager: true` and add `schema_version: "2.0"` before sending it to the server. Untagged existing assignments remain visible but cannot be selected as new assignments. Missing `manager` fields are treated as `false` when loading older files.

Every team has a unique, immutable `id` derived from its creation timestamp in
uppercase base 36 with a `T` prefix (for example `TMUNSQ491`). Multiple teams
created in the same millisecond receive successive logical timestamps. Use the
ID for external references: `name` and `short_name` can change. Existing teams
without an ID are assigned one when loaded in the full UI; save the database
to persist these IDs before using them externally. The single
`database.last_team_timestamp` value prevents reuse after deletion or clock
rollback; no list of old IDs is kept. People assignments continue to use team
names. The server rejects duplicate IDs and invalid timestamps.

## The full UI
This is a feature to allow viewing and editing data directly instad of having to download files. The purpose is to provide a nicer interface to build the database of team members, teams and projects worked on. It is more an experiment than something which is strictly necessary at the point. The full UI is loaded through the `ui.html` file which in turn makes use of `src/ui-main,js` which loads finctions from `src/people-ui.js`, `src/calendar-ui.js`, `src/absence-ui.js`, and `src/orgchart-ui.js`.

# Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

# License

The browser extension is part of the SuccessFactors Chrome Addon project and are licensed under the MIT License.
