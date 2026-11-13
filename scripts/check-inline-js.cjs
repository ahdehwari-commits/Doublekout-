const fs=require('node:fs');
const vm=require('node:vm');
const file=process.argv[2]||'web-prototype.html';
const html=fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
let checked=0;
for(let i=0;i<scripts.length;i++){
  if(/\\bsrc\\s*=/.test(scripts[i][1]))continue;
  const source=scripts[i][2].trim();
  if(!source)continue;
  new vm.Script(source,{filename:file+':inline-script-'+(i+1)});
  checked++;
}
if(!checked)throw new Error('No inline scripts were checked');
console.log('PASS: syntax checked '+checked+' inline scripts in '+file);
