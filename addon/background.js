// background.js
let tokenFound = false;

function handleTokenFound() {
  // Update the badge on the icon
  if (!tokenFound) {
    tokenFound = true;
    chrome.action.setBadgeText({ text: "Ok" });
    chrome.action.setBadgeBackgroundColor({ color: "#008000" });
  }
}

chrome.webNavigation.onCommitted.addListener(function (details) {
  // Clear the badge on navigation
  if (details.frameId === 0) {
    tokenFound = false;
    chrome.action.setBadgeText({ text: "" }); // Clear badge
  }
});

/* *************************** */
/* Listeners for headers sent from which to extract tokens */
/* *************************** */
chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    if (details.tabId === -1) {
      return; // Ignore requests not associated with a tab (e.g., background requests)
    }
    extractTokenFromHeaders(details.requestHeaders, details.url);
  },
  //{ urls: ["<all_urls>"] }, // Filter URLs if possible
  { urls: ["https://performancemanager5.successfactors.eu/odata/v2/restricted/TeamAbsences*"]},
  ["requestHeaders"]
);

async function extractTokenFromHeaders(headers, url) {
    let jsessionid = null;
    let xAjaxToken = null;

    for (const header of headers) {
        //console.log("Header:", header.name, "Value:", header.value, "URL:", url);
        // Check for X-Ajax-Token in the headers
        if (header.name.toLowerCase() === "x-ajax-token") {
            xAjaxToken = header.value;
            //console.log("Found X-Ajax-Token:", xAjaxToken, "URL:", url);
            chrome.storage.local.set(
                { x_ajax_token: xAjaxToken, url: url },
                function () {}
            );
            break;
        }
    }

    // Extract JSESSIONID from cookies using chrome.cookies API
    await chrome.cookies.getAll({ url: url }, function (cookies) {
        for (const cookie of cookies) {
            if (cookie.name === "JSESSIONID") {
                jsessionid = cookie.value;
                console.log("Found JSESSIONID from cookies:", jsessionid, "URL:", url);
                chrome.storage.local.set(
                    { jsessionid: jsessionid },
                    function () {}
                );
                break;
            }
        }
    });

    if (jsessionid || xAjaxToken) {
        chrome.storage.local.set(
            { url: url },
            function () {
                handleTokenFound();
            }
        );
    }
}

// Listener for the message sent from popup.js
// Then return the proper response to the sender.
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (request.message === "getToken") {
      // The response uses the data stored by then in onBeforeSendHeaders above.
      chrome.storage.local.get(
        ["jsessionid", "x_ajax_token","from_date", "to_date"],
        function (result) {
          sendResponse({
              "jsessionid": result.jsessionid,
              "token": result.x_ajax_token,
              "from_date": result.from_date,
              "to_date": result.to_date
          });
        });
      return true; // Important: Returning true indicates that the response will be sent asynchronously, allowing the sendResponse callback to be called after the listener function returns.
    }
    if (request.message === "getOptions") {
      chrome.storage.local.get(
        ["setup_toggle", "from_date", "to_date", "server_url", "teamdb_email", "teamdb_token"],
        function (result) {
          sendResponse({
            "setup_toggle": result.setup_toggle,
            "from_date": result.from_date,
            "to_date": result.to_date,
            "server_url": result.server_url,
            "teamdb_email": result.teamdb_email,
            "teamdb_token": result.teamdb_token
          });
        });
      return true; // Important: Keeps the message channel open for sendResponse to be called asynchronously. Without this, the sendResponse function would not work correctly.
    }
    if (request.message === "getAbsences") {
      chrome.storage.local.get(
        ["absence_data"],
        function (result) {
          sendResponse({
            "absence_data": result.absence_data
          });
        });
      return true; // Important: Keeps the message channel open for sendResponse to be called asynchronously. Without this, the sendResponse function would not work correctly.
    }
  }
);
