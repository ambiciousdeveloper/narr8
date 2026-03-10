import fs from 'fs';

const filePath = 'c:/Users/Hayden/Desktop/My project/ai storybook/prism-dashboard/app/api/analyze-story/route.ts';

// Read file
let content = fs.readFileSync(filePath, 'utf8');

// Find the exact line
const lines = content.split('\n');
const targetLineNum = 649; // 0-indexed (line 650)

console.log('Current line 650:');
console.log(lines[targetLineNum]);
console.log('\n');

// Replace line 650
lines[targetLineNum] = "            synthesized_body_kr: `[자동 생성된 프롤로그]\\n\\n【Normal World】\\n${stage1}\\n\\n【Character Introduction】\\n${stage2}\\n\\n【Inciting Incident】\\n${stage3}`,";

// Write back
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

console.log('✅ Line 650 replaced!');
console.log('New line 650:');
console.log(lines[targetLineNum]);
