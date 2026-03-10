'use client';

import { useState } from 'react';
import { FileText, AlertTriangle, User, Calendar, Search } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

export default function AuditLogs() {
    const { projectId } = useProject();
    const [logs] = useState([
        { id: 1, action: 'DELETE_CHARACTER', target: 'Character: Old_Wizard_v1', user: 'Director', time: '2025-02-06 10:15:22', level: 'warn' },
        { id: 2, action: 'PUBLISH_VIDEO', target: 'Ep4_Final_Cut.mp4', user: 'Director', time: '2025-02-06 09:42:10', level: 'info' },
        { id: 3, action: 'MODIFY_SCRIPT', target: 'Scene 3 - Dialogue', user: 'Alice', time: '2025-02-06 09:30:05', level: 'info' },
        { id: 4, action: 'LOGIN_ATTEMPT', target: 'IP: 192.168.1.1', user: 'Bob', time: '2025-02-06 08:11:00', level: 'info' },
        { id: 5, action: 'API_KEY_ROTATION', target: 'System', user: 'Admin', time: '2025-02-05 23:59:59', level: 'critical' },
    ]);

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <FileText className="w-8 h-8 text-gray-400" />
                        Audit Logs
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400">System Activity & Security Trail</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="text" placeholder="Search logs..." className="bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-300 focus:border-white/30 outline-none w-64" />
                </div>
            </header>

            <div className="space-y-2 font-mono text-sm">
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className={`p-4 rounded-lg border flex items-center gap-4 transition-all hover:translate-x-1 ${log.level === 'critical' ? 'bg-red-900/10 border-red-500/30' :
                            log.level === 'warn' ? 'bg-yellow-900/10 border-yellow-500/30' :
                                'bg-white/5 border-white/5'
                            }`}
                    >
                        <span className={`w-2 h-2 rounded-full ${log.level === 'critical' ? 'bg-red-500 animate-pulse' :
                            log.level === 'warn' ? 'bg-yellow-500' :
                                'bg-blue-500'
                            }`} />

                        <span className="text-gray-500 min-w-[150px]">{log.time}</span>

                        <span className={`font-bold min-w-[180px] ${log.level === 'critical' ? 'text-red-400' :
                            log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'
                            }`}>
                            {log.action}
                        </span>

                        <span className="text-gray-300 flex-1 truncate">{log.target}</span>

                        <div className="flex items-center gap-2 text-gray-500 min-w-[100px] justify-end">
                            <User className="w-3 h-3" /> {log.user}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
