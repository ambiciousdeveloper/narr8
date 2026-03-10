$filePath = "c:/Users/Hayden/Desktop/My project/ai storybook/prism-dashboard/app/api/analyze-story/route.ts"

# Read the file
$content = Get-Content $filePath -Raw -Encoding UTF8

# Target line to replace (exact match with \\n\\n escape sequence)
$oldLine = '            synthesized_body_kr: `[자동 생성된 프롤로그]\\n\\n${firstItem.synthesized_body_kr ? firstItem.synthesized_body_kr.substring(0, 300) + ''...'' : ''이야기가 시작되는 순간, 세계는 아직 평온했다.''}`,'

# New line with 3-stage structure
$newLine = '            synthesized_body_kr: `[자동 생성된 프롤로그]\n\n【Normal World】\n${stage1}\n\n【Character Introduction】\n${stage2}\n\n【Inciting Incident】\n${stage3}`,'

# Simple string replace (not regex)
$content = $content.Replace($oldLine, $newLine)

# Write back
$content | Set-Content $filePath -Encoding UTF8 -NoNewline

Write-Host "✅ Line 650 updated successfully!" -ForegroundColor Green
Write-Host "   Old: firstItem.synthesized_body_kr.substring(0, 300)" -ForegroundColor Yellow
Write-Host "   New: 3-stage prologue template (stage1, stage2, stage3)" -ForegroundColor Green
