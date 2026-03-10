-- Remove Granularity (Focus Level) columns as they are no longer used by the AI engine.
ALTER TABLE project_master_config 
DROP COLUMN IF EXISTS granularity_level,
DROP COLUMN IF EXISTS granularity_goal_kr,
DROP COLUMN IF EXISTS granularity_goal_en;
