import fetch from 'node-fetch';

async function testExtraction() {
    const projectId = 'test_1';
    console.log(`>>> Testing extraction for project: ${projectId}`);

    const res = await fetch('http://localhost:3000/api/extract-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            existingLocations: []
        })
    });

    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
}

testExtraction();
