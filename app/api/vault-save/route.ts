import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { projectId, assetType, content, assetName, metadata } = await req.json();

        if (!projectId || !assetType || !content) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // For TEXT assets (Novel/Script), perform UPSERT based on project, episode_id, and category
        if (assetType === 'TEXT') {
            const category = metadata?.category;
            const episodeId = metadata?.episode_id;
            const language = metadata?.language;

            // Upload text content to Supabase Storage to avoid data URI size limits
            // Bucket 'vault-text' must exist in your Supabase project (create via Dashboard > Storage)
            const filePath = `${projectId}/${category || 'text'}_${episodeId || 'na'}_${language || 'kr'}_${Date.now()}.txt`;
            const fileBuffer = Buffer.from(content, 'utf-8');

            const { error: uploadErr } = await supabase.storage
                .from('vault-text')
                .upload(filePath, fileBuffer, {
                    contentType: 'text/plain; charset=utf-8',
                    upsert: true
                });

            if (uploadErr) throw uploadErr;

            const { data: { publicUrl: storageUrl } } = supabase.storage
                .from('vault-text')
                .getPublicUrl(filePath);

            // Check if existing record exists
            const { data: existing } = await supabase
                .from('permanent_vault')
                .select('id')
                .eq('source_project_id', projectId)
                .eq('asset_type', 'TEXT')
                .contains('metadata', { category, episode_id: episodeId, language })
                .maybeSingle();

            if (existing) {
                // Update
                const { error: upErr } = await supabase
                    .from('permanent_vault')
                    .update({
                        storage_url: storageUrl,
                        asset_name: assetName,
                        metadata: { ...metadata, updated_at: new Date().toISOString() },
                        created_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);

                if (upErr) throw upErr;
                return NextResponse.json({ success: true, mode: 'UPDATE', id: existing.id });
            }

            // Insert new record
            const { data: inserted, error: insErr } = await supabase
                .from('permanent_vault')
                .insert({
                    asset_type: assetType,
                    storage_url: storageUrl,
                    asset_name: assetName,
                    source_project_id: projectId,
                    metadata: metadata
                })
                .select()
                .single();

            if (insErr) throw insErr;
            return NextResponse.json({ success: true, mode: 'INSERT', id: inserted.id });
        }

        // Universal Insert for non-text (already handled or fallback)
        const { data: inserted, error: insErr } = await supabase
            .from('permanent_vault')
            .insert({
                asset_type: assetType,
                storage_url: content,
                asset_name: assetName,
                source_project_id: projectId,
                metadata: metadata
            })
            .select()
            .single();

        if (insErr) throw insErr;

        return NextResponse.json({ success: true, mode: 'INSERT', id: inserted.id });

    } catch (err: any) {
        console.error(">>> [Vault Save API Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
