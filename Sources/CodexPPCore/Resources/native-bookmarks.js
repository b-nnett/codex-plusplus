(function installNativeBookmarks(electron, support) {
  const fs=require('fs'), path=require('path');
  const file=path.join(support,'bookmarks.json');
  const responseChannel='codex_desktop:message-for-view';
  function trusted(frame) {
    try { const u=new URL(frame.url); return u.protocol==='app:' && u.host==='-' &&
      ['/index.html','/detached-window.html'].includes(u.pathname); } catch { return false; }
  }
  function normalize(value) {
    if(typeof value!=='string' || value.length>8192) throw Error('Invalid bookmark URL.');
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol) || u.username || u.password) throw Error('Only web pages can be bookmarked.');
    return u.href;
  }
  function read() {
    if(!fs.existsSync(file)) return [];
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(data.schema!==1 || !Array.isArray(data.items) || data.items.length>1000) throw Error('Unable to read bookmarks.');
    const seen=new Set();
    return data.items.map(item=>{
      const url=normalize(item.url);
      if(typeof item.title!=='string' || item.title.length>512 || seen.has(url)) throw Error('Invalid bookmarks file.');
      seen.add(url); return {url,title:item.title};
    });
  }
  return Object.freeze({
    handles(request) { return request?.type==='codexpp-bookmarks'; },
    handle(event,request) {
      if(!trusted(event.senderFrame) || event.senderFrame!==event.sender.mainFrame) throw Error('Invalid bookmarks sender.');
      if(typeof request.requestId!=='string' || request.requestId.length>128) throw Error('Invalid bookmarks request.');
      let result;
      try {
        const settings=JSON.parse(fs.readFileSync(path.join(support,'settings.json'),'utf8'));
        if(settings.extensionsPaused || settings.withoutTweaks || settings.enabled?.['better-browser']!==true) throw Error('better-browser is disabled.');
        const items=read();
        if(request.action==='save' || request.action==='remove') {
          const url=normalize(request.url), index=items.findIndex(item=>item.url===url);
          if(request.action==='save' && index<0) {
            if(items.length>=1000) throw Error('The bookmark limit has been reached.');
            if(typeof request.title!=='string' || request.title.length>512) throw Error('Invalid bookmark title.');
            items.push({url,title:request.title.trim() || new URL(url).hostname});
          } else if(request.action==='remove' && index>=0) items.splice(index,1);
          fs.mkdirSync(support,{recursive:true,mode:0o700});
          const temp=file+'.'+process.pid+'.tmp';
          try { fs.writeFileSync(temp,JSON.stringify({schema:1,items}),{mode:0o600}); fs.renameSync(temp,file); }
          finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
          for(const contents of electron.webContents.getAllWebContents()) if(!contents.isDestroyed() && trusted(contents.mainFrame)) {
            try { contents.send(responseChannel,{type:'codexpp-bookmarks-changed',items}); } catch {}
          }
        } else if(request.action!=='list') throw Error('Invalid bookmark action.');
        result={supported:true,protocol:1,items};
      } catch(error) { result={supported:false,error:error.message}; }
      event.sender.send(responseChannel,{type:'codexpp-bookmarks-result',requestId:request.requestId,...result});
    }
  });
})
