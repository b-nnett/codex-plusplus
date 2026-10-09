const className = 'codexpp-quiet-focus';
api.addStyle(`
  html.${className} img, html.${className} video {
    opacity: 0.18 !important;
    transition: opacity 160ms ease;
  }
  html.${className} img:hover, html.${className} video:hover { opacity: 1 !important; }
`);
api.on(window, 'keydown', event => {
  if (event.altKey && event.shiftKey && event.code === 'KeyF' && !event.repeat) {
    event.preventDefault();
    document.documentElement.classList.toggle(className);
  }
});
api.onCleanup(() => document.documentElement.classList.remove(className));
