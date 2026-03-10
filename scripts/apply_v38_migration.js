const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://urrdkonrlkwrmyhiwple.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycmRrb25ybGt3cm15aGl3cGxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAzMDk3MywiZXhwIjoyMDg1NjA2OTczfQ.uCfBIsCIRvYsK_ei2o4F9zavxd-zKz0-siVVlTm16TE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    console.log("Applying Migration V38.1...");
    const { error } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS episode_storyboards (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                episode_id UUID UNIQUE REFERENCES episodes(story_id) ON DELETE CASCADE,
                project_id UUID REFERENCES project_master_config(project_id) ON DELETE CASCADE,
                timeline_data JSONB NOT NULL DEFAULT '{"tracks": [], "duration": 0}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_episode_storyboards_episode_id ON episode_storyboards(episode_id);
        `
    });

    if (error) {
        console.error("Migration Error:", error);
    } else {
        console.log("Migration Successful.");
    }
}

applyMigration();
