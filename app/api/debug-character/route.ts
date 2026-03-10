import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || '범노을';

    const { data } = await supabase
        .from('characters')
        .select('*, character_voices(*)')
        .ilike('reinterpreted_name_kr', `%${name}%`)
        .limit(1);

    if (!data?.[0]) return NextResponse.json({ error: 'not found' });

    const char = data[0];
    const voice = char.character_voices?.[0];
    return NextResponse.json({
        name: char.reinterpreted_name_kr,
        gender: char.reinterpreted_gender_en,
        aging_evolution_en: char.aging_evolution_en,
        aging_evolution_kr: char.aging_evolution_kr,
        voice_api_id: voice?.voice_api_id,
        voice_persona_name: voice?.voice_persona_name,
        stability: voice?.stability,
        voice_settings: voice?.voice_settings,
    });
}
