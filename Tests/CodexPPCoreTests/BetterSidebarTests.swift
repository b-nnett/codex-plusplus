import XCTest
import WebKit

@MainActor
private final class SidebarNavigationWaiter: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Error>?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume(); continuation = nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error); continuation = nil
    }
}

final class BetterSidebarTests: XCTestCase {
    @MainActor private func evaluate(_ source: String, in view: WKWebView) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            view.evaluateJavaScript(source) { result, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: result as? String ?? "") }
            }
        }
    }
    @MainActor private func fixture(existingDivider: Bool, projects: Bool = false, trackFrames: Bool = false) async throws -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 600), configuration: config)
        let waiter = SidebarNavigationWaiter()
        view.navigationDelegate = waiter
        try await withCheckedThrowingContinuation { continuation in
            waiter.continuation = continuation
            view.loadHTMLString("""
            <nav data-app-navigation-rail="true"><div id="list">
            <div><button data-sidebar-destination="builtin:home" type="button"><span>Home</span></button></div>
            <button data-slot="popover-trigger">Explore</button>
            \(existingDivider ? "<div class='w-6 border-t border-default' id='native-divider'></div><div id='native-pins'>Projects</div>" : "")
            </div></nav>
            <button data-sidebar-destination="builtin:orbit"><span class="icon-leading-slot"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></span><span class="text-fade-truncate">gremlin</span></button>
            """, baseURL: URL(string: "https://sidebar.example.test"))
        }
        withExtendedLifetime(waiter) {}
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let runtime = try String(contentsOf: root.appendingPathComponent("Sources/CodexPP/Resources/runtime.js"), encoding: .utf8)
        let code = try String(contentsOf: root.appendingPathComponent("extensions/better-sidebar/index.js"), encoding: .utf8)
        let fixtureCode = projects ? code.replacingOccurrences(of: "import('app://-/assets/app-shared-2f2228189a8d.js')", with: "Promise.resolve(globalThis.testProjectAPI)") : code
        let package = String(decoding: try JSONSerialization.data(withJSONObject: [["id": "better-sidebar", "code": fixtureCode]]), as: UTF8.self)
        _ = try await evaluate("""
        globalThis.menuCalls = []; globalThis.originalActions = 0; globalThis.originalMenus = 0; globalThis.opens = 0;
        globalThis.selection = undefined;
        const row = document.querySelector('[data-sidebar-destination="builtin:orbit"]');
        const destination = {id:'builtin:orbit',onSelect:()=>opens++,isCurrentDestination:false};
        globalThis.auth = {accountId:'account-one'};
        const provider = {memoizedProps:{value:auth},return:{memoizedProps:{value:{formatMessage:(message, values)=>values?.action==='pause'?'Localized Pause':message.defaultMessage}},return:null}};
        globalThis.nativeItems = [{id:'pause-orbit',message:{defaultMessage:'{action, select, pause {Pause} other {Resume}}'},messageValues:{action:'pause'},accelerator:'Cmd+P',onSelect:()=>originalActions++}];
        row.__reactFiber$fixture = {memoizedProps:{item:destination,getItems:async()=>nativeItems},return:provider};
        document.querySelector('nav').__reactFiber$fixture = {memoizedProps:{value:{availableDestinations:[destination]}},return:provider};
        row.addEventListener('contextmenu',()=>originalMenus++);
        row.addEventListener('click',()=>opens++);
        window.electronBridge = {showContextMenu:async(items,position)=>{menuCalls.push({items,position});return {id:selection}}};
        \(projects ? Self.projectFixture : "")
        \(trackFrames ? "globalThis.rafCallbacks=[];globalThis.rafRequests=0;globalThis.requestAnimationFrame=callback=>{rafRequests++;rafCallbacks.push(callback);return rafRequests;};globalThis.cancelAnimationFrame=()=>{};" : "")
        \(runtime)
        globalThis.extensionPackage = \(package);
        void __codexPP.sync(extensionPackage);
        """, in: view)
        return view
    }

    private static let projectFixture = """
    globalThis.projectOpens=0;globalThis.createdSections=[];
    const sidebar=document.createElement('nav');sidebar.setAttribute('role','navigation');
    sidebar.innerHTML='<button aria-haspopup="menu" aria-label="Switch mode, current mode: Codex"><span class="font-openai-sans"><span>Codex</span></span></button><div data-app-action-sidebar-scroll><section data-app-action-sidebar-section data-app-action-sidebar-section-heading="Pinned"><div class="group/nav-section-title">Pinned</div><div data-sidebar-project-container-id="project:alpha" role="listitem"><div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="alpha" data-app-action-sidebar-project-label="Alpha" role="button" aria-expanded="true"><span data-sidebar-project-drop-zone="project-icon"><span>A</span></span></div><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:one">Alpha chat</div></div><div data-sidebar-project-container-id="project:beta" role="listitem"><div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="beta" data-app-action-sidebar-project-label="Beta" role="button"></div><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:two">Beta chat</div></div><div data-app-action-sidebar-thread-row>Unrelated chat</div></section><section data-app-action-sidebar-section data-app-action-sidebar-section-heading="Global"><button data-app-action-sidebar-section-toggle><span>Global</span></button></section></div>';
    document.body.append(sidebar);
    const looseThread=sidebar.querySelector('[data-app-action-sidebar-thread-row]:not([data-app-action-sidebar-thread-id])');
    globalThis.looseWrapper=document.createElement('div');looseWrapper.className='after:h-px';looseThread.before(looseWrapper);looseWrapper.append(looseThread);
    globalThis.alpha=sidebar.querySelector('[data-app-action-sidebar-project-id="alpha"]');
    globalThis.beta=sidebar.querySelector('[data-app-action-sidebar-project-id="beta"]');
    const fakeScope=globalThis.fixtureProjectScope={chain:{},node:{},get:()=>createdSections,set:()=>{}};
    for(const [projectRow,id,label] of [[alpha,'alpha','Alpha'],[beta,'beta','Beta']]) {
      projectRow.__reactFiber$fixture={memoizedProps:{group:{projectId:id,label,projectKind:'local'},selectAction:{onSelect:()=>{projectOpens++;document.querySelector('[data-sidebar-destination="builtin:home"]').setAttribute('aria-current','page');}},getItems:async()=>[{id:'pin-project',message:{defaultMessage:'Pin'},onSelect:()=>originalActions++},{id:'edit-project',message:{defaultMessage:'Edit'},onSelect:()=>originalActions++}]},dependencies:{firstContext:{memoizedValue:new Map(),next:null}},updateQueue:{memoCache:{data:[[fakeScope]]}},return:provider};
    }
    globalThis.testProjectAPI={SR:{},j0t:{},uR:(scope,id,key)=>{for(const section of createdSections)section.itemKeys=section.itemKeys.filter(item=>item!==key);createdSections.find(section=>section.id===id).itemKeys.unshift(key);},dR:(scope,key)=>{for(const section of createdSections)section.itemKeys=section.itemKeys.filter(item=>item!==key);},ER:(scope,id,name)=>{const stored=createdSections.find(s=>s.id===id);stored.name=name;const element=sidebar.querySelector('[data-section-id='+id+']');element.setAttribute('data-app-action-sidebar-section-heading',name);element.querySelector('span').textContent=name;},sR:(scope,name,itemKeys)=>{
      const id='section-'+(createdSections.length+1);createdSections.push({id,name,itemKeys});
      const section=document.createElement('section');section.setAttribute('data-section-id',id);section.setAttribute('data-app-action-sidebar-section','');section.setAttribute('data-app-action-sidebar-section-heading',name);section.innerHTML='<button data-app-action-sidebar-section-toggle><span></span></button>';
      section.querySelector('span').textContent=name;section.__reactFiber$fixture={memoizedProps:{sectionKey:'custom:'+id},return:provider};sidebar.querySelector('[data-app-action-sidebar-scroll]').append(section);return id;
    }};
    globalThis.nativeExpansions=0;
    const baseSection=sidebar.querySelector('section');baseSection.setAttribute('data-app-action-sidebar-section-collapsed','true');
    const nativeToggle=document.createElement('button');nativeToggle.setAttribute('data-app-action-sidebar-section-toggle','');nativeToggle.innerHTML='<span>Pinned</span>';nativeToggle.addEventListener('click',()=>{nativeExpansions++;baseSection.setAttribute('data-app-action-sidebar-section-collapsed',String(baseSection.getAttribute('data-app-action-sidebar-section-collapsed')!=='true'));});baseSection.prepend(nativeToggle);
    globalThis.nativeDialogs=0;
    globalThis.openNativeDialog=(itemKeys=[])=>{
      nativeDialogs++;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.dataset.nativeSectionDialog='';
      dialog.innerHTML='<form><input aria-label="Section name"><button type="submit">Create section</button></form>';document.body.append(dialog);
      dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();testProjectAPI.sR(fakeScope,dialog.querySelector('input').value,itemKeys);dialog.remove();});
    };
    sidebar.querySelector('section').__reactFiber$fixture={memoizedProps:{getItems:()=>[{id:'new-section',message:{defaultMessage:'New section'},onSelect:()=>openNativeDialog()}]},return:provider};
    """

    @MainActor func testProjectPinFocusNamespacedSectionsAndCleanup() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("""
        selection='codexpp-better-sidebar-pin-project';
        alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in: view)
        let menu = try await evaluate("String(menuCalls.at(-1).items[0].label==='Pin to sidebar' && menuCalls.at(-1).items[2].label==='Pin' && document.querySelectorAll('[data-better-sidebar-project]').length===1)", in: view)
        XCTAssertEqual(menu, "true")
        _ = try await evaluate("localStorage.setItem('codexpp.better-sidebar.pin-orbit:account-one','true');window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}))", in: view)
        let divider = try await evaluate("String(document.querySelector('[data-better-sidebar-dot]').nextElementSibling.hasAttribute('data-better-sidebar-project-divider') && document.querySelector('[data-better-sidebar-project-divider]').nextElementSibling.hasAttribute('data-better-sidebar-project'))", in: view)
        XCTAssertEqual(divider, "true")
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project]').click()", in: view)
        let focus = try await evaluate("""
        String(sidebar.querySelector('[data-app-action-sidebar-section-toggle] > span').textContent==='Recents' && nativeExpansions===1 && looseWrapper.hasAttribute('data-better-sidebar-hidden') && projectOpens===1 && document.querySelector('[data-sidebar-destination="builtin:home"]').hasAttribute('data-better-sidebar-inactive') && document.querySelector('[data-better-sidebar-project-title]').textContent==='Alpha' && beta.closest('[role=listitem]').hasAttribute('data-better-sidebar-hidden') && !alpha.closest('[role=listitem]').hasAttribute('data-better-sidebar-hidden') && document.querySelector('section[data-app-action-sidebar-section-heading="Global"]').hasAttribute('data-better-sidebar-hidden'));
        """, in: view)
        XCTAssertEqual(focus, "true")
        _ = try await evaluate("""
        selection='new-section';sidebar.querySelector('[data-app-action-sidebar-scroll]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in: view)
        _ = try await evaluate("""
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        const sectionInput=document.querySelector('[data-native-section-dialog] input');
        globalThis.nativeInputFocused=document.activeElement===sectionInput;
        const typing=new KeyboardEvent('keydown',{key:'i',bubbles:true,cancelable:true});sectionInput.dispatchEvent(typing);globalThis.nativeTypingAllowed=!typing.defaultPrevented;
        sectionInput.value='in-review';
        document.querySelector('[data-native-section-dialog] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        """, in: view)
        // The fixture has no visible window, so flush the observer's render
        // through the same refresh event used for cross-window store updates.
        _ = try await evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}))", in:view)
        let section = try await evaluate("""
        String(nativeInputFocused && nativeTypingAllowed && nativeDialogs===1 && !document.querySelector('[data-better-sidebar-project-controls]') && createdSections.length===1 && createdSections[0].name==='Alpha » in-review' && document.querySelector('section[data-app-action-sidebar-section-heading="Alpha » in-review"] span').textContent==='in-review' && JSON.parse(localStorage.getItem('codexpp.better-sidebar.project-sections:account-one'))[createdSections[0].id].projectId==='alpha');
        """, in: view)
        XCTAssertEqual(section, "true")
        _ = try await evaluate("""
        const thread=sidebar.querySelector('[data-app-action-sidebar-thread-id="local:one"]');
        thread.__reactFiber$fixture={memoizedProps:{getItems:()=>[{id:'move-to-custom-section',message:{defaultMessage:'Move to section'},submenu:[{id:'move-to-custom-section:section-1',message:{defaultMessage:'Alpha » in-review'},messageValues:{name:'Alpha » in-review'}},{id:'move-to-custom-section:other',message:{defaultMessage:'Beta » in-review'},messageValues:{name:'Beta » in-review'}},{id:'new-custom-section',message:{defaultMessage:'New section…'},onSelect:()=>openNativeDialog(['codex:thread:local:one'])}]}]},return:provider};
        selection='';thread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in: view)
        let filteredMenu = try await evaluate("String(menuCalls.at(-1).items.find(item=>item.id==='move-to-custom-section').submenu.length===2 && menuCalls.at(-1).items.find(item=>item.id==='move-to-custom-section').submenu[0].id==='move-to-custom-section:section-1')", in: view)
        XCTAssertEqual(filteredMenu, "true")
        _ = try await evaluate("""
        selection='new-custom-section';thread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in: view)
        _ = try await evaluate("""
        document.querySelector('[data-native-section-dialog] input').value='ready';
        document.querySelector('[data-native-section-dialog] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        """, in: view)
        // The fixture has no visible window, so flush the observer's render
        // through the same refresh event used for cross-window store updates.
        _ = try await evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}))", in:view)
        let chatSection = try await evaluate("String(createdSections[1].name==='Alpha » ready' && createdSections[1].itemKeys[0]==='codex:thread:local:one')", in: view)
        XCTAssertEqual(chatSection, "true")
        _ = try await evaluate("""
        document.querySelector('[data-sidebar-destination="builtin:home"]').click();
        """, in: view)
        let restored = try await evaluate(#"String(!document.querySelector('[data-better-sidebar-hidden]:not([data-better-sidebar-dot])') && !document.querySelector('[data-better-sidebar-project-title]') && document.querySelector('section[data-app-action-sidebar-section-heading="Alpha » in-review"] span').textContent==='Alpha » in-review')"#, in: view)
        XCTAssertEqual(restored, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
        let cleanup = try await evaluate(#"String(!document.querySelector('[data-better-sidebar-project]') && !document.querySelector('[data-better-sidebar-project-controls]') && !document.querySelector('[data-better-sidebar-hidden]') && document.querySelector('section[data-app-action-sidebar-section-heading="Alpha » in-review"] span').textContent==='Alpha » in-review')"#, in: view)
        XCTAssertEqual(cleanup, "true")
    }

    @MainActor func testProjectChatPinsUseSeparateNativeSectionsWithoutGlobalPinActions() async throws {
        let view = try await fixture(existingDivider:false, projects:true)
        _ = try await evaluate("""
        globalThis.globalPinActions=0;
        const alphaThread=sidebar.querySelector('[data-app-action-sidebar-thread-id="local:one"]');
        const betaThread=sidebar.querySelector('[data-app-action-sidebar-thread-id="local:two"]');
        for(const thread of [alphaThread,betaThread])thread.__reactFiber$fixture={memoizedProps:{getItems:()=>[{id:'unpin-thread',message:{defaultMessage:'Unpin chat'},onSelect:()=>globalPinActions++}]},return:provider};
        selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        _ = try await evaluate("beta.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("""
        document.querySelector('[data-better-sidebar-project=alpha]').click();
        const inlinePin=document.createElement('button');inlinePin.setAttribute('aria-label','Unpin chat');alphaThread.append(inlinePin);
        inlinePin.__reactFiber$fixture={memoizedProps:{pinAction:{ariaLabel:'Unpin chat',isPinned:true,onClick:()=>globalPinActions++}},return:alphaThread.__reactFiber$fixture};
        inlinePin.addEventListener('click',()=>globalPinActions++);inlinePin.click();
        """, in:view)
        _ = try await evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}))", in:view)
        let alphaPin = try await evaluate(#"String(globalPinActions===0 && createdSections.length===1 && createdSections[0].name==='Alpha » Pinned' && createdSections[0].itemKeys[0]==='codex:thread:local:one' && sidebar.querySelector('[data-app-action-sidebar-section-heading="Alpha » Pinned"] span').textContent==='Pinned' && JSON.parse(localStorage.getItem('codexpp.better-sidebar.project-sections:account-one'))[createdSections[0].id].kind==='pinned')"#, in:view)
        XCTAssertEqual(alphaPin,"true")
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=beta]').click();selection='pin-thread';betaThread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let betaPin = try await evaluate(#"String(globalPinActions===0 && createdSections.length===2 && createdSections[1].name==='Beta » Pinned' && createdSections[1].itemKeys[0]==='codex:thread:local:two' && sidebar.querySelector('[data-app-action-sidebar-section-heading="Alpha » Pinned"]').hasAttribute('data-better-sidebar-hidden'))"#, in:view)
        XCTAssertEqual(betaPin,"true")
        _ = try await evaluate("""
        sidebar.querySelector('[data-app-action-sidebar-section-heading="Beta » Pinned"]').__reactFiber$fixture.memoizedProps.sectionKey='custom:migrated-beta';
        selection='unpin-thread';betaThread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        let unpinned = try await evaluate("String(globalPinActions===0 && createdSections[1].itemKeys.length===0 && sidebar.querySelector('[data-app-action-sidebar-section-heading=\"Beta » Pinned\"]').hasAttribute('data-better-sidebar-hidden') && createdSections[0].itemKeys[0]==='codex:thread:local:one')", in:view)
        XCTAssertEqual(unpinned,"true")
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click();selection='unpin-thread';alphaThread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let reused = try await evaluate("String(createdSections.length===2 && createdSections[0].itemKeys.length===0 && globalPinActions===0)", in:view)
        XCTAssertEqual(reused,"true")
        _ = try await evaluate("selection='pin-thread';alphaThread.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let repinned = try await evaluate("String(createdSections.length===2 && createdSections[0].itemKeys[0]==='codex:thread:local:one' && !sidebar.querySelector('[data-app-action-sidebar-section-heading=\"Alpha » Pinned\"]').hasAttribute('data-better-sidebar-hidden') && globalPinActions===0)", in:view)
        XCTAssertEqual(repinned,"true")
        _ = try await evaluate("void __codexPP.sync([])", in:view)
    }

    @MainActor func testHomeOutlineUsesNativeDOMFactoryWithoutReactExports() async throws {
        let view = try await fixture(existingDivider:false, projects:true)
        _ = try await evaluate("""
        const home=document.querySelector('[data-sidebar-destination="builtin:home"]');
        home.firstElementChild.innerHTML='<svg data-native-home></svg>';
        const icon=()=>{};icon.createElement=doc=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('data-native-outline','');return svg;};
        home.__reactFiber$fixture={memoizedProps:{item:{id:'builtin:home',railIcons:{default:icon}}},return:null};
        selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click()", in:view)
        let outlined = try await evaluate("String(!!home.querySelector('[data-better-sidebar-home-outline] [data-native-outline]') && getComputedStyle(home.querySelector('[data-native-home]')).display==='none')", in:view)
        XCTAssertEqual(outlined,"true")
        _ = try await evaluate("void __codexPP.sync([])", in:view)
        let cleaned = try await evaluate("String(!home.querySelector('[data-better-sidebar-home-outline]') && getComputedStyle(home.querySelector('[data-native-home]')).display!=='none')", in:view)
        XCTAssertEqual(cleaned,"true")
    }

    @MainActor func testProjectSelectionKeepsHomeInactiveDuringNativeButtonReplacement() async throws {
        let view = try await fixture(existingDivider:false, projects:true)
        _ = try await evaluate("""
        const theme=document.createElement('style');theme.textContent=':root {--color-text-tertiary:rgb(150,150,150)} button[data-selected] {color:rgb(255,255,255)}';document.head.append(theme);
        const originalHome=document.querySelector('[data-sidebar-destination="builtin:home"]');originalHome.setAttribute('data-selected','');originalHome.firstElementChild.innerHTML='<svg data-native-home></svg>';
        selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click()", in:view)
        let selection = try await evaluate("String(document.querySelector('[data-app-navigation-rail]').dataset.betterSidebarSelection==='project' && getComputedStyle(originalHome).color==='rgb(150, 150, 150)')", in:view)
        XCTAssertEqual(selection,"true")
        // Native React replaces the Home button before the observer refreshes.
        // The rail marker must keep its selected glyph and hue suppressed now.
        let replacement = try await evaluate("""
        const replacementHome=originalHome.cloneNode(true);replacementHome.removeAttribute('data-better-sidebar-inactive');originalHome.replaceWith(replacementHome);
        String(getComputedStyle(replacementHome).color==='rgb(150, 150, 150)' && getComputedStyle(replacementHome.querySelector('[data-native-home]')).display!=='none');
        """, in:view)
        XCTAssertEqual(replacement,"true")
        let outline = try await evaluate("""
        const outlineHost=document.createElement('span');outlineHost.dataset.betterSidebarHomeOutline='';replacementHome.firstElementChild.append(outlineHost);
        const pendingVisible=getComputedStyle(replacementHome.querySelector('[data-native-home]')).display!=='none';
        outlineHost.innerHTML='<svg data-outline-home></svg>';
        String(pendingVisible && getComputedStyle(replacementHome.querySelector('[data-native-home]')).display==='none' && getComputedStyle(outlineHost).display==='contents');
        """, in:view)
        XCTAssertEqual(outline,"true")
        _ = try await evaluate("replacementHome.click()", in:view)
        let home = try await evaluate("String(!document.querySelector('[data-app-navigation-rail]').hasAttribute('data-better-sidebar-selection') && getComputedStyle(replacementHome).color==='rgb(255, 255, 255)' && getComputedStyle(replacementHome.querySelector('[data-native-home]')).display!=='none')", in:view)
        XCTAssertEqual(home,"true")
        _ = try await evaluate("void __codexPP.sync([])", in:view)
    }

    @MainActor func testProjectShortcutsAndPinnedNativeEditMenu() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("""
        selection='codexpp-better-sidebar-pin-project';
        alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        _ = try await evaluate("beta.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("""
        const second=new KeyboardEvent('keydown',{key:'@',code:'Digit2',metaKey:true,shiftKey:true,bubbles:true,cancelable:true});document.dispatchEvent(second);
        globalThis.secondConsumed=second.defaultPrevented;
        """, in:view)
        let second = try await evaluate("String(secondConsumed && projectOpens===1 && document.querySelector('[data-better-sidebar-project=beta]').getAttribute('aria-current')==='page' && !document.querySelector('[data-better-sidebar-project=alpha]').hasAttribute('aria-current'))", in:view)
        XCTAssertEqual(second,"true")
        _ = try await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'!',code:'Digit1',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))", in:view)
        let first = try await evaluate("String(projectOpens===2 && document.querySelector('[data-better-sidebar-project=alpha]').getAttribute('aria-current')==='page' && !document.querySelector('[data-better-sidebar-project=beta]').hasAttribute('aria-current'))", in:view)
        XCTAssertEqual(first,"true")
        _ = try await evaluate("""
        const projectActions=document.createElement('button');projectActions.setAttribute('aria-haspopup','menu');alpha.append(projectActions);
        const originalMenu=alpha.__reactFiber$fixture.memoizedProps.getItems;
        alpha.__reactFiber$fixture.memoizedProps.getItems=async()=>[];
        projectActions.__reactFiber$fixture={memoizedProps:{getItems:originalMenu,onBeforeOpen:()=>{globalThis.projectMenuPrepared=true;}},return:alpha.__reactFiber$fixture};
        selection='edit-project';document.querySelector('[data-better-sidebar-project=alpha]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        let edit = try await evaluate("String(menuCalls.at(-1).items.some(item=>item.label==='Edit') && projectMenuPrepared && originalActions===1)", in:view)
        XCTAssertEqual(edit,"true")
        _ = try await evaluate("""
        const unassigned=new KeyboardEvent('keydown',{key:'#',code:'Digit3',metaKey:true,shiftKey:true,bubbles:true,cancelable:true});document.dispatchEvent(unassigned);
        globalThis.unassignedConsumed=unassigned.defaultPrevented;
        void __codexPP.sync([]);
        """, in:view)
        let unassigned = try await evaluate("String(!unassignedConsumed && projectOpens===2)", in:view)
        XCTAssertEqual(unassigned,"true")
    }

    @MainActor func testProjectHoverUsesNativePeekWithoutChangingSelectionAndPromotesOnOpen() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("beta.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=beta]').click()", in:view)
        _ = try await evaluate("""
        document.body.dataset.appShellSidebarOpen='true';
        globalThis.sidebarTrigger=document.createElement('button');sidebarTrigger.setAttribute('aria-controls','app-shell-sidebar');sidebarTrigger.setAttribute('aria-expanded','false');document.body.append(sidebarTrigger);
        document.querySelector('[data-better-sidebar-project=alpha]').dispatchEvent(new Event('pointerenter'));
        document.body.dataset.slateSidebarPeeking='true';
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let preview = try await evaluate("String(document.querySelector('[data-better-sidebar-project=alpha]').dataset.slateSidebarPeekArea==='home' && document.querySelector('[data-better-sidebar-project-title]').textContent==='Alpha' && document.querySelector('[data-better-sidebar-project=beta]').getAttribute('aria-current')==='page' && sessionStorage.getItem('codexpp.better-sidebar.focused-project:account-one')==='beta' && projectOpens===1)", in:view)
        XCTAssertEqual(preview,"true")
        _ = try await evaluate("""
        document.body.dataset.slateSidebarPeeking='false';
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let restored = try await evaluate("String(document.querySelector('[data-better-sidebar-project-title]').textContent==='Beta' && projectOpens===1)", in:view)
        XCTAssertEqual(restored,"true")
        _ = try await evaluate("""
        document.querySelector('[data-better-sidebar-project=alpha]').dispatchEvent(new Event('pointerenter'));
        document.body.dataset.slateSidebarPeeking='true';
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        sidebarTrigger.setAttribute('aria-expanded','true');
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let opened = try await evaluate("String(document.querySelector('[data-better-sidebar-project-title]').textContent==='Alpha' && document.querySelector('[data-better-sidebar-project=alpha]').getAttribute('aria-current')==='page' && sessionStorage.getItem('codexpp.better-sidebar.focused-project:account-one')==='alpha' && projectOpens===1)", in:view)
        XCTAssertEqual(opened,"true")
    }

    @MainActor func testSidebarObserverIgnoresResizeAndUnrelatedRenderingButTracksNativeChanges() async throws {
        let view = try await fixture(existingDivider:false,projects:true,trackFrames:true)
        _ = try await evaluate("selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click();rafCallbacks.splice(0).forEach(callback=>callback());", in:view)
        _ = try await evaluate("""
        rafCallbacks.splice(0).forEach(callback=>callback());globalThis.beforeResizeFrames=rafRequests;
        globalThis.visibilityReads=0;
        const nativeVisibility=Element.prototype.checkVisibility;
        Element.prototype.checkVisibility=function(...args){visibilityReads++;return nativeVisibility.apply(this,args);};
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let layoutReads = try await evaluate("String(visibilityReads<=1)", in:view)
        XCTAssertEqual(layoutReads,"true")
        _ = try await evaluate("""
        const main=document.createElement('main');main.innerHTML='<p>Streaming message</p>';document.body.append(main);
        for(let width=250;width<300;width++) {
          sidebar.style.width=width+'px';
          main.querySelector('p').textContent='Streaming message '+width;
          main.setAttribute('aria-expanded',String(width%2===0));
          sidebar.querySelector('[data-app-action-sidebar-thread-row]').firstChild.data='Streaming chat preview '+width;
          document.querySelector('[data-better-sidebar-project=alpha] span').textContent='Updated extension icon';
        }
        """, in:view)
        let ignored = try await evaluate("String(rafRequests===beforeResizeFrames && rafCallbacks.length===0)", in:view)
        XCTAssertEqual(ignored,"true")
        _ = try await evaluate("alpha.querySelector('[data-sidebar-project-drop-zone] span').textContent='New native icon';", in:view)
        let nativeRefresh = try await evaluate("String(rafRequests===beforeResizeFrames+1 && rafCallbacks.length===1)", in:view)
        XCTAssertEqual(nativeRefresh,"true")
        _ = try await evaluate("rafCallbacks.splice(0).forEach(callback=>callback());", in:view)
        let icon = try await evaluate("String(document.querySelector('[data-better-sidebar-project=alpha]').textContent==='New native icon' && rafCallbacks.length===0)", in:view)
        XCTAssertEqual(icon,"true")
    }

    @MainActor func testProjectActivityFiltersNativeProjectIDsAndRestoresOnHome() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("beta.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click()", in:view)
        _ = try await evaluate("""
        const scroll=sidebar.querySelector('[data-app-action-sidebar-scroll]');
        scroll.innerHTML='<div class="@container/priority-list" role="list"><div id="priority"><button id="activity-options">Activity options</button><div role="listitem"><div id="alpha-priority" data-app-action-sidebar-thread-row>Alpha priority</div></div><div role="listitem"><div id="beta-priority" data-app-action-sidebar-thread-row>Beta priority</div></div></div><div id="activity-gap" aria-hidden="true"></div><div id="today"><h3>Today</h3><div role="listitem"><div id="alpha-recent" data-app-action-sidebar-thread-row>Alpha recent</div></div><div role="listitem"><div id="unknown-recent" data-app-action-sidebar-thread-row>Unknown project</div></div></div><div id="empty-gap" aria-hidden="true"></div><div id="yesterday"><h3>Yesterday</h3><div role="listitem"><div id="beta-recent" data-app-action-sidebar-thread-row>Beta recent</div></div></div></div>';
        for(const [id,projectID,prop] of [['alpha-priority','alpha','hoverCardProjectId'],['alpha-recent','alpha','projectGroup'],['beta-priority','beta','chatGptProjectId'],['beta-recent','beta','hoverCardProjectId']]) {
          document.getElementById(id).__reactFiber$fixture={memoizedProps:{[prop]:prop==='projectGroup'?{projectId:projectID}:projectID,isPriorityView:true},return:provider};
        }
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let alphaView = try await evaluate("String(!document.getElementById('alpha-priority').closest('[data-better-sidebar-hidden]') && !document.getElementById('alpha-recent').closest('[data-better-sidebar-hidden]') && !!document.getElementById('beta-priority').closest('[data-better-sidebar-hidden]') && !!document.getElementById('unknown-recent').closest('[data-better-sidebar-hidden]') && document.getElementById('yesterday').hasAttribute('data-better-sidebar-hidden') && document.getElementById('empty-gap').hasAttribute('data-better-sidebar-hidden') && !document.getElementById('activity-options').closest('[data-better-sidebar-hidden]'))", in:view)
        XCTAssertEqual(alphaView,"true")
        let projectIcon = try await evaluate("String(document.querySelector('[data-better-sidebar-project=alpha]').textContent==='A' && document.querySelector('[data-better-sidebar-project=alpha]').getAttribute('aria-current')==='page')", in:view)
        XCTAssertEqual(projectIcon,"true")
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=beta]').click()", in:view)
        let betaView = try await evaluate("String(!document.getElementById('beta-priority').closest('[data-better-sidebar-hidden]') && !document.getElementById('beta-recent').closest('[data-better-sidebar-hidden]') && !!document.getElementById('alpha-priority').closest('[data-better-sidebar-hidden]') && document.getElementById('today').hasAttribute('data-better-sidebar-hidden'))", in:view)
        XCTAssertEqual(betaView,"true")
        _ = try await evaluate("document.querySelector('[data-sidebar-destination=\"builtin:home\"]').click()", in:view)
        let restored = try await evaluate("String(!sidebar.querySelector('[data-better-sidebar-hidden]'))", in:view)
        XCTAssertEqual(restored,"true")
    }

    @MainActor func testProjectRecentsRemainsCollapsedAcrossRefreshes() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("selection='codexpp-better-sidebar-pin-project';alpha.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("document.querySelector('[data-better-sidebar-project=alpha]').click()", in:view)
        let expanded = try await evaluate("String(nativeExpansions===1 && baseSection.getAttribute('data-app-action-sidebar-section-collapsed')==='false')", in:view)
        XCTAssertEqual(expanded,"true")
        _ = try await evaluate("""
        nativeToggle.click();
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}));
        """, in:view)
        let collapsed = try await evaluate("String(nativeExpansions===2 && baseSection.getAttribute('data-app-action-sidebar-section-collapsed')==='true' && !baseSection.hasAttribute('data-better-sidebar-hidden'))", in:view)
        XCTAssertEqual(collapsed,"true")
        _ = try await evaluate("nativeToggle.click();window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.project-sections:account-one'}))", in:view)
        let reopened = try await evaluate("String(nativeExpansions===3 && baseSection.getAttribute('data-app-action-sidebar-section-collapsed')==='false')", in:view)
        XCTAssertEqual(reopened,"true")
    }

    @MainActor func testSidebarStyleMenuUsesNativeLayoutGatePersistsAndRestoresOnCleanup() async throws {
        let view = try await fixture(existingDivider: false, projects: true)
        _ = try await evaluate("""
        globalThis.layoutGate=true;
        testProjectAPI.UIt={};testProjectAPI.Tz={};
        const originalGet=fixtureProjectScope.get;
        fixtureProjectScope.get=(atom,key)=>atom===testProjectAPI.UIt||atom===testProjectAPI.Tz?layoutGate:originalGet(atom,key);
        fixtureProjectScope.set=(atom,key,value)=>{if(atom===testProjectAPI.UIt)layoutGate=value;};
        document.querySelector('[data-app-navigation-rail]').__reactFiber$fixture={memoizedProps:{},updateQueue:{memoCache:{data:[[fixtureProjectScope]]}},return:provider};
        const scroll=document.querySelector('[data-app-action-sidebar-scroll]');
        scroll.__reactFiber$fixture={memoizedProps:{},updateQueue:{memoCache:{data:[[fixtureProjectScope]]}},return:provider};
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-projects:account-one'}));
        """, in:view)
        _ = try await evaluate("selection='codexpp-sidebar-style-old';document.querySelector('[data-app-navigation-rail]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let railMenu = try await evaluate("String(menuCalls.at(-1).items.length===1 && menuCalls.at(-1).items[0].label==='Sidebar Style')", in:view)
        XCTAssertEqual(railMenu,"true")
        let old = try await evaluate("String(!layoutGate && JSON.parse(localStorage.getItem('codexpp.better-sidebar.sidebar-style:account-one'))==='old' && menuCalls.at(-1).items.find(item=>item.label==='Sidebar Style').submenu.some(item=>item.label==='Latest' && item.checked && item.type==='radio'))", in:view)
        XCTAssertEqual(old,"true")
        _ = try await evaluate("selection='codexpp-sidebar-style-latest';document.querySelector('[data-app-action-sidebar-scroll]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let latest = try await evaluate("String(layoutGate && JSON.parse(localStorage.getItem('codexpp.better-sidebar.sidebar-style:account-one'))==='latest' && menuCalls.at(-1).items.find(item=>item.label==='Sidebar Style').submenu.some(item=>item.label==='Old' && item.checked))", in:view)
        XCTAssertEqual(latest,"true")
        _ = try await evaluate("selection='codexpp-sidebar-style-old';document.querySelector('[data-app-action-sidebar-scroll]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        _ = try await evaluate("void __codexPP.sync([])", in:view)
        let restored = try await evaluate("String(layoutGate && JSON.parse(localStorage.getItem('codexpp.better-sidebar.sidebar-style:account-one'))==='old')", in:view)
        XCTAssertEqual(restored,"true")
    }

    @MainActor func testPrimaryDestinationUnpinPreservesNativeActionsAndAccountIsolation() async throws {
        let view = try await fixture(existingDivider: false)
        _ = try await evaluate("""
        globalThis.scheduled=document.createElement('button');scheduled.dataset.sidebarDestination='builtin:automations';scheduled.textContent='Scheduled';document.querySelector('nav > div').prepend(scheduled);
        scheduled.innerHTML='<svg><path d="M0 0h10"/></svg>';
        scheduled.__reactFiber$fixture={memoizedProps:{item:{id:'builtin:automations',contextMenuItems:[{id:'mark-all-read',message:{defaultMessage:'Mark all as read'},onSelect:()=>originalActions++}]}},return:provider};
        selection='mark-all-read';scheduled.querySelector('path').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        let menu = try await evaluate("String(menuCalls.at(-1).items[0].label==='Unpin from sidebar' && menuCalls.at(-1).items[2].label==='Mark all as read' && originalActions===1)", in:view)
        XCTAssertEqual(menu,"true")
        _ = try await evaluate("selection='codexpp-better-sidebar-unpin-destination';scheduled.querySelector('path').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))", in:view)
        let preference = try await evaluate("String(JSON.parse(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-one'))[0]==='builtin:automations' && !scheduled.hasAttribute('data-better-sidebar-hidden'))", in:view)
        // This fixture lacks the native Explore adapter, so the destination
        // remains accessible instead of being hidden without a working menu.
        XCTAssertEqual(preference,"true")
        for id in ["builtin:images", "builtin:library", "builtin:space", "builtin:customize"] {
            _ = try await evaluate("""
            globalThis.optional=document.createElement('button');optional.dataset.sidebarDestination='\(id)';optional.innerHTML='<svg><path d="M0 0h10"/></svg>';document.querySelector('nav > div').prepend(optional);
            optional.__reactFiber$fixture={memoizedProps:{item:{id:'\(id)'}},return:provider};
            selection='codexpp-better-sidebar-unpin-destination';optional.querySelector('path').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
            """, in:view)
            let unpin = try await evaluate("String(menuCalls.at(-1).items[0].label==='Unpin from sidebar' && JSON.parse(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-one')).includes('\(id)'))", in:view)
            XCTAssertEqual(unpin,"true")
        }
        _ = try await evaluate("""
        document.querySelector('[data-sidebar-destination="builtin:space"]').remove();
        const stored=JSON.parse(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-one')).filter(id=>id!=='builtin:library');
        localStorage.setItem('codexpp.better-sidebar.hidden-destinations:account-one',JSON.stringify(stored));
        selection='codexpp-better-sidebar-unpin-destination';document.querySelector('[data-sidebar-destination="builtin:images"] path').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in:view)
        let migrated = try await evaluate("String(JSON.parse(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-one')).includes('builtin:library') && !JSON.parse(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-one')).includes('builtin:space'))", in:view)
        XCTAssertEqual(migrated,"true")
        _ = try await evaluate("auth.accountId='account-two';window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.hidden-destinations:account-one'}));void __codexPP.sync([])", in:view)
        let isolated = try await evaluate("String(localStorage.getItem('codexpp.better-sidebar.hidden-destinations:account-two')===null && !scheduled.hasAttribute('data-better-sidebar-hidden'))", in:view)
        XCTAssertEqual(isolated,"true")
    }

    @MainActor func testPinNativeActionsPersistenceAndCleanupWithAndWithoutExistingDivider() async throws {
        for existingDivider in [false, true] {
            let view = try await fixture(existingDivider: existingDivider)
            _ = try await evaluate("""
            selection='codexpp-better-sidebar-pin-orbit';
            document.querySelector('[data-sidebar-destination="builtin:orbit"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:70,clientY:90}));
            """, in: view)
            let pinned = try await evaluate("""
            String(document.querySelectorAll('[data-better-sidebar-dot]').length===1 &&
              document.querySelector('[data-better-sidebar-dot]').getAttribute('aria-label')==='gremlin' &&
              document.querySelectorAll('#list > .border-t').length===\(existingDivider ? 2 : 1) && originalMenus===0 &&
              menuCalls[0].items[0].label==='Pin to sidebar' && menuCalls[0].items[2].label==='Localized Pause' &&
              menuCalls[0].items[2].accelerator==='Cmd+P' && menuCalls[0].position.x===70);
            """, in: view)
            XCTAssertEqual(pinned, "true")
            _ = try await evaluate("""
            selection='pause-orbit';
            document.querySelector('[data-sidebar-destination="builtin:orbit"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
            document.querySelector('[data-better-sidebar-dot]').click();
            """, in: view)
            let callbacks = try await evaluate("String(originalActions===1 && opens===1)", in: view)
            XCTAssertEqual(callbacks, "true")
            _ = try await evaluate("void __codexPP.sync([])", in: view)
            let cleaned = try await evaluate("""
            document.querySelector('[data-sidebar-destination="builtin:orbit"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
            String(!document.querySelector('[data-better-sidebar-dot]') && !document.querySelector('[data-better-sidebar-divider]') && !document.querySelector('style[data-codexpp]') && originalMenus===1);
            """, in: view)
            XCTAssertEqual(cleaned, "true")
            _ = try await evaluate("void __codexPP.sync(extensionPackage)", in: view)
            let restored = try await evaluate("String(document.querySelectorAll('[data-better-sidebar-dot]').length===1)", in: view)
            XCTAssertEqual(restored, "true")
            _ = try await evaluate("""
            document.querySelector('.text-fade-truncate').textContent='renamed dot';
            window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}));
            selection='codexpp-better-sidebar-unpin-orbit';
            document.querySelector('[data-better-sidebar-dot]').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));
            """, in: view)
            let unpinned = try await evaluate("String(!document.querySelector('[data-better-sidebar-dot]') && menuCalls.at(-1).items[0].label==='Unpin from sidebar')", in: view)
            XCTAssertEqual(unpinned, "true")
            _ = try await evaluate("void __codexPP.sync([])", in: view)
        }
    }

    @MainActor func testDotSelectionClearsWhenAnotherRailPageIsCurrent() async throws {
        let view = try await fixture(existingDivider: false)
        _ = try await evaluate("""
        localStorage.setItem('codexpp.better-sidebar.pin-orbit:account-one','true');
        const home = document.querySelector('[data-sidebar-destination="builtin:home"]');
        home.setAttribute('aria-current','page');
        row.setAttribute('aria-current','page');
        destination.isCurrentDestination=true;
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}));
        """, in: view)
        let selected = try await evaluate("String(document.querySelector('[data-better-sidebar-dot]').hasAttribute('data-selected'))", in: view)
        XCTAssertEqual(selected, "true")
        _ = try await evaluate("""
        home.removeAttribute('aria-current');
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}));
        """, in: view)
        let cleared = try await evaluate("String(!document.querySelector('[data-better-sidebar-dot]').hasAttribute('data-selected') && !document.querySelector('[data-better-sidebar-dot]').hasAttribute('aria-current'))", in: view)
        XCTAssertEqual(cleared, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testAccountIsolationAndMissingAdapterPreserveOriginalMenu() async throws {
        let view = try await fixture(existingDivider: true)
        _ = try await evaluate("""
        localStorage.setItem('codexpp.better-sidebar.pin-orbit:account-one','true');
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}));
        auth.accountId='account-two';
        window.dispatchEvent(new StorageEvent('storage',{key:'codexpp.better-sidebar.pin-orbit:account-one'}));
        const missingAdapterRow=document.querySelector('[data-sidebar-destination="builtin:orbit"]');
        delete missingAdapterRow.__reactFiber$fixture;
        missingAdapterRow.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
        """, in: view)
        let result = try await evaluate("String(!document.querySelector('[data-better-sidebar-dot]') && originalMenus===1 && menuCalls.length===0)", in: view)
        XCTAssertEqual(result, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }
}
