import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { characterId, projectId, customText } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

        if (!supabaseUrl || !supabaseKey || !elevenLabsKey) {
            throw new Error("Missing credentials or API keys");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch character, project, and voice settings
        const { data: charData, error: charError } = await supabase
            .from('characters')
            .select('*, character_voices(*)')
            .eq('id', characterId)
            .single();

        if (charError || !charData) throw new Error("Character not found");

        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('*')
            .eq('project_id', projectId || charData.project_id)
            .single();

        const storyToneEn = projectConfig?.story_tone_en || "Neutral";
        const storyToneKr = projectConfig?.story_tone_kr || "보통";
        const countryEn = projectConfig?.world_country_en || "";
        const countryKr = projectConfig?.world_country_kr || "";

        let voiceInfo = charData.character_voices?.[0];

        // [V7.1 Robustness] Auto-initialize if missing
        if (!voiceInfo) {
            console.log(`>>> [Voice Gen] Initializing missing settings for ${characterId}`);
            const initialVoice = {
                character_id: characterId,
                project_id: charData.project_id,
                voice_persona_name: charData.reinterpreted_name_kr + " Tone",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true
                }
            };
            const { data: newVal, error: initErr } = await supabase
                .from('character_voices')
                .insert(initialVoice)
                .select()
                .single();

            if (initErr) throw new Error("Failed to initialize voice settings: " + initErr.message);
            voiceInfo = newVal;
        }

        // 2. Dynamic Voice Selection (V12.7 — No more hardcoded IDs)
        // Build character profile for matching
        const gender = charData.reinterpreted_gender_en?.toUpperCase() || charData.reinterpreted_gender_kr || "FEMALE";
        const ageRawText = [
            charData.aging_evolution_en || '',
            charData.aging_evolution_kr || '',
        ].join(' ').toLowerCase();

        // Extract numeric age
        const ageNumMatch = ageRawText.match(/(\d{2})/);
        const numericAge = ageNumMatch ? parseInt(ageNumMatch[1]) : 30;

        // Build personality keyword profile including story tone and country
        const charProfile = [
            charData.reinterpreted_personality_en || '',
            charData.reinterpreted_personality_kr || '',
            charData.reinterpreted_role_en || '',
            charData.reinterpreted_role_kr || '',
            charData.aging_evolution_en || '',
            storyToneEn,
            storyToneKr,
            countryEn,
            countryKr
        ].join(' ').toLowerCase();

        const KEYWORD_SCORE_MAP: Record<string, string[]> = {
            strong: ['strong', 'powerful', 'commanding', 'authority', 'forceful', '강한', '강력', '권위', '카리스마'],
            soft: ['soft', 'gentle', 'calm', 'warm', 'kind', 'tender', '부드러운', '따뜻한', '온화한', '친절'],
            raspy: ['raspy', 'gravelly', 'rough', 'husky', 'gritty', '허스키', '거친', '굵은'],
            authoritative: ['boss', 'executive', 'leader', 'ceo', 'chief', 'president', 'magistrate', '대표', '대통령', '사장', '리더', '지도자'],
            villainous: ['villain', 'manipulate', 'scheming', 'cold', 'ruthless', 'sinister', '악당', '조종', '냉혹', '잔인'],
            friendly: ['friendly', 'cheerful', 'bright', 'outgoing', 'social', '쾌활', '명랑', '사교적', '친근한'],
            mysterious: ['mysterious', 'enigmatic', 'secretive', 'quiet', 'introverted', '신비', '내성적', '조용한'],
            narrator: ['narrator', 'narration', 'storytelling', '내레이터', '서술'],
        };

        // Determine age group label
        const ageGroup = numericAge >= 60 ? 'old'
            : numericAge >= 40 ? 'middle aged'
                : numericAge >= 25 ? 'young'
                    : 'young';

        const genderLabel = gender === 'MALE' ? 'male' : 'female';

        console.log(`>>> [Voice Gen] ${charData.reinterpreted_name_kr} | gender: ${genderLabel} | age: ${numericAge} (${ageGroup})`);
        console.log(`>>> [Voice Gen] char profile: "${charProfile.slice(0, 120)}"`);

        // Fetch available voices from ElevenLabs
        let selectedVoiceId: string;
        let selectedVoiceName: string;

        try {
            const trimmedKey = elevenLabsKey.trim();
            const voiceListRes = await fetch('https://api.elevenlabs.io/v1/voices', {
                headers: { 'xi-api-key': trimmedKey }
            });

            if (!voiceListRes.ok) {
                const errorBody = await voiceListRes.text();
                console.error(`>>> [Voice Gen] fetch('/voices') failed. Status: ${voiceListRes.status}, Body: ${errorBody}`);
                throw new Error(`Voice list fetch failed: ${voiceListRes.status}`);
            }

            const { voices: allVoices } = await voiceListRes.json() as { voices: any[] };

            // Score each voice
            const scored = allVoices.map((voice: any) => {
                let score = 0;
                const labels = voice.labels || {};
                const voiceDesc = [
                    labels.description || '',
                    labels.use_case || '',
                    labels.accent || '',
                    voice.name || '',
                ].join(' ').toLowerCase();

                // Gender match — critical (100 points)
                if (labels.gender === genderLabel) score += 100;
                else if (labels.gender && labels.gender !== genderLabel) score -= 200; // hard penalty for wrong gender

                // Age group match (80 points)
                if (labels.age === ageGroup) score += 80;
                else if (labels.age) {
                    // Partial credit: old/middle aged closer than young
                    if (ageGroup === 'old' && labels.age === 'middle aged') score += 30;
                    if (ageGroup === 'middle aged' && labels.age === 'old') score += 20;
                    if (ageGroup === 'middle aged' && labels.age === 'young') score -= 20;
                    if (ageGroup === 'old' && labels.age === 'young') score -= 50;
                }

                // Personality/role keyword match (up to 60 points)
                for (const [trait, keywords] of Object.entries(KEYWORD_SCORE_MAP)) {
                    const charHasTrait = keywords.some(k => charProfile.includes(k));
                    const voiceHasTrait = keywords.some(k => voiceDesc.includes(k));
                    if (charHasTrait && voiceHasTrait) score += 20;
                }

                // Multilingual use-case bonus
                if (labels.use_case?.toLowerCase().includes('narration') ||
                    labels.use_case?.toLowerCase().includes('audiobook')) score += 10;

                // Add a more significant random factor for variety so "Regenerate" actually works
                score += Math.random() * 40;

                return { voice_id: voice.voice_id, name: voice.name, score, labels };
            });

            // Sort by score
            scored.sort((a: any, b: any) => b.score - a.score);

            // Log top candidates for debugging
            console.log(`>>> [Voice Gen] Top candidates:`, scored.slice(0, 3).map((s: any) => `${s.name}(${s.score.toFixed(1)})`).join(', '));

            // Pick randomly from the top 3 (if available) to ensure true variety upon refresh
            const topK = scored.slice(0, 3);
            const chosen = topK[Math.floor(Math.random() * topK.length)];

            selectedVoiceId = chosen.voice_id;
            selectedVoiceName = chosen.name;
            console.log(`>>> [Voice Gen] Selected: "${selectedVoiceName}" (score: ${chosen.score.toFixed(1)}) | labels: ${JSON.stringify(chosen.labels)}`);

        } catch (voiceErr: any) {
            // Fallback to safe defaults if API call fails
            console.error(`>>> [Voice Gen] ElevenLabs API unreachable or error: ${voiceErr.message}. USING FALLBACK POOL.`);

            // Pool of high-quality default voices for variety even during API failure
            const FALLBACK_POOLS: Record<string, [string, string][]> = {
                'male-old': [
                    ['VR6AewLTigWG4xSOukaG', 'Arnold (Fallback)'],
                    ['N2lVS1wzEx9vC9n2BkoX', 'Josh (Old-Fallback)'], // Josh can sound mature
                    ['ErXwobaYiN019PkySvjV', 'Antoni (Old-Fallback)']
                ],
                'male-middle aged': [
                    ['TxGEqnHWrfWFTfGW9XjX', 'Josh (Fallback)'],
                    ['ErXwobaYiN019PkySvjV', 'Antoni (Mature-Fallback)'],
                    ['VR6AewLTigWG4xSOukaG', 'Arnold (Mature-Fallback)']
                ],
                'male-young': [
                    ['ErXwobaYiN019PkySvjV', 'Antoni (Fallback)'],
                    ['TxGEqnHWrfWFTfGW9XjX', 'Josh (Young-Fallback)']
                ],
                'female-old': [
                    ['z9fAnlkpzviPz146aGWa', 'Glinda (Fallback)'],
                    ['21m00Tcm4TlvDq8ikWAM', 'Rachel (Old-Fallback)']
                ],
                'female-middle aged': [
                    ['z9fAnlkpzviPz146aGWa', 'Glinda (Fallback)'],
                    ['EXAVITQu4vr4xnSDxMaL', 'Bella (Fallback)']
                ],
                'female-young': [
                    ['21m00Tcm4TlvDq8ikWAM', 'Rachel (Fallback)'],
                    ['EXAVITQu4vr4xnSDxMaL', 'Bella (Young-Fallback)']
                ],
            };

            const pool = FALLBACK_POOLS[`${genderLabel}-${ageGroup}`] || [['21m00Tcm4TlvDq8ikWAM', 'Rachel (Fallback)']];
            // Pick a random one from the pool for variety
            const [fId, fName] = pool[Math.floor(Math.random() * pool.length)];

            selectedVoiceId = fId;
            selectedVoiceName = fName;
        }

        // 3. Prepare text for preview — use custom text if provided by user
        const previewText = (customText && customText.trim())
            ? customText.trim()
            : charData.reinterpreted_personality_kr?.split('.')[0]
            || charData.reinterpreted_role_kr
            || '안녕하세요, 만나서 반갑습니다.';

        console.log(`>>> [Voice Gen] customText received: "${customText}"`);
        console.log(`>>> [Voice Gen] previewText selected: "${previewText}"`);
        console.log(`>>> [Voice Gen] Casting ${charData.reinterpreted_name_kr} as ${selectedVoiceName} (${selectedVoiceId})`);

        // 4. Age-tier specific voice settings (V12.6 Fix — uses ageGroup from V12.7)
        const AGE_VOICE_SETTINGS = {
            OLD: { stability: 0.75, similarity_boost: 0.65, style: 0.08 }, // 중후하고 안정적, 허스키한 노인톤
            MATURE: { stability: 0.60, similarity_boost: 0.70, style: 0.18 }, // 중간 무게감, 절제된 개성
            YOUNG: { stability: 0.35, similarity_boost: 0.80, style: 0.30 }, // 역동적이고 맑은 청년톤
        };

        const ageTier = ageGroup === 'old' ? 'OLD' : ageGroup === 'middle aged' ? 'MATURE' : 'YOUNG';
        const voiceSettings = AGE_VOICE_SETTINGS[ageTier];
        console.log(`>>> [Voice Gen] Age tier: ${ageTier} | settings: ${JSON.stringify(voiceSettings)}`);

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': elevenLabsKey,
            },
            body: JSON.stringify({
                text: previewText,
                model_id: "eleven_multilingual_v2",
                voice_settings: voiceSettings,
            }),
        });

        if (!response.ok) {
            const errDetail = await response.text();
            throw new Error(`ElevenLabs API failed: ${errDetail}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');

        // --- Persistent Storage (V15.0) ---
        let permanentUrl = `data:audio/mpeg;base64,${base64Audio}`; // Fallback to base64
        try {
            console.log(`>>> [Vault] Persisting audio to Supabase Storage...`);
            const fileName = `${characterId}_${Date.now()}.mp3`;
            const filePath = `voices/${fileName}`;

            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('vault')
                .upload(filePath, audioBuffer, {
                    contentType: 'audio/mpeg',
                    upsert: true
                });

            if (uploadErr) throw uploadErr;

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('vault')
                .getPublicUrl(filePath);

            permanentUrl = publicUrlData.publicUrl;
            console.log(`>>> [Vault] Persistent URL created: ${permanentUrl}`);
        } catch (persistErr) {
            console.error(">>> [Vault Error] Failed to persist audio to storage, using base64 fallback:", persistErr);
        }

        // 4. Update DB (Use permanentUrl)
        await supabase
            .from('character_voices')
            .update({
                voice_api_id: selectedVoiceId,
                voice_persona_name: selectedVoiceName,
                audio_url: permanentUrl
            })
            .eq('character_id', characterId);

        // 5. [V14.0] Register in Permanent Vault
        try {
            await supabase.from('permanent_vault').insert({
                asset_type: 'AUDIO',
                storage_url: permanentUrl,
                asset_name: `${charData.reinterpreted_name_kr}_voice.mp3`,
                source_project_id: charData.project_id,
                metadata: {
                    character_id: characterId,
                    voice_id: selectedVoiceId,
                    voice_name: selectedVoiceName,
                    preview_text: previewText
                }
            });
            console.log(`>>> [Vault] Audio asset registered for ${charData.reinterpreted_name_kr}`);
        } catch (vaultErr) {
            console.error(">>> [Vault Error] Failed to register audio:", vaultErr);
        }

        return NextResponse.json({
            success: true,
            audioData: base64Audio, // Still return base64 for immediate playback in UI if needed
            audioUrl: permanentUrl, // Return the permanent storage URL
            textUsed: previewText,
            voiceName: selectedVoiceName
        });

    } catch (err: any) {
        console.error(">>> [Voice Gen Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
