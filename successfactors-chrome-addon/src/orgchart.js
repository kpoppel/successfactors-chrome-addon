import { imageToBase64, downloadFile } from './common.js';

export async function generateOrgChartAndDownload(absenceData) {
    const teamsResponse = await fetch(chrome.runtime.getURL('config/teams.yaml'));
    const orgResponse = await fetch(chrome.runtime.getURL('config/organisation.yaml'));
    const teams = jsyaml.load(await teamsResponse.text());
    const organisation = jsyaml.load(await orgResponse.text());

    const chartHtml = await generateOrgChartHtml(absenceData, teams.teams, organisation.organisation);
    downloadFile(chartHtml, 'org_chart.html', 'text/html');
}

async function generateOrgChartHtml(absenceData, teams, organisation) {
    const silhouetteBase64 = await imageToBase64('images/silhouette.jpg');
    const userImages = new Map();
    userImages.set('fallback', silhouetteBase64);

    await Promise.all(
        absenceData.d.results.map(async result => {
            if (result.userId) {
                try {
                    const image_data = await imageToBase64('config/img/' + result.userId + '.jpg');
                    userImages.set(result.userId, image_data);
                } catch (error) {
                    console.log(`Failed to load image for user ${result.userId}, using fallback`);
                    userImages.set(result.userId, silhouetteBase64);
                }
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
    ${generateTeamBlocks(organisation, teams, absenceData, userImages)}
</body>
</html>`;
}

function generateTeamBlocks(organisation, teams, absenceData, userImages) {
    const teamMap = new Map();
    
    // Process each team's members
    teams.forEach(team => {
        // Find the corresponding org entry for this team
        const orgTeam = organisation.find(org => org.team === team.name);
        
        // Get leadership roles for THIS team only
        const teamLeadership = new Set([
            orgTeam?.product_owner,
            orgTeam?.line_manager,
            orgTeam?.project_lead
        ].filter(Boolean)); // Remove undefined values

        const resolvedMembers = team.members
            .map(member => {
                if (member.also) {
                    const resolvedMember = teams.flatMap(t => t.members).find(m => m.name === member.also);
                    if (resolvedMember) return resolvedMember;
                }
                return member;
            })
            .filter(member => member.name && !teamLeadership.has(member.name));

        teamMap.set(team.name, resolvedMembers);
    });

    return organisation.map(team => `
        <div class="team">
            <h2>${team.team}</h2>
            <div class="details-container">
                ${generateTeamLeadership(team, absenceData, userImages)}
            </div>
            <div class="member-container">
                ${generateTeamMembers(team, teamMap, absenceData, userImages)}
            </div>
        </div>
    `).join('');
}

function generateTeamLeadership(team, absenceData, userImages) {
    let leadership = '';
    
    if (team.product_owner) {
        const poUserId = absenceData.d.results.find(r => r.username === team.product_owner)?.userId;
        leadership += generatePositionHtml(poUserId, team.product_owner, 'Product Owner', userImages);
    }
    
    if (team.line_manager) {
        const lmUserId = absenceData.d.results.find(r => r.username === team.line_manager)?.userId;
        leadership += generatePositionHtml(lmUserId, team.line_manager, 'Line Manager', userImages);
    }
    
    if (team.project_lead) {
        const plUserId = absenceData.d.results.find(r => r.username === team.project_lead)?.userId;
        leadership += generatePositionHtml(plUserId, team.project_lead, 'Project Lead', userImages);
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

function generateTeamMembers(team, teamMap, absenceData, userImages) {
    const members = teamMap.get(team.team);
    if (!members) return '';

    return members
        .filter(member => member.name)
        .map(member => {
            const userId = absenceData.d.results.find(r => r.username === member.name)?.userId;
            return `
                <div class="member">
                    <img src="${userId && userImages.get(userId) || userImages.get('fallback')}" alt="${member.name}">
                    <div class="name">${member.name}</div>
                    <div class="title">${member.title || ''}</div>
                </div>`;
        })
        .join('');
}
