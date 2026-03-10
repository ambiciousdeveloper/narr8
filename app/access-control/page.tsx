'use client';

import { useState } from 'react';
import { Shield, Lock, UserCog, Key } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

export default function AccessControl() {
    const { projectId } = useProject();
    const [users, setUsers] = useState([
        { id: 1, name: 'Director (You)', role: 'Owner', access: ['All'] },
        { id: 2, name: 'Alice (Asst. Writer)', role: 'Editor', access: ['Script Studio', 'Collab Writer'] },
        { id: 3, name: 'Bob (Sound Eng)', role: 'Viewer', access: ['Voice Studio', 'Cutting Room'] },
    ]);

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Shield className="w-8 h-8 text-blue-500" />
                    Access Control
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">Team Roles & Permissions (RBAC)</p>
            </header>

            <div className="glass-panel rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-white/5 border-b border-white/10 text-sm font-bold text-gray-400 uppercase tracking-wider">
                        <tr>
                            <th className="p-6">User</th>
                            <th className="p-6">Role</th>
                            <th className="p-6">Granted Access</th>
                            <th className="p-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-6 font-bold flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-xs">
                                        {u.name[0]}
                                    </div>
                                    {u.name}
                                </td>
                                <td className="p-6">
                                    <span className={`px-2 py-1 rounded text-xs font-bold border ${u.role === 'Owner' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                                        u.role === 'Editor' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                            'bg-gray-500/20 text-gray-400 border-gray-500/30'
                                        }`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="p-6 text-sm text-gray-400">
                                    {u.access.join(', ')}
                                </td>
                                <td className="p-6 text-right">
                                    <button className="text-gray-500 hover:text-white transition-colors">
                                        <UserCog className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="p-6 border-t border-white/10 bg-black/20 flex justify-between items-center">
                    <p className="text-sm text-gray-500">3 Active Users</p>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors">
                        <Key className="w-4 h-4" /> Invite New Member
                    </button>
                </div>
            </div>
        </div>
    );
}
