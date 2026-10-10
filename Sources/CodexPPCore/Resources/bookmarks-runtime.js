// Owned UI components; no website injection or React-internal inspection.
(() => {
  if(globalThis.__codexPPBookmarks) return;
  let context, enabled=false, state={items:[],error:null,busy:false};
  const listeners=new Set(), pending=new Map();
  const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
  const snapshot=()=>state;
  function update(next) { state={...state,...next}; for(const listener of listeners) listener(); }
  function url(value) {
    try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
  }
  function request(action, extra={}) {
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID();
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Bookmarks did not respond. Restart ChatGPT.'));},5000);
      pending.set(requestId,{resolve,reject,timer});
      try { globalThis.electronBridge.sendMessageFromView({type:'codexpp-bookmarks',requestId,action,...extra}); }
      catch(error) {clearTimeout(timer);pending.delete(requestId);reject(error);}
    });
  }
  function receive(event) {
    if((event.source && event.source!==window) || !enabled) return;
    const data=event.data;
    if(data?.type==='codexpp-bookmarks-changed' && Array.isArray(data.items)) update({items:data.items,error:null});
    if(data?.type!=='codexpp-bookmarks-result') return;
    const job=pending.get(data.requestId); if(!job) return;
    clearTimeout(job.timer);pending.delete(data.requestId);
    if(data.supported===true && data.protocol===1 && Array.isArray(data.items)) {
      update({items:data.items,error:null}); job.resolve(data);
    } else job.reject(Error(data.error || 'Update Codex++ to install bookmark support.'));
  }
  const getContext=React=>context??=React.createContext(null);
  async function mutate(action,bookmark) {
    if(state.busy || !enabled) return;
    update({busy:true,error:null});
    try { await request(action,bookmark); }
    catch(error) {update({error:error.message});}
    finally {update({busy:false});}
  }
  function Menu({React,jsx,Item,children}) {
    const current=React.useContext(getContext(React));
    const saved=React.useSyncExternalStore(subscribe,snapshot,snapshot);
    const currentURL=url(current?.url);
    if(!enabled || !currentURL) return children;
    const exists=saved.items.some(item=>item.url===currentURL);
    const action=jsx(Item,{disabled:saved.busy,onSelect:()=>mutate(exists?'remove':'save',{
      url:currentURL,title:(current.title || new URL(currentURL).hostname).slice(0,512)
    }),children:exists?'Remove from bookmarks':'Save to bookmarks'},'codexpp-bookmark-action');
    const error=saved.error ? jsx(Item,{disabled:true,children:saved.error},'codexpp-bookmark-error') : null;
    return React.cloneElement(children,{children:[action,error,...React.Children.toArray(children.props.children)]});
  }
  const fallbackIcon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" fill="none" stroke="#858585" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  function Section({React,jsx,onNavigate,children,SiteIcon}) {
    const saved=React.useSyncExternalStore(subscribe,snapshot,snapshot);
    if(!enabled) return children;
    const cards=saved.items.map(item=>jsx('li',{className:'min-w-32 flex-1',children:jsx('a',{
      href:item.url,title:item.url,className:'flex h-full flex-col items-center gap-3 rounded-md border border-default bg-surface px-4 py-4 text-center text-sm text-default hover:bg-primary-ghost-hover focus-visible:ring-2 focus-visible:ring-ring',
      onClick:event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){event.preventDefault();onNavigate(item.url);}},
      children:[jsx('span',{'aria-hidden':true,'data-codexpp-bookmark-icon':true,className:'flex size-12 items-center justify-center overflow-hidden rounded-md bg-surface-secondary text-lg',children:SiteIcon ? jsx(SiteIcon,{site:{url:item.url,title:item.title,faviconDataURL:fallbackIcon}}) : '☆'}),jsx('span',{className:'w-full truncate',children:item.title})]
    })},item.url));
    return jsx(React.Fragment,{children:[jsx('section',{'aria-label':'Bookmarks','data-codexpp-bookmarks':true,className:'mb-6 flex flex-col gap-4',children:[
      jsx('h3',{className:'text-sm font-medium text-default',children:'Bookmarks'}),
      cards.length ? jsx('ul',{className:'grid grid-cols-2 gap-3',children:cards}) : jsx('p',{className:'text-sm text-secondary',children:'Save pages from the browser menu to find them here.'}),
      saved.error ? jsx('p',{role:'alert',className:'text-sm text-secondary',children:saved.error}) : null,
      jsx('style',{children:'[data-codexpp-bookmark-icon]>span{width:100%;height:100%;border-radius:0}[data-codexpp-bookmark-icon] img{width:100%;height:100%;object-fit:cover}'})
    ]}),children]});
  }
  Object.defineProperty(globalThis,'__codexPPBookmarks',{value:Object.freeze({
    protocol:1,
    async enable() {
      if(!enabled) { enabled=true;window.addEventListener('message',receive);update({error:null}); }
      try { await request('list'); }
      catch(error) { this.disable(); throw error; }
    },
    disable() {
      enabled=false;window.removeEventListener('message',receive);
      for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Bookmarks disabled.'));}
      pending.clear();update({error:null,busy:false});
    },
    provide(React,jsx,current,children) {return jsx(getContext(React).Provider,{value:current,children});},
    menu(React,jsx,Item,children) {return jsx(Menu,{React,jsx,Item,children});},
    section(React,jsx,onNavigate,children,SiteIcon) {return jsx(Section,{React,jsx,onNavigate,children,SiteIcon});}
  })});
})();
