"""Use the exact Hermes voice-note synthesis path without sending a message."""
import json,os,sys,shutil,subprocess,tempfile
from pathlib import Path
# The released Edge compatibility fix is isolated to this app process.
runtime=Path(__file__).resolve().parents[1]/'work'/'voice-runtime'
if runtime.is_dir():sys.path.insert(0,str(runtime))
from tools.tts_tool import text_to_speech_tool,_load_tts_config,_get_provider
from tools.tts_tool_providers import DEFAULT_EDGE_VOICE

payload=json.loads(sys.stdin.read())
config=_load_tts_config()
provider=_get_provider(config)
voice=(config.get('edge') or {}).get('voice',DEFAULT_EDGE_VOICE) if provider=='edge' else (config.get(provider) or {}).get('voice','Configured Hermes voice')
description={'provider':provider,'voice':str(voice),'online':provider not in ('piper','neutts','kittentts')}
if payload.get('describe'):
 print(json.dumps(description))
else:
 output=Path(payload['output'])
 output.parent.mkdir(parents=True,exist_ok=True)
 os.environ['HERMES_SESSION_PLATFORM']='telegram'
 result=json.loads(text_to_speech_tool(text=payload['script'],output_path=str(output)))
 if result.get('success',True) is False:
  raise RuntimeError('The configured Hermes voice could not generate audio.')
 files=[Path(p) for p in (result.get('file_paths') or [result.get('file_path')]) if p]
 if not files or any(not p.exists() for p in files):raise RuntimeError('Hermes returned no usable audio file.')
 if len(files)==1:
  if files[0].resolve()!=output.resolve():shutil.copyfile(files[0],output)
 else:
  with tempfile.NamedTemporaryFile(mode='w',suffix='.txt',delete=False,encoding='utf-8') as listing:
   for p in files:listing.write("file '"+str(p.resolve()).replace("'","'\\''")+"'\n")
   list_path=listing.name
  try:
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-f','concat','-safe','0','-i',list_path,'-c','copy',str(output)],check=True,capture_output=True)
  finally:Path(list_path).unlink(missing_ok=True)
 if output.stat().st_size<100:raise RuntimeError('Hermes generated an empty audio file.')
 print(json.dumps({**description,'bytes':output.stat().st_size,'format':'ogg/opus'}))
