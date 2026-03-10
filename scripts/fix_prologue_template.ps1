$filePath = "c:/Users/Hayden/Desktop/My project/ai storybook/prism-dashboard/app/api/analyze-story/route.ts"

# Read file
$content = Get-Content $filePath -Raw -Encoding UTF8

# Old pattern (with escaped \\n)
$oldPattern = 'synthesized_body_kr: `\[자동 생성된 프롤로그\]\\n\\n\$\{firstItem\.synthesized_body_kr \? firstItem\.synthesized_body_kr\.substring\(0, 300\) \+ ''\.\.\.'' : ''이야기가 시작되는 순간, 세계는 아직 평온했다\.''\}`'

# New pattern (using stage variables)
$newPattern = 'synthesized_body_kr: `[자동 생성된 프롤로그]\n\n【Normal World】\n${stage1}\n\n【Character Introduction】\n${stage2}\n\n【Inciting Incident】\n${stage3}`'

# Replace
$content = $content -replace $oldPattern, $newPattern

# Write back
Set-Content $filePath -Value $content -Encoding UTF8 -NoNewline

Write-Host "✅ File updated successfully!" -ForegroundColor Green
