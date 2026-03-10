import { writeFileSync } from 'fs';

const supabaseUrl = 'https://urrdkonrlkwrmyhiwple.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycmRrb25ybGt3cm15aGl3cGxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAzMDk3MywiZXhwIjoyMDg1NjA2OTczfQ.uCfBIsCIRvYsK_ei2o4F9zavxd-zKz0-siVVlTm16TE';

async function fetchSchema() {
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Accept-Profile': 'public'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const schema = await response.json();
        const episodesDefinition = schema.definitions.episodes;

        if (episodesDefinition) {
            console.log('--- EPISODES TABLE COLUMNS ---');
            console.log(JSON.stringify(episodesDefinition.properties, null, 2));
        } else {
            console.log('Episodes table definition not found in schema.');
            console.log('Available tables:', Object.keys(schema.definitions));
        }
    } catch (error) {
        console.error('Failed to fetch schema:', error);
    }
}

fetchSchema();
