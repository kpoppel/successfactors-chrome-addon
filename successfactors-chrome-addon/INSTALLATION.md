# Installation Instructions for the SuccessFactors Holiday Calendar Chrome Extension

1. Copy the files to your local machine, fx. `C:\Users\<your user>\` or `/home/<user>/bin/`.
2. Open Google Chrome or Microsoft Edge and navigate to `chrome://extensions`.
3. Enable **Developer mode** by toggling the switch in the top-right corner (Edge button on the left side).
4. Click on the **Load unpacked** button.
5. Select the folder where you copied the files (`successfactors_holiday_calendar`).
6. The extension will now be installed and visible in your browser extensions list.
7. Update the `config.yaml`, `teams.yaml`, and `organisation.yaml` files in the `config` directory.
8. Add images for people in the `config/img/` directory.  Name each image by the userid of the person.

**Tip:**
- If you update the `config.yaml` file you need to reload the extension for this to take effect.
- If you update the `teams.yaml` or `organisation.yaml` files they are loaded every time the download files are generated.
- Userids can be found in the raw data.

# Usage

## First time setup
1. Click the extension button (little puzzle-piece) and pin the extension.
2. Click the extension icon and provide the date range to be fetched.
3. Click the checkbox to close the setup panel.

The extension will use the configuration data from the yaml files for all other static configuration.

## Daily use
1. Navigate to the SuccessFactors platform and view the team absences page.
2. The extension will automatically capture tokens and session data from the requests.
3. The browser action badge will display "Ok" when tokens are successfully captured.
4. Use the extension's popup to capture the data, or if the data was already captured download the files wanted.

**Tip:**
- Once a snapshot of data is captured, the files can be generated and downloaded at any time, there is no need to capture data more often than it is wanted to get the latest status.
- If the popup does not open for some reason it may be due to new browser safety settings.  At times the browser may warn about having developer mode turned on (necessary for loading unpacked extensions), or simply turn off extensions.
