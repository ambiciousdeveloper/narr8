// Native fetch is available in Node.js 18+

async function verifyFixes() {
    const projectId = 'test_1';
    const baseUrl = 'http://localhost:3000';

    console.log(`\n>>> [Verification] Testing Location Extraction API...`);
    try {
        const locRes = await fetch(`${baseUrl}/api/extract-locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, existingLocations: [] })
        });
        const locData = await locRes.json();
        console.log(`Status: ${locRes.status}`);
        if (locRes.ok) {
            console.log(`Success! Found ${locData.locations?.length || 0} locations.`);
        } else {
            console.error(`Failed: ${locData.error}`);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }

    console.log(`\n>>> [Verification] Testing Prop Extraction API...`);
    try {
        const propRes = await fetch(`${baseUrl}/api/extract-props`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, existingPropNames: [] })
        });
        const propData = await propRes.json();
        console.log(`Status: ${propRes.status}`);
        if (propRes.ok) {
            console.log(`Success! Found ${propData.props?.length || 0} props.`);
        } else {
            console.error(`Failed: ${propData.error}`);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

verifyFixes();
