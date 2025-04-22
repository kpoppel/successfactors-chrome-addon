let config = null;

export async function loadConfig() {
    if (!config) {
        try {
            const response = await fetch(chrome.runtime.getURL('config/config.yaml'));
            config = jsyaml.load(await response.text());
            console.log("Configuration loaded:", config);
        } catch (error) {
            console.error("Failed to load configuration:", error);
            throw error;
        }
    }
    return config;
}

// Export the config variable for direct use after initialization
export function getConfig() {
    if (!config) {
        throw new Error("Configuration has not been loaded yet. Call loadConfig() first.");
    }
    return config;
}

export function toggleText(condition, elementId, text) {
    document.getElementById(elementId).innerText = condition ? text : "";
}

export function showNotification(success, message, timeout=3000) {
    const notificationContainer = document.getElementById("notification-container");
    notificationContainer.classList = success ? "uk-text-success" : "uk-text-warning";
    notificationContainer.innerHTML = message;
    setTimeout(() => {
        notificationContainer.innerHTML = "";
        notificationContainer.classList = "uk-text-success";
    }, timeout);
}

export async function imageToBase64(imagePath) {
    try {
        const imageUrl = chrome.runtime.getURL(imagePath);
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const reader = new FileReader();
        const base64Data = await new Promise(resolve => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        return base64Data;
    } catch (error) {
        console.error("Error converting image to Base64:", error);
        return null;
    }
}

export function parseDate(dateStr) {
    const match = /\/Date\((\d+)\)\//.exec(dateStr);
    return match ? new Date(parseInt(match[1])) : null;
}

export function getDateRange(data) {
    const dates = [];
    data.forEach(item => {
        const nonWorkingDates = JSON.parse(item.nonWorkingDates);
        dates.push(...nonWorkingDates.map(date => new Date(date.date)));
    });
    return {
        startDate: new Date(Math.min(...dates)),
        endDate: new Date(Math.max(...dates))
    };
}

export function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
