import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const search = searchParams.get('search');

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        let query = supabase
            .from('permanent_vault')
            .select('*')
            .order('created_at', { ascending: false });

        if (type && type !== 'all') {
            const typeMap: Record<string, string> = {
                image: 'IMAGE',
                audio: 'AUDIO',
                text: 'TEXT',
                novel: 'TEXT',
                script: 'TEXT'
            };
            const mappedType = typeMap[type] || type.toUpperCase();
            query = query.eq('asset_type', mappedType);

            if (type === 'novel') {
                query = query.contains('metadata', { category: 'NOVEL' });
            } else if (type === 'script') {
                query = query.contains('metadata', { category: 'SCRIPT' });
            }
        }

        if (search) {
            query = query.ilike('asset_name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json({ success: true, assets: data });

    } catch (err: any) {
        console.error(">>> [Vault API Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { assetIds } = await req.json();

        if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
            throw new Error("No asset IDs provided for deletion");
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch URLs to cleanup storage
        const { data: assets, error: fetchErr } = await supabase
            .from('permanent_vault')
            .select('id, storage_url')
            .in('id', assetIds);

        if (fetchErr) throw fetchErr;

        if (assets && assets.length > 0) {
            // Extract paths from Supabase Storage URLs
            // Format example: .../storage/v1/object/public/vault/visuals/filename.webp
            // We need: visuals/filename.webp
            const pathsToCleanup = assets.map(asset => {
                const url = asset.storage_url;
                if (url.includes('/vault/')) {
                    return url.split('/vault/')[1];
                }
                return null;
            }).filter(Boolean) as string[];

            if (pathsToCleanup.length > 0) {
                console.log(`>>> [Vault API] Cleaning up ${pathsToCleanup.length} files from storage...`);
                const { error: storageErr } = await supabase.storage
                    .from('vault')
                    .remove(pathsToCleanup);

                if (storageErr) {
                    console.error(">>> [Vault API Error] Storage cleanup partial failure:", storageErr);
                }
            }
        }

        // 2. Delete from Database
        const { error: deleteErr } = await supabase
            .from('permanent_vault')
            .delete()
            .in('id', assetIds);

        if (deleteErr) throw deleteErr;

        return NextResponse.json({ success: true, count: assetIds.length });

    } catch (err: any) {
        console.error(">>> [Vault DELETE API Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
