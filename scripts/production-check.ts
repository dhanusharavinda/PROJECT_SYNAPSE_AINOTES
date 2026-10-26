const base='http://127.0.0.1:4317';
const page=await fetch(base);if(!page.ok)throw new Error('Production page did not load.');
const html=await page.text();const cookie=page.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const get=async(url:string)=>{const response=await fetch(base+url,{headers:{Cookie:cookie}});if(!response.ok)throw new Error(`HTTP ${response.status} for ${url}`);return response;};
const bootstrap=await (await get('/api/bootstrap')).json();
for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g))await get(match[1]);
const episode=bootstrap.episodes.find((e:any)=>e.file);let audioRange=false;
if(episode){const response=await fetch(base+'/files/audio/'+episode.file,{headers:{Cookie:cookie,Range:'bytes=0-127'}});audioRange=response.status===206;if(!audioRange)throw new Error('Audio range request failed.');}
console.log(JSON.stringify({page:'passed',compiledAssets:'passed',notes:bootstrap.notes.length,studyNotes:bootstrap.notes.filter((n:any)=>n.reviewEnabled!==false).length,provider:bootstrap.config.provider,keyConfigured:bootstrap.config.keySet,audioRange:audioRange?'passed':'no saved episode'},null,2));
if(process.argv.includes('--conflict-fixture')){const response=await fetch(base+'/api/notes',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({title:'QA conflict recovery',group:'QA',context:'Disposable verification fixture',reviewEnabled:false,layers:{intuition:'Original explanation for a conflict test.',technical:'',implementation:''}})});const note=await response.json();if(!response.ok)throw new Error('Fixture creation failed.');console.log('Conflict fixture ID: '+note.id);}
