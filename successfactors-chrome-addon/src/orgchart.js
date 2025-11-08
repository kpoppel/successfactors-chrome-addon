import { imageToBase64, downloadFile, getDatabase } from './common.js';

export async function generateOrgChartAndDownload() {
    console.log('generateOrgChartAndDownload() called');
    // Get the database instance which already contains all the necessary data
    const database = await getDatabase();
    console.log('Generating organization chart with database - people count:', database.people.size);
    
    const chartHtml = await generateOrgChartHtml(database);
    downloadFile(chartHtml, 'org_chart.html', 'text/html');
}

export async function generateOrgChartHtml(database) {
    const silhouetteBase64 = await imageToBase64('images/silhouette.jpg');
    const userImages = new Map();
    userImages.set('fallback', silhouetteBase64);

    // Load images for all people in the database
    await Promise.all(
        Array.from(database.people.values()).map(async person => {
            if (person.userId) {
                let image_data = null;
                try {
                    if (!person.userId.startsWith('ext_')) {
                        image_data = await imageToBase64('config/img/' + person.userId + '.jpg');
                    } else {
                        throw new Error(`Trying via name: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    // Try lower_case_name if userId image not found
                    const lowerCaseName = person.name.toLowerCase().replace(/\s+/g, '_');
                    try {
                        image_data = await imageToBase64('config/img/' + lowerCaseName + '.jpg');
                    } catch (error2) {
                        console.log(`INFO: Failed to load image for user ${person.userId} and name ${lowerCaseName}, using fallback`);
                        image_data = silhouetteBase64;
                    }
                }
                userImages.set(person.userId, image_data);
            } else {
                console.log(`WARNING: Found a person with no userId: ${person.name}`);
            }
        })
    );

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Organization Chart</title>
    <style>
        body { font-family: Arial, sans-serif; }
        .team { border: 5px solid #272a91; padding: 10px; margin-bottom: 20px; border-radius: 10px; display: flex; flex-wrap: wrap; align-items: flex-start; position: relative; width: fit-content; }
        .team h2 { color: #4CAF50; margin: 0; padding: 0 10px; font-size: 18px; position: absolute; top: -15px; left: 20px; background: white; }
        .projects-container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: flex-start; }
        .project { border: 5px solid #ff6b35; padding: 10px; margin-bottom: 20px; border-radius: 10px; display: flex; flex-wrap: wrap; align-items: flex-start; position: relative; width: fit-content; min-width: 300px; flex: 0 1 auto; }
        .project h2 { color: #ff6b35; margin: 0; padding: 0 10px; font-size: 18px; position: absolute; top: -15px; left: 20px; background: white; white-space: nowrap; }
        .project h2::before { content: "🚀 PROJECT: "; font-size: 14px; }
        .details-container { display: flex; flex-direction: column; margin-right: 20px; }
        .details { display: flex; flex-direction: column; align-items: center; margin-bottom: 10px; }
        .details img { width: 50px; height: 50px; object-fit: cover; border-radius: 50%; margin-bottom: 5px; }
        .details div { text-align: center; font-size: 12px; }
        .member-container { display: flex; flex-wrap: wrap; justify-content: flex-start; flex-grow: 1; }
        .member { text-align: center; margin: 10px; }
        .member img { width: 100px; height: 100px; object-fit: cover; }
        .member .name { font-weight: bold; font-size: 12px; margin-top: 10px; text-align: center; width: 100px; word-wrap: break-word; }
        .member .title { font-size: 12px; margin-top: 5px; text-align: center; width: 100px; word-wrap: break-word; }
    </style>
</head>
<body>
    <h1>Organization Chart</h1>
    <h2>Teams</h2>
    ${generateTeamBlocks(database, userImages)}
    <h2>Projects</h2>
    <div class="projects-container">
        ${generateProjectBlocks(database, userImages)}
    </div>
</body>
</html>`;
}

function generateTeamBlocks(database, userImages) {
    return Array.from(database.teams.values())
        .filter(team => team.members.size > 0) // Only show teams with members
        .map(team => `
            <div class="team">
                <h2>${team.name}</h2>
                <div class="details-container">
                    ${generateTeamLeadership(team, database, userImages)}
                </div>
                <div class="member-container">
                    ${generateTeamMembers(team, database, userImages)}
                </div>
            </div>
        `).join('');
}

function generateTeamLeadership(team, database, userImages) {
    let leadership = '';
    
    console.log(`Generating leadership for team: ${team.name}`);
    
    // Check if team has functional_manager
    if (team.functional_manager) {
        const functionalManager = database.people.get(team.functional_manager);
        if (functionalManager) {
            leadership += generatePositionHtml(functionalManager.userId, team.functional_manager, 'Functional Manager', userImages);
            console.log(`Team ${team.name}: Added functional manager ${team.functional_manager} to leadership`);
        }
    }
    
    // Check if team has product_owner
    if (team.product_owner) {
        const productOwner = database.people.get(team.product_owner);
        if (productOwner) {
            leadership += generatePositionHtml(productOwner.userId, team.product_owner, 'Product Owner', userImages);
            console.log(`Team ${team.name}: Added product owner ${team.product_owner} to leadership`);
        }
    }
    
    return leadership;
}

function generatePositionHtml(userId, name, position, userImages) {
    const imgSrc = userId && userImages.get(userId) || userImages.get('fallback');
    return `
        <div class="details">
            <img src="${imgSrc}" alt="${name}">
            <div><strong>${position}</strong><br>${name}</div>
        </div>`;
}

function generateTeamMembers(team, database, userImages) {
    // Get leadership roles for this team to exclude them from regular members
    const teamLeadership = new Set();
    if (team.functional_manager) teamLeadership.add(team.functional_manager);
    if (team.product_owner) teamLeadership.add(team.product_owner);

    console.log(`Team ${team.name}: Excluding ${teamLeadership.size} people from regular members:`, Array.from(teamLeadership));
    console.log(`Team ${team.name}: Total team members:`, team.members.size);

    // Filter out leadership roles from regular members
    const regularMembers = Array.from(team.members)
        .filter(memberName => !teamLeadership.has(memberName))
        .map(memberName => database.people.get(memberName))
        .filter(person => person); // Remove any undefined entries

    console.log(`Team ${team.name}: Regular members to display:`, regularMembers.length, regularMembers.map(p => p.name));

    return regularMembers
        .map(person => {
            return `
                <div class="member">
                    <img src="${person.userId && userImages.get(person.userId) || userImages.get('fallback')}" alt="${person.name}">
                    <div class="name">${person.name}</div>
                    <div class="title">${person.title || ''}</div>
                </div>`;
        })
        .join('');
}

function generateProjectBlocks(database, userImages) {
    return database.projects
        .map(project => `
            <div class="project">
                <h2>${project.name}</h2>
                <div class="details-container">
                    ${generateProjectLeadership(project, database, userImages)}
                </div>
                <div class="member-container">
                    <!-- Projects have no regular members, only project leads -->
                </div>
            </div>
        `).join('');
}

function generateProjectLeadership(project, database, userImages) {
    console.log(`Generating leadership for project: ${project.name}`);
    
    // Projects only have project leads as defined in the database
    if (project.project_lead) {
        const projectLead = database.people.get(project.project_lead);
        if (projectLead) {
            console.log(`Project ${project.name}: Added project lead ${project.project_lead} to leadership`);
            return generatePositionHtml(projectLead.userId, project.project_lead, 'Project Lead', userImages);
        }
    }
    
    console.log(`Project ${project.name}: No project lead found`);
    return '';
}
