import fs from 'fs';

const filePath = 'c:/Users/Hayden/Desktop/My project/ai storybook/prism-dashboard/app/api/analyze-story/route.ts';

// Read file
let content = fs.readFileSync(filePath, 'utf8');

// Old line (with double backslash escapes)
const oldLine = 'synthesized_body_kr: `[자동 생성된 프롤로그]\\\\n\\\\n${firstItem.synthesized_body_kr ? firstItem.synthesized_body_kr.substring(0, 300) + \'...\' : \'이야기가 시작되는 순간, 세계는 아직 평온했다.\'}`';

// New line (with single backslash)
const newLine = 'synthesized_body_kr: `[자동 생성된 프롤로그]\\n\\n【Normal World】\\n${stage1}\\n\\n【Character Introduction】\\n${stage2}\\n\\n【Inciting Incident】\\n${stage3}`';

// Replace
content = content.replace(oldLine, newLine);

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Line 650 updated successfully!');
console.log('   Replaced: substring(0, 300) truncation');
console.log('   With: 3-stage prologue template');
