import { downloadFile } from './common.js';
import { storageManager } from './storage-manager.js';

// Debug flag - set to true to use local test data instead of API calls
const DEBUG_MODE = false;

/**
 * Fetches raw data from SuccessFactors API for multiple users
 */
export async function fetchRawData(initial_userid, more_userids, from_date, to_date, token, jsessionid) {
    let finalData;
    
    if (DEBUG_MODE) {
        finalData = await loadDebugData();
    } else {
        // Run the initial query
        const initialData = await runQuery(initial_userid, from_date, to_date, true, token, jsessionid);
        let concatenatedResults = initialData.d.results;

        // Query additional user IDs
        if (Array.isArray(more_userids)) {
            for (const userid of more_userids) {
                const userData = await runQuery(userid, from_date, to_date, false, token, jsessionid);
                concatenatedResults = concatenatedResults.concat(userData.d.results);
            }
        }
        finalData = { d: { results: concatenatedResults } };
    }

    // Store the data in local storage
    await storageManager.set('absence_data', finalData);
}

async function loadDebugData() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) {
                reject(new Error('No file selected'));
                return;
            }

            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        };

        input.click();
    });
}

function encodeURIComponentExtended(str) {
    return encodeURIComponent(str).replace(/[']/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

/**
 * Fetches team absence data from the SuccessFactors API based on the provided parameters.
 */
async function runQuery(userid, fromDate, toDate, includeSelf, token, jsessionid) {
    const baseUrl = 'https://performancemanager5.successfactors.eu/odata/v2/restricted/TeamAbsences,TeamAbsenceCalendar,TeamAbsenceCalendarUserConfig/TeamAbsenceCalendar';
    const filterPart = includeSelf
      ? `userId eq '${userid}' and (userGroup eq 'SELECTED_USER' or userGroup eq 'DIRECT_REPORT') and skipJobInfoRead eq false and viewKey eq 'keyMonthView'`
      : `userId eq '${userid}' and userGroup eq 'DIRECT_REPORT' and skipJobInfoRead eq false and viewKey eq 'keyMonthView'`;
    const encodedFilter = encodeURIComponentExtended(filterPart);
    const select = "nonWorkingDates,skipJobInfoRead,userGroup,username,userId,holidays,workSchedule,employeeTimeNav/externalCode,employeeTimeNav/startTime,employeeTimeNav/startDate,employeeTimeNav/endDate,employeeTimeNav/endTime,employeeTimeNav/undeterminedEndDate,employeeTimeNav/quantityInDays,employeeTimeNav/quantityInHours,employeeTimeNav/userId,employeeTimeNav/flexibleRequesting,employeeTimeNav/displayQuantity,employeeTimeNav/physicalStartDate,employeeTimeNav/physicalEndDate,employeeTimeNav/leaveOfAbsence,employeeTimeNav/timeTypeUnit,employeeTimeNav/timeTypeName,employeeTimeNav/approvalStatus";
    const skip = 0;
    const top = 5000;
    const url = `${baseUrl}?$skip=${skip}&$top=${top}&$filter=${encodedFilter}&$select=${select}&$expand=employeeTimeNav&fromDate=${fromDate}&toDate=${toDate}`;
  
    const headers = {
      'accept': 'application/json',
      'accept-language': 'en-US',
      'x-ajax-token': token,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
    };
  
    const cookies = `JSESSIONID=${jsessionid}`;

    console.log("Encoded filter: ", encodedFilter);
    console.log("cookies: ", cookies);
    console.log("url: ", url);
    console.log("headers: ", headers);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        'cookie': cookies
      }
    });
  
    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }
    return await response.json();
}

export function saveRawData(absenceData) {
    const content = JSON.stringify(absenceData, null, 2);
    downloadFile(content, 'holiday_data.json', 'application/json');
}
