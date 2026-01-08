# Installation Instructions for the SuccessFactors Holiday Calendar Chrome Extension

1. Copy the files to your local machine, fx. `C:\Users\<your user>\` or `/home/<user>/bin/`.

**Setup base config files:**

2. Create the `database.yaml` file in the `config` directory from the template.
3. Add images for people in the `config/img/` directory.  Name each image by the userid or name of the person as it appears in the data from SucessFactors.
    - **Tip:** There is a little script `pyton/fetch_images.py` which will get all images based on the data from SuccessFactors.
4. Update the `config.yaml` file using the template. 
    - If you need to update this list, reload the extension for this to take effect.
    - Userids can be found in the raw data.

**Install the extension in Chrome/Edge:**

5. Open Google Chrome or Microsoft Edge and navigate to `chrome://extensions` or `edge://extensions`.
6. Enable **Developer mode** by toggling the switch in the top-right corner (Edge button on the left side).
7. Click on the **Load unpacked** button.
8. Select the folder where you copied the files (`addon`).
9. The extension will now be installed and visible in your browser extensions list.

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
5. Use the "Full UI" to open a new page with calendar, organisation chart, people and team editor. From here it is possible to edit the content of the `database.yaml` file in the browser and export it to share it with others or put it back in the extension directory as a backup.

**Tip:**
- Once a snapshot of data is captured, the files can be generated and downloaded at any time, there is no need to capture data more often than it is wanted to get the latest status.
- If the popup does not open for some reason it may be due to new browser safety settings.  At times the browser may warn about having developer mode turned on (necessary for loading unpacked extensions), or simply turn off extensions.
