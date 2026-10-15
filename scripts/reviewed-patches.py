#!/usr/bin/env python3
"""Build/package signed recipes for exact, verified vendor archives."""
import argparse,base64,hashlib,json,pathlib,struct,subprocess,shutil
ROOT=pathlib.Path(__file__).resolve().parent.parent
TRANSFORMS=(
 ['Sources/CodexPPCore/'+n+'.swift' for n in ['PatchAdapter','NativeSettingsAdapter','NativeBrowserAdapter','AppToolsAdapter','ShellAdapter','BookmarksAdapter','SidebarAdapter','StartupAdapter']]
 +['Sources/CodexPPCore/Resources/'+n for n in ['acorn.js','settings-adapter.js','browser-adapter.js','sidebar-adapter.js','startup-adapter.js','bookmarks-adapter.js','shell-adapter.js','bookmarks-runtime.js','shell-runtime.js','parser-runner.js','app-tools-parent.mjs','native-browser.js','native-bookmarks.js','native-shell.js','native-capture.js','native-trace.js','native-runtime.js','renderer-runtime.js','renderer-bridge.js']]
 +['Sources/CodexPP/Resources/native-settings.js']
)
def fingerprint():
 h=hashlib.sha256()
 for name in TRANSFORMS:h.update(name.encode()+b'\0'+(ROOT/name).read_bytes()+b'\0')
 return h.hexdigest()
def archive(path):
 f=path.open('rb');prefix=f.read(16);_,hs,_,size=struct.unpack('<IIII',prefix);header=f.read(size);nodes={}
 def visit(node,name=''):
  if 'files' in node:
   for key,val in node['files'].items():visit(val,name+'/'+key if name else key)
  else:nodes[name]=node
 visit(json.loads(header));return f,8+hs,hashlib.sha256(header).hexdigest(),nodes

def read_entry(f,offset,node):
 assert not node.get('unpacked') and 'link' not in node
 f.seek(offset+int(node['offset']));data=f.read(node['size']);assert hashlib.sha256(data).hexdigest()==node['integrity']['hash'];return data

def edits(original,patched):
 i=j=0;result=[]
 while i<len(original) or j<len(patched):
  while i+4096<=len(original) and j+4096<=len(patched) and original[i:i+4096]==patched[j:j+4096]:i+=4096;j+=4096
  while i<len(original) and j<len(patched) and original[i]==patched[j]:i+=1;j+=1
  if i==len(original) and j==len(patched):break
  match=None
  for step in [0,64,128,256,512,1024,2048,4096,8192,16384,32768,65536]:
   a=i+step
   if a+64>len(original):continue
   b=patched.find(original[a:a+64],j,min(len(patched),j+1024*1024))
   if b>=j and (a>i or b>j):match=(a,b);break
  if match is None:match=(len(original),len(patched))
  a,b=match;result.append({'start':i,'end':a,'data':base64.b64encode(patched[j:b]).decode()});i=a;j=b
 reconstructed=bytearray();cursor=0
 for e in result:reconstructed+=original[cursor:e['start']]+base64.b64decode(e['data']);cursor=e['end']
 reconstructed+=original[cursor:];assert reconstructed==patched
 return result

p=argparse.ArgumentParser();p.add_argument('--patched');p.add_argument('--package');args=p.parse_args()
if args.package:
 destination=pathlib.Path(args.package)/'Contents/Resources/ReviewedPatches';shutil.rmtree(destination,ignore_errors=True);destination.mkdir()
 for recipe in (ROOT/'Assets/ReviewedPatches').glob('*.json'):
  data=json.loads(recipe.read_text())
  if data['transformFingerprint']==fingerprint():shutil.copy2(recipe,destination/recipe.name)
else:
 assert args.patched
 patched=pathlib.Path(args.patched);receipt=json.loads((patched/'Contents/Resources/codexpp-patch.json').read_text());original=pathlib.Path(receipt['backupPath'])
 subprocess.run(['codesign','--verify','--deep','--strict','-R','=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"',str(original)],check=True)
 subprocess.run(['codesign','--verify','--deep','--strict',str(patched)],check=True)
 original_path=original/'Contents/Resources/app.asar';patched_path=patched/'Contents/Resources/app.asar'
 assert hashlib.sha256(original_path.read_bytes()).hexdigest()==receipt['originalArchiveHash']
 assert hashlib.sha256(patched_path.read_bytes()).hexdigest()==receipt['patchedArchiveHash']
 f,offset,headerHash,nodes=archive(original_path);g,newOffset,_,modified=archive(patched_path);replacements=[]
 for name,node in nodes.items():
  other=modified[name]
  if name==receipt['main'] or node.get('integrity',{}).get('hash')==other.get('integrity',{}).get('hash'):continue
  before=read_entry(f,offset,node);after=read_entry(g,newOffset,other)
  replacements.append({'path':name,'sourceHash':hashlib.sha256(before).hexdigest(),'patchedHash':hashlib.sha256(after).hexdigest(),'edits':edits(before,after)})
 f.close();g.close();assert 1<=len(replacements)<=16
 manifest={'schema':1,'headerHash':headerHash,'version':receipt['version'],'build':receipt['build'],'transformFingerprint':fingerprint(),'settingsReport':json.loads((patched/'Contents/Resources/codexpp-settings-discovery.json').read_text()),'replacements':replacements}
 startup=patched/'Contents/Resources/codexpp-startup-discovery.json'
 if startup.exists():manifest['startupReport']=json.loads(startup.read_text())
 target=ROOT/'Assets/ReviewedPatches'/f'{headerHash}.json';target.write_text(json.dumps(manifest,separators=(',',':'))+'\n');print('Generated',target,len(replacements),'replacements,',target.stat().st_size,'bytes')
