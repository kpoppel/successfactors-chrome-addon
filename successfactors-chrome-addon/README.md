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

# Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

# License

The browser extension is part of the SuccessFactors Chrome Addon project and are licensed under the MIT License.
