// orgchart-ui.js
import { generateOrgChartHtml } from './orgchart.js';
import { getDatabase } from './common.js';

export async function showOrgChartTab() {
    const tab = document.getElementById('orgchart-tab');
    tab.innerHTML = '<div>Loading organizational chart...</div>';
    
    try {
        // Get the database and generate the org chart HTML
        const database = await getDatabase();
        const orgChartHtml = await generateOrgChartHtml(database);
        
        // Extract just the body content from the full HTML document
        const parser = new DOMParser();
        const doc = parser.parseFromString(orgChartHtml, 'text/html');
        const bodyContent = doc.body.innerHTML;
        const styles = doc.head.querySelector('style').innerHTML;
        
        // Create a container with the styles and content
        tab.innerHTML = `
            <style>${styles}</style>
            ${bodyContent}
        `;
    } catch (error) {
        console.error('Error loading organizational chart:', error);
        tab.innerHTML = '<div>Error loading organizational chart. Please try again.</div>';
    }
}
