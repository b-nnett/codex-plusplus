// Identify Explore by its SVG, independently of its translated accessible name.
const ellipsisDot = 'M4.16638 8.50146C4.99378 8.50146 5.66523 9.17215 5.66541 9.99951C5.66541 10.827 4.99389 11.4985 4.16638 11.4985C3.33902 11.4984 2.66833 10.8269 2.66833 9.99951C2.66851 9.17226 3.33913 8.50164 4.16638 8.50146Z';
const railSelector = '[data-app-navigation-rail="true"]';
const orbitSelector = 'button[data-sidebar-destination="builtin:orbit"]';
const pinAction = 'codexpp-better-sidebar-pin-orbit';
const unpinAction = 'codexpp-better-sidebar-unpin-orbit';
const optionalDestinations = new Set(['builtin:images','builtin:space','builtin:library','builtin:automations','builtin:customize']);
const optionalRailSelector = [...optionalDestinations].map(id=>`${railSelector} button[data-sidebar-destination="${id}"]`).join(',');
const projectRowSelector = '[data-app-action-sidebar-project-row]';
const inactiveHomeSelector = `:is([data-better-sidebar-inactive], ${railSelector}[data-better-sidebar-selection] button[data-sidebar-destination="builtin:home"])`;

api.addStyle(`
  ${railSelector} > div > button[data-slot="popover-trigger"]:not([data-sidebar-destination]):has(svg[viewBox="0 0 20 20"] > path[d="${ellipsisDot}"]) {
    order: 1 !important;
    margin-top: auto !important;
    flex-shrink: 0 !important;
  }
  [data-better-sidebar-pins] { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
  [data-better-sidebar-dot] img { width: 20px; height: 20px; object-fit: contain; }
  ${inactiveHomeSelector} { color: var(--color-text-tertiary) !important; --button-text-color: var(--color-text-tertiary) !important; }
  ${inactiveHomeSelector}:not(:hover)::before { opacity: 0 !important; }
  ${inactiveHomeSelector}:hover { color: var(--button-text-color-hover) !important; }
  ${inactiveHomeSelector}:hover::before { opacity: 1 !important; }
  [data-better-sidebar-hidden] { display: none !important; }
  [data-better-sidebar-flat-project] [data-app-action-sidebar-thread-row] .w-4.shrink-0:has(> div:empty) { display: none; }
  [data-better-sidebar-flat-project] .px-8[role="listitem"] { padding-inline: 0; }
  [data-better-sidebar-flat-project] [data-optically-align="start"] { margin-inline-start: 0 !important; }
  [data-better-sidebar-home-outline] { display: none; }
  [data-better-sidebar-home-outline], [data-better-sidebar-home-outline] * { pointer-events: none; }
  [data-better-sidebar-chat-pin] { display: contents; }
  [data-better-sidebar-project-pinned-section] { order: -1; }
  [data-better-sidebar-chat-pin="false"] > button { visibility: hidden; }
  [data-app-action-sidebar-thread-row]:is(:hover,:focus-within) [data-better-sidebar-chat-pin="false"] > button { visibility: visible; }
  [data-better-sidebar-explore] { order: 1; margin-top: auto; flex-shrink: 0; }
  [data-better-sidebar-explore] > button { margin-top: 0 !important; }
  ${inactiveHomeSelector}:has([data-better-sidebar-home-outline] svg) > span > svg { display: none; }
  ${inactiveHomeSelector} [data-better-sidebar-home-outline] { display: contents; }
  [data-better-sidebar-project-brand] > :not([data-better-sidebar-project-title]) { display: none; }
`);

// Read the app's existing menu, navigation and localization callbacks. Do not
// mutate React fibers or replace any native actions. This adapter is verified
// against ChatGPT 26.1007.21159 and fails back to the original row menu.
function appBindings(element) {
  if (!element) return {};
  // Native SVG path nodes may be inserted without a React fiber of their own.
  while(element && !Object.keys(element).some(key=>key.startsWith('__reactFiber$')))element=element.parentElement;
  if(!element)return {};
  const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
  let fiber = element[fiberKey];
  const bindings = {};
  while (fiber) {
    const props = fiber.memoizedProps;
    if (!bindings.getItems && typeof props?.getItems === 'function') { bindings.getItems = props.getItems; bindings.beforeMenu = props.onBeforeOpen; }
    if (!bindings.navItem && props?.item?.id) bindings.navItem=props.item;
    if (!bindings.openProject && typeof props?.selectAction?.onSelect === 'function') bindings.openProject = props.selectAction.onSelect;
    if (!bindings.project && props?.group?.projectId) bindings.project = props.group;
    if (!bindings.threadProjectId) bindings.threadProjectId=props?.hoverCardProjectId||props?.chatGptProjectId||props?.projectGroup?.projectId;
    if (!bindings.sectionId && props?.sectionKey?.startsWith('custom:')) bindings.sectionId = props.sectionKey.slice(7);
    // The compiler caches the native Scope facade here. Context maps also
    // expose get/set, so those must not be mistaken for the section store.
    for (const cache of fiber.updateQueue?.memoCache?.data || []) {
      const scope = cache.find(value => value?.chain && value?.node && typeof value.get === 'function' && typeof value.set === 'function');
      if (!bindings.scope && scope) bindings.scope = scope;
    }
    if (!bindings.destination && props?.item?.id === 'builtin:orbit') bindings.destination = props.item;
    const value = props?.value;
    if (!bindings.destination) bindings.destination = value?.availableDestinations?.find(item => item.id === 'builtin:orbit');
    if (!bindings.intl && typeof value?.formatMessage === 'function') bindings.intl = value;
    if (!bindings.accountId && typeof value?.accountId === 'string') bindings.accountId = value.accountId;
    fiber = fiber.return;
  }
  return bindings;
}

function nativeIcon(icon) {
  if (typeof icon === 'string') return icon;
  if (typeof icon?.createElement === 'function') {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(new XMLSerializer().serializeToString(icon.createElement(document)));
  }
}

function nativeItems(items, intl) {
  return items.map(item => ({
    id: item.id,
    type: item.type === 'separator' || item.type === 'radio' ? item.type : undefined,
    checked: item.type === 'radio' ? item.checked === true : undefined,
    label: item.type === 'separator' ? '' :
      (item.type !== 'radio' && item.checked === true ? '✓ ' : '') +
      (item.nativeLabel ?? intl.formatMessage(item.message, item.messageValues)),
    icon: nativeIcon(item.nativeIcon ?? item.icon),
    accelerator: item.accelerator,
    enabled: item.type === 'label' ? false : item.enabled ?? true,
    toolTip: item.nativeTooltip,
    submenu: item.submenu ? nativeItems(item.submenu, intl) : undefined
  }));
}

function findAction(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.submenu && findAction(item.submenu, id);
    if (child) return child;
  }
}

let disposed = false, frame = 0, menuGeneration = 0;
let section, divider, pinnedButton, storageKey, destination;
let presentation = '';
let lastDot, dotSelectionPending=false, dotDeselected=false;
function setRailSelection(selection) {
  const rail=document.querySelector(railSelector);if(!rail)return;
  if(selection)rail.setAttribute('data-better-sidebar-selection',selection);else rail.removeAttribute('data-better-sidebar-selection');
}

function pinKey(bindings) {
  // Pin preferences follow the signed-in account, not the displayed dot name.
  return bindings.accountId ? `codexpp.better-sidebar.pin-orbit:${bindings.accountId}` : undefined;
}
function isPinned(key = storageKey) {
  return Boolean(key && localStorage.getItem(key) === 'true');
}
function setPinned(key, pinned) {
  if (pinned) localStorage.setItem(key, 'true');
  else localStorage.removeItem(key);
  refresh();
}
function removeSection() {
  section?.remove(); divider?.remove();
  section = divider = pinnedButton = projectDivider = undefined;
  presentation = '';
  cleanupTooltips();
}
// Project IDs, rather than names, own the pins and section membership.
let projectAccount, projectPins = [], projectSections = {}, focusedProject;
let previewProject, previewSeen=false, previewTimer;
function projectSidebarOpen(){
  const trigger=document.querySelector('[aria-controls="app-shell-sidebar"][aria-expanded]');
  return trigger?trigger.getAttribute('aria-expanded')==='true':Boolean(document.querySelector('[data-app-shell-sidebar-open="true"]'));
}
function clearProjectPreview(){
  clearTimeout(previewTimer);previewTimer=undefined;
  if(previewProject){previewProject=undefined;previewSeen=false;restoreProjectView();}
}
function commitProjectPreview(){
  const id=previewProject;if(!id)return;
  clearProjectPreview();setFocus(id);refresh();
}
function syncProjectPreview(){
  if(!previewProject)return;
  if(projectSidebarOpen()){commitProjectPreview();return;}
  if(document.querySelector('[data-slate-sidebar-peeking="true"]'))previewSeen=true;
  else if(previewSeen)clearProjectPreview();
}
function beginProjectPreview(id){
  if(projectSidebarOpen())return;
  if(previewProject!==id){clearProjectPreview();previewProject=id;}
  clearTimeout(previewTimer);previewTimer=undefined;refresh();
}
const projectBindings = new Map(), projectButtons = new Map();
const filteredNodes = new Set(), shortenedLabels = new Map(), brandedHeaders = new Map();
const initializedProjectSections = new Set();
let projectDivider, pendingSectionCreation, nativeProjectAPI, nativeProjectModule;
const projectKey = suffix => projectAccount ? `codexpp.better-sidebar.${suffix}:${projectAccount}` : undefined;
const sidebarLayoutGate='3085093835';
let sidebarStyleAdapter, sidebarStylePending=false;
const sidebarStyleKey=account=>account?`codexpp.better-sidebar.sidebar-style:${account}`:undefined;
function sidebarStyle(account=projectAccount){return readJSON(sidebarStyleKey(account),'latest')==='old'?'old':'latest';}
async function syncSidebarStyle(bindings){
  if(sidebarStylePending || !bindings.scope || !bindings.accountId)return;
  sidebarStylePending=true;
  try{
    const native=await loadProjectAPI();
    if(disposed || !native.UIt || !native.Tz)return;
    if(!sidebarStyleAdapter)sidebarStyleAdapter={scope:bindings.scope,native,original:bindings.scope.get(native.UIt,sidebarLayoutGate)};
    const adapter=sidebarStyleAdapter,desired=sidebarStyle(bindings.accountId)==='old'?false:adapter.original;
    if(adapter.scope.get(native.UIt,sidebarLayoutGate)!==desired){
      clearProjectPreview();restoreExplore();restoreProjectView();removeSection();
      adapter.scope.set(native.UIt,sidebarLayoutGate,desired);
    }
  }catch(error){api.log('Sidebar style unavailable:',error.message);}
  finally{sidebarStylePending=false;}
}
function sidebarStyleMenu(account){
  return {id:'codexpp-sidebar-style',nativeLabel:'Sidebar Style',submenu:['latest','old'].map(style=>({
    id:`codexpp-sidebar-style-${style}`,type:'radio',nativeLabel:style==='latest'?'Latest':'Old',checked:sidebarStyle(account)===style,
    onSelect:()=>{localStorage.setItem(sidebarStyleKey(account),JSON.stringify(style));refresh();}
  }))};
}
function readJSON(key, fallback) {
  try { return key ? JSON.parse(localStorage.getItem(key)) ?? fallback : fallback; }
  catch { return fallback; }
}
function projectRow(id) {
  const rows=[...document.querySelectorAll(projectRowSelector)].filter(row=>row.getAttribute('data-app-action-sidebar-project-id')===id);
  // A single native row needs no layout read. Only distinguish visibility when
  // the app mounts duplicate rows for the open sidebar and its preview.
  if(rows.length<2)return rows[0];
  return rows.find(row=>row.checkVisibility?.({visibilityProperty:true})!==false)||rows[0];
}
function syncProjects(bindings) {
  if (projectAccount !== bindings.accountId) {
    clearProjectPreview();restoreExplore();restoreProjectView(); projectBindings.clear(); projectButtons.clear();
    projectAccount = bindings.accountId;
    focusedProject = projectAccount ? sessionStorage.getItem(projectKey('focused-project')) : null;
  }
  const pins = readJSON(projectKey('pin-projects'), []);
  projectPins = Array.isArray(pins) ? pins.filter(pin => typeof pin?.id === 'string' && typeof pin?.title === 'string' && ['local','remote','chatgpt'].includes(pin.kind)).slice(0,200) : [];
  const sections = readJSON(projectKey('project-sections'), {});
  projectSections = sections && typeof sections === 'object' && !Array.isArray(sections) ? sections : {};
  for (const row of document.querySelectorAll(projectRowSelector)) {
    const id = row.getAttribute('data-app-action-sidebar-project-id');
    const native = appBindings(row);
    if (id && native.openProject && native.project) projectBindings.set(id, native);
  }
  let renamed = false;
  for (const pin of projectPins) {
    const title = projectRow(pin.id)?.getAttribute('data-app-action-sidebar-project-label');
    if (title && title !== pin.title) { pin.title = title; renamed = true; }
  }
  if (renamed) localStorage.setItem(projectKey('pin-projects'),JSON.stringify(projectPins));
  if (focusedProject && !projectPins.some(pin => pin.id === focusedProject)) setFocus(null);
}
function setFocus(id) {
  clearProjectPreview();
  dotSelectionPending=false;dotDeselected=true;
  setRailSelection(id?'project':undefined);
  if (id !== focusedProject) restoreProjectView();
  pendingSectionCreation = undefined;
  focusedProject = id;
  const key = projectKey('focused-project');
  if (key) { if (id) sessionStorage.setItem(key,id); else sessionStorage.removeItem(key); }
}
function setProjectPinned(row, bindings, pinned) {
  const id = row.getAttribute('data-app-action-sidebar-project-id');
  if (!id || !projectAccount) return;
  projectPins = projectPins.filter(pin => pin.id !== id);
  if (pinned) projectPins.push({id, title: row.getAttribute('data-app-action-sidebar-project-label') || bindings.project.label, kind:bindings.project.projectKind});
  localStorage.setItem(projectKey('pin-projects'),JSON.stringify(projectPins));
  if (!pinned && focusedProject === id) setFocus(null);
  refresh();
}
async function loadProjectAPI() {
  // Reviewed exports from this app's native section store and router.
  nativeProjectAPI ??= import('app://-/assets/app-shared-2f2228189a8d.js');
  const module = await nativeProjectAPI;
  if (typeof module.ER !== 'function' || !module.SR || !module.j0t) throw new Error('This app version does not expose the reviewed project section adapter.');
  if(!nativeProjectModule){nativeProjectModule=module;if(!disposed)refresh();}
  return module;
}
function projectBinding(id) {
  const bindings = {...projectBindings.get(id), ...appBindings(projectRow(id))};
  if (!bindings.scope) {
    for (const node of document.querySelectorAll('[data-app-action-sidebar-section], nav[role="navigation"], '+railSelector)) {
      const native = appBindings(node);
      if (native.scope && native.accountId === projectAccount) {bindings.scope=native.scope;bindings.accountId=native.accountId;break;}
    }
  }
  return bindings;
}
async function openPinnedProject(pin) {
  const row = projectRow(pin.id);
  const bindings = projectBinding(pin.id);
  if (!bindings.openProject && !bindings.scope) throw new Error('Project navigation is unavailable in this app window.');
  setFocus(pin.id);
  if (bindings.openProject) bindings.openProject();
  else {
    const native = await loadProjectAPI();
    bindings.scope.get(native.j0t).navigate('/',{state:{project:{type:pin.kind,projectId:pin.id}}});
  }
  // Expand the native project group so its chats are available in the view.
  if (row?.getAttribute('aria-expanded') === 'false') row.click();
  refresh();
}
function railButton(home) {
  const button = home.cloneNode(false);
  for (const attribute of [...button.attributes]) {
    if (!['type','class','data-color','data-variant','data-squircle','data-uniform','data-size','data-icon-size'].includes(attribute.name)) button.removeAttribute(attribute.name);
  }
  return button;
}
function renderProjectPins(home) {
  for (const [id,button] of projectButtons) if (!projectPins.some(pin=>pin.id===id) || button.parentElement !== section) {button.remove();projectButtons.delete(id);}
  if (isPinned() && projectPins.length) {
    if (!projectDivider?.isConnected) {
      projectDivider=document.createElement('div');
      projectDivider.dataset.betterSidebarProjectDivider='';
      projectDivider.className=divider.className;
      pinnedButton.after(projectDivider);
    }
  } else {projectDivider?.remove();projectDivider=undefined;}
  for (const pin of projectPins) {
    const row = projectRow(pin.id);
    const title = row?.getAttribute('data-app-action-sidebar-project-label') || pin.title;
    let button = projectButtons.get(pin.id);
    if (!button) {
      button = railButton(home); button.dataset.betterSidebarProject = pin.id;
      button.addEventListener('pointerenter',()=>beginProjectPreview(pin.id));
      button.addEventListener('pointerleave',()=>{
        clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(!document.querySelector('[data-slate-sidebar-peeking="true"]')){clearProjectPreview();refresh();}},350);
      });
      button.addEventListener('click',()=>{void openPinnedProject(pin).catch(error=>api.log(error.message));});
      section.append(button); projectButtons.set(pin.id,button);
    }
    button.setAttribute('data-slate-sidebar-peek-area','home');
    const productMode=home.getAttribute('data-slate-sidebar-peek-product-mode');
    if(productMode)button.setAttribute('data-slate-sidebar-peek-product-mode',productMode);else button.removeAttribute('data-slate-sidebar-peek-product-mode');
    const active = focusedProject === pin.id && home.getAttribute('aria-current') === 'page';
    // Activity renders flat rows, so the original project icon is temporarily
    // absent. Retain the rail icon until the native project row returns.
    const sourceIcon = row?.querySelector('[data-sidebar-project-drop-zone="project-icon"] > *') || button.firstElementChild?.firstElementChild;
    const fingerprint = JSON.stringify([title,sourceIcon?.outerHTML,active]);
    if (button.dataset.betterSidebarPresentation !== fingerprint) {
      const inner = document.createElement('span'); inner.className = home.firstElementChild?.className || '';
      if (sourceIcon) inner.append(sourceIcon.cloneNode(true));
      else inner.innerHTML='<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.7 6.5V15a2 2 0 0 0 2 2h10.6a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-5L8.7 3H4.7a2 2 0 0 0-2 2v1.5Z" stroke="currentColor" stroke-width="1.33"/></svg>';
      button.replaceChildren(inner); button.title=title; button.setAttribute('aria-label',title);
      if(active){button.setAttribute('data-selected','');button.setAttribute('aria-current','page');}
      else{button.removeAttribute('data-selected');button.removeAttribute('aria-current');}
      button.dataset.betterSidebarPresentation=fingerprint;
    }
    syncNativeTooltip(button,title,home,projectPins.indexOf(pin)<9?`⌘⇧${projectPins.indexOf(pin)+1}`:undefined);
  }
  cleanupTooltips();
}
const nativeTooltips=new Map();
async function syncNativeTooltip(button,label,home,shortcut) {
  const peekEnabled=button.hasAttribute('data-better-sidebar-project') && !projectSidebarOpen();
  let entry=nativeTooltips.get(button);
  if(entry?.root)button.removeAttribute('title');
  if(entry?.label===label && entry?.shortcut===shortcut && entry?.peekEnabled===peekEnabled)return;
  if(!entry){entry={label};nativeTooltips.set(button,entry);}else entry.label=label;
  entry.shortcut=shortcut;entry.peekEnabled=peekEnabled;
  try {
    const native=await loadProjectAPI();
    if(disposed || !button.isConnected || !native.PCn || !native.Dgn || !native.BO)return;
    const React=native.PCn();
    if(!entry.root){
      entry.host=document.createElement('div');entry.host.dataset.betterSidebarTooltip='';document.body.append(entry.host);
      entry.root=native.Dgn().createRoot(entry.host);
    }
    let content=React.createElement(native.BO,{tooltipContent:entry.label,shortcut:entry.shortcut,open:entry.peekEnabled?false:undefined,side:'right',closeOnTriggerClick:true,triggerElement:button});
    let fiber=home[Object.keys(home).find(key=>key.startsWith('__reactFiber$'))];
    while(fiber && fiber.type!==native.BO)fiber=fiber.return;
    for(let dependency=fiber?.dependencies?.firstContext;dependency;dependency=dependency.next) {
      if(dependency.context)content=React.createElement(dependency.context.Provider,{value:dependency.memoizedValue},content);
    }
    entry.root.render(content);
    button.removeAttribute('title');
  }catch(error){api.log('Native sidebar tooltip unavailable:',error.message);}
}
let homeOutline;
async function syncHomeOutline(home) {
  if(homeOutline?.home===home && homeOutline.host.isConnected)return;
  const icon=appBindings(home).navItem?.railIcons?.default;if(!icon)return;
  try {
    // Native icons expose a DOM factory; use it without depending on the
    // section-store module or its version-specific React exports.
    if(typeof icon.createElement==='function') {
      const glyph=icon.createElement(document);
      if(disposed || !home.isConnected || !glyph)return;
      homeOutline?.root?.unmount();homeOutline?.host.remove();
      const host=document.createElement('span');host.dataset.betterSidebarHomeOutline='';
      host.append(glyph);home.firstElementChild.append(host);homeOutline={home,host};
      return;
    }
    const native=await loadProjectAPI();
    if(disposed || !home.isConnected || !native.PCn || !native.Dgn)return;
    homeOutline?.root?.unmount();homeOutline?.host.remove();
    const React=native.PCn(),host=document.createElement('span');host.dataset.betterSidebarHomeOutline='';home.firstElementChild.append(host);
    const root=native.Dgn().createRoot(host);homeOutline={home,host,root};root.render(React.isValidElement(icon)?icon:React.createElement(icon));
  }catch(error){api.log('Native Home icon unavailable:',error.message);}
}
// Render the existing Explore popover and rows with local open state. The app's
// outer Explore controller uses shared navigation state, so mounting that outer
// controller twice would open two popovers at once.
function NativeExploreView({React,popover,extraItems,pinIcon}) {
    const [open,setOpen]=React.useState(false),contentRef=React.useRef(null);
    const originals=popover.props.children[0];
    const rows=originals.map(row=>{
      const group=row.props.children,select=group.props.children[0];
      return React.cloneElement(row,{children:React.cloneElement(group,{},[React.cloneElement(select,{key:'select',onClick:()=>{setOpen(false);select.props.onClick();}}),...group.props.children.slice(1)])});
    });
    const template=originals[0],group=template.props.children;
    for(const item of extraItems) {
      const [select,pinSlot,unread]=group.props.children,tooltip=pinSlot.props.children,pin=tooltip.props.children;
      const id=`better-sidebar-explore-${item.id}`;
      const icon=React.isValidElement(item.largeIcon)?item.largeIcon:React.createElement(item.largeIcon);
      const choose=React.cloneElement(select,{id,key:'select',ref:undefined,'aria-current':item.isCurrentDestination?'page':undefined,onClick:()=>{setOpen(false);item.onSelect();},onFocus:item.onPrefetch,onPointerEnter:item.onPrefetch,
        children:React.cloneElement(select.props.children,{leftIcon:icon,trailingContent:item.endContent,children:item.label})});
      const repin=React.cloneElement(pinSlot,{key:'pin',children:React.cloneElement(tooltip,{tooltipContent:'Pin to sidebar',children:React.cloneElement(pin,{ariaLabel:'Pin to sidebar',disabled:false,children:React.createElement(pinIcon),onClick:()=>setDestinationPinned(item.id,true)})})});
      const nativeGroup=React.cloneElement(group,{'aria-labelledby':id,children:[choose,repin,React.cloneElement(unread,{key:'unread',hasUnreadActivity:item.hasUnreadActivity})]});
      rows.push(React.cloneElement(template,{key:item.id,extraItems:item.contextMenuItems,getExtraItems:item.getContextMenuItems,children:nativeGroup}));
    }
    return React.createElement(popover.type,{...popover.props,contentRef,open,onOpenChange:setOpen,
      onOpenAutoFocus:()=>contentRef.current?.querySelector('button')?.focus(),
      onHoverKeyDown:undefined,trigger:React.cloneElement(popover.props.trigger,{onKeyDown:event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);}}}),children:[rows,...popover.props.children.slice(1)]});
}
let exploreRoot;
function hiddenDestinations() {
  const ids=readJSON(projectKey('hidden-destinations'),[]);
  if(!Array.isArray(ids))return [];
  // Space is now exposed as Library in newer app builds. Keep prior preferences.
  const spaceMoved=!document.querySelector(`${railSelector} button[data-sidebar-destination="builtin:space"]`) && document.querySelector(`${railSelector} button[data-sidebar-destination="builtin:library"]`);
  return [...new Set(ids.filter(id=>optionalDestinations.has(id)).map(id=>spaceMoved && id==='builtin:space'?'builtin:library':id))];
}
function setDestinationPinned(id,pinned) {
  const ids=hiddenDestinations().filter(value=>value!==id);
  if(!pinned)ids.push(id);
  localStorage.setItem(projectKey('hidden-destinations'),JSON.stringify(ids));
  refresh();
}
function restoreExplore() {
  exploreRoot?.root.unmount();exploreRoot?.host.remove();exploreRoot?.button.removeAttribute('data-better-sidebar-hidden');exploreRoot=undefined;
  document.querySelectorAll('[data-better-sidebar-unpinned-destination]').forEach(button=>{button.removeAttribute('data-better-sidebar-unpinned-destination');button.removeAttribute('data-better-sidebar-hidden');});
}
async function syncExplore(rail) {
  const ids=hiddenDestinations().filter(id=>rail.querySelector(`button[data-sidebar-destination="${id}"]`));
  if(!ids.length){if(exploreRoot)restoreExplore();return;}
  const button=[...rail.querySelectorAll('button[data-slot="popover-trigger"]:not([data-sidebar-destination])')].find(button=>button.querySelector(`path[d="${ellipsisDot}"]`));
  if(!button)return;
  let fiber=button[Object.keys(button).find(key=>key.startsWith('__reactFiber$'))];
  while(fiber && !(typeof fiber.type==='function' && Array.isArray(fiber.memoizedProps?.items)))fiber=fiber.return;
  if(!fiber)return; // Keep all destinations accessible when the native adapter changes.
  const sourceProps=fiber.memoizedProps,account=projectAccount;
  let popover=fiber.child;
  while(popover && !(popover.memoizedProps?.contentRef && popover.memoizedProps?.trigger && Array.isArray(popover.memoizedProps?.children?.[0])))popover=popover.child;
  if(!popover?.memoizedProps.children[0]?.length)return;
  const destinations=ids.map(id=>appBindings(rail.querySelector(`button[data-sidebar-destination="${id}"]`)).navItem).filter(Boolean);
  if(destinations.length!==ids.length)return;
  if(exploreRoot?.button===button && exploreRoot.props===sourceProps && exploreRoot.popoverProps===popover.memoizedProps && exploreRoot.ids===ids.join() && destinations.every((item,index)=>exploreRoot.items[index]===item))return;
  try {
    const native=await loadProjectAPI();
    if(disposed || account!==projectAccount || !button.isConnected || !native.PCn || !native.Dgn || !native.Prt)return;
    if(exploreRoot?.button!==button){restoreExplore();const host=document.createElement('div');host.dataset.betterSidebarExplore='';button.after(host);exploreRoot={button,host,root:native.Dgn().createRoot(host)};}
    const React=native.PCn();
    const items=destinations.map(item=>({...item,visibleByDefault:false,
      getContextMenuItems:async()=>[{id:'codexpp-better-sidebar-repin-destination',nativeLabel:'Pin to sidebar',message:{defaultMessage:'Pin to sidebar'},onSelect:()=>setDestinationPinned(item.id,true)},...(await item.getContextMenuItems?.()||item.contextMenuItems||[])],
      onSelect:(...args)=>{setFocus(null);restoreProjectView();item.onSelect(...args);refresh();}
    }));
    let content=React.createElement(NativeExploreView,{React,popover:{type:popover.type,props:popover.memoizedProps},extraItems:items,pinIcon:native.Prt});
    const contexts=new Set();
    // Preserve the native account, scope, localization and shared tooltip contexts.
    for(let ancestor=fiber;ancestor;ancestor=ancestor.return) {
      for(let dependency=ancestor.dependencies?.firstContext;dependency;dependency=dependency.next)if(dependency.context&&!contexts.has(dependency.context)){
        contexts.add(dependency.context);content=React.createElement(dependency.context.Provider,{value:dependency.memoizedValue},content);
      }
      const context=ancestor.tag===10?(ancestor.type?._context||ancestor.type):undefined;
      if(context?.Provider&&!contexts.has(context)){contexts.add(context);content=React.createElement(context.Provider,{value:ancestor.memoizedProps.value},content);}
    }
    exploreRoot.props=sourceProps;exploreRoot.popoverProps=popover.memoizedProps;exploreRoot.ids=ids.join();exploreRoot.items=destinations;exploreRoot.root.render(content);
    button.setAttribute('data-better-sidebar-hidden','');
    for(const id of ids){const destination=rail.querySelector(`button[data-sidebar-destination="${id}"]`);destination.setAttribute('data-better-sidebar-unpinned-destination','');destination.setAttribute('data-better-sidebar-hidden','');}
    for(const destination of rail.querySelectorAll('[data-better-sidebar-unpinned-destination]'))if(!ids.includes(destination.dataset.sidebarDestination)){destination.removeAttribute('data-better-sidebar-unpinned-destination');destination.removeAttribute('data-better-sidebar-hidden');}
  }catch(error){restoreExplore();api.log('Native Explore menu unavailable:',error.message);}
}
function cleanupTooltips() {
  for(const [button,entry] of nativeTooltips)if(disposed || !button.isConnected){entry.root?.unmount();entry.host?.remove();nativeTooltips.delete(button);}
}
function hideProjectNode(node) {if(!node.hasAttribute('data-better-sidebar-hidden'))node.setAttribute('data-better-sidebar-hidden','');filteredNodes.add(node);}
function showProjectNode(node) {if(node.hasAttribute('data-better-sidebar-hidden'))node.removeAttribute('data-better-sidebar-hidden');filteredNodes.delete(node);}
function setAttributeIfChanged(node,name,value) {if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
function filterProjectActivityGroups(list) {
  const groups=[...list.children].filter(node=>node.getAttribute('aria-hidden')!=='true');
  for(const [index,group] of groups.entries()) {
    const visible=[...group.querySelectorAll('[data-app-action-sidebar-thread-row]')].some(row=>!row.hasAttribute('data-better-sidebar-hidden'));
    // Keep the first heading's native Activity options and close controls.
    if(visible || index===0)showProjectNode(group);else hideProjectNode(group);
  }
  for(const spacer of [...list.children].filter(node=>node.getAttribute('aria-hidden')==='true')) {
    const before=spacer.previousElementSibling;
    const after=[...list.children].slice([...list.children].indexOf(spacer)+1).some(node=>node.getAttribute('aria-hidden')!=='true' && !node.hasAttribute('data-better-sidebar-hidden'));
    if(before && !before.hasAttribute('data-better-sidebar-hidden') && after)showProjectNode(spacer);else hideProjectNode(spacer);
  }
}
function restoreProjectView() {
  cleanupProjectPinControls();
  initializedProjectSections.clear();
  for(const node of filteredNodes)node.removeAttribute('data-better-sidebar-hidden'); filteredNodes.clear();
  for(const [node,original] of shortenedLabels)if(node.textContent===original.short)node.textContent=original.full;shortenedLabels.clear();
  for(const [button,original] of brandedHeaders) {
    button.querySelector('[data-better-sidebar-project-title]')?.remove();
    button.querySelector('[data-better-sidebar-project-brand]')?.removeAttribute('data-better-sidebar-project-brand');
    if(button.getAttribute('aria-label')===original.replacement)button.setAttribute('aria-label',original.label);
  }
  brandedHeaders.clear();
  document.querySelectorAll('[data-better-sidebar-inactive]').forEach(node=>node.removeAttribute('data-better-sidebar-inactive'));
  document.querySelectorAll('[data-better-sidebar-flat-project]').forEach(node=>node.removeAttribute('data-better-sidebar-flat-project'));
  document.querySelectorAll('[data-better-sidebar-project-pinned-section]').forEach(node=>node.removeAttribute('data-better-sidebar-project-pinned-section'));
  document.querySelectorAll('[data-better-sidebar-project-base]').forEach(node=>node.removeAttribute('data-better-sidebar-project-base'));

}
function focusProjectView(rail, home) {
  syncProjectPreview();
  const pin=projectPins.find(pin=>pin.id===(previewProject||focusedProject));
  if(!pin || (!previewProject && home.getAttribute('aria-current')!=='page')){if(filteredNodes.size||brandedHeaders.size)restoreProjectView();return;}
  const nav=[...document.querySelectorAll('nav[role="navigation"]')].find(nav=>nav!==rail && nav.querySelector('[data-app-action-sidebar-scroll]') && nav.checkVisibility?.({visibilityProperty:true})!==false);
  if(!nav)return;
  const activityList=nav.querySelector('[class~="@container/priority-list"]');
  const row=projectRow(pin.id), title=row?.getAttribute('data-app-action-sidebar-project-label')||pin.title;
  const sections=nativeProjectModule?projectBinding(pin.id).scope?.get(nativeProjectModule.SR):undefined;
  const sectionIDs=new Map();
  // Restore only on scope changes; compare each mutation to avoid observer loops.
  for(const node of [...filteredNodes])if(!node.isConnected){filteredNodes.delete(node);}
  for(const group of nav.querySelectorAll('[data-sidebar-project-container-id^="project:"][role="listitem"]')) {
    if(group.getAttribute('data-sidebar-project-container-id')!==`project:${pin.id}`)hideProjectNode(group);
    else {showProjectNode(group);setAttributeIfChanged(group,'data-better-sidebar-flat-project','');}
  }
  for(const nativeSection of nav.querySelectorAll('section[data-app-action-sidebar-section]')) {
    if(activityList?.contains(nativeSection))continue;
    const bindings=appBindings(nativeSection),id=bindings.sectionId;
    sectionIDs.set(nativeSection,id);
    const full=nativeSection.getAttribute('data-app-action-sidebar-section-heading')||'';
    const belongs=projectSections[id]?.projectId===pin.id || full.startsWith(`${title} » `);
    const projectPinned=belongs && (projectSections[id]?.kind==='pinned' || full===`${title} » Pinned`);
    const wrapper=nativeSection.closest('[data-sidebar-project-container-id^="custom:"]')||nativeSection;
    const sectionItems=projectPinned && nativeProjectModule?bindings.scope?.get(nativeProjectModule.SR):undefined;
    if(projectPinned && (sectionItems||sections)?.find(section=>section.id===id || section.name===full)?.itemKeys.length===0){hideProjectNode(wrapper);continue;}
    if(belongs && filteredNodes.has(wrapper)){wrapper.removeAttribute('data-better-sidebar-hidden');filteredNodes.delete(wrapper);}
    if(projectPinned)setAttributeIfChanged(wrapper,'data-better-sidebar-project-pinned-section','');
    let pinnedKeys=[];
    try {pinnedKeys=JSON.parse(nativeSection.closest('[data-pinned-content-tab-drop-keys]')?.getAttribute('data-pinned-content-tab-drop-keys')||'[]');}catch{}
    const targetGroup=pinnedKeys.includes(`codex:project:${pin.id}`) || pinnedKeys.includes(`chatgpt:project:${pin.id}`) || [...nativeSection.querySelectorAll('[data-sidebar-project-container-id]')].some(group=>group.getAttribute('data-sidebar-project-container-id')===`project:${pin.id}`);
    const baseSectionKey=`${pin.id}:${id||full}`;
    if(targetGroup && !initializedProjectSections.has(baseSectionKey)) {
      initializedProjectSections.add(baseSectionKey);
      if(nativeSection.getAttribute('data-app-action-sidebar-section-collapsed')==='true')nativeSection.querySelector('[data-app-action-sidebar-section-toggle]')?.click();
    }
    if(!belongs && !targetGroup)hideProjectNode(nativeSection);
    else {
      nativeSection.removeAttribute('data-better-sidebar-hidden');filteredNodes.delete(nativeSection);

      if(targetGroup && !belongs) {
        const label=nativeSection.querySelector('[data-app-action-sidebar-section-toggle] > span');
        if(label && label.textContent!=='Recents'){shortenedLabels.set(label,{full,short:'Recents'});label.textContent='Recents';}
      }
      if(belongs) {
        const label=nativeSection.querySelector('[data-app-action-sidebar-section-toggle] > span');
        const short=full.includes(' » ')?full.slice(full.indexOf(' » ')+3):full;
        if(label && label.textContent!==short){shortenedLabels.set(label,{full,short});label.textContent=short;}
      }
    }
  }
  // Hide unrelated loose chats and the project folder row, retaining its chat list.
  for(const thread of nav.querySelectorAll('[data-app-action-sidebar-thread-row]')) {
    const group=thread.closest('[data-sidebar-project-container-id^="project:"]');
    const nativeSection=thread.closest('section[data-app-action-sidebar-section]');
    const id=nativeSection && sectionIDs.get(nativeSection);
    const activityMatch=activityList?.contains(thread) && appBindings(thread).threadProjectId===pin.id;
    if(!activityMatch && group?.getAttribute('data-sidebar-project-container-id')!==`project:${pin.id}` && projectSections[id]?.projectId!==pin.id && !nativeSection?.getAttribute('data-app-action-sidebar-section-heading')?.startsWith(`${title} » `)){
      hideProjectNode(thread);
      if(activityList?.contains(thread)){const item=thread.closest('[role="listitem"]');if(item)hideProjectNode(item);}
      const wrapper=thread.closest('[class~="after:h-px"]');
      if(wrapper && !wrapper.querySelector(projectRowSelector))hideProjectNode(wrapper);
    }
    else{thread.removeAttribute('data-better-sidebar-hidden');filteredNodes.delete(thread);
      if(activityList?.contains(thread)){const item=thread.closest('[role="listitem"]');if(item)showProjectNode(item);}
      const wrapper=thread.closest('[class~="after:h-px"]');
      if(wrapper && filteredNodes.has(wrapper)){wrapper.removeAttribute('data-better-sidebar-hidden');filteredNodes.delete(wrapper);}
    }
  }
  if(activityList)filterProjectActivityGroups(activityList);
  for(const projectRow of nav.querySelectorAll(projectRowSelector)) {
    if(projectRow.getAttribute('data-app-action-sidebar-project-id')===pin.id && projectRow.getAttribute('aria-expanded')==='false')projectRow.click();
    hideProjectNode(projectRow);
  }
  const dot=nav.querySelector(orbitSelector);if(dot)hideProjectNode(dot);
  const button=nav.querySelector('button[aria-haspopup="menu"]');
  const brand=button?.querySelector('span[class*="font-openai-sans"]');
  if(brand) {
    if(!brandedHeaders.has(button))brandedHeaders.set(button,{label:button.getAttribute('aria-label'),replacement:`Switch mode, current project: ${title}`});
    setAttributeIfChanged(brand,'data-better-sidebar-project-brand','');
    let label=brand.querySelector('[data-better-sidebar-project-title]');
    if(!label){label=document.createElement('span');label.dataset.betterSidebarProjectTitle='';brand.append(label);}
    if(label.textContent!==title)label.textContent=title;
    const aria=`Switch mode, current project: ${title}`;brandedHeaders.get(button).replacement=aria;if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
  }
}

function projectThreadKey(row) {
  const id=row.getAttribute('data-app-action-sidebar-thread-id');
  if(!id)return;
  const kind=row.getAttribute('data-app-action-sidebar-thread-kind');
  return kind==='chatgpt'?`chatgpt:conversation:${id}`:`codex:thread:${id}`;
}
function pinnedProjectSection(pin,sections) {
  return sections.find(section=>projectSections[section.id]?.projectId===pin.id && projectSections[section.id]?.kind==='pinned') ||
    sections.find(section=>section.name===`${pin.title} » Pinned`);
}
async function projectThreadIsPinned(row) {
  const pin=projectPins.find(pin=>pin.id===focusedProject),key=projectThreadKey(row);
  if(!pin || !key)return false;
  const native=await loadProjectAPI(),bindings=projectBinding(pin.id);
  if(!bindings.scope)return false;
  const canonical=typeof native.cR==='function'?native.cR(bindings.scope,key):key;
  return pinnedProjectSection(pin,bindings.scope.get(native.SR))?.itemKeys.includes(canonical)===true;
}
async function setProjectThreadPinned(row,pinned) {
  const pin=projectPins.find(pin=>pin.id===focusedProject),key=projectThreadKey(row),account=projectAccount;
  if(!pin || !key)return;
  const native=await loadProjectAPI(),bindings=projectBinding(pin.id);
  if(disposed || focusedProject!==pin.id || account!==projectAccount || bindings.accountId!==account || !bindings.scope)return;
  if(typeof native.sR!=='function' || typeof native.uR!=='function' || typeof native.dR!=='function')throw new Error('Project pinning is unavailable in this app version.');
  const sections=bindings.scope.get(native.SR);
  const canonical=typeof native.cR==='function'?native.cR(bindings.scope,key):key;
  let section=pinnedProjectSection(pin,sections);
  if(pinned) {
    if(!section) {
      const id=native.sR(bindings.scope,`${pin.title} » Pinned`,[canonical]);
      if(!id)throw new Error('Could not create the project’s Pinned section.');
      section={id};
    } else if(!section.itemKeys.includes(canonical))native.uR(bindings.scope,section.id,canonical,section.itemKeys[0],{threadHostId:row.getAttribute('data-app-action-sidebar-thread-host-id')||undefined});
    projectSections[section.id]={projectId:pin.id,name:'Pinned',kind:'pinned'};
    localStorage.setItem(projectKey('project-sections'),JSON.stringify(projectSections));
  } else if(section?.itemKeys.includes(canonical))native.dR(bindings.scope,canonical,account);
  refresh();
}
async function projectThreadMenu(items,row) {
  if(!focusedProject || !row.matches('[data-app-action-sidebar-thread-row]') || !projectThreadKey(row))return items;
  const pinned=await projectThreadIsPinned(row);
  const original=items.find(item=>['pin-thread','unpin-thread','remove-from-section'].includes(item.id));
  const action={...original,id:pinned?'unpin-thread':'pin-thread',nativeLabel:pinned?'Unpin chat':'Pin chat',onSelect:()=>{void setProjectThreadPinned(row,!pinned).catch(error=>api.log(error.message));}};
  if(original)return items.flatMap(item=>item===original?[action]:['pin-thread','unpin-thread'].includes(item.id)||(pinned && item.id==='remove-from-section')?[]:[item]);
  return [action,{id:'codexpp-project-pin-separator',type:'separator'},...items];
}
function isNativePinControl(button) {
  let fiber=button?.[Object.keys(button).find(key=>key.startsWith('__reactFiber$'))];
  while(fiber) {
    if(fiber.memoizedProps?.pinAction?.ariaLabel===button.getAttribute('aria-label'))return true;
    if(typeof fiber.memoizedProps?.onPin==='function' && typeof fiber.memoizedProps?.onUnpin==='function' && typeof fiber.memoizedProps?.isPinned==='boolean')return true;
    if(fiber.memoizedProps?.['data-app-action-sidebar-thread-row']!==undefined)break;
    fiber=fiber.return;
  }
  return false;
}
const projectPinControls=new Map();
function cleanupProjectPinControls(all=true) {
  for(const [button,entry] of projectPinControls)if(all || !button.isConnected) {
    entry.root.unmount();entry.host.remove();button.removeAttribute('data-better-sidebar-hidden');projectPinControls.delete(button);
  }
}
async function syncProjectPinControls() {
  const id=focusedProject,account=projectAccount,pin=projectPins.find(pin=>pin.id===id);
  if(!pin){cleanupProjectPinControls();return;}
  try {
    const native=await loadProjectAPI(),bindings=projectBinding(id);
    if(!bindings.scope)return;
    const section=pinnedProjectSection(pin,bindings.scope.get(native.SR));
    const candidates=[];
    const removeLabel=bindings.intl?.formatMessage({id:'sidebarElectron.removeFromSection',defaultMessage:'Remove from section'});
    for(const row of document.querySelectorAll('[data-app-action-sidebar-thread-row]')) {
      // The project filter already marks excluded rows and their ancestors.
      // Pin actions do not need geometry; avoid forcing layout for every chat.
      if(row.closest('[data-better-sidebar-hidden],[hidden],[aria-hidden="true"]') || !projectThreadKey(row))continue;
      const key=typeof native.cR==='function'?native.cR(bindings.scope,projectThreadKey(row)):projectThreadKey(row);
      const pinned=section?.itemKeys.includes(key)===true;
      for(const button of row.querySelectorAll('button')) {
        if(button.closest('[data-better-sidebar-chat-pin]'))continue;
        if(isNativePinControl(button) || (pinned && button.getAttribute('aria-label')===removeLabel))candidates.push({row,button,pinned});
      }
    }
    cleanupProjectPinControls(false);
    if(!candidates.length || !native.PCn || !native.Dgn || !native.BO)return;
    if(disposed || focusedProject!==id || projectAccount!==account || !native.Prt || !native.Irt)return;
    const React=native.PCn();
    for(const {row,button,pinned} of candidates) {
      if(!button.isConnected)continue;
      let buttonFiber=button[Object.keys(button).find(key=>key.startsWith('__reactFiber$'))];
      while(buttonFiber && !(typeof buttonFiber.type==='function' && buttonFiber.memoizedProps?.color && buttonFiber.memoizedProps?.['aria-label']))buttonFiber=buttonFiber.return;
      if(!buttonFiber)continue;
      let entry=projectPinControls.get(button);
      if(!entry){const host=document.createElement('span');button.after(host);entry={host,root:native.Dgn().createRoot(host)};projectPinControls.set(button,entry);}
      if(entry.pinned!==pinned) {
        const change=pinned=>{void setProjectThreadPinned(row,pinned).catch(error=>api.log(error.message));};
        const label=pinned?'Unpin chat':'Pin chat';
        let content=React.createElement(native.BO,{tooltipContent:label,side:'top',closeOnTriggerClick:true,children:React.createElement(buttonFiber.type,{...buttonFiber.memoizedProps,'aria-label':label,onClick:event=>{event.stopPropagation();change(!pinned);},onPointerDown:event=>event.stopPropagation(),onKeyDown:event=>{if(['Enter',' '].includes(event.key))event.stopPropagation();},children:React.createElement(pinned?native.Irt:native.Prt)})});
        let fiber=button[Object.keys(button).find(key=>key.startsWith('__reactFiber$'))];
        while(fiber && fiber.type!==native.BO)fiber=fiber.return;
        for(let dependency=fiber?.dependencies?.firstContext;dependency;dependency=dependency.next)if(dependency.context)content=React.createElement(dependency.context.Provider,{value:dependency.memoizedValue},content);
        entry.root.render(content);
        entry.pinned=pinned;entry.host.dataset.betterSidebarChatPin=String(pinned);
      }
      button.setAttribute('data-better-sidebar-hidden','');
    }
  }catch(error){cleanupProjectPinControls();api.log('Project pin controls unavailable:',error.message);}
}
async function beginNativeSectionCreation(action) {
  const pin=projectPins.find(pin=>pin.id===focusedProject);
  if (!pin) return action();
  try {
    const native=await loadProjectAPI(), bindings=projectBinding(pin.id);
    if(disposed || focusedProject!==pin.id || bindings.accountId!==projectAccount || !bindings.scope) return;
    pendingSectionCreation={native,scope:bindings.scope,projectId:pin.id,title:pin.title,before:new Set(bindings.scope.get(native.SR).map(section=>section.id)),sawDialog:false};
    // The app owns the dialog, validation, create action and moving/unpinning chats.
    action();
  } catch(error) {api.log('Could not scope native section creation:',error);}
}
function reconcileNativeSectionCreation() {
  const pending=pendingSectionCreation;if(!pending)return;
  const sections=pending.scope.get(pending.native.SR);
  const created=sections.filter(section=>!pending.before.has(section.id));
  if(created.length) {
    pendingSectionCreation=undefined;
    for(const section of created) {
      const prefix=`${pending.title} » `;
      const name=section.name.startsWith(prefix)?section.name.slice(prefix.length):section.name;
      projectSections[section.id]={projectId:pending.projectId,name};
      if(!section.name.startsWith(prefix))pending.native.ER(pending.scope,section.id,prefix+name);
    }
    localStorage.setItem(projectKey('project-sections'),JSON.stringify(projectSections));
    return;
  }
  const dialog=document.querySelector('[role="dialog"]');
  if(dialog && !pending.sawDialog) {
    pending.sawDialog=true;
    dialog.querySelector('input')?.focus({preventScroll:true});
  }
  else if(pending.sawDialog&&!pending.submitted)pendingSectionCreation=undefined;
}

function refresh() {
  if (disposed) return;
  const rail = document.querySelector(railSelector);
  const row = document.querySelector(orbitSelector);
  if (!rail) {
    removeSection();restoreProjectView();
    const bindings=appBindings(document.querySelector('[data-app-action-sidebar-scroll]'));
    if(bindings.accountId)projectAccount=bindings.accountId;
    void syncSidebarStyle(bindings);return;
  }
  const bindings = appBindings(row || rail);
  const nextKey = pinKey(bindings);
  if (nextKey !== storageKey) { lastDot = undefined; destination = undefined; dotSelectionPending=false;dotDeselected=false; }
  storageKey = nextKey;
  syncProjects(bindings);
  void syncSidebarStyle(bindings.scope?bindings:{...bindings,...appBindings(rail)});
  setRailSelection(focusedProject?'project':isPinned() && !dotDeselected && (dotSelectionPending || row?.getAttribute('aria-current')==='page' && rail.querySelector('[data-sidebar-destination="builtin:home"]')?.getAttribute('aria-current')==='page')?'dot':undefined);
  void syncExplore(rail);
  reconcileNativeSectionCreation();
  if (bindings.destination) destination = bindings.destination;
  if (!isPinned() && !projectPins.length) { removeSection(); restoreProjectView(); return; }
  const home = rail.querySelector('button[data-sidebar-destination="builtin:home"]');
  const list = home?.parentElement?.parentElement;
  const existingDivider = list && [...list.children].find(node => node.classList.contains('border-t') && !node.hasAttribute('data-better-sidebar-divider'));
  const anchor = existingDivider || list?.querySelector(':scope > button[data-slot="popover-trigger"]');
  if (!list || !anchor) { removeSection(); return; }
  if (!section?.isConnected || section.parentElement !== list || section.nextElementSibling !== anchor) {
    removeSection();
    divider = document.createElement('div');
    divider.className = existingDivider?.className || 'w-6 border-t border-default browser:self-center browser:-my-1';
    divider.dataset.betterSidebarDivider = '';
    divider.setAttribute('aria-hidden', 'true');
    section = document.createElement('div');
    section.dataset.betterSidebarPins = '';
    pinnedButton = home.cloneNode(false);
    // Strip Home's accessibility, navigation, tooltip and selected state.
    for (const name of [...pinnedButton.attributes].map(attribute => attribute.name)) {
      if (!['type', 'class', 'data-color', 'data-variant', 'data-squircle', 'data-uniform', 'data-size', 'data-icon-size'].includes(name)) pinnedButton.removeAttribute(name);
    }
    pinnedButton.dataset.betterSidebarDot = '';
    pinnedButton.addEventListener('click', () => {
      setFocus(null);restoreProjectView();dotSelectionPending=true;dotDeselected=false;setRailSelection('dot');
      const source = document.querySelector(orbitSelector);
      if (source) source.click();
      else destination?.onSelect?.();
    });
    section.append(pinnedButton);
    list.insertBefore(divider, anchor);
    list.insertBefore(section, anchor);
  }
  if (row) lastDot = {
    label: row.querySelector('.text-fade-truncate')?.textContent?.trim() || 'Your dot',
    icon: row.querySelector('.icon-leading-slot > *')?.cloneNode(true)
  };
  const label = lastDot?.label || 'Your dot';
  const icon = lastDot?.icon;
  // The dot destination retains the last selected chat even on other pages.
  // Require the app's Home rail item to be current as well as the dot row.
  const active = !focusedProject && !dotDeselected && home.getAttribute('aria-current') === 'page' && row?.getAttribute('aria-current') === 'page';
  const next = JSON.stringify([label, icon?.outerHTML, active]);
  if (next !== presentation) {
    pinnedButton.replaceChildren();
    const inner = document.createElement('span');
    inner.className = home.firstElementChild?.className || '';
    if (icon) inner.append(icon.cloneNode(true));
    else {
      // The contextual row can be absent while another sidebar is open.
      inner.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.3" stroke="currentColor" stroke-width="1.33"/><circle cx="10" cy="10" r="2.94" stroke="currentColor" stroke-width="1.33"/></svg>';
    }
    pinnedButton.append(inner);
    pinnedButton.setAttribute('aria-label', label);
    pinnedButton.title = label;
    if (active) { pinnedButton.setAttribute('aria-current', 'page'); pinnedButton.setAttribute('data-selected', ''); }
    else { pinnedButton.removeAttribute('aria-current'); pinnedButton.removeAttribute('data-selected'); }
    presentation = next;
  }
  if (isPinned()) pinnedButton.removeAttribute('data-better-sidebar-hidden');
  else pinnedButton.setAttribute('data-better-sidebar-hidden','');
  syncNativeTooltip(pinnedButton,label,home);
  syncHomeOutline(home);
  const projectActive=Boolean(focusedProject && home.getAttribute('aria-current')==='page');
  if(active || projectActive || dotSelectionPending)home.setAttribute('data-better-sidebar-inactive','');else home.removeAttribute('data-better-sidebar-inactive');
  renderProjectPins(home);
  focusProjectView(rail,home);
  void syncProjectPinControls();
}

function scopeProjectMenu(items,row) {
  const pin=projectPins.find(pin=>pin.id===focusedProject);if(!pin)return items;
  const title=projectRow(pin.id)?.getAttribute('data-app-action-sidebar-project-label')||pin.title;
  return items.flatMap(item=>{
    const sectionId=item.id?.match(/(?:move-to-custom-section|custom-section):(.+)$/)?.[1];
    const name=item.messageValues?.name;
    if(sectionId && projectSections[sectionId]?.projectId!==pin.id && !name?.startsWith(`${title} » `))return [];
    let next={...item};
    if(sectionId && name?.includes(' » '))next.messageValues={...item.messageValues,name:name.slice(name.indexOf(' » ')+3)};
    if(['new-section','new-custom-section'].includes(item.id))next.onSelect=()=>beginNativeSectionCreation(item.onSelect);
    if(item.submenu)next.submenu=scopeProjectMenu(item.submenu,row);
    return [next];
  });
}

async function withNativeSectionCreation(items) {
  if(findAction(items,'new-section'))return items;
  for(const section of document.querySelectorAll('section[data-app-action-sidebar-section]')) {
    const bindings=appBindings(section.querySelector('button[aria-haspopup="menu"]')||section);
    if(!bindings.getItems)continue;
    const action=findAction(await bindings.getItems(),'new-section');
    if(action)return [...items,...(items.length?[{id:'codexpp-section-separator',type:'separator'}]:[]),action];
  }
  return items;
}
async function showMenu(event, row, bindings, pinnedOnly = false) {
  const generation = ++menuGeneration;
  const returnFocus = document.activeElement;
  try {
    const projectId = row.getAttribute('data-app-action-sidebar-project-id') || row.dataset.betterSidebarProject;
    if(projectId){
      const trigger=projectRow(projectId)?.querySelector('button[aria-haspopup="menu"]');
      const menu=appBindings(trigger);
      if(menu.getItems)bindings={...bindings,...menu};
    }
    if (bindings.getItems)await bindings.beforeMenu?.();
    let items = bindings.getItems ? await bindings.getItems() :
      bindings.navItem?.getContextMenuItems ? await bindings.navItem.getContextMenuItems() : bindings.navItem?.contextMenuItems || [];
    if (disposed || generation !== menuGeneration || !row.isConnected) return;
    const isDot = row.matches(orbitSelector) || row.hasAttribute('data-better-sidebar-dot');
    let action;
    if (projectId) {
      const pinned = projectPins.some(pin=>pin.id===projectId);
      action = {id:pinned?'codexpp-better-sidebar-unpin-project':'codexpp-better-sidebar-pin-project',nativeLabel:pinned?'Unpin from sidebar':'Pin to sidebar',onSelect:()=>{
        const source=projectRow(projectId);
        if(source)setProjectPinned(source,appBindings(source),!pinned);
        else if(pinned){projectPins=projectPins.filter(pin=>pin.id!==projectId);localStorage.setItem(projectKey('pin-projects'),JSON.stringify(projectPins));if(focusedProject===projectId)setFocus(null);refresh();}
      }};
    } else if(row.matches(optionalRailSelector) && bindings.navItem) {
      action={id:'codexpp-better-sidebar-unpin-destination',nativeLabel:'Unpin from sidebar',onSelect:()=>setDestinationPinned(bindings.navItem.id,false)};
    } else if(isDot) {
      const key=pinKey(bindings),pinned=isPinned(key);
      action={id:pinned?unpinAction:pinAction,nativeLabel:pinned?'Unpin from sidebar':'Pin to sidebar',onSelect:()=>setPinned(key,!pinned)};
    }
    if(focusedProject && row.matches('section[data-app-action-sidebar-section]'))items=await withNativeSectionCreation(items);
    if(focusedProject){items=scopeProjectMenu(items,row);items=await projectThreadMenu(items,row);}
    const augmented = action ? [action,...(items.length?[{id:'codexpp-pin-separator',type:'separator'},...items]:[])] : items;
    const rect = row.getBoundingClientRect();
    const position = event.type === 'contextmenu' ? {x: event.clientX, y: event.clientY} : {x: rect.left, y: rect.bottom};
    const result = await window.electronBridge.showContextMenu(nativeItems(augmented, bindings.intl), position);
    if (disposed || generation !== menuGeneration) return;
    const selected = findAction(augmented, result?.id);
    if (!['new-section','new-custom-section'].includes(selected?.id) && !selected?.selectAfterClose && returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    if (selected?.enabled !== false) selected?.onSelect?.();
  } catch (error) {
    api.log('Could not extend the sidebar menu:', error);
    // A changed app adapter still leaves the original row menu usable.
    if (!disposed && !pinnedOnly && row.isConnected) {
      const propsKey = Object.keys(row).find(key => key.startsWith('__reactProps$'));
      row[propsKey]?.onContextMenu?.({
        type: 'contextmenu', currentTarget: row, target: row,
        clientX: event.clientX, clientY: event.clientY,
        preventDefault() {}, stopPropagation() {}, defaultPrevented: false
      });
    }
  }
}
function interceptMenu(event) {
  const keyboard = event.type === 'keydown';
  if (keyboard && !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey))) return;
  const row = event.target.closest?.(`${orbitSelector}, ${projectRowSelector}, ${optionalRailSelector}, [data-better-sidebar-dot], [data-better-sidebar-project]${focusedProject?', [data-app-action-sidebar-thread-row], [data-app-action-sidebar-section]':''}`);
  if (!row || !window.electronBridge?.showContextMenu) return;
  const pinnedOnly = row.hasAttribute('data-better-sidebar-dot') || row.hasAttribute('data-better-sidebar-project');
  const bindings = appBindings(pinnedOnly ? (row.dataset.betterSidebarProject?projectRow(row.dataset.betterSidebarProject):document.querySelector(orbitSelector)) || document.querySelector(railSelector) : event.target);
  if (!pinKey(bindings) || !bindings.intl || (!pinnedOnly && !bindings.getItems && !row.matches(optionalRailSelector))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void showMenu(event, row, bindings, pinnedOnly);
}
function interceptSectionButton(event) {
  if(!focusedProject || (event.type==='pointerdown' && event.button!==0) || (event.type==='keydown' && !['Enter',' '].includes(event.key)))return;
  const button=event.target.closest?.('section[data-app-action-sidebar-section] [class~="group/nav-section-title"] button[aria-haspopup="menu"]');
  if(!button)return;
  const bindings=appBindings(button);
  if(!bindings.getItems || !bindings.intl || !window.electronBridge?.showContextMenu)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.type==='pointerdown' || event.type==='keydown' || event.detail===0)void showMenu(event,button.closest('section[data-app-action-sidebar-section]'),bindings);
}
api.on(document,'keydown',event=>{
  if(!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey || event.repeat || !/^Digit[1-9]$/.test(event.code))return;
  const pin=projectPins[Number(event.code.slice(5))-1];if(!pin)return;
  event.preventDefault();event.stopImmediatePropagation();void openPinnedProject(pin).catch(error=>api.log(error.message));
},true);
api.on(document,'pointerover',event=>{
  if(previewProject && event.target.closest?.(`${railSelector} button`) && !event.target.closest('[data-better-sidebar-project]')){clearProjectPreview();refresh();}
},true);
api.on(document,'pointerdown',event=>{
  if(previewProject && event.target.closest?.('[data-slate-sidebar-content]'))commitProjectPreview();
},true);
api.on(document,'pointerdown',interceptSectionButton,true);
api.on(document,'keydown',interceptSectionButton,true);
api.on(document,'click',interceptSectionButton,true);
function interceptEmptySidebar(event) {
  const target=event.target;
  const scroll=target.closest?.('[data-app-action-sidebar-scroll]');
  const rail=target.closest?.(railSelector);
  const surface=scroll||rail;
  if(!surface || target.closest('button,a,input,textarea,[role="button"],[data-app-action-sidebar-thread-row],[class~="group/nav-section-title"]'))return;
  const bindings=appBindings(rail||projectRow(focusedProject)||document.querySelector(orbitSelector)||scroll);
  if(!bindings.intl || !window.electronBridge?.showContextMenu)return;
  event.preventDefault();event.stopImmediatePropagation();
  void showMenu(event,surface,{...bindings,getItems:async()=>rail?[sidebarStyleMenu(bindings.accountId)]:[...await withNativeSectionCreation([]),{id:'codexpp-sidebar-style-separator',type:'separator'},sidebarStyleMenu(bindings.accountId)]});
}
api.on(document,'contextmenu',interceptEmptySidebar,true);
api.on(document, 'contextmenu', interceptMenu, true);
api.on(document, 'keydown', interceptMenu, true);
api.on(document,'click',event=>{
  const native=event.target.closest?.(`${railSelector} button[data-sidebar-destination]`);
  if(native){setFocus(null);restoreProjectView();refresh();}
  else if(event.target.closest?.(orbitSelector)){setFocus(null);dotSelectionPending=true;dotDeselected=false;setRailSelection('dot');}
},true);
api.on(document,'click',event=>{
  if(!focusedProject)return;
  const button=event.target.closest?.('button'),row=button?.closest('[data-app-action-sidebar-thread-row]');
  if(!row || !isNativePinControl(button))return;
  event.preventDefault();event.stopImmediatePropagation();
  void projectThreadIsPinned(row).then(pinned=>setProjectThreadPinned(row,!pinned)).catch(error=>api.log(error.message));
},true);
api.on(document,'submit',event=>{
  if(pendingSectionCreation && event.target.closest('[role="dialog"]'))pendingSectionCreation.submitted=true;
},true);
api.on(window, 'storage', event => { if (event.key === storageKey || event.key === projectKey('pin-projects') || event.key === projectKey('project-sections') || event.key === projectKey('hidden-destinations') || event.key === sidebarStyleKey(projectAccount)) refresh(); });
const sidebarSurfaceSelector=`${railSelector},nav[role="navigation"],${orbitSelector},[data-app-action-sidebar-scroll]`;
const managedSurfaceSelector='[data-better-sidebar-pins],[data-better-sidebar-divider],[data-better-sidebar-project-divider],[data-better-sidebar-tooltip],[data-better-sidebar-home-outline],[data-better-sidebar-chat-pin],[data-better-sidebar-explore],[data-better-sidebar-project-title]';
function sidebarMutationNeedsRefresh(record) {
  const element=record.target.nodeType===Node.ELEMENT_NODE?record.target:record.target.parentElement;
  if(!element || element.closest(managedSurfaceSelector))return false;
  if(record.type==='attributes' && ['data-slate-sidebar-peeking','data-app-shell-sidebar-open'].includes(record.attributeName))return true;
  if(record.type==='attributes' && record.attributeName==='aria-expanded' && element.matches('[aria-controls="app-shell-sidebar"]'))return true;
  if(pendingSectionCreation && element.closest('[role="dialog"]'))return true;
  if(element.closest(sidebarSurfaceSelector)) {
    if(element.closest('[data-app-action-sidebar-thread-row]') && (record.type==='characterData' || record.type==='childList' && [...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===Node.TEXT_NODE)))return false;
    const shortened=shortenedLabels.get(element);
    if(shortened && element.textContent===shortened.short)return false;
    if(record.type==='childList' && [...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===Node.ELEMENT_NODE && node.matches(managedSurfaceSelector)))return false;
    return true;
  }
  // Keep observing the root to notice native sidebar replacement, without
  // refreshing for streamed messages, browser content or unrelated controls.
  return record.type==='childList' && [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE && (node.matches(sidebarSurfaceSelector) || node.querySelector(sidebarSurfaceSelector) || pendingSectionCreation && (node.matches('[role="dialog"]') || node.querySelector('[role="dialog"]'))));
}
const observer = new MutationObserver(records => {
  if(!records.some(sidebarMutationNeedsRefresh))return;
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); });
});
observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'aria-current','data-slate-sidebar-peeking','data-app-shell-sidebar-open','aria-expanded']});
api.onCleanup(() => {
  disposed = true; ++menuGeneration;clearProjectPreview();
  if(sidebarStyleAdapter){const {scope,native,original}=sidebarStyleAdapter;scope.set(native.UIt,sidebarLayoutGate,original);sidebarStyleAdapter=undefined;}
  observer.disconnect(); cancelAnimationFrame(frame);
  setRailSelection(undefined);dotSelectionPending=false;removeSection();restoreExplore();restoreProjectView();pendingSectionCreation=undefined;projectButtons.clear();homeOutline?.root?.unmount();homeOutline?.host.remove();
});
refresh();
