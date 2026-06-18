const TEAM_ABSENCE_URL_PREFIX = 'https://performancemanager5.successfactors.eu/odata/v2/restricted/TeamAbsences';
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
let tokenFound = false;

function handleTokenFound() {
  if (!tokenFound) {
    tokenFound = true;
    chrome.action.setBadgeText({ text: 'OK' });
    chrome.action.setBadgeBackgroundColor({ color: '#008000' });
  }
}

function encodeURIComponentExtended(str) {
  return encodeURIComponent(str).replace(/[']/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function parseUserIdFromUrl(url) {
  const match = /userId%20eq%20%27([^%]+)%27/i.exec(url);
  if (match && match[1]) return decodeURIComponent(match[1]);
  const alt = /userId eq '([^']+)'/i.exec(url);
  return alt ? alt[1] : null;
}

async function runQuery(userid, fromDate, toDate, includeSelf, token, jsessionid) {
  const baseUrl = `${TEAM_ABSENCE_URL_PREFIX},TeamAbsenceCalendar,TeamAbsenceCalendarUserConfig/TeamAbsenceCalendar`;
  const filterPart = includeSelf
    ? `userId eq '${userid}' and (userGroup eq 'SELECTED_USER' or userGroup eq 'DIRECT_REPORT') and skipJobInfoRead eq false and viewKey eq 'keyMonthView'`
    : `userId eq '${userid}' and userGroup eq 'DIRECT_REPORT' and skipJobInfoRead eq false and viewKey eq 'keyMonthView'`;
  const encodedFilter = encodeURIComponentExtended(filterPart);
  const select = 'nonWorkingDates,skipJobInfoRead,userGroup,username,userId,holidays,workSchedule,employeeTimeNav/externalCode,employeeTimeNav/startTime,employeeTimeNav/startDate,employeeTimeNav/endDate,employeeTimeNav/endTime,employeeTimeNav/undeterminedEndDate,employeeTimeNav/quantityInDays,employeeTimeNav/quantityInHours,employeeTimeNav/userId,employeeTimeNav/flexibleRequesting,employeeTimeNav/displayQuantity,employeeTimeNav/physicalStartDate,employeeTimeNav/physicalEndDate,employeeTimeNav/leaveOfAbsence,employeeTimeNav/timeTypeUnit,employeeTimeNav/timeTypeName,employeeTimeNav/approvalStatus';
  const url = `${baseUrl}?$skip=0&$top=5000&$filter=${encodedFilter}&$select=${select}&$expand=employeeTimeNav&fromDate=${fromDate}&toDate=${toDate}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'accept-language': 'en-US',
      'x-ajax-token': token,
      cookie: `JSESSIONID=${jsessionid}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SuccessFactors request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function uploadToServer(absencePayload, settings) {
  const serverUrl = (settings.server_url || '').trim();
  if (!serverUrl) throw new Error('Missing server_url');
  if (!settings.teamdb_email || !settings.teamdb_token) throw new Error('Missing TeamDB credentials');

  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/sf/absence-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TeamDB-Email': settings.teamdb_email,
      'X-TeamDB-Token': settings.teamdb_token,
    },
    body: JSON.stringify(absencePayload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Upload failed: ${message}`);
  }
}

async function transmitAbsences(userIdFromRequest = null) {
  const settings = await chrome.storage.local.get([
    'server_url',
    'teamdb_email',
    'teamdb_token',
    'from_date',
    'to_date',
    'default_userid',
    'jsessionid',
    'x_ajax_token',
  ]);

  const userId = userIdFromRequest || settings.default_userid;
  if (!userId) throw new Error('No userId available');
  if (!settings.from_date || !settings.to_date) throw new Error('Missing from_date/to_date');
  if (!settings.x_ajax_token || !settings.jsessionid) throw new Error('Missing captured SuccessFactors token/session');

  const initialData = await runQuery(
    userId,
    settings.from_date,
    settings.to_date,
    true,
    settings.x_ajax_token,
    settings.jsessionid
  );
  const payload = { d: { results: initialData?.d?.results || [] } };

  await uploadToServer(payload, settings);
  await chrome.storage.local.set({
    last_transmit_at: new Date().toISOString(),
    last_transmit_count: payload.d.results.length,
  });
  return payload.d.results.length;
}

async function maybeAutoTransmit(userIdFromRequest) {
  const storage = await chrome.storage.local.get(['auto_transmit', 'last_auto_transmit_at']);
  if (!storage.auto_transmit) return;
  const last = storage.last_auto_transmit_at ? Date.parse(storage.last_auto_transmit_at) : 0;
  if (Date.now() - last < AUTO_SYNC_COOLDOWN_MS) return;

  try {
    const count = await transmitAbsences(userIdFromRequest);
    await chrome.storage.local.set({
      last_auto_transmit_at: new Date().toISOString(),
      last_transmit_status: `Auto transmit OK (${count} records)`,
    });
  } catch (error) {
    await chrome.storage.local.set({
      last_transmit_status: `Auto transmit failed: ${error.message}`,
    });
  }
}

chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId === 0) {
    tokenFound = false;
    chrome.action.setBadgeText({ text: '' });
  }
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  async details => {
    if (details.tabId === -1) return;
    const headers = details.requestHeaders || [];
    let xAjaxToken = null;

    for (const header of headers) {
      if (header.name.toLowerCase() === 'x-ajax-token') {
        xAjaxToken = header.value;
        break;
      }
    }

    if (xAjaxToken) {
      await chrome.storage.local.set({ x_ajax_token: xAjaxToken, sf_last_request_url: details.url });
    }

    chrome.cookies.getAll({ url: details.url }, async cookies => {
      const jsession = cookies.find(cookie => cookie.name === 'JSESSIONID');
      if (jsession) {
        await chrome.storage.local.set({ jsessionid: jsession.value });
      }
      if (jsession || xAjaxToken) {
        handleTokenFound();
        const userId = parseUserIdFromUrl(details.url);
        await maybeAutoTransmit(userId);
      }
    });
  },
  { urls: [`${TEAM_ABSENCE_URL_PREFIX}*`] },
  ['requestHeaders']
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'triggerTransmitNow') {
    transmitAbsences()
      .then(count => sendResponse({ ok: true, resultsCount: count }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
