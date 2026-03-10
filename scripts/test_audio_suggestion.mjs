import fetch from 'node-fetch';

async function testAudioSuggestion() {
    console.log('>>> [TEST] Verifying Audio Palette Suggestion...');

    const response = await fetch('http://localhost:3000/api/suggest-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            concept: 'A cyberpunk detective story set in a neon Seoul where it always rains.'
        })
    });

    if (!response.ok) {
        console.error('API Error:', response.statusText);
        return;
    }

    const data = await response.json();
    console.log('\n[AI RECOMMENDATION RESULT]');
    console.log('Art Style:', data.art_style_kr);
    console.log('Aesthetic DNA:', data.aesthetic_dna_kr);
    console.log('BGM Style (KR):', data.audio_palette_bgm_kr);
    console.log('BGM Style (EN):', data.audio_palette_bgm_en);
    console.log('Ambience (KR):', data.audio_palette_ambience_kr);
    console.log('Ambience (EN):', data.audio_palette_ambience_en);

    if (data.audio_palette_bgm_kr && data.audio_palette_ambience_kr) {
        console.log('\n✅ Audio Palette Suggestion Success!');
    } else {
        console.log('\n❌ Audio Palette Suggestion Missing.');
    }
}

testAudioSuggestion();
