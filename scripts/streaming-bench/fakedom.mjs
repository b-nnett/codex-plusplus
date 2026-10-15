// A small fake DOM: enough of the Node/Element/Document API for react-dom's client
// renderer to mount and update a tree, plus a serialiser so outputs can be compared.
// Counters record DOM mutations.
export function makeDom() {
  const counters = { created: 0, inserted: 0, removed: 0, attrs: 0, text: 0 };
  class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} stopPropagation() {} }
  class Node {
    constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._listeners = {}; }
    get firstChild() { return this.childNodes[0] ?? null; }
    get lastChild() { return this.childNodes.at(-1) ?? null; }
    get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] ?? null; }
    get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) {
      if (c.nodeType === 11) { for (const k of [...c.childNodes]) this.insertBefore(k, ref); return c; }
      if (c.parentNode) c.parentNode.removeChild(c);
      const i = ref == null ? this.childNodes.length : this.childNodes.indexOf(ref);
      this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c); c.parentNode = this; counters.inserted++; return c;
    }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; counters.removed++; return c; }
    remove() { this.parentNode?.removeChild(this); }
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
    getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n; }
    addEventListener(t, f) { (this._listeners[t] ??= []).push(f); }
    removeEventListener(t, f) { const l = this._listeners[t]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
    dispatchEvent() { return true; }
    get textContent() { return this.nodeType === 3 || this.nodeType === 8 ? this.data : this.childNodes.map(c => c.nodeType === 8 ? '' : c.textContent).join(''); }
    set textContent(v) { counters.text++; for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))); }
    cloneNode() { throw new Error('cloneNode'); }
  }
  class Text extends Node {
    constructor(doc, data) { super(doc); this.nodeType = 3; this.nodeName = '#text'; this._data = data; counters.created++; }
    get data() { return this._data; } set data(v) { counters.text++; this._data = String(v); }
    get nodeValue() { return this._data; } set nodeValue(v) { counters.text++; this._data = String(v); }
  }
  class Comment extends Node { constructor(doc, data) { super(doc); this.nodeType = 8; this.nodeName = '#comment'; this.data = data; } }
  class Fragment extends Node { constructor(doc) { super(doc); this.nodeType = 11; this.nodeName = '#document-fragment'; } }
  function makeStyle() {
    const props = new Map();
    const target = {
      setProperty(k, v) { counters.attrs++; v === '' || v == null ? props.delete(k) : props.set(k, String(v)); },
      removeProperty(k) { props.delete(k); }, getPropertyValue(k) { return props.get(k) ?? ''; },
      get cssText() { return [...props].map(([k, v]) => `${k}:${v}`).join(';'); }, set cssText(v) { props.clear(); },
      _props: props,
    };
    return new Proxy(target, {
      get: (t, k) => k in t ? t[k] : (typeof k === 'string' ? props.get(k) ?? '' : undefined),
      set: (t, k, v) => { counters.attrs++; v === '' || v == null ? props.delete(k) : props.set(k, String(v)); return true; },
    });
  }
  class Element extends Node {
    constructor(doc, tag, ns) { super(doc); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.localName = tag; this.namespaceURI = ns ?? 'http://www.w3.org/1999/xhtml'; this.attributes = new Map(); this.style = makeStyle(); counters.created++; }
    setAttribute(k, v) { counters.attrs++; this.attributes.set(k, String(v)); }
    setAttributeNS(ns, k, v) { this.setAttribute(k, v); }
    removeAttribute(k) { counters.attrs++; this.attributes.delete(k); }
    removeAttributeNS(ns, k) { this.removeAttribute(k); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    get className() { return this.getAttribute('class') ?? ''; } set className(v) { this.setAttribute('class', v); }
    get id() { return this.getAttribute('id') ?? ''; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get innerHTML() { return this.childNodes.map(serialize).join(''); } set innerHTML(v) { this.textContent = ''; if (v) this.appendChild(this.ownerDocument.createTextNode(v)); }
    get dataset() { return {}; }
    getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
    getClientRects() { return []; }
    focus() {} blur() {} scrollIntoView() {}
    querySelector() { return null; } querySelectorAll() { return []; } closest() { return null; } matches() { return false; }
    getElementsByTagName() { return []; }
    animate() { return { cancel() {}, finished: Promise.resolve(), addEventListener() {} }; }
    getAnimations() { return []; }
    get offsetWidth() { return 0; } get offsetHeight() { return 0; } get clientWidth() { return 0; } get clientHeight() { return 0; } get scrollHeight() { return 0; }
  }
  class HTMLIFrameElement extends Element {}
  class Document extends Node {
    constructor() { super(null); this.ownerDocument = null; this.nodeType = 9; this.nodeName = '#document';
      this.documentElement = new Element(this, 'html'); this.head = new Element(this, 'head'); this.body = new Element(this, 'body');
      this.documentElement.appendChild(this.head); this.documentElement.appendChild(this.body); this.appendChild(this.documentElement); this.activeElement = this.body; }
    createElement(tag) { return new Element(this, tag); }
    createElementNS(ns, tag) { return new Element(this, tag, ns); }
    createTextNode(t) { return new Text(this, String(t)); }
    createComment(t) { return new Comment(this, t); }
    createDocumentFragment() { return new Fragment(this); }
    getElementById() { return null; } querySelector() { return null; } querySelectorAll() { return []; } getElementsByTagName() { return []; }
    hasFocus() { return true; } getSelection() { return null; }
    get visibilityState() { return 'visible'; } get hidden() { return false; }
    createEvent() { return new Event(''); }
    get fonts() { return { ready: Promise.resolve(), addEventListener() {} }; }
  }
  const document = new Document();
  function serialize(n) {
    if (n.nodeType === 3) return n.data.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (n.nodeType === 8) return `<!--${n.data}-->`;
    if (n.nodeType !== 1) return n.childNodes.map(serialize).join('');
    const attrs = [...n.attributes].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => ` ${k}="${v}"`).join('');
    const style = n.style.cssText ? ` style="${n.style.cssText}"` : '';
    return `<${n.localName}${attrs}${style}>${n.childNodes.map(serialize).join('')}</${n.localName}>`;
  }
  const globals = { document, Node, Element, HTMLElement: Element, HTMLIFrameElement, Text, Comment, DocumentFragment: Fragment, Document, SVGElement: Element, HTMLInputElement: Element, HTMLTextAreaElement: Element };
  return { document, globals, serialize, counters, Event };
}
