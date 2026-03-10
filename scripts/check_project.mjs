import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://urrdkonrlkwrmyhiwple.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycmRrb25ybGt3cm15aGl3cGxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDAzMDk3MywiZXhwIjoyMDg1NjA2OTczfQ.uCfBIsCIRvYsK_ei2o4F9zavxd-zKz0-siVVlTm16TE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProject() {
    try {
        const { data, error } = await supabase
            .from('project_master_config')
            .select('project_id')
            .eq('project_id', 'test_1')
            .maybeSingle();

        if (error) throw error;

        if (data) {
            console.log('Project "test_1" FOUND in project_master_config.');
        } else {
            console.log('Project "test_1" NOT FOUND in project_master_config.');

            const { data: allProjects } = await supabase.from('project_master_config').select('project_id');
            console.log('Available Project IDs:', allProjects?.map(p => p.project_id));
        }
    } catch (error) {
        console.error('Error checking project:', error.message);
    }
}

checkProject();
