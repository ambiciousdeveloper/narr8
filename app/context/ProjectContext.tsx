'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ProjectContextType {
    projectId: string | null;
    projectConfig: any | null;
    refreshProject: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectConfig, setProjectConfig] = useState<any | null>(null);

    const fetchConfig = async (id: string) => {
        const { data } = await supabase
            .from('project_master_config')
            .select('*')
            .eq('project_id', id)
            .single();
        if (data) {
            setProjectConfig(data);
        }
    };

    const syncProject = async () => {
        const id = localStorage.getItem('active_project_id');
        if (id !== projectId) {
            setProjectId(id);
            if (id) {
                await fetchConfig(id);
            } else {
                setProjectConfig(null);
            }
        }
    };

    useEffect(() => {
        syncProject();

        // Listen for storage changes (cross-tab)
        window.addEventListener('storage', syncProject);

        // Polling as a fallback for same-tab changes that don't trigger storage event
        const interval = setInterval(syncProject, 1000);

        return () => {
            window.removeEventListener('storage', syncProject);
            clearInterval(interval);
        };
    }, [projectId]);

    return (
        <ProjectContext.Provider value={{ projectId, projectConfig, refreshProject: syncProject }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
