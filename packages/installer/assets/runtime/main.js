"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main.ts
var import_electron4 = require("electron");
var import_node_fs10 = require("node:fs");
var import_node_child_process3 = require("node:child_process");
var import_node_crypto3 = require("node:crypto");
var import_node_path9 = require("node:path");
var import_node_os2 = require("node:os");

// ../../../../../../../../.codex-plusplus/source/node_modules/chokidar/esm/index.js
var import_fs2 = require("fs");
var import_promises3 = require("fs/promises");
var import_events = require("events");
var sysPath2 = __toESM(require("path"), 1);

// ../../../../../../../../.codex-plusplus/source/node_modules/readdirp/esm/index.js
var import_promises = require("node:fs/promises");
var import_node_stream = require("node:stream");
var import_node_path = require("node:path");
var EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
var defaultOptions = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions);
var RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
var NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
var ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
var DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
var FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
var isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
var wantBigintFsStats = process.platform === "win32";
var emptyFn = (_entryInfo) => true;
var normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
var ReaddirpStream = class extends import_node_stream.Readable {
  constructor(options = {}) {
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? import_promises.lstat : import_promises.stat;
    if (wantBigintFsStats) {
      this._stat = (path) => statMethod(path, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = opts.depth ?? defaultOptions.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = (0, import_node_path.resolve)(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path, depth) {
    let files;
    try {
      files = await (0, import_promises.readdir)(path, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path };
  }
  async _formatEntry(dirent, path) {
    let entry;
    const basename3 = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = (0, import_node_path.resolve)((0, import_node_path.join)(path, basename3));
      entry = { path: (0, import_node_path.relative)(this._root, fullPath), fullPath, basename: basename3 };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err) {
      this._onError(err);
      return;
    }
    return entry;
  }
  _onError(err) {
    if (isNormalFlowError(err) && !this.destroyed) {
      this.emit("warn", err);
    } else {
      this.destroy(err);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await (0, import_promises.realpath)(full);
        const entryRealPathStats = await (0, import_promises.lstat)(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === import_node_path.sep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
};
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}

// ../../../../../../../../.codex-plusplus/source/node_modules/chokidar/esm/handler.js
var import_fs = require("fs");
var import_promises2 = require("fs/promises");
var sysPath = __toESM(require("path"), 1);
var import_os = require("os");
var STR_DATA = "data";
var STR_END = "end";
var STR_CLOSE = "close";
var EMPTY_FN = () => {
};
var pl = process.platform;
var isWindows = pl === "win32";
var isMacos = pl === "darwin";
var isLinux = pl === "linux";
var isFreeBSD = pl === "freebsd";
var isIBMi = (0, import_os.type)() === "OS400";
var EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
var EV = EVENTS;
var THROTTLE_MODE_WATCH = "watch";
var statMethods = { lstat: import_promises2.lstat, stat: import_promises2.stat };
var KEY_LISTENERS = "listeners";
var KEY_ERR = "errHandlers";
var KEY_RAW = "rawEmitters";
var HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
var binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
var isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
var foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
var addAndConvert = (main, prop, item) => {
  let container = main[prop];
  if (!(container instanceof Set)) {
    main[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
var clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
var delFromSet = (main, prop, item) => {
  const container = main[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main[prop];
  }
};
var isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
var FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path);
    emitRaw(rawEvent, evPath, { watchedPath: path });
    if (evPath && path !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path, evPath), KEY_LISTENERS, sysPath.join(path, evPath));
    }
  };
  try {
    return (0, import_fs.watch)(path, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
var setFsWatchListener = (path, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await (0, import_promises2.open)(path, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var FsWatchFileInstances = /* @__PURE__ */ new Map();
var setFsWatchFileListener = (path, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    (0, import_fs.unwatchFile)(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: (0, import_fs.watchFile)(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      (0, import_fs.unwatchFile)(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var NodeFsHandler = class {
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path, listener) {
    const opts = this.fsw.options;
    const directory = sysPath.dirname(path);
    const basename3 = sysPath.basename(path);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename3);
    const absolutePath = sysPath.resolve(path);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename3) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname6 = sysPath.dirname(file);
    const basename3 = sysPath.basename(file);
    const parent = this.fsw._getWatchedDir(dirname6);
    let prevStats = stats;
    if (parent.has(basename3))
      return;
    const listener = async (path, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await (0, import_promises2.stat)(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname6, basename3);
        }
      } else if (parent.has(basename3)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await (0, import_promises2.realpath)(path);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sysPath.join(directory, "");
    throttler = this.fsw._throttle("readdir", directory, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path = sysPath.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path = sysPath.join(dir, sysPath.relative(dir, path));
        this._addToNodeFs(path, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve6, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve6(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath2) {
    const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
    const tracked = parentDir.has(sysPath.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sysPath.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath2)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sysPath.resolve(path);
        const targetPath = follow ? await (0, import_promises2.realpath)(path) : path;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await (0, import_promises2.realpath)(path) : path;
        if (this.fsw.closed)
          return;
        const parent = sysPath.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sysPath.resolve(path), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path;
      }
    }
  }
};

// ../../../../../../../../.codex-plusplus/source/node_modules/chokidar/esm/index.js
var SLASH = "/";
var SLASH_SLASH = "//";
var ONE_DOT = ".";
var TWO_DOTS = "..";
var STRING_TYPE = "string";
var BACK_SLASH_RE = /\\/g;
var DOUBLE_SLASH_RE = /\/\//;
var DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
var REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
var isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative6 = sysPath2.relative(matcher.path, string);
        if (!relative6) {
          return false;
        }
        return !relative6.startsWith("..") && !sysPath2.isAbsolute(relative6);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path) {
  if (typeof path !== "string")
    throw new Error("string expected");
  path = sysPath2.normalize(path);
  path = path.replace(/\\/g, "/");
  let prepend = false;
  if (path.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path.match(DOUBLE_SLASH_RE2))
    path = path.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path = "/" + path;
  return path;
}
function matchPatterns(patterns, testString, stats) {
  const path = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
var unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
var toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  while (str.match(DOUBLE_SLASH_RE)) {
    str = str.replace(DOUBLE_SLASH_RE, SLASH);
  }
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
var normalizePathToUnix = (path) => toUnix(sysPath2.normalize(toUnix(path)));
var normalizeIgnored = (cwd = "") => (path) => {
  if (typeof path === "string") {
    return normalizePathToUnix(sysPath2.isAbsolute(path) ? path : sysPath2.join(cwd, path));
  } else {
    return path;
  }
};
var getAbsolutePath = (path, cwd) => {
  if (sysPath2.isAbsolute(path)) {
    return path;
  }
  return sysPath2.join(cwd, path);
};
var EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
var DirEntry = class {
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await (0, import_promises3.readdir)(dir);
    } catch (err) {
      if (this._removeWatcher) {
        this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
};
var STAT_METHOD_F = "stat";
var STAT_METHOD_L = "lstat";
var WatchHelper = class {
  constructor(path, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path;
    this.path = path = path.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sysPath2.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
};
var FSWatcher = class extends import_events.EventEmitter {
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path) => {
        const absPath = getAbsolutePath(path, cwd);
        return absPath;
      });
    }
    paths.forEach((path) => {
      this._removeIgnoredPath(path);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path) => {
      const res = await this._nodeFsHandler._addToNodeFs(path, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path) => {
      if (!sysPath2.isAbsolute(path) && !this._closers.has(path)) {
        if (cwd)
          path = sysPath2.join(cwd, path);
        path = sysPath2.resolve(path);
      }
      this._closePath(path);
      this._addIgnoredPath(path);
      if (this._watched.has(path)) {
        this._addIgnoredPath({
          path,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path = sysPath2.normalize(path);
    if (opts.cwd)
      path = sysPath2.relative(opts.cwd, path);
    const args = [path];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path2) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path2);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err, stats2) => {
        if (err) {
          event = EVENTS.ERROR;
          args[0] = err;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path) : path;
      let stats2;
      try {
        stats2 = await (0, import_promises3.stat)(fullPath);
      } catch (err) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path);
      const count = item ? item.count : 0;
      action.delete(path);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path;
    if (this.options.cwd && !sysPath2.isAbsolute(path)) {
      fullPath = sysPath2.join(this.options.cwd, path);
    }
    const now = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      (0, import_fs2.stat)(fullPath, (err, curStat) => {
        if (err || !writes.has(path)) {
          if (err && err.code !== "ENOENT")
            awfEmit(err);
          return;
        }
        const now2 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path).lastChange = now2;
        }
        const pw = writes.get(path);
        const df = now2 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path)) {
      writes.set(path, {
        lastChange: now,
        cancelWait: () => {
          writes.delete(path);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path, stats) {
    if (this.options.atomic && DOT_RE.test(path))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list, void 0);
    }
    return this._userIgnored(path, stats);
  }
  _isntIgnored(path, stat4) {
    return !this._isIgnored(path, stat4);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path) {
    return new WatchHelper(path, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sysPath2.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path = sysPath2.join(directory, item);
    const fullPath = sysPath2.resolve(path);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path) || this._watched.has(fullPath);
    if (!this._throttle("remove", path, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path;
    if (this.options.cwd)
      relPath = sysPath2.relative(this.options.cwd, path);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path))
      this._emit(eventName, path);
    this._closePath(path);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path) {
    this._closeFile(path);
    const dir = sysPath2.dirname(path);
    this._getWatchedDir(dir).remove(sysPath2.basename(path));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path) {
    const closers = this._closers.get(path);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path);
  }
  _addPathCloser(path, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path);
    if (!list) {
      list = [];
      this._closers.set(path, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
};
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
var esm_default = { watch, FSWatcher };

// src/tweak-discovery.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
var ENTRY_CANDIDATES = ["index.js", "index.cjs", "index.mjs"];
function discoverTweaks(tweaksDir) {
  if (!(0, import_node_fs.existsSync)(tweaksDir)) return [];
  const out = [];
  for (const name of (0, import_node_fs.readdirSync)(tweaksDir)) {
    const dir = (0, import_node_path2.join)(tweaksDir, name);
    if (!(0, import_node_fs.statSync)(dir).isDirectory()) continue;
    const manifestPath = (0, import_node_path2.join)(dir, "manifest.json");
    if (!(0, import_node_fs.existsSync)(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse((0, import_node_fs.readFileSync)(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (!isValidManifest(manifest)) continue;
    const entry = resolveEntry(dir, manifest);
    if (!entry) continue;
    out.push({ dir, entry, manifest });
  }
  return out;
}
function isValidManifest(m) {
  if (!m.id || !m.name || !m.version || !m.githubRepo) return false;
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(m.githubRepo)) return false;
  if (m.scope && !["renderer", "main", "both"].includes(m.scope)) return false;
  return true;
}
function resolveEntry(dir, m) {
  if (m.main) {
    const p = (0, import_node_path2.join)(dir, m.main);
    return (0, import_node_fs.existsSync)(p) ? p : null;
  }
  for (const c of ENTRY_CANDIDATES) {
    const p = (0, import_node_path2.join)(dir, c);
    if ((0, import_node_fs.existsSync)(p)) return p;
  }
  return null;
}

// src/storage.ts
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");
var FLUSH_DELAY_MS = 50;
function createDiskStorage(rootDir, id) {
  const dir = (0, import_node_path3.join)(rootDir, "storage");
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path3.join)(dir, `${sanitize(id)}.json`);
  let data = {};
  if ((0, import_node_fs2.existsSync)(file)) {
    try {
      data = JSON.parse((0, import_node_fs2.readFileSync)(file, "utf8"));
    } catch {
      try {
        (0, import_node_fs2.renameSync)(file, `${file}.corrupt-${Date.now()}`);
      } catch {
      }
      data = {};
    }
  }
  let dirty = false;
  let timer = null;
  const scheduleFlush = () => {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (dirty) flush();
    }, FLUSH_DELAY_MS);
  };
  const flush = () => {
    if (!dirty) return;
    const tmp = `${file}.tmp`;
    try {
      (0, import_node_fs2.writeFileSync)(tmp, JSON.stringify(data, null, 2), "utf8");
      (0, import_node_fs2.renameSync)(tmp, file);
      dirty = false;
    } catch (e) {
      console.error("[codex-plusplus] storage flush failed:", id, e);
    }
  };
  return {
    get: (k, d) => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : d,
    set(k, v) {
      data[k] = v;
      scheduleFlush();
    },
    delete(k) {
      if (k in data) {
        delete data[k];
        scheduleFlush();
      }
    },
    all: () => ({ ...data }),
    flush
  };
}
function sanitize(id) {
  return id.replace(/[^a-zA-Z0-9._@-]/g, "_");
}

// src/mcp-sync.ts
var import_node_fs3 = require("node:fs");
var import_node_path4 = require("node:path");
var MCP_MANAGED_START = "# BEGIN CODEX++ MANAGED MCP SERVERS";
var MCP_MANAGED_END = "# END CODEX++ MANAGED MCP SERVERS";
function syncManagedMcpServers({
  configPath,
  tweaks
}) {
  const current = (0, import_node_fs3.existsSync)(configPath) ? (0, import_node_fs3.readFileSync)(configPath, "utf8") : "";
  const built = buildManagedMcpBlock(tweaks, current);
  const next = mergeManagedMcpBlock(current, built.block);
  if (next !== current) {
    (0, import_node_fs3.mkdirSync)((0, import_node_path4.dirname)(configPath), { recursive: true });
    (0, import_node_fs3.writeFileSync)(configPath, next, "utf8");
  }
  return { ...built, changed: next !== current };
}
function buildManagedMcpBlock(tweaks, existingToml = "") {
  const manualToml = stripManagedMcpBlock(existingToml);
  const manualNames = findMcpServerNames(manualToml);
  const usedNames = new Set(manualNames);
  const serverNames = [];
  const skippedServerNames = [];
  const entries = [];
  for (const tweak of tweaks) {
    const mcp = normalizeMcpServer(tweak.manifest.mcp);
    if (!mcp) continue;
    const baseName = mcpServerNameFromTweakId(tweak.manifest.id);
    if (manualNames.has(baseName)) {
      skippedServerNames.push(baseName);
      continue;
    }
    const serverName = reserveUniqueName(baseName, usedNames);
    serverNames.push(serverName);
    entries.push(formatMcpServer(serverName, tweak.dir, mcp));
  }
  if (entries.length === 0) {
    return { block: "", serverNames, skippedServerNames };
  }
  return {
    block: [MCP_MANAGED_START, ...entries, MCP_MANAGED_END].join("\n"),
    serverNames,
    skippedServerNames
  };
}
function mergeManagedMcpBlock(currentToml, managedBlock) {
  if (!managedBlock && !currentToml.includes(MCP_MANAGED_START)) return currentToml;
  const stripped = stripManagedMcpBlock(currentToml).trimEnd();
  if (!managedBlock) return stripped ? `${stripped}
` : "";
  return `${stripped ? `${stripped}

` : ""}${managedBlock}
`;
}
function stripManagedMcpBlock(toml) {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(MCP_MANAGED_START)}[\\s\\S]*?${escapeRegExp(MCP_MANAGED_END)}\\n?`,
    "g"
  );
  return toml.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}
function mcpServerNameFromTweakId(id) {
  const withoutPublisher = id.replace(/^co\.bennett\./, "");
  const slug = withoutPublisher.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug || "tweak-mcp";
}
function findMcpServerNames(toml) {
  const names = /* @__PURE__ */ new Set();
  const tablePattern = /^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gm;
  let match;
  while ((match = tablePattern.exec(toml)) !== null) {
    names.add(unquoteTomlKey(match[1] ?? ""));
  }
  return names;
}
function reserveUniqueName(baseName, usedNames) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  for (let i = 2; ; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
}
function normalizeMcpServer(value) {
  if (!value || typeof value.command !== "string" || value.command.length === 0) return null;
  if (value.args !== void 0 && !Array.isArray(value.args)) return null;
  if (value.args?.some((arg) => typeof arg !== "string")) return null;
  if (value.env !== void 0) {
    if (!value.env || typeof value.env !== "object" || Array.isArray(value.env)) return null;
    if (Object.values(value.env).some((envValue) => typeof envValue !== "string")) return null;
  }
  return value;
}
function formatMcpServer(serverName, tweakDir, mcp) {
  const lines = [
    `[mcp_servers.${formatTomlKey(serverName)}]`,
    `command = ${formatTomlString(resolveCommand(tweakDir, mcp.command))}`
  ];
  if (mcp.args && mcp.args.length > 0) {
    lines.push(`args = ${formatTomlStringArray(mcp.args.map((arg) => resolveArg(tweakDir, arg)))}`);
  }
  if (mcp.env && Object.keys(mcp.env).length > 0) {
    lines.push(`env = ${formatTomlInlineTable(mcp.env)}`);
  }
  return lines.join("\n");
}
function resolveCommand(tweakDir, command) {
  if ((0, import_node_path4.isAbsolute)(command) || !looksLikeRelativePath(command)) return command;
  return (0, import_node_path4.resolve)(tweakDir, command);
}
function resolveArg(tweakDir, arg) {
  if ((0, import_node_path4.isAbsolute)(arg) || arg.startsWith("-")) return arg;
  const candidate = (0, import_node_path4.resolve)(tweakDir, arg);
  return (0, import_node_fs3.existsSync)(candidate) ? candidate : arg;
}
function looksLikeRelativePath(value) {
  return value.startsWith("./") || value.startsWith("../") || value.includes("/");
}
function formatTomlString(value) {
  return JSON.stringify(value);
}
function formatTomlStringArray(values) {
  return `[${values.map(formatTomlString).join(", ")}]`;
}
function formatTomlInlineTable(record) {
  return `{ ${Object.entries(record).map(([key, value]) => `${formatTomlKey(key)} = ${formatTomlString(value)}`).join(", ")} }`;
}
function formatTomlKey(key) {
  return /^[a-zA-Z0-9_-]+$/.test(key) ? key : formatTomlString(key);
}
function unquoteTomlKey(key) {
  if (!key.startsWith('"') || !key.endsWith('"')) return key;
  try {
    return JSON.parse(key);
  } catch {
    return key;
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/watcher-health.ts
var import_node_child_process = require("node:child_process");
var import_node_fs4 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path5 = require("node:path");
var LAUNCHD_LABEL = "com.codexplusplus.watcher";
var WATCHER_LOG = (0, import_node_path5.join)((0, import_node_os.homedir)(), "Library", "Logs", "codex-plusplus-watcher.log");
function getWatcherHealth(userRoot2) {
  const checks = [];
  const state = readJson((0, import_node_path5.join)(userRoot2, "state.json"));
  const config = readJson((0, import_node_path5.join)(userRoot2, "config.json")) ?? {};
  const selfUpdate = readJson((0, import_node_path5.join)(userRoot2, "self-update-state.json"));
  checks.push({
    name: "Install state",
    status: state ? "ok" : "error",
    detail: state ? `Codex++ ${state.version ?? "(unknown version)"}` : "state.json is missing"
  });
  if (!state) return summarize("none", checks);
  const autoUpdate = config.codexPlusPlus?.autoUpdate !== false;
  checks.push({
    name: "Automatic refresh",
    status: autoUpdate ? "ok" : "warn",
    detail: autoUpdate ? "enabled" : "disabled in Codex++ config"
  });
  checks.push({
    name: "Watcher kind",
    status: state.watcher && state.watcher !== "none" ? "ok" : "error",
    detail: state.watcher ?? "none"
  });
  if (selfUpdate) {
    checks.push(selfUpdateCheck(selfUpdate));
  }
  const appRoot = state.appRoot ?? "";
  checks.push({
    name: "Codex app",
    status: appRoot && (0, import_node_fs4.existsSync)(appRoot) ? "ok" : "error",
    detail: appRoot || "missing appRoot in state"
  });
  switch ((0, import_node_os.platform)()) {
    case "darwin":
      checks.push(...checkLaunchdWatcher(appRoot));
      break;
    case "linux":
      checks.push(...checkSystemdWatcher(appRoot));
      break;
    case "win32":
      checks.push(...checkScheduledTaskWatcher());
      break;
    default:
      checks.push({
        name: "Platform watcher",
        status: "warn",
        detail: `unsupported platform: ${(0, import_node_os.platform)()}`
      });
  }
  return summarize(state.watcher ?? "none", checks);
}
function selfUpdateCheck(state) {
  const at = state.completedAt ?? state.checkedAt ?? "unknown time";
  if (state.status === "failed") {
    return {
      name: "last Codex++ update",
      status: "warn",
      detail: state.error ? `failed ${at}: ${state.error}` : `failed ${at}`
    };
  }
  if (state.status === "disabled") {
    return { name: "last Codex++ update", status: "warn", detail: `skipped ${at}: automatic refresh disabled` };
  }
  if (state.status === "updated") {
    return { name: "last Codex++ update", status: "ok", detail: `updated ${at} to ${state.latestVersion ?? "new release"}` };
  }
  if (state.status === "up-to-date") {
    return { name: "last Codex++ update", status: "ok", detail: `up to date ${at}` };
  }
  return { name: "last Codex++ update", status: "warn", detail: `checking since ${at}` };
}
function checkLaunchdWatcher(appRoot) {
  const checks = [];
  const plistPath = (0, import_node_path5.join)((0, import_node_os.homedir)(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
  const plist = (0, import_node_fs4.existsSync)(plistPath) ? readFileSafe(plistPath) : "";
  const asarPath = appRoot ? (0, import_node_path5.join)(appRoot, "Contents", "Resources", "app.asar") : "";
  checks.push({
    name: "launchd plist",
    status: plist ? "ok" : "error",
    detail: plistPath
  });
  if (plist) {
    checks.push({
      name: "launchd label",
      status: plist.includes(LAUNCHD_LABEL) ? "ok" : "error",
      detail: LAUNCHD_LABEL
    });
    checks.push({
      name: "launchd trigger",
      status: asarPath && plist.includes(asarPath) ? "ok" : "error",
      detail: asarPath || "missing appRoot"
    });
    checks.push({
      name: "watcher command",
      status: plist.includes("CODEX_PLUSPLUS_WATCHER=1") && plist.includes(" update --watcher --quiet") ? "ok" : "error",
      detail: commandSummary(plist)
    });
    const cliPath = extractFirst(plist, /'([^']*packages\/installer\/dist\/cli\.js)'/);
    if (cliPath) {
      checks.push({
        name: "repair CLI",
        status: (0, import_node_fs4.existsSync)(cliPath) ? "ok" : "error",
        detail: cliPath
      });
    }
  }
  const loaded = commandSucceeds("launchctl", ["list", LAUNCHD_LABEL]);
  checks.push({
    name: "launchd loaded",
    status: loaded ? "ok" : "error",
    detail: loaded ? "service is loaded" : "launchctl cannot find the watcher"
  });
  checks.push(watcherLogCheck());
  return checks;
}
function checkSystemdWatcher(appRoot) {
  const dir = (0, import_node_path5.join)((0, import_node_os.homedir)(), ".config", "systemd", "user");
  const service = (0, import_node_path5.join)(dir, "codex-plusplus-watcher.service");
  const timer = (0, import_node_path5.join)(dir, "codex-plusplus-watcher.timer");
  const pathUnit = (0, import_node_path5.join)(dir, "codex-plusplus-watcher.path");
  const expectedPath = appRoot ? (0, import_node_path5.join)(appRoot, "resources", "app.asar") : "";
  const pathBody = (0, import_node_fs4.existsSync)(pathUnit) ? readFileSafe(pathUnit) : "";
  return [
    {
      name: "systemd service",
      status: (0, import_node_fs4.existsSync)(service) ? "ok" : "error",
      detail: service
    },
    {
      name: "systemd timer",
      status: (0, import_node_fs4.existsSync)(timer) ? "ok" : "error",
      detail: timer
    },
    {
      name: "systemd path",
      status: pathBody && expectedPath && pathBody.includes(expectedPath) ? "ok" : "error",
      detail: expectedPath || pathUnit
    },
    {
      name: "path unit active",
      status: commandSucceeds("systemctl", ["--user", "is-active", "--quiet", "codex-plusplus-watcher.path"]) ? "ok" : "warn",
      detail: "systemctl --user is-active codex-plusplus-watcher.path"
    },
    {
      name: "timer active",
      status: commandSucceeds("systemctl", ["--user", "is-active", "--quiet", "codex-plusplus-watcher.timer"]) ? "ok" : "warn",
      detail: "systemctl --user is-active codex-plusplus-watcher.timer"
    }
  ];
}
function checkScheduledTaskWatcher() {
  return [
    {
      name: "logon task",
      status: commandSucceeds("schtasks.exe", ["/Query", "/TN", "codex-plusplus-watcher"]) ? "ok" : "error",
      detail: "codex-plusplus-watcher"
    },
    {
      name: "hourly task",
      status: commandSucceeds("schtasks.exe", ["/Query", "/TN", "codex-plusplus-watcher-hourly"]) ? "ok" : "warn",
      detail: "codex-plusplus-watcher-hourly"
    }
  ];
}
function watcherLogCheck() {
  if (!(0, import_node_fs4.existsSync)(WATCHER_LOG)) {
    return { name: "watcher log", status: "warn", detail: "no watcher log yet" };
  }
  const tail = readFileSafe(WATCHER_LOG).split(/\r?\n/).slice(-40).join("\n");
  return analyzeWatcherLogTail(tail);
}
function analyzeWatcherLogTail(tail) {
  const hasError = /✗ codex-plusplus failed|codex-plusplus failed|error|failed/i.test(tail);
  const needsManualRepair = hasError && /Cannot write to .*Codex.*\.app|App Management|file ownership|sudo codexplusplus (?:install|repair)|EACCES|EPERM/i.test(tail);
  return {
    name: "watcher log",
    status: hasError ? "warn" : "ok",
    detail: hasError ? needsManualRepair ? "auto-repair needs app permissions; run `codexplusplus repair` from Terminal" : "recent watcher log contains an error" : WATCHER_LOG
  };
}
function summarize(watcher, checks) {
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");
  const status = hasError ? "error" : hasWarn ? "warn" : "ok";
  const failed = checks.filter((c) => c.status === "error").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const title = status === "ok" ? "Auto-repair watcher is ready" : status === "warn" ? "Auto-repair watcher needs review" : "Auto-repair watcher is not ready";
  const summary = status === "ok" ? "Codex++ should automatically repair itself after Codex updates." : `${failed} failing check(s), ${warned} warning(s).`;
  return {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status,
    title,
    summary,
    watcher,
    checks
  };
}
function commandSucceeds(command, args) {
  try {
    (0, import_node_child_process.execFileSync)(command, args, { stdio: "ignore", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function commandSummary(plist) {
  const command = extractFirst(plist, /<string>([^<]*(?:update --watcher --quiet|repair --quiet)[^<]*)<\/string>/);
  return command ? unescapeXml(command).replace(/\s+/g, " ").trim() : "watcher command not found";
}
function extractFirst(source, pattern) {
  return source.match(pattern)?.[1] ?? null;
}
function readJson(path) {
  try {
    return JSON.parse((0, import_node_fs4.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
}
function readFileSafe(path) {
  try {
    return (0, import_node_fs4.readFileSync)(path, "utf8");
  } catch {
    return "";
  }
}
function unescapeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// src/tweak-lifecycle.ts
function isMainProcessTweakScope(scope) {
  return scope !== "renderer";
}
function reloadTweaks(reason, deps) {
  deps.logInfo(`reloading tweaks (${reason})`);
  deps.stopAllMainTweaks();
  deps.clearTweakModuleCache();
  deps.loadAllMainTweaks();
  deps.broadcastReload();
}
function setTweakEnabledAndReload(id, enabled, deps) {
  const normalizedEnabled = !!enabled;
  deps.setTweakEnabled(id, normalizedEnabled);
  deps.logInfo(`tweak ${id} enabled=${normalizedEnabled}`);
  reloadTweaks("enabled-toggle", deps);
  return true;
}

// src/logging.ts
var import_node_fs5 = require("node:fs");
var MAX_LOG_BYTES = 10 * 1024 * 1024;
function appendCappedLog(path, line, maxBytes = MAX_LOG_BYTES) {
  const incoming = Buffer.from(line);
  if (incoming.byteLength >= maxBytes) {
    (0, import_node_fs5.writeFileSync)(path, incoming.subarray(incoming.byteLength - maxBytes));
    return;
  }
  try {
    if ((0, import_node_fs5.existsSync)(path)) {
      const size = (0, import_node_fs5.statSync)(path).size;
      const allowedExisting = maxBytes - incoming.byteLength;
      if (size > allowedExisting) {
        const existing = (0, import_node_fs5.readFileSync)(path);
        (0, import_node_fs5.writeFileSync)(path, existing.subarray(Math.max(0, existing.byteLength - allowedExisting)));
      }
    }
  } catch {
  }
  (0, import_node_fs5.appendFileSync)(path, incoming);
}

// src/codex-runtime-probe.ts
var import_electron = require("electron");
var import_node_fs6 = require("node:fs");
var import_node_path6 = require("node:path");
function getRuntimeInfo(opts) {
  return {
    type: detectRuntimeType(),
    codexVersion: opts.codexVersion ?? safeAppVersion(),
    channel: opts.channel,
    buildFlavor: safeBuildFlavor(),
    usesOwlAppShell: null,
    appPath: safeAppPath(),
    resourcesPath: process.resourcesPath ?? null
  };
}
function getRuntimeCapabilities(opts) {
  const services = asRecord(opts.getWindowServices());
  const windowManager = asRecord(services?.windowManager);
  const cdp = getCdpStatus();
  const native = opts.getNativeCapabilities?.() ?? defaultNativeCapabilities();
  const views = opts.getViewCapabilities?.() ?? defaultViewCapabilities();
  const canCreateWindow = typeof windowManager?.createWindow === "function" || typeof services?.createFreshWindow === "function" || typeof services?.createFreshLocalWindow === "function" || typeof services?.ensureHostWindow === "function";
  return {
    windows: {
      create: canCreateWindow,
      focus: true,
      primary: typeof services?.getPrimaryWindow === "function" || typeof windowManager?.getPrimaryWindow === "function",
      browserView: typeof windowManager?.registerWindow === "function"
    },
    views,
    cdp: {
      supported: true,
      enabled: cdp.enabled,
      port: cdp.port
    },
    native
  };
}
function getCdpStatus() {
  const enabled = process.env.CODEXPP_REMOTE_DEBUG === "1";
  const port = parseCdpPort(process.env.CODEXPP_REMOTE_DEBUG_PORT);
  return {
    supported: true,
    enabled,
    port: enabled ? port : null,
    url: enabled ? `http://127.0.0.1:${port}` : null
  };
}
async function listCdpTargets() {
  const status = getCdpStatus();
  if (!status.enabled || !status.url) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e3);
  try {
    const res = await fetch(`${status.url}/json`, { signal: controller.signal });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => normalizeCdpTarget(row)).filter((row) => row !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
function detectRuntimeType() {
  if (process.platform === "darwin") {
    const appRoot = inferMacAppRoot();
    if (appRoot && (0, import_node_fs6.existsSync)((0, import_node_path6.join)(appRoot, "Contents", "Frameworks", "Codex Framework.framework"))) {
      return "owl";
    }
    if (appRoot && (0, import_node_fs6.existsSync)((0, import_node_path6.join)(appRoot, "Contents", "Frameworks", "Electron Framework.framework"))) {
      return "electron";
    }
    if (process.resourcesPath && (0, import_node_fs6.existsSync)((0, import_node_path6.join)(process.resourcesPath, "app.asar"))) {
      return "electron";
    }
    return "unknown";
  }
  return process.resourcesPath && (0, import_node_fs6.existsSync)((0, import_node_path6.join)(process.resourcesPath, "app.asar")) ? "electron" : "unknown";
}
function inferMacAppRoot() {
  const marker = ".app/Contents/MacOS/";
  const idx = process.execPath.indexOf(marker);
  return idx >= 0 ? process.execPath.slice(0, idx + ".app".length) : null;
}
function safeAppVersion() {
  try {
    return import_electron.app.getVersion();
  } catch {
    return null;
  }
}
function safeAppPath() {
  try {
    return import_electron.app.getAppPath();
  } catch {
    return process.resourcesPath ? (0, import_node_path6.join)(process.resourcesPath, "app.asar") : null;
  }
}
function safeBuildFlavor() {
  const appPath = safeAppPath();
  if (!appPath) return null;
  const parent = (0, import_node_path6.dirname)(appPath);
  if (parent.includes("Nightly")) return "nightly";
  return import_electron.app.isPackaged ? "prod" : "dev";
}
function parseCdpPort(value) {
  const parsed = Number(value ?? "9222");
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 9222;
}
function defaultNativeCapabilities() {
  return {
    inProcessModules: true,
    swiftModules: process.platform === "darwin",
    appKitEmbedding: false,
    childWindowOverlay: false,
    directViewAttach: false,
    metalViews: false,
    nativeHost: false,
    helpers: true
  };
}
function defaultViewCapabilities() {
  return {
    create: false,
    privateViewTree: false,
    webContentsView: false,
    browserViewFallback: typeof import_electron.BrowserWindow.fromId === "function"
  };
}
function normalizeCdpTarget(row) {
  const value = asRecord(row);
  if (!value || typeof value.id !== "string" || typeof value.type !== "string" || typeof value.url !== "string") {
    return null;
  }
  return {
    id: value.id,
    type: value.type,
    url: value.url,
    ...typeof value.title === "string" ? { title: value.title } : {},
    ...typeof value.webSocketDebuggerUrl === "string" ? { webSocketDebuggerUrl: value.webSocketDebuggerUrl } : {}
  };
}
function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}

// src/native-bridge.ts
var import_electron2 = require("electron");
var import_node_child_process2 = require("node:child_process");
var import_node_crypto = require("node:crypto");
var import_node_fs8 = require("node:fs");
var import_node_readline = require("node:readline");

// src/native-paths.ts
var import_node_fs7 = require("node:fs");
var import_node_path7 = require("node:path");
function resolveNativeTweakPath(tweakDir, path) {
  if (typeof path !== "string" || path.trim() === "") throw new Error("native path is required");
  const root = (0, import_node_fs7.realpathSync)(tweakDir);
  const full = (0, import_node_path7.resolve)(tweakDir, path);
  let target;
  try {
    target = (0, import_node_fs7.realpathSync)(full);
  } catch {
    throw new Error("native path does not exist");
  }
  if (!isPathInside(root, target) || target === root) {
    throw new Error("native path must stay inside the tweak directory");
  }
  return target;
}
function isPathInside(parent, target) {
  const rel = (0, import_node_path7.relative)((0, import_node_path7.resolve)(parent), (0, import_node_path7.resolve)(target));
  return rel === "" || !!rel && !rel.startsWith("..") && !(0, import_node_path7.isAbsolute)(rel);
}

// src/native-bridge.ts
var NativeBridge = class {
  constructor(log2, options = {}) {
    this.log = log2;
    this.options = options;
  }
  log;
  options;
  modules = /* @__PURE__ */ new Map();
  instances = /* @__PURE__ */ new Map();
  helpers = /* @__PURE__ */ new Map();
  nativeHostExports = null;
  nativeHostLoadError = null;
  getCapabilities() {
    const host = this.loadNativeHost(false);
    const hostCapabilities = host ? this.readNativeHostCapabilities(host) : {};
    const nativeHost = host !== null;
    return {
      inProcessModules: true,
      swiftModules: process.platform === "darwin",
      appKitEmbedding: Boolean(hostCapabilities.appKitEmbedding),
      childWindowOverlay: Boolean(hostCapabilities.childWindowOverlay),
      directViewAttach: Boolean(hostCapabilities.directViewAttach),
      metalViews: Boolean(hostCapabilities.metalViews),
      nativeHost,
      helpers: true
    };
  }
  loadModule(ctx, options) {
    const id = assertBridgeId(options.id, "native module id");
    const fullPath = resolveTweakPath(ctx, options.path);
    const kind = options.kind ?? inferModuleKind(fullPath);
    if (kind !== "node-addon") {
      throw new Error(
        `${kind} native modules must be loaded through a .node Objective-C++ shim in Codex++ 1.0.0`
      );
    }
    if (!fullPath.endsWith(".node")) {
      throw new Error("node-addon native modules must use a .node file");
    }
    const loaded = require(fullPath);
    const exports2 = selectEntrypoint(loaded, options.entrypoint);
    const key = moduleKey(ctx.id, id);
    this.modules.set(key, { key, tweakId: ctx.id, id, kind, path: fullPath, exports: exports2 });
    this.log("info", `loaded native module ${ctx.id}:${id}`, { kind, path: fullPath });
    return this.moduleRef(ctx.id, id, kind);
  }
  async createPanel(ctx, options) {
    const created = await this.createNativeInstance(ctx, "panel", options.moduleId, options.factory ?? "createPanel", {
      parentWindowId: options.parentWindowId,
      bounds: options.bounds,
      transparent: options.transparent === true,
      passthroughMouse: options.passthroughMouse === true
    });
    return this.panelRef(created);
  }
  async attachView(ctx, options) {
    const created = await this.createNativeInstance(ctx, "view", options.moduleId, options.factory ?? "attachView", {
      parentWindowId: options.parentWindowId,
      bounds: options.bounds,
      zIndex: options.zIndex
    });
    return this.viewRef(created);
  }
  launchHelper(ctx, options) {
    const id = assertBridgeId(options.id, "native helper id");
    if ((options.transport ?? "stdio") !== "stdio") {
      throw new Error("native helpers support only stdio transport in Codex++ 1.0.0");
    }
    if ((options.restart ?? "never") !== "never") {
      throw new Error("native helper restart policies are not available in Codex++ 1.0.0");
    }
    const executable = resolveTweakPath(ctx, options.executable);
    const args = options.args ?? [];
    const env = { ...process.env, ...options.env ?? {} };
    const child = (0, import_node_child_process2.spawn)(executable, args, {
      cwd: ctx.dir,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const key = helperKey(ctx.id, id);
    const helper = {
      key,
      tweakId: ctx.id,
      id,
      child,
      pending: /* @__PURE__ */ new Map()
    };
    this.helpers.set(key, helper);
    const stdout = (0, import_node_readline.createInterface)({ input: child.stdout });
    stdout.on("line", (line) => this.handleHelperLine(helper, line));
    child.stderr.on("data", (chunk) => {
      this.log("warn", `native helper ${ctx.id}:${id} stderr`, String(chunk));
    });
    child.on("exit", (code, signal) => {
      this.log("info", `native helper ${ctx.id}:${id} exited`, { code, signal });
      this.helpers.delete(key);
      for (const request of helper.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(`native helper exited before response`));
      }
      helper.pending.clear();
    });
    child.on("error", (error) => {
      this.log("error", `native helper ${ctx.id}:${id} failed`, error);
      this.helpers.delete(key);
      for (const request of helper.pending.values()) {
        clearTimeout(request.timer);
        request.reject(error);
      }
      helper.pending.clear();
    });
    this.log("info", `launched native helper ${ctx.id}:${id}`, { pid: child.pid, executable });
    return this.helperRef(ctx.id, id, child.pid ?? -1);
  }
  disposeTweak(tweakId) {
    for (const [key, instance] of [...this.instances]) {
      if (instance.tweakId !== tweakId) continue;
      void this.disposeInstance(instance).finally(() => this.instances.delete(key));
    }
    for (const [key, helper] of [...this.helpers]) {
      if (helper.tweakId !== tweakId) continue;
      this.stopHelper(helper);
      this.helpers.delete(key);
    }
    for (const [key, mod] of [...this.modules]) {
      if (mod.tweakId !== tweakId) continue;
      void callOptional(mod.exports, "dispose", []);
      this.modules.delete(key);
    }
  }
  disposeAll() {
    const tweakIds = /* @__PURE__ */ new Set([
      ...[...this.modules.values()].map((item) => item.tweakId),
      ...[...this.instances.values()].map((item) => item.tweakId),
      ...[...this.helpers.values()].map((item) => item.tweakId)
    ]);
    for (const id of tweakIds) this.disposeTweak(id);
  }
  async callInstance(tweakId, kind, id, method, arg) {
    if (kind === "panel") {
      if (method === "setBounds") return this.invokeInstance(tweakId, id, "setBounds", [arg]);
      if (method === "show") return this.invokeInstance(tweakId, id, "show", []);
      if (method === "hide") return this.invokeInstance(tweakId, id, "hide", []);
      if (method === "dispose") return this.disposeInstanceById(tweakId, id);
    }
    if (kind === "view") {
      if (method === "setBounds") return this.invokeInstance(tweakId, id, "setBounds", [arg]);
      if (method === "setVisible") return this.invokeInstance(tweakId, id, "setVisible", [arg]);
      if (method === "dispose") return this.disposeInstanceById(tweakId, id);
    }
    throw new Error(`unknown native ${kind} method: ${method}`);
  }
  async callHelper(tweakId, helperId, method, payload, timeoutMs) {
    if (method === "send") return this.sendHelper(tweakId, helperId, payload);
    if (method === "request") return this.requestHelper(tweakId, helperId, payload, timeoutMs);
    if (method === "stop") return this.stopHelperById(tweakId, helperId);
    throw new Error(`unknown native helper method: ${method}`);
  }
  moduleRef(tweakId, id, kind = this.moduleFor(tweakId, id).kind) {
    return {
      id,
      kind,
      request: (method, payload, timeoutMs) => this.requestModule(tweakId, id, method, payload, timeoutMs),
      dispose: () => this.disposeModule(tweakId, id)
    };
  }
  panelRef(instance) {
    return {
      id: instance.id,
      windowId: instance.windowId,
      setBounds: (bounds) => this.invokeInstance(instance.tweakId, instance.id, "setBounds", [bounds]),
      show: () => this.invokeInstance(instance.tweakId, instance.id, "show", []),
      hide: () => this.invokeInstance(instance.tweakId, instance.id, "hide", []),
      dispose: () => this.disposeInstanceById(instance.tweakId, instance.id)
    };
  }
  viewRef(instance) {
    return {
      id: instance.id,
      setBounds: (bounds) => this.invokeInstance(instance.tweakId, instance.id, "setBounds", [bounds]),
      setVisible: (visible) => this.invokeInstance(instance.tweakId, instance.id, "setVisible", [visible]),
      dispose: () => this.disposeInstanceById(instance.tweakId, instance.id)
    };
  }
  helperRef(tweakId, id, pid) {
    return {
      id,
      pid,
      send: (message) => this.sendHelper(tweakId, id, message),
      request: (message, timeoutMs) => this.requestHelper(tweakId, id, message, timeoutMs),
      stop: () => this.stopHelperById(tweakId, id)
    };
  }
  async requestModule(tweakId, id, method, payload, _timeoutMs) {
    const mod = this.moduleFor(tweakId, id);
    const target = asRecord2(mod.exports);
    const fn = target?.request;
    if (typeof fn === "function") {
      return await fn.call(mod.exports, method, payload);
    }
    const methodFn = target?.[method];
    if (typeof methodFn === "function") {
      return await methodFn.call(mod.exports, payload);
    }
    throw new Error(`native module ${tweakId}:${id} has no request() or ${method}()`);
  }
  async disposeModule(tweakId, id) {
    const key = moduleKey(tweakId, id);
    const mod = this.modules.get(key);
    if (!mod) return;
    await callOptional(mod.exports, "dispose", []);
    this.modules.delete(key);
  }
  async createNativeInstance(ctx, kind, moduleId, factory, options) {
    const target = moduleId ? this.moduleFor(ctx.id, moduleId).exports : this.loadNativeHost(true);
    const fn = asRecord2(target)?.[factory];
    if (typeof fn !== "function") {
      const label = moduleId ? `native module ${ctx.id}:${moduleId}` : "Codex++ native host";
      throw new Error(`${label} has no factory ${factory}()`);
    }
    const parentWindow = typeof options.parentWindowId === "number" ? import_electron2.BrowserWindow.fromId(options.parentWindowId) : import_electron2.BrowserWindow.getFocusedWindow();
    const parentNativeHandle = nativeHandleForWindow(parentWindow);
    const value = await fn.call(target, {
      ...options,
      parentWindowId: windowIdFor(parentWindow),
      parentWebContentsId: webContentsIdFor(parentWindow),
      parentNativeHandle
    });
    const id = typeof asRecord2(value)?.id === "string" ? String(asRecord2(value)?.id) : (0, import_node_crypto.randomUUID)();
    const windowId = typeof asRecord2(value)?.windowId === "number" ? Number(asRecord2(value)?.windowId) : null;
    const instance = {
      key: instanceKey(ctx.id, id),
      tweakId: ctx.id,
      id,
      kind,
      value,
      parentWindowId: windowIdFor(parentWindow),
      windowId,
      disposeBindings: [],
      disposing: false
    };
    this.instances.set(instance.key, instance);
    if (canBindParentWindow(parentWindow)) {
      this.bindInstanceToParent(instance, parentWindow);
      this.syncParentState(instance, parentWindow, "created");
    }
    this.log("info", `created native ${kind} ${ctx.id}:${id}`, {
      moduleId: moduleId ?? "codexpp.native-host",
      factory,
      windowId
    });
    return instance;
  }
  loadNativeHost(required) {
    if (this.nativeHostExports) return this.nativeHostExports;
    if (this.nativeHostLoadError && !required) return null;
    const nativeHostPath = this.options.nativeHostPath;
    if (!nativeHostPath || !(0, import_node_fs8.existsSync)(nativeHostPath)) {
      const error = new Error("Codex++ native host is not installed");
      this.nativeHostLoadError = error;
      if (required) throw error;
      return null;
    }
    try {
      this.nativeHostExports = require(nativeHostPath);
      this.nativeHostLoadError = null;
      this.log("info", "loaded Codex++ native host", { path: nativeHostPath });
      return this.nativeHostExports;
    } catch (error) {
      this.nativeHostLoadError = error instanceof Error ? error : new Error(String(error));
      this.log("error", "failed to load Codex++ native host", this.nativeHostLoadError);
      if (required) throw this.nativeHostLoadError;
      return null;
    }
  }
  readNativeHostCapabilities(host) {
    const getCapabilities = asRecord2(host)?.getCapabilities;
    if (typeof getCapabilities !== "function") return {};
    try {
      const capabilities = getCapabilities.call(host);
      return asRecord2(capabilities) ?? {};
    } catch (error) {
      this.log("warn", "Codex++ native host capability probe failed", error);
      return {};
    }
  }
  async invokeInstance(tweakId, id, method, args) {
    const instance = this.instanceFor(tweakId, id);
    const fn = asRecord2(instance.value)?.[method];
    if (typeof fn === "function") {
      await fn.apply(instance.value, args);
      return;
    }
    if (instance.windowId !== null) {
      const win = import_electron2.BrowserWindow.fromId(instance.windowId);
      if (win && !win.isDestroyed()) {
        if (method === "setBounds") win.setBounds(args[0]);
        else if (method === "show") win.show();
        else if (method === "hide") win.hide();
        else if (method === "setVisible") args[0] ? win.show() : win.hide();
        return;
      }
    }
    throw new Error(`native ${instance.kind} ${tweakId}:${id} does not implement ${method}()`);
  }
  async disposeInstanceById(tweakId, id) {
    const key = instanceKey(tweakId, id);
    const instance = this.instances.get(key);
    if (!instance) return;
    await this.disposeInstance(instance);
    this.instances.delete(key);
  }
  async disposeInstance(instance) {
    if (instance.disposing) return;
    instance.disposing = true;
    for (const dispose of instance.disposeBindings.splice(0)) {
      try {
        dispose();
      } catch {
      }
    }
    await callOptional(instance.value, "dispose", []);
    if (instance.windowId !== null) {
      const win = import_electron2.BrowserWindow.fromId(instance.windowId);
      if (win && !win.isDestroyed()) win.close();
    }
  }
  bindInstanceToParent(instance, parentWindow) {
    const on = (event, listener) => {
      parentWindow.on(event, listener);
      instance.disposeBindings.push(() => parentWindow.off(event, listener));
    };
    const syncBounds = () => this.syncParentState(instance, parentWindow, "bounds");
    const syncFocus = (focused) => this.signalParentState(instance, parentWindow, "focus", { focused });
    const syncVisibility = (visible) => this.signalParentState(instance, parentWindow, "visibility", { visible });
    const disposeWithParent = () => {
      this.log("info", `disposing native ${instance.kind} ${instance.tweakId}:${instance.id}; parent closed`);
      void this.disposeInstanceById(instance.tweakId, instance.id);
    };
    on("move", syncBounds);
    on("resize", syncBounds);
    on("enter-full-screen", syncBounds);
    on("leave-full-screen", syncBounds);
    on("maximize", syncBounds);
    on("unmaximize", syncBounds);
    on("minimize", syncBounds);
    on("restore", syncBounds);
    on("show", () => syncVisibility(true));
    on("hide", () => syncVisibility(false));
    on("focus", () => syncFocus(true));
    on("blur", () => syncFocus(false));
    on("close", disposeWithParent);
    on("closed", disposeWithParent);
  }
  syncParentState(instance, parentWindow, reason) {
    const state = parentWindowState(parentWindow, reason);
    if (!state) return;
    void this.callFirstOptionalInstance(instance, ["syncParent", "parentChanged"], [state]).then((handled) => {
      if (!handled) {
        return this.callFirstOptionalInstance(
          instance,
          ["setParentBounds", "parentBoundsChanged"],
          [state.bounds, state]
        );
      }
      return false;
    }).catch((error) => this.log("warn", `native ${instance.kind} parent sync failed`, error));
  }
  signalParentState(instance, parentWindow, reason, patch) {
    const state = parentWindowState(parentWindow, reason);
    if (!state) return;
    const payload = { ...state, ...patch };
    void this.callFirstOptionalInstance(instance, ["parentStateChanged", "parentChanged"], [payload]).catch((error) => this.log("warn", `native ${instance.kind} parent signal failed`, error));
  }
  async callFirstOptionalInstance(instance, methods, args) {
    const target = asRecord2(instance.value);
    for (const method of methods) {
      const fn = target?.[method];
      if (typeof fn !== "function") continue;
      await fn.apply(instance.value, args);
      return true;
    }
    return false;
  }
  async sendHelper(tweakId, id, message) {
    const helper = this.helperFor(tweakId, id);
    helper.child.stdin.write(`${JSON.stringify(message)}
`);
  }
  async requestHelper(tweakId, id, message, timeoutMs = 1e4) {
    const helper = this.helperFor(tweakId, id);
    const requestId = (0, import_node_crypto.randomUUID)();
    const payload = { id: requestId, message };
    return await new Promise((resolve6, reject) => {
      const timer = setTimeout(() => {
        helper.pending.delete(requestId);
        reject(new Error(`native helper request timed out: ${tweakId}:${id}`));
      }, timeoutMs);
      helper.pending.set(requestId, { resolve: resolve6, reject, timer });
      helper.child.stdin.write(`${JSON.stringify(payload)}
`);
    });
  }
  async stopHelperById(tweakId, id) {
    const key = helperKey(tweakId, id);
    const helper = this.helpers.get(key);
    if (!helper) return;
    this.stopHelper(helper);
    this.helpers.delete(key);
  }
  stopHelper(helper) {
    if (helper.child.killed) return;
    helper.child.kill();
    const timer = setTimeout(() => {
      if (!helper.child.killed) helper.child.kill("SIGKILL");
    }, 1500);
    timer.unref?.();
  }
  handleHelperLine(helper, line) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      this.log("info", `native helper ${helper.tweakId}:${helper.id}`, line);
      return;
    }
    if (typeof payload.id !== "string") return;
    const request = helper.pending.get(payload.id);
    if (!request) return;
    helper.pending.delete(payload.id);
    clearTimeout(request.timer);
    if (payload.error) {
      request.reject(new Error(String(payload.error)));
    } else {
      request.resolve(payload.result);
    }
  }
  moduleFor(tweakId, id) {
    const mod = this.modules.get(moduleKey(tweakId, id));
    if (!mod) throw new Error(`native module is not loaded: ${tweakId}:${id}`);
    return mod;
  }
  instanceFor(tweakId, id) {
    const instance = this.instances.get(instanceKey(tweakId, id));
    if (!instance) throw new Error(`native instance is not loaded: ${tweakId}:${id}`);
    return instance;
  }
  helperFor(tweakId, id) {
    const helper = this.helpers.get(helperKey(tweakId, id));
    if (!helper) throw new Error(`native helper is not running: ${tweakId}:${id}`);
    return helper;
  }
};
function resolveTweakPath(ctx, path) {
  return resolveNativeTweakPath(ctx.dir, path);
}
function inferModuleKind(path) {
  if (path.endsWith(".node")) return "node-addon";
  if (path.endsWith(".dylib")) return "dylib";
  if (path.endsWith(".framework")) return "framework";
  throw new Error("native module path must end in .node, .dylib, or .framework");
}
function selectEntrypoint(loaded, entrypoint) {
  if (!entrypoint) return asRecord2(loaded)?.default ?? loaded;
  const selected = asRecord2(loaded)?.[entrypoint];
  if (selected === void 0) throw new Error(`native module entrypoint not found: ${entrypoint}`);
  return selected;
}
function assertBridgeId(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} may only contain letters, numbers, dots, underscores, and dashes`);
  }
  return value;
}
function moduleKey(tweakId, moduleId) {
  return `${tweakId}:${moduleId}`;
}
function instanceKey(tweakId, id) {
  return `${tweakId}:${id}`;
}
function helperKey(tweakId, id) {
  return `${tweakId}:${id}`;
}
function asRecord2(value) {
  return value && typeof value === "object" ? value : null;
}
async function callOptional(target, method, args) {
  const fn = asRecord2(target)?.[method];
  if (typeof fn === "function") await fn.apply(target, args);
}
function parentWindowState(parentWindow, reason) {
  if (isWindowDestroyed(parentWindow)) return null;
  const bounds = callWindowMethod(parentWindow, "getBounds");
  const contentBounds = callWindowMethod(parentWindow, "getContentBounds");
  return {
    reason,
    windowId: windowIdFor(parentWindow),
    webContentsId: webContentsIdFor(parentWindow),
    bounds,
    contentBounds,
    visible: callWindowMethod(parentWindow, "isVisible") ?? null,
    focused: callWindowMethod(parentWindow, "isFocused") ?? null,
    minimized: callWindowMethod(parentWindow, "isMinimized") ?? null,
    maximized: callWindowMethod(parentWindow, "isMaximized") ?? null,
    fullscreen: callWindowMethod(parentWindow, "isFullScreen") ?? null
  };
}
function nativeHandleForWindow(parentWindow) {
  if (!parentWindow || isWindowDestroyed(parentWindow)) return null;
  const fn = asRecord2(parentWindow)?.getNativeWindowHandle;
  if (typeof fn !== "function") return null;
  try {
    const handle = fn.call(parentWindow);
    return Buffer.isBuffer(handle) ? handle : null;
  } catch {
    return null;
  }
}
function canBindParentWindow(parentWindow) {
  if (!parentWindow || isWindowDestroyed(parentWindow)) return false;
  return typeof asRecord2(parentWindow)?.on === "function" && typeof asRecord2(parentWindow)?.off === "function";
}
function isWindowDestroyed(parentWindow) {
  const fn = asRecord2(parentWindow)?.isDestroyed;
  if (typeof fn !== "function") return false;
  try {
    return Boolean(fn.call(parentWindow));
  } catch {
    return true;
  }
}
function windowIdFor(parentWindow) {
  const id = asRecord2(parentWindow)?.id;
  return typeof id === "number" ? id : null;
}
function webContentsIdFor(parentWindow) {
  const webContents2 = asRecord2(asRecord2(parentWindow)?.webContents);
  const id = webContents2?.id;
  return typeof id === "number" ? id : null;
}
function callWindowMethod(parentWindow, method) {
  const fn = asRecord2(parentWindow)?.[method];
  if (typeof fn !== "function") return null;
  try {
    return fn.call(parentWindow);
  } catch {
    return null;
  }
}

// src/tweak-store.ts
var DEFAULT_TWEAK_STORE_INDEX_URL = "https://b-nnett.github.io/codex-plusplus/store/index.json";
var GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var FULL_SHA_RE = /^[a-f0-9]{40}$/i;
function normalizeGitHubRepo(input) {
  const raw = input.trim();
  if (!raw) throw new Error("GitHub repo is required");
  const ssh = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(raw);
  if (ssh) return normalizeRepoPart(ssh[1]);
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname !== "github.com") throw new Error("Only github.com repositories are supported");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) throw new Error("GitHub repo URL must include owner and repository");
    return normalizeRepoPart(`${parts[0]}/${parts[1]}`);
  }
  return normalizeRepoPart(raw);
}
function normalizeStoreRegistry(input) {
  const registry = input;
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.entries)) {
    throw new Error("Unsupported tweak store registry");
  }
  const entries = registry.entries.map(normalizeStoreEntry);
  entries.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  return {
    schemaVersion: 1,
    generatedAt: typeof registry.generatedAt === "string" ? registry.generatedAt : void 0,
    entries
  };
}
function shuffleStoreEntries(entries, randomIndex = (exclusiveMax) => Math.floor(Math.random() * exclusiveMax)) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`shuffle randomIndex returned ${j}; expected an integer from 0 to ${i}`);
    }
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function normalizeStoreEntry(input) {
  const entry = input;
  if (!entry || typeof entry !== "object") throw new Error("Invalid tweak store entry");
  const repo = normalizeGitHubRepo(String(entry.repo ?? entry.manifest?.githubRepo ?? ""));
  const manifest = entry.manifest;
  if (!manifest?.id || !manifest.name || !manifest.version) {
    throw new Error(`Store entry for ${repo} is missing manifest fields`);
  }
  if (normalizeGitHubRepo(manifest.githubRepo) !== repo) {
    throw new Error(`Store entry ${manifest.id} repo does not match manifest githubRepo`);
  }
  if (!isFullCommitSha(String(entry.approvedCommitSha ?? ""))) {
    throw new Error(`Store entry ${manifest.id} must pin a full approved commit SHA`);
  }
  return {
    id: manifest.id,
    manifest,
    repo,
    approvedCommitSha: String(entry.approvedCommitSha),
    approvedAt: typeof entry.approvedAt === "string" ? entry.approvedAt : "",
    approvedBy: typeof entry.approvedBy === "string" ? entry.approvedBy : "",
    platforms: normalizeStorePlatforms(entry.platforms),
    releaseUrl: optionalGithubUrl(entry.releaseUrl),
    reviewUrl: optionalGithubUrl(entry.reviewUrl)
  };
}
function storeArchiveUrl(entry) {
  if (!isFullCommitSha(entry.approvedCommitSha)) {
    throw new Error(`Store entry ${entry.id} is not pinned to a full commit SHA`);
  }
  return `https://codeload.github.com/${entry.repo}/tar.gz/${entry.approvedCommitSha}`;
}
function isFullCommitSha(value) {
  return FULL_SHA_RE.test(value);
}
function normalizeRepoPart(value) {
  const repo = value.trim().replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!GITHUB_REPO_RE.test(repo)) throw new Error("GitHub repo must be in owner/repo form");
  return repo;
}
function normalizeStorePlatforms(input) {
  if (input === void 0) return void 0;
  if (!Array.isArray(input)) throw new Error("Store entry platforms must be an array");
  const allowed = /* @__PURE__ */ new Set(["darwin", "win32", "linux"]);
  const platforms = Array.from(new Set(input.map((value) => {
    if (typeof value !== "string" || !allowed.has(value)) {
      throw new Error(`Unsupported store platform: ${String(value)}`);
    }
    return value;
  })));
  return platforms.length > 0 ? platforms : void 0;
}
function optionalGithubUrl(value) {
  if (typeof value !== "string" || !value.trim()) return void 0;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") return void 0;
  return url.toString();
}

// src/browser-ui.ts
var import_electron3 = require("electron");
var import_node_crypto2 = require("node:crypto");
var import_node_fs9 = require("node:fs");
var import_node_http = require("node:http");
var import_node_path8 = require("node:path");
var CONNECT_PORT_CHANNEL = "codexpp:browser-ui-connect-app-host";
var BRIDGE_REQUEST_CHANNEL = "codexpp:browser-ui-bridge-request";
var BRIDGE_RESPONSE_CHANNEL = "codexpp:browser-ui-bridge-response";
var MESSAGE_FOR_VIEW_CHANNEL = "codexpp:browser-ui-message-for-view";
var WORKER_MESSAGE_CHANNEL = "codexpp:browser-ui-worker-message";
var SYSTEM_THEME_CHANNEL = "codexpp:browser-ui-system-theme";
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
var activeServer = null;
var activeHost = null;
var activeOptions = null;
var bridgeRequests = /* @__PURE__ */ new Map();
var controlClients = /* @__PURE__ */ new Set();
function maybeStartBrowserUiServer(opts) {
  if (process.env.CODEXPP_BROWSER_UI !== "1") return;
  const port = parsePort(process.env.CODEXPP_BROWSER_UI_PORT, 8765);
  startBrowserUiServer({
    ...opts,
    port,
    host: "127.0.0.1",
    hideMainWindow: process.env.CODEXPP_BROWSER_UI_HIDE_MAIN === "1"
  });
}
function startBrowserUiServer(opts) {
  if (activeServer) return;
  activeOptions = opts;
  installBrowserUiIpcHandlers(opts.log);
  const server = (0, import_node_http.createServer)((req, res) => {
    handleHttpRequest(req, res).catch((error) => {
      opts.log("error", "browser UI request failed", { message: error.message });
      sendText(res, 500, "Internal Server Error\n", "text/plain; charset=utf-8");
    });
  });
  server.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket, head).catch((error) => {
      opts.log("warn", "browser UI websocket upgrade failed", { message: error.message });
      socket.destroy();
    });
  });
  server.on("error", (error) => {
    opts.log("error", "browser UI server failed", { message: error.message });
  });
  server.listen(opts.port, opts.host, () => {
    opts.log("info", `browser UI server listening at http://${opts.host}:${opts.port}/`);
  });
  activeServer = server;
  if (opts.hideMainWindow) {
    for (const delayMs of [500, 1500, 3e3]) {
      const timer = setTimeout(hideVisibleCodexWindows, delayMs);
      timer.unref?.();
    }
  }
}
function installBrowserUiIpcHandlers(log2) {
  import_electron3.ipcMain.removeAllListeners(BRIDGE_RESPONSE_CHANNEL);
  import_electron3.ipcMain.removeAllListeners(MESSAGE_FOR_VIEW_CHANNEL);
  import_electron3.ipcMain.removeAllListeners(WORKER_MESSAGE_CHANNEL);
  import_electron3.ipcMain.removeAllListeners(SYSTEM_THEME_CHANNEL);
  import_electron3.ipcMain.on(BRIDGE_RESPONSE_CHANNEL, (event, payload) => {
    if (!isBrowserUiHostSender(event.sender)) return;
    const response = asRecord3(payload);
    const id = typeof response?.id === "string" ? response.id : "";
    const pending = bridgeRequests.get(id);
    if (!pending) return;
    bridgeRequests.delete(id);
    clearTimeout(pending.timer);
    if (response?.ok === true) {
      pending.resolve(response.value);
    } else {
      pending.reject(new Error(typeof response?.error === "string" ? response.error : "Bridge request failed"));
    }
  });
  import_electron3.ipcMain.on(MESSAGE_FOR_VIEW_CHANNEL, (event, message) => {
    if (!isBrowserUiHostSender(event.sender)) return;
    broadcastControl({ type: "message-for-view", message });
  });
  import_electron3.ipcMain.on(WORKER_MESSAGE_CHANNEL, (event, workerId, message) => {
    if (!isBrowserUiHostSender(event.sender)) return;
    if (typeof workerId !== "string") return;
    broadcastControl({ type: "worker-message", workerId, message });
  });
  import_electron3.ipcMain.on(SYSTEM_THEME_CHANNEL, (event, value) => {
    if (!isBrowserUiHostSender(event.sender)) return;
    broadcastControl({ type: "system-theme-variant-updated", value });
  });
  process.once("exit", () => {
    for (const pending of bridgeRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex++ browser UI server stopped"));
    }
    bridgeRequests.clear();
    for (const client of controlClients) client.close();
    controlClients.clear();
    try {
      if (activeHost && !activeHost.webContents.isDestroyed()) {
        activeHost.webContents.close({ waitForBeforeUnload: false });
      }
    } catch (error) {
      log2("warn", "browser UI host cleanup failed", { message: String(error) });
    }
  });
}
async function handleHttpRequest(req, res) {
  const options = requireOptions();
  const url = requestUrl(req);
  if (!url) {
    sendText(res, 400, "Bad Request\n", "text/plain; charset=utf-8");
    return;
  }
  if (url.pathname === "/codexpp/browser-ui/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (url.pathname === "/codexpp/browser-ui/bridge") {
    if (req.method !== "POST") {
      sendText(res, 405, "Method Not Allowed\n", "text/plain; charset=utf-8");
      return;
    }
    const body = asRecord3(await readJsonBody(req));
    const method = typeof body?.method === "string" ? body.method : "";
    const args = Array.isArray(body?.args) ? body.args : [];
    try {
      const value = await callHiddenBridge(method, args);
      sendJson(res, 200, { ok: true, value });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }
  if (url.pathname === "/codexpp/browser-ui/bridge.js") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed\n", "text/plain; charset=utf-8");
      return;
    }
    const script = browserBridgeScript(await collectInitialState(options));
    sendBuffer(res, 200, Buffer.from(script), MIME_TYPES[".js"], req.method === "HEAD");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed\n", "text/plain; charset=utf-8");
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await browserIndexHtml(options);
    sendBuffer(res, 200, Buffer.from(html), MIME_TYPES[".html"], req.method === "HEAD");
    return;
  }
  const file = webviewFile(url.pathname);
  if (!file) {
    sendText(res, 404, "Not Found\n", "text/plain; charset=utf-8");
    return;
  }
  const content = (0, import_node_fs9.readFileSync)(file);
  sendBuffer(res, 200, content, mimeType(file), req.method === "HEAD");
}
async function handleUpgrade(req, socket, head) {
  const url = requestUrl(req);
  if (!url) throw new Error("bad websocket URL");
  if (url.pathname !== "/codexpp/browser-ui/rpc" && url.pathname !== "/codexpp/browser-ui/control") {
    socket.destroy();
    return;
  }
  const ws = acceptWebSocket(req, socket, head);
  if (url.pathname === "/codexpp/browser-ui/control") {
    controlClients.add(ws);
    ws.onClose(() => controlClients.delete(ws));
    ws.sendJson({ type: "hello" });
    return;
  }
  const host = await ensureBrowserUiHost();
  const { port1, port2 } = new import_electron3.MessageChannelMain();
  host.webContents.postMessage(CONNECT_PORT_CHANNEL, {}, [port2]);
  bridgeMessagePortToWebSocket(port1, ws);
}
async function browserIndexHtml(options) {
  const indexPath = (0, import_node_path8.join)(webviewRoot(), "index.html");
  let html = relaxBrowserUiCsp((0, import_node_fs9.readFileSync)(indexPath, "utf8"));
  const shim = `<script src="/codexpp/browser-ui/bridge.js"></script>`;
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${shim}
  </head>`);
  } else {
    html = `${shim}
${html}`;
  }
  return html;
}
function relaxBrowserUiCsp(html) {
  return html.replace(
    /(<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=")([^"]*)(")/,
    (_match, prefix, content, suffix) => {
      const directives = parseCspDirectives(decodeHtmlAttribute(content));
      directives.set("child-src", "'self' blob: data: http: https:");
      directives.set("frame-src", "'self' blob: data: http: https:");
      directives.set("connect-src", "'self' http: https: ws: wss: sentry-ipc:");
      return `${prefix}${encodeHtmlAttribute(formatCspDirectives(directives))}${suffix}`;
    }
  );
}
function parseCspDirectives(content) {
  const directives = /* @__PURE__ */ new Map();
  for (const part of content.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split(/\s+/);
    if (!name) continue;
    directives.set(name, rest.join(" "));
  }
  return directives;
}
function formatCspDirectives(directives) {
  return [...directives.entries()].map(([name, value]) => value ? `${name} ${value}` : name).join("; ");
}
function decodeHtmlAttribute(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function encodeHtmlAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
async function collectInitialState(options) {
  await ensureBrowserUiHost();
  const [snapshot, systemThemeVariant, sentryInitOptions, buildFlavor, usesOwlAppShell] = await Promise.all([
    callHiddenBridge("snapshot", []),
    callHiddenBridge("systemTheme", []),
    callHiddenBridge("sentryOptions", []),
    callHiddenBridge("buildFlavor", []),
    callHiddenBridge("usesOwlAppShell", [])
  ]);
  if (options.hideMainWindow) hideVisibleCodexWindows();
  return {
    snapshot: asPlainObject(snapshot),
    systemThemeVariant: typeof systemThemeVariant === "string" ? systemThemeVariant : currentSystemThemeVariant(),
    sentryInitOptions,
    buildFlavor,
    usesOwlAppShell: usesOwlAppShell === true,
    platform: process.platform,
    arch: process.arch
  };
}
async function ensureBrowserUiHost() {
  if (activeHost && !activeHost.webContents.isDestroyed()) return activeHost;
  const options = requireOptions();
  const services = await waitForWindowServices(options);
  const windowManager = services.windowManager;
  if (!windowManager?.registerWindow) {
    throw new Error("Codex window registration services are unavailable");
  }
  const view = new import_electron3.BrowserView({
    webPreferences: {
      preload: windowManager.options?.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: windowManager.options?.allowDevtools
    }
  });
  const windowLike = makeWindowLikeForView(view);
  windowManager.registerWindow(windowLike, "local", false, "secondary");
  const context = services.getContextForWebContents?.(view.webContents) ?? services.getContext?.("local");
  context?.registerWindow?.(windowLike);
  await view.webContents.loadURL("about:blank");
  activeHost = { view, webContents: view.webContents };
  view.webContents.once("destroyed", () => {
    if (activeHost?.webContents === view.webContents) activeHost = null;
  });
  options.log("info", "browser UI hidden host ready", { webContentsId: view.webContents.id });
  return activeHost;
}
async function waitForWindowServices(options) {
  const started = Date.now();
  while (Date.now() - started < 3e4) {
    const services = options.getWindowServices();
    if (services?.windowManager?.registerWindow && (services.getContext || services.getContextForWebContents)) {
      return services;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Codex window services");
}
function callHiddenBridge(method, args) {
  assertBridgeMethod(method);
  return ensureBrowserUiHost().then((host) => {
    const id = (0, import_node_crypto2.randomUUID)();
    return new Promise((resolve6, reject) => {
      const timer = setTimeout(() => {
        bridgeRequests.delete(id);
        reject(new Error(`Timed out waiting for browser UI bridge method: ${method}`));
      }, 15e3);
      bridgeRequests.set(id, { resolve: resolve6, reject, timer });
      host.webContents.send(BRIDGE_REQUEST_CHANNEL, { id, method, args });
    });
  });
}
function bridgeMessagePortToWebSocket(port, ws) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      port.postMessage(null);
    } catch {
    }
    try {
      port.close();
    } catch {
    }
    ws.close();
  };
  port.start();
  port.on("message", (event) => {
    if (closed) return;
    if (event.data == null) {
      close();
      return;
    }
    if (typeof event.data === "string") {
      ws.sendText(event.data);
    }
  });
  port.on("close", close);
  ws.onText((text) => {
    if (closed) return;
    port.postMessage(text);
  });
  ws.onClose(close);
}
function broadcastControl(payload) {
  for (const client of [...controlClients]) {
    try {
      client.sendJson(payload);
    } catch {
      client.close();
      controlClients.delete(client);
    }
  }
}
function browserBridgeScript(state) {
  return `
(() => {
  const initialState = ${safeJson(state)};
  const snapshot = new Map(Object.entries(initialState.snapshot || {}));
  const workerSubscribers = new Map();
  const themeSubscribers = new Set();
  const browserSidebarSnapshots = new Map();
  const browserSidebarSeededLocalServers = new Set();
  let systemThemeVariant = initialState.systemThemeVariant || "light";

  window.__codexppBrowserUi = true;
  installBrowserUiWebviewShim();

  const control = new WebSocket(new URL("/codexpp/browser-ui/control", location.href));
  control.addEventListener("message", (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type === "message-for-view") {
      const message = payload.message;
      if (message && message.type === "shared-object-updated") {
        if (message.value === undefined) snapshot.delete(message.key);
        else snapshot.set(message.key, message.value);
      }
      rememberBrowserSidebarHostMessage(message);
      window.dispatchEvent(new MessageEvent("message", { data: message }));
    } else if (payload.type === "worker-message") {
      const subs = workerSubscribers.get(payload.workerId);
      if (subs) for (const fn of [...subs]) fn(payload.message);
    } else if (payload.type === "system-theme-variant-updated") {
      systemThemeVariant = payload.value;
      for (const fn of [...themeSubscribers]) fn();
    }
  });

  async function bridge(method, args = []) {
    const res = await fetch("/codexpp/browser-ui/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, args }),
    });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "Codex++ browser bridge failed");
    return body.value;
  }

  function legacyBrowserTabId(conversationId) {
    return String(conversationId || "new-conversation") + ":legacy";
  }

  function browserSidebarKey(conversationId, browserTabId) {
    return String(conversationId || "new-conversation") + "::" + String(browserTabId || legacyBrowserTabId(conversationId));
  }

  function normalizeBrowserUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).href;
    } catch {}
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;
    try {
      return new URL("https://" + raw).href;
    } catch {
      return raw;
    }
  }

  function browserTitleForUrl(url) {
    if (!url) return "New tab";
    try {
      const host = new URL(url).hostname.replace(/^www\\./, "");
      return host || url;
    } catch {
      return url;
    }
  }

  function makeBrowserSidebarSnapshot(url, patch = {}) {
    const normalized = normalizeBrowserUrl(url);
    return {
      tabType: normalized ? "web" : "new-tab-page",
      isSuspended: false,
      title: normalized ? browserTitleForUrl(normalized) : "New tab",
      url: normalized,
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoomPercent: 100,
      commentModeDisabledReason: null,
      interactionMode: "browse",
      annotationEditorMode: "comment",
      isAnnotationAddModifierPressed: false,
      isOriginalViewEnabled: false,
      isTweaksEditorOpen: false,
      comments: [],
      ...patch,
    };
  }

  function dispatchBrowserSidebarMessage(message) {
    window.dispatchEvent(new MessageEvent("message", { data: message }));
  }

  function seedBrowserSidebarLocalServers(conversationId) {
    if (!conversationId || browserSidebarSeededLocalServers.has(conversationId)) return;
    browserSidebarSeededLocalServers.add(conversationId);
    queueMicrotask(() => {
      dispatchBrowserSidebarMessage({
        type: "browser-sidebar-local-servers",
        conversationId,
        state: { isLoading: false, servers: [], hiddenServers: [] },
      });
    });
  }

  function rememberBrowserSidebarHostMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "browser-sidebar-state") {
      const conversationId = message.conversationId;
      if (!conversationId || !message.snapshot) return;
      browserSidebarSnapshots.set(browserSidebarKey(conversationId, message.browserTabId), message.snapshot);
    } else if (message.type === "browser-sidebar-local-servers") {
      if (message.conversationId) browserSidebarSeededLocalServers.add(message.conversationId);
    }
  }

  function sendBrowserSidebarSnapshot(conversationId, browserTabId, snapshotPatch) {
    if (!conversationId) return;
    const key = browserSidebarKey(conversationId, browserTabId);
    const previous = browserSidebarSnapshots.get(key) || makeBrowserSidebarSnapshot("");
    const next = { ...previous, ...snapshotPatch };
    browserSidebarSnapshots.set(key, next);
    dispatchBrowserSidebarMessage({
      type: "browser-sidebar-state",
      conversationId,
      ...(browserTabId ? { browserTabId } : {}),
      snapshot: next,
    });
  }

  function setBrowserSidebarUrl(conversationId, browserTabId, url, isLoading = false) {
    const normalized = normalizeBrowserUrl(url);
    sendBrowserSidebarSnapshot(conversationId, browserTabId, makeBrowserSidebarSnapshot(normalized, { isLoading }));
  }

  function findBrowserSidebarFrame(conversationId, browserTabId) {
    const selector = "[data-browser-sidebar-conversation-id='" + cssEscape(conversationId) + "'][data-browser-sidebar-browser-tab-id='" + cssEscape(browserTabId || legacyBrowserTabId(conversationId)) + "']";
    return document.querySelector(selector);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
    return String(value).replace(/['\\\\]/g, "\\\\$&");
  }

  function handleBrowserSidebarViewMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "browser-sidebar-sync") {
      const payload = message.payload || {};
      seedBrowserSidebarLocalServers(payload.conversationId);
      return;
    }
    if (message.type === "browser-sidebar-owner-sync") {
      seedBrowserSidebarLocalServers(message.conversationId);
      return;
    }
    if (message.type !== "browser-sidebar-command") return;

    const conversationId = message.conversationId;
    const browserTabId = message.browserTabId;
    const command = message.command || {};
    seedBrowserSidebarLocalServers(conversationId);

    if (command.type === "navigate") {
      const normalized = normalizeBrowserUrl(command.url);
      setBrowserSidebarUrl(conversationId, browserTabId, normalized, true);
      queueMicrotask(() => {
        const frame = findBrowserSidebarFrame(conversationId, browserTabId);
        if (!frame || !normalized || frame.getURL?.() === normalized) return;
        frame.loadURL?.(normalized);
      });
      window.setTimeout(() => setBrowserSidebarUrl(conversationId, browserTabId, normalized, false), 500);
    } else if (command.type === "reload") {
      const frame = findBrowserSidebarFrame(conversationId, browserTabId);
      frame?.reload?.();
      const current = browserSidebarSnapshots.get(browserSidebarKey(conversationId, browserTabId));
      if (current?.url) {
        sendBrowserSidebarSnapshot(conversationId, browserTabId, { ...current, isLoading: true });
        window.setTimeout(() => sendBrowserSidebarSnapshot(conversationId, browserTabId, { ...current, isLoading: false }), 250);
      }
    } else if (command.type === "go-back") {
      findBrowserSidebarFrame(conversationId, browserTabId)?.goBack?.();
    } else if (command.type === "go-forward") {
      findBrowserSidebarFrame(conversationId, browserTabId)?.goForward?.();
    } else if (command.type === "stop") {
      const current = browserSidebarSnapshots.get(browserSidebarKey(conversationId, browserTabId));
      if (current) sendBrowserSidebarSnapshot(conversationId, browserTabId, { ...current, isLoading: false });
    } else if (command.type === "reset" || command.type === "close-tab") {
      sendBrowserSidebarSnapshot(conversationId, browserTabId, makeBrowserSidebarSnapshot(""));
    }
  }

  window.codexWindowType = "electron";
  window.electronBridge = {
    windowType: "electron",
    sendMessageFromView: (message) => {
      if (message && message.type === "shared-object-set") snapshot.set(message.key, message.value);
      handleBrowserSidebarViewMessage(message);
      return bridge("sendMessageFromView", [message]);
    },
    getPathForFile: () => null,
    sendWorkerMessageFromView: (workerId, message) => bridge("sendWorkerMessageFromView", [workerId, message]),
    subscribeToWorkerMessages: (workerId, handler) => {
      let subs = workerSubscribers.get(workerId);
      if (!subs) {
        subs = new Set();
        workerSubscribers.set(workerId, subs);
        bridge("subscribeWorkerMessages", [workerId]).catch(console.error);
      }
      subs.add(handler);
      return () => {
        const current = workerSubscribers.get(workerId);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) {
          workerSubscribers.delete(workerId);
          bridge("unsubscribeWorkerMessages", [workerId]).catch(console.error);
        }
      };
    },
    showContextMenu: (items) => bridge("showContextMenu", [items]),
    showApplicationMenu: (menuId, x, y) => bridge("showApplicationMenu", [menuId, x, y]),
    getFastModeRolloutMetrics: (params) => bridge("getFastModeRolloutMetrics", [params]),
    getSharedObjectSnapshotValue: (key) => snapshot.get(key),
    getSystemThemeVariant: () => systemThemeVariant,
    subscribeToSystemThemeVariant: (handler) => {
      themeSubscribers.add(handler);
      return () => themeSubscribers.delete(handler);
    },
    triggerSentryTestError: () => bridge("triggerSentryTestError", []),
    getSentryInitOptions: () => null,
    getAppSessionId: () => null,
    getBuildFlavor: () => initialState.buildFlavor,
    isIntelMacBuild: () => initialState.platform === "darwin" && initialState.arch === "x64",
    usesOwlAppShell: () => initialState.usesOwlAppShell,
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "connect-app-host") return;
    const port = event.data.port;
    if (!port) return;
    const ws = new WebSocket(new URL("/codexpp/browser-ui/rpc", location.href));
    ws.addEventListener("message", (message) => port.postMessage(message.data));
    ws.addEventListener("close", () => {
      try { port.postMessage(null); } catch {}
      try { port.close(); } catch {}
    });
    ws.addEventListener("open", () => {
      port.onmessage = (message) => {
        if (message.data == null) {
          ws.close();
          return;
        }
        ws.send(message.data);
      };
      port.start && port.start();
    });
  });

  function installBrowserUiWebviewShim() {
    if (window.__codexppWebviewShimInstalled) return;
    window.__codexppWebviewShimInstalled = true;
    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function(tagName, options) {
      if (String(tagName).toLowerCase() !== "webview") {
        return originalCreateElement.call(this, tagName, options);
      }
      return createWebviewIframe(this);
    };

    function createWebviewIframe(doc) {
      const iframe = originalCreateElement.call(doc, "iframe");
      iframe.dataset.codexppWebviewShim = "true";
      iframe.style.border = "0";
      iframe.style.display = "block";
      iframe.style.backgroundColor = "#fff";
      iframe.setAttribute("allow", "autoplay; clipboard-read; clipboard-write; display-capture; fullscreen; microphone; camera");
      const nativeSetAttribute = iframe.setAttribute.bind(iframe);
      const nativeGetAttribute = iframe.getAttribute.bind(iframe);

      try {
        Object.defineProperty(iframe, "tagName", { configurable: true, get: () => "WEBVIEW" });
        Object.defineProperty(iframe, "nodeName", { configurable: true, get: () => "WEBVIEW" });
      } catch {}

      const emit = (type, extra = {}) => {
        const event = new Event(type);
        Object.assign(event, extra);
        iframe.dispatchEvent(event);
      };
      const currentUrl = () => iframe.dataset.codexppRequestedSrc || nativeGetAttribute("src") || "about:blank";
      const actualFrameUrl = (url) => {
        const requested = String(url || "about:blank");
        if (!shouldBreakRecursiveFrameLoad(requested)) return requested;
        try {
          const next = new URL(requested, location.href);
          next.searchParams.set("__codexpp_frame_depth", String(frameAncestorDepth() + 1));
          return next.href;
        } catch {
          return requested;
        }
      };
      const setFrameUrl = (url) => {
        const requested = String(url || "about:blank");
        iframe.dataset.codexppRequestedSrc = requested;
        nativeSetAttribute("src", actualFrameUrl(requested));
      };
      const navigate = (url) => {
        const next = String(url || "about:blank");
        emit("did-start-loading", { url: next });
        setFrameUrl(next);
      };

      iframe.setAttribute = (name, value) => {
        if (String(name).toLowerCase() === "src") {
          setFrameUrl(value);
          return;
        }
        nativeSetAttribute(name, value);
      };

      try {
        Object.defineProperty(iframe, "src", {
          configurable: true,
          get: () => currentUrl(),
          set: (value) => setFrameUrl(value),
        });
      } catch {}

      iframe.addEventListener("load", () => {
        const url = currentUrl();
        emit("dom-ready", { url });
        emit("did-navigate", { url });
        emit("did-stop-loading", { url });
        emit("did-finish-load", { url });
        let title = "";
        try {
          title = iframe.contentDocument?.title || "";
        } catch {}
        const conversationId = iframe.getAttribute("data-browser-sidebar-conversation-id");
        const browserTabId = iframe.getAttribute("data-browser-sidebar-browser-tab-id");
        if (conversationId) {
          sendBrowserSidebarSnapshot(conversationId, browserTabId, makeBrowserSidebarSnapshot(url, {
            title: title || browserTitleForUrl(url),
            isLoading: false,
          }));
        }
        if (title) emit("page-title-updated", { title });
      });
      iframe.addEventListener("error", () => {
        emit("did-fail-load", { errorCode: -2, errorDescription: "iframe load failed", validatedURL: currentUrl() });
        emit("did-stop-loading", { url: currentUrl() });
      });

      Object.defineProperties(iframe, {
        destroy: { value: () => iframe.remove() },
        getURL: { value: () => currentUrl() },
        getTitle: {
          value: () => {
            try {
              return iframe.contentDocument?.title || "";
            } catch {
              return "";
            }
          },
        },
        loadURL: { value: (url) => { navigate(url); return Promise.resolve(); } },
        reload: {
          value: () => {
            try {
              iframe.contentWindow?.location.reload();
            } catch {
              navigate(currentUrl());
            }
          },
        },
        stop: { value: () => {} },
        canGoBack: { value: () => false },
        canGoForward: { value: () => false },
        goBack: {
          value: () => {
            try {
              iframe.contentWindow?.history.back();
            } catch {}
          },
        },
        goForward: {
          value: () => {
            try {
              iframe.contentWindow?.history.forward();
            } catch {}
          },
        },
        executeJavaScript: {
          value: (code) => {
            try {
              return Promise.resolve(iframe.contentWindow?.eval(String(code)));
            } catch (error) {
              return Promise.reject(error);
            }
          },
        },
        insertCSS: { value: () => Promise.resolve("") },
        openDevTools: { value: () => {} },
        closeDevTools: { value: () => {} },
        isDevToolsOpened: { value: () => false },
        send: { value: () => {} },
      });

      return iframe;
    }

    function frameAncestorDepth() {
      let depth = 0;
      let current = window;
      const seen = new Set();
      while (current && !seen.has(current)) {
        seen.add(current);
        let parent;
        try {
          parent = current.parent;
        } catch {
          break;
        }
        if (parent === current) break;
        depth += 1;
        current = parent;
      }
      return depth;
    }

    function shouldBreakRecursiveFrameLoad(url) {
      let target;
      try {
        target = new URL(url, location.href).href;
      } catch {
        return false;
      }
      let current = window;
      const seen = new Set();
      while (current && !seen.has(current)) {
        seen.add(current);
        try {
          if (new URL(current.location.href).href === target) return true;
          if (current.parent === current) break;
          current = current.parent;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
})();
`;
}
function hideVisibleCodexWindows() {
  if (process.platform === "darwin") {
    try {
      import_electron3.app.hide();
    } catch {
    }
  }
  for (const win of import_electron3.BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    if (activeHost && win.webContents.id === activeHost.webContents.id) continue;
    if (!win.isVisible()) continue;
    try {
      win.hide();
    } catch {
    }
  }
}
function makeWindowLikeForView(view) {
  const viewBounds = () => view.getBounds();
  return {
    id: view.webContents.id,
    webContents: view.webContents,
    on: (event, listener) => {
      if (event === "closed") view.webContents.once("destroyed", listener);
      else view.webContents.on(event, listener);
      return view;
    },
    once: (event, listener) => {
      view.webContents.once(event, listener);
      return view;
    },
    off: (event, listener) => {
      view.webContents.off(event, listener);
      return view;
    },
    removeListener: (event, listener) => {
      view.webContents.removeListener(event, listener);
      return view;
    },
    isDestroyed: () => view.webContents.isDestroyed(),
    isFocused: () => view.webContents.isFocused(),
    focus: () => view.webContents.focus(),
    show: () => {
    },
    hide: () => {
    },
    getBounds: viewBounds,
    getContentBounds: viewBounds,
    getSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    getContentSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    setTitle: () => {
    },
    getTitle: () => "",
    setRepresentedFilename: () => {
    },
    setDocumentEdited: () => {
    },
    setWindowButtonVisibility: () => {
    }
  };
}
function acceptWebSocket(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") throw new Error("missing Sec-WebSocket-Key");
  const accept = (0, import_node_crypto2.createHash)("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n"
    ].join("\r\n")
  );
  const ws = new WebSocketConnection(socket);
  if (head.length > 0) ws.acceptHead(head);
  return ws;
}
var WebSocketConnection = class {
  constructor(socket) {
    this.socket = socket;
    socket.on("data", (chunk) => this.acceptHead(chunk));
    socket.on("close", () => this.emitClose());
    socket.on("error", () => this.emitClose());
  }
  socket;
  buffer = Buffer.alloc(0);
  textHandlers = /* @__PURE__ */ new Set();
  closeHandlers = /* @__PURE__ */ new Set();
  closed = false;
  acceptHead(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.readFrames();
  }
  onText(handler) {
    this.textHandlers.add(handler);
  }
  onClose(handler) {
    this.closeHandlers.add(handler);
  }
  sendJson(payload) {
    this.sendText(JSON.stringify(payload));
  }
  sendText(text) {
    this.sendFrame(1, Buffer.from(text, "utf8"));
  }
  close() {
    if (this.closed) return;
    try {
      this.sendFrame(8, Buffer.alloc(0));
    } catch {
    }
    this.closed = true;
    this.socket.end();
    this.emitClose();
  }
  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 15;
      const masked = (second & 128) !== 0;
      let length = second & 127;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const high = this.buffer.readUInt32BE(offset);
        const low = this.buffer.readUInt32BE(offset + 4);
        if (high !== 0) {
          this.close();
          return;
        }
        length = low;
        offset += 8;
      }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      const mask = masked ? this.buffer.subarray(maskOffset, maskOffset + 4) : null;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      if (opcode === 8) {
        this.close();
      } else if (opcode === 9) {
        this.sendFrame(10, payload);
      } else if (opcode === 1) {
        const text = payload.toString("utf8");
        for (const handler of [...this.textHandlers]) handler(text);
      }
    }
  }
  sendFrame(opcode, payload) {
    if (this.closed && opcode !== 8) return;
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([128 | opcode, length]);
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 128 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 128 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }
  emitClose() {
    if (!this.closed) this.closed = true;
    for (const handler of [...this.closeHandlers]) handler();
    this.closeHandlers.clear();
    this.textHandlers.clear();
  }
};
function requestUrl(req) {
  try {
    return new URL(req.url ?? "/", "http://127.0.0.1");
  } catch {
    return null;
  }
}
function readJsonBody(req) {
  return new Promise((resolve6, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve6(null);
        return;
      }
      try {
        resolve6(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
function sendJson(res, status, body) {
  sendBuffer(res, status, Buffer.from(JSON.stringify(body)), MIME_TYPES[".json"], false);
}
function sendText(res, status, body, contentType) {
  sendBuffer(res, status, Buffer.from(body), contentType, false);
}
function sendBuffer(res, status, body, contentType, headOnly) {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-store"
  });
  if (headOnly) res.end();
  else res.end(body);
}
function webviewRoot() {
  return (0, import_node_path8.join)(process.resourcesPath, "app.asar", "webview");
}
function webviewFile(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("\0")) return null;
  const root = webviewRoot();
  const file = (0, import_node_path8.normalize)((0, import_node_path8.join)(root, cleanPath));
  const rel = (0, import_node_path8.relative)(root, file);
  if (rel.startsWith("..") || rel === "") return null;
  if (!(0, import_node_fs9.existsSync)(file) || !(0, import_node_fs9.statSync)(file).isFile()) return null;
  return file;
}
function mimeType(file) {
  const dot = file.lastIndexOf(".");
  const ext = dot >= 0 ? file.slice(dot).toLowerCase() : "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
function requireOptions() {
  if (!activeOptions) throw new Error("Codex++ browser UI server is not configured");
  return activeOptions;
}
function isBrowserUiHostSender(sender) {
  return !!activeHost && !activeHost.webContents.isDestroyed() && sender.id === activeHost.webContents.id;
}
function assertBridgeMethod(method) {
  if (!/^[a-zA-Z0-9._:-]+$/.test(method)) throw new Error("invalid bridge method");
}
function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}
function asRecord3(value) {
  return value && typeof value === "object" ? value : null;
}
function asPlainObject(value) {
  const record = asRecord3(value);
  return record && !Array.isArray(record) ? record : {};
}
function currentSystemThemeVariant() {
  return import_electron3.nativeTheme.shouldUseDarkColors ? "dark" : "light";
}
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function delay(ms) {
  return new Promise((resolve6) => setTimeout(resolve6, ms));
}

// src/main.ts
var userRoot = process.env.CODEX_PLUSPLUS_USER_ROOT;
var runtimeDir = process.env.CODEX_PLUSPLUS_RUNTIME;
if (!userRoot || !runtimeDir) {
  throw new Error(
    "codex-plusplus runtime started without CODEX_PLUSPLUS_USER_ROOT/RUNTIME envs"
  );
}
var PRELOAD_PATH = (0, import_node_path9.resolve)(runtimeDir, "preload.js");
var TWEAKS_DIR = (0, import_node_path9.join)(userRoot, "tweaks");
var LOG_DIR = (0, import_node_path9.join)(userRoot, "log");
var LOG_FILE = (0, import_node_path9.join)(LOG_DIR, "main.log");
var CONFIG_FILE = (0, import_node_path9.join)(userRoot, "config.json");
var CODEX_CONFIG_FILE = (0, import_node_path9.join)((0, import_node_os2.homedir)(), ".codex", "config.toml");
var INSTALLER_STATE_FILE = (0, import_node_path9.join)(userRoot, "state.json");
var UPDATE_MODE_FILE = (0, import_node_path9.join)(userRoot, "update-mode.json");
var SELF_UPDATE_STATE_FILE = (0, import_node_path9.join)(userRoot, "self-update-state.json");
var SIGNED_CODEX_BACKUP = (0, import_node_path9.join)(userRoot, "backup", "Codex.app");
var CODEX_PLUSPLUS_VERSION = "1.0.0";
var CODEX_PLUSPLUS_REPO = "b-nnett/codex-plusplus";
var TWEAK_STORE_INDEX_URL = process.env.CODEX_PLUSPLUS_STORE_INDEX_URL ?? DEFAULT_TWEAK_STORE_INDEX_URL;
var CODEX_WINDOW_SERVICES_KEY = "__codexpp_window_services__";
(0, import_node_fs10.mkdirSync)(LOG_DIR, { recursive: true });
(0, import_node_fs10.mkdirSync)(TWEAKS_DIR, { recursive: true });
if (process.env.CODEXPP_REMOTE_DEBUG === "1") {
  const port = process.env.CODEXPP_REMOTE_DEBUG_PORT ?? "9222";
  import_electron4.app.commandLine.appendSwitch("remote-debugging-port", port);
  log("info", `remote debugging enabled on port ${port}`);
}
function readState() {
  try {
    return JSON.parse((0, import_node_fs10.readFileSync)(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeState(s) {
  try {
    (0, import_node_fs10.writeFileSync)(CONFIG_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    log("warn", "writeState failed:", String(e.message));
  }
}
function isCodexPlusPlusAutoUpdateEnabled() {
  return readState().codexPlusPlus?.autoUpdate !== false;
}
function setCodexPlusPlusAutoUpdate(enabled) {
  const s = readState();
  s.codexPlusPlus ??= {};
  s.codexPlusPlus.autoUpdate = enabled;
  writeState(s);
}
function setCodexPlusPlusUpdateConfig(config) {
  const s = readState();
  s.codexPlusPlus ??= {};
  if (config.updateChannel) s.codexPlusPlus.updateChannel = config.updateChannel;
  if ("updateRepo" in config) s.codexPlusPlus.updateRepo = cleanOptionalString(config.updateRepo);
  if ("updateRef" in config) s.codexPlusPlus.updateRef = cleanOptionalString(config.updateRef);
  writeState(s);
}
function isCodexPlusPlusSafeModeEnabled() {
  return readState().codexPlusPlus?.safeMode === true;
}
function isTweakEnabled(id) {
  const s = readState();
  if (s.codexPlusPlus?.safeMode === true) return false;
  return s.tweaks?.[id]?.enabled !== false;
}
function setTweakEnabled(id, enabled) {
  const s = readState();
  s.tweaks ??= {};
  s.tweaks[id] = { ...s.tweaks[id], enabled };
  writeState(s);
}
function readInstallerState() {
  try {
    return JSON.parse((0, import_node_fs10.readFileSync)(INSTALLER_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}
function readSelfUpdateState() {
  try {
    return JSON.parse((0, import_node_fs10.readFileSync)(SELF_UPDATE_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeSelfUpdateState(state) {
  try {
    (0, import_node_fs10.writeFileSync)(SELF_UPDATE_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log("warn", "writeSelfUpdateState failed:", String(e.message));
  }
}
function cleanOptionalString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed ? trimmed : void 0;
}
function isPathInside2(parent, target) {
  const rel = (0, import_node_path9.relative)((0, import_node_path9.resolve)(parent), (0, import_node_path9.resolve)(target));
  return rel === "" || !!rel && !rel.startsWith("..") && !(0, import_node_path9.isAbsolute)(rel);
}
function log(level, ...args) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level}] ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}
`;
  try {
    appendCappedLog(LOG_FILE, line);
  } catch {
  }
  if (level === "error") console.error("[codex-plusplus]", ...args);
}
function installSparkleUpdateHook() {
  if (process.platform !== "darwin") return;
  const Module = require("node:module");
  const originalLoad = Module._load;
  if (typeof originalLoad !== "function") return;
  Module._load = function codexPlusPlusModuleLoad(request, parent, isMain) {
    const loaded = originalLoad.apply(this, [request, parent, isMain]);
    if (typeof request === "string" && /sparkle(?:\.node)?$/i.test(request)) {
      wrapSparkleExports(loaded);
    }
    return loaded;
  };
}
function wrapSparkleExports(loaded) {
  if (!loaded || typeof loaded !== "object") return;
  const exports2 = loaded;
  if (exports2.__codexppSparkleWrapped) return;
  exports2.__codexppSparkleWrapped = true;
  for (const name of ["installUpdatesIfAvailable"]) {
    const fn = exports2[name];
    if (typeof fn !== "function") continue;
    exports2[name] = function codexPlusPlusSparkleWrapper(...args) {
      prepareSignedCodexForSparkleInstall();
      return Reflect.apply(fn, this, args);
    };
  }
  if (exports2.default && exports2.default !== exports2) {
    wrapSparkleExports(exports2.default);
  }
}
function prepareSignedCodexForSparkleInstall() {
  if (process.platform !== "darwin") return;
  if ((0, import_node_fs10.existsSync)(UPDATE_MODE_FILE)) {
    log("info", "Sparkle update prep skipped; update mode already active");
    return;
  }
  if (!(0, import_node_fs10.existsSync)(SIGNED_CODEX_BACKUP)) {
    log("warn", "Sparkle update prep skipped; signed Codex.app backup is missing");
    return;
  }
  if (!isDeveloperIdSignedApp(SIGNED_CODEX_BACKUP)) {
    log("warn", "Sparkle update prep skipped; Codex.app backup is not Developer ID signed");
    return;
  }
  const state = readInstallerState();
  const appRoot = state?.appRoot ?? inferMacAppRoot2();
  if (!appRoot) {
    log("warn", "Sparkle update prep skipped; could not infer Codex.app path");
    return;
  }
  const mode = {
    enabledAt: (/* @__PURE__ */ new Date()).toISOString(),
    appRoot,
    codexVersion: state?.codexVersion ?? null
  };
  (0, import_node_fs10.writeFileSync)(UPDATE_MODE_FILE, JSON.stringify(mode, null, 2));
  try {
    (0, import_node_child_process3.execFileSync)("ditto", [SIGNED_CODEX_BACKUP, appRoot], { stdio: "ignore" });
    try {
      (0, import_node_child_process3.execFileSync)("xattr", ["-dr", "com.apple.quarantine", appRoot], { stdio: "ignore" });
    } catch {
    }
    log("info", "Restored signed Codex.app before Sparkle install", { appRoot });
  } catch (e) {
    log("error", "Failed to restore signed Codex.app before Sparkle install", {
      message: e.message
    });
  }
}
function isDeveloperIdSignedApp(appRoot) {
  const result = (0, import_node_child_process3.spawnSync)("codesign", ["-dv", "--verbose=4", appRoot], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return result.status === 0 && /Authority=Developer ID Application:/.test(output) && !/Signature=adhoc/.test(output) && !/TeamIdentifier=not set/.test(output);
}
function inferMacAppRoot2() {
  const marker = ".app/Contents/MacOS/";
  const idx = process.execPath.indexOf(marker);
  return idx >= 0 ? process.execPath.slice(0, idx + ".app".length) : null;
}
process.on("uncaughtException", (e) => {
  log("error", "uncaughtException", { code: e.code, message: e.message, stack: e.stack });
});
process.on("unhandledRejection", (e) => {
  log("error", "unhandledRejection", { value: String(e) });
});
installSparkleUpdateHook();
var tweakState = {
  discovered: [],
  loadedMain: /* @__PURE__ */ new Map()
};
var nativeBridge = new NativeBridge(log, {
  nativeHostPath: (0, import_node_path9.join)(runtimeDir, "native", "codexpp_native_host.node")
});
var owlViews = /* @__PURE__ */ new Map();
var tweakLifecycleDeps = {
  logInfo: (message) => log("info", message),
  setTweakEnabled,
  stopAllMainTweaks,
  clearTweakModuleCache,
  loadAllMainTweaks,
  broadcastReload
};
function registerPreload(s, label) {
  try {
    const reg = s.registerPreloadScript;
    if (typeof reg === "function") {
      reg.call(s, { type: "frame", filePath: PRELOAD_PATH, id: "codex-plusplus" });
      log("info", `preload registered (registerPreloadScript) on ${label}:`, PRELOAD_PATH);
      return;
    }
    const existing = s.getPreloads();
    if (!existing.includes(PRELOAD_PATH)) {
      s.setPreloads([...existing, PRELOAD_PATH]);
    }
    log("info", `preload registered (setPreloads) on ${label}:`, PRELOAD_PATH);
  } catch (e) {
    if (e instanceof Error && e.message.includes("existing ID")) {
      log("info", `preload already registered on ${label}:`, PRELOAD_PATH);
      return;
    }
    log("error", `preload registration on ${label} failed:`, e);
  }
}
import_electron4.app.whenReady().then(() => {
  log("info", "app ready fired");
  if (isCodexPlusPlusSafeModeEnabled()) {
    log("warn", "safe mode is enabled; preload will not be registered");
    return;
  }
  registerPreload(import_electron4.session.defaultSession, "defaultSession");
  maybeStartBrowserUiServer({
    getWindowServices: getCodexWindowServices,
    log
  });
});
import_electron4.app.on("session-created", (s) => {
  if (isCodexPlusPlusSafeModeEnabled()) return;
  registerPreload(s, "session-created");
});
import_electron4.app.on("web-contents-created", (_e, wc) => {
  try {
    const wp = wc.getLastWebPreferences?.();
    log("info", "web-contents-created", {
      id: wc.id,
      type: wc.getType(),
      sessionIsDefault: wc.session === import_electron4.session.defaultSession,
      sandbox: wp?.sandbox,
      contextIsolation: wp?.contextIsolation
    });
    wc.on("preload-error", (_ev, p, err) => {
      log("error", `wc ${wc.id} preload-error path=${p}`, String(err?.stack ?? err));
    });
  } catch (e) {
    log("error", "web-contents-created handler failed:", String(e?.stack ?? e));
  }
});
log("info", "main.ts evaluated; app.isReady=" + import_electron4.app.isReady());
if (isCodexPlusPlusSafeModeEnabled()) {
  log("warn", "safe mode is enabled; tweaks will not be loaded");
}
loadAllMainTweaks();
import_electron4.app.on("will-quit", () => {
  stopAllMainTweaks();
  nativeBridge.disposeAll();
  disposeAllOwlViews();
  for (const t of tweakState.loadedMain.values()) {
    try {
      t.storage.flush();
    } catch {
    }
  }
});
import_electron4.ipcMain.handle("codexpp:list-tweaks", async () => {
  await Promise.all(tweakState.discovered.map((t) => ensureTweakUpdateCheck(t)));
  const updateChecks = readState().tweakUpdateChecks ?? {};
  return tweakState.discovered.map((t) => ({
    manifest: t.manifest,
    entry: t.entry,
    dir: t.dir,
    entryExists: (0, import_node_fs10.existsSync)(t.entry),
    enabled: isTweakEnabled(t.manifest.id),
    update: updateChecks[t.manifest.id] ?? null
  }));
});
import_electron4.ipcMain.handle("codexpp:get-tweak-enabled", (_e, id) => isTweakEnabled(id));
import_electron4.ipcMain.handle("codexpp:set-tweak-enabled", (_e, id, enabled) => {
  return setTweakEnabledAndReload(id, enabled, tweakLifecycleDeps);
});
import_electron4.ipcMain.handle("codexpp:get-config", () => {
  const s = readState();
  const installerState = readInstallerState();
  const sourceRoot = installerState?.sourceRoot ?? fallbackSourceRoot();
  return {
    version: CODEX_PLUSPLUS_VERSION,
    autoUpdate: s.codexPlusPlus?.autoUpdate !== false,
    safeMode: s.codexPlusPlus?.safeMode === true,
    updateChannel: s.codexPlusPlus?.updateChannel ?? "stable",
    updateRepo: s.codexPlusPlus?.updateRepo ?? CODEX_PLUSPLUS_REPO,
    updateRef: s.codexPlusPlus?.updateRef ?? "",
    updateCheck: s.codexPlusPlus?.updateCheck ?? null,
    selfUpdate: readSelfUpdateState(),
    installationSource: describeInstallationSource(sourceRoot)
  };
});
import_electron4.ipcMain.handle("codexpp:set-auto-update", (_e, enabled) => {
  setCodexPlusPlusAutoUpdate(!!enabled);
  return { autoUpdate: isCodexPlusPlusAutoUpdateEnabled() };
});
import_electron4.ipcMain.handle("codexpp:set-update-config", (_e, config) => {
  setCodexPlusPlusUpdateConfig(config);
  const s = readState();
  return {
    updateChannel: s.codexPlusPlus?.updateChannel ?? "stable",
    updateRepo: s.codexPlusPlus?.updateRepo ?? CODEX_PLUSPLUS_REPO,
    updateRef: s.codexPlusPlus?.updateRef ?? ""
  };
});
import_electron4.ipcMain.handle("codexpp:check-codexpp-update", async (_e, force) => {
  return ensureCodexPlusPlusUpdateCheck(force === true);
});
import_electron4.ipcMain.handle("codexpp:run-codexpp-update", async () => {
  const sourceRoot = readInstallerState()?.sourceRoot ?? fallbackSourceRoot();
  if (!sourceRoot) {
    throw new Error("Codex++ source CLI was not found. Run the installer once, then try again.");
  }
  const cli = (0, import_node_path9.join)(sourceRoot, "packages", "installer", "dist", "cli.js");
  if (!(0, import_node_fs10.existsSync)(cli)) {
    throw new Error("Codex++ source CLI was not found. Run the installer once, then try again.");
  }
  const pending = markSelfUpdateStarted(sourceRoot);
  startInstalledCli(cli, ["update", "--watcher"]);
  return pending;
});
import_electron4.ipcMain.handle("codexpp:get-watcher-health", () => getWatcherHealth(userRoot));
import_electron4.ipcMain.handle("codexpp:get-tweak-store", async () => {
  const store = await fetchTweakStoreRegistry();
  const registry = store.registry;
  const installed = new Map(tweakState.discovered.map((t) => [t.manifest.id, t]));
  const entries = shuffleStoreEntries(registry.entries, import_node_crypto3.randomInt);
  return {
    ...registry,
    sourceUrl: TWEAK_STORE_INDEX_URL,
    fetchedAt: store.fetchedAt,
    entries: entries.map((entry) => {
      const local = installed.get(entry.id);
      const platform2 = storeEntryPlatformCompatibility(entry);
      const runtime = storeEntryRuntimeCompatibility(entry);
      return {
        ...entry,
        platform: platform2,
        runtime,
        installed: local ? {
          version: local.manifest.version,
          enabled: isTweakEnabled(local.manifest.id)
        } : null
      };
    })
  };
});
import_electron4.ipcMain.handle("codexpp:install-store-tweak", async (_e, id) => {
  const { registry } = await fetchTweakStoreRegistry();
  const entry = registry.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Tweak store entry not found: ${id}`);
  assertStoreEntryPlatformCompatible(entry);
  assertStoreEntryRuntimeCompatible(entry);
  await installStoreTweak(entry);
  reloadTweaks("store-install", tweakLifecycleDeps);
  return { installed: entry.id };
});
import_electron4.ipcMain.handle("codexpp:prepare-tweak-store-submission", async (_e, repoInput) => {
  return prepareTweakStoreSubmission(repoInput);
});
import_electron4.ipcMain.handle("codexpp:read-tweak-source", (_e, entryPath) => {
  const resolved = (0, import_node_path9.resolve)(entryPath);
  if (!isPathInside2(TWEAKS_DIR, resolved)) {
    throw new Error("path outside tweaks dir");
  }
  return require("node:fs").readFileSync(resolved, "utf8");
});
var ASSET_MAX_BYTES = 1024 * 1024;
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
import_electron4.ipcMain.handle(
  "codexpp:read-tweak-asset",
  (_e, tweakDir, relPath) => {
    const fs = require("node:fs");
    const dir = (0, import_node_path9.resolve)(tweakDir);
    if (!isPathInside2(TWEAKS_DIR, dir)) {
      throw new Error("tweakDir outside tweaks dir");
    }
    const full = (0, import_node_path9.resolve)(dir, relPath);
    if (!isPathInside2(dir, full) || full === dir) {
      throw new Error("path traversal");
    }
    const stat4 = fs.statSync(full);
    if (stat4.size > ASSET_MAX_BYTES) {
      throw new Error(`asset too large (${stat4.size} > ${ASSET_MAX_BYTES})`);
    }
    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(full);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
);
import_electron4.ipcMain.on("codexpp:preload-log", (_e, level, msg) => {
  const lvl = level === "error" || level === "warn" ? level : "info";
  try {
    appendCappedLog((0, import_node_path9.join)(LOG_DIR, "preload.log"), `[${(/* @__PURE__ */ new Date()).toISOString()}] [${lvl}] ${msg}
`);
  } catch {
  }
});
import_electron4.ipcMain.handle("codexpp:tweak-fs", (_e, op, id, p, c) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("bad tweak id");
  const dir = (0, import_node_path9.join)(userRoot, "tweak-data", id);
  (0, import_node_fs10.mkdirSync)(dir, { recursive: true });
  const full = (0, import_node_path9.resolve)(dir, p);
  if (!isPathInside2(dir, full) || full === dir) throw new Error("path traversal");
  const fs = require("node:fs");
  switch (op) {
    case "read":
      return fs.readFileSync(full, "utf8");
    case "write":
      return fs.writeFileSync(full, c ?? "", "utf8");
    case "exists":
      return fs.existsSync(full);
    case "dataDir":
      return dir;
    default:
      throw new Error(`unknown op: ${op}`);
  }
});
import_electron4.ipcMain.handle("codexpp:user-paths", () => ({
  userRoot,
  runtimeDir,
  tweaksDir: TWEAKS_DIR,
  logDir: LOG_DIR
}));
import_electron4.ipcMain.handle("codexpp:codex-runtime-info", () => currentRuntimeInfo());
import_electron4.ipcMain.handle("codexpp:codex-runtime-capabilities", () => currentRuntimeCapabilities());
import_electron4.ipcMain.handle("codexpp:codex-cdp-status", () => getCdpStatus());
import_electron4.ipcMain.handle("codexpp:codex-cdp-targets", () => listCdpTargets());
import_electron4.ipcMain.handle("codexpp:codex-window-create", (_e, opts) => {
  return createCodexWindow(opts);
});
import_electron4.ipcMain.handle("codexpp:codex-window-primary", () => getPrimaryCodexWindowRef());
import_electron4.ipcMain.handle("codexpp:codex-window-focus", (_e, windowId) => focusCodexWindow(windowId));
import_electron4.ipcMain.handle("codexpp:codex-window-show", (_e, windowId) => showCodexWindow(windowId));
import_electron4.ipcMain.handle(
  "codexpp:codex-view-create",
  async (_e, tweakId, options) => {
    const tweak = assertTweakViewPermissionForId(tweakId);
    const ref = await createOwlView({ id: tweak.manifest.id, dir: tweak.dir }, options);
    return {
      id: ref.id,
      webContentsId: ref.webContentsId,
      parentWindowId: ref.parentWindowId
    };
  }
);
import_electron4.ipcMain.handle(
  "codexpp:codex-view-call",
  (_e, tweakId, viewId, method, arg, arg2) => {
    assertTweakViewPermissionForId(tweakId);
    return callOwlView(tweakId, viewId, method, arg, arg2);
  }
);
import_electron4.ipcMain.handle("codexpp:codex-view-dispose-tweak", (_e, tweakId) => {
  assertTweakId(tweakId);
  disposeOwlViewsForTweak(tweakId);
});
import_electron4.ipcMain.handle(
  "codexpp:native-load-module",
  (_e, tweakId, options) => {
    const ref = nativeBridge.loadModule(tweakContext(tweakId, "native-module"), options);
    return { id: ref.id, kind: ref.kind };
  }
);
import_electron4.ipcMain.handle(
  "codexpp:native-module-request",
  (_e, tweakId, moduleId, method, payload, timeoutMs) => {
    assertTweakPermissionForId(tweakId, "native-module");
    return nativeBridge.requestModule(tweakId, moduleId, method, payload, timeoutMs);
  }
);
import_electron4.ipcMain.handle("codexpp:native-module-dispose", (_e, tweakId, moduleId) => {
  assertTweakPermissionForId(tweakId, "native-module");
  return nativeBridge.disposeModule(tweakId, moduleId);
});
import_electron4.ipcMain.handle("codexpp:native-dispose-tweak", (_e, tweakId) => {
  assertTweakId(tweakId);
  nativeBridge.disposeTweak(tweakId);
});
import_electron4.ipcMain.handle(
  "codexpp:native-create-panel",
  async (_e, tweakId, options) => {
    const ref = await nativeBridge.createPanel(tweakContext(tweakId, "native-view"), options);
    return { id: ref.id, windowId: ref.windowId };
  }
);
import_electron4.ipcMain.handle(
  "codexpp:native-attach-view",
  async (_e, tweakId, options) => {
    const ref = await nativeBridge.attachView(tweakContext(tweakId, "native-view"), options);
    return { id: ref.id };
  }
);
import_electron4.ipcMain.handle(
  "codexpp:native-instance-call",
  async (_e, tweakId, kind, instanceId, method, arg) => {
    assertTweakPermissionForId(tweakId, "native-view");
    return nativeBridge.callInstance(tweakId, kind, instanceId, method, arg);
  }
);
import_electron4.ipcMain.handle(
  "codexpp:native-launch-helper",
  (_e, tweakId, options) => {
    const ref = nativeBridge.launchHelper(tweakContext(tweakId, "native-helper"), options);
    return { id: ref.id, pid: ref.pid };
  }
);
import_electron4.ipcMain.handle(
  "codexpp:native-helper-call",
  (_e, tweakId, helperId, method, payload, timeoutMs) => {
    assertTweakPermissionForId(tweakId, "native-helper");
    return nativeBridge.callHelper(tweakId, helperId, method, payload, timeoutMs);
  }
);
import_electron4.ipcMain.handle("codexpp:reveal", (_e, p) => {
  import_electron4.shell.openPath(p).catch(() => {
  });
});
import_electron4.ipcMain.handle("codexpp:open-external", (_e, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("only github.com links can be opened from tweak metadata");
  }
  import_electron4.shell.openExternal(parsed.toString()).catch(() => {
  });
});
import_electron4.ipcMain.handle("codexpp:copy-text", (_e, text) => {
  import_electron4.clipboard.writeText(String(text));
  return true;
});
import_electron4.ipcMain.handle("codexpp:reload-tweaks", () => {
  reloadTweaks("manual", tweakLifecycleDeps);
  return { at: Date.now(), count: tweakState.discovered.length };
});
var RELOAD_DEBOUNCE_MS = 250;
var reloadTimer = null;
function scheduleReload(reason) {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    reloadTweaks(reason, tweakLifecycleDeps);
  }, RELOAD_DEBOUNCE_MS);
}
try {
  const watcher = esm_default.watch(TWEAKS_DIR, {
    ignoreInitial: true,
    // Wait for files to settle before triggering — guards against partially
    // written tweak files during editor saves / git checkouts.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Avoid eating CPU on huge node_modules trees inside tweak folders.
    ignored: (p) => p.includes(`${TWEAKS_DIR}/`) && /\/node_modules\//.test(p)
  });
  watcher.on("all", (event, path) => scheduleReload(`${event} ${path}`));
  watcher.on("error", (e) => log("warn", "watcher error:", e));
  log("info", "watching", TWEAKS_DIR);
  import_electron4.app.on("will-quit", () => watcher.close().catch(() => {
  }));
} catch (e) {
  log("error", "failed to start watcher:", e);
}
function loadAllMainTweaks() {
  try {
    tweakState.discovered = discoverTweaks(TWEAKS_DIR);
    log(
      "info",
      `discovered ${tweakState.discovered.length} tweak(s):`,
      tweakState.discovered.map((t) => t.manifest.id).join(", ")
    );
  } catch (e) {
    log("error", "tweak discovery failed:", e);
    tweakState.discovered = [];
  }
  syncMcpServersFromEnabledTweaks();
  for (const t of tweakState.discovered) {
    if (!isMainProcessTweakScope(t.manifest.scope)) continue;
    if (!isTweakEnabled(t.manifest.id)) {
      log("info", `skipping disabled main tweak: ${t.manifest.id}`);
      continue;
    }
    try {
      const mod = require(t.entry);
      const tweak = mod.default ?? mod;
      if (typeof tweak?.start === "function") {
        const storage = createDiskStorage(userRoot, t.manifest.id);
        tweak.start({
          manifest: t.manifest,
          process: "main",
          log: makeLogger(t.manifest.id),
          storage,
          ipc: makeMainIpc(t.manifest.id),
          fs: makeMainFs(t.manifest.id),
          codex: makeCodexApi(t)
        });
        tweakState.loadedMain.set(t.manifest.id, {
          stop: tweak.stop,
          storage
        });
        log("info", `started main tweak: ${t.manifest.id}`);
      }
    } catch (e) {
      log("error", `tweak ${t.manifest.id} failed to start:`, e);
    }
  }
}
function syncMcpServersFromEnabledTweaks() {
  try {
    const result = syncManagedMcpServers({
      configPath: CODEX_CONFIG_FILE,
      tweaks: tweakState.discovered.filter((t) => isTweakEnabled(t.manifest.id))
    });
    if (result.changed) {
      log("info", `synced Codex MCP config: ${result.serverNames.join(", ") || "none"}`);
    }
    if (result.skippedServerNames.length > 0) {
      log(
        "info",
        `skipped Codex++ managed MCP server(s) already configured by user: ${result.skippedServerNames.join(", ")}`
      );
    }
  } catch (e) {
    log("warn", "failed to sync Codex MCP config:", e);
  }
}
function stopAllMainTweaks() {
  for (const [id, t] of tweakState.loadedMain) {
    try {
      t.stop?.();
      t.storage.flush();
      log("info", `stopped main tweak: ${id}`);
    } catch (e) {
      log("warn", `stop failed for ${id}:`, e);
    } finally {
      nativeBridge.disposeTweak(id);
      disposeOwlViewsForTweak(id);
    }
  }
  tweakState.loadedMain.clear();
}
function clearTweakModuleCache() {
  const rootSet = /* @__PURE__ */ new Set([TWEAKS_DIR, safeRealpath(TWEAKS_DIR)]);
  const entrySet = /* @__PURE__ */ new Set();
  for (const tweak of tweakState.discovered) {
    rootSet.add(tweak.dir);
    rootSet.add(safeRealpath(tweak.dir));
    entrySet.add(tweak.entry);
    entrySet.add(safeRealpath(tweak.entry));
  }
  const roots = [...rootSet];
  for (const key of Object.keys(require.cache)) {
    const realKey = safeRealpath(key);
    const isTweakModule = entrySet.has(key) || entrySet.has(realKey) || roots.some((root) => isPathInside2(root, key) || isPathInside2(root, realKey));
    if (isTweakModule) delete require.cache[key];
  }
}
function safeRealpath(filePath) {
  try {
    return (0, import_node_fs10.realpathSync)(filePath);
  } catch {
    return filePath;
  }
}
var UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
async function ensureCodexPlusPlusUpdateCheck(force = false) {
  const state = readState();
  const cached = state.codexPlusPlus?.updateCheck;
  const channel = state.codexPlusPlus?.updateChannel ?? "stable";
  const repo = state.codexPlusPlus?.updateRepo ?? CODEX_PLUSPLUS_REPO;
  if (!force && cached && cached.currentVersion === CODEX_PLUSPLUS_VERSION && Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS) {
    return cached;
  }
  const release = await fetchLatestRelease(repo, CODEX_PLUSPLUS_VERSION, channel === "prerelease");
  const latestVersion = release.latestTag ? normalizeVersion(release.latestTag) : null;
  const check = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    currentVersion: CODEX_PLUSPLUS_VERSION,
    latestVersion,
    releaseUrl: release.releaseUrl ?? `https://github.com/${repo}/releases`,
    releaseNotes: release.releaseNotes,
    updateAvailable: latestVersion ? compareVersions(normalizeVersion(latestVersion), CODEX_PLUSPLUS_VERSION) > 0 : false,
    ...release.error ? { error: release.error } : {}
  };
  state.codexPlusPlus ??= {};
  state.codexPlusPlus.updateCheck = check;
  writeState(state);
  return check;
}
async function ensureTweakUpdateCheck(t) {
  const id = t.manifest.id;
  const repo = t.manifest.githubRepo;
  const state = readState();
  const cached = state.tweakUpdateChecks?.[id];
  if (cached && cached.repo === repo && cached.currentVersion === t.manifest.version && Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS) {
    return;
  }
  const next = await fetchLatestRelease(repo, t.manifest.version);
  const latestVersion = next.latestTag ? normalizeVersion(next.latestTag) : null;
  const check = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    repo,
    currentVersion: t.manifest.version,
    latestVersion,
    latestTag: next.latestTag,
    releaseUrl: next.releaseUrl,
    updateAvailable: latestVersion ? compareVersions(latestVersion, normalizeVersion(t.manifest.version)) > 0 : false,
    ...next.error ? { error: next.error } : {}
  };
  state.tweakUpdateChecks ??= {};
  state.tweakUpdateChecks[id] = check;
  writeState(state);
}
async function fetchLatestRelease(repo, currentVersion, includePrerelease = false) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    try {
      const endpoint = includePrerelease ? "releases?per_page=20" : "releases/latest";
      const res = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": `codex-plusplus/${currentVersion}`
        },
        signal: controller.signal
      });
      if (res.status === 404) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: "no GitHub release found" };
      }
      if (!res.ok) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: `GitHub returned ${res.status}` };
      }
      const json = await res.json();
      const body = Array.isArray(json) ? json.find((release) => !release.draft) : json;
      if (!body) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: "no GitHub release found" };
      }
      return {
        latestTag: body.tag_name ?? null,
        releaseUrl: body.html_url ?? `https://github.com/${repo}/releases`,
        releaseNotes: body.body ?? null
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return {
      latestTag: null,
      releaseUrl: null,
      releaseNotes: null,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}
var StoreTweakModifiedError = class extends Error {
  constructor(tweakName) {
    super(
      `${tweakName} has local source changes, so Codex++ can't auto-update it. Revert your local changes or reinstall the tweak manually.`
    );
    this.name = "StoreTweakModifiedError";
  }
};
function storeEntryPlatformCompatibility(entry) {
  const supported = entry.platforms ?? null;
  const compatible = !supported || supported.includes(process.platform);
  return {
    current: process.platform,
    supported,
    compatible,
    reason: compatible ? null : `${entry.manifest.name} is only available on ${formatStorePlatforms(supported)}.`
  };
}
function assertStoreEntryPlatformCompatible(entry) {
  const platform2 = storeEntryPlatformCompatibility(entry);
  if (!platform2.compatible) {
    throw new Error(platform2.reason ?? `${entry.manifest.name} is not available on this platform.`);
  }
}
function storeEntryRuntimeCompatibility(entry) {
  const required = cleanMinRuntime(entry.manifest.minRuntime);
  const compatible = !required || compareVersions(CODEX_PLUSPLUS_VERSION, required) >= 0;
  return {
    current: CODEX_PLUSPLUS_VERSION,
    required,
    compatible,
    reason: compatible || !required ? null : `${entry.manifest.name} requires Codex++ ${required} or newer.`
  };
}
function assertStoreEntryRuntimeCompatible(entry) {
  const runtime = storeEntryRuntimeCompatibility(entry);
  if (!runtime.compatible) {
    throw new Error(runtime.reason ?? `${entry.manifest.name} requires a newer Codex++ runtime.`);
  }
}
function cleanMinRuntime(value) {
  if (typeof value !== "string") return null;
  const version = normalizeVersion(value.replace(/^>=?\s*/, ""));
  return VERSION_RE.test(version) ? version : null;
}
function formatStorePlatforms(platforms) {
  if (!platforms || platforms.length === 0) return "supported platforms";
  return platforms.map((platform2) => {
    if (platform2 === "darwin") return "macOS";
    if (platform2 === "win32") return "Windows";
    return "Linux";
  }).join(", ");
}
async function fetchTweakStoreRegistry() {
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    try {
      const res = await fetch(TWEAK_STORE_INDEX_URL, {
        headers: {
          "Accept": "application/json",
          "User-Agent": `codex-plusplus/${CODEX_PLUSPLUS_VERSION}`
        },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`store returned ${res.status}`);
      return {
        registry: normalizeStoreRegistry(await res.json()),
        fetchedAt
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    log("warn", "failed to fetch tweak store registry:", error.message);
    throw error;
  }
}
async function installStoreTweak(entry) {
  const url = storeArchiveUrl(entry);
  const work = (0, import_node_fs10.mkdtempSync)((0, import_node_path9.join)((0, import_node_os2.tmpdir)(), "codexpp-store-tweak-"));
  const archive = (0, import_node_path9.join)(work, "source.tar.gz");
  const extractDir = (0, import_node_path9.join)(work, "extract");
  const target = (0, import_node_path9.join)(TWEAKS_DIR, entry.id);
  const stagedTarget = (0, import_node_path9.join)(work, "staged", entry.id);
  try {
    log("info", `installing store tweak ${entry.id} from ${entry.repo}@${entry.approvedCommitSha}`);
    const res = await fetch(url, {
      headers: { "User-Agent": `codex-plusplus/${CODEX_PLUSPLUS_VERSION}` },
      redirect: "follow"
    });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    (0, import_node_fs10.writeFileSync)(archive, bytes);
    (0, import_node_fs10.mkdirSync)(extractDir, { recursive: true });
    extractTarArchive(archive, extractDir);
    const source = findTweakRoot(extractDir);
    if (!source) throw new Error("downloaded archive did not contain manifest.json");
    validateStoreTweakSource(entry, source);
    (0, import_node_fs10.rmSync)(stagedTarget, { recursive: true, force: true });
    copyTweakSource(source, stagedTarget);
    const stagedFiles = hashTweakSource(stagedTarget);
    (0, import_node_fs10.writeFileSync)(
      (0, import_node_path9.join)(stagedTarget, ".codexpp-store.json"),
      JSON.stringify(
        {
          repo: entry.repo,
          approvedCommitSha: entry.approvedCommitSha,
          installedAt: (/* @__PURE__ */ new Date()).toISOString(),
          storeIndexUrl: TWEAK_STORE_INDEX_URL,
          files: stagedFiles
        },
        null,
        2
      )
    );
    await assertStoreTweakCleanForAutoUpdate(entry, target, work);
    (0, import_node_fs10.rmSync)(target, { recursive: true, force: true });
    (0, import_node_fs10.cpSync)(stagedTarget, target, { recursive: true });
  } finally {
    (0, import_node_fs10.rmSync)(work, { recursive: true, force: true });
  }
}
async function prepareTweakStoreSubmission(repoInput) {
  const repo = normalizeGitHubRepo(repoInput);
  const repoInfo = await fetchGithubJson(`https://api.github.com/repos/${repo}`);
  const defaultBranch = repoInfo.default_branch;
  if (!defaultBranch) throw new Error(`Could not resolve default branch for ${repo}`);
  const commit = await fetchGithubJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(defaultBranch)}`);
  if (!commit.sha) throw new Error(`Could not resolve current commit for ${repo}`);
  const manifest = await fetchManifestAtCommit(repo, commit.sha).catch((e) => {
    log("warn", `could not read manifest for store submission ${repo}@${commit.sha}:`, e);
    return void 0;
  });
  return {
    repo,
    defaultBranch,
    commitSha: commit.sha,
    commitUrl: commit.html_url ?? `https://github.com/${repo}/commit/${commit.sha}`,
    manifest: manifest ? {
      id: typeof manifest.id === "string" ? manifest.id : void 0,
      name: typeof manifest.name === "string" ? manifest.name : void 0,
      version: typeof manifest.version === "string" ? manifest.version : void 0,
      description: typeof manifest.description === "string" ? manifest.description : void 0,
      iconUrl: typeof manifest.iconUrl === "string" ? manifest.iconUrl : void 0
    } : void 0
  };
}
async function fetchGithubJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8e3);
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `codex-plusplus/${CODEX_PLUSPLUS_VERSION}`
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchManifestAtCommit(repo, commitSha) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${commitSha}/manifest.json`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": `codex-plusplus/${CODEX_PLUSPLUS_VERSION}`
    }
  });
  if (!res.ok) throw new Error(`manifest fetch returned ${res.status}`);
  return await res.json();
}
function extractTarArchive(archive, targetDir) {
  const result = (0, import_node_child_process3.spawnSync)("tar", ["-xzf", archive, "-C", targetDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`tar extraction failed: ${result.stderr || result.stdout || result.status}`);
  }
}
function validateStoreTweakSource(entry, source) {
  const manifestPath = (0, import_node_path9.join)(source, "manifest.json");
  const manifest = JSON.parse((0, import_node_fs10.readFileSync)(manifestPath, "utf8"));
  if (manifest.id !== entry.manifest.id) {
    throw new Error(`downloaded tweak id ${manifest.id} does not match approved id ${entry.manifest.id}`);
  }
  if (manifest.githubRepo !== entry.repo) {
    throw new Error(`downloaded tweak repo ${manifest.githubRepo} does not match approved repo ${entry.repo}`);
  }
  if (manifest.version !== entry.manifest.version) {
    throw new Error(`downloaded tweak version ${manifest.version} does not match approved version ${entry.manifest.version}`);
  }
}
function findTweakRoot(dir) {
  if (!(0, import_node_fs10.existsSync)(dir)) return null;
  if ((0, import_node_fs10.existsSync)((0, import_node_path9.join)(dir, "manifest.json"))) return dir;
  for (const name of (0, import_node_fs10.readdirSync)(dir)) {
    const child = (0, import_node_path9.join)(dir, name);
    try {
      if (!(0, import_node_fs10.statSync)(child).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = findTweakRoot(child);
    if (found) return found;
  }
  return null;
}
function copyTweakSource(source, target) {
  (0, import_node_fs10.cpSync)(source, target, {
    recursive: true,
    filter: (src) => !/(^|[/\\])(?:\.git|node_modules)(?:[/\\]|$)/.test(src)
  });
}
async function assertStoreTweakCleanForAutoUpdate(entry, target, work) {
  if (!(0, import_node_fs10.existsSync)(target)) return;
  const metadata = readStoreInstallMetadata(target);
  if (!metadata) return;
  if (metadata.repo !== entry.repo) {
    throw new StoreTweakModifiedError(entry.manifest.name);
  }
  const currentFiles = hashTweakSource(target);
  const baselineFiles = metadata.files ?? await fetchBaselineStoreTweakHashes(metadata, work);
  if (!sameFileHashes(currentFiles, baselineFiles)) {
    throw new StoreTweakModifiedError(entry.manifest.name);
  }
}
function readStoreInstallMetadata(target) {
  const metadataPath = (0, import_node_path9.join)(target, ".codexpp-store.json");
  if (!(0, import_node_fs10.existsSync)(metadataPath)) return null;
  try {
    const parsed = JSON.parse((0, import_node_fs10.readFileSync)(metadataPath, "utf8"));
    if (typeof parsed.repo !== "string" || typeof parsed.approvedCommitSha !== "string") return null;
    return {
      repo: parsed.repo,
      approvedCommitSha: parsed.approvedCommitSha,
      installedAt: typeof parsed.installedAt === "string" ? parsed.installedAt : "",
      storeIndexUrl: typeof parsed.storeIndexUrl === "string" ? parsed.storeIndexUrl : "",
      files: isHashRecord(parsed.files) ? parsed.files : void 0
    };
  } catch {
    return null;
  }
}
async function fetchBaselineStoreTweakHashes(metadata, work) {
  const baselineDir = (0, import_node_path9.join)(work, "baseline");
  const archive = (0, import_node_path9.join)(work, "baseline.tar.gz");
  const res = await fetch(`https://codeload.github.com/${metadata.repo}/tar.gz/${metadata.approvedCommitSha}`, {
    headers: { "User-Agent": `codex-plusplus/${CODEX_PLUSPLUS_VERSION}` },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`Could not verify local tweak changes before update: ${res.status}`);
  (0, import_node_fs10.writeFileSync)(archive, Buffer.from(await res.arrayBuffer()));
  (0, import_node_fs10.mkdirSync)(baselineDir, { recursive: true });
  extractTarArchive(archive, baselineDir);
  const source = findTweakRoot(baselineDir);
  if (!source) throw new Error("Could not verify local tweak changes before update: baseline manifest missing");
  return hashTweakSource(source);
}
function hashTweakSource(root) {
  const out = {};
  collectTweakFileHashes(root, root, out);
  return out;
}
function collectTweakFileHashes(root, dir, out) {
  for (const name of (0, import_node_fs10.readdirSync)(dir).sort()) {
    if (name === ".git" || name === "node_modules" || name === ".codexpp-store.json") continue;
    const full = (0, import_node_path9.join)(dir, name);
    const rel = (0, import_node_path9.relative)(root, full).split("\\").join("/");
    const stat4 = (0, import_node_fs10.statSync)(full);
    if (stat4.isDirectory()) {
      collectTweakFileHashes(root, full, out);
      continue;
    }
    if (!stat4.isFile()) continue;
    out[rel] = (0, import_node_crypto3.createHash)("sha256").update((0, import_node_fs10.readFileSync)(full)).digest("hex");
  }
}
function sameFileHashes(a, b) {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    const key = ak[i];
    if (key !== bk[i] || a[key] !== b[key]) return false;
  }
  return true;
}
function isHashRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}
function normalizeVersion(v) {
  return v.trim().replace(/^v/i, "");
}
function compareVersions(a, b) {
  const av = VERSION_RE.exec(a);
  const bv = VERSION_RE.exec(b);
  if (!av || !bv) return 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(av[i]) - Number(bv[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
function fallbackSourceRoot() {
  const candidates = [
    (0, import_node_path9.join)((0, import_node_os2.homedir)(), ".codex-plusplus", "source"),
    (0, import_node_path9.join)(userRoot, "source")
  ];
  for (const candidate of candidates) {
    if ((0, import_node_fs10.existsSync)((0, import_node_path9.join)(candidate, "packages", "installer", "dist", "cli.js"))) return candidate;
  }
  return null;
}
function describeInstallationSource(sourceRoot) {
  if (!sourceRoot) {
    return {
      kind: "unknown",
      label: "Unknown",
      detail: "Codex++ source location is not recorded yet."
    };
  }
  const normalized = sourceRoot.replace(/\\/g, "/");
  if (/\/(?:Homebrew|homebrew)\/Cellar\/codexplusplus\//.test(normalized)) {
    return { kind: "homebrew", label: "Homebrew", detail: sourceRoot };
  }
  if ((0, import_node_fs10.existsSync)((0, import_node_path9.join)(sourceRoot, ".git"))) {
    return { kind: "local-dev", label: "Local development checkout", detail: sourceRoot };
  }
  if (normalized.endsWith("/.codex-plusplus/source") || normalized.includes("/.codex-plusplus/source/")) {
    return { kind: "github-source", label: "GitHub source installer", detail: sourceRoot };
  }
  if ((0, import_node_fs10.existsSync)((0, import_node_path9.join)(sourceRoot, "package.json"))) {
    return { kind: "source-archive", label: "Source archive", detail: sourceRoot };
  }
  return { kind: "unknown", label: "Unknown", detail: sourceRoot };
}
function startInstalledCli(cli, args) {
  if (process.platform === "darwin" && startInstalledCliWithLaunchd(cli, args)) {
    return;
  }
  const child = (0, import_node_child_process3.spawn)(process.execPath, [cli, ...args], {
    cwd: (0, import_node_path9.resolve)((0, import_node_path9.dirname)(cli), "..", "..", ".."),
    env: { ...process.env, CODEX_PLUSPLUS_MANUAL_UPDATE: "1" },
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}
function startInstalledCliWithLaunchd(cli, args) {
  const label = `com.codexplusplus.patch-helper.${process.pid}.${Date.now()}`;
  const cleanup = `launchctl remove ${label} >/dev/null 2>&1 || launchctl bootout gui/$(id -u)/${label} >/dev/null 2>&1 || true`;
  const command = [
    `trap ${shellQuote(cleanup)} EXIT`,
    `cd ${shellQuote((0, import_node_path9.resolve)((0, import_node_path9.dirname)(cli), "..", "..", ".."))}`,
    `CODEX_PLUSPLUS_MANUAL_UPDATE=1 ${[process.execPath, cli, ...args].map(shellQuote).join(" ")}`
  ].join(" && ");
  const result = (0, import_node_child_process3.spawnSync)(
    "launchctl",
    [
      "submit",
      "-l",
      label,
      "--",
      "/bin/sh",
      "-c",
      `${command} || true`
    ],
    {
      encoding: "utf8",
      stdio: "ignore"
    }
  );
  if (result.status === 0) return true;
  log("warn", `launchctl submit failed for Codex++ patch helper: ${result.error?.message ?? result.status}`);
  return false;
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function markSelfUpdateStarted(sourceRoot) {
  const config = readState().codexPlusPlus;
  const channel = config?.updateChannel ?? "stable";
  const state = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "checking",
    currentVersion: CODEX_PLUSPLUS_VERSION,
    latestVersion: null,
    targetRef: config?.updateChannel === "custom" ? config.updateRef ?? null : null,
    releaseUrl: null,
    repo: config?.updateRepo ?? CODEX_PLUSPLUS_REPO,
    channel,
    sourceRoot,
    installationSource: describeInstallationSource(sourceRoot)
  };
  writeSelfUpdateState(state);
  return state;
}
function broadcastReload() {
  const payload = {
    at: Date.now(),
    tweaks: tweakState.discovered.map((t) => t.manifest.id)
  };
  for (const wc of import_electron4.webContents.getAllWebContents()) {
    try {
      wc.send("codexpp:tweaks-changed", payload);
    } catch (e) {
      log("warn", "broadcast send failed:", e);
    }
  }
}
function makeLogger(scope) {
  return {
    debug: (...a) => log("info", `[${scope}]`, ...a),
    info: (...a) => log("info", `[${scope}]`, ...a),
    warn: (...a) => log("warn", `[${scope}]`, ...a),
    error: (...a) => log("error", `[${scope}]`, ...a)
  };
}
function makeMainIpc(id) {
  const ch = (c) => `codexpp:${id}:${c}`;
  return {
    on: (c, h) => {
      const wrapped = (_e, ...args) => h(...args);
      import_electron4.ipcMain.on(ch(c), wrapped);
      return () => import_electron4.ipcMain.removeListener(ch(c), wrapped);
    },
    send: (_c) => {
      throw new Error("ipc.send is renderer\u2192main; main side uses handle/on");
    },
    invoke: (_c) => {
      throw new Error("ipc.invoke is renderer\u2192main; main side uses handle");
    },
    handle: (c, handler) => {
      import_electron4.ipcMain.handle(ch(c), (_e, ...args) => handler(...args));
    }
  };
}
function makeMainFs(id) {
  const dir = (0, import_node_path9.join)(userRoot, "tweak-data", id);
  (0, import_node_fs10.mkdirSync)(dir, { recursive: true });
  const fs = require("node:fs/promises");
  return {
    dataDir: dir,
    read: (p) => fs.readFile((0, import_node_path9.join)(dir, p), "utf8"),
    write: (p, c) => fs.writeFile((0, import_node_path9.join)(dir, p), c, "utf8"),
    exists: async (p) => {
      try {
        await fs.access((0, import_node_path9.join)(dir, p));
        return true;
      } catch {
        return false;
      }
    }
  };
}
function currentRuntimeInfo() {
  const installerState = readInstallerState();
  return getRuntimeInfo({
    userRoot,
    runtimeDir,
    codexVersion: installerState?.codexVersion ?? null,
    channel: null,
    getWindowServices: getCodexWindowServices
  });
}
function currentRuntimeCapabilities() {
  const installerState = readInstallerState();
  return getRuntimeCapabilities({
    userRoot,
    runtimeDir,
    codexVersion: installerState?.codexVersion ?? null,
    channel: null,
    getWindowServices: getCodexWindowServices,
    getNativeCapabilities: () => nativeBridge.getCapabilities(),
    getViewCapabilities: () => getOwlViewCapabilities()
  });
}
function tweakContext(tweakId, permission) {
  const tweak = permission ? assertTweakPermissionForId(tweakId, permission) : tweakById(tweakId);
  return { id: tweak.manifest.id, dir: tweak.dir };
}
function tweakById(tweakId) {
  assertTweakId(tweakId);
  const tweak = tweakState.discovered.find((item) => item.manifest.id === tweakId);
  if (!tweak) throw new Error(`unknown tweak: ${tweakId}`);
  if (!isTweakEnabled(tweakId)) throw new Error(`tweak is disabled: ${tweakId}`);
  return tweak;
}
function assertTweakPermissionForId(tweakId, permission) {
  const tweak = tweakById(tweakId);
  assertTweakPermission(tweak, permission);
  return tweak;
}
function assertTweakViewPermissionForId(tweakId) {
  const tweak = tweakById(tweakId);
  assertTweakViewPermission(tweak);
  return tweak;
}
function assertTweakPermission(tweak, permission) {
  if (tweak.manifest.permissions?.includes(permission)) return;
  throw new Error(`tweak ${tweak.manifest.id} must declare ${permission} permission`);
}
function assertTweakViewPermission(tweak) {
  if (tweak.manifest.permissions?.includes("codex-views") || tweak.manifest.permissions?.includes("codex.views")) {
    return;
  }
  throw new Error(`tweak ${tweak.manifest.id} must declare codex-views permission`);
}
function assertTweakId(tweakId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(tweakId)) throw new Error("bad tweak id");
}
function getPrimaryCodexWindow() {
  const services = getCodexWindowServices();
  const fromServices = typeof services?.getPrimaryWindow === "function" ? services.getPrimaryWindow("local") : null;
  if (fromServices && !fromServices.isDestroyed()) return fromServices;
  const fromManager = typeof services?.windowManager?.getPrimaryWindow === "function" ? services.windowManager.getPrimaryWindow.call(services.windowManager) : null;
  if (fromManager && !fromManager.isDestroyed()) return fromManager;
  const focused = import_electron4.BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return import_electron4.BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null;
}
function getPrimaryCodexWindowRef() {
  const win = getPrimaryCodexWindow();
  if (!win || win.isDestroyed()) return null;
  return { windowId: win.id, webContentsId: win.webContents.id };
}
function focusCodexWindow(windowId) {
  const win = import_electron4.BrowserWindow.fromId(windowId);
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}
function showCodexWindow(windowId) {
  const win = import_electron4.BrowserWindow.fromId(windowId);
  if (!win || win.isDestroyed()) return false;
  win.show();
  return true;
}
function getOwlViewCapabilities() {
  const parent = getPrimaryCodexWindow() ?? import_electron4.BrowserWindow.getFocusedWindow();
  const contentView = asRecord4(parent)?.contentView;
  let sampleView = null;
  try {
    sampleView = new import_electron4.BrowserView({ webPreferences: { sandbox: true } });
  } catch {
  }
  const webContentsView = asRecord4(sampleView)?.webContentsView;
  const privateViewTree = typeof asRecord4(contentView)?.addChildView === "function" && typeof asRecord4(contentView)?.removeChildView === "function";
  const webContentsViewAvailable = Boolean(webContentsView) && typeof asRecord4(webContentsView)?.setBounds === "function";
  const privateAttach = privateViewTree && webContentsViewAvailable;
  const browserViewFallback = typeof asRecord4(parent)?.addBrowserView === "function";
  try {
    if (sampleView && !sampleView.webContents.isDestroyed()) {
      sampleView.webContents.close({ waitForBeforeUnload: false });
    }
  } catch {
  }
  return {
    create: privateAttach || browserViewFallback,
    privateViewTree: privateAttach,
    webContentsView: webContentsViewAvailable,
    browserViewFallback
  };
}
async function createOwlView(ctx, opts) {
  const id = assertBridgeId2(opts.id ?? (0, import_node_crypto3.randomUUID)(), "Codex view id");
  const key = owlViewKey(ctx.id, id);
  if (owlViews.has(key)) throw new Error(`Codex view already exists: ${ctx.id}:${id}`);
  const parent = typeof opts.parentWindowId === "number" ? import_electron4.BrowserWindow.fromId(opts.parentWindowId) : getPrimaryCodexWindow();
  if (!parent || isWindowDestroyed2(parent)) {
    throw new Error("Codex view needs an active parent window");
  }
  const services = getCodexWindowServices();
  const windowManager = services?.windowManager;
  const route = opts.route === void 0 ? null : normalizeCodexRoute(opts.route);
  const hostId = opts.hostId || "local";
  const view = new import_electron4.BrowserView({
    webPreferences: {
      preload: opts.registerWithCodex === false ? void 0 : windowManager?.options?.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: windowManager?.options?.allowDevtools
    }
  });
  if (opts.backgroundColor) {
    callObjectMethod(view, "setBackgroundColor", [opts.backgroundColor]);
    callObjectMethod(asRecord4(view)?.webContentsView, "setBackgroundColor", [opts.backgroundColor]);
  }
  const managed = {
    key,
    tweakId: ctx.id,
    id,
    view,
    parentWindowId: windowIdFor2(parent),
    attachMode: null,
    disposeBindings: [],
    disposed: false
  };
  owlViews.set(key, managed);
  try {
    if (route !== null && opts.registerWithCodex !== false && windowManager?.registerWindow) {
      const appearance = opts.appearance || "secondary";
      const windowLike = makeWindowLikeForView2(view);
      windowManager.registerWindow(windowLike, hostId, false, appearance);
      services?.getContext?.(hostId)?.registerWindow?.(windowLike);
    }
    attachOwlView(managed, parent);
    if (opts.bounds) setOwlViewBounds(managed, opts.bounds);
    if (opts.visible === false) setOwlViewVisible(managed, false);
    if (route !== null) {
      await view.webContents.loadURL(codexAppUrl(route, hostId));
    } else if (opts.url) {
      await view.webContents.loadURL(normalizeOwlViewUrl(opts.url));
    } else {
      await view.webContents.loadURL("about:blank");
    }
  } catch (e) {
    disposeOwlView(managed);
    throw e;
  }
  log("info", `created Owl view ${ctx.id}:${id}`, {
    parentWindowId: managed.parentWindowId,
    webContentsId: view.webContents.id,
    attachMode: managed.attachMode
  });
  return owlViewRef(managed);
}
async function callOwlView(tweakId, id, method, arg, arg2) {
  const view = owlViewFor(tweakId, id);
  if (method === "setBounds") return setOwlViewBounds(view, arg);
  if (method === "setVisible") return setOwlViewVisible(view, Boolean(arg));
  if (method === "bringToFront") return bringOwlViewToFront(view);
  if (method === "loadRoute") {
    const route = normalizeCodexRoute(String(arg));
    const hostId = typeof arg2 === "string" && arg2 ? arg2 : "local";
    return view.view.webContents.loadURL(codexAppUrl(route, hostId));
  }
  if (method === "loadUrl") return view.view.webContents.loadURL(normalizeOwlViewUrl(String(arg)));
  if (method === "dispose") return disposeOwlViewById(tweakId, id);
  throw new Error(`unknown Codex view method: ${method}`);
}
function owlViewRef(view) {
  return {
    id: view.id,
    webContentsId: view.view.webContents.id,
    parentWindowId: view.parentWindowId,
    setBounds: (bounds) => Promise.resolve(setOwlViewBounds(view, bounds)),
    setVisible: (visible) => Promise.resolve(setOwlViewVisible(view, visible)),
    bringToFront: () => Promise.resolve(bringOwlViewToFront(view)),
    loadRoute: (route, hostId) => view.view.webContents.loadURL(codexAppUrl(normalizeCodexRoute(route), hostId || "local")).then(() => {
    }),
    loadUrl: (url) => view.view.webContents.loadURL(normalizeOwlViewUrl(url)).then(() => {
    }),
    dispose: () => Promise.resolve(disposeOwlViewById(view.tweakId, view.id))
  };
}
function attachOwlView(view, parent) {
  const contentView = asRecord4(parent)?.contentView;
  const webContentsView = asRecord4(view.view)?.webContentsView;
  if (typeof asRecord4(parent)?.addBrowserView === "function") {
    callObjectMethod(parent, "addBrowserView", [view.view]);
    view.attachMode = "browserView";
  } else if (typeof asRecord4(contentView)?.addChildView === "function" && webContentsView) {
    try {
      addOwlChildView(parent, view.view);
      view.attachMode = "contentView";
    } catch (e) {
      log("warn", "Owl contentView attachment failed; falling back to BrowserView", {
        tweakId: view.tweakId,
        viewId: view.id,
        error: String(e)
      });
    }
  }
  if (!view.attachMode) {
    throw new Error("Owl view attachment is not available on this Codex window");
  }
  const dispose = () => disposeOwlViewById(view.tweakId, view.id);
  bindWindowEvent(parent, view, "closed", dispose);
  bindWindowEvent(parent, view, "close", dispose);
}
function bringOwlViewToFront(view) {
  if (view.disposed) return;
  const parent = view.parentWindowId === null ? null : import_electron4.BrowserWindow.fromId(view.parentWindowId);
  if (!parent || isWindowDestroyed2(parent)) return;
  const contentView = asRecord4(parent)?.contentView;
  const webContentsView = asRecord4(view.view)?.webContentsView;
  if (view.attachMode === "contentView" && webContentsView) {
    try {
      if (typeof asRecord4(parent)?.setTopBrowserView === "function") {
        callObjectMethod(parent, "setTopBrowserView", [view.view]);
      } else {
        callObjectMethod(contentView, "addChildView", [webContentsView]);
      }
      return;
    } catch (e) {
      log("warn", "Owl contentView bring-to-front failed", {
        tweakId: view.tweakId,
        viewId: view.id,
        error: String(e)
      });
    }
  }
  if (typeof asRecord4(parent)?.setTopBrowserView === "function") {
    callObjectMethod(parent, "setTopBrowserView", [view.view]);
  }
}
function setOwlViewBounds(view, bounds) {
  assertBounds(bounds);
  callObjectMethod(view.view, "setBounds", [bounds]);
  callObjectMethod(asRecord4(view.view)?.webContentsView, "setBounds", [bounds]);
}
function setOwlViewVisible(view, visible) {
  callObjectMethod(asRecord4(view.view)?.webContentsView, "setVisible", [visible]);
}
function disposeOwlViewById(tweakId, id) {
  const view = owlViews.get(owlViewKey(tweakId, id));
  if (!view) return;
  disposeOwlView(view);
}
function disposeOwlViewsForTweak(tweakId) {
  for (const view of [...owlViews.values()]) {
    if (view.tweakId === tweakId) disposeOwlView(view);
  }
}
function disposeAllOwlViews() {
  for (const view of [...owlViews.values()]) disposeOwlView(view);
}
function disposeOwlView(view) {
  if (view.disposed) return;
  view.disposed = true;
  owlViews.delete(view.key);
  for (const dispose of view.disposeBindings.splice(0)) {
    try {
      dispose();
    } catch {
    }
  }
  const parent = view.parentWindowId === null ? null : import_electron4.BrowserWindow.fromId(view.parentWindowId);
  if (parent && !isWindowDestroyed2(parent)) {
    try {
      if (view.attachMode === "contentView") {
        removeOwlChildView(parent, view.view);
      } else if (view.attachMode === "browserView") {
        callObjectMethod(parent, "removeBrowserView", [view.view]);
      }
    } catch (e) {
      log("warn", "Owl view detach failed during dispose", {
        tweakId: view.tweakId,
        viewId: view.id,
        error: String(e)
      });
    }
  }
  try {
    if (!view.view.webContents.isDestroyed()) {
      view.view.webContents.close({ waitForBeforeUnload: false });
    }
  } catch {
  }
}
function owlViewFor(tweakId, id) {
  const view = owlViews.get(owlViewKey(tweakId, id));
  if (!view || view.disposed) throw new Error(`Codex view is not loaded: ${tweakId}:${id}`);
  return view;
}
function owlViewKey(tweakId, viewId) {
  return `${tweakId}:${viewId}`;
}
function addOwlChildView(parent, child) {
  const ownerWindow = asRecord4(child)?.ownerWindow;
  if (ownerWindow && ownerWindow !== parent) {
    callObjectMethod(ownerWindow, "removeBrowserView", [child]);
  }
  callObjectMethod(asRecord4(parent)?.contentView, "addChildView", [asRecord4(child)?.webContentsView]);
  try {
    child.ownerWindow = parent;
  } catch {
  }
  callObjectMethod(asRecord4(child.webContents), "_setOwnerWindow", [parent]);
  const browserViews = asRecord4(parent)?._browserViews;
  if (Array.isArray(browserViews) && !browserViews.includes(child)) {
    browserViews.push(child);
  }
}
function removeOwlChildView(parent, child) {
  callObjectMethod(asRecord4(parent)?.contentView, "removeChildView", [asRecord4(child)?.webContentsView]);
  try {
    child.ownerWindow = null;
  } catch {
  }
  const browserViews = asRecord4(parent)?._browserViews;
  if (Array.isArray(browserViews)) {
    const index = browserViews.indexOf(child);
    if (index >= 0) browserViews.splice(index, 1);
  }
}
async function createCodexBrowserView(opts) {
  const services = getCodexWindowServices();
  const windowManager = services?.windowManager;
  if (!services || !windowManager?.registerWindow) {
    throw new Error(
      "Codex embedded view services are not available. Reinstall Codex++ 1.0.0 or later."
    );
  }
  const route = normalizeCodexRoute(opts.route);
  const hostId = opts.hostId || "local";
  const appearance = opts.appearance || "secondary";
  const view = new import_electron4.BrowserView({
    webPreferences: {
      preload: windowManager.options?.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: windowManager.options?.allowDevtools
    }
  });
  const windowLike = makeWindowLikeForView2(view);
  windowManager.registerWindow(windowLike, hostId, false, appearance);
  services.getContext?.(hostId)?.registerWindow?.(windowLike);
  await view.webContents.loadURL(codexAppUrl(route, hostId));
  return view;
}
async function createCodexWindow(opts) {
  const services = getCodexWindowServices();
  if (!services) {
    throw new Error(
      "Codex window services are not available. Reinstall Codex++ 1.0.0 or later."
    );
  }
  const route = normalizeCodexRoute(opts.route);
  const hostId = opts.hostId || "local";
  const parent = typeof opts.parentWindowId === "number" ? import_electron4.BrowserWindow.fromId(opts.parentWindowId) : import_electron4.BrowserWindow.getFocusedWindow();
  const createWindow = services.windowManager?.createWindow;
  let win;
  if (typeof createWindow === "function") {
    win = await createWindow.call(services.windowManager, {
      initialRoute: route,
      hostId,
      show: opts.show !== false,
      appearance: opts.appearance || "secondary",
      parent
    });
  } else if (hostId === "local" && typeof services.createFreshWindow === "function") {
    win = await services.createFreshWindow(route);
  } else if (hostId === "local" && typeof services.createFreshLocalWindow === "function") {
    win = await services.createFreshLocalWindow(route);
  } else if (typeof services.ensureHostWindow === "function") {
    win = await services.ensureHostWindow(hostId);
  }
  if (!win || win.isDestroyed()) {
    throw new Error("Codex did not return a window for the requested route");
  }
  if (opts.bounds) {
    win.setBounds(opts.bounds);
  }
  if (parent && !parent.isDestroyed()) {
    try {
      win.setParentWindow(parent);
    } catch {
    }
  }
  if (opts.show !== false) {
    win.show();
  }
  return {
    windowId: win.id,
    webContentsId: win.webContents.id
  };
}
function makeCodexApi(tweak) {
  const ctx = () => ({ id: tweak.manifest.id, dir: tweak.dir });
  return {
    runtime: {
      getInfo: async () => currentRuntimeInfo(),
      getCapabilities: async () => currentRuntimeCapabilities()
    },
    windows: {
      create: createCodexWindow,
      getPrimary: async () => getPrimaryCodexWindowRef(),
      focus: async (windowId) => focusCodexWindow(windowId),
      show: async (windowId) => showCodexWindow(windowId)
    },
    views: {
      create: async (options) => {
        assertTweakViewPermission(tweak);
        return createOwlView(ctx(), options);
      }
    },
    cdp: {
      getStatus: async () => getCdpStatus(),
      listTargets: async () => listCdpTargets()
    },
    native: {
      loadModule: async (options) => {
        assertTweakPermission(tweak, "native-module");
        return nativeBridge.loadModule(ctx(), options);
      },
      createPanel: async (options) => {
        assertTweakPermission(tweak, "native-view");
        return nativeBridge.createPanel(ctx(), options);
      },
      attachView: async (options) => {
        assertTweakPermission(tweak, "native-view");
        return nativeBridge.attachView(ctx(), options);
      },
      launchHelper: async (options) => {
        assertTweakPermission(tweak, "native-helper");
        return nativeBridge.launchHelper(ctx(), options);
      }
    },
    createBrowserView: createCodexBrowserView,
    createWindow: createCodexWindow
  };
}
function makeWindowLikeForView2(view) {
  const viewBounds = () => view.getBounds();
  return {
    id: view.webContents.id,
    webContents: view.webContents,
    on: (event, listener) => {
      if (event === "closed") {
        view.webContents.once("destroyed", listener);
      } else {
        view.webContents.on(event, listener);
      }
      return view;
    },
    once: (event, listener) => {
      view.webContents.once(event, listener);
      return view;
    },
    off: (event, listener) => {
      view.webContents.off(event, listener);
      return view;
    },
    removeListener: (event, listener) => {
      view.webContents.removeListener(event, listener);
      return view;
    },
    isDestroyed: () => view.webContents.isDestroyed(),
    isFocused: () => view.webContents.isFocused(),
    focus: () => view.webContents.focus(),
    show: () => {
    },
    hide: () => {
    },
    getBounds: viewBounds,
    getContentBounds: viewBounds,
    getSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    getContentSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    setTitle: () => {
    },
    getTitle: () => "",
    setRepresentedFilename: () => {
    },
    setDocumentEdited: () => {
    },
    setWindowButtonVisibility: () => {
    }
  };
}
function codexAppUrl(route, hostId) {
  const url = new URL("app://-/index.html");
  url.searchParams.set("hostId", hostId);
  if (route !== "/") url.searchParams.set("initialRoute", route);
  return url.toString();
}
function normalizeOwlViewUrl(url) {
  if (typeof url !== "string" || url.includes("\n") || url.includes("\r")) {
    throw new Error("Owl view URL must be a string without control characters");
  }
  const parsed = new URL(url);
  if (!["http:", "https:", "app:", "file:", "data:", "about:"].includes(parsed.protocol)) {
    throw new Error(`unsupported Owl view URL protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}
function getCodexWindowServices() {
  const services = globalThis[CODEX_WINDOW_SERVICES_KEY];
  return services && typeof services === "object" ? services : null;
}
function normalizeCodexRoute(route) {
  if (typeof route !== "string" || !route.startsWith("/")) {
    throw new Error("Codex route must be an absolute app route");
  }
  if (route.includes("://") || route.includes("\n") || route.includes("\r")) {
    throw new Error("Codex route must not include a protocol or control characters");
  }
  return route;
}
function asRecord4(value) {
  return value && typeof value === "object" ? value : null;
}
function callObjectMethod(target, method, args) {
  const fn = asRecord4(target)?.[method];
  if (typeof fn !== "function") return void 0;
  return fn.apply(target, args);
}
function isWindowDestroyed2(win) {
  if (!win) return true;
  const fn = asRecord4(win)?.isDestroyed;
  if (typeof fn !== "function") return false;
  try {
    return Boolean(fn.call(win));
  } catch {
    return true;
  }
}
function windowIdFor2(win) {
  const id = asRecord4(win)?.id;
  return typeof id === "number" ? id : null;
}
function bindWindowEvent(win, view, event, listener) {
  const on = asRecord4(win)?.on;
  const off = asRecord4(win)?.off;
  if (typeof on !== "function") return;
  on.call(win, event, listener);
  view.disposeBindings.push(() => {
    if (typeof off === "function") off.call(win, event, listener);
    else callObjectMethod(win, "removeListener", [event, listener]);
  });
}
function assertBridgeId2(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} may only contain letters, numbers, dots, underscores, and dashes`);
  }
  return value;
}
function assertBounds(bounds) {
  const values = [bounds?.x, bounds?.y, bounds?.width, bounds?.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("bounds must contain finite x, y, width, and height numbers");
  }
  if (bounds.width < 0 || bounds.height < 0) {
    throw new Error("bounds width and height must be non-negative");
  }
}
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL21haW4udHMiLCAiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLmNvZGV4LXBsdXNwbHVzL3NvdXJjZS9ub2RlX21vZHVsZXMvY2hva2lkYXIvZXNtL2luZGV4LmpzIiwgIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy5jb2RleC1wbHVzcGx1cy9zb3VyY2Uvbm9kZV9tb2R1bGVzL3JlYWRkaXJwL2VzbS9pbmRleC5qcyIsICIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uY29kZXgtcGx1c3BsdXMvc291cmNlL25vZGVfbW9kdWxlcy9jaG9raWRhci9lc20vaGFuZGxlci5qcyIsICIuLi9zcmMvdHdlYWstZGlzY292ZXJ5LnRzIiwgIi4uL3NyYy9zdG9yYWdlLnRzIiwgIi4uL3NyYy9tY3Atc3luYy50cyIsICIuLi9zcmMvd2F0Y2hlci1oZWFsdGgudHMiLCAiLi4vc3JjL3R3ZWFrLWxpZmVjeWNsZS50cyIsICIuLi9zcmMvbG9nZ2luZy50cyIsICIuLi9zcmMvY29kZXgtcnVudGltZS1wcm9iZS50cyIsICIuLi9zcmMvbmF0aXZlLWJyaWRnZS50cyIsICIuLi9zcmMvbmF0aXZlLXBhdGhzLnRzIiwgIi4uL3NyYy90d2Vhay1zdG9yZS50cyIsICIuLi9zcmMvYnJvd3Nlci11aS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBNYWluLXByb2Nlc3MgYm9vdHN0cmFwLiBMb2FkZWQgYnkgdGhlIGFzYXIgbG9hZGVyIGJlZm9yZSBDb2RleCdzIG93blxuICogbWFpbiBwcm9jZXNzIGNvZGUgcnVucy4gV2UgaG9vayBgQnJvd3NlcldpbmRvd2Agc28gZXZlcnkgd2luZG93IENvZGV4XG4gKiBjcmVhdGVzIGdldHMgb3VyIHByZWxvYWQgc2NyaXB0IGF0dGFjaGVkLiBXZSBhbHNvIHN0YW5kIHVwIGFuIElQQ1xuICogY2hhbm5lbCBmb3IgdHdlYWtzIHRvIHRhbGsgdG8gdGhlIG1haW4gcHJvY2Vzcy5cbiAqXG4gKiBXZSBhcmUgaW4gQ0pTIGxhbmQgaGVyZSAobWF0Y2hlcyBFbGVjdHJvbidzIG1haW4gcHJvY2VzcyBhbmQgQ29kZXgncyBvd25cbiAqIGNvZGUpLiBUaGUgcmVuZGVyZXItc2lkZSBydW50aW1lIGlzIGJ1bmRsZWQgc2VwYXJhdGVseSBpbnRvIHByZWxvYWQuanMuXG4gKi9cbmltcG9ydCB7IGFwcCwgQnJvd3NlclZpZXcsIEJyb3dzZXJXaW5kb3csIGNsaXBib2FyZCwgaXBjTWFpbiwgc2Vzc2lvbiwgc2hlbGwsIHdlYkNvbnRlbnRzIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgeyBjcFN5bmMsIGV4aXN0c1N5bmMsIG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJlYWRkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHJlYWxwYXRoU3luYywgcm1TeW5jLCBzdGF0U3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBleGVjRmlsZVN5bmMsIHNwYXduLCBzcGF3blN5bmMgfSBmcm9tIFwibm9kZTpjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgeyBjcmVhdGVIYXNoLCByYW5kb21JbnQsIHJhbmRvbVVVSUQgfSBmcm9tIFwibm9kZTpjcnlwdG9cIjtcbmltcG9ydCB7IGRpcm5hbWUsIGlzQWJzb2x1dGUsIGpvaW4sIHJlbGF0aXZlLCByZXNvbHZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHsgaG9tZWRpciwgdG1wZGlyIH0gZnJvbSBcIm5vZGU6b3NcIjtcbmltcG9ydCBjaG9raWRhciBmcm9tIFwiY2hva2lkYXJcIjtcbmltcG9ydCB7IGRpc2NvdmVyVHdlYWtzLCB0eXBlIERpc2NvdmVyZWRUd2VhayB9IGZyb20gXCIuL3R3ZWFrLWRpc2NvdmVyeVwiO1xuaW1wb3J0IHsgY3JlYXRlRGlza1N0b3JhZ2UsIHR5cGUgRGlza1N0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBzeW5jTWFuYWdlZE1jcFNlcnZlcnMgfSBmcm9tIFwiLi9tY3Atc3luY1wiO1xuaW1wb3J0IHsgZ2V0V2F0Y2hlckhlYWx0aCB9IGZyb20gXCIuL3dhdGNoZXItaGVhbHRoXCI7XG5pbXBvcnQge1xuICBpc01haW5Qcm9jZXNzVHdlYWtTY29wZSxcbiAgcmVsb2FkVHdlYWtzLFxuICBzZXRUd2Vha0VuYWJsZWRBbmRSZWxvYWQsXG59IGZyb20gXCIuL3R3ZWFrLWxpZmVjeWNsZVwiO1xuaW1wb3J0IHsgYXBwZW5kQ2FwcGVkTG9nIH0gZnJvbSBcIi4vbG9nZ2luZ1wiO1xuaW1wb3J0IHtcbiAgZ2V0Q2RwU3RhdHVzLFxuICBnZXRSdW50aW1lQ2FwYWJpbGl0aWVzLFxuICBnZXRSdW50aW1lSW5mbyxcbiAgbGlzdENkcFRhcmdldHMsXG59IGZyb20gXCIuL2NvZGV4LXJ1bnRpbWUtcHJvYmVcIjtcbmltcG9ydCB7IE5hdGl2ZUJyaWRnZSwgdHlwZSBOYXRpdmVUd2Vha0NvbnRleHQgfSBmcm9tIFwiLi9uYXRpdmUtYnJpZGdlXCI7XG5pbXBvcnQgdHlwZSB7IFR3ZWFrTWFuaWZlc3QgfSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuaW1wb3J0IHR5cGUge1xuICBDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXMsXG4gIENvZGV4UnVudGltZUluZm8sXG4gIENvZGV4Vmlld0NyZWF0ZU9wdGlvbnMsXG4gIENvZGV4Vmlld1JlZixcbiAgQ29kZXhXaW5kb3dSZWYsXG4gIE5hdGl2ZUhlbHBlckxhdW5jaE9wdGlvbnMsXG4gIE5hdGl2ZU1vZHVsZUxvYWRPcHRpb25zLFxuICBOYXRpdmVQYW5lbENyZWF0ZU9wdGlvbnMsXG4gIE5hdGl2ZVZpZXdBdHRhY2hPcHRpb25zLFxuICBUd2Vha1Blcm1pc3Npb24sXG59IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5pbXBvcnQge1xuICBERUZBVUxUX1RXRUFLX1NUT1JFX0lOREVYX1VSTCxcbiAgbm9ybWFsaXplR2l0SHViUmVwbyxcbiAgbm9ybWFsaXplU3RvcmVSZWdpc3RyeSxcbiAgc2h1ZmZsZVN0b3JlRW50cmllcyxcbiAgc3RvcmVBcmNoaXZlVXJsLFxuICB0eXBlIFR3ZWFrU3RvcmVQdWJsaXNoU3VibWlzc2lvbixcbiAgdHlwZSBUd2Vha1N0b3JlRW50cnksXG4gIHR5cGUgVHdlYWtTdG9yZVJlZ2lzdHJ5LFxuICB0eXBlIFR3ZWFrU3RvcmVQbGF0Zm9ybSxcbn0gZnJvbSBcIi4vdHdlYWstc3RvcmVcIjtcbmltcG9ydCB7IG1heWJlU3RhcnRCcm93c2VyVWlTZXJ2ZXIgfSBmcm9tIFwiLi9icm93c2VyLXVpXCI7XG5cbmNvbnN0IHVzZXJSb290ID0gcHJvY2Vzcy5lbnYuQ09ERVhfUExVU1BMVVNfVVNFUl9ST09UO1xuY29uc3QgcnVudGltZURpciA9IHByb2Nlc3MuZW52LkNPREVYX1BMVVNQTFVTX1JVTlRJTUU7XG5cbmlmICghdXNlclJvb3QgfHwgIXJ1bnRpbWVEaXIpIHtcbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgIFwiY29kZXgtcGx1c3BsdXMgcnVudGltZSBzdGFydGVkIHdpdGhvdXQgQ09ERVhfUExVU1BMVVNfVVNFUl9ST09UL1JVTlRJTUUgZW52c1wiLFxuICApO1xufVxuXG5jb25zdCBQUkVMT0FEX1BBVEggPSByZXNvbHZlKHJ1bnRpbWVEaXIsIFwicHJlbG9hZC5qc1wiKTtcbmNvbnN0IFRXRUFLU19ESVIgPSBqb2luKHVzZXJSb290LCBcInR3ZWFrc1wiKTtcbmNvbnN0IExPR19ESVIgPSBqb2luKHVzZXJSb290LCBcImxvZ1wiKTtcbmNvbnN0IExPR19GSUxFID0gam9pbihMT0dfRElSLCBcIm1haW4ubG9nXCIpO1xuY29uc3QgQ09ORklHX0ZJTEUgPSBqb2luKHVzZXJSb290LCBcImNvbmZpZy5qc29uXCIpO1xuY29uc3QgQ09ERVhfQ09ORklHX0ZJTEUgPSBqb2luKGhvbWVkaXIoKSwgXCIuY29kZXhcIiwgXCJjb25maWcudG9tbFwiKTtcbmNvbnN0IElOU1RBTExFUl9TVEFURV9GSUxFID0gam9pbih1c2VyUm9vdCwgXCJzdGF0ZS5qc29uXCIpO1xuY29uc3QgVVBEQVRFX01PREVfRklMRSA9IGpvaW4odXNlclJvb3QsIFwidXBkYXRlLW1vZGUuanNvblwiKTtcbmNvbnN0IFNFTEZfVVBEQVRFX1NUQVRFX0ZJTEUgPSBqb2luKHVzZXJSb290LCBcInNlbGYtdXBkYXRlLXN0YXRlLmpzb25cIik7XG5jb25zdCBTSUdORURfQ09ERVhfQkFDS1VQID0gam9pbih1c2VyUm9vdCwgXCJiYWNrdXBcIiwgXCJDb2RleC5hcHBcIik7XG5jb25zdCBDT0RFWF9QTFVTUExVU19WRVJTSU9OID0gXCIxLjAuMFwiO1xuY29uc3QgQ09ERVhfUExVU1BMVVNfUkVQTyA9IFwiYi1ubmV0dC9jb2RleC1wbHVzcGx1c1wiO1xuY29uc3QgVFdFQUtfU1RPUkVfSU5ERVhfVVJMID0gcHJvY2Vzcy5lbnYuQ09ERVhfUExVU1BMVVNfU1RPUkVfSU5ERVhfVVJMID8/IERFRkFVTFRfVFdFQUtfU1RPUkVfSU5ERVhfVVJMO1xuY29uc3QgQ09ERVhfV0lORE9XX1NFUlZJQ0VTX0tFWSA9IFwiX19jb2RleHBwX3dpbmRvd19zZXJ2aWNlc19fXCI7XG5cbm1rZGlyU3luYyhMT0dfRElSLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbm1rZGlyU3luYyhUV0VBS1NfRElSLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuLy8gT3B0aW9uYWw6IGVuYWJsZSBDaHJvbWUgRGV2VG9vbHMgUHJvdG9jb2wgb24gYSBUQ1AgcG9ydCBzbyB3ZSBjYW4gZHJpdmUgdGhlXG4vLyBydW5uaW5nIENvZGV4IGZyb20gb3V0c2lkZSAoY3VybCBodHRwOi8vbG9jYWxob3N0Ojxwb3J0Pi9qc29uLCBhdHRhY2ggdmlhXG4vLyBDRFAgV2ViU29ja2V0LCB0YWtlIHNjcmVlbnNob3RzLCBldmFsdWF0ZSBpbiByZW5kZXJlciwgZXRjLikuIENvZGV4J3Ncbi8vIHByb2R1Y3Rpb24gYnVpbGQgc2V0cyB3ZWJQcmVmZXJlbmNlcy5kZXZUb29scz1mYWxzZSwgd2hpY2gga2lsbHMgdGhlXG4vLyBpbi13aW5kb3cgRGV2VG9vbHMgc2hvcnRjdXQsIGJ1dCBgLS1yZW1vdGUtZGVidWdnaW5nLXBvcnRgIHdvcmtzIHJlZ2FyZGxlc3Ncbi8vIGJlY2F1c2UgaXQncyBhIENocm9taXVtIGNvbW1hbmQtbGluZSBzd2l0Y2ggcHJvY2Vzc2VkIGJlZm9yZSBhcHAgaW5pdC5cbi8vXG4vLyBPZmYgYnkgZGVmYXVsdC4gU2V0IENPREVYUFBfUkVNT1RFX0RFQlVHPTEgKG9wdGlvbmFsbHkgQ09ERVhQUF9SRU1PVEVfREVCVUdfUE9SVClcbi8vIHRvIHR1cm4gaXQgb24uIE11c3QgYmUgYXBwZW5kZWQgYmVmb3JlIGBhcHBgIGJlY29tZXMgcmVhZHk7IHdlJ3JlIGF0IG1vZHVsZVxuLy8gdG9wLWxldmVsIHNvIHRoYXQncyBmaW5lLlxuaWYgKHByb2Nlc3MuZW52LkNPREVYUFBfUkVNT1RFX0RFQlVHID09PSBcIjFcIikge1xuICBjb25zdCBwb3J0ID0gcHJvY2Vzcy5lbnYuQ09ERVhQUF9SRU1PVEVfREVCVUdfUE9SVCA/PyBcIjkyMjJcIjtcbiAgYXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChcInJlbW90ZS1kZWJ1Z2dpbmctcG9ydFwiLCBwb3J0KTtcbiAgbG9nKFwiaW5mb1wiLCBgcmVtb3RlIGRlYnVnZ2luZyBlbmFibGVkIG9uIHBvcnQgJHtwb3J0fWApO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkU3RhdGUge1xuICBjb2RleFBsdXNQbHVzPzoge1xuICAgIGF1dG9VcGRhdGU/OiBib29sZWFuO1xuICAgIHNhZmVNb2RlPzogYm9vbGVhbjtcbiAgICB1cGRhdGVDaGFubmVsPzogU2VsZlVwZGF0ZUNoYW5uZWw7XG4gICAgdXBkYXRlUmVwbz86IHN0cmluZztcbiAgICB1cGRhdGVSZWY/OiBzdHJpbmc7XG4gICAgdXBkYXRlQ2hlY2s/OiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2s7XG4gIH07XG4gIC8qKiBQZXItdHdlYWsgZW5hYmxlIGZsYWdzLiBNaXNzaW5nIGVudHJpZXMgZGVmYXVsdCB0byBlbmFibGVkLiAqL1xuICB0d2Vha3M/OiBSZWNvcmQ8c3RyaW5nLCB7IGVuYWJsZWQ/OiBib29sZWFuIH0+O1xuICAvKiogQ2FjaGVkIEdpdEh1YiByZWxlYXNlIGNoZWNrcy4gUnVudGltZSBuZXZlciBhdXRvLWluc3RhbGxzIHVwZGF0ZXMuICovXG4gIHR3ZWFrVXBkYXRlQ2hlY2tzPzogUmVjb3JkPHN0cmluZywgVHdlYWtVcGRhdGVDaGVjaz47XG59XG5cbmludGVyZmFjZSBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sge1xuICBjaGVja2VkQXQ6IHN0cmluZztcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgcmVsZWFzZU5vdGVzOiBzdHJpbmcgfCBudWxsO1xuICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG50eXBlIFNlbGZVcGRhdGVDaGFubmVsID0gXCJzdGFibGVcIiB8IFwicHJlcmVsZWFzZVwiIHwgXCJjdXN0b21cIjtcbnR5cGUgU2VsZlVwZGF0ZVN0YXR1cyA9IFwiY2hlY2tpbmdcIiB8IFwidXAtdG8tZGF0ZVwiIHwgXCJ1cGRhdGVkXCIgfCBcImZhaWxlZFwiIHwgXCJkaXNhYmxlZFwiO1xuXG5pbnRlcmZhY2UgU2VsZlVwZGF0ZVN0YXRlIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIGNvbXBsZXRlZEF0Pzogc3RyaW5nO1xuICBzdGF0dXM6IFNlbGZVcGRhdGVTdGF0dXM7XG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gIHRhcmdldFJlZjogc3RyaW5nIHwgbnVsbDtcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgcmVwbzogc3RyaW5nO1xuICBjaGFubmVsOiBTZWxmVXBkYXRlQ2hhbm5lbDtcbiAgc291cmNlUm9vdDogc3RyaW5nO1xuICBpbnN0YWxsYXRpb25Tb3VyY2U/OiBJbnN0YWxsYXRpb25Tb3VyY2U7XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSW5zdGFsbGF0aW9uU291cmNlIHtcbiAga2luZDogXCJnaXRodWItc291cmNlXCIgfCBcImhvbWVicmV3XCIgfCBcImxvY2FsLWRldlwiIHwgXCJzb3VyY2UtYXJjaGl2ZVwiIHwgXCJ1bmtub3duXCI7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIGRldGFpbDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgVHdlYWtVcGRhdGVDaGVjayB7XG4gIGNoZWNrZWRBdDogc3RyaW5nO1xuICByZXBvOiBzdHJpbmc7XG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcmVhZFN0YXRlKCk6IFBlcnNpc3RlZFN0YXRlIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoQ09ORklHX0ZJTEUsIFwidXRmOFwiKSkgYXMgUGVyc2lzdGVkU3RhdGU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB7fTtcbiAgfVxufVxuZnVuY3Rpb24gd3JpdGVTdGF0ZShzOiBQZXJzaXN0ZWRTdGF0ZSk6IHZvaWQge1xuICB0cnkge1xuICAgIHdyaXRlRmlsZVN5bmMoQ09ORklHX0ZJTEUsIEpTT04uc3RyaW5naWZ5KHMsIG51bGwsIDIpKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcIndhcm5cIiwgXCJ3cml0ZVN0YXRlIGZhaWxlZDpcIiwgU3RyaW5nKChlIGFzIEVycm9yKS5tZXNzYWdlKSk7XG4gIH1cbn1cbmZ1bmN0aW9uIGlzQ29kZXhQbHVzUGx1c0F1dG9VcGRhdGVFbmFibGVkKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcmVhZFN0YXRlKCkuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2U7XG59XG5mdW5jdGlvbiBzZXRDb2RleFBsdXNQbHVzQXV0b1VwZGF0ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcbiAgcy5jb2RleFBsdXNQbHVzID8/PSB7fTtcbiAgcy5jb2RleFBsdXNQbHVzLmF1dG9VcGRhdGUgPSBlbmFibGVkO1xuICB3cml0ZVN0YXRlKHMpO1xufVxuZnVuY3Rpb24gc2V0Q29kZXhQbHVzUGx1c1VwZGF0ZUNvbmZpZyhjb25maWc6IHtcbiAgdXBkYXRlQ2hhbm5lbD86IFNlbGZVcGRhdGVDaGFubmVsO1xuICB1cGRhdGVSZXBvPzogc3RyaW5nO1xuICB1cGRhdGVSZWY/OiBzdHJpbmc7XG59KTogdm9pZCB7XG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcbiAgcy5jb2RleFBsdXNQbHVzID8/PSB7fTtcbiAgaWYgKGNvbmZpZy51cGRhdGVDaGFubmVsKSBzLmNvZGV4UGx1c1BsdXMudXBkYXRlQ2hhbm5lbCA9IGNvbmZpZy51cGRhdGVDaGFubmVsO1xuICBpZiAoXCJ1cGRhdGVSZXBvXCIgaW4gY29uZmlnKSBzLmNvZGV4UGx1c1BsdXMudXBkYXRlUmVwbyA9IGNsZWFuT3B0aW9uYWxTdHJpbmcoY29uZmlnLnVwZGF0ZVJlcG8pO1xuICBpZiAoXCJ1cGRhdGVSZWZcIiBpbiBjb25maWcpIHMuY29kZXhQbHVzUGx1cy51cGRhdGVSZWYgPSBjbGVhbk9wdGlvbmFsU3RyaW5nKGNvbmZpZy51cGRhdGVSZWYpO1xuICB3cml0ZVN0YXRlKHMpO1xufVxuZnVuY3Rpb24gaXNDb2RleFBsdXNQbHVzU2FmZU1vZGVFbmFibGVkKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcmVhZFN0YXRlKCkuY29kZXhQbHVzUGx1cz8uc2FmZU1vZGUgPT09IHRydWU7XG59XG5mdW5jdGlvbiBpc1R3ZWFrRW5hYmxlZChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcbiAgaWYgKHMuY29kZXhQbHVzUGx1cz8uc2FmZU1vZGUgPT09IHRydWUpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHMudHdlYWtzPy5baWRdPy5lbmFibGVkICE9PSBmYWxzZTtcbn1cbmZ1bmN0aW9uIHNldFR3ZWFrRW5hYmxlZChpZDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcbiAgcy50d2Vha3MgPz89IHt9O1xuICBzLnR3ZWFrc1tpZF0gPSB7IC4uLnMudHdlYWtzW2lkXSwgZW5hYmxlZCB9O1xuICB3cml0ZVN0YXRlKHMpO1xufVxuXG5pbnRlcmZhY2UgSW5zdGFsbGVyU3RhdGUge1xuICBhcHBSb290OiBzdHJpbmc7XG4gIGNvZGV4VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgc291cmNlUm9vdD86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcmVhZEluc3RhbGxlclN0YXRlKCk6IEluc3RhbGxlclN0YXRlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKElOU1RBTExFUl9TVEFURV9GSUxFLCBcInV0ZjhcIikpIGFzIEluc3RhbGxlclN0YXRlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWFkU2VsZlVwZGF0ZVN0YXRlKCk6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwge1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhTRUxGX1VQREFURV9TVEFURV9GSUxFLCBcInV0ZjhcIikpIGFzIFNlbGZVcGRhdGVTdGF0ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cbmZ1bmN0aW9uIHdyaXRlU2VsZlVwZGF0ZVN0YXRlKHN0YXRlOiBTZWxmVXBkYXRlU3RhdGUpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICB3cml0ZUZpbGVTeW5jKFNFTEZfVVBEQVRFX1NUQVRFX0ZJTEUsIEpTT04uc3RyaW5naWZ5KHN0YXRlLCBudWxsLCAyKSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2coXCJ3YXJuXCIsIFwid3JpdGVTZWxmVXBkYXRlU3RhdGUgZmFpbGVkOlwiLCBTdHJpbmcoKGUgYXMgRXJyb3IpLm1lc3NhZ2UpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjbGVhbk9wdGlvbmFsU3RyaW5nKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgcmV0dXJuIHRyaW1tZWQgPyB0cmltbWVkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1BhdGhJbnNpZGUocGFyZW50OiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IHJlbCA9IHJlbGF0aXZlKHJlc29sdmUocGFyZW50KSwgcmVzb2x2ZSh0YXJnZXQpKTtcbiAgcmV0dXJuIHJlbCA9PT0gXCJcIiB8fCAoISFyZWwgJiYgIXJlbC5zdGFydHNXaXRoKFwiLi5cIikgJiYgIWlzQWJzb2x1dGUocmVsKSk7XG59XG5cbmZ1bmN0aW9uIGxvZyhsZXZlbDogXCJpbmZvXCIgfCBcIndhcm5cIiB8IFwiZXJyb3JcIiwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG4gIGNvbnN0IGxpbmUgPSBgWyR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfV0gWyR7bGV2ZWx9XSAke2FyZ3NcbiAgICAubWFwKChhKSA9PiAodHlwZW9mIGEgPT09IFwic3RyaW5nXCIgPyBhIDogSlNPTi5zdHJpbmdpZnkoYSkpKVxuICAgIC5qb2luKFwiIFwiKX1cXG5gO1xuICB0cnkge1xuICAgIGFwcGVuZENhcHBlZExvZyhMT0dfRklMRSwgbGluZSk7XG4gIH0gY2F0Y2gge31cbiAgaWYgKGxldmVsID09PSBcImVycm9yXCIpIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdXCIsIC4uLmFyZ3MpO1xufVxuXG5mdW5jdGlvbiBpbnN0YWxsU3BhcmtsZVVwZGF0ZUhvb2soKTogdm9pZCB7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSBcImRhcndpblwiKSByZXR1cm47XG5cbiAgY29uc3QgTW9kdWxlID0gcmVxdWlyZShcIm5vZGU6bW9kdWxlXCIpIGFzIHR5cGVvZiBpbXBvcnQoXCJub2RlOm1vZHVsZVwiKSAmIHtcbiAgICBfbG9hZD86IChyZXF1ZXN0OiBzdHJpbmcsIHBhcmVudDogdW5rbm93biwgaXNNYWluOiBib29sZWFuKSA9PiB1bmtub3duO1xuICB9O1xuICBjb25zdCBvcmlnaW5hbExvYWQgPSBNb2R1bGUuX2xvYWQ7XG4gIGlmICh0eXBlb2Ygb3JpZ2luYWxMb2FkICE9PSBcImZ1bmN0aW9uXCIpIHJldHVybjtcblxuICBNb2R1bGUuX2xvYWQgPSBmdW5jdGlvbiBjb2RleFBsdXNQbHVzTW9kdWxlTG9hZChyZXF1ZXN0OiBzdHJpbmcsIHBhcmVudDogdW5rbm93biwgaXNNYWluOiBib29sZWFuKSB7XG4gICAgY29uc3QgbG9hZGVkID0gb3JpZ2luYWxMb2FkLmFwcGx5KHRoaXMsIFtyZXF1ZXN0LCBwYXJlbnQsIGlzTWFpbl0pIGFzIHVua25vd247XG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSBcInN0cmluZ1wiICYmIC9zcGFya2xlKD86XFwubm9kZSk/JC9pLnRlc3QocmVxdWVzdCkpIHtcbiAgICAgIHdyYXBTcGFya2xlRXhwb3J0cyhsb2FkZWQpO1xuICAgIH1cbiAgICByZXR1cm4gbG9hZGVkO1xuICB9O1xufVxuXG5mdW5jdGlvbiB3cmFwU3BhcmtsZUV4cG9ydHMobG9hZGVkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghbG9hZGVkIHx8IHR5cGVvZiBsb2FkZWQgIT09IFwib2JqZWN0XCIpIHJldHVybjtcbiAgY29uc3QgZXhwb3J0cyA9IGxvYWRlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiAmIHsgX19jb2RleHBwU3BhcmtsZVdyYXBwZWQ/OiBib29sZWFuIH07XG4gIGlmIChleHBvcnRzLl9fY29kZXhwcFNwYXJrbGVXcmFwcGVkKSByZXR1cm47XG4gIGV4cG9ydHMuX19jb2RleHBwU3BhcmtsZVdyYXBwZWQgPSB0cnVlO1xuXG4gIGZvciAoY29uc3QgbmFtZSBvZiBbXCJpbnN0YWxsVXBkYXRlc0lmQXZhaWxhYmxlXCJdKSB7XG4gICAgY29uc3QgZm4gPSBleHBvcnRzW25hbWVdO1xuICAgIGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgY29udGludWU7XG4gICAgZXhwb3J0c1tuYW1lXSA9IGZ1bmN0aW9uIGNvZGV4UGx1c1BsdXNTcGFya2xlV3JhcHBlcih0aGlzOiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10pIHtcbiAgICAgIHByZXBhcmVTaWduZWRDb2RleEZvclNwYXJrbGVJbnN0YWxsKCk7XG4gICAgICByZXR1cm4gUmVmbGVjdC5hcHBseShmbiwgdGhpcywgYXJncyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChleHBvcnRzLmRlZmF1bHQgJiYgZXhwb3J0cy5kZWZhdWx0ICE9PSBleHBvcnRzKSB7XG4gICAgd3JhcFNwYXJrbGVFeHBvcnRzKGV4cG9ydHMuZGVmYXVsdCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJlcGFyZVNpZ25lZENvZGV4Rm9yU3BhcmtsZUluc3RhbGwoKTogdm9pZCB7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSBcImRhcndpblwiKSByZXR1cm47XG4gIGlmIChleGlzdHNTeW5jKFVQREFURV9NT0RFX0ZJTEUpKSB7XG4gICAgbG9nKFwiaW5mb1wiLCBcIlNwYXJrbGUgdXBkYXRlIHByZXAgc2tpcHBlZDsgdXBkYXRlIG1vZGUgYWxyZWFkeSBhY3RpdmVcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghZXhpc3RzU3luYyhTSUdORURfQ09ERVhfQkFDS1VQKSkge1xuICAgIGxvZyhcIndhcm5cIiwgXCJTcGFya2xlIHVwZGF0ZSBwcmVwIHNraXBwZWQ7IHNpZ25lZCBDb2RleC5hcHAgYmFja3VwIGlzIG1pc3NpbmdcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghaXNEZXZlbG9wZXJJZFNpZ25lZEFwcChTSUdORURfQ09ERVhfQkFDS1VQKSkge1xuICAgIGxvZyhcIndhcm5cIiwgXCJTcGFya2xlIHVwZGF0ZSBwcmVwIHNraXBwZWQ7IENvZGV4LmFwcCBiYWNrdXAgaXMgbm90IERldmVsb3BlciBJRCBzaWduZWRcIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc3RhdGUgPSByZWFkSW5zdGFsbGVyU3RhdGUoKTtcbiAgY29uc3QgYXBwUm9vdCA9IHN0YXRlPy5hcHBSb290ID8/IGluZmVyTWFjQXBwUm9vdCgpO1xuICBpZiAoIWFwcFJvb3QpIHtcbiAgICBsb2coXCJ3YXJuXCIsIFwiU3BhcmtsZSB1cGRhdGUgcHJlcCBza2lwcGVkOyBjb3VsZCBub3QgaW5mZXIgQ29kZXguYXBwIHBhdGhcIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbW9kZSA9IHtcbiAgICBlbmFibGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICBhcHBSb290LFxuICAgIGNvZGV4VmVyc2lvbjogc3RhdGU/LmNvZGV4VmVyc2lvbiA/PyBudWxsLFxuICB9O1xuICB3cml0ZUZpbGVTeW5jKFVQREFURV9NT0RFX0ZJTEUsIEpTT04uc3RyaW5naWZ5KG1vZGUsIG51bGwsIDIpKTtcblxuICB0cnkge1xuICAgIGV4ZWNGaWxlU3luYyhcImRpdHRvXCIsIFtTSUdORURfQ09ERVhfQkFDS1VQLCBhcHBSb290XSwgeyBzdGRpbzogXCJpZ25vcmVcIiB9KTtcbiAgICB0cnkge1xuICAgICAgZXhlY0ZpbGVTeW5jKFwieGF0dHJcIiwgW1wiLWRyXCIsIFwiY29tLmFwcGxlLnF1YXJhbnRpbmVcIiwgYXBwUm9vdF0sIHsgc3RkaW86IFwiaWdub3JlXCIgfSk7XG4gICAgfSBjYXRjaCB7fVxuICAgIGxvZyhcImluZm9cIiwgXCJSZXN0b3JlZCBzaWduZWQgQ29kZXguYXBwIGJlZm9yZSBTcGFya2xlIGluc3RhbGxcIiwgeyBhcHBSb290IH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nKFwiZXJyb3JcIiwgXCJGYWlsZWQgdG8gcmVzdG9yZSBzaWduZWQgQ29kZXguYXBwIGJlZm9yZSBTcGFya2xlIGluc3RhbGxcIiwge1xuICAgICAgbWVzc2FnZTogKGUgYXMgRXJyb3IpLm1lc3NhZ2UsXG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEZXZlbG9wZXJJZFNpZ25lZEFwcChhcHBSb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKFwiY29kZXNpZ25cIiwgW1wiLWR2XCIsIFwiLS12ZXJib3NlPTRcIiwgYXBwUm9vdF0sIHtcbiAgICBlbmNvZGluZzogXCJ1dGY4XCIsXG4gICAgc3RkaW86IFtcImlnbm9yZVwiLCBcInBpcGVcIiwgXCJwaXBlXCJdLFxuICB9KTtcbiAgY29uc3Qgb3V0cHV0ID0gYCR7cmVzdWx0LnN0ZG91dCA/PyBcIlwifSR7cmVzdWx0LnN0ZGVyciA/PyBcIlwifWA7XG4gIHJldHVybiAoXG4gICAgcmVzdWx0LnN0YXR1cyA9PT0gMCAmJlxuICAgIC9BdXRob3JpdHk9RGV2ZWxvcGVyIElEIEFwcGxpY2F0aW9uOi8udGVzdChvdXRwdXQpICYmXG4gICAgIS9TaWduYXR1cmU9YWRob2MvLnRlc3Qob3V0cHV0KSAmJlxuICAgICEvVGVhbUlkZW50aWZpZXI9bm90IHNldC8udGVzdChvdXRwdXQpXG4gICk7XG59XG5cbmZ1bmN0aW9uIGluZmVyTWFjQXBwUm9vdCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgbWFya2VyID0gXCIuYXBwL0NvbnRlbnRzL01hY09TL1wiO1xuICBjb25zdCBpZHggPSBwcm9jZXNzLmV4ZWNQYXRoLmluZGV4T2YobWFya2VyKTtcbiAgcmV0dXJuIGlkeCA+PSAwID8gcHJvY2Vzcy5leGVjUGF0aC5zbGljZSgwLCBpZHggKyBcIi5hcHBcIi5sZW5ndGgpIDogbnVsbDtcbn1cblxuLy8gU3VyZmFjZSB1bmhhbmRsZWQgZXJyb3JzIGZyb20gYW55d2hlcmUgaW4gdGhlIG1haW4gcHJvY2VzcyB0byBvdXIgbG9nLlxucHJvY2Vzcy5vbihcInVuY2F1Z2h0RXhjZXB0aW9uXCIsIChlOiBFcnJvciAmIHsgY29kZT86IHN0cmluZyB9KSA9PiB7XG4gIGxvZyhcImVycm9yXCIsIFwidW5jYXVnaHRFeGNlcHRpb25cIiwgeyBjb2RlOiBlLmNvZGUsIG1lc3NhZ2U6IGUubWVzc2FnZSwgc3RhY2s6IGUuc3RhY2sgfSk7XG59KTtcbnByb2Nlc3Mub24oXCJ1bmhhbmRsZWRSZWplY3Rpb25cIiwgKGUpID0+IHtcbiAgbG9nKFwiZXJyb3JcIiwgXCJ1bmhhbmRsZWRSZWplY3Rpb25cIiwgeyB2YWx1ZTogU3RyaW5nKGUpIH0pO1xufSk7XG5cbmluc3RhbGxTcGFya2xlVXBkYXRlSG9vaygpO1xuXG5pbnRlcmZhY2UgTG9hZGVkTWFpblR3ZWFrIHtcbiAgc3RvcD86ICgpID0+IHZvaWQ7XG4gIHN0b3JhZ2U6IERpc2tTdG9yYWdlO1xufVxuXG5pbnRlcmZhY2UgQ29kZXhXaW5kb3dTZXJ2aWNlcyB7XG4gIGNyZWF0ZUZyZXNoV2luZG93PzogKHJvdXRlPzogc3RyaW5nKSA9PiBQcm9taXNlPEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsPjtcbiAgY3JlYXRlRnJlc2hMb2NhbFdpbmRvdz86IChyb3V0ZT86IHN0cmluZykgPT4gUHJvbWlzZTxFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbD47XG4gIGVuc3VyZUhvc3RXaW5kb3c/OiAoaG9zdElkPzogc3RyaW5nKSA9PiBQcm9taXNlPEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsPjtcbiAgZ2V0UHJpbWFyeVdpbmRvdz86IChob3N0SWQ/OiBzdHJpbmcpID0+IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsO1xuICBnZXRDb250ZXh0PzogKGhvc3RJZDogc3RyaW5nKSA9PiB7IHJlZ2lzdGVyV2luZG93PzogKHdpbmRvd0xpa2U6IENvZGV4V2luZG93TGlrZSkgPT4gdm9pZCB9IHwgbnVsbDtcbiAgd2luZG93TWFuYWdlcj86IHtcbiAgICBjcmVhdGVXaW5kb3c/OiAob3B0czogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IFByb21pc2U8RWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IG51bGw+O1xuICAgIGdldFByaW1hcnlXaW5kb3c/OiAoKSA9PiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbDtcbiAgICByZWdpc3RlcldpbmRvdz86IChcbiAgICAgIHdpbmRvd0xpa2U6IENvZGV4V2luZG93TGlrZSxcbiAgICAgIGhvc3RJZDogc3RyaW5nLFxuICAgICAgcHJpbWFyeTogYm9vbGVhbixcbiAgICAgIGFwcGVhcmFuY2U6IHN0cmluZyxcbiAgICApID0+IHZvaWQ7XG4gICAgb3B0aW9ucz86IHtcbiAgICAgIGFsbG93RGV2dG9vbHM/OiBib29sZWFuO1xuICAgICAgcHJlbG9hZFBhdGg/OiBzdHJpbmc7XG4gICAgfTtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIENvZGV4V2luZG93TGlrZSB7XG4gIGlkOiBudW1iZXI7XG4gIHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcbiAgb24oZXZlbnQ6IFwiY2xvc2VkXCIsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgb25jZT8oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiB1bmtub3duO1xuICBvZmY/KGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgcmVtb3ZlTGlzdGVuZXI/KGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgaXNEZXN0cm95ZWQ/KCk6IGJvb2xlYW47XG4gIGlzRm9jdXNlZD8oKTogYm9vbGVhbjtcbiAgZm9jdXM/KCk6IHZvaWQ7XG4gIHNob3c/KCk6IHZvaWQ7XG4gIGhpZGU/KCk6IHZvaWQ7XG4gIGdldEJvdW5kcz8oKTogRWxlY3Ryb24uUmVjdGFuZ2xlO1xuICBnZXRDb250ZW50Qm91bmRzPygpOiBFbGVjdHJvbi5SZWN0YW5nbGU7XG4gIGdldFNpemU/KCk6IFtudW1iZXIsIG51bWJlcl07XG4gIGdldENvbnRlbnRTaXplPygpOiBbbnVtYmVyLCBudW1iZXJdO1xuICBzZXRUaXRsZT8odGl0bGU6IHN0cmluZyk6IHZvaWQ7XG4gIGdldFRpdGxlPygpOiBzdHJpbmc7XG4gIHNldFJlcHJlc2VudGVkRmlsZW5hbWU/KGZpbGVuYW1lOiBzdHJpbmcpOiB2b2lkO1xuICBzZXREb2N1bWVudEVkaXRlZD8oZWRpdGVkOiBib29sZWFuKTogdm9pZDtcbiAgc2V0V2luZG93QnV0dG9uVmlzaWJpbGl0eT8odmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBDb2RleENyZWF0ZVdpbmRvd09wdGlvbnMge1xuICByb3V0ZTogc3RyaW5nO1xuICBob3N0SWQ/OiBzdHJpbmc7XG4gIHNob3c/OiBib29sZWFuO1xuICBhcHBlYXJhbmNlPzogc3RyaW5nO1xuICBwYXJlbnRXaW5kb3dJZD86IG51bWJlcjtcbiAgYm91bmRzPzogRWxlY3Ryb24uUmVjdGFuZ2xlO1xufVxuXG5pbnRlcmZhY2UgQ29kZXhDcmVhdGVWaWV3T3B0aW9ucyB7XG4gIHJvdXRlOiBzdHJpbmc7XG4gIGhvc3RJZD86IHN0cmluZztcbiAgYXBwZWFyYW5jZT86IHN0cmluZztcbn1cblxudHlwZSBPd2xWaWV3QXR0YWNoTW9kZSA9IFwiY29udGVudFZpZXdcIiB8IFwiYnJvd3NlclZpZXdcIjtcblxuaW50ZXJmYWNlIE1hbmFnZWRPd2xWaWV3IHtcbiAga2V5OiBzdHJpbmc7XG4gIHR3ZWFrSWQ6IHN0cmluZztcbiAgaWQ6IHN0cmluZztcbiAgdmlldzogRWxlY3Ryb24uQnJvd3NlclZpZXc7XG4gIHBhcmVudFdpbmRvd0lkOiBudW1iZXIgfCBudWxsO1xuICBhdHRhY2hNb2RlOiBPd2xWaWV3QXR0YWNoTW9kZSB8IG51bGw7XG4gIGRpc3Bvc2VCaW5kaW5nczogQXJyYXk8KCkgPT4gdm9pZD47XG4gIGRpc3Bvc2VkOiBib29sZWFuO1xufVxuXG5jb25zdCB0d2Vha1N0YXRlID0ge1xuICBkaXNjb3ZlcmVkOiBbXSBhcyBEaXNjb3ZlcmVkVHdlYWtbXSxcbiAgbG9hZGVkTWFpbjogbmV3IE1hcDxzdHJpbmcsIExvYWRlZE1haW5Ud2Vhaz4oKSxcbn07XG5cbmNvbnN0IG5hdGl2ZUJyaWRnZSA9IG5ldyBOYXRpdmVCcmlkZ2UobG9nLCB7XG4gIG5hdGl2ZUhvc3RQYXRoOiBqb2luKHJ1bnRpbWVEaXIsIFwibmF0aXZlXCIsIFwiY29kZXhwcF9uYXRpdmVfaG9zdC5ub2RlXCIpLFxufSk7XG5jb25zdCBvd2xWaWV3cyA9IG5ldyBNYXA8c3RyaW5nLCBNYW5hZ2VkT3dsVmlldz4oKTtcblxuY29uc3QgdHdlYWtMaWZlY3ljbGVEZXBzID0ge1xuICBsb2dJbmZvOiAobWVzc2FnZTogc3RyaW5nKSA9PiBsb2coXCJpbmZvXCIsIG1lc3NhZ2UpLFxuICBzZXRUd2Vha0VuYWJsZWQsXG4gIHN0b3BBbGxNYWluVHdlYWtzLFxuICBjbGVhclR3ZWFrTW9kdWxlQ2FjaGUsXG4gIGxvYWRBbGxNYWluVHdlYWtzLFxuICBicm9hZGNhc3RSZWxvYWQsXG59O1xuXG4vLyAxLiBIb29rIGV2ZXJ5IHNlc3Npb24gc28gb3VyIHByZWxvYWQgcnVucyBpbiBldmVyeSByZW5kZXJlci5cbi8vXG4vLyBXZSB1c2UgRWxlY3Ryb24ncyBtb2Rlcm4gYHNlc3Npb24ucmVnaXN0ZXJQcmVsb2FkU2NyaXB0YCBBUEkgKGFkZGVkIGluXG4vLyBFbGVjdHJvbiAzNSkuIFRoZSBkZXByZWNhdGVkIGBzZXRQcmVsb2Fkc2AgcGF0aCBzaWxlbnRseSBuby1vcHMgaW4gc29tZVxuLy8gY29uZmlndXJhdGlvbnMgKG5vdGFibHkgd2l0aCBzYW5kYm94ZWQgcmVuZGVyZXJzKSwgc28gcmVnaXN0ZXJQcmVsb2FkU2NyaXB0XG4vLyBpcyB0aGUgb25seSByZWxpYWJsZSB3YXkgdG8gaW5qZWN0IGludG8gQ29kZXgncyBCcm93c2VyV2luZG93cy5cbmZ1bmN0aW9uIHJlZ2lzdGVyUHJlbG9hZChzOiBFbGVjdHJvbi5TZXNzaW9uLCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVnID0gKHMgYXMgdW5rbm93biBhcyB7XG4gICAgICByZWdpc3RlclByZWxvYWRTY3JpcHQ/OiAob3B0czoge1xuICAgICAgICB0eXBlPzogXCJmcmFtZVwiIHwgXCJzZXJ2aWNlLXdvcmtlclwiO1xuICAgICAgICBpZD86IHN0cmluZztcbiAgICAgICAgZmlsZVBhdGg6IHN0cmluZztcbiAgICAgIH0pID0+IHN0cmluZztcbiAgICB9KS5yZWdpc3RlclByZWxvYWRTY3JpcHQ7XG4gICAgaWYgKHR5cGVvZiByZWcgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmVnLmNhbGwocywgeyB0eXBlOiBcImZyYW1lXCIsIGZpbGVQYXRoOiBQUkVMT0FEX1BBVEgsIGlkOiBcImNvZGV4LXBsdXNwbHVzXCIgfSk7XG4gICAgICBsb2coXCJpbmZvXCIsIGBwcmVsb2FkIHJlZ2lzdGVyZWQgKHJlZ2lzdGVyUHJlbG9hZFNjcmlwdCkgb24gJHtsYWJlbH06YCwgUFJFTE9BRF9QQVRIKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gRmFsbGJhY2sgZm9yIG9sZGVyIEVsZWN0cm9uIHZlcnNpb25zLlxuICAgIGNvbnN0IGV4aXN0aW5nID0gcy5nZXRQcmVsb2FkcygpO1xuICAgIGlmICghZXhpc3RpbmcuaW5jbHVkZXMoUFJFTE9BRF9QQVRIKSkge1xuICAgICAgcy5zZXRQcmVsb2FkcyhbLi4uZXhpc3RpbmcsIFBSRUxPQURfUEFUSF0pO1xuICAgIH1cbiAgICBsb2coXCJpbmZvXCIsIGBwcmVsb2FkIHJlZ2lzdGVyZWQgKHNldFByZWxvYWRzKSBvbiAke2xhYmVsfTpgLCBQUkVMT0FEX1BBVEgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUgaW5zdGFuY2VvZiBFcnJvciAmJiBlLm1lc3NhZ2UuaW5jbHVkZXMoXCJleGlzdGluZyBJRFwiKSkge1xuICAgICAgbG9nKFwiaW5mb1wiLCBgcHJlbG9hZCBhbHJlYWR5IHJlZ2lzdGVyZWQgb24gJHtsYWJlbH06YCwgUFJFTE9BRF9QQVRIKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nKFwiZXJyb3JcIiwgYHByZWxvYWQgcmVnaXN0cmF0aW9uIG9uICR7bGFiZWx9IGZhaWxlZDpgLCBlKTtcbiAgfVxufVxuXG5hcHAud2hlblJlYWR5KCkudGhlbigoKSA9PiB7XG4gIGxvZyhcImluZm9cIiwgXCJhcHAgcmVhZHkgZmlyZWRcIik7XG4gIGlmIChpc0NvZGV4UGx1c1BsdXNTYWZlTW9kZUVuYWJsZWQoKSkge1xuICAgIGxvZyhcIndhcm5cIiwgXCJzYWZlIG1vZGUgaXMgZW5hYmxlZDsgcHJlbG9hZCB3aWxsIG5vdCBiZSByZWdpc3RlcmVkXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICByZWdpc3RlclByZWxvYWQoc2Vzc2lvbi5kZWZhdWx0U2Vzc2lvbiwgXCJkZWZhdWx0U2Vzc2lvblwiKTtcbiAgbWF5YmVTdGFydEJyb3dzZXJVaVNlcnZlcih7XG4gICAgZ2V0V2luZG93U2VydmljZXM6IGdldENvZGV4V2luZG93U2VydmljZXMsXG4gICAgbG9nLFxuICB9KTtcbn0pO1xuXG5hcHAub24oXCJzZXNzaW9uLWNyZWF0ZWRcIiwgKHMpID0+IHtcbiAgaWYgKGlzQ29kZXhQbHVzUGx1c1NhZmVNb2RlRW5hYmxlZCgpKSByZXR1cm47XG4gIHJlZ2lzdGVyUHJlbG9hZChzLCBcInNlc3Npb24tY3JlYXRlZFwiKTtcbn0pO1xuXG4vLyBESUFHTk9TVElDOiBsb2cgZXZlcnkgd2ViQ29udGVudHMgY3JlYXRpb24uIFVzZWZ1bCBmb3IgdmVyaWZ5aW5nIG91clxuLy8gcHJlbG9hZCByZWFjaGVzIGV2ZXJ5IHJlbmRlcmVyIENvZGV4IHNwYXducy5cbmFwcC5vbihcIndlYi1jb250ZW50cy1jcmVhdGVkXCIsIChfZSwgd2MpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB3cCA9ICh3YyBhcyB1bmtub3duIGFzIHsgZ2V0TGFzdFdlYlByZWZlcmVuY2VzPzogKCkgPT4gUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSlcbiAgICAgIC5nZXRMYXN0V2ViUHJlZmVyZW5jZXM/LigpO1xuICAgIGxvZyhcImluZm9cIiwgXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiLCB7XG4gICAgICBpZDogd2MuaWQsXG4gICAgICB0eXBlOiB3Yy5nZXRUeXBlKCksXG4gICAgICBzZXNzaW9uSXNEZWZhdWx0OiB3Yy5zZXNzaW9uID09PSBzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLFxuICAgICAgc2FuZGJveDogd3A/LnNhbmRib3gsXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB3cD8uY29udGV4dElzb2xhdGlvbixcbiAgICB9KTtcbiAgICB3Yy5vbihcInByZWxvYWQtZXJyb3JcIiwgKF9ldiwgcCwgZXJyKSA9PiB7XG4gICAgICBsb2coXCJlcnJvclwiLCBgd2MgJHt3Yy5pZH0gcHJlbG9hZC1lcnJvciBwYXRoPSR7cH1gLCBTdHJpbmcoZXJyPy5zdGFjayA/PyBlcnIpKTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcImVycm9yXCIsIFwid2ViLWNvbnRlbnRzLWNyZWF0ZWQgaGFuZGxlciBmYWlsZWQ6XCIsIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpKTtcbiAgfVxufSk7XG5cbmxvZyhcImluZm9cIiwgXCJtYWluLnRzIGV2YWx1YXRlZDsgYXBwLmlzUmVhZHk9XCIgKyBhcHAuaXNSZWFkeSgpKTtcbmlmIChpc0NvZGV4UGx1c1BsdXNTYWZlTW9kZUVuYWJsZWQoKSkge1xuICBsb2coXCJ3YXJuXCIsIFwic2FmZSBtb2RlIGlzIGVuYWJsZWQ7IHR3ZWFrcyB3aWxsIG5vdCBiZSBsb2FkZWRcIik7XG59XG5cbi8vIDIuIEluaXRpYWwgdHdlYWsgZGlzY292ZXJ5ICsgbWFpbi1zY29wZSBsb2FkLlxubG9hZEFsbE1haW5Ud2Vha3MoKTtcblxuYXBwLm9uKFwid2lsbC1xdWl0XCIsICgpID0+IHtcbiAgc3RvcEFsbE1haW5Ud2Vha3MoKTtcbiAgbmF0aXZlQnJpZGdlLmRpc3Bvc2VBbGwoKTtcbiAgZGlzcG9zZUFsbE93bFZpZXdzKCk7XG4gIC8vIEJlc3QtZWZmb3J0IGZsdXNoIG9mIGFueSBwZW5kaW5nIHN0b3JhZ2Ugd3JpdGVzLlxuICBmb3IgKGNvbnN0IHQgb2YgdHdlYWtTdGF0ZS5sb2FkZWRNYWluLnZhbHVlcygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHQuc3RvcmFnZS5mbHVzaCgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufSk7XG5cbi8vIDMuIElQQzogZXhwb3NlIHR3ZWFrIG1ldGFkYXRhICsgcmV2ZWFsLWluLWZpbmRlci5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpsaXN0LXR3ZWFrc1wiLCBhc3luYyAoKSA9PiB7XG4gIGF3YWl0IFByb21pc2UuYWxsKHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5tYXAoKHQpID0+IGVuc3VyZVR3ZWFrVXBkYXRlQ2hlY2sodCkpKTtcbiAgY29uc3QgdXBkYXRlQ2hlY2tzID0gcmVhZFN0YXRlKCkudHdlYWtVcGRhdGVDaGVja3MgPz8ge307XG4gIHJldHVybiB0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiAoe1xuICAgIG1hbmlmZXN0OiB0Lm1hbmlmZXN0LFxuICAgIGVudHJ5OiB0LmVudHJ5LFxuICAgIGRpcjogdC5kaXIsXG4gICAgZW50cnlFeGlzdHM6IGV4aXN0c1N5bmModC5lbnRyeSksXG4gICAgZW5hYmxlZDogaXNUd2Vha0VuYWJsZWQodC5tYW5pZmVzdC5pZCksXG4gICAgdXBkYXRlOiB1cGRhdGVDaGVja3NbdC5tYW5pZmVzdC5pZF0gPz8gbnVsbCxcbiAgfSkpO1xufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpnZXQtdHdlYWstZW5hYmxlZFwiLCAoX2UsIGlkOiBzdHJpbmcpID0+IGlzVHdlYWtFbmFibGVkKGlkKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6c2V0LXR3ZWFrLWVuYWJsZWRcIiwgKF9lLCBpZDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKSA9PiB7XG4gIHJldHVybiBzZXRUd2Vha0VuYWJsZWRBbmRSZWxvYWQoaWQsIGVuYWJsZWQsIHR3ZWFrTGlmZWN5Y2xlRGVwcyk7XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmdldC1jb25maWdcIiwgKCkgPT4ge1xuICBjb25zdCBzID0gcmVhZFN0YXRlKCk7XG4gIGNvbnN0IGluc3RhbGxlclN0YXRlID0gcmVhZEluc3RhbGxlclN0YXRlKCk7XG4gIGNvbnN0IHNvdXJjZVJvb3QgPSBpbnN0YWxsZXJTdGF0ZT8uc291cmNlUm9vdCA/PyBmYWxsYmFja1NvdXJjZVJvb3QoKTtcbiAgcmV0dXJuIHtcbiAgICB2ZXJzaW9uOiBDT0RFWF9QTFVTUExVU19WRVJTSU9OLFxuICAgIGF1dG9VcGRhdGU6IHMuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2UsXG4gICAgc2FmZU1vZGU6IHMuY29kZXhQbHVzUGx1cz8uc2FmZU1vZGUgPT09IHRydWUsXG4gICAgdXBkYXRlQ2hhbm5lbDogcy5jb2RleFBsdXNQbHVzPy51cGRhdGVDaGFubmVsID8/IFwic3RhYmxlXCIsXG4gICAgdXBkYXRlUmVwbzogcy5jb2RleFBsdXNQbHVzPy51cGRhdGVSZXBvID8/IENPREVYX1BMVVNQTFVTX1JFUE8sXG4gICAgdXBkYXRlUmVmOiBzLmNvZGV4UGx1c1BsdXM/LnVwZGF0ZVJlZiA/PyBcIlwiLFxuICAgIHVwZGF0ZUNoZWNrOiBzLmNvZGV4UGx1c1BsdXM/LnVwZGF0ZUNoZWNrID8/IG51bGwsXG4gICAgc2VsZlVwZGF0ZTogcmVhZFNlbGZVcGRhdGVTdGF0ZSgpLFxuICAgIGluc3RhbGxhdGlvblNvdXJjZTogZGVzY3JpYmVJbnN0YWxsYXRpb25Tb3VyY2Uoc291cmNlUm9vdCksXG4gIH07XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnNldC1hdXRvLXVwZGF0ZVwiLCAoX2UsIGVuYWJsZWQ6IGJvb2xlYW4pID0+IHtcbiAgc2V0Q29kZXhQbHVzUGx1c0F1dG9VcGRhdGUoISFlbmFibGVkKTtcbiAgcmV0dXJuIHsgYXV0b1VwZGF0ZTogaXNDb2RleFBsdXNQbHVzQXV0b1VwZGF0ZUVuYWJsZWQoKSB9O1xufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpzZXQtdXBkYXRlLWNvbmZpZ1wiLCAoX2UsIGNvbmZpZzoge1xuICB1cGRhdGVDaGFubmVsPzogU2VsZlVwZGF0ZUNoYW5uZWw7XG4gIHVwZGF0ZVJlcG8/OiBzdHJpbmc7XG4gIHVwZGF0ZVJlZj86IHN0cmluZztcbn0pID0+IHtcbiAgc2V0Q29kZXhQbHVzUGx1c1VwZGF0ZUNvbmZpZyhjb25maWcpO1xuICBjb25zdCBzID0gcmVhZFN0YXRlKCk7XG4gIHJldHVybiB7XG4gICAgdXBkYXRlQ2hhbm5lbDogcy5jb2RleFBsdXNQbHVzPy51cGRhdGVDaGFubmVsID8/IFwic3RhYmxlXCIsXG4gICAgdXBkYXRlUmVwbzogcy5jb2RleFBsdXNQbHVzPy51cGRhdGVSZXBvID8/IENPREVYX1BMVVNQTFVTX1JFUE8sXG4gICAgdXBkYXRlUmVmOiBzLmNvZGV4UGx1c1BsdXM/LnVwZGF0ZVJlZiA/PyBcIlwiLFxuICB9O1xufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCBhc3luYyAoX2UsIGZvcmNlPzogYm9vbGVhbikgPT4ge1xuICByZXR1cm4gZW5zdXJlQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrKGZvcmNlID09PSB0cnVlKTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6cnVuLWNvZGV4cHAtdXBkYXRlXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3Qgc291cmNlUm9vdCA9IHJlYWRJbnN0YWxsZXJTdGF0ZSgpPy5zb3VyY2VSb290ID8/IGZhbGxiYWNrU291cmNlUm9vdCgpO1xuICBpZiAoIXNvdXJjZVJvb3QpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb2RleCsrIHNvdXJjZSBDTEkgd2FzIG5vdCBmb3VuZC4gUnVuIHRoZSBpbnN0YWxsZXIgb25jZSwgdGhlbiB0cnkgYWdhaW4uXCIpO1xuICB9XG4gIGNvbnN0IGNsaSA9IGpvaW4oc291cmNlUm9vdCwgXCJwYWNrYWdlc1wiLCBcImluc3RhbGxlclwiLCBcImRpc3RcIiwgXCJjbGkuanNcIik7XG4gIGlmICghZXhpc3RzU3luYyhjbGkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ29kZXgrKyBzb3VyY2UgQ0xJIHdhcyBub3QgZm91bmQuIFJ1biB0aGUgaW5zdGFsbGVyIG9uY2UsIHRoZW4gdHJ5IGFnYWluLlwiKTtcbiAgfVxuICBjb25zdCBwZW5kaW5nID0gbWFya1NlbGZVcGRhdGVTdGFydGVkKHNvdXJjZVJvb3QpO1xuICBzdGFydEluc3RhbGxlZENsaShjbGksIFtcInVwZGF0ZVwiLCBcIi0td2F0Y2hlclwiXSk7XG4gIHJldHVybiBwZW5kaW5nO1xufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpnZXQtd2F0Y2hlci1oZWFsdGhcIiwgKCkgPT4gZ2V0V2F0Y2hlckhlYWx0aCh1c2VyUm9vdCEpKTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmdldC10d2Vhay1zdG9yZVwiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0b3JlID0gYXdhaXQgZmV0Y2hUd2Vha1N0b3JlUmVnaXN0cnkoKTtcbiAgY29uc3QgcmVnaXN0cnkgPSBzdG9yZS5yZWdpc3RyeTtcbiAgY29uc3QgaW5zdGFsbGVkID0gbmV3IE1hcCh0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiBbdC5tYW5pZmVzdC5pZCwgdF0pKTtcbiAgY29uc3QgZW50cmllcyA9IHNodWZmbGVTdG9yZUVudHJpZXMocmVnaXN0cnkuZW50cmllcywgcmFuZG9tSW50KTtcbiAgcmV0dXJuIHtcbiAgICAuLi5yZWdpc3RyeSxcbiAgICBzb3VyY2VVcmw6IFRXRUFLX1NUT1JFX0lOREVYX1VSTCxcbiAgICBmZXRjaGVkQXQ6IHN0b3JlLmZldGNoZWRBdCxcbiAgICBlbnRyaWVzOiBlbnRyaWVzLm1hcCgoZW50cnkpID0+IHtcbiAgICAgIGNvbnN0IGxvY2FsID0gaW5zdGFsbGVkLmdldChlbnRyeS5pZCk7XG4gICAgICBjb25zdCBwbGF0Zm9ybSA9IHN0b3JlRW50cnlQbGF0Zm9ybUNvbXBhdGliaWxpdHkoZW50cnkpO1xuICAgICAgY29uc3QgcnVudGltZSA9IHN0b3JlRW50cnlSdW50aW1lQ29tcGF0aWJpbGl0eShlbnRyeSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5lbnRyeSxcbiAgICAgICAgcGxhdGZvcm0sXG4gICAgICAgIHJ1bnRpbWUsXG4gICAgICAgIGluc3RhbGxlZDogbG9jYWxcbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgdmVyc2lvbjogbG9jYWwubWFuaWZlc3QudmVyc2lvbixcbiAgICAgICAgICAgICAgZW5hYmxlZDogaXNUd2Vha0VuYWJsZWQobG9jYWwubWFuaWZlc3QuaWQpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDogbnVsbCxcbiAgICAgIH07XG4gICAgfSksXG4gIH07XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmluc3RhbGwtc3RvcmUtdHdlYWtcIiwgYXN5bmMgKF9lLCBpZDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHsgcmVnaXN0cnkgfSA9IGF3YWl0IGZldGNoVHdlYWtTdG9yZVJlZ2lzdHJ5KCk7XG4gIGNvbnN0IGVudHJ5ID0gcmVnaXN0cnkuZW50cmllcy5maW5kKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZS5pZCA9PT0gaWQpO1xuICBpZiAoIWVudHJ5KSB0aHJvdyBuZXcgRXJyb3IoYFR3ZWFrIHN0b3JlIGVudHJ5IG5vdCBmb3VuZDogJHtpZH1gKTtcbiAgYXNzZXJ0U3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJsZShlbnRyeSk7XG4gIGFzc2VydFN0b3JlRW50cnlSdW50aW1lQ29tcGF0aWJsZShlbnRyeSk7XG4gIGF3YWl0IGluc3RhbGxTdG9yZVR3ZWFrKGVudHJ5KTtcbiAgcmVsb2FkVHdlYWtzKFwic3RvcmUtaW5zdGFsbFwiLCB0d2Vha0xpZmVjeWNsZURlcHMpO1xuICByZXR1cm4geyBpbnN0YWxsZWQ6IGVudHJ5LmlkIH07XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnByZXBhcmUtdHdlYWstc3RvcmUtc3VibWlzc2lvblwiLCBhc3luYyAoX2UsIHJlcG9JbnB1dDogc3RyaW5nKSA9PiB7XG4gIHJldHVybiBwcmVwYXJlVHdlYWtTdG9yZVN1Ym1pc3Npb24ocmVwb0lucHV0KTtcbn0pO1xuXG4vLyBTYW5kYm94ZWQgcmVuZGVyZXIgcHJlbG9hZCBjYW4ndCB1c2UgTm9kZSBmcyB0byByZWFkIHR3ZWFrIHNvdXJjZS4gTWFpblxuLy8gcmVhZHMgaXQgb24gdGhlIHJlbmRlcmVyJ3MgYmVoYWxmLiBQYXRoIG11c3QgbGl2ZSB1bmRlciB0d2Vha3NEaXIgZm9yXG4vLyBzZWN1cml0eSBcdTIwMTQgd2UgcmVmdXNlIGFueXRoaW5nIGVsc2UuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6cmVhZC10d2Vhay1zb3VyY2VcIiwgKF9lLCBlbnRyeVBhdGg6IHN0cmluZykgPT4ge1xuICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmUoZW50cnlQYXRoKTtcbiAgaWYgKCFpc1BhdGhJbnNpZGUoVFdFQUtTX0RJUiwgcmVzb2x2ZWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwicGF0aCBvdXRzaWRlIHR3ZWFrcyBkaXJcIik7XG4gIH1cbiAgcmV0dXJuIHJlcXVpcmUoXCJub2RlOmZzXCIpLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgXCJ1dGY4XCIpO1xufSk7XG5cbi8qKlxuICogUmVhZCBhbiBhcmJpdHJhcnkgYXNzZXQgZmlsZSBmcm9tIGluc2lkZSBhIHR3ZWFrJ3MgZGlyZWN0b3J5IGFuZCByZXR1cm4gaXRcbiAqIGFzIGEgYGRhdGE6YCBVUkwuIFVzZWQgYnkgdGhlIHNldHRpbmdzIGluamVjdG9yIHRvIHJlbmRlciBtYW5pZmVzdCBpY29uc1xuICogKHRoZSByZW5kZXJlciBpcyBzYW5kYm94ZWQ7IGBmaWxlOi8vYCB3b24ndCBsb2FkKS5cbiAqXG4gKiBTZWN1cml0eTogY2FsbGVyIHBhc3NlcyBgdHdlYWtEaXJgIGFuZCBgcmVsUGF0aGA7IHdlICgxKSByZXF1aXJlIHR3ZWFrRGlyXG4gKiB0byBsaXZlIHVuZGVyIFRXRUFLU19ESVIsICgyKSByZXNvbHZlIHJlbFBhdGggYWdhaW5zdCBpdCBhbmQgcmUtY2hlY2sgdGhlXG4gKiByZXN1bHQgc3RpbGwgbGl2ZXMgdW5kZXIgVFdFQUtTX0RJUiwgKDMpIGNhcCBvdXRwdXQgc2l6ZSBhdCAxIE1pQi5cbiAqL1xuY29uc3QgQVNTRVRfTUFYX0JZVEVTID0gMTAyNCAqIDEwMjQ7XG5jb25zdCBNSU1FX0JZX0VYVDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgXCIucG5nXCI6IFwiaW1hZ2UvcG5nXCIsXG4gIFwiLmpwZ1wiOiBcImltYWdlL2pwZWdcIixcbiAgXCIuanBlZ1wiOiBcImltYWdlL2pwZWdcIixcbiAgXCIuZ2lmXCI6IFwiaW1hZ2UvZ2lmXCIsXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXG4gIFwiLnN2Z1wiOiBcImltYWdlL3N2Zyt4bWxcIixcbiAgXCIuaWNvXCI6IFwiaW1hZ2UveC1pY29uXCIsXG59O1xuaXBjTWFpbi5oYW5kbGUoXG4gIFwiY29kZXhwcDpyZWFkLXR3ZWFrLWFzc2V0XCIsXG4gIChfZSwgdHdlYWtEaXI6IHN0cmluZywgcmVsUGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZnMgPSByZXF1aXJlKFwibm9kZTpmc1wiKSBhcyB0eXBlb2YgaW1wb3J0KFwibm9kZTpmc1wiKTtcbiAgICBjb25zdCBkaXIgPSByZXNvbHZlKHR3ZWFrRGlyKTtcbiAgICBpZiAoIWlzUGF0aEluc2lkZShUV0VBS1NfRElSLCBkaXIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ0d2Vha0RpciBvdXRzaWRlIHR3ZWFrcyBkaXJcIik7XG4gICAgfVxuICAgIGNvbnN0IGZ1bGwgPSByZXNvbHZlKGRpciwgcmVsUGF0aCk7XG4gICAgaWYgKCFpc1BhdGhJbnNpZGUoZGlyLCBmdWxsKSB8fCBmdWxsID09PSBkaXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcInBhdGggdHJhdmVyc2FsXCIpO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoZnVsbCk7XG4gICAgaWYgKHN0YXQuc2l6ZSA+IEFTU0VUX01BWF9CWVRFUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBhc3NldCB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSA+ICR7QVNTRVRfTUFYX0JZVEVTfSlgKTtcbiAgICB9XG4gICAgY29uc3QgZXh0ID0gZnVsbC5zbGljZShmdWxsLmxhc3RJbmRleE9mKFwiLlwiKSkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBtaW1lID0gTUlNRV9CWV9FWFRbZXh0XSA/PyBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICAgIGNvbnN0IGJ1ZiA9IGZzLnJlYWRGaWxlU3luYyhmdWxsKTtcbiAgICByZXR1cm4gYGRhdGE6JHttaW1lfTtiYXNlNjQsJHtidWYudG9TdHJpbmcoXCJiYXNlNjRcIil9YDtcbiAgfSxcbik7XG5cbi8vIFNhbmRib3hlZCBwcmVsb2FkIGNhbid0IHdyaXRlIGxvZ3MgdG8gZGlzazsgZm9yd2FyZCB0byB1cyB2aWEgSVBDLlxuaXBjTWFpbi5vbihcImNvZGV4cHA6cHJlbG9hZC1sb2dcIiwgKF9lLCBsZXZlbDogXCJpbmZvXCIgfCBcIndhcm5cIiB8IFwiZXJyb3JcIiwgbXNnOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgbHZsID0gbGV2ZWwgPT09IFwiZXJyb3JcIiB8fCBsZXZlbCA9PT0gXCJ3YXJuXCIgPyBsZXZlbCA6IFwiaW5mb1wiO1xuICB0cnkge1xuICAgIGFwcGVuZENhcHBlZExvZyhqb2luKExPR19ESVIsIFwicHJlbG9hZC5sb2dcIiksIGBbJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XSBbJHtsdmx9XSAke21zZ31cXG5gKTtcbiAgfSBjYXRjaCB7fVxufSk7XG5cbi8vIFNhbmRib3gtc2FmZSBmaWxlc3lzdGVtIG9wcyBmb3IgcmVuZGVyZXItc2NvcGUgdHdlYWtzLiBFYWNoIHR3ZWFrIGdldHNcbi8vIGEgc2FuZGJveGVkIGRpciB1bmRlciB1c2VyUm9vdC90d2Vhay1kYXRhLzxpZD4uIFJlbmRlcmVyIHNpZGUgY2FsbHMgdGhlc2Vcbi8vIG92ZXIgSVBDIGluc3RlYWQgb2YgdXNpbmcgTm9kZSBmcyBkaXJlY3RseS5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCAoX2UsIG9wOiBzdHJpbmcsIGlkOiBzdHJpbmcsIHA6IHN0cmluZywgYz86IHN0cmluZykgPT4ge1xuICBpZiAoIS9eW2EtekEtWjAtOS5fLV0rJC8udGVzdChpZCkpIHRocm93IG5ldyBFcnJvcihcImJhZCB0d2VhayBpZFwiKTtcbiAgY29uc3QgZGlyID0gam9pbih1c2VyUm9vdCEsIFwidHdlYWstZGF0YVwiLCBpZCk7XG4gIG1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBjb25zdCBmdWxsID0gcmVzb2x2ZShkaXIsIHApO1xuICBpZiAoIWlzUGF0aEluc2lkZShkaXIsIGZ1bGwpIHx8IGZ1bGwgPT09IGRpcikgdGhyb3cgbmV3IEVycm9yKFwicGF0aCB0cmF2ZXJzYWxcIik7XG4gIGNvbnN0IGZzID0gcmVxdWlyZShcIm5vZGU6ZnNcIikgYXMgdHlwZW9mIGltcG9ydChcIm5vZGU6ZnNcIik7XG4gIHN3aXRjaCAob3ApIHtcbiAgICBjYXNlIFwicmVhZFwiOiByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGZ1bGwsIFwidXRmOFwiKTtcbiAgICBjYXNlIFwid3JpdGVcIjogcmV0dXJuIGZzLndyaXRlRmlsZVN5bmMoZnVsbCwgYyA/PyBcIlwiLCBcInV0ZjhcIik7XG4gICAgY2FzZSBcImV4aXN0c1wiOiByZXR1cm4gZnMuZXhpc3RzU3luYyhmdWxsKTtcbiAgICBjYXNlIFwiZGF0YURpclwiOiByZXR1cm4gZGlyO1xuICAgIGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgdW5rbm93biBvcDogJHtvcH1gKTtcbiAgfVxufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIsICgpID0+ICh7XG4gIHVzZXJSb290LFxuICBydW50aW1lRGlyLFxuICB0d2Vha3NEaXI6IFRXRUFLU19ESVIsXG4gIGxvZ0RpcjogTE9HX0RJUixcbn0pKTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmNvZGV4LXJ1bnRpbWUtaW5mb1wiLCAoKSA9PiBjdXJyZW50UnVudGltZUluZm8oKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29kZXgtcnVudGltZS1jYXBhYmlsaXRpZXNcIiwgKCkgPT4gY3VycmVudFJ1bnRpbWVDYXBhYmlsaXRpZXMoKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29kZXgtY2RwLXN0YXR1c1wiLCAoKSA9PiBnZXRDZHBTdGF0dXMoKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29kZXgtY2RwLXRhcmdldHNcIiwgKCkgPT4gbGlzdENkcFRhcmdldHMoKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29kZXgtd2luZG93LWNyZWF0ZVwiLCAoX2UsIG9wdHM6IENvZGV4Q3JlYXRlV2luZG93T3B0aW9ucykgPT4ge1xuICByZXR1cm4gY3JlYXRlQ29kZXhXaW5kb3cob3B0cyk7XG59KTtcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctcHJpbWFyeVwiLCAoKSA9PiBnZXRQcmltYXJ5Q29kZXhXaW5kb3dSZWYoKSk7XG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29kZXgtd2luZG93LWZvY3VzXCIsIChfZSwgd2luZG93SWQ6IG51bWJlcikgPT4gZm9jdXNDb2RleFdpbmRvdyh3aW5kb3dJZCkpO1xuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmNvZGV4LXdpbmRvdy1zaG93XCIsIChfZSwgd2luZG93SWQ6IG51bWJlcikgPT4gc2hvd0NvZGV4V2luZG93KHdpbmRvd0lkKSk7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOmNvZGV4LXZpZXctY3JlYXRlXCIsXG4gIGFzeW5jIChfZSwgdHdlYWtJZDogc3RyaW5nLCBvcHRpb25zOiBDb2RleFZpZXdDcmVhdGVPcHRpb25zKSA9PiB7XG4gICAgY29uc3QgdHdlYWsgPSBhc3NlcnRUd2Vha1ZpZXdQZXJtaXNzaW9uRm9ySWQodHdlYWtJZCk7XG4gICAgY29uc3QgcmVmID0gYXdhaXQgY3JlYXRlT3dsVmlldyh7IGlkOiB0d2Vhay5tYW5pZmVzdC5pZCwgZGlyOiB0d2Vhay5kaXIgfSwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiByZWYuaWQsXG4gICAgICB3ZWJDb250ZW50c0lkOiByZWYud2ViQ29udGVudHNJZCxcbiAgICAgIHBhcmVudFdpbmRvd0lkOiByZWYucGFyZW50V2luZG93SWQsXG4gICAgfTtcbiAgfSxcbik7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOmNvZGV4LXZpZXctY2FsbFwiLFxuICAoX2UsIHR3ZWFrSWQ6IHN0cmluZywgdmlld0lkOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmc/OiB1bmtub3duLCBhcmcyPzogdW5rbm93bikgPT4ge1xuICAgIGFzc2VydFR3ZWFrVmlld1Blcm1pc3Npb25Gb3JJZCh0d2Vha0lkKTtcbiAgICByZXR1cm4gY2FsbE93bFZpZXcodHdlYWtJZCwgdmlld0lkLCBtZXRob2QsIGFyZywgYXJnMik7XG4gIH0sXG4pO1xuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmNvZGV4LXZpZXctZGlzcG9zZS10d2Vha1wiLCAoX2UsIHR3ZWFrSWQ6IHN0cmluZykgPT4ge1xuICBhc3NlcnRUd2Vha0lkKHR3ZWFrSWQpO1xuICBkaXNwb3NlT3dsVmlld3NGb3JUd2Vhayh0d2Vha0lkKTtcbn0pO1xuaXBjTWFpbi5oYW5kbGUoXG4gIFwiY29kZXhwcDpuYXRpdmUtbG9hZC1tb2R1bGVcIixcbiAgKF9lLCB0d2Vha0lkOiBzdHJpbmcsIG9wdGlvbnM6IE5hdGl2ZU1vZHVsZUxvYWRPcHRpb25zKSA9PiB7XG4gICAgY29uc3QgcmVmID0gbmF0aXZlQnJpZGdlLmxvYWRNb2R1bGUodHdlYWtDb250ZXh0KHR3ZWFrSWQsIFwibmF0aXZlLW1vZHVsZVwiKSwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHsgaWQ6IHJlZi5pZCwga2luZDogcmVmLmtpbmQgfTtcbiAgfSxcbik7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOm5hdGl2ZS1tb2R1bGUtcmVxdWVzdFwiLFxuICAoX2UsIHR3ZWFrSWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBheWxvYWQ/OiB1bmtub3duLCB0aW1lb3V0TXM/OiBudW1iZXIpID0+IHtcbiAgICBhc3NlcnRUd2Vha1Blcm1pc3Npb25Gb3JJZCh0d2Vha0lkLCBcIm5hdGl2ZS1tb2R1bGVcIik7XG4gICAgcmV0dXJuIG5hdGl2ZUJyaWRnZS5yZXF1ZXN0TW9kdWxlKHR3ZWFrSWQsIG1vZHVsZUlkLCBtZXRob2QsIHBheWxvYWQsIHRpbWVvdXRNcyk7XG4gIH0sXG4pO1xuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOm5hdGl2ZS1tb2R1bGUtZGlzcG9zZVwiLCAoX2UsIHR3ZWFrSWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZykgPT4ge1xuICBhc3NlcnRUd2Vha1Blcm1pc3Npb25Gb3JJZCh0d2Vha0lkLCBcIm5hdGl2ZS1tb2R1bGVcIik7XG4gIHJldHVybiBuYXRpdmVCcmlkZ2UuZGlzcG9zZU1vZHVsZSh0d2Vha0lkLCBtb2R1bGVJZCk7XG59KTtcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpuYXRpdmUtZGlzcG9zZS10d2Vha1wiLCAoX2UsIHR3ZWFrSWQ6IHN0cmluZykgPT4ge1xuICBhc3NlcnRUd2Vha0lkKHR3ZWFrSWQpO1xuICBuYXRpdmVCcmlkZ2UuZGlzcG9zZVR3ZWFrKHR3ZWFrSWQpO1xufSk7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOm5hdGl2ZS1jcmVhdGUtcGFuZWxcIixcbiAgYXN5bmMgKF9lLCB0d2Vha0lkOiBzdHJpbmcsIG9wdGlvbnM6IE5hdGl2ZVBhbmVsQ3JlYXRlT3B0aW9ucykgPT4ge1xuICAgIGNvbnN0IHJlZiA9IGF3YWl0IG5hdGl2ZUJyaWRnZS5jcmVhdGVQYW5lbCh0d2Vha0NvbnRleHQodHdlYWtJZCwgXCJuYXRpdmUtdmlld1wiKSwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHsgaWQ6IHJlZi5pZCwgd2luZG93SWQ6IHJlZi53aW5kb3dJZCB9O1xuICB9LFxuKTtcbmlwY01haW4uaGFuZGxlKFxuICBcImNvZGV4cHA6bmF0aXZlLWF0dGFjaC12aWV3XCIsXG4gIGFzeW5jIChfZSwgdHdlYWtJZDogc3RyaW5nLCBvcHRpb25zOiBOYXRpdmVWaWV3QXR0YWNoT3B0aW9ucykgPT4ge1xuICAgIGNvbnN0IHJlZiA9IGF3YWl0IG5hdGl2ZUJyaWRnZS5hdHRhY2hWaWV3KHR3ZWFrQ29udGV4dCh0d2Vha0lkLCBcIm5hdGl2ZS12aWV3XCIpLCBvcHRpb25zKTtcbiAgICByZXR1cm4geyBpZDogcmVmLmlkIH07XG4gIH0sXG4pO1xuaXBjTWFpbi5oYW5kbGUoXG4gIFwiY29kZXhwcDpuYXRpdmUtaW5zdGFuY2UtY2FsbFwiLFxuICBhc3luYyAoX2UsIHR3ZWFrSWQ6IHN0cmluZywga2luZDogXCJwYW5lbFwiIHwgXCJ2aWV3XCIsIGluc3RhbmNlSWQ6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZz86IHVua25vd24pID0+IHtcbiAgICBhc3NlcnRUd2Vha1Blcm1pc3Npb25Gb3JJZCh0d2Vha0lkLCBcIm5hdGl2ZS12aWV3XCIpO1xuICAgIHJldHVybiBuYXRpdmVCcmlkZ2UuY2FsbEluc3RhbmNlKHR3ZWFrSWQsIGtpbmQsIGluc3RhbmNlSWQsIG1ldGhvZCwgYXJnKTtcbiAgfSxcbik7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOm5hdGl2ZS1sYXVuY2gtaGVscGVyXCIsXG4gIChfZSwgdHdlYWtJZDogc3RyaW5nLCBvcHRpb25zOiBOYXRpdmVIZWxwZXJMYXVuY2hPcHRpb25zKSA9PiB7XG4gICAgY29uc3QgcmVmID0gbmF0aXZlQnJpZGdlLmxhdW5jaEhlbHBlcih0d2Vha0NvbnRleHQodHdlYWtJZCwgXCJuYXRpdmUtaGVscGVyXCIpLCBvcHRpb25zKTtcbiAgICByZXR1cm4geyBpZDogcmVmLmlkLCBwaWQ6IHJlZi5waWQgfTtcbiAgfSxcbik7XG5pcGNNYWluLmhhbmRsZShcbiAgXCJjb2RleHBwOm5hdGl2ZS1oZWxwZXItY2FsbFwiLFxuICAoX2UsIHR3ZWFrSWQ6IHN0cmluZywgaGVscGVySWQ6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBheWxvYWQ/OiB1bmtub3duLCB0aW1lb3V0TXM/OiBudW1iZXIpID0+IHtcbiAgICBhc3NlcnRUd2Vha1Blcm1pc3Npb25Gb3JJZCh0d2Vha0lkLCBcIm5hdGl2ZS1oZWxwZXJcIik7XG4gICAgcmV0dXJuIG5hdGl2ZUJyaWRnZS5jYWxsSGVscGVyKHR3ZWFrSWQsIGhlbHBlcklkLCBtZXRob2QsIHBheWxvYWQsIHRpbWVvdXRNcyk7XG4gIH0sXG4pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6cmV2ZWFsXCIsIChfZSwgcDogc3RyaW5nKSA9PiB7XG4gIHNoZWxsLm9wZW5QYXRoKHApLmNhdGNoKCgpID0+IHt9KTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCAoX2UsIHVybDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgaWYgKHBhcnNlZC5wcm90b2NvbCAhPT0gXCJodHRwczpcIiB8fCBwYXJzZWQuaG9zdG5hbWUgIT09IFwiZ2l0aHViLmNvbVwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwib25seSBnaXRodWIuY29tIGxpbmtzIGNhbiBiZSBvcGVuZWQgZnJvbSB0d2VhayBtZXRhZGF0YVwiKTtcbiAgfVxuICBzaGVsbC5vcGVuRXh0ZXJuYWwocGFyc2VkLnRvU3RyaW5nKCkpLmNhdGNoKCgpID0+IHt9KTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29weS10ZXh0XCIsIChfZSwgdGV4dDogc3RyaW5nKSA9PiB7XG4gIGNsaXBib2FyZC53cml0ZVRleHQoU3RyaW5nKHRleHQpKTtcbiAgcmV0dXJuIHRydWU7XG59KTtcblxuLy8gTWFudWFsIGZvcmNlLXJlbG9hZCB0cmlnZ2VyIGZyb20gdGhlIHJlbmRlcmVyIChlLmcuIHRoZSBcIkZvcmNlIFJlbG9hZFwiXG4vLyBidXR0b24gb24gb3VyIGluamVjdGVkIFR3ZWFrcyBwYWdlKS4gQnlwYXNzZXMgdGhlIHdhdGNoZXIgZGVib3VuY2UuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6cmVsb2FkLXR3ZWFrc1wiLCAoKSA9PiB7XG4gIHJlbG9hZFR3ZWFrcyhcIm1hbnVhbFwiLCB0d2Vha0xpZmVjeWNsZURlcHMpO1xuICByZXR1cm4geyBhdDogRGF0ZS5ub3coKSwgY291bnQ6IHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGggfTtcbn0pO1xuXG4vLyA0LiBGaWxlc3lzdGVtIHdhdGNoZXIgXHUyMTkyIGRlYm91bmNlZCByZWxvYWQgKyBicm9hZGNhc3QuXG4vLyAgICBXZSB3YXRjaCB0aGUgdHdlYWtzIGRpciBmb3IgYW55IGNoYW5nZS4gT24gdGhlIGZpcnN0IHRpY2sgb2YgaW5hY3Rpdml0eVxuLy8gICAgd2Ugc3RvcCBtYWluLXNpZGUgdHdlYWtzLCBjbGVhciB0aGVpciBjYWNoZWQgbW9kdWxlcywgcmUtZGlzY292ZXIsIHRoZW5cbi8vICAgIHJlc3RhcnQgYW5kIGJyb2FkY2FzdCBgY29kZXhwcDp0d2Vha3MtY2hhbmdlZGAgdG8gZXZlcnkgcmVuZGVyZXIgc28gaXRcbi8vICAgIGNhbiByZS1pbml0IGl0cyBob3N0LlxuY29uc3QgUkVMT0FEX0RFQk9VTkNFX01TID0gMjUwO1xubGV0IHJlbG9hZFRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gc2NoZWR1bGVSZWxvYWQocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKHJlbG9hZFRpbWVyKSBjbGVhclRpbWVvdXQocmVsb2FkVGltZXIpO1xuICByZWxvYWRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHJlbG9hZFRpbWVyID0gbnVsbDtcbiAgICByZWxvYWRUd2Vha3MocmVhc29uLCB0d2Vha0xpZmVjeWNsZURlcHMpO1xuICB9LCBSRUxPQURfREVCT1VOQ0VfTVMpO1xufVxuXG50cnkge1xuICBjb25zdCB3YXRjaGVyID0gY2hva2lkYXIud2F0Y2goVFdFQUtTX0RJUiwge1xuICAgIGlnbm9yZUluaXRpYWw6IHRydWUsXG4gICAgLy8gV2FpdCBmb3IgZmlsZXMgdG8gc2V0dGxlIGJlZm9yZSB0cmlnZ2VyaW5nIFx1MjAxNCBndWFyZHMgYWdhaW5zdCBwYXJ0aWFsbHlcbiAgICAvLyB3cml0dGVuIHR3ZWFrIGZpbGVzIGR1cmluZyBlZGl0b3Igc2F2ZXMgLyBnaXQgY2hlY2tvdXRzLlxuICAgIGF3YWl0V3JpdGVGaW5pc2g6IHsgc3RhYmlsaXR5VGhyZXNob2xkOiAxNTAsIHBvbGxJbnRlcnZhbDogNTAgfSxcbiAgICAvLyBBdm9pZCBlYXRpbmcgQ1BVIG9uIGh1Z2Ugbm9kZV9tb2R1bGVzIHRyZWVzIGluc2lkZSB0d2VhayBmb2xkZXJzLlxuICAgIGlnbm9yZWQ6IChwKSA9PiBwLmluY2x1ZGVzKGAke1RXRUFLU19ESVJ9L2ApICYmIC9cXC9ub2RlX21vZHVsZXNcXC8vLnRlc3QocCksXG4gIH0pO1xuICB3YXRjaGVyLm9uKFwiYWxsXCIsIChldmVudCwgcGF0aCkgPT4gc2NoZWR1bGVSZWxvYWQoYCR7ZXZlbnR9ICR7cGF0aH1gKSk7XG4gIHdhdGNoZXIub24oXCJlcnJvclwiLCAoZSkgPT4gbG9nKFwid2FyblwiLCBcIndhdGNoZXIgZXJyb3I6XCIsIGUpKTtcbiAgbG9nKFwiaW5mb1wiLCBcIndhdGNoaW5nXCIsIFRXRUFLU19ESVIpO1xuICBhcHAub24oXCJ3aWxsLXF1aXRcIiwgKCkgPT4gd2F0Y2hlci5jbG9zZSgpLmNhdGNoKCgpID0+IHt9KSk7XG59IGNhdGNoIChlKSB7XG4gIGxvZyhcImVycm9yXCIsIFwiZmFpbGVkIHRvIHN0YXJ0IHdhdGNoZXI6XCIsIGUpO1xufVxuXG4vLyAtLS0gaGVscGVycyAtLS1cblxuZnVuY3Rpb24gbG9hZEFsbE1haW5Ud2Vha3MoKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkID0gZGlzY292ZXJUd2Vha3MoVFdFQUtTX0RJUik7XG4gICAgbG9nKFxuICAgICAgXCJpbmZvXCIsXG4gICAgICBgZGlzY292ZXJlZCAke3R3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGh9IHR3ZWFrKHMpOmAsXG4gICAgICB0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiB0Lm1hbmlmZXN0LmlkKS5qb2luKFwiLCBcIiksXG4gICAgKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcImVycm9yXCIsIFwidHdlYWsgZGlzY292ZXJ5IGZhaWxlZDpcIiwgZSk7XG4gICAgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkID0gW107XG4gIH1cblxuICBzeW5jTWNwU2VydmVyc0Zyb21FbmFibGVkVHdlYWtzKCk7XG5cbiAgZm9yIChjb25zdCB0IG9mIHR3ZWFrU3RhdGUuZGlzY292ZXJlZCkge1xuICAgIGlmICghaXNNYWluUHJvY2Vzc1R3ZWFrU2NvcGUodC5tYW5pZmVzdC5zY29wZSkpIGNvbnRpbnVlO1xuICAgIGlmICghaXNUd2Vha0VuYWJsZWQodC5tYW5pZmVzdC5pZCkpIHtcbiAgICAgIGxvZyhcImluZm9cIiwgYHNraXBwaW5nIGRpc2FibGVkIG1haW4gdHdlYWs6ICR7dC5tYW5pZmVzdC5pZH1gKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgbW9kID0gcmVxdWlyZSh0LmVudHJ5KTtcbiAgICAgIGNvbnN0IHR3ZWFrID0gbW9kLmRlZmF1bHQgPz8gbW9kO1xuICAgICAgaWYgKHR5cGVvZiB0d2Vhaz8uc3RhcnQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICBjb25zdCBzdG9yYWdlID0gY3JlYXRlRGlza1N0b3JhZ2UodXNlclJvb3QhLCB0Lm1hbmlmZXN0LmlkKTtcbiAgICAgICAgdHdlYWsuc3RhcnQoe1xuICAgICAgICAgIG1hbmlmZXN0OiB0Lm1hbmlmZXN0LFxuICAgICAgICAgIHByb2Nlc3M6IFwibWFpblwiLFxuICAgICAgICAgIGxvZzogbWFrZUxvZ2dlcih0Lm1hbmlmZXN0LmlkKSxcbiAgICAgICAgICBzdG9yYWdlLFxuICAgICAgICAgIGlwYzogbWFrZU1haW5JcGModC5tYW5pZmVzdC5pZCksXG4gICAgICAgICAgZnM6IG1ha2VNYWluRnModC5tYW5pZmVzdC5pZCksXG4gICAgICAgICAgY29kZXg6IG1ha2VDb2RleEFwaSh0KSxcbiAgICAgICAgfSk7XG4gICAgICAgIHR3ZWFrU3RhdGUubG9hZGVkTWFpbi5zZXQodC5tYW5pZmVzdC5pZCwge1xuICAgICAgICAgIHN0b3A6IHR3ZWFrLnN0b3AsXG4gICAgICAgICAgc3RvcmFnZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZyhcImluZm9cIiwgYHN0YXJ0ZWQgbWFpbiB0d2VhazogJHt0Lm1hbmlmZXN0LmlkfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZyhcImVycm9yXCIsIGB0d2VhayAke3QubWFuaWZlc3QuaWR9IGZhaWxlZCB0byBzdGFydDpgLCBlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc3luY01jcFNlcnZlcnNGcm9tRW5hYmxlZFR3ZWFrcygpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBzeW5jTWFuYWdlZE1jcFNlcnZlcnMoe1xuICAgICAgY29uZmlnUGF0aDogQ09ERVhfQ09ORklHX0ZJTEUsXG4gICAgICB0d2Vha3M6IHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5maWx0ZXIoKHQpID0+IGlzVHdlYWtFbmFibGVkKHQubWFuaWZlc3QuaWQpKSxcbiAgICB9KTtcbiAgICBpZiAocmVzdWx0LmNoYW5nZWQpIHtcbiAgICAgIGxvZyhcImluZm9cIiwgYHN5bmNlZCBDb2RleCBNQ1AgY29uZmlnOiAke3Jlc3VsdC5zZXJ2ZXJOYW1lcy5qb2luKFwiLCBcIikgfHwgXCJub25lXCJ9YCk7XG4gICAgfVxuICAgIGlmIChyZXN1bHQuc2tpcHBlZFNlcnZlck5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGxvZyhcbiAgICAgICAgXCJpbmZvXCIsXG4gICAgICAgIGBza2lwcGVkIENvZGV4KysgbWFuYWdlZCBNQ1Agc2VydmVyKHMpIGFscmVhZHkgY29uZmlndXJlZCBieSB1c2VyOiAke3Jlc3VsdC5za2lwcGVkU2VydmVyTmFtZXMuam9pbihcIiwgXCIpfWAsXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcIndhcm5cIiwgXCJmYWlsZWQgdG8gc3luYyBDb2RleCBNQ1AgY29uZmlnOlwiLCBlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdG9wQWxsTWFpblR3ZWFrcygpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBbaWQsIHRdIG9mIHR3ZWFrU3RhdGUubG9hZGVkTWFpbikge1xuICAgIHRyeSB7XG4gICAgICB0LnN0b3A/LigpO1xuICAgICAgdC5zdG9yYWdlLmZsdXNoKCk7XG4gICAgICBsb2coXCJpbmZvXCIsIGBzdG9wcGVkIG1haW4gdHdlYWs6ICR7aWR9YCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nKFwid2FyblwiLCBgc3RvcCBmYWlsZWQgZm9yICR7aWR9OmAsIGUpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBuYXRpdmVCcmlkZ2UuZGlzcG9zZVR3ZWFrKGlkKTtcbiAgICAgIGRpc3Bvc2VPd2xWaWV3c0ZvclR3ZWFrKGlkKTtcbiAgICB9XG4gIH1cbiAgdHdlYWtTdGF0ZS5sb2FkZWRNYWluLmNsZWFyKCk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyVHdlYWtNb2R1bGVDYWNoZSgpOiB2b2lkIHtcbiAgY29uc3Qgcm9vdFNldCA9IG5ldyBTZXQ8c3RyaW5nPihbVFdFQUtTX0RJUiwgc2FmZVJlYWxwYXRoKFRXRUFLU19ESVIpXSk7XG4gIGNvbnN0IGVudHJ5U2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdHdlYWsgb2YgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkKSB7XG4gICAgcm9vdFNldC5hZGQodHdlYWsuZGlyKTtcbiAgICByb290U2V0LmFkZChzYWZlUmVhbHBhdGgodHdlYWsuZGlyKSk7XG4gICAgZW50cnlTZXQuYWRkKHR3ZWFrLmVudHJ5KTtcbiAgICBlbnRyeVNldC5hZGQoc2FmZVJlYWxwYXRoKHR3ZWFrLmVudHJ5KSk7XG4gIH1cblxuICBjb25zdCByb290cyA9IFsuLi5yb290U2V0XTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmVxdWlyZS5jYWNoZSkpIHtcbiAgICBjb25zdCByZWFsS2V5ID0gc2FmZVJlYWxwYXRoKGtleSk7XG4gICAgY29uc3QgaXNUd2Vha01vZHVsZSA9XG4gICAgICBlbnRyeVNldC5oYXMoa2V5KSB8fFxuICAgICAgZW50cnlTZXQuaGFzKHJlYWxLZXkpIHx8XG4gICAgICByb290cy5zb21lKChyb290KSA9PiBpc1BhdGhJbnNpZGUocm9vdCwga2V5KSB8fCBpc1BhdGhJbnNpZGUocm9vdCwgcmVhbEtleSkpO1xuICAgIGlmIChpc1R3ZWFrTW9kdWxlKSBkZWxldGUgcmVxdWlyZS5jYWNoZVtrZXldO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNhZmVSZWFscGF0aChmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gcmVhbHBhdGhTeW5jKGZpbGVQYXRoKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZpbGVQYXRoO1xuICB9XG59XG5cbmNvbnN0IFVQREFURV9DSEVDS19JTlRFUlZBTF9NUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5jb25zdCBWRVJTSU9OX1JFID0gL152PyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlstK10uKik/JC87XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZUNvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayhmb3JjZSA9IGZhbHNlKTogUHJvbWlzZTxDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2s+IHtcbiAgY29uc3Qgc3RhdGUgPSByZWFkU3RhdGUoKTtcbiAgY29uc3QgY2FjaGVkID0gc3RhdGUuY29kZXhQbHVzUGx1cz8udXBkYXRlQ2hlY2s7XG4gIGNvbnN0IGNoYW5uZWwgPSBzdGF0ZS5jb2RleFBsdXNQbHVzPy51cGRhdGVDaGFubmVsID8/IFwic3RhYmxlXCI7XG4gIGNvbnN0IHJlcG8gPSBzdGF0ZS5jb2RleFBsdXNQbHVzPy51cGRhdGVSZXBvID8/IENPREVYX1BMVVNQTFVTX1JFUE87XG4gIGlmIChcbiAgICAhZm9yY2UgJiZcbiAgICBjYWNoZWQgJiZcbiAgICBjYWNoZWQuY3VycmVudFZlcnNpb24gPT09IENPREVYX1BMVVNQTFVTX1ZFUlNJT04gJiZcbiAgICBEYXRlLm5vdygpIC0gRGF0ZS5wYXJzZShjYWNoZWQuY2hlY2tlZEF0KSA8IFVQREFURV9DSEVDS19JTlRFUlZBTF9NU1xuICApIHtcbiAgICByZXR1cm4gY2FjaGVkO1xuICB9XG5cbiAgY29uc3QgcmVsZWFzZSA9IGF3YWl0IGZldGNoTGF0ZXN0UmVsZWFzZShyZXBvLCBDT0RFWF9QTFVTUExVU19WRVJTSU9OLCBjaGFubmVsID09PSBcInByZXJlbGVhc2VcIik7XG4gIGNvbnN0IGxhdGVzdFZlcnNpb24gPSByZWxlYXNlLmxhdGVzdFRhZyA/IG5vcm1hbGl6ZVZlcnNpb24ocmVsZWFzZS5sYXRlc3RUYWcpIDogbnVsbDtcbiAgY29uc3QgY2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayA9IHtcbiAgICBjaGVja2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICBjdXJyZW50VmVyc2lvbjogQ09ERVhfUExVU1BMVVNfVkVSU0lPTixcbiAgICBsYXRlc3RWZXJzaW9uLFxuICAgIHJlbGVhc2VVcmw6IHJlbGVhc2UucmVsZWFzZVVybCA/PyBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb30vcmVsZWFzZXNgLFxuICAgIHJlbGVhc2VOb3RlczogcmVsZWFzZS5yZWxlYXNlTm90ZXMsXG4gICAgdXBkYXRlQXZhaWxhYmxlOiBsYXRlc3RWZXJzaW9uXG4gICAgICA/IGNvbXBhcmVWZXJzaW9ucyhub3JtYWxpemVWZXJzaW9uKGxhdGVzdFZlcnNpb24pLCBDT0RFWF9QTFVTUExVU19WRVJTSU9OKSA+IDBcbiAgICAgIDogZmFsc2UsXG4gICAgLi4uKHJlbGVhc2UuZXJyb3IgPyB7IGVycm9yOiByZWxlYXNlLmVycm9yIH0gOiB7fSksXG4gIH07XG4gIHN0YXRlLmNvZGV4UGx1c1BsdXMgPz89IHt9O1xuICBzdGF0ZS5jb2RleFBsdXNQbHVzLnVwZGF0ZUNoZWNrID0gY2hlY2s7XG4gIHdyaXRlU3RhdGUoc3RhdGUpO1xuICByZXR1cm4gY2hlY2s7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZVR3ZWFrVXBkYXRlQ2hlY2sodDogRGlzY292ZXJlZFR3ZWFrKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGlkID0gdC5tYW5pZmVzdC5pZDtcbiAgY29uc3QgcmVwbyA9IHQubWFuaWZlc3QuZ2l0aHViUmVwbztcbiAgY29uc3Qgc3RhdGUgPSByZWFkU3RhdGUoKTtcbiAgY29uc3QgY2FjaGVkID0gc3RhdGUudHdlYWtVcGRhdGVDaGVja3M/LltpZF07XG4gIGlmIChcbiAgICBjYWNoZWQgJiZcbiAgICBjYWNoZWQucmVwbyA9PT0gcmVwbyAmJlxuICAgIGNhY2hlZC5jdXJyZW50VmVyc2lvbiA9PT0gdC5tYW5pZmVzdC52ZXJzaW9uICYmXG4gICAgRGF0ZS5ub3coKSAtIERhdGUucGFyc2UoY2FjaGVkLmNoZWNrZWRBdCkgPCBVUERBVEVfQ0hFQ0tfSU5URVJWQUxfTVNcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbmV4dCA9IGF3YWl0IGZldGNoTGF0ZXN0UmVsZWFzZShyZXBvLCB0Lm1hbmlmZXN0LnZlcnNpb24pO1xuICBjb25zdCBsYXRlc3RWZXJzaW9uID0gbmV4dC5sYXRlc3RUYWcgPyBub3JtYWxpemVWZXJzaW9uKG5leHQubGF0ZXN0VGFnKSA6IG51bGw7XG4gIGNvbnN0IGNoZWNrOiBUd2Vha1VwZGF0ZUNoZWNrID0ge1xuICAgIGNoZWNrZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIHJlcG8sXG4gICAgY3VycmVudFZlcnNpb246IHQubWFuaWZlc3QudmVyc2lvbixcbiAgICBsYXRlc3RWZXJzaW9uLFxuICAgIGxhdGVzdFRhZzogbmV4dC5sYXRlc3RUYWcsXG4gICAgcmVsZWFzZVVybDogbmV4dC5yZWxlYXNlVXJsLFxuICAgIHVwZGF0ZUF2YWlsYWJsZTogbGF0ZXN0VmVyc2lvblxuICAgICAgPyBjb21wYXJlVmVyc2lvbnMobGF0ZXN0VmVyc2lvbiwgbm9ybWFsaXplVmVyc2lvbih0Lm1hbmlmZXN0LnZlcnNpb24pKSA+IDBcbiAgICAgIDogZmFsc2UsXG4gICAgLi4uKG5leHQuZXJyb3IgPyB7IGVycm9yOiBuZXh0LmVycm9yIH0gOiB7fSksXG4gIH07XG4gIHN0YXRlLnR3ZWFrVXBkYXRlQ2hlY2tzID8/PSB7fTtcbiAgc3RhdGUudHdlYWtVcGRhdGVDaGVja3NbaWRdID0gY2hlY2s7XG4gIHdyaXRlU3RhdGUoc3RhdGUpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaExhdGVzdFJlbGVhc2UoXG4gIHJlcG86IHN0cmluZyxcbiAgY3VycmVudFZlcnNpb246IHN0cmluZyxcbiAgaW5jbHVkZVByZXJlbGVhc2UgPSBmYWxzZSxcbik6IFByb21pc2U8eyBsYXRlc3RUYWc6IHN0cmluZyB8IG51bGw7IHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7IHJlbGVhc2VOb3Rlczogc3RyaW5nIHwgbnVsbDsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCA4MDAwKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZW5kcG9pbnQgPSBpbmNsdWRlUHJlcmVsZWFzZSA/IFwicmVsZWFzZXM/cGVyX3BhZ2U9MjBcIiA6IFwicmVsZWFzZXMvbGF0ZXN0XCI7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8ke3JlcG99LyR7ZW5kcG9pbnR9YCwge1xuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJBY2NlcHRcIjogXCJhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb25cIixcbiAgICAgICAgICBcIlVzZXItQWdlbnRcIjogYGNvZGV4LXBsdXNwbHVzLyR7Y3VycmVudFZlcnNpb259YCxcbiAgICAgICAgfSxcbiAgICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlcy5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICByZXR1cm4geyBsYXRlc3RUYWc6IG51bGwsIHJlbGVhc2VVcmw6IG51bGwsIHJlbGVhc2VOb3RlczogbnVsbCwgZXJyb3I6IFwibm8gR2l0SHViIHJlbGVhc2UgZm91bmRcIiB9O1xuICAgICAgfVxuICAgICAgaWYgKCFyZXMub2spIHtcbiAgICAgICAgcmV0dXJuIHsgbGF0ZXN0VGFnOiBudWxsLCByZWxlYXNlVXJsOiBudWxsLCByZWxlYXNlTm90ZXM6IG51bGwsIGVycm9yOiBgR2l0SHViIHJldHVybmVkICR7cmVzLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzLmpzb24oKSBhcyB7IHRhZ19uYW1lPzogc3RyaW5nOyBodG1sX3VybD86IHN0cmluZzsgYm9keT86IHN0cmluZzsgZHJhZnQ/OiBib29sZWFuIH0gfCBBcnJheTx7IHRhZ19uYW1lPzogc3RyaW5nOyBodG1sX3VybD86IHN0cmluZzsgYm9keT86IHN0cmluZzsgZHJhZnQ/OiBib29sZWFuIH0+O1xuICAgICAgY29uc3QgYm9keSA9IEFycmF5LmlzQXJyYXkoanNvbikgPyBqc29uLmZpbmQoKHJlbGVhc2UpID0+ICFyZWxlYXNlLmRyYWZ0KSA6IGpzb247XG4gICAgICBpZiAoIWJvZHkpIHtcbiAgICAgICAgcmV0dXJuIHsgbGF0ZXN0VGFnOiBudWxsLCByZWxlYXNlVXJsOiBudWxsLCByZWxlYXNlTm90ZXM6IG51bGwsIGVycm9yOiBcIm5vIEdpdEh1YiByZWxlYXNlIGZvdW5kXCIgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxhdGVzdFRhZzogYm9keS50YWdfbmFtZSA/PyBudWxsLFxuICAgICAgICByZWxlYXNlVXJsOiBib2R5Lmh0bWxfdXJsID8/IGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfS9yZWxlYXNlc2AsXG4gICAgICAgIHJlbGVhc2VOb3RlczogYm9keS5ib2R5ID8/IG51bGwsXG4gICAgICB9O1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGxhdGVzdFRhZzogbnVsbCxcbiAgICAgIHJlbGVhc2VVcmw6IG51bGwsXG4gICAgICByZWxlYXNlTm90ZXM6IG51bGwsXG4gICAgICBlcnJvcjogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxuICAgIH07XG4gIH1cbn1cblxuaW50ZXJmYWNlIFR3ZWFrU3RvcmVGZXRjaFJlc3VsdCB7XG4gIHJlZ2lzdHJ5OiBUd2Vha1N0b3JlUmVnaXN0cnk7XG4gIGZldGNoZWRBdDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU3RvcmVJbnN0YWxsTWV0YWRhdGEge1xuICByZXBvOiBzdHJpbmc7XG4gIGFwcHJvdmVkQ29tbWl0U2hhOiBzdHJpbmc7XG4gIGluc3RhbGxlZEF0OiBzdHJpbmc7XG4gIHN0b3JlSW5kZXhVcmw6IHN0cmluZztcbiAgZmlsZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgU3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJpbGl0eSB7XG4gIGN1cnJlbnQ6IE5vZGVKUy5QbGF0Zm9ybTtcbiAgc3VwcG9ydGVkOiBUd2Vha1N0b3JlUGxhdGZvcm1bXSB8IG51bGw7XG4gIGNvbXBhdGlibGU6IGJvb2xlYW47XG4gIHJlYXNvbjogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIFN0b3JlRW50cnlSdW50aW1lQ29tcGF0aWJpbGl0eSB7XG4gIGN1cnJlbnQ6IHN0cmluZztcbiAgcmVxdWlyZWQ6IHN0cmluZyB8IG51bGw7XG4gIGNvbXBhdGlibGU6IGJvb2xlYW47XG4gIHJlYXNvbjogc3RyaW5nIHwgbnVsbDtcbn1cblxuY2xhc3MgU3RvcmVUd2Vha01vZGlmaWVkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHR3ZWFrTmFtZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBgJHt0d2Vha05hbWV9IGhhcyBsb2NhbCBzb3VyY2UgY2hhbmdlcywgc28gQ29kZXgrKyBjYW4ndCBhdXRvLXVwZGF0ZSBpdC4gUmV2ZXJ0IHlvdXIgbG9jYWwgY2hhbmdlcyBvciByZWluc3RhbGwgdGhlIHR3ZWFrIG1hbnVhbGx5LmAsXG4gICAgKTtcbiAgICB0aGlzLm5hbWUgPSBcIlN0b3JlVHdlYWtNb2RpZmllZEVycm9yXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJpbGl0eShlbnRyeTogVHdlYWtTdG9yZUVudHJ5KTogU3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJpbGl0eSB7XG4gIGNvbnN0IHN1cHBvcnRlZCA9IGVudHJ5LnBsYXRmb3JtcyA/PyBudWxsO1xuICBjb25zdCBjb21wYXRpYmxlID0gIXN1cHBvcnRlZCB8fCBzdXBwb3J0ZWQuaW5jbHVkZXMocHJvY2Vzcy5wbGF0Zm9ybSBhcyBUd2Vha1N0b3JlUGxhdGZvcm0pO1xuICByZXR1cm4ge1xuICAgIGN1cnJlbnQ6IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgc3VwcG9ydGVkLFxuICAgIGNvbXBhdGlibGUsXG4gICAgcmVhc29uOiBjb21wYXRpYmxlID8gbnVsbCA6IGAke2VudHJ5Lm1hbmlmZXN0Lm5hbWV9IGlzIG9ubHkgYXZhaWxhYmxlIG9uICR7Zm9ybWF0U3RvcmVQbGF0Zm9ybXMoc3VwcG9ydGVkKX0uYCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0U3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJsZShlbnRyeTogVHdlYWtTdG9yZUVudHJ5KTogdm9pZCB7XG4gIGNvbnN0IHBsYXRmb3JtID0gc3RvcmVFbnRyeVBsYXRmb3JtQ29tcGF0aWJpbGl0eShlbnRyeSk7XG4gIGlmICghcGxhdGZvcm0uY29tcGF0aWJsZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihwbGF0Zm9ybS5yZWFzb24gPz8gYCR7ZW50cnkubWFuaWZlc3QubmFtZX0gaXMgbm90IGF2YWlsYWJsZSBvbiB0aGlzIHBsYXRmb3JtLmApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0b3JlRW50cnlSdW50aW1lQ29tcGF0aWJpbGl0eShlbnRyeTogVHdlYWtTdG9yZUVudHJ5KTogU3RvcmVFbnRyeVJ1bnRpbWVDb21wYXRpYmlsaXR5IHtcbiAgY29uc3QgcmVxdWlyZWQgPSBjbGVhbk1pblJ1bnRpbWUoZW50cnkubWFuaWZlc3QubWluUnVudGltZSk7XG4gIGNvbnN0IGNvbXBhdGlibGUgPSAhcmVxdWlyZWQgfHwgY29tcGFyZVZlcnNpb25zKENPREVYX1BMVVNQTFVTX1ZFUlNJT04sIHJlcXVpcmVkKSA+PSAwO1xuICByZXR1cm4ge1xuICAgIGN1cnJlbnQ6IENPREVYX1BMVVNQTFVTX1ZFUlNJT04sXG4gICAgcmVxdWlyZWQsXG4gICAgY29tcGF0aWJsZSxcbiAgICByZWFzb246IGNvbXBhdGlibGUgfHwgIXJlcXVpcmVkXG4gICAgICA/IG51bGxcbiAgICAgIDogYCR7ZW50cnkubWFuaWZlc3QubmFtZX0gcmVxdWlyZXMgQ29kZXgrKyAke3JlcXVpcmVkfSBvciBuZXdlci5gLFxuICB9O1xufVxuXG5mdW5jdGlvbiBhc3NlcnRTdG9yZUVudHJ5UnVudGltZUNvbXBhdGlibGUoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeSk6IHZvaWQge1xuICBjb25zdCBydW50aW1lID0gc3RvcmVFbnRyeVJ1bnRpbWVDb21wYXRpYmlsaXR5KGVudHJ5KTtcbiAgaWYgKCFydW50aW1lLmNvbXBhdGlibGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IocnVudGltZS5yZWFzb24gPz8gYCR7ZW50cnkubWFuaWZlc3QubmFtZX0gcmVxdWlyZXMgYSBuZXdlciBDb2RleCsrIHJ1bnRpbWUuYCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xlYW5NaW5SdW50aW1lKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIpIHJldHVybiBudWxsO1xuICBjb25zdCB2ZXJzaW9uID0gbm9ybWFsaXplVmVyc2lvbih2YWx1ZS5yZXBsYWNlKC9ePj0/XFxzKi8sIFwiXCIpKTtcbiAgcmV0dXJuIFZFUlNJT05fUkUudGVzdCh2ZXJzaW9uKSA/IHZlcnNpb24gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRTdG9yZVBsYXRmb3JtcyhwbGF0Zm9ybXM6IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghcGxhdGZvcm1zIHx8IHBsYXRmb3Jtcy5sZW5ndGggPT09IDApIHJldHVybiBcInN1cHBvcnRlZCBwbGF0Zm9ybXNcIjtcbiAgcmV0dXJuIHBsYXRmb3Jtcy5tYXAoKHBsYXRmb3JtKSA9PiB7XG4gICAgaWYgKHBsYXRmb3JtID09PSBcImRhcndpblwiKSByZXR1cm4gXCJtYWNPU1wiO1xuICAgIGlmIChwbGF0Zm9ybSA9PT0gXCJ3aW4zMlwiKSByZXR1cm4gXCJXaW5kb3dzXCI7XG4gICAgcmV0dXJuIFwiTGludXhcIjtcbiAgfSkuam9pbihcIiwgXCIpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaFR3ZWFrU3RvcmVSZWdpc3RyeSgpOiBQcm9taXNlPFR3ZWFrU3RvcmVGZXRjaFJlc3VsdD4ge1xuICBjb25zdCBmZXRjaGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDgwMDApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChUV0VBS19TVE9SRV9JTkRFWF9VUkwsIHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQWNjZXB0XCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIFwiVXNlci1BZ2VudFwiOiBgY29kZXgtcGx1c3BsdXMvJHtDT0RFWF9QTFVTUExVU19WRVJTSU9OfWAsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogY29udHJvbGxlci5zaWduYWwsXG4gICAgICB9KTtcbiAgICAgIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYHN0b3JlIHJldHVybmVkICR7cmVzLnN0YXR1c31gKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlZ2lzdHJ5OiBub3JtYWxpemVTdG9yZVJlZ2lzdHJ5KGF3YWl0IHJlcy5qc29uKCkpLFxuICAgICAgICBmZXRjaGVkQXQsXG4gICAgICB9O1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc3QgZXJyb3IgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSk7XG4gICAgbG9nKFwid2FyblwiLCBcImZhaWxlZCB0byBmZXRjaCB0d2VhayBzdG9yZSByZWdpc3RyeTpcIiwgZXJyb3IubWVzc2FnZSk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5zdGFsbFN0b3JlVHdlYWsoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB1cmwgPSBzdG9yZUFyY2hpdmVVcmwoZW50cnkpO1xuICBjb25zdCB3b3JrID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgXCJjb2RleHBwLXN0b3JlLXR3ZWFrLVwiKSk7XG4gIGNvbnN0IGFyY2hpdmUgPSBqb2luKHdvcmssIFwic291cmNlLnRhci5nelwiKTtcbiAgY29uc3QgZXh0cmFjdERpciA9IGpvaW4od29yaywgXCJleHRyYWN0XCIpO1xuICBjb25zdCB0YXJnZXQgPSBqb2luKFRXRUFLU19ESVIsIGVudHJ5LmlkKTtcbiAgY29uc3Qgc3RhZ2VkVGFyZ2V0ID0gam9pbih3b3JrLCBcInN0YWdlZFwiLCBlbnRyeS5pZCk7XG5cbiAgdHJ5IHtcbiAgICBsb2coXCJpbmZvXCIsIGBpbnN0YWxsaW5nIHN0b3JlIHR3ZWFrICR7ZW50cnkuaWR9IGZyb20gJHtlbnRyeS5yZXBvfUAke2VudHJ5LmFwcHJvdmVkQ29tbWl0U2hhfWApO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgaGVhZGVyczogeyBcIlVzZXItQWdlbnRcIjogYGNvZGV4LXBsdXNwbHVzLyR7Q09ERVhfUExVU1BMVVNfVkVSU0lPTn1gIH0sXG4gICAgICByZWRpcmVjdDogXCJmb2xsb3dcIixcbiAgICB9KTtcbiAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBkb3dubG9hZCBmYWlsZWQ6ICR7cmVzLnN0YXR1c31gKTtcbiAgICBjb25zdCBieXRlcyA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlcy5hcnJheUJ1ZmZlcigpKTtcbiAgICB3cml0ZUZpbGVTeW5jKGFyY2hpdmUsIGJ5dGVzKTtcbiAgICBta2RpclN5bmMoZXh0cmFjdERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgZXh0cmFjdFRhckFyY2hpdmUoYXJjaGl2ZSwgZXh0cmFjdERpcik7XG4gICAgY29uc3Qgc291cmNlID0gZmluZFR3ZWFrUm9vdChleHRyYWN0RGlyKTtcbiAgICBpZiAoIXNvdXJjZSkgdGhyb3cgbmV3IEVycm9yKFwiZG93bmxvYWRlZCBhcmNoaXZlIGRpZCBub3QgY29udGFpbiBtYW5pZmVzdC5qc29uXCIpO1xuICAgIHZhbGlkYXRlU3RvcmVUd2Vha1NvdXJjZShlbnRyeSwgc291cmNlKTtcbiAgICBybVN5bmMoc3RhZ2VkVGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG4gICAgY29weVR3ZWFrU291cmNlKHNvdXJjZSwgc3RhZ2VkVGFyZ2V0KTtcbiAgICBjb25zdCBzdGFnZWRGaWxlcyA9IGhhc2hUd2Vha1NvdXJjZShzdGFnZWRUYXJnZXQpO1xuICAgIHdyaXRlRmlsZVN5bmMoXG4gICAgICBqb2luKHN0YWdlZFRhcmdldCwgXCIuY29kZXhwcC1zdG9yZS5qc29uXCIpLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHtcbiAgICAgICAgICByZXBvOiBlbnRyeS5yZXBvLFxuICAgICAgICAgIGFwcHJvdmVkQ29tbWl0U2hhOiBlbnRyeS5hcHByb3ZlZENvbW1pdFNoYSxcbiAgICAgICAgICBpbnN0YWxsZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIHN0b3JlSW5kZXhVcmw6IFRXRUFLX1NUT1JFX0lOREVYX1VSTCxcbiAgICAgICAgICBmaWxlczogc3RhZ2VkRmlsZXMsXG4gICAgICAgIH0sXG4gICAgICAgIG51bGwsXG4gICAgICAgIDIsXG4gICAgICApLFxuICAgICk7XG4gICAgYXdhaXQgYXNzZXJ0U3RvcmVUd2Vha0NsZWFuRm9yQXV0b1VwZGF0ZShlbnRyeSwgdGFyZ2V0LCB3b3JrKTtcbiAgICBybVN5bmModGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG4gICAgY3BTeW5jKHN0YWdlZFRhcmdldCwgdGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBybVN5bmMod29yaywgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByZXBhcmVUd2Vha1N0b3JlU3VibWlzc2lvbihyZXBvSW5wdXQ6IHN0cmluZyk6IFByb21pc2U8VHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uPiB7XG4gIGNvbnN0IHJlcG8gPSBub3JtYWxpemVHaXRIdWJSZXBvKHJlcG9JbnB1dCk7XG4gIGNvbnN0IHJlcG9JbmZvID0gYXdhaXQgZmV0Y2hHaXRodWJKc29uPHsgZGVmYXVsdF9icmFuY2g/OiBzdHJpbmcgfT4oYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvJHtyZXBvfWApO1xuICBjb25zdCBkZWZhdWx0QnJhbmNoID0gcmVwb0luZm8uZGVmYXVsdF9icmFuY2g7XG4gIGlmICghZGVmYXVsdEJyYW5jaCkgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBkZWZhdWx0IGJyYW5jaCBmb3IgJHtyZXBvfWApO1xuXG4gIGNvbnN0IGNvbW1pdCA9IGF3YWl0IGZldGNoR2l0aHViSnNvbjx7XG4gICAgc2hhPzogc3RyaW5nO1xuICAgIGh0bWxfdXJsPzogc3RyaW5nO1xuICB9PihgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8ke3JlcG99L2NvbW1pdHMvJHtlbmNvZGVVUklDb21wb25lbnQoZGVmYXVsdEJyYW5jaCl9YCk7XG4gIGlmICghY29tbWl0LnNoYSkgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBjdXJyZW50IGNvbW1pdCBmb3IgJHtyZXBvfWApO1xuXG4gIGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZmV0Y2hNYW5pZmVzdEF0Q29tbWl0KHJlcG8sIGNvbW1pdC5zaGEpLmNhdGNoKChlKSA9PiB7XG4gICAgbG9nKFwid2FyblwiLCBgY291bGQgbm90IHJlYWQgbWFuaWZlc3QgZm9yIHN0b3JlIHN1Ym1pc3Npb24gJHtyZXBvfUAke2NvbW1pdC5zaGF9OmAsIGUpO1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgcmVwbyxcbiAgICBkZWZhdWx0QnJhbmNoLFxuICAgIGNvbW1pdFNoYTogY29tbWl0LnNoYSxcbiAgICBjb21taXRVcmw6IGNvbW1pdC5odG1sX3VybCA/PyBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb30vY29tbWl0LyR7Y29tbWl0LnNoYX1gLFxuICAgIG1hbmlmZXN0OiBtYW5pZmVzdFxuICAgICAgPyB7XG4gICAgICAgICAgaWQ6IHR5cGVvZiBtYW5pZmVzdC5pZCA9PT0gXCJzdHJpbmdcIiA/IG1hbmlmZXN0LmlkIDogdW5kZWZpbmVkLFxuICAgICAgICAgIG5hbWU6IHR5cGVvZiBtYW5pZmVzdC5uYW1lID09PSBcInN0cmluZ1wiID8gbWFuaWZlc3QubmFtZSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICB2ZXJzaW9uOiB0eXBlb2YgbWFuaWZlc3QudmVyc2lvbiA9PT0gXCJzdHJpbmdcIiA/IG1hbmlmZXN0LnZlcnNpb24gOiB1bmRlZmluZWQsXG4gICAgICAgICAgZGVzY3JpcHRpb246IHR5cGVvZiBtYW5pZmVzdC5kZXNjcmlwdGlvbiA9PT0gXCJzdHJpbmdcIiA/IG1hbmlmZXN0LmRlc2NyaXB0aW9uIDogdW5kZWZpbmVkLFxuICAgICAgICAgIGljb25Vcmw6IHR5cGVvZiBtYW5pZmVzdC5pY29uVXJsID09PSBcInN0cmluZ1wiID8gbWFuaWZlc3QuaWNvblVybCA6IHVuZGVmaW5lZCxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoR2l0aHViSnNvbjxUPih1cmw6IHN0cmluZyk6IFByb21pc2U8VD4ge1xuICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDgwMDApO1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvblwiLFxuICAgICAgICBcIlVzZXItQWdlbnRcIjogYGNvZGV4LXBsdXNwbHVzLyR7Q09ERVhfUExVU1BMVVNfVkVSU0lPTn1gLFxuICAgICAgfSxcbiAgICAgIHNpZ25hbDogY29udHJvbGxlci5zaWduYWwsXG4gICAgfSk7XG4gICAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgR2l0SHViIHJldHVybmVkICR7cmVzLnN0YXR1c31gKTtcbiAgICByZXR1cm4gYXdhaXQgcmVzLmpzb24oKSBhcyBUO1xuICB9IGZpbmFsbHkge1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaE1hbmlmZXN0QXRDb21taXQocmVwbzogc3RyaW5nLCBjb21taXRTaGE6IHN0cmluZyk6IFByb21pc2U8UGFydGlhbDxUd2Vha01hbmlmZXN0Pj4ge1xuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLyR7cmVwb30vJHtjb21taXRTaGF9L21hbmlmZXN0Lmpzb25gLCB7XG4gICAgaGVhZGVyczoge1xuICAgICAgXCJBY2NlcHRcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICBcIlVzZXItQWdlbnRcIjogYGNvZGV4LXBsdXNwbHVzLyR7Q09ERVhfUExVU1BMVVNfVkVSU0lPTn1gLFxuICAgIH0sXG4gIH0pO1xuICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBtYW5pZmVzdCBmZXRjaCByZXR1cm5lZCAke3Jlcy5zdGF0dXN9YCk7XG4gIHJldHVybiBhd2FpdCByZXMuanNvbigpIGFzIFBhcnRpYWw8VHdlYWtNYW5pZmVzdD47XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RUYXJBcmNoaXZlKGFyY2hpdmU6IHN0cmluZywgdGFyZ2V0RGlyOiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKFwidGFyXCIsIFtcIi14emZcIiwgYXJjaGl2ZSwgXCItQ1wiLCB0YXJnZXREaXJdLCB7XG4gICAgZW5jb2Rpbmc6IFwidXRmOFwiLFxuICAgIHN0ZGlvOiBbXCJpZ25vcmVcIiwgXCJwaXBlXCIsIFwicGlwZVwiXSxcbiAgfSk7XG4gIGlmIChyZXN1bHQuc3RhdHVzICE9PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGB0YXIgZXh0cmFjdGlvbiBmYWlsZWQ6ICR7cmVzdWx0LnN0ZGVyciB8fCByZXN1bHQuc3Rkb3V0IHx8IHJlc3VsdC5zdGF0dXN9YCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTdG9yZVR3ZWFrU291cmNlKGVudHJ5OiBUd2Vha1N0b3JlRW50cnksIHNvdXJjZTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IG1hbmlmZXN0UGF0aCA9IGpvaW4oc291cmNlLCBcIm1hbmlmZXN0Lmpzb25cIik7XG4gIGNvbnN0IG1hbmlmZXN0ID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMobWFuaWZlc3RQYXRoLCBcInV0ZjhcIikpIGFzIFR3ZWFrTWFuaWZlc3Q7XG4gIGlmIChtYW5pZmVzdC5pZCAhPT0gZW50cnkubWFuaWZlc3QuaWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGRvd25sb2FkZWQgdHdlYWsgaWQgJHttYW5pZmVzdC5pZH0gZG9lcyBub3QgbWF0Y2ggYXBwcm92ZWQgaWQgJHtlbnRyeS5tYW5pZmVzdC5pZH1gKTtcbiAgfVxuICBpZiAobWFuaWZlc3QuZ2l0aHViUmVwbyAhPT0gZW50cnkucmVwbykge1xuICAgIHRocm93IG5ldyBFcnJvcihgZG93bmxvYWRlZCB0d2VhayByZXBvICR7bWFuaWZlc3QuZ2l0aHViUmVwb30gZG9lcyBub3QgbWF0Y2ggYXBwcm92ZWQgcmVwbyAke2VudHJ5LnJlcG99YCk7XG4gIH1cbiAgaWYgKG1hbmlmZXN0LnZlcnNpb24gIT09IGVudHJ5Lm1hbmlmZXN0LnZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGRvd25sb2FkZWQgdHdlYWsgdmVyc2lvbiAke21hbmlmZXN0LnZlcnNpb259IGRvZXMgbm90IG1hdGNoIGFwcHJvdmVkIHZlcnNpb24gJHtlbnRyeS5tYW5pZmVzdC52ZXJzaW9ufWApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmRUd2Vha1Jvb3QoZGlyOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFleGlzdHNTeW5jKGRpcikpIHJldHVybiBudWxsO1xuICBpZiAoZXhpc3RzU3luYyhqb2luKGRpciwgXCJtYW5pZmVzdC5qc29uXCIpKSkgcmV0dXJuIGRpcjtcbiAgZm9yIChjb25zdCBuYW1lIG9mIHJlYWRkaXJTeW5jKGRpcikpIHtcbiAgICBjb25zdCBjaGlsZCA9IGpvaW4oZGlyLCBuYW1lKTtcbiAgICB0cnkge1xuICAgICAgaWYgKCFzdGF0U3luYyhjaGlsZCkuaXNEaXJlY3RvcnkoKSkgY29udGludWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgZm91bmQgPSBmaW5kVHdlYWtSb290KGNoaWxkKTtcbiAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY29weVR3ZWFrU291cmNlKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IHZvaWQge1xuICBjcFN5bmMoc291cmNlLCB0YXJnZXQsIHtcbiAgICByZWN1cnNpdmU6IHRydWUsXG4gICAgZmlsdGVyOiAoc3JjKSA9PiAhLyhefFsvXFxcXF0pKD86XFwuZ2l0fG5vZGVfbW9kdWxlcykoPzpbL1xcXFxdfCQpLy50ZXN0KHNyYyksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBhc3NlcnRTdG9yZVR3ZWFrQ2xlYW5Gb3JBdXRvVXBkYXRlKFxuICBlbnRyeTogVHdlYWtTdG9yZUVudHJ5LFxuICB0YXJnZXQ6IHN0cmluZyxcbiAgd29yazogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghZXhpc3RzU3luYyh0YXJnZXQpKSByZXR1cm47XG4gIGNvbnN0IG1ldGFkYXRhID0gcmVhZFN0b3JlSW5zdGFsbE1ldGFkYXRhKHRhcmdldCk7XG4gIGlmICghbWV0YWRhdGEpIHJldHVybjtcbiAgaWYgKG1ldGFkYXRhLnJlcG8gIT09IGVudHJ5LnJlcG8pIHtcbiAgICB0aHJvdyBuZXcgU3RvcmVUd2Vha01vZGlmaWVkRXJyb3IoZW50cnkubWFuaWZlc3QubmFtZSk7XG4gIH1cbiAgY29uc3QgY3VycmVudEZpbGVzID0gaGFzaFR3ZWFrU291cmNlKHRhcmdldCk7XG4gIGNvbnN0IGJhc2VsaW5lRmlsZXMgPSBtZXRhZGF0YS5maWxlcyA/PyBhd2FpdCBmZXRjaEJhc2VsaW5lU3RvcmVUd2Vha0hhc2hlcyhtZXRhZGF0YSwgd29yayk7XG4gIGlmICghc2FtZUZpbGVIYXNoZXMoY3VycmVudEZpbGVzLCBiYXNlbGluZUZpbGVzKSkge1xuICAgIHRocm93IG5ldyBTdG9yZVR3ZWFrTW9kaWZpZWRFcnJvcihlbnRyeS5tYW5pZmVzdC5uYW1lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVJbnN0YWxsTWV0YWRhdGEodGFyZ2V0OiBzdHJpbmcpOiBTdG9yZUluc3RhbGxNZXRhZGF0YSB8IG51bGwge1xuICBjb25zdCBtZXRhZGF0YVBhdGggPSBqb2luKHRhcmdldCwgXCIuY29kZXhwcC1zdG9yZS5qc29uXCIpO1xuICBpZiAoIWV4aXN0c1N5bmMobWV0YWRhdGFQYXRoKSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMobWV0YWRhdGFQYXRoLCBcInV0ZjhcIikpIGFzIFBhcnRpYWw8U3RvcmVJbnN0YWxsTWV0YWRhdGE+O1xuICAgIGlmICh0eXBlb2YgcGFyc2VkLnJlcG8gIT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHBhcnNlZC5hcHByb3ZlZENvbW1pdFNoYSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlcG86IHBhcnNlZC5yZXBvLFxuICAgICAgYXBwcm92ZWRDb21taXRTaGE6IHBhcnNlZC5hcHByb3ZlZENvbW1pdFNoYSxcbiAgICAgIGluc3RhbGxlZEF0OiB0eXBlb2YgcGFyc2VkLmluc3RhbGxlZEF0ID09PSBcInN0cmluZ1wiID8gcGFyc2VkLmluc3RhbGxlZEF0IDogXCJcIixcbiAgICAgIHN0b3JlSW5kZXhVcmw6IHR5cGVvZiBwYXJzZWQuc3RvcmVJbmRleFVybCA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5zdG9yZUluZGV4VXJsIDogXCJcIixcbiAgICAgIGZpbGVzOiBpc0hhc2hSZWNvcmQocGFyc2VkLmZpbGVzKSA/IHBhcnNlZC5maWxlcyA6IHVuZGVmaW5lZCxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaEJhc2VsaW5lU3RvcmVUd2Vha0hhc2hlcyhcbiAgbWV0YWRhdGE6IFN0b3JlSW5zdGFsbE1ldGFkYXRhLFxuICB3b3JrOiBzdHJpbmcsXG4pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+IHtcbiAgY29uc3QgYmFzZWxpbmVEaXIgPSBqb2luKHdvcmssIFwiYmFzZWxpbmVcIik7XG4gIGNvbnN0IGFyY2hpdmUgPSBqb2luKHdvcmssIFwiYmFzZWxpbmUudGFyLmd6XCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9jb2RlbG9hZC5naXRodWIuY29tLyR7bWV0YWRhdGEucmVwb30vdGFyLmd6LyR7bWV0YWRhdGEuYXBwcm92ZWRDb21taXRTaGF9YCwge1xuICAgIGhlYWRlcnM6IHsgXCJVc2VyLUFnZW50XCI6IGBjb2RleC1wbHVzcGx1cy8ke0NPREVYX1BMVVNQTFVTX1ZFUlNJT059YCB9LFxuICAgIHJlZGlyZWN0OiBcImZvbGxvd1wiLFxuICB9KTtcbiAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHZlcmlmeSBsb2NhbCB0d2VhayBjaGFuZ2VzIGJlZm9yZSB1cGRhdGU6ICR7cmVzLnN0YXR1c31gKTtcbiAgd3JpdGVGaWxlU3luYyhhcmNoaXZlLCBCdWZmZXIuZnJvbShhd2FpdCByZXMuYXJyYXlCdWZmZXIoKSkpO1xuICBta2RpclN5bmMoYmFzZWxpbmVEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBleHRyYWN0VGFyQXJjaGl2ZShhcmNoaXZlLCBiYXNlbGluZURpcik7XG4gIGNvbnN0IHNvdXJjZSA9IGZpbmRUd2Vha1Jvb3QoYmFzZWxpbmVEaXIpO1xuICBpZiAoIXNvdXJjZSkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IHZlcmlmeSBsb2NhbCB0d2VhayBjaGFuZ2VzIGJlZm9yZSB1cGRhdGU6IGJhc2VsaW5lIG1hbmlmZXN0IG1pc3NpbmdcIik7XG4gIHJldHVybiBoYXNoVHdlYWtTb3VyY2Uoc291cmNlKTtcbn1cblxuZnVuY3Rpb24gaGFzaFR3ZWFrU291cmNlKHJvb3Q6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgY29sbGVjdFR3ZWFrRmlsZUhhc2hlcyhyb290LCByb290LCBvdXQpO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0VHdlYWtGaWxlSGFzaGVzKHJvb3Q6IHN0cmluZywgZGlyOiBzdHJpbmcsIG91dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmMoZGlyKS5zb3J0KCkpIHtcbiAgICBpZiAobmFtZSA9PT0gXCIuZ2l0XCIgfHwgbmFtZSA9PT0gXCJub2RlX21vZHVsZXNcIiB8fCBuYW1lID09PSBcIi5jb2RleHBwLXN0b3JlLmpzb25cIikgY29udGludWU7XG4gICAgY29uc3QgZnVsbCA9IGpvaW4oZGlyLCBuYW1lKTtcbiAgICBjb25zdCByZWwgPSByZWxhdGl2ZShyb290LCBmdWxsKS5zcGxpdChcIlxcXFxcIikuam9pbihcIi9cIik7XG4gICAgY29uc3Qgc3RhdCA9IHN0YXRTeW5jKGZ1bGwpO1xuICAgIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGNvbGxlY3RUd2Vha0ZpbGVIYXNoZXMocm9vdCwgZnVsbCwgb3V0KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoIXN0YXQuaXNGaWxlKCkpIGNvbnRpbnVlO1xuICAgIG91dFtyZWxdID0gY3JlYXRlSGFzaChcInNoYTI1NlwiKS51cGRhdGUocmVhZEZpbGVTeW5jKGZ1bGwpKS5kaWdlc3QoXCJoZXhcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2FtZUZpbGVIYXNoZXMoYTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgYjogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IGJvb2xlYW4ge1xuICBjb25zdCBhayA9IE9iamVjdC5rZXlzKGEpLnNvcnQoKTtcbiAgY29uc3QgYmsgPSBPYmplY3Qua2V5cyhiKS5zb3J0KCk7XG4gIGlmIChhay5sZW5ndGggIT09IGJrLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGFrLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qga2V5ID0gYWtbaV07XG4gICAgaWYgKGtleSAhPT0gYmtbaV0gfHwgYVtrZXldICE9PSBiW2tleV0pIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNIYXNoUmVjb3JkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5ldmVyeSgodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVWZXJzaW9uKHY6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2LnRyaW0oKS5yZXBsYWNlKC9edi9pLCBcIlwiKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVZlcnNpb25zKGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcbiAgY29uc3QgYXYgPSBWRVJTSU9OX1JFLmV4ZWMoYSk7XG4gIGNvbnN0IGJ2ID0gVkVSU0lPTl9SRS5leGVjKGIpO1xuICBpZiAoIWF2IHx8ICFidikgcmV0dXJuIDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IDM7IGkrKykge1xuICAgIGNvbnN0IGRpZmYgPSBOdW1iZXIoYXZbaV0pIC0gTnVtYmVyKGJ2W2ldKTtcbiAgICBpZiAoZGlmZiAhPT0gMCkgcmV0dXJuIGRpZmY7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIGZhbGxiYWNrU291cmNlUm9vdCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBqb2luKGhvbWVkaXIoKSwgXCIuY29kZXgtcGx1c3BsdXNcIiwgXCJzb3VyY2VcIiksXG4gICAgam9pbih1c2VyUm9vdCEsIFwic291cmNlXCIpLFxuICBdO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGV4aXN0c1N5bmMoam9pbihjYW5kaWRhdGUsIFwicGFja2FnZXNcIiwgXCJpbnN0YWxsZXJcIiwgXCJkaXN0XCIsIFwiY2xpLmpzXCIpKSkgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVJbnN0YWxsYXRpb25Tb3VyY2Uoc291cmNlUm9vdDogc3RyaW5nIHwgbnVsbCk6IEluc3RhbGxhdGlvblNvdXJjZSB7XG4gIGlmICghc291cmNlUm9vdCkge1xuICAgIHJldHVybiB7XG4gICAgICBraW5kOiBcInVua25vd25cIixcbiAgICAgIGxhYmVsOiBcIlVua25vd25cIixcbiAgICAgIGRldGFpbDogXCJDb2RleCsrIHNvdXJjZSBsb2NhdGlvbiBpcyBub3QgcmVjb3JkZWQgeWV0LlwiLFxuICAgIH07XG4gIH1cbiAgY29uc3Qgbm9ybWFsaXplZCA9IHNvdXJjZVJvb3QucmVwbGFjZSgvXFxcXC9nLCBcIi9cIik7XG4gIGlmICgvXFwvKD86SG9tZWJyZXd8aG9tZWJyZXcpXFwvQ2VsbGFyXFwvY29kZXhwbHVzcGx1c1xcLy8udGVzdChub3JtYWxpemVkKSkge1xuICAgIHJldHVybiB7IGtpbmQ6IFwiaG9tZWJyZXdcIiwgbGFiZWw6IFwiSG9tZWJyZXdcIiwgZGV0YWlsOiBzb3VyY2VSb290IH07XG4gIH1cbiAgaWYgKGV4aXN0c1N5bmMoam9pbihzb3VyY2VSb290LCBcIi5naXRcIikpKSB7XG4gICAgcmV0dXJuIHsga2luZDogXCJsb2NhbC1kZXZcIiwgbGFiZWw6IFwiTG9jYWwgZGV2ZWxvcG1lbnQgY2hlY2tvdXRcIiwgZGV0YWlsOiBzb3VyY2VSb290IH07XG4gIH1cbiAgaWYgKG5vcm1hbGl6ZWQuZW5kc1dpdGgoXCIvLmNvZGV4LXBsdXNwbHVzL3NvdXJjZVwiKSB8fCBub3JtYWxpemVkLmluY2x1ZGVzKFwiLy5jb2RleC1wbHVzcGx1cy9zb3VyY2UvXCIpKSB7XG4gICAgcmV0dXJuIHsga2luZDogXCJnaXRodWItc291cmNlXCIsIGxhYmVsOiBcIkdpdEh1YiBzb3VyY2UgaW5zdGFsbGVyXCIsIGRldGFpbDogc291cmNlUm9vdCB9O1xuICB9XG4gIGlmIChleGlzdHNTeW5jKGpvaW4oc291cmNlUm9vdCwgXCJwYWNrYWdlLmpzb25cIikpKSB7XG4gICAgcmV0dXJuIHsga2luZDogXCJzb3VyY2UtYXJjaGl2ZVwiLCBsYWJlbDogXCJTb3VyY2UgYXJjaGl2ZVwiLCBkZXRhaWw6IHNvdXJjZVJvb3QgfTtcbiAgfVxuICByZXR1cm4geyBraW5kOiBcInVua25vd25cIiwgbGFiZWw6IFwiVW5rbm93blwiLCBkZXRhaWw6IHNvdXJjZVJvb3QgfTtcbn1cblxuZnVuY3Rpb24gc3RhcnRJbnN0YWxsZWRDbGkoY2xpOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKTogdm9pZCB7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSBcImRhcndpblwiICYmIHN0YXJ0SW5zdGFsbGVkQ2xpV2l0aExhdW5jaGQoY2xpLCBhcmdzKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjaGlsZCA9IHNwYXduKHByb2Nlc3MuZXhlY1BhdGgsIFtjbGksIC4uLmFyZ3NdLCB7XG4gICAgY3dkOiByZXNvbHZlKGRpcm5hbWUoY2xpKSwgXCIuLlwiLCBcIi4uXCIsIFwiLi5cIiksXG4gICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBDT0RFWF9QTFVTUExVU19NQU5VQUxfVVBEQVRFOiBcIjFcIiB9LFxuICAgIGRldGFjaGVkOiB0cnVlLFxuICAgIHN0ZGlvOiBcImlnbm9yZVwiLFxuICB9KTtcbiAgY2hpbGQudW5yZWYoKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRJbnN0YWxsZWRDbGlXaXRoTGF1bmNoZChjbGk6IHN0cmluZywgYXJnczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgY29uc3QgbGFiZWwgPSBgY29tLmNvZGV4cGx1c3BsdXMucGF0Y2gtaGVscGVyLiR7cHJvY2Vzcy5waWR9LiR7RGF0ZS5ub3coKX1gO1xuICBjb25zdCBjbGVhbnVwID0gYGxhdW5jaGN0bCByZW1vdmUgJHtsYWJlbH0gPi9kZXYvbnVsbCAyPiYxIHx8IGxhdW5jaGN0bCBib290b3V0IGd1aS8kKGlkIC11KS8ke2xhYmVsfSA+L2Rldi9udWxsIDI+JjEgfHwgdHJ1ZWA7XG4gIGNvbnN0IGNvbW1hbmQgPSBbXG4gICAgYHRyYXAgJHtzaGVsbFF1b3RlKGNsZWFudXApfSBFWElUYCxcbiAgICBgY2QgJHtzaGVsbFF1b3RlKHJlc29sdmUoZGlybmFtZShjbGkpLCBcIi4uXCIsIFwiLi5cIiwgXCIuLlwiKSl9YCxcbiAgICBgQ09ERVhfUExVU1BMVVNfTUFOVUFMX1VQREFURT0xICR7W3Byb2Nlc3MuZXhlY1BhdGgsIGNsaSwgLi4uYXJnc10ubWFwKHNoZWxsUXVvdGUpLmpvaW4oXCIgXCIpfWAsXG4gIF0uam9pbihcIiAmJiBcIik7XG4gIGNvbnN0IHJlc3VsdCA9IHNwYXduU3luYyhcbiAgICBcImxhdW5jaGN0bFwiLFxuICAgIFtcbiAgICAgIFwic3VibWl0XCIsXG4gICAgICBcIi1sXCIsXG4gICAgICBsYWJlbCxcbiAgICAgIFwiLS1cIixcbiAgICAgIFwiL2Jpbi9zaFwiLFxuICAgICAgXCItY1wiLFxuICAgICAgYCR7Y29tbWFuZH0gfHwgdHJ1ZWAsXG4gICAgXSxcbiAgICB7XG4gICAgICBlbmNvZGluZzogXCJ1dGY4XCIsXG4gICAgICBzdGRpbzogXCJpZ25vcmVcIixcbiAgICB9LFxuICApO1xuICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gMCkgcmV0dXJuIHRydWU7XG4gIGxvZyhcIndhcm5cIiwgYGxhdW5jaGN0bCBzdWJtaXQgZmFpbGVkIGZvciBDb2RleCsrIHBhdGNoIGhlbHBlcjogJHtyZXN1bHQuZXJyb3I/Lm1lc3NhZ2UgPz8gcmVzdWx0LnN0YXR1c31gKTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBzaGVsbFF1b3RlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYCcke3ZhbHVlLnJlcGxhY2UoLycvZywgYCdcXFxcJydgKX0nYDtcbn1cblxuZnVuY3Rpb24gbWFya1NlbGZVcGRhdGVTdGFydGVkKHNvdXJjZVJvb3Q6IHN0cmluZyk6IFNlbGZVcGRhdGVTdGF0ZSB7XG4gIGNvbnN0IGNvbmZpZyA9IHJlYWRTdGF0ZSgpLmNvZGV4UGx1c1BsdXM7XG4gIGNvbnN0IGNoYW5uZWwgPSBjb25maWc/LnVwZGF0ZUNoYW5uZWwgPz8gXCJzdGFibGVcIjtcbiAgY29uc3Qgc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSA9IHtcbiAgICBjaGVja2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICBzdGF0dXM6IFwiY2hlY2tpbmdcIixcbiAgICBjdXJyZW50VmVyc2lvbjogQ09ERVhfUExVU1BMVVNfVkVSU0lPTixcbiAgICBsYXRlc3RWZXJzaW9uOiBudWxsLFxuICAgIHRhcmdldFJlZjogY29uZmlnPy51cGRhdGVDaGFubmVsID09PSBcImN1c3RvbVwiID8gY29uZmlnLnVwZGF0ZVJlZiA/PyBudWxsIDogbnVsbCxcbiAgICByZWxlYXNlVXJsOiBudWxsLFxuICAgIHJlcG86IGNvbmZpZz8udXBkYXRlUmVwbyA/PyBDT0RFWF9QTFVTUExVU19SRVBPLFxuICAgIGNoYW5uZWwsXG4gICAgc291cmNlUm9vdCxcbiAgICBpbnN0YWxsYXRpb25Tb3VyY2U6IGRlc2NyaWJlSW5zdGFsbGF0aW9uU291cmNlKHNvdXJjZVJvb3QpLFxuICB9O1xuICB3cml0ZVNlbGZVcGRhdGVTdGF0ZShzdGF0ZSk7XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZnVuY3Rpb24gYnJvYWRjYXN0UmVsb2FkKCk6IHZvaWQge1xuICBjb25zdCBwYXlsb2FkID0ge1xuICAgIGF0OiBEYXRlLm5vdygpLFxuICAgIHR3ZWFrczogdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkLm1hcCgodCkgPT4gdC5tYW5pZmVzdC5pZCksXG4gIH07XG4gIGZvciAoY29uc3Qgd2Mgb2Ygd2ViQ29udGVudHMuZ2V0QWxsV2ViQ29udGVudHMoKSkge1xuICAgIHRyeSB7XG4gICAgICB3Yy5zZW5kKFwiY29kZXhwcDp0d2Vha3MtY2hhbmdlZFwiLCBwYXlsb2FkKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2coXCJ3YXJuXCIsIFwiYnJvYWRjYXN0IHNlbmQgZmFpbGVkOlwiLCBlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZUxvZ2dlcihzY29wZTogc3RyaW5nKSB7XG4gIHJldHVybiB7XG4gICAgZGVidWc6ICguLi5hOiB1bmtub3duW10pID0+IGxvZyhcImluZm9cIiwgYFske3Njb3BlfV1gLCAuLi5hKSxcbiAgICBpbmZvOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJpbmZvXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXG4gICAgd2FybjogKC4uLmE6IHVua25vd25bXSkgPT4gbG9nKFwid2FyblwiLCBgWyR7c2NvcGV9XWAsIC4uLmEpLFxuICAgIGVycm9yOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJlcnJvclwiLCBgWyR7c2NvcGV9XWAsIC4uLmEpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBtYWtlTWFpbklwYyhpZDogc3RyaW5nKSB7XG4gIGNvbnN0IGNoID0gKGM6IHN0cmluZykgPT4gYGNvZGV4cHA6JHtpZH06JHtjfWA7XG4gIHJldHVybiB7XG4gICAgb246IChjOiBzdHJpbmcsIGg6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpID0+IHtcbiAgICAgIGNvbnN0IHdyYXBwZWQgPSAoX2U6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gaCguLi5hcmdzKTtcbiAgICAgIGlwY01haW4ub24oY2goYyksIHdyYXBwZWQpO1xuICAgICAgcmV0dXJuICgpID0+IGlwY01haW4ucmVtb3ZlTGlzdGVuZXIoY2goYyksIHdyYXBwZWQgYXMgbmV2ZXIpO1xuICAgIH0sXG4gICAgc2VuZDogKF9jOiBzdHJpbmcpID0+IHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcImlwYy5zZW5kIGlzIHJlbmRlcmVyXHUyMTkybWFpbjsgbWFpbiBzaWRlIHVzZXMgaGFuZGxlL29uXCIpO1xuICAgIH0sXG4gICAgaW52b2tlOiAoX2M6IHN0cmluZykgPT4ge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaXBjLmludm9rZSBpcyByZW5kZXJlclx1MjE5Mm1haW47IG1haW4gc2lkZSB1c2VzIGhhbmRsZVwiKTtcbiAgICB9LFxuICAgIGhhbmRsZTogKGM6IHN0cmluZywgaGFuZGxlcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdW5rbm93bikgPT4ge1xuICAgICAgaXBjTWFpbi5oYW5kbGUoY2goYyksIChfZTogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiBoYW5kbGVyKC4uLmFyZ3MpKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBtYWtlTWFpbkZzKGlkOiBzdHJpbmcpIHtcbiAgY29uc3QgZGlyID0gam9pbih1c2VyUm9vdCEsIFwidHdlYWstZGF0YVwiLCBpZCk7XG4gIG1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoXCJub2RlOmZzL3Byb21pc2VzXCIpIGFzIHR5cGVvZiBpbXBvcnQoXCJub2RlOmZzL3Byb21pc2VzXCIpO1xuICByZXR1cm4ge1xuICAgIGRhdGFEaXI6IGRpcixcbiAgICByZWFkOiAocDogc3RyaW5nKSA9PiBmcy5yZWFkRmlsZShqb2luKGRpciwgcCksIFwidXRmOFwiKSxcbiAgICB3cml0ZTogKHA6IHN0cmluZywgYzogc3RyaW5nKSA9PiBmcy53cml0ZUZpbGUoam9pbihkaXIsIHApLCBjLCBcInV0ZjhcIiksXG4gICAgZXhpc3RzOiBhc3luYyAocDogc3RyaW5nKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBmcy5hY2Nlc3Moam9pbihkaXIsIHApKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRSdW50aW1lSW5mbygpOiBDb2RleFJ1bnRpbWVJbmZvIHtcbiAgY29uc3QgaW5zdGFsbGVyU3RhdGUgPSByZWFkSW5zdGFsbGVyU3RhdGUoKTtcbiAgcmV0dXJuIGdldFJ1bnRpbWVJbmZvKHtcbiAgICB1c2VyUm9vdDogdXNlclJvb3QhLFxuICAgIHJ1bnRpbWVEaXI6IHJ1bnRpbWVEaXIhLFxuICAgIGNvZGV4VmVyc2lvbjogaW5zdGFsbGVyU3RhdGU/LmNvZGV4VmVyc2lvbiA/PyBudWxsLFxuICAgIGNoYW5uZWw6IG51bGwsXG4gICAgZ2V0V2luZG93U2VydmljZXM6IGdldENvZGV4V2luZG93U2VydmljZXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjdXJyZW50UnVudGltZUNhcGFiaWxpdGllcygpOiBDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXMge1xuICBjb25zdCBpbnN0YWxsZXJTdGF0ZSA9IHJlYWRJbnN0YWxsZXJTdGF0ZSgpO1xuICByZXR1cm4gZ2V0UnVudGltZUNhcGFiaWxpdGllcyh7XG4gICAgdXNlclJvb3Q6IHVzZXJSb290ISxcbiAgICBydW50aW1lRGlyOiBydW50aW1lRGlyISxcbiAgICBjb2RleFZlcnNpb246IGluc3RhbGxlclN0YXRlPy5jb2RleFZlcnNpb24gPz8gbnVsbCxcbiAgICBjaGFubmVsOiBudWxsLFxuICAgIGdldFdpbmRvd1NlcnZpY2VzOiBnZXRDb2RleFdpbmRvd1NlcnZpY2VzLFxuICAgIGdldE5hdGl2ZUNhcGFiaWxpdGllczogKCkgPT4gbmF0aXZlQnJpZGdlLmdldENhcGFiaWxpdGllcygpLFxuICAgIGdldFZpZXdDYXBhYmlsaXRpZXM6ICgpID0+IGdldE93bFZpZXdDYXBhYmlsaXRpZXMoKSxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrQ29udGV4dCh0d2Vha0lkOiBzdHJpbmcsIHBlcm1pc3Npb24/OiBUd2Vha1Blcm1pc3Npb24pOiBOYXRpdmVUd2Vha0NvbnRleHQge1xuICBjb25zdCB0d2VhayA9IHBlcm1pc3Npb25cbiAgICA/IGFzc2VydFR3ZWFrUGVybWlzc2lvbkZvcklkKHR3ZWFrSWQsIHBlcm1pc3Npb24pXG4gICAgOiB0d2Vha0J5SWQodHdlYWtJZCk7XG4gIHJldHVybiB7IGlkOiB0d2Vhay5tYW5pZmVzdC5pZCwgZGlyOiB0d2Vhay5kaXIgfTtcbn1cblxuZnVuY3Rpb24gdHdlYWtCeUlkKHR3ZWFrSWQ6IHN0cmluZyk6IERpc2NvdmVyZWRUd2VhayB7XG4gIGFzc2VydFR3ZWFrSWQodHdlYWtJZCk7XG4gIGNvbnN0IHR3ZWFrID0gdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubWFuaWZlc3QuaWQgPT09IHR3ZWFrSWQpO1xuICBpZiAoIXR3ZWFrKSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gdHdlYWs6ICR7dHdlYWtJZH1gKTtcbiAgaWYgKCFpc1R3ZWFrRW5hYmxlZCh0d2Vha0lkKSkgdGhyb3cgbmV3IEVycm9yKGB0d2VhayBpcyBkaXNhYmxlZDogJHt0d2Vha0lkfWApO1xuICByZXR1cm4gdHdlYWs7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFR3ZWFrUGVybWlzc2lvbkZvcklkKHR3ZWFrSWQ6IHN0cmluZywgcGVybWlzc2lvbjogVHdlYWtQZXJtaXNzaW9uKTogRGlzY292ZXJlZFR3ZWFrIHtcbiAgY29uc3QgdHdlYWsgPSB0d2Vha0J5SWQodHdlYWtJZCk7XG4gIGFzc2VydFR3ZWFrUGVybWlzc2lvbih0d2VhaywgcGVybWlzc2lvbik7XG4gIHJldHVybiB0d2Vhaztcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VHdlYWtWaWV3UGVybWlzc2lvbkZvcklkKHR3ZWFrSWQ6IHN0cmluZyk6IERpc2NvdmVyZWRUd2VhayB7XG4gIGNvbnN0IHR3ZWFrID0gdHdlYWtCeUlkKHR3ZWFrSWQpO1xuICBhc3NlcnRUd2Vha1ZpZXdQZXJtaXNzaW9uKHR3ZWFrKTtcbiAgcmV0dXJuIHR3ZWFrO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRUd2Vha1Blcm1pc3Npb24odHdlYWs6IERpc2NvdmVyZWRUd2VhaywgcGVybWlzc2lvbjogVHdlYWtQZXJtaXNzaW9uKTogdm9pZCB7XG4gIGlmICh0d2Vhay5tYW5pZmVzdC5wZXJtaXNzaW9ucz8uaW5jbHVkZXMocGVybWlzc2lvbikpIHJldHVybjtcbiAgdGhyb3cgbmV3IEVycm9yKGB0d2VhayAke3R3ZWFrLm1hbmlmZXN0LmlkfSBtdXN0IGRlY2xhcmUgJHtwZXJtaXNzaW9ufSBwZXJtaXNzaW9uYCk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFR3ZWFrVmlld1Blcm1pc3Npb24odHdlYWs6IERpc2NvdmVyZWRUd2Vhayk6IHZvaWQge1xuICBpZiAoXG4gICAgdHdlYWsubWFuaWZlc3QucGVybWlzc2lvbnM/LmluY2x1ZGVzKFwiY29kZXgtdmlld3NcIikgfHxcbiAgICB0d2Vhay5tYW5pZmVzdC5wZXJtaXNzaW9ucz8uaW5jbHVkZXMoXCJjb2RleC52aWV3c1wiKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKGB0d2VhayAke3R3ZWFrLm1hbmlmZXN0LmlkfSBtdXN0IGRlY2xhcmUgY29kZXgtdmlld3MgcGVybWlzc2lvbmApO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRUd2Vha0lkKHR3ZWFrSWQ6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIS9eW2EtekEtWjAtOS5fLV0rJC8udGVzdCh0d2Vha0lkKSkgdGhyb3cgbmV3IEVycm9yKFwiYmFkIHR3ZWFrIGlkXCIpO1xufVxuXG5mdW5jdGlvbiBnZXRQcmltYXJ5Q29kZXhXaW5kb3coKTogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IG51bGwge1xuICBjb25zdCBzZXJ2aWNlcyA9IGdldENvZGV4V2luZG93U2VydmljZXMoKTtcbiAgY29uc3QgZnJvbVNlcnZpY2VzID0gdHlwZW9mIHNlcnZpY2VzPy5nZXRQcmltYXJ5V2luZG93ID09PSBcImZ1bmN0aW9uXCJcbiAgICA/IHNlcnZpY2VzLmdldFByaW1hcnlXaW5kb3coXCJsb2NhbFwiKVxuICAgIDogbnVsbDtcbiAgaWYgKGZyb21TZXJ2aWNlcyAmJiAhZnJvbVNlcnZpY2VzLmlzRGVzdHJveWVkKCkpIHJldHVybiBmcm9tU2VydmljZXM7XG4gIGNvbnN0IGZyb21NYW5hZ2VyID0gdHlwZW9mIHNlcnZpY2VzPy53aW5kb3dNYW5hZ2VyPy5nZXRQcmltYXJ5V2luZG93ID09PSBcImZ1bmN0aW9uXCJcbiAgICA/IHNlcnZpY2VzLndpbmRvd01hbmFnZXIuZ2V0UHJpbWFyeVdpbmRvdy5jYWxsKHNlcnZpY2VzLndpbmRvd01hbmFnZXIpXG4gICAgOiBudWxsO1xuICBpZiAoZnJvbU1hbmFnZXIgJiYgIWZyb21NYW5hZ2VyLmlzRGVzdHJveWVkKCkpIHJldHVybiBmcm9tTWFuYWdlcjtcbiAgY29uc3QgZm9jdXNlZCA9IEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpO1xuICBpZiAoZm9jdXNlZCAmJiAhZm9jdXNlZC5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZm9jdXNlZDtcbiAgcmV0dXJuIEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmZpbmQoKHdpbikgPT4gIXdpbi5pc0Rlc3Ryb3llZCgpKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRQcmltYXJ5Q29kZXhXaW5kb3dSZWYoKTogQ29kZXhXaW5kb3dSZWYgfCBudWxsIHtcbiAgY29uc3Qgd2luID0gZ2V0UHJpbWFyeUNvZGV4V2luZG93KCk7XG4gIGlmICghd2luIHx8IHdpbi5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHsgd2luZG93SWQ6IHdpbi5pZCwgd2ViQ29udGVudHNJZDogd2luLndlYkNvbnRlbnRzLmlkIH07XG59XG5cbmZ1bmN0aW9uIGZvY3VzQ29kZXhXaW5kb3cod2luZG93SWQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCB3aW4gPSBCcm93c2VyV2luZG93LmZyb21JZCh3aW5kb3dJZCk7XG4gIGlmICghd2luIHx8IHdpbi5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gIGlmICh3aW4uaXNNaW5pbWl6ZWQoKSkgd2luLnJlc3RvcmUoKTtcbiAgd2luLnNob3coKTtcbiAgd2luLmZvY3VzKCk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBzaG93Q29kZXhXaW5kb3cod2luZG93SWQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCB3aW4gPSBCcm93c2VyV2luZG93LmZyb21JZCh3aW5kb3dJZCk7XG4gIGlmICghd2luIHx8IHdpbi5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gIHdpbi5zaG93KCk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBnZXRPd2xWaWV3Q2FwYWJpbGl0aWVzKCk6IENvZGV4UnVudGltZUNhcGFiaWxpdGllc1tcInZpZXdzXCJdIHtcbiAgY29uc3QgcGFyZW50ID0gZ2V0UHJpbWFyeUNvZGV4V2luZG93KCkgPz8gQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG4gIGNvbnN0IGNvbnRlbnRWaWV3ID0gYXNSZWNvcmQocGFyZW50KT8uY29udGVudFZpZXc7XG4gIGxldCBzYW1wbGVWaWV3OiBFbGVjdHJvbi5Ccm93c2VyVmlldyB8IG51bGwgPSBudWxsO1xuICB0cnkge1xuICAgIHNhbXBsZVZpZXcgPSBuZXcgQnJvd3NlclZpZXcoeyB3ZWJQcmVmZXJlbmNlczogeyBzYW5kYm94OiB0cnVlIH0gfSk7XG4gIH0gY2F0Y2gge31cbiAgY29uc3Qgd2ViQ29udGVudHNWaWV3ID0gYXNSZWNvcmQoc2FtcGxlVmlldyk/LndlYkNvbnRlbnRzVmlldztcbiAgY29uc3QgcHJpdmF0ZVZpZXdUcmVlID0gdHlwZW9mIGFzUmVjb3JkKGNvbnRlbnRWaWV3KT8uYWRkQ2hpbGRWaWV3ID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICB0eXBlb2YgYXNSZWNvcmQoY29udGVudFZpZXcpPy5yZW1vdmVDaGlsZFZpZXcgPT09IFwiZnVuY3Rpb25cIjtcbiAgY29uc3Qgd2ViQ29udGVudHNWaWV3QXZhaWxhYmxlID0gQm9vbGVhbih3ZWJDb250ZW50c1ZpZXcpICYmXG4gICAgdHlwZW9mIGFzUmVjb3JkKHdlYkNvbnRlbnRzVmlldyk/LnNldEJvdW5kcyA9PT0gXCJmdW5jdGlvblwiO1xuICBjb25zdCBwcml2YXRlQXR0YWNoID0gcHJpdmF0ZVZpZXdUcmVlICYmIHdlYkNvbnRlbnRzVmlld0F2YWlsYWJsZTtcbiAgY29uc3QgYnJvd3NlclZpZXdGYWxsYmFjayA9IHR5cGVvZiBhc1JlY29yZChwYXJlbnQpPy5hZGRCcm93c2VyVmlldyA9PT0gXCJmdW5jdGlvblwiO1xuICB0cnkge1xuICAgIGlmIChzYW1wbGVWaWV3ICYmICFzYW1wbGVWaWV3LndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkpIHtcbiAgICAgIHNhbXBsZVZpZXcud2ViQ29udGVudHMuY2xvc2UoeyB3YWl0Rm9yQmVmb3JlVW5sb2FkOiBmYWxzZSB9KTtcbiAgICB9XG4gIH0gY2F0Y2gge31cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IHByaXZhdGVBdHRhY2ggfHwgYnJvd3NlclZpZXdGYWxsYmFjayxcbiAgICBwcml2YXRlVmlld1RyZWU6IHByaXZhdGVBdHRhY2gsXG4gICAgd2ViQ29udGVudHNWaWV3OiB3ZWJDb250ZW50c1ZpZXdBdmFpbGFibGUsXG4gICAgYnJvd3NlclZpZXdGYWxsYmFjayxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlT3dsVmlldyhcbiAgY3R4OiBOYXRpdmVUd2Vha0NvbnRleHQsXG4gIG9wdHM6IENvZGV4Vmlld0NyZWF0ZU9wdGlvbnMsXG4pOiBQcm9taXNlPENvZGV4Vmlld1JlZj4ge1xuICBjb25zdCBpZCA9IGFzc2VydEJyaWRnZUlkKG9wdHMuaWQgPz8gcmFuZG9tVVVJRCgpLCBcIkNvZGV4IHZpZXcgaWRcIik7XG4gIGNvbnN0IGtleSA9IG93bFZpZXdLZXkoY3R4LmlkLCBpZCk7XG4gIGlmIChvd2xWaWV3cy5oYXMoa2V5KSkgdGhyb3cgbmV3IEVycm9yKGBDb2RleCB2aWV3IGFscmVhZHkgZXhpc3RzOiAke2N0eC5pZH06JHtpZH1gKTtcblxuICBjb25zdCBwYXJlbnQgPSB0eXBlb2Ygb3B0cy5wYXJlbnRXaW5kb3dJZCA9PT0gXCJudW1iZXJcIlxuICAgID8gQnJvd3NlcldpbmRvdy5mcm9tSWQob3B0cy5wYXJlbnRXaW5kb3dJZClcbiAgICA6IGdldFByaW1hcnlDb2RleFdpbmRvdygpO1xuICBpZiAoIXBhcmVudCB8fCBpc1dpbmRvd0Rlc3Ryb3llZChwYXJlbnQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ29kZXggdmlldyBuZWVkcyBhbiBhY3RpdmUgcGFyZW50IHdpbmRvd1wiKTtcbiAgfVxuXG4gIGNvbnN0IHNlcnZpY2VzID0gZ2V0Q29kZXhXaW5kb3dTZXJ2aWNlcygpO1xuICBjb25zdCB3aW5kb3dNYW5hZ2VyID0gc2VydmljZXM/LndpbmRvd01hbmFnZXI7XG4gIGNvbnN0IHJvdXRlID0gb3B0cy5yb3V0ZSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IG5vcm1hbGl6ZUNvZGV4Um91dGUob3B0cy5yb3V0ZSk7XG4gIGNvbnN0IGhvc3RJZCA9IG9wdHMuaG9zdElkIHx8IFwibG9jYWxcIjtcbiAgY29uc3QgdmlldyA9IG5ldyBCcm93c2VyVmlldyh7XG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIHByZWxvYWQ6IG9wdHMucmVnaXN0ZXJXaXRoQ29kZXggPT09IGZhbHNlID8gdW5kZWZpbmVkIDogd2luZG93TWFuYWdlcj8ub3B0aW9ucz8ucHJlbG9hZFBhdGgsXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcbiAgICAgIHNwZWxsY2hlY2s6IGZhbHNlLFxuICAgICAgZGV2VG9vbHM6IHdpbmRvd01hbmFnZXI/Lm9wdGlvbnM/LmFsbG93RGV2dG9vbHMsXG4gICAgfSxcbiAgfSk7XG5cbiAgaWYgKG9wdHMuYmFja2dyb3VuZENvbG9yKSB7XG4gICAgY2FsbE9iamVjdE1ldGhvZCh2aWV3LCBcInNldEJhY2tncm91bmRDb2xvclwiLCBbb3B0cy5iYWNrZ3JvdW5kQ29sb3JdKTtcbiAgICBjYWxsT2JqZWN0TWV0aG9kKGFzUmVjb3JkKHZpZXcpPy53ZWJDb250ZW50c1ZpZXcsIFwic2V0QmFja2dyb3VuZENvbG9yXCIsIFtvcHRzLmJhY2tncm91bmRDb2xvcl0pO1xuICB9XG5cbiAgY29uc3QgbWFuYWdlZDogTWFuYWdlZE93bFZpZXcgPSB7XG4gICAga2V5LFxuICAgIHR3ZWFrSWQ6IGN0eC5pZCxcbiAgICBpZCxcbiAgICB2aWV3LFxuICAgIHBhcmVudFdpbmRvd0lkOiB3aW5kb3dJZEZvcihwYXJlbnQpLFxuICAgIGF0dGFjaE1vZGU6IG51bGwsXG4gICAgZGlzcG9zZUJpbmRpbmdzOiBbXSxcbiAgICBkaXNwb3NlZDogZmFsc2UsXG4gIH07XG4gIG93bFZpZXdzLnNldChrZXksIG1hbmFnZWQpO1xuXG4gIHRyeSB7XG4gICAgaWYgKHJvdXRlICE9PSBudWxsICYmIG9wdHMucmVnaXN0ZXJXaXRoQ29kZXggIT09IGZhbHNlICYmIHdpbmRvd01hbmFnZXI/LnJlZ2lzdGVyV2luZG93KSB7XG4gICAgICBjb25zdCBhcHBlYXJhbmNlID0gb3B0cy5hcHBlYXJhbmNlIHx8IFwic2Vjb25kYXJ5XCI7XG4gICAgICBjb25zdCB3aW5kb3dMaWtlID0gbWFrZVdpbmRvd0xpa2VGb3JWaWV3KHZpZXcpO1xuICAgICAgd2luZG93TWFuYWdlci5yZWdpc3RlcldpbmRvdyh3aW5kb3dMaWtlLCBob3N0SWQsIGZhbHNlLCBhcHBlYXJhbmNlKTtcbiAgICAgIHNlcnZpY2VzPy5nZXRDb250ZXh0Py4oaG9zdElkKT8ucmVnaXN0ZXJXaW5kb3c/Lih3aW5kb3dMaWtlKTtcbiAgICB9XG5cbiAgICBhdHRhY2hPd2xWaWV3KG1hbmFnZWQsIHBhcmVudCk7XG4gICAgaWYgKG9wdHMuYm91bmRzKSBzZXRPd2xWaWV3Qm91bmRzKG1hbmFnZWQsIG9wdHMuYm91bmRzKTtcbiAgICBpZiAob3B0cy52aXNpYmxlID09PSBmYWxzZSkgc2V0T3dsVmlld1Zpc2libGUobWFuYWdlZCwgZmFsc2UpO1xuXG4gICAgaWYgKHJvdXRlICE9PSBudWxsKSB7XG4gICAgICBhd2FpdCB2aWV3LndlYkNvbnRlbnRzLmxvYWRVUkwoY29kZXhBcHBVcmwocm91dGUsIGhvc3RJZCkpO1xuICAgIH0gZWxzZSBpZiAob3B0cy51cmwpIHtcbiAgICAgIGF3YWl0IHZpZXcud2ViQ29udGVudHMubG9hZFVSTChub3JtYWxpemVPd2xWaWV3VXJsKG9wdHMudXJsKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHZpZXcud2ViQ29udGVudHMubG9hZFVSTChcImFib3V0OmJsYW5rXCIpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIGRpc3Bvc2VPd2xWaWV3KG1hbmFnZWQpO1xuICAgIHRocm93IGU7XG4gIH1cblxuICBsb2coXCJpbmZvXCIsIGBjcmVhdGVkIE93bCB2aWV3ICR7Y3R4LmlkfToke2lkfWAsIHtcbiAgICBwYXJlbnRXaW5kb3dJZDogbWFuYWdlZC5wYXJlbnRXaW5kb3dJZCxcbiAgICB3ZWJDb250ZW50c0lkOiB2aWV3LndlYkNvbnRlbnRzLmlkLFxuICAgIGF0dGFjaE1vZGU6IG1hbmFnZWQuYXR0YWNoTW9kZSxcbiAgfSk7XG4gIHJldHVybiBvd2xWaWV3UmVmKG1hbmFnZWQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjYWxsT3dsVmlldyhcbiAgdHdlYWtJZDogc3RyaW5nLFxuICBpZDogc3RyaW5nLFxuICBtZXRob2Q6IHN0cmluZyxcbiAgYXJnPzogdW5rbm93bixcbiAgYXJnMj86IHVua25vd24sXG4pOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3QgdmlldyA9IG93bFZpZXdGb3IodHdlYWtJZCwgaWQpO1xuICBpZiAobWV0aG9kID09PSBcInNldEJvdW5kc1wiKSByZXR1cm4gc2V0T3dsVmlld0JvdW5kcyh2aWV3LCBhcmcgYXMgRWxlY3Ryb24uUmVjdGFuZ2xlKTtcbiAgaWYgKG1ldGhvZCA9PT0gXCJzZXRWaXNpYmxlXCIpIHJldHVybiBzZXRPd2xWaWV3VmlzaWJsZSh2aWV3LCBCb29sZWFuKGFyZykpO1xuICBpZiAobWV0aG9kID09PSBcImJyaW5nVG9Gcm9udFwiKSByZXR1cm4gYnJpbmdPd2xWaWV3VG9Gcm9udCh2aWV3KTtcbiAgaWYgKG1ldGhvZCA9PT0gXCJsb2FkUm91dGVcIikge1xuICAgIGNvbnN0IHJvdXRlID0gbm9ybWFsaXplQ29kZXhSb3V0ZShTdHJpbmcoYXJnKSk7XG4gICAgY29uc3QgaG9zdElkID0gdHlwZW9mIGFyZzIgPT09IFwic3RyaW5nXCIgJiYgYXJnMiA/IGFyZzIgOiBcImxvY2FsXCI7XG4gICAgcmV0dXJuIHZpZXcudmlldy53ZWJDb250ZW50cy5sb2FkVVJMKGNvZGV4QXBwVXJsKHJvdXRlLCBob3N0SWQpKTtcbiAgfVxuICBpZiAobWV0aG9kID09PSBcImxvYWRVcmxcIikgcmV0dXJuIHZpZXcudmlldy53ZWJDb250ZW50cy5sb2FkVVJMKG5vcm1hbGl6ZU93bFZpZXdVcmwoU3RyaW5nKGFyZykpKTtcbiAgaWYgKG1ldGhvZCA9PT0gXCJkaXNwb3NlXCIpIHJldHVybiBkaXNwb3NlT3dsVmlld0J5SWQodHdlYWtJZCwgaWQpO1xuICB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gQ29kZXggdmlldyBtZXRob2Q6ICR7bWV0aG9kfWApO1xufVxuXG5mdW5jdGlvbiBvd2xWaWV3UmVmKHZpZXc6IE1hbmFnZWRPd2xWaWV3KTogQ29kZXhWaWV3UmVmIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmlldy5pZCxcbiAgICB3ZWJDb250ZW50c0lkOiB2aWV3LnZpZXcud2ViQ29udGVudHMuaWQsXG4gICAgcGFyZW50V2luZG93SWQ6IHZpZXcucGFyZW50V2luZG93SWQsXG4gICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PiBQcm9taXNlLnJlc29sdmUoc2V0T3dsVmlld0JvdW5kcyh2aWV3LCBib3VuZHMpKSxcbiAgICBzZXRWaXNpYmxlOiAodmlzaWJsZSkgPT4gUHJvbWlzZS5yZXNvbHZlKHNldE93bFZpZXdWaXNpYmxlKHZpZXcsIHZpc2libGUpKSxcbiAgICBicmluZ1RvRnJvbnQ6ICgpID0+IFByb21pc2UucmVzb2x2ZShicmluZ093bFZpZXdUb0Zyb250KHZpZXcpKSxcbiAgICBsb2FkUm91dGU6IChyb3V0ZSwgaG9zdElkKSA9PiB2aWV3LnZpZXcud2ViQ29udGVudHMubG9hZFVSTChjb2RleEFwcFVybChub3JtYWxpemVDb2RleFJvdXRlKHJvdXRlKSwgaG9zdElkIHx8IFwibG9jYWxcIikpLnRoZW4oKCkgPT4ge30pLFxuICAgIGxvYWRVcmw6ICh1cmwpID0+IHZpZXcudmlldy53ZWJDb250ZW50cy5sb2FkVVJMKG5vcm1hbGl6ZU93bFZpZXdVcmwodXJsKSkudGhlbigoKSA9PiB7fSksXG4gICAgZGlzcG9zZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGRpc3Bvc2VPd2xWaWV3QnlJZCh2aWV3LnR3ZWFrSWQsIHZpZXcuaWQpKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gYXR0YWNoT3dsVmlldyh2aWV3OiBNYW5hZ2VkT3dsVmlldywgcGFyZW50OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93KTogdm9pZCB7XG4gIGNvbnN0IGNvbnRlbnRWaWV3ID0gYXNSZWNvcmQocGFyZW50KT8uY29udGVudFZpZXc7XG4gIGNvbnN0IHdlYkNvbnRlbnRzVmlldyA9IGFzUmVjb3JkKHZpZXcudmlldyk/LndlYkNvbnRlbnRzVmlldztcbiAgaWYgKHR5cGVvZiBhc1JlY29yZChwYXJlbnQpPy5hZGRCcm93c2VyVmlldyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgY2FsbE9iamVjdE1ldGhvZChwYXJlbnQsIFwiYWRkQnJvd3NlclZpZXdcIiwgW3ZpZXcudmlld10pO1xuICAgIHZpZXcuYXR0YWNoTW9kZSA9IFwiYnJvd3NlclZpZXdcIjtcbiAgfSBlbHNlIGlmIChcbiAgICB0eXBlb2YgYXNSZWNvcmQoY29udGVudFZpZXcpPy5hZGRDaGlsZFZpZXcgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgIHdlYkNvbnRlbnRzVmlld1xuICApIHtcbiAgICB0cnkge1xuICAgICAgYWRkT3dsQ2hpbGRWaWV3KHBhcmVudCwgdmlldy52aWV3KTtcbiAgICAgIHZpZXcuYXR0YWNoTW9kZSA9IFwiY29udGVudFZpZXdcIjtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2coXCJ3YXJuXCIsIFwiT3dsIGNvbnRlbnRWaWV3IGF0dGFjaG1lbnQgZmFpbGVkOyBmYWxsaW5nIGJhY2sgdG8gQnJvd3NlclZpZXdcIiwge1xuICAgICAgICB0d2Vha0lkOiB2aWV3LnR3ZWFrSWQsXG4gICAgICAgIHZpZXdJZDogdmlldy5pZCxcbiAgICAgICAgZXJyb3I6IFN0cmluZyhlKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBpZiAoIXZpZXcuYXR0YWNoTW9kZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk93bCB2aWV3IGF0dGFjaG1lbnQgaXMgbm90IGF2YWlsYWJsZSBvbiB0aGlzIENvZGV4IHdpbmRvd1wiKTtcbiAgfVxuXG4gIGNvbnN0IGRpc3Bvc2UgPSAoKSA9PiBkaXNwb3NlT3dsVmlld0J5SWQodmlldy50d2Vha0lkLCB2aWV3LmlkKTtcbiAgYmluZFdpbmRvd0V2ZW50KHBhcmVudCwgdmlldywgXCJjbG9zZWRcIiwgZGlzcG9zZSk7XG4gIGJpbmRXaW5kb3dFdmVudChwYXJlbnQsIHZpZXcsIFwiY2xvc2VcIiwgZGlzcG9zZSk7XG59XG5cbmZ1bmN0aW9uIGJyaW5nT3dsVmlld1RvRnJvbnQodmlldzogTWFuYWdlZE93bFZpZXcpOiB2b2lkIHtcbiAgaWYgKHZpZXcuZGlzcG9zZWQpIHJldHVybjtcbiAgY29uc3QgcGFyZW50ID0gdmlldy5wYXJlbnRXaW5kb3dJZCA9PT0gbnVsbCA/IG51bGwgOiBCcm93c2VyV2luZG93LmZyb21JZCh2aWV3LnBhcmVudFdpbmRvd0lkKTtcbiAgaWYgKCFwYXJlbnQgfHwgaXNXaW5kb3dEZXN0cm95ZWQocGFyZW50KSkgcmV0dXJuO1xuICBjb25zdCBjb250ZW50VmlldyA9IGFzUmVjb3JkKHBhcmVudCk/LmNvbnRlbnRWaWV3O1xuICBjb25zdCB3ZWJDb250ZW50c1ZpZXcgPSBhc1JlY29yZCh2aWV3LnZpZXcpPy53ZWJDb250ZW50c1ZpZXc7XG4gIGlmICh2aWV3LmF0dGFjaE1vZGUgPT09IFwiY29udGVudFZpZXdcIiAmJiB3ZWJDb250ZW50c1ZpZXcpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHR5cGVvZiBhc1JlY29yZChwYXJlbnQpPy5zZXRUb3BCcm93c2VyVmlldyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGNhbGxPYmplY3RNZXRob2QocGFyZW50LCBcInNldFRvcEJyb3dzZXJWaWV3XCIsIFt2aWV3LnZpZXddKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhbGxPYmplY3RNZXRob2QoY29udGVudFZpZXcsIFwiYWRkQ2hpbGRWaWV3XCIsIFt3ZWJDb250ZW50c1ZpZXddKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2coXCJ3YXJuXCIsIFwiT3dsIGNvbnRlbnRWaWV3IGJyaW5nLXRvLWZyb250IGZhaWxlZFwiLCB7XG4gICAgICAgIHR3ZWFrSWQ6IHZpZXcudHdlYWtJZCxcbiAgICAgICAgdmlld0lkOiB2aWV3LmlkLFxuICAgICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgYXNSZWNvcmQocGFyZW50KT8uc2V0VG9wQnJvd3NlclZpZXcgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGNhbGxPYmplY3RNZXRob2QocGFyZW50LCBcInNldFRvcEJyb3dzZXJWaWV3XCIsIFt2aWV3LnZpZXddKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRPd2xWaWV3Qm91bmRzKHZpZXc6IE1hbmFnZWRPd2xWaWV3LCBib3VuZHM6IEVsZWN0cm9uLlJlY3RhbmdsZSk6IHZvaWQge1xuICBhc3NlcnRCb3VuZHMoYm91bmRzKTtcbiAgY2FsbE9iamVjdE1ldGhvZCh2aWV3LnZpZXcsIFwic2V0Qm91bmRzXCIsIFtib3VuZHNdKTtcbiAgY2FsbE9iamVjdE1ldGhvZChhc1JlY29yZCh2aWV3LnZpZXcpPy53ZWJDb250ZW50c1ZpZXcsIFwic2V0Qm91bmRzXCIsIFtib3VuZHNdKTtcbn1cblxuZnVuY3Rpb24gc2V0T3dsVmlld1Zpc2libGUodmlldzogTWFuYWdlZE93bFZpZXcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgY2FsbE9iamVjdE1ldGhvZChhc1JlY29yZCh2aWV3LnZpZXcpPy53ZWJDb250ZW50c1ZpZXcsIFwic2V0VmlzaWJsZVwiLCBbdmlzaWJsZV0pO1xufVxuXG5mdW5jdGlvbiBkaXNwb3NlT3dsVmlld0J5SWQodHdlYWtJZDogc3RyaW5nLCBpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHZpZXcgPSBvd2xWaWV3cy5nZXQob3dsVmlld0tleSh0d2Vha0lkLCBpZCkpO1xuICBpZiAoIXZpZXcpIHJldHVybjtcbiAgZGlzcG9zZU93bFZpZXcodmlldyk7XG59XG5cbmZ1bmN0aW9uIGRpc3Bvc2VPd2xWaWV3c0ZvclR3ZWFrKHR3ZWFrSWQ6IHN0cmluZyk6IHZvaWQge1xuICBmb3IgKGNvbnN0IHZpZXcgb2YgWy4uLm93bFZpZXdzLnZhbHVlcygpXSkge1xuICAgIGlmICh2aWV3LnR3ZWFrSWQgPT09IHR3ZWFrSWQpIGRpc3Bvc2VPd2xWaWV3KHZpZXcpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRpc3Bvc2VBbGxPd2xWaWV3cygpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB2aWV3IG9mIFsuLi5vd2xWaWV3cy52YWx1ZXMoKV0pIGRpc3Bvc2VPd2xWaWV3KHZpZXcpO1xufVxuXG5mdW5jdGlvbiBkaXNwb3NlT3dsVmlldyh2aWV3OiBNYW5hZ2VkT3dsVmlldyk6IHZvaWQge1xuICBpZiAodmlldy5kaXNwb3NlZCkgcmV0dXJuO1xuICB2aWV3LmRpc3Bvc2VkID0gdHJ1ZTtcbiAgb3dsVmlld3MuZGVsZXRlKHZpZXcua2V5KTtcbiAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHZpZXcuZGlzcG9zZUJpbmRpbmdzLnNwbGljZSgwKSkge1xuICAgIHRyeSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfSBjYXRjaCB7fVxuICB9XG4gIGNvbnN0IHBhcmVudCA9IHZpZXcucGFyZW50V2luZG93SWQgPT09IG51bGwgPyBudWxsIDogQnJvd3NlcldpbmRvdy5mcm9tSWQodmlldy5wYXJlbnRXaW5kb3dJZCk7XG4gIGlmIChwYXJlbnQgJiYgIWlzV2luZG93RGVzdHJveWVkKHBhcmVudCkpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHZpZXcuYXR0YWNoTW9kZSA9PT0gXCJjb250ZW50Vmlld1wiKSB7XG4gICAgICAgIHJlbW92ZU93bENoaWxkVmlldyhwYXJlbnQsIHZpZXcudmlldyk7XG4gICAgICB9IGVsc2UgaWYgKHZpZXcuYXR0YWNoTW9kZSA9PT0gXCJicm93c2VyVmlld1wiKSB7XG4gICAgICAgIGNhbGxPYmplY3RNZXRob2QocGFyZW50LCBcInJlbW92ZUJyb3dzZXJWaWV3XCIsIFt2aWV3LnZpZXddKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2coXCJ3YXJuXCIsIFwiT3dsIHZpZXcgZGV0YWNoIGZhaWxlZCBkdXJpbmcgZGlzcG9zZVwiLCB7XG4gICAgICAgIHR3ZWFrSWQ6IHZpZXcudHdlYWtJZCxcbiAgICAgICAgdmlld0lkOiB2aWV3LmlkLFxuICAgICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgaWYgKCF2aWV3LnZpZXcud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuICAgICAgdmlldy52aWV3LndlYkNvbnRlbnRzLmNsb3NlKHsgd2FpdEZvckJlZm9yZVVubG9hZDogZmFsc2UgfSk7XG4gICAgfVxuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIG93bFZpZXdGb3IodHdlYWtJZDogc3RyaW5nLCBpZDogc3RyaW5nKTogTWFuYWdlZE93bFZpZXcge1xuICBjb25zdCB2aWV3ID0gb3dsVmlld3MuZ2V0KG93bFZpZXdLZXkodHdlYWtJZCwgaWQpKTtcbiAgaWYgKCF2aWV3IHx8IHZpZXcuZGlzcG9zZWQpIHRocm93IG5ldyBFcnJvcihgQ29kZXggdmlldyBpcyBub3QgbG9hZGVkOiAke3R3ZWFrSWR9OiR7aWR9YCk7XG4gIHJldHVybiB2aWV3O1xufVxuXG5mdW5jdGlvbiBvd2xWaWV3S2V5KHR3ZWFrSWQ6IHN0cmluZywgdmlld0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYCR7dHdlYWtJZH06JHt2aWV3SWR9YDtcbn1cblxuZnVuY3Rpb24gYWRkT3dsQ2hpbGRWaWV3KHBhcmVudDogRWxlY3Ryb24uQnJvd3NlcldpbmRvdywgY2hpbGQ6IEVsZWN0cm9uLkJyb3dzZXJWaWV3KTogdm9pZCB7XG4gIGNvbnN0IG93bmVyV2luZG93ID0gYXNSZWNvcmQoY2hpbGQpPy5vd25lcldpbmRvdztcbiAgaWYgKG93bmVyV2luZG93ICYmIG93bmVyV2luZG93ICE9PSBwYXJlbnQpIHtcbiAgICBjYWxsT2JqZWN0TWV0aG9kKG93bmVyV2luZG93LCBcInJlbW92ZUJyb3dzZXJWaWV3XCIsIFtjaGlsZF0pO1xuICB9XG5cbiAgY2FsbE9iamVjdE1ldGhvZChhc1JlY29yZChwYXJlbnQpPy5jb250ZW50VmlldywgXCJhZGRDaGlsZFZpZXdcIiwgW2FzUmVjb3JkKGNoaWxkKT8ud2ViQ29udGVudHNWaWV3XSk7XG4gIHRyeSB7XG4gICAgKGNoaWxkIGFzIHVua25vd24gYXMgeyBvd25lcldpbmRvdzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IG51bGwgfSkub3duZXJXaW5kb3cgPSBwYXJlbnQ7XG4gIH0gY2F0Y2gge31cbiAgY2FsbE9iamVjdE1ldGhvZChhc1JlY29yZChjaGlsZC53ZWJDb250ZW50cyksIFwiX3NldE93bmVyV2luZG93XCIsIFtwYXJlbnRdKTtcblxuICBjb25zdCBicm93c2VyVmlld3MgPSBhc1JlY29yZChwYXJlbnQpPy5fYnJvd3NlclZpZXdzO1xuICBpZiAoQXJyYXkuaXNBcnJheShicm93c2VyVmlld3MpICYmICFicm93c2VyVmlld3MuaW5jbHVkZXMoY2hpbGQpKSB7XG4gICAgYnJvd3NlclZpZXdzLnB1c2goY2hpbGQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZU93bENoaWxkVmlldyhwYXJlbnQ6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3csIGNoaWxkOiBFbGVjdHJvbi5Ccm93c2VyVmlldyk6IHZvaWQge1xuICBjYWxsT2JqZWN0TWV0aG9kKGFzUmVjb3JkKHBhcmVudCk/LmNvbnRlbnRWaWV3LCBcInJlbW92ZUNoaWxkVmlld1wiLCBbYXNSZWNvcmQoY2hpbGQpPy53ZWJDb250ZW50c1ZpZXddKTtcbiAgdHJ5IHtcbiAgICAoY2hpbGQgYXMgdW5rbm93biBhcyB7IG93bmVyV2luZG93OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCB9KS5vd25lcldpbmRvdyA9IG51bGw7XG4gIH0gY2F0Y2gge31cblxuICBjb25zdCBicm93c2VyVmlld3MgPSBhc1JlY29yZChwYXJlbnQpPy5fYnJvd3NlclZpZXdzO1xuICBpZiAoQXJyYXkuaXNBcnJheShicm93c2VyVmlld3MpKSB7XG4gICAgY29uc3QgaW5kZXggPSBicm93c2VyVmlld3MuaW5kZXhPZihjaGlsZCk7XG4gICAgaWYgKGluZGV4ID49IDApIGJyb3dzZXJWaWV3cy5zcGxpY2UoaW5kZXgsIDEpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUNvZGV4QnJvd3NlclZpZXcob3B0czogQ29kZXhDcmVhdGVWaWV3T3B0aW9ucyk6IFByb21pc2U8dW5rbm93bj4ge1xuICBjb25zdCBzZXJ2aWNlcyA9IGdldENvZGV4V2luZG93U2VydmljZXMoKTtcbiAgY29uc3Qgd2luZG93TWFuYWdlciA9IHNlcnZpY2VzPy53aW5kb3dNYW5hZ2VyO1xuICBpZiAoIXNlcnZpY2VzIHx8ICF3aW5kb3dNYW5hZ2VyPy5yZWdpc3RlcldpbmRvdykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiQ29kZXggZW1iZWRkZWQgdmlldyBzZXJ2aWNlcyBhcmUgbm90IGF2YWlsYWJsZS4gUmVpbnN0YWxsIENvZGV4KysgMS4wLjAgb3IgbGF0ZXIuXCIsXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IHJvdXRlID0gbm9ybWFsaXplQ29kZXhSb3V0ZShvcHRzLnJvdXRlKTtcbiAgY29uc3QgaG9zdElkID0gb3B0cy5ob3N0SWQgfHwgXCJsb2NhbFwiO1xuICBjb25zdCBhcHBlYXJhbmNlID0gb3B0cy5hcHBlYXJhbmNlIHx8IFwic2Vjb25kYXJ5XCI7XG4gIGNvbnN0IHZpZXcgPSBuZXcgQnJvd3NlclZpZXcoe1xuICAgIHdlYlByZWZlcmVuY2VzOiB7XG4gICAgICBwcmVsb2FkOiB3aW5kb3dNYW5hZ2VyLm9wdGlvbnM/LnByZWxvYWRQYXRoLFxuICAgICAgY29udGV4dElzb2xhdGlvbjogdHJ1ZSxcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogZmFsc2UsXG4gICAgICBzcGVsbGNoZWNrOiBmYWxzZSxcbiAgICAgIGRldlRvb2xzOiB3aW5kb3dNYW5hZ2VyLm9wdGlvbnM/LmFsbG93RGV2dG9vbHMsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IHdpbmRvd0xpa2UgPSBtYWtlV2luZG93TGlrZUZvclZpZXcodmlldyk7XG4gIHdpbmRvd01hbmFnZXIucmVnaXN0ZXJXaW5kb3cod2luZG93TGlrZSwgaG9zdElkLCBmYWxzZSwgYXBwZWFyYW5jZSk7XG4gIHNlcnZpY2VzLmdldENvbnRleHQ/Lihob3N0SWQpPy5yZWdpc3RlcldpbmRvdz8uKHdpbmRvd0xpa2UpO1xuICBhd2FpdCB2aWV3LndlYkNvbnRlbnRzLmxvYWRVUkwoY29kZXhBcHBVcmwocm91dGUsIGhvc3RJZCkpO1xuICByZXR1cm4gdmlldztcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlQ29kZXhXaW5kb3cob3B0czogQ29kZXhDcmVhdGVXaW5kb3dPcHRpb25zKTogUHJvbWlzZTxDb2RleFdpbmRvd1JlZj4ge1xuICBjb25zdCBzZXJ2aWNlcyA9IGdldENvZGV4V2luZG93U2VydmljZXMoKTtcbiAgaWYgKCFzZXJ2aWNlcykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiQ29kZXggd2luZG93IHNlcnZpY2VzIGFyZSBub3QgYXZhaWxhYmxlLiBSZWluc3RhbGwgQ29kZXgrKyAxLjAuMCBvciBsYXRlci5cIixcbiAgICApO1xuICB9XG5cbiAgY29uc3Qgcm91dGUgPSBub3JtYWxpemVDb2RleFJvdXRlKG9wdHMucm91dGUpO1xuICBjb25zdCBob3N0SWQgPSBvcHRzLmhvc3RJZCB8fCBcImxvY2FsXCI7XG4gIGNvbnN0IHBhcmVudCA9IHR5cGVvZiBvcHRzLnBhcmVudFdpbmRvd0lkID09PSBcIm51bWJlclwiXG4gICAgPyBCcm93c2VyV2luZG93LmZyb21JZChvcHRzLnBhcmVudFdpbmRvd0lkKVxuICAgIDogQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG4gIGNvbnN0IGNyZWF0ZVdpbmRvdyA9IHNlcnZpY2VzLndpbmRvd01hbmFnZXI/LmNyZWF0ZVdpbmRvdztcblxuICBsZXQgd2luOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCB8IHVuZGVmaW5lZDtcbiAgaWYgKHR5cGVvZiBjcmVhdGVXaW5kb3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHdpbiA9IGF3YWl0IGNyZWF0ZVdpbmRvdy5jYWxsKHNlcnZpY2VzLndpbmRvd01hbmFnZXIsIHtcbiAgICAgIGluaXRpYWxSb3V0ZTogcm91dGUsXG4gICAgICBob3N0SWQsXG4gICAgICBzaG93OiBvcHRzLnNob3cgIT09IGZhbHNlLFxuICAgICAgYXBwZWFyYW5jZTogb3B0cy5hcHBlYXJhbmNlIHx8IFwic2Vjb25kYXJ5XCIsXG4gICAgICBwYXJlbnQsXG4gICAgfSk7XG4gIH0gZWxzZSBpZiAoaG9zdElkID09PSBcImxvY2FsXCIgJiYgdHlwZW9mIHNlcnZpY2VzLmNyZWF0ZUZyZXNoV2luZG93ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB3aW4gPSBhd2FpdCBzZXJ2aWNlcy5jcmVhdGVGcmVzaFdpbmRvdyhyb3V0ZSk7XG4gIH0gZWxzZSBpZiAoaG9zdElkID09PSBcImxvY2FsXCIgJiYgdHlwZW9mIHNlcnZpY2VzLmNyZWF0ZUZyZXNoTG9jYWxXaW5kb3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHdpbiA9IGF3YWl0IHNlcnZpY2VzLmNyZWF0ZUZyZXNoTG9jYWxXaW5kb3cocm91dGUpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBzZXJ2aWNlcy5lbnN1cmVIb3N0V2luZG93ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB3aW4gPSBhd2FpdCBzZXJ2aWNlcy5lbnN1cmVIb3N0V2luZG93KGhvc3RJZCk7XG4gIH1cblxuICBpZiAoIXdpbiB8fCB3aW4uaXNEZXN0cm95ZWQoKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNvZGV4IGRpZCBub3QgcmV0dXJuIGEgd2luZG93IGZvciB0aGUgcmVxdWVzdGVkIHJvdXRlXCIpO1xuICB9XG5cbiAgaWYgKG9wdHMuYm91bmRzKSB7XG4gICAgd2luLnNldEJvdW5kcyhvcHRzLmJvdW5kcyk7XG4gIH1cbiAgaWYgKHBhcmVudCAmJiAhcGFyZW50LmlzRGVzdHJveWVkKCkpIHtcbiAgICB0cnkge1xuICAgICAgd2luLnNldFBhcmVudFdpbmRvdyhwYXJlbnQpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxuICBpZiAob3B0cy5zaG93ICE9PSBmYWxzZSkge1xuICAgIHdpbi5zaG93KCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHdpbmRvd0lkOiB3aW4uaWQsXG4gICAgd2ViQ29udGVudHNJZDogd2luLndlYkNvbnRlbnRzLmlkLFxuICB9O1xufVxuXG5mdW5jdGlvbiBtYWtlQ29kZXhBcGkodHdlYWs6IERpc2NvdmVyZWRUd2Vhaykge1xuICBjb25zdCBjdHggPSAoKTogTmF0aXZlVHdlYWtDb250ZXh0ID0+ICh7IGlkOiB0d2Vhay5tYW5pZmVzdC5pZCwgZGlyOiB0d2Vhay5kaXIgfSk7XG4gIHJldHVybiB7XG4gICAgcnVudGltZToge1xuICAgICAgZ2V0SW5mbzogYXN5bmMgKCkgPT4gY3VycmVudFJ1bnRpbWVJbmZvKCksXG4gICAgICBnZXRDYXBhYmlsaXRpZXM6IGFzeW5jICgpID0+IGN1cnJlbnRSdW50aW1lQ2FwYWJpbGl0aWVzKCksXG4gICAgfSxcbiAgICB3aW5kb3dzOiB7XG4gICAgICBjcmVhdGU6IGNyZWF0ZUNvZGV4V2luZG93LFxuICAgICAgZ2V0UHJpbWFyeTogYXN5bmMgKCkgPT4gZ2V0UHJpbWFyeUNvZGV4V2luZG93UmVmKCksXG4gICAgICBmb2N1czogYXN5bmMgKHdpbmRvd0lkOiBudW1iZXIpID0+IGZvY3VzQ29kZXhXaW5kb3cod2luZG93SWQpLFxuICAgICAgc2hvdzogYXN5bmMgKHdpbmRvd0lkOiBudW1iZXIpID0+IHNob3dDb2RleFdpbmRvdyh3aW5kb3dJZCksXG4gICAgfSxcbiAgICB2aWV3czoge1xuICAgICAgY3JlYXRlOiBhc3luYyAob3B0aW9uczogQ29kZXhWaWV3Q3JlYXRlT3B0aW9ucykgPT4ge1xuICAgICAgICBhc3NlcnRUd2Vha1ZpZXdQZXJtaXNzaW9uKHR3ZWFrKTtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZU93bFZpZXcoY3R4KCksIG9wdGlvbnMpO1xuICAgICAgfSxcbiAgICB9LFxuICAgIGNkcDoge1xuICAgICAgZ2V0U3RhdHVzOiBhc3luYyAoKSA9PiBnZXRDZHBTdGF0dXMoKSxcbiAgICAgIGxpc3RUYXJnZXRzOiBhc3luYyAoKSA9PiBsaXN0Q2RwVGFyZ2V0cygpLFxuICAgIH0sXG4gICAgbmF0aXZlOiB7XG4gICAgICBsb2FkTW9kdWxlOiBhc3luYyAob3B0aW9uczogTmF0aXZlTW9kdWxlTG9hZE9wdGlvbnMpID0+IHtcbiAgICAgICAgYXNzZXJ0VHdlYWtQZXJtaXNzaW9uKHR3ZWFrLCBcIm5hdGl2ZS1tb2R1bGVcIik7XG4gICAgICAgIHJldHVybiBuYXRpdmVCcmlkZ2UubG9hZE1vZHVsZShjdHgoKSwgb3B0aW9ucyk7XG4gICAgICB9LFxuICAgICAgY3JlYXRlUGFuZWw6IGFzeW5jIChvcHRpb25zOiBOYXRpdmVQYW5lbENyZWF0ZU9wdGlvbnMpID0+IHtcbiAgICAgICAgYXNzZXJ0VHdlYWtQZXJtaXNzaW9uKHR3ZWFrLCBcIm5hdGl2ZS12aWV3XCIpO1xuICAgICAgICByZXR1cm4gbmF0aXZlQnJpZGdlLmNyZWF0ZVBhbmVsKGN0eCgpLCBvcHRpb25zKTtcbiAgICAgIH0sXG4gICAgICBhdHRhY2hWaWV3OiBhc3luYyAob3B0aW9uczogTmF0aXZlVmlld0F0dGFjaE9wdGlvbnMpID0+IHtcbiAgICAgICAgYXNzZXJ0VHdlYWtQZXJtaXNzaW9uKHR3ZWFrLCBcIm5hdGl2ZS12aWV3XCIpO1xuICAgICAgICByZXR1cm4gbmF0aXZlQnJpZGdlLmF0dGFjaFZpZXcoY3R4KCksIG9wdGlvbnMpO1xuICAgICAgfSxcbiAgICAgIGxhdW5jaEhlbHBlcjogYXN5bmMgKG9wdGlvbnM6IE5hdGl2ZUhlbHBlckxhdW5jaE9wdGlvbnMpID0+IHtcbiAgICAgICAgYXNzZXJ0VHdlYWtQZXJtaXNzaW9uKHR3ZWFrLCBcIm5hdGl2ZS1oZWxwZXJcIik7XG4gICAgICAgIHJldHVybiBuYXRpdmVCcmlkZ2UubGF1bmNoSGVscGVyKGN0eCgpLCBvcHRpb25zKTtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBjcmVhdGVCcm93c2VyVmlldzogY3JlYXRlQ29kZXhCcm93c2VyVmlldyxcbiAgICBjcmVhdGVXaW5kb3c6IGNyZWF0ZUNvZGV4V2luZG93LFxuICB9O1xufVxuXG5mdW5jdGlvbiBtYWtlV2luZG93TGlrZUZvclZpZXcodmlldzogRWxlY3Ryb24uQnJvd3NlclZpZXcpOiBDb2RleFdpbmRvd0xpa2Uge1xuICBjb25zdCB2aWV3Qm91bmRzID0gKCkgPT4gdmlldy5nZXRCb3VuZHMoKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmlldy53ZWJDb250ZW50cy5pZCxcbiAgICB3ZWJDb250ZW50czogdmlldy53ZWJDb250ZW50cyxcbiAgICBvbjogKGV2ZW50OiBcImNsb3NlZFwiLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCkgPT4ge1xuICAgICAgaWYgKGV2ZW50ID09PSBcImNsb3NlZFwiKSB7XG4gICAgICAgIHZpZXcud2ViQ29udGVudHMub25jZShcImRlc3Ryb3llZFwiLCBsaXN0ZW5lcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2aWV3LndlYkNvbnRlbnRzLm9uKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdmlldztcbiAgICB9LFxuICAgIG9uY2U6IChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgdmlldy53ZWJDb250ZW50cy5vbmNlKGV2ZW50IGFzIFwiZGVzdHJveWVkXCIsIGxpc3RlbmVyKTtcbiAgICAgIHJldHVybiB2aWV3O1xuICAgIH0sXG4gICAgb2ZmOiAoZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpID0+IHtcbiAgICAgIHZpZXcud2ViQ29udGVudHMub2ZmKGV2ZW50IGFzIFwiZGVzdHJveWVkXCIsIGxpc3RlbmVyKTtcbiAgICAgIHJldHVybiB2aWV3O1xuICAgIH0sXG4gICAgcmVtb3ZlTGlzdGVuZXI6IChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgdmlldy53ZWJDb250ZW50cy5yZW1vdmVMaXN0ZW5lcihldmVudCBhcyBcImRlc3Ryb3llZFwiLCBsaXN0ZW5lcik7XG4gICAgICByZXR1cm4gdmlldztcbiAgICB9LFxuICAgIGlzRGVzdHJveWVkOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCksXG4gICAgaXNGb2N1c2VkOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmlzRm9jdXNlZCgpLFxuICAgIGZvY3VzOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmZvY3VzKCksXG4gICAgc2hvdzogKCkgPT4ge30sXG4gICAgaGlkZTogKCkgPT4ge30sXG4gICAgZ2V0Qm91bmRzOiB2aWV3Qm91bmRzLFxuICAgIGdldENvbnRlbnRCb3VuZHM6IHZpZXdCb3VuZHMsXG4gICAgZ2V0U2l6ZTogKCkgPT4ge1xuICAgICAgY29uc3QgYiA9IHZpZXdCb3VuZHMoKTtcbiAgICAgIHJldHVybiBbYi53aWR0aCwgYi5oZWlnaHRdO1xuICAgIH0sXG4gICAgZ2V0Q29udGVudFNpemU6ICgpID0+IHtcbiAgICAgIGNvbnN0IGIgPSB2aWV3Qm91bmRzKCk7XG4gICAgICByZXR1cm4gW2Iud2lkdGgsIGIuaGVpZ2h0XTtcbiAgICB9LFxuICAgIHNldFRpdGxlOiAoKSA9PiB7fSxcbiAgICBnZXRUaXRsZTogKCkgPT4gXCJcIixcbiAgICBzZXRSZXByZXNlbnRlZEZpbGVuYW1lOiAoKSA9PiB7fSxcbiAgICBzZXREb2N1bWVudEVkaXRlZDogKCkgPT4ge30sXG4gICAgc2V0V2luZG93QnV0dG9uVmlzaWJpbGl0eTogKCkgPT4ge30sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNvZGV4QXBwVXJsKHJvdXRlOiBzdHJpbmcsIGhvc3RJZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdXJsID0gbmV3IFVSTChcImFwcDovLy0vaW5kZXguaHRtbFwiKTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJob3N0SWRcIiwgaG9zdElkKTtcbiAgaWYgKHJvdXRlICE9PSBcIi9cIikgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJpbml0aWFsUm91dGVcIiwgcm91dGUpO1xuICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU93bFZpZXdVcmwodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIHVybCAhPT0gXCJzdHJpbmdcIiB8fCB1cmwuaW5jbHVkZXMoXCJcXG5cIikgfHwgdXJsLmluY2x1ZGVzKFwiXFxyXCIpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3dsIHZpZXcgVVJMIG11c3QgYmUgYSBzdHJpbmcgd2l0aG91dCBjb250cm9sIGNoYXJhY3RlcnNcIik7XG4gIH1cbiAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICBpZiAoIVtcImh0dHA6XCIsIFwiaHR0cHM6XCIsIFwiYXBwOlwiLCBcImZpbGU6XCIsIFwiZGF0YTpcIiwgXCJhYm91dDpcIl0uaW5jbHVkZXMocGFyc2VkLnByb3RvY29sKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgT3dsIHZpZXcgVVJMIHByb3RvY29sOiAke3BhcnNlZC5wcm90b2NvbH1gKTtcbiAgfVxuICByZXR1cm4gcGFyc2VkLnRvU3RyaW5nKCk7XG59XG5cbmZ1bmN0aW9uIGdldENvZGV4V2luZG93U2VydmljZXMoKTogQ29kZXhXaW5kb3dTZXJ2aWNlcyB8IG51bGwge1xuICBjb25zdCBzZXJ2aWNlcyA9IChnbG9iYWxUaGlzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW0NPREVYX1dJTkRPV19TRVJWSUNFU19LRVldO1xuICByZXR1cm4gc2VydmljZXMgJiYgdHlwZW9mIHNlcnZpY2VzID09PSBcIm9iamVjdFwiID8gKHNlcnZpY2VzIGFzIENvZGV4V2luZG93U2VydmljZXMpIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQ29kZXhSb3V0ZShyb3V0ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiByb3V0ZSAhPT0gXCJzdHJpbmdcIiB8fCAhcm91dGUuc3RhcnRzV2l0aChcIi9cIikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb2RleCByb3V0ZSBtdXN0IGJlIGFuIGFic29sdXRlIGFwcCByb3V0ZVwiKTtcbiAgfVxuICBpZiAocm91dGUuaW5jbHVkZXMoXCI6Ly9cIikgfHwgcm91dGUuaW5jbHVkZXMoXCJcXG5cIikgfHwgcm91dGUuaW5jbHVkZXMoXCJcXHJcIikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb2RleCByb3V0ZSBtdXN0IG5vdCBpbmNsdWRlIGEgcHJvdG9jb2wgb3IgY29udHJvbCBjaGFyYWN0ZXJzXCIpO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gYXNSZWNvcmQodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwge1xuICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiID8gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBjYWxsT2JqZWN0TWV0aG9kKHRhcmdldDogdW5rbm93biwgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IHVua25vd24ge1xuICBjb25zdCBmbiA9IGFzUmVjb3JkKHRhcmdldCk/LlttZXRob2RdO1xuICBpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIHJldHVybiBmbi5hcHBseSh0YXJnZXQsIGFyZ3MpO1xufVxuXG5mdW5jdGlvbiBpc1dpbmRvd0Rlc3Ryb3llZCh3aW46IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG4gIGlmICghd2luKSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgZm4gPSBhc1JlY29yZCh3aW4pPy5pc0Rlc3Ryb3llZDtcbiAgaWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEJvb2xlYW4oZm4uY2FsbCh3aW4pKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZnVuY3Rpb24gd2luZG93SWRGb3Iod2luOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCB8IHVuZGVmaW5lZCk6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBpZCA9IGFzUmVjb3JkKHdpbik/LmlkO1xuICByZXR1cm4gdHlwZW9mIGlkID09PSBcIm51bWJlclwiID8gaWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBiaW5kV2luZG93RXZlbnQoXG4gIHdpbjogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyxcbiAgdmlldzogTWFuYWdlZE93bFZpZXcsXG4gIGV2ZW50OiBzdHJpbmcsXG4gIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLFxuKTogdm9pZCB7XG4gIGNvbnN0IG9uID0gYXNSZWNvcmQod2luKT8ub247XG4gIGNvbnN0IG9mZiA9IGFzUmVjb3JkKHdpbik/Lm9mZjtcbiAgaWYgKHR5cGVvZiBvbiAhPT0gXCJmdW5jdGlvblwiKSByZXR1cm47XG4gIG9uLmNhbGwod2luLCBldmVudCwgbGlzdGVuZXIpO1xuICB2aWV3LmRpc3Bvc2VCaW5kaW5ncy5wdXNoKCgpID0+IHtcbiAgICBpZiAodHlwZW9mIG9mZiA9PT0gXCJmdW5jdGlvblwiKSBvZmYuY2FsbCh3aW4sIGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgZWxzZSBjYWxsT2JqZWN0TWV0aG9kKHdpbiwgXCJyZW1vdmVMaXN0ZW5lclwiLCBbZXZlbnQsIGxpc3RlbmVyXSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRCcmlkZ2VJZCh2YWx1ZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIiB8fCAhL15bYS16QS1aMC05Ll8tXSskLy50ZXN0KHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgJHtsYWJlbH0gbWF5IG9ubHkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCB1bmRlcnNjb3JlcywgYW5kIGRhc2hlc2ApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0Qm91bmRzKGJvdW5kczogRWxlY3Ryb24uUmVjdGFuZ2xlKTogdm9pZCB7XG4gIGNvbnN0IHZhbHVlcyA9IFtib3VuZHM/LngsIGJvdW5kcz8ueSwgYm91bmRzPy53aWR0aCwgYm91bmRzPy5oZWlnaHRdO1xuICBpZiAoIXZhbHVlcy5ldmVyeSgodmFsdWUpID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcImJvdW5kcyBtdXN0IGNvbnRhaW4gZmluaXRlIHgsIHksIHdpZHRoLCBhbmQgaGVpZ2h0IG51bWJlcnNcIik7XG4gIH1cbiAgaWYgKGJvdW5kcy53aWR0aCA8IDAgfHwgYm91bmRzLmhlaWdodCA8IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJib3VuZHMgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIG5vbi1uZWdhdGl2ZVwiKTtcbiAgfVxufVxuXG4vLyBUb3VjaCBCcm93c2VyV2luZG93IHRvIGtlZXAgaXRzIGltcG9ydCBcdTIwMTQgb2xkZXIgRWxlY3Ryb24gbGludCBydWxlcy5cbnZvaWQgQnJvd3NlcldpbmRvdztcbiIsICIvKiEgY2hva2lkYXIgLSBNSVQgTGljZW5zZSAoYykgMjAxMiBQYXVsIE1pbGxlciAocGF1bG1pbGxyLmNvbSkgKi9cbmltcG9ydCB7IHN0YXQgYXMgc3RhdGNiIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgc3RhdCwgcmVhZGRpciB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgKiBhcyBzeXNQYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcmVhZGRpcnAgfSBmcm9tICdyZWFkZGlycCc7XG5pbXBvcnQgeyBOb2RlRnNIYW5kbGVyLCBFVkVOVFMgYXMgRVYsIGlzV2luZG93cywgaXNJQk1pLCBFTVBUWV9GTiwgU1RSX0NMT1NFLCBTVFJfRU5ELCB9IGZyb20gJy4vaGFuZGxlci5qcyc7XG5jb25zdCBTTEFTSCA9ICcvJztcbmNvbnN0IFNMQVNIX1NMQVNIID0gJy8vJztcbmNvbnN0IE9ORV9ET1QgPSAnLic7XG5jb25zdCBUV09fRE9UUyA9ICcuLic7XG5jb25zdCBTVFJJTkdfVFlQRSA9ICdzdHJpbmcnO1xuY29uc3QgQkFDS19TTEFTSF9SRSA9IC9cXFxcL2c7XG5jb25zdCBET1VCTEVfU0xBU0hfUkUgPSAvXFwvXFwvLztcbmNvbnN0IERPVF9SRSA9IC9cXC4uKlxcLihzd1tweF0pJHx+JHxcXC5zdWJsLipcXC50bXAvO1xuY29uc3QgUkVQTEFDRVJfUkUgPSAvXlxcLlsvXFxcXF0vO1xuZnVuY3Rpb24gYXJyaWZ5KGl0ZW0pIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShpdGVtKSA/IGl0ZW0gOiBbaXRlbV07XG59XG5jb25zdCBpc01hdGNoZXJPYmplY3QgPSAobWF0Y2hlcikgPT4gdHlwZW9mIG1hdGNoZXIgPT09ICdvYmplY3QnICYmIG1hdGNoZXIgIT09IG51bGwgJiYgIShtYXRjaGVyIGluc3RhbmNlb2YgUmVnRXhwKTtcbmZ1bmN0aW9uIGNyZWF0ZVBhdHRlcm4obWF0Y2hlcikge1xuICAgIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgcmV0dXJuIG1hdGNoZXI7XG4gICAgaWYgKHR5cGVvZiBtYXRjaGVyID09PSAnc3RyaW5nJylcbiAgICAgICAgcmV0dXJuIChzdHJpbmcpID0+IG1hdGNoZXIgPT09IHN0cmluZztcbiAgICBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIFJlZ0V4cClcbiAgICAgICAgcmV0dXJuIChzdHJpbmcpID0+IG1hdGNoZXIudGVzdChzdHJpbmcpO1xuICAgIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gJ29iamVjdCcgJiYgbWF0Y2hlciAhPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gKHN0cmluZykgPT4ge1xuICAgICAgICAgICAgaWYgKG1hdGNoZXIucGF0aCA9PT0gc3RyaW5nKVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXIucmVjdXJzaXZlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmUgPSBzeXNQYXRoLnJlbGF0aXZlKG1hdGNoZXIucGF0aCwgc3RyaW5nKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlbGF0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuICFyZWxhdGl2ZS5zdGFydHNXaXRoKCcuLicpICYmICFzeXNQYXRoLmlzQWJzb2x1dGUocmVsYXRpdmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gKCkgPT4gZmFsc2U7XG59XG5mdW5jdGlvbiBub3JtYWxpemVQYXRoKHBhdGgpIHtcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZyBleHBlY3RlZCcpO1xuICAgIHBhdGggPSBzeXNQYXRoLm5vcm1hbGl6ZShwYXRoKTtcbiAgICBwYXRoID0gcGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG4gICAgbGV0IHByZXBlbmQgPSBmYWxzZTtcbiAgICBpZiAocGF0aC5zdGFydHNXaXRoKCcvLycpKVxuICAgICAgICBwcmVwZW5kID0gdHJ1ZTtcbiAgICBjb25zdCBET1VCTEVfU0xBU0hfUkUgPSAvXFwvXFwvLztcbiAgICB3aGlsZSAocGF0aC5tYXRjaChET1VCTEVfU0xBU0hfUkUpKVxuICAgICAgICBwYXRoID0gcGF0aC5yZXBsYWNlKERPVUJMRV9TTEFTSF9SRSwgJy8nKTtcbiAgICBpZiAocHJlcGVuZClcbiAgICAgICAgcGF0aCA9ICcvJyArIHBhdGg7XG4gICAgcmV0dXJuIHBhdGg7XG59XG5mdW5jdGlvbiBtYXRjaFBhdHRlcm5zKHBhdHRlcm5zLCB0ZXN0U3RyaW5nLCBzdGF0cykge1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKHRlc3RTdHJpbmcpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXR0ZXJucy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY29uc3QgcGF0dGVybiA9IHBhdHRlcm5zW2luZGV4XTtcbiAgICAgICAgaWYgKHBhdHRlcm4ocGF0aCwgc3RhdHMpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5mdW5jdGlvbiBhbnltYXRjaChtYXRjaGVycywgdGVzdFN0cmluZykge1xuICAgIGlmIChtYXRjaGVycyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FueW1hdGNoOiBzcGVjaWZ5IGZpcnN0IGFyZ3VtZW50Jyk7XG4gICAgfVxuICAgIC8vIEVhcmx5IGNhY2hlIGZvciBtYXRjaGVycy5cbiAgICBjb25zdCBtYXRjaGVyc0FycmF5ID0gYXJyaWZ5KG1hdGNoZXJzKTtcbiAgICBjb25zdCBwYXR0ZXJucyA9IG1hdGNoZXJzQXJyYXkubWFwKChtYXRjaGVyKSA9PiBjcmVhdGVQYXR0ZXJuKG1hdGNoZXIpKTtcbiAgICBpZiAodGVzdFN0cmluZyA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiAodGVzdFN0cmluZywgc3RhdHMpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaFBhdHRlcm5zKHBhdHRlcm5zLCB0ZXN0U3RyaW5nLCBzdGF0cyk7XG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBtYXRjaFBhdHRlcm5zKHBhdHRlcm5zLCB0ZXN0U3RyaW5nKTtcbn1cbmNvbnN0IHVuaWZ5UGF0aHMgPSAocGF0aHNfKSA9PiB7XG4gICAgY29uc3QgcGF0aHMgPSBhcnJpZnkocGF0aHNfKS5mbGF0KCk7XG4gICAgaWYgKCFwYXRocy5ldmVyeSgocCkgPT4gdHlwZW9mIHAgPT09IFNUUklOR19UWVBFKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBOb24tc3RyaW5nIHByb3ZpZGVkIGFzIHdhdGNoIHBhdGg6ICR7cGF0aHN9YCk7XG4gICAgfVxuICAgIHJldHVybiBwYXRocy5tYXAobm9ybWFsaXplUGF0aFRvVW5peCk7XG59O1xuLy8gSWYgU0xBU0hfU0xBU0ggb2NjdXJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgcGF0aCwgaXQgaXMgbm90IHJlcGxhY2VkXG4vLyAgICAgYmVjYXVzZSBcIi8vU3RvcmFnZVBDL0RyaXZlUG9vbC9Nb3ZpZXNcIiBpcyBhIHZhbGlkIG5ldHdvcmsgcGF0aFxuY29uc3QgdG9Vbml4ID0gKHN0cmluZykgPT4ge1xuICAgIGxldCBzdHIgPSBzdHJpbmcucmVwbGFjZShCQUNLX1NMQVNIX1JFLCBTTEFTSCk7XG4gICAgbGV0IHByZXBlbmQgPSBmYWxzZTtcbiAgICBpZiAoc3RyLnN0YXJ0c1dpdGgoU0xBU0hfU0xBU0gpKSB7XG4gICAgICAgIHByZXBlbmQgPSB0cnVlO1xuICAgIH1cbiAgICB3aGlsZSAoc3RyLm1hdGNoKERPVUJMRV9TTEFTSF9SRSkpIHtcbiAgICAgICAgc3RyID0gc3RyLnJlcGxhY2UoRE9VQkxFX1NMQVNIX1JFLCBTTEFTSCk7XG4gICAgfVxuICAgIGlmIChwcmVwZW5kKSB7XG4gICAgICAgIHN0ciA9IFNMQVNIICsgc3RyO1xuICAgIH1cbiAgICByZXR1cm4gc3RyO1xufTtcbi8vIE91ciB2ZXJzaW9uIG9mIHVwYXRoLm5vcm1hbGl6ZVxuLy8gVE9ETzogdGhpcyBpcyBub3QgZXF1YWwgdG8gcGF0aC1ub3JtYWxpemUgbW9kdWxlIC0gaW52ZXN0aWdhdGUgd2h5XG5jb25zdCBub3JtYWxpemVQYXRoVG9Vbml4ID0gKHBhdGgpID0+IHRvVW5peChzeXNQYXRoLm5vcm1hbGl6ZSh0b1VuaXgocGF0aCkpKTtcbi8vIFRPRE86IHJlZmFjdG9yXG5jb25zdCBub3JtYWxpemVJZ25vcmVkID0gKGN3ZCA9ICcnKSA9PiAocGF0aCkgPT4ge1xuICAgIGlmICh0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZVBhdGhUb1VuaXgoc3lzUGF0aC5pc0Fic29sdXRlKHBhdGgpID8gcGF0aCA6IHN5c1BhdGguam9pbihjd2QsIHBhdGgpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cbn07XG5jb25zdCBnZXRBYnNvbHV0ZVBhdGggPSAocGF0aCwgY3dkKSA9PiB7XG4gICAgaWYgKHN5c1BhdGguaXNBYnNvbHV0ZShwYXRoKSkge1xuICAgICAgICByZXR1cm4gcGF0aDtcbiAgICB9XG4gICAgcmV0dXJuIHN5c1BhdGguam9pbihjd2QsIHBhdGgpO1xufTtcbmNvbnN0IEVNUFRZX1NFVCA9IE9iamVjdC5mcmVlemUobmV3IFNldCgpKTtcbi8qKlxuICogRGlyZWN0b3J5IGVudHJ5LlxuICovXG5jbGFzcyBEaXJFbnRyeSB7XG4gICAgY29uc3RydWN0b3IoZGlyLCByZW1vdmVXYXRjaGVyKSB7XG4gICAgICAgIHRoaXMucGF0aCA9IGRpcjtcbiAgICAgICAgdGhpcy5fcmVtb3ZlV2F0Y2hlciA9IHJlbW92ZVdhdGNoZXI7XG4gICAgICAgIHRoaXMuaXRlbXMgPSBuZXcgU2V0KCk7XG4gICAgfVxuICAgIGFkZChpdGVtKSB7XG4gICAgICAgIGNvbnN0IHsgaXRlbXMgfSA9IHRoaXM7XG4gICAgICAgIGlmICghaXRlbXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmIChpdGVtICE9PSBPTkVfRE9UICYmIGl0ZW0gIT09IFRXT19ET1RTKVxuICAgICAgICAgICAgaXRlbXMuYWRkKGl0ZW0pO1xuICAgIH1cbiAgICBhc3luYyByZW1vdmUoaXRlbSkge1xuICAgICAgICBjb25zdCB7IGl0ZW1zIH0gPSB0aGlzO1xuICAgICAgICBpZiAoIWl0ZW1zKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpdGVtcy5kZWxldGUoaXRlbSk7XG4gICAgICAgIGlmIChpdGVtcy5zaXplID4gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3QgZGlyID0gdGhpcy5wYXRoO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgcmVhZGRpcihkaXIpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9yZW1vdmVXYXRjaGVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVtb3ZlV2F0Y2hlcihzeXNQYXRoLmRpcm5hbWUoZGlyKSwgc3lzUGF0aC5iYXNlbmFtZShkaXIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBoYXMoaXRlbSkge1xuICAgICAgICBjb25zdCB7IGl0ZW1zIH0gPSB0aGlzO1xuICAgICAgICBpZiAoIWl0ZW1zKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICByZXR1cm4gaXRlbXMuaGFzKGl0ZW0pO1xuICAgIH1cbiAgICBnZXRDaGlsZHJlbigpIHtcbiAgICAgICAgY29uc3QgeyBpdGVtcyB9ID0gdGhpcztcbiAgICAgICAgaWYgKCFpdGVtcylcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIFsuLi5pdGVtcy52YWx1ZXMoKV07XG4gICAgfVxuICAgIGRpc3Bvc2UoKSB7XG4gICAgICAgIHRoaXMuaXRlbXMuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5wYXRoID0gJyc7XG4gICAgICAgIHRoaXMuX3JlbW92ZVdhdGNoZXIgPSBFTVBUWV9GTjtcbiAgICAgICAgdGhpcy5pdGVtcyA9IEVNUFRZX1NFVDtcbiAgICAgICAgT2JqZWN0LmZyZWV6ZSh0aGlzKTtcbiAgICB9XG59XG5jb25zdCBTVEFUX01FVEhPRF9GID0gJ3N0YXQnO1xuY29uc3QgU1RBVF9NRVRIT0RfTCA9ICdsc3RhdCc7XG5leHBvcnQgY2xhc3MgV2F0Y2hIZWxwZXIge1xuICAgIGNvbnN0cnVjdG9yKHBhdGgsIGZvbGxvdywgZnN3KSB7XG4gICAgICAgIHRoaXMuZnN3ID0gZnN3O1xuICAgICAgICBjb25zdCB3YXRjaFBhdGggPSBwYXRoO1xuICAgICAgICB0aGlzLnBhdGggPSBwYXRoID0gcGF0aC5yZXBsYWNlKFJFUExBQ0VSX1JFLCAnJyk7XG4gICAgICAgIHRoaXMud2F0Y2hQYXRoID0gd2F0Y2hQYXRoO1xuICAgICAgICB0aGlzLmZ1bGxXYXRjaFBhdGggPSBzeXNQYXRoLnJlc29sdmUod2F0Y2hQYXRoKTtcbiAgICAgICAgdGhpcy5kaXJQYXJ0cyA9IFtdO1xuICAgICAgICB0aGlzLmRpclBhcnRzLmZvckVhY2goKHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSlcbiAgICAgICAgICAgICAgICBwYXJ0cy5wb3AoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZm9sbG93U3ltbGlua3MgPSBmb2xsb3c7XG4gICAgICAgIHRoaXMuc3RhdE1ldGhvZCA9IGZvbGxvdyA/IFNUQVRfTUVUSE9EX0YgOiBTVEFUX01FVEhPRF9MO1xuICAgIH1cbiAgICBlbnRyeVBhdGgoZW50cnkpIHtcbiAgICAgICAgcmV0dXJuIHN5c1BhdGguam9pbih0aGlzLndhdGNoUGF0aCwgc3lzUGF0aC5yZWxhdGl2ZSh0aGlzLndhdGNoUGF0aCwgZW50cnkuZnVsbFBhdGgpKTtcbiAgICB9XG4gICAgZmlsdGVyUGF0aChlbnRyeSkge1xuICAgICAgICBjb25zdCB7IHN0YXRzIH0gPSBlbnRyeTtcbiAgICAgICAgaWYgKHN0YXRzICYmIHN0YXRzLmlzU3ltYm9saWNMaW5rKCkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5maWx0ZXJEaXIoZW50cnkpO1xuICAgICAgICBjb25zdCByZXNvbHZlZFBhdGggPSB0aGlzLmVudHJ5UGF0aChlbnRyeSk7XG4gICAgICAgIC8vIFRPRE86IHdoYXQgaWYgc3RhdHMgaXMgdW5kZWZpbmVkPyByZW1vdmUgIVxuICAgICAgICByZXR1cm4gdGhpcy5mc3cuX2lzbnRJZ25vcmVkKHJlc29sdmVkUGF0aCwgc3RhdHMpICYmIHRoaXMuZnN3Ll9oYXNSZWFkUGVybWlzc2lvbnMoc3RhdHMpO1xuICAgIH1cbiAgICBmaWx0ZXJEaXIoZW50cnkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnN3Ll9pc250SWdub3JlZCh0aGlzLmVudHJ5UGF0aChlbnRyeSksIGVudHJ5LnN0YXRzKTtcbiAgICB9XG59XG4vKipcbiAqIFdhdGNoZXMgZmlsZXMgJiBkaXJlY3RvcmllcyBmb3IgY2hhbmdlcy4gRW1pdHRlZCBldmVudHM6XG4gKiBgYWRkYCwgYGFkZERpcmAsIGBjaGFuZ2VgLCBgdW5saW5rYCwgYHVubGlua0RpcmAsIGBhbGxgLCBgZXJyb3JgXG4gKlxuICogICAgIG5ldyBGU1dhdGNoZXIoKVxuICogICAgICAgLmFkZChkaXJlY3RvcmllcylcbiAqICAgICAgIC5vbignYWRkJywgcGF0aCA9PiBsb2coJ0ZpbGUnLCBwYXRoLCAnd2FzIGFkZGVkJykpXG4gKi9cbmV4cG9ydCBjbGFzcyBGU1dhdGNoZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICAgIC8vIE5vdCBpbmRlbnRpbmcgbWV0aG9kcyBmb3IgaGlzdG9yeSBzYWtlOyBmb3Igbm93LlxuICAgIGNvbnN0cnVjdG9yKF9vcHRzID0ge30pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5jbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2xvc2VycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5faWdub3JlZFBhdGhzID0gbmV3IFNldCgpO1xuICAgICAgICB0aGlzLl90aHJvdHRsZWQgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX3N0cmVhbXMgPSBuZXcgU2V0KCk7XG4gICAgICAgIHRoaXMuX3N5bWxpbmtQYXRocyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fd2F0Y2hlZCA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ1dyaXRlcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ1VubGlua3MgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX3JlYWR5Q291bnQgPSAwO1xuICAgICAgICB0aGlzLl9yZWFkeUVtaXR0ZWQgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgYXdmID0gX29wdHMuYXdhaXRXcml0ZUZpbmlzaDtcbiAgICAgICAgY29uc3QgREVGX0FXRiA9IHsgc3RhYmlsaXR5VGhyZXNob2xkOiAyMDAwLCBwb2xsSW50ZXJ2YWw6IDEwMCB9O1xuICAgICAgICBjb25zdCBvcHRzID0ge1xuICAgICAgICAgICAgLy8gRGVmYXVsdHNcbiAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHRydWUsXG4gICAgICAgICAgICBpZ25vcmVJbml0aWFsOiBmYWxzZSxcbiAgICAgICAgICAgIGlnbm9yZVBlcm1pc3Npb25FcnJvcnM6IGZhbHNlLFxuICAgICAgICAgICAgaW50ZXJ2YWw6IDEwMCxcbiAgICAgICAgICAgIGJpbmFyeUludGVydmFsOiAzMDAsXG4gICAgICAgICAgICBmb2xsb3dTeW1saW5rczogdHJ1ZSxcbiAgICAgICAgICAgIHVzZVBvbGxpbmc6IGZhbHNlLFxuICAgICAgICAgICAgLy8gdXNlQXN5bmM6IGZhbHNlLFxuICAgICAgICAgICAgYXRvbWljOiB0cnVlLCAvLyBOT1RFOiBvdmVyd3JpdHRlbiBsYXRlciAoZGVwZW5kcyBvbiB1c2VQb2xsaW5nKVxuICAgICAgICAgICAgLi4uX29wdHMsXG4gICAgICAgICAgICAvLyBDaGFuZ2UgZm9ybWF0XG4gICAgICAgICAgICBpZ25vcmVkOiBfb3B0cy5pZ25vcmVkID8gYXJyaWZ5KF9vcHRzLmlnbm9yZWQpIDogYXJyaWZ5KFtdKSxcbiAgICAgICAgICAgIGF3YWl0V3JpdGVGaW5pc2g6IGF3ZiA9PT0gdHJ1ZSA/IERFRl9BV0YgOiB0eXBlb2YgYXdmID09PSAnb2JqZWN0JyA/IHsgLi4uREVGX0FXRiwgLi4uYXdmIH0gOiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWx3YXlzIGRlZmF1bHQgdG8gcG9sbGluZyBvbiBJQk0gaSBiZWNhdXNlIGZzLndhdGNoKCkgaXMgbm90IGF2YWlsYWJsZSBvbiBJQk0gaS5cbiAgICAgICAgaWYgKGlzSUJNaSlcbiAgICAgICAgICAgIG9wdHMudXNlUG9sbGluZyA9IHRydWU7XG4gICAgICAgIC8vIEVkaXRvciBhdG9taWMgd3JpdGUgbm9ybWFsaXphdGlvbiBlbmFibGVkIGJ5IGRlZmF1bHQgd2l0aCBmcy53YXRjaFxuICAgICAgICBpZiAob3B0cy5hdG9taWMgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIG9wdHMuYXRvbWljID0gIW9wdHMudXNlUG9sbGluZztcbiAgICAgICAgLy8gb3B0cy5hdG9taWMgPSB0eXBlb2YgX29wdHMuYXRvbWljID09PSAnbnVtYmVyJyA/IF9vcHRzLmF0b21pYyA6IDEwMDtcbiAgICAgICAgLy8gR2xvYmFsIG92ZXJyaWRlLiBVc2VmdWwgZm9yIGRldmVsb3BlcnMsIHdobyBuZWVkIHRvIGZvcmNlIHBvbGxpbmcgZm9yIGFsbFxuICAgICAgICAvLyBpbnN0YW5jZXMgb2YgY2hva2lkYXIsIHJlZ2FyZGxlc3Mgb2YgdXNhZ2UgLyBkZXBlbmRlbmN5IGRlcHRoXG4gICAgICAgIGNvbnN0IGVudlBvbGwgPSBwcm9jZXNzLmVudi5DSE9LSURBUl9VU0VQT0xMSU5HO1xuICAgICAgICBpZiAoZW52UG9sbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBlbnZMb3dlciA9IGVudlBvbGwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmIChlbnZMb3dlciA9PT0gJ2ZhbHNlJyB8fCBlbnZMb3dlciA9PT0gJzAnKVxuICAgICAgICAgICAgICAgIG9wdHMudXNlUG9sbGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgZWxzZSBpZiAoZW52TG93ZXIgPT09ICd0cnVlJyB8fCBlbnZMb3dlciA9PT0gJzEnKVxuICAgICAgICAgICAgICAgIG9wdHMudXNlUG9sbGluZyA9IHRydWU7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgb3B0cy51c2VQb2xsaW5nID0gISFlbnZMb3dlcjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbnZJbnRlcnZhbCA9IHByb2Nlc3MuZW52LkNIT0tJREFSX0lOVEVSVkFMO1xuICAgICAgICBpZiAoZW52SW50ZXJ2YWwpXG4gICAgICAgICAgICBvcHRzLmludGVydmFsID0gTnVtYmVyLnBhcnNlSW50KGVudkludGVydmFsLCAxMCk7XG4gICAgICAgIC8vIFRoaXMgaXMgZG9uZSB0byBlbWl0IHJlYWR5IG9ubHkgb25jZSwgYnV0IGVhY2ggJ2FkZCcgd2lsbCBpbmNyZWFzZSB0aGF0P1xuICAgICAgICBsZXQgcmVhZHlDYWxscyA9IDA7XG4gICAgICAgIHRoaXMuX2VtaXRSZWFkeSA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlYWR5Q2FsbHMrKztcbiAgICAgICAgICAgIGlmIChyZWFkeUNhbGxzID49IHRoaXMuX3JlYWR5Q291bnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0UmVhZHkgPSBFTVBUWV9GTjtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkeUVtaXR0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIC8vIHVzZSBwcm9jZXNzLm5leHRUaWNrIHRvIGFsbG93IHRpbWUgZm9yIGxpc3RlbmVyIHRvIGJlIGJvdW5kXG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB0aGlzLmVtaXQoRVYuUkVBRFkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5fZW1pdFJhdyA9ICguLi5hcmdzKSA9PiB0aGlzLmVtaXQoRVYuUkFXLCAuLi5hcmdzKTtcbiAgICAgICAgdGhpcy5fYm91bmRSZW1vdmUgPSB0aGlzLl9yZW1vdmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0cztcbiAgICAgICAgdGhpcy5fbm9kZUZzSGFuZGxlciA9IG5ldyBOb2RlRnNIYW5kbGVyKHRoaXMpO1xuICAgICAgICAvLyBZb3VcdTIwMTlyZSBmcm96ZW4gd2hlbiB5b3VyIGhlYXJ0XHUyMDE5cyBub3Qgb3Blbi5cbiAgICAgICAgT2JqZWN0LmZyZWV6ZShvcHRzKTtcbiAgICB9XG4gICAgX2FkZElnbm9yZWRQYXRoKG1hdGNoZXIpIHtcbiAgICAgICAgaWYgKGlzTWF0Y2hlck9iamVjdChtYXRjaGVyKSkge1xuICAgICAgICAgICAgLy8gcmV0dXJuIGVhcmx5IGlmIHdlIGFscmVhZHkgaGF2ZSBhIGRlZXBseSBlcXVhbCBtYXRjaGVyIG9iamVjdFxuICAgICAgICAgICAgZm9yIChjb25zdCBpZ25vcmVkIG9mIHRoaXMuX2lnbm9yZWRQYXRocykge1xuICAgICAgICAgICAgICAgIGlmIChpc01hdGNoZXJPYmplY3QoaWdub3JlZCkgJiZcbiAgICAgICAgICAgICAgICAgICAgaWdub3JlZC5wYXRoID09PSBtYXRjaGVyLnBhdGggJiZcbiAgICAgICAgICAgICAgICAgICAgaWdub3JlZC5yZWN1cnNpdmUgPT09IG1hdGNoZXIucmVjdXJzaXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5faWdub3JlZFBhdGhzLmFkZChtYXRjaGVyKTtcbiAgICB9XG4gICAgX3JlbW92ZUlnbm9yZWRQYXRoKG1hdGNoZXIpIHtcbiAgICAgICAgdGhpcy5faWdub3JlZFBhdGhzLmRlbGV0ZShtYXRjaGVyKTtcbiAgICAgICAgLy8gbm93IGZpbmQgYW55IG1hdGNoZXIgb2JqZWN0cyB3aXRoIHRoZSBtYXRjaGVyIGFzIHBhdGhcbiAgICAgICAgaWYgKHR5cGVvZiBtYXRjaGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBpZ25vcmVkIG9mIHRoaXMuX2lnbm9yZWRQYXRocykge1xuICAgICAgICAgICAgICAgIC8vIFRPRE8gKDQzMDgxaik6IG1ha2UgdGhpcyBtb3JlIGVmZmljaWVudC5cbiAgICAgICAgICAgICAgICAvLyBwcm9iYWJseSBqdXN0IG1ha2UgYSBgdGhpcy5faWdub3JlZERpcmVjdG9yaWVzYCBvciBzb21lXG4gICAgICAgICAgICAgICAgLy8gc3VjaCB0aGluZy5cbiAgICAgICAgICAgICAgICBpZiAoaXNNYXRjaGVyT2JqZWN0KGlnbm9yZWQpICYmIGlnbm9yZWQucGF0aCA9PT0gbWF0Y2hlcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pZ25vcmVkUGF0aHMuZGVsZXRlKGlnbm9yZWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyBQdWJsaWMgbWV0aG9kc1xuICAgIC8qKlxuICAgICAqIEFkZHMgcGF0aHMgdG8gYmUgd2F0Y2hlZCBvbiBhbiBleGlzdGluZyBGU1dhdGNoZXIgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHBhdGhzXyBmaWxlIG9yIGZpbGUgbGlzdC4gT3RoZXIgYXJndW1lbnRzIGFyZSB1bnVzZWRcbiAgICAgKi9cbiAgICBhZGQocGF0aHNfLCBfb3JpZ0FkZCwgX2ludGVybmFsKSB7XG4gICAgICAgIGNvbnN0IHsgY3dkIH0gPSB0aGlzLm9wdGlvbnM7XG4gICAgICAgIHRoaXMuY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Nsb3NlUHJvbWlzZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHBhdGhzID0gdW5pZnlQYXRocyhwYXRoc18pO1xuICAgICAgICBpZiAoY3dkKSB7XG4gICAgICAgICAgICBwYXRocyA9IHBhdGhzLm1hcCgocGF0aCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFic1BhdGggPSBnZXRBYnNvbHV0ZVBhdGgocGF0aCwgY3dkKTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBgcGF0aGAgaW5zdGVhZCBvZiBgYWJzUGF0aGAgYmVjYXVzZSB0aGUgY3dkIHBvcnRpb24gY2FuJ3QgYmUgYSBnbG9iXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFic1BhdGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBwYXRocy5mb3JFYWNoKChwYXRoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9yZW1vdmVJZ25vcmVkUGF0aChwYXRoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3VzZXJJZ25vcmVkID0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIXRoaXMuX3JlYWR5Q291bnQpXG4gICAgICAgICAgICB0aGlzLl9yZWFkeUNvdW50ID0gMDtcbiAgICAgICAgdGhpcy5fcmVhZHlDb3VudCArPSBwYXRocy5sZW5ndGg7XG4gICAgICAgIFByb21pc2UuYWxsKHBhdGhzLm1hcChhc3luYyAocGF0aCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5fbm9kZUZzSGFuZGxlci5fYWRkVG9Ob2RlRnMocGF0aCwgIV9pbnRlcm5hbCwgdW5kZWZpbmVkLCAwLCBfb3JpZ0FkZCk7XG4gICAgICAgICAgICBpZiAocmVzKVxuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXRSZWFkeSgpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfSkpLnRoZW4oKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLmNsb3NlZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICByZXN1bHRzLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGQoc3lzUGF0aC5kaXJuYW1lKGl0ZW0pLCBzeXNQYXRoLmJhc2VuYW1lKF9vcmlnQWRkIHx8IGl0ZW0pKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENsb3NlIHdhdGNoZXJzIG9yIHN0YXJ0IGlnbm9yaW5nIGV2ZW50cyBmcm9tIHNwZWNpZmllZCBwYXRocy5cbiAgICAgKi9cbiAgICB1bndhdGNoKHBhdGhzXykge1xuICAgICAgICBpZiAodGhpcy5jbG9zZWQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgY29uc3QgcGF0aHMgPSB1bmlmeVBhdGhzKHBhdGhzXyk7XG4gICAgICAgIGNvbnN0IHsgY3dkIH0gPSB0aGlzLm9wdGlvbnM7XG4gICAgICAgIHBhdGhzLmZvckVhY2goKHBhdGgpID0+IHtcbiAgICAgICAgICAgIC8vIGNvbnZlcnQgdG8gYWJzb2x1dGUgcGF0aCB1bmxlc3MgcmVsYXRpdmUgcGF0aCBhbHJlYWR5IG1hdGNoZXNcbiAgICAgICAgICAgIGlmICghc3lzUGF0aC5pc0Fic29sdXRlKHBhdGgpICYmICF0aGlzLl9jbG9zZXJzLmhhcyhwYXRoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjd2QpXG4gICAgICAgICAgICAgICAgICAgIHBhdGggPSBzeXNQYXRoLmpvaW4oY3dkLCBwYXRoKTtcbiAgICAgICAgICAgICAgICBwYXRoID0gc3lzUGF0aC5yZXNvbHZlKHBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fY2xvc2VQYXRoKHBhdGgpO1xuICAgICAgICAgICAgdGhpcy5fYWRkSWdub3JlZFBhdGgocGF0aCk7XG4gICAgICAgICAgICBpZiAodGhpcy5fd2F0Y2hlZC5oYXMocGF0aCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRJZ25vcmVkUGF0aCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHJlY3Vyc2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJlc2V0IHRoZSBjYWNoZWQgdXNlcklnbm9yZWQgYW55bWF0Y2ggZm5cbiAgICAgICAgICAgIC8vIHRvIG1ha2UgaWdub3JlZFBhdGhzIGNoYW5nZXMgZWZmZWN0aXZlXG4gICAgICAgICAgICB0aGlzLl91c2VySWdub3JlZCA9IHVuZGVmaW5lZDtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDbG9zZSB3YXRjaGVycyBhbmQgcmVtb3ZlIGFsbCBsaXN0ZW5lcnMgZnJvbSB3YXRjaGVkIHBhdGhzLlxuICAgICAqL1xuICAgIGNsb3NlKCkge1xuICAgICAgICBpZiAodGhpcy5fY2xvc2VQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY2xvc2VQcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xvc2VkID0gdHJ1ZTtcbiAgICAgICAgLy8gTWVtb3J5IG1hbmFnZW1lbnQuXG4gICAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG4gICAgICAgIGNvbnN0IGNsb3NlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5fY2xvc2Vycy5mb3JFYWNoKChjbG9zZXJMaXN0KSA9PiBjbG9zZXJMaXN0LmZvckVhY2goKGNsb3NlcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IGNsb3NlcigpO1xuICAgICAgICAgICAgaWYgKHByb21pc2UgaW5zdGFuY2VvZiBQcm9taXNlKVxuICAgICAgICAgICAgICAgIGNsb3NlcnMucHVzaChwcm9taXNlKTtcbiAgICAgICAgfSkpO1xuICAgICAgICB0aGlzLl9zdHJlYW1zLmZvckVhY2goKHN0cmVhbSkgPT4gc3RyZWFtLmRlc3Ryb3koKSk7XG4gICAgICAgIHRoaXMuX3VzZXJJZ25vcmVkID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9yZWFkeUNvdW50ID0gMDtcbiAgICAgICAgdGhpcy5fcmVhZHlFbWl0dGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3dhdGNoZWQuZm9yRWFjaCgoZGlyZW50KSA9PiBkaXJlbnQuZGlzcG9zZSgpKTtcbiAgICAgICAgdGhpcy5fY2xvc2Vycy5jbGVhcigpO1xuICAgICAgICB0aGlzLl93YXRjaGVkLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX3N0cmVhbXMuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fc3ltbGlua1BhdGhzLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX3Rocm90dGxlZC5jbGVhcigpO1xuICAgICAgICB0aGlzLl9jbG9zZVByb21pc2UgPSBjbG9zZXJzLmxlbmd0aFxuICAgICAgICAgICAgPyBQcm9taXNlLmFsbChjbG9zZXJzKS50aGVuKCgpID0+IHVuZGVmaW5lZClcbiAgICAgICAgICAgIDogUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbG9zZVByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEV4cG9zZSBsaXN0IG9mIHdhdGNoZWQgcGF0aHNcbiAgICAgKiBAcmV0dXJucyBmb3IgY2hhaW5pbmdcbiAgICAgKi9cbiAgICBnZXRXYXRjaGVkKCkge1xuICAgICAgICBjb25zdCB3YXRjaExpc3QgPSB7fTtcbiAgICAgICAgdGhpcy5fd2F0Y2hlZC5mb3JFYWNoKChlbnRyeSwgZGlyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aGlzLm9wdGlvbnMuY3dkID8gc3lzUGF0aC5yZWxhdGl2ZSh0aGlzLm9wdGlvbnMuY3dkLCBkaXIpIDogZGlyO1xuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBrZXkgfHwgT05FX0RPVDtcbiAgICAgICAgICAgIHdhdGNoTGlzdFtpbmRleF0gPSBlbnRyeS5nZXRDaGlsZHJlbigpLnNvcnQoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB3YXRjaExpc3Q7XG4gICAgfVxuICAgIGVtaXRXaXRoQWxsKGV2ZW50LCBhcmdzKSB7XG4gICAgICAgIHRoaXMuZW1pdChldmVudCwgLi4uYXJncyk7XG4gICAgICAgIGlmIChldmVudCAhPT0gRVYuRVJST1IpXG4gICAgICAgICAgICB0aGlzLmVtaXQoRVYuQUxMLCBldmVudCwgLi4uYXJncyk7XG4gICAgfVxuICAgIC8vIENvbW1vbiBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS1cbiAgICAvKipcbiAgICAgKiBOb3JtYWxpemUgYW5kIGVtaXQgZXZlbnRzLlxuICAgICAqIENhbGxpbmcgX2VtaXQgRE9FUyBOT1QgTUVBTiBlbWl0KCkgd291bGQgYmUgY2FsbGVkIVxuICAgICAqIEBwYXJhbSBldmVudCBUeXBlIG9mIGV2ZW50XG4gICAgICogQHBhcmFtIHBhdGggRmlsZSBvciBkaXJlY3RvcnkgcGF0aFxuICAgICAqIEBwYXJhbSBzdGF0cyBhcmd1bWVudHMgdG8gYmUgcGFzc2VkIHdpdGggZXZlbnRcbiAgICAgKiBAcmV0dXJucyB0aGUgZXJyb3IgaWYgZGVmaW5lZCwgb3RoZXJ3aXNlIHRoZSB2YWx1ZSBvZiB0aGUgRlNXYXRjaGVyIGluc3RhbmNlJ3MgYGNsb3NlZGAgZmxhZ1xuICAgICAqL1xuICAgIGFzeW5jIF9lbWl0KGV2ZW50LCBwYXRoLCBzdGF0cykge1xuICAgICAgICBpZiAodGhpcy5jbG9zZWQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IG9wdHMgPSB0aGlzLm9wdGlvbnM7XG4gICAgICAgIGlmIChpc1dpbmRvd3MpXG4gICAgICAgICAgICBwYXRoID0gc3lzUGF0aC5ub3JtYWxpemUocGF0aCk7XG4gICAgICAgIGlmIChvcHRzLmN3ZClcbiAgICAgICAgICAgIHBhdGggPSBzeXNQYXRoLnJlbGF0aXZlKG9wdHMuY3dkLCBwYXRoKTtcbiAgICAgICAgY29uc3QgYXJncyA9IFtwYXRoXTtcbiAgICAgICAgaWYgKHN0YXRzICE9IG51bGwpXG4gICAgICAgICAgICBhcmdzLnB1c2goc3RhdHMpO1xuICAgICAgICBjb25zdCBhd2YgPSBvcHRzLmF3YWl0V3JpdGVGaW5pc2g7XG4gICAgICAgIGxldCBwdztcbiAgICAgICAgaWYgKGF3ZiAmJiAocHcgPSB0aGlzLl9wZW5kaW5nV3JpdGVzLmdldChwYXRoKSkpIHtcbiAgICAgICAgICAgIHB3Lmxhc3RDaGFuZ2UgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuYXRvbWljKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQgPT09IEVWLlVOTElOSykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BlbmRpbmdVbmxpbmtzLnNldChwYXRoLCBbZXZlbnQsIC4uLmFyZ3NdKTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcGVuZGluZ1VubGlua3MuZm9yRWFjaCgoZW50cnksIHBhdGgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCguLi5lbnRyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQoRVYuQUxMLCAuLi5lbnRyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wZW5kaW5nVW5saW5rcy5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIHR5cGVvZiBvcHRzLmF0b21pYyA9PT0gJ251bWJlcicgPyBvcHRzLmF0b21pYyA6IDEwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXZlbnQgPT09IEVWLkFERCAmJiB0aGlzLl9wZW5kaW5nVW5saW5rcy5oYXMocGF0aCkpIHtcbiAgICAgICAgICAgICAgICBldmVudCA9IEVWLkNIQU5HRTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wZW5kaW5nVW5saW5rcy5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGF3ZiAmJiAoZXZlbnQgPT09IEVWLkFERCB8fCBldmVudCA9PT0gRVYuQ0hBTkdFKSAmJiB0aGlzLl9yZWFkeUVtaXR0ZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGF3ZkVtaXQgPSAoZXJyLCBzdGF0cykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQgPSBFVi5FUlJPUjtcbiAgICAgICAgICAgICAgICAgICAgYXJnc1swXSA9IGVycjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0V2l0aEFsbChldmVudCwgYXJncyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRzKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHN0YXRzIGRvZXNuJ3QgZXhpc3QgdGhlIGZpbGUgbXVzdCBoYXZlIGJlZW4gZGVsZXRlZFxuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzWzFdID0gc3RhdHM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzLnB1c2goc3RhdHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdFdpdGhBbGwoZXZlbnQsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLl9hd2FpdFdyaXRlRmluaXNoKHBhdGgsIGF3Zi5zdGFiaWxpdHlUaHJlc2hvbGQsIGV2ZW50LCBhd2ZFbWl0KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChldmVudCA9PT0gRVYuQ0hBTkdFKSB7XG4gICAgICAgICAgICBjb25zdCBpc1Rocm90dGxlZCA9ICF0aGlzLl90aHJvdHRsZShFVi5DSEFOR0UsIHBhdGgsIDUwKTtcbiAgICAgICAgICAgIGlmIChpc1Rocm90dGxlZClcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5hbHdheXNTdGF0ICYmXG4gICAgICAgICAgICBzdGF0cyA9PT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAoZXZlbnQgPT09IEVWLkFERCB8fCBldmVudCA9PT0gRVYuQUREX0RJUiB8fCBldmVudCA9PT0gRVYuQ0hBTkdFKSkge1xuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBvcHRzLmN3ZCA/IHN5c1BhdGguam9pbihvcHRzLmN3ZCwgcGF0aCkgOiBwYXRoO1xuICAgICAgICAgICAgbGV0IHN0YXRzO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzdGF0cyA9IGF3YWl0IHN0YXQoZnVsbFBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIC8vIGRvIG5vdGhpbmdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFN1cHByZXNzIGV2ZW50IHdoZW4gZnNfc3RhdCBmYWlscywgdG8gYXZvaWQgc2VuZGluZyB1bmRlZmluZWQgJ3N0YXQnXG4gICAgICAgICAgICBpZiAoIXN0YXRzIHx8IHRoaXMuY2xvc2VkKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGFyZ3MucHVzaChzdGF0cyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbWl0V2l0aEFsbChldmVudCwgYXJncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDb21tb24gaGFuZGxlciBmb3IgZXJyb3JzXG4gICAgICogQHJldHVybnMgVGhlIGVycm9yIGlmIGRlZmluZWQsIG90aGVyd2lzZSB0aGUgdmFsdWUgb2YgdGhlIEZTV2F0Y2hlciBpbnN0YW5jZSdzIGBjbG9zZWRgIGZsYWdcbiAgICAgKi9cbiAgICBfaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICAgICAgY29uc3QgY29kZSA9IGVycm9yICYmIGVycm9yLmNvZGU7XG4gICAgICAgIGlmIChlcnJvciAmJlxuICAgICAgICAgICAgY29kZSAhPT0gJ0VOT0VOVCcgJiZcbiAgICAgICAgICAgIGNvZGUgIT09ICdFTk9URElSJyAmJlxuICAgICAgICAgICAgKCF0aGlzLm9wdGlvbnMuaWdub3JlUGVybWlzc2lvbkVycm9ycyB8fCAoY29kZSAhPT0gJ0VQRVJNJyAmJiBjb2RlICE9PSAnRUFDQ0VTJykpKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoRVYuRVJST1IsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZXJyb3IgfHwgdGhpcy5jbG9zZWQ7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEhlbHBlciB1dGlsaXR5IGZvciB0aHJvdHRsaW5nXG4gICAgICogQHBhcmFtIGFjdGlvblR5cGUgdHlwZSBiZWluZyB0aHJvdHRsZWRcbiAgICAgKiBAcGFyYW0gcGF0aCBiZWluZyBhY3RlZCB1cG9uXG4gICAgICogQHBhcmFtIHRpbWVvdXQgZHVyYXRpb24gb2YgdGltZSB0byBzdXBwcmVzcyBkdXBsaWNhdGUgYWN0aW9uc1xuICAgICAqIEByZXR1cm5zIHRyYWNraW5nIG9iamVjdCBvciBmYWxzZSBpZiBhY3Rpb24gc2hvdWxkIGJlIHN1cHByZXNzZWRcbiAgICAgKi9cbiAgICBfdGhyb3R0bGUoYWN0aW9uVHlwZSwgcGF0aCwgdGltZW91dCkge1xuICAgICAgICBpZiAoIXRoaXMuX3Rocm90dGxlZC5oYXMoYWN0aW9uVHlwZSkpIHtcbiAgICAgICAgICAgIHRoaXMuX3Rocm90dGxlZC5zZXQoYWN0aW9uVHlwZSwgbmV3IE1hcCgpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhY3Rpb24gPSB0aGlzLl90aHJvdHRsZWQuZ2V0KGFjdGlvblR5cGUpO1xuICAgICAgICBpZiAoIWFjdGlvbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCB0aHJvdHRsZScpO1xuICAgICAgICBjb25zdCBhY3Rpb25QYXRoID0gYWN0aW9uLmdldChwYXRoKTtcbiAgICAgICAgaWYgKGFjdGlvblBhdGgpIHtcbiAgICAgICAgICAgIGFjdGlvblBhdGguY291bnQrKztcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgcHJlZmVyLWNvbnN0XG4gICAgICAgIGxldCB0aW1lb3V0T2JqZWN0O1xuICAgICAgICBjb25zdCBjbGVhciA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhY3Rpb24uZ2V0KHBhdGgpO1xuICAgICAgICAgICAgY29uc3QgY291bnQgPSBpdGVtID8gaXRlbS5jb3VudCA6IDA7XG4gICAgICAgICAgICBhY3Rpb24uZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRPYmplY3QpO1xuICAgICAgICAgICAgaWYgKGl0ZW0pXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGl0ZW0udGltZW91dE9iamVjdCk7XG4gICAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH07XG4gICAgICAgIHRpbWVvdXRPYmplY3QgPSBzZXRUaW1lb3V0KGNsZWFyLCB0aW1lb3V0KTtcbiAgICAgICAgY29uc3QgdGhyID0geyB0aW1lb3V0T2JqZWN0LCBjbGVhciwgY291bnQ6IDAgfTtcbiAgICAgICAgYWN0aW9uLnNldChwYXRoLCB0aHIpO1xuICAgICAgICByZXR1cm4gdGhyO1xuICAgIH1cbiAgICBfaW5jclJlYWR5Q291bnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWFkeUNvdW50Kys7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEF3YWl0cyB3cml0ZSBvcGVyYXRpb24gdG8gZmluaXNoLlxuICAgICAqIFBvbGxzIGEgbmV3bHkgY3JlYXRlZCBmaWxlIGZvciBzaXplIHZhcmlhdGlvbnMuIFdoZW4gZmlsZXMgc2l6ZSBkb2VzIG5vdCBjaGFuZ2UgZm9yICd0aHJlc2hvbGQnIG1pbGxpc2Vjb25kcyBjYWxscyBjYWxsYmFjay5cbiAgICAgKiBAcGFyYW0gcGF0aCBiZWluZyBhY3RlZCB1cG9uXG4gICAgICogQHBhcmFtIHRocmVzaG9sZCBUaW1lIGluIG1pbGxpc2Vjb25kcyBhIGZpbGUgc2l6ZSBtdXN0IGJlIGZpeGVkIGJlZm9yZSBhY2tub3dsZWRnaW5nIHdyaXRlIE9QIGlzIGZpbmlzaGVkXG4gICAgICogQHBhcmFtIGV2ZW50XG4gICAgICogQHBhcmFtIGF3ZkVtaXQgQ2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gcmVhZHkgZm9yIGV2ZW50IHRvIGJlIGVtaXR0ZWQuXG4gICAgICovXG4gICAgX2F3YWl0V3JpdGVGaW5pc2gocGF0aCwgdGhyZXNob2xkLCBldmVudCwgYXdmRW1pdCkge1xuICAgICAgICBjb25zdCBhd2YgPSB0aGlzLm9wdGlvbnMuYXdhaXRXcml0ZUZpbmlzaDtcbiAgICAgICAgaWYgKHR5cGVvZiBhd2YgIT09ICdvYmplY3QnKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBwb2xsSW50ZXJ2YWwgPSBhd2YucG9sbEludGVydmFsO1xuICAgICAgICBsZXQgdGltZW91dEhhbmRsZXI7XG4gICAgICAgIGxldCBmdWxsUGF0aCA9IHBhdGg7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuY3dkICYmICFzeXNQYXRoLmlzQWJzb2x1dGUocGF0aCkpIHtcbiAgICAgICAgICAgIGZ1bGxQYXRoID0gc3lzUGF0aC5qb2luKHRoaXMub3B0aW9ucy5jd2QsIHBhdGgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICAgIGNvbnN0IHdyaXRlcyA9IHRoaXMuX3BlbmRpbmdXcml0ZXM7XG4gICAgICAgIGZ1bmN0aW9uIGF3YWl0V3JpdGVGaW5pc2hGbihwcmV2U3RhdCkge1xuICAgICAgICAgICAgc3RhdGNiKGZ1bGxQYXRoLCAoZXJyLCBjdXJTdGF0KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciB8fCAhd3JpdGVzLmhhcyhwYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyICYmIGVyci5jb2RlICE9PSAnRU5PRU5UJylcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3ZkVtaXQoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBub3cgPSBOdW1iZXIobmV3IERhdGUoKSk7XG4gICAgICAgICAgICAgICAgaWYgKHByZXZTdGF0ICYmIGN1clN0YXQuc2l6ZSAhPT0gcHJldlN0YXQuc2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXMuZ2V0KHBhdGgpLmxhc3RDaGFuZ2UgPSBub3c7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHB3ID0gd3JpdGVzLmdldChwYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkZiA9IG5vdyAtIHB3Lmxhc3RDaGFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKGRmID49IHRocmVzaG9sZCkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXMuZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICBhd2ZFbWl0KHVuZGVmaW5lZCwgY3VyU3RhdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0SGFuZGxlciA9IHNldFRpbWVvdXQoYXdhaXRXcml0ZUZpbmlzaEZuLCBwb2xsSW50ZXJ2YWwsIGN1clN0YXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmICghd3JpdGVzLmhhcyhwYXRoKSkge1xuICAgICAgICAgICAgd3JpdGVzLnNldChwYXRoLCB7XG4gICAgICAgICAgICAgICAgbGFzdENoYW5nZTogbm93LFxuICAgICAgICAgICAgICAgIGNhbmNlbFdhaXQ6ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGVyKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV2ZW50O1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRpbWVvdXRIYW5kbGVyID0gc2V0VGltZW91dChhd2FpdFdyaXRlRmluaXNoRm4sIHBvbGxJbnRlcnZhbCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIHVzZXIgaGFzIGFza2VkIHRvIGlnbm9yZSB0aGlzIHBhdGguXG4gICAgICovXG4gICAgX2lzSWdub3JlZChwYXRoLCBzdGF0cykge1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLmF0b21pYyAmJiBET1RfUkUudGVzdChwYXRoKSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBpZiAoIXRoaXMuX3VzZXJJZ25vcmVkKSB7XG4gICAgICAgICAgICBjb25zdCB7IGN3ZCB9ID0gdGhpcy5vcHRpb25zO1xuICAgICAgICAgICAgY29uc3QgaWduID0gdGhpcy5vcHRpb25zLmlnbm9yZWQ7XG4gICAgICAgICAgICBjb25zdCBpZ25vcmVkID0gKGlnbiB8fCBbXSkubWFwKG5vcm1hbGl6ZUlnbm9yZWQoY3dkKSk7XG4gICAgICAgICAgICBjb25zdCBpZ25vcmVkUGF0aHMgPSBbLi4udGhpcy5faWdub3JlZFBhdGhzXTtcbiAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBbLi4uaWdub3JlZFBhdGhzLm1hcChub3JtYWxpemVJZ25vcmVkKGN3ZCkpLCAuLi5pZ25vcmVkXTtcbiAgICAgICAgICAgIHRoaXMuX3VzZXJJZ25vcmVkID0gYW55bWF0Y2gobGlzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fdXNlcklnbm9yZWQocGF0aCwgc3RhdHMpO1xuICAgIH1cbiAgICBfaXNudElnbm9yZWQocGF0aCwgc3RhdCkge1xuICAgICAgICByZXR1cm4gIXRoaXMuX2lzSWdub3JlZChwYXRoLCBzdGF0KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUHJvdmlkZXMgYSBzZXQgb2YgY29tbW9uIGhlbHBlcnMgYW5kIHByb3BlcnRpZXMgcmVsYXRpbmcgdG8gc3ltbGluayBoYW5kbGluZy5cbiAgICAgKiBAcGFyYW0gcGF0aCBmaWxlIG9yIGRpcmVjdG9yeSBwYXR0ZXJuIGJlaW5nIHdhdGNoZWRcbiAgICAgKi9cbiAgICBfZ2V0V2F0Y2hIZWxwZXJzKHBhdGgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXYXRjaEhlbHBlcihwYXRoLCB0aGlzLm9wdGlvbnMuZm9sbG93U3ltbGlua3MsIHRoaXMpO1xuICAgIH1cbiAgICAvLyBEaXJlY3RvcnkgaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLyoqXG4gICAgICogUHJvdmlkZXMgZGlyZWN0b3J5IHRyYWNraW5nIG9iamVjdHNcbiAgICAgKiBAcGFyYW0gZGlyZWN0b3J5IHBhdGggb2YgdGhlIGRpcmVjdG9yeVxuICAgICAqL1xuICAgIF9nZXRXYXRjaGVkRGlyKGRpcmVjdG9yeSkge1xuICAgICAgICBjb25zdCBkaXIgPSBzeXNQYXRoLnJlc29sdmUoZGlyZWN0b3J5KTtcbiAgICAgICAgaWYgKCF0aGlzLl93YXRjaGVkLmhhcyhkaXIpKVxuICAgICAgICAgICAgdGhpcy5fd2F0Y2hlZC5zZXQoZGlyLCBuZXcgRGlyRW50cnkoZGlyLCB0aGlzLl9ib3VuZFJlbW92ZSkpO1xuICAgICAgICByZXR1cm4gdGhpcy5fd2F0Y2hlZC5nZXQoZGlyKTtcbiAgICB9XG4gICAgLy8gRmlsZSBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tXG4gICAgLyoqXG4gICAgICogQ2hlY2sgZm9yIHJlYWQgcGVybWlzc2lvbnM6IGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMTc4MTQwNC8xMzU4NDA1XG4gICAgICovXG4gICAgX2hhc1JlYWRQZXJtaXNzaW9ucyhzdGF0cykge1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLmlnbm9yZVBlcm1pc3Npb25FcnJvcnMpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIEJvb2xlYW4oTnVtYmVyKHN0YXRzLm1vZGUpICYgMG80MDApO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGVtaXR0aW5nIHVubGluayBldmVudHMgZm9yXG4gICAgICogZmlsZXMgYW5kIGRpcmVjdG9yaWVzLCBhbmQgdmlhIHJlY3Vyc2lvbiwgZm9yXG4gICAgICogZmlsZXMgYW5kIGRpcmVjdG9yaWVzIHdpdGhpbiBkaXJlY3RvcmllcyB0aGF0IGFyZSB1bmxpbmtlZFxuICAgICAqIEBwYXJhbSBkaXJlY3Rvcnkgd2l0aGluIHdoaWNoIHRoZSBmb2xsb3dpbmcgaXRlbSBpcyBsb2NhdGVkXG4gICAgICogQHBhcmFtIGl0ZW0gICAgICBiYXNlIHBhdGggb2YgaXRlbS9kaXJlY3RvcnlcbiAgICAgKi9cbiAgICBfcmVtb3ZlKGRpcmVjdG9yeSwgaXRlbSwgaXNEaXJlY3RvcnkpIHtcbiAgICAgICAgLy8gaWYgd2hhdCBpcyBiZWluZyBkZWxldGVkIGlzIGEgZGlyZWN0b3J5LCBnZXQgdGhhdCBkaXJlY3RvcnkncyBwYXRoc1xuICAgICAgICAvLyBmb3IgcmVjdXJzaXZlIGRlbGV0aW5nIGFuZCBjbGVhbmluZyBvZiB3YXRjaGVkIG9iamVjdFxuICAgICAgICAvLyBpZiBpdCBpcyBub3QgYSBkaXJlY3RvcnksIG5lc3RlZERpcmVjdG9yeUNoaWxkcmVuIHdpbGwgYmUgZW1wdHkgYXJyYXlcbiAgICAgICAgY29uc3QgcGF0aCA9IHN5c1BhdGguam9pbihkaXJlY3RvcnksIGl0ZW0pO1xuICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHN5c1BhdGgucmVzb2x2ZShwYXRoKTtcbiAgICAgICAgaXNEaXJlY3RvcnkgPVxuICAgICAgICAgICAgaXNEaXJlY3RvcnkgIT0gbnVsbCA/IGlzRGlyZWN0b3J5IDogdGhpcy5fd2F0Y2hlZC5oYXMocGF0aCkgfHwgdGhpcy5fd2F0Y2hlZC5oYXMoZnVsbFBhdGgpO1xuICAgICAgICAvLyBwcmV2ZW50IGR1cGxpY2F0ZSBoYW5kbGluZyBpbiBjYXNlIG9mIGFycml2aW5nIGhlcmUgbmVhcmx5IHNpbXVsdGFuZW91c2x5XG4gICAgICAgIC8vIHZpYSBtdWx0aXBsZSBwYXRocyAoc3VjaCBhcyBfaGFuZGxlRmlsZSBhbmQgX2hhbmRsZURpcilcbiAgICAgICAgaWYgKCF0aGlzLl90aHJvdHRsZSgncmVtb3ZlJywgcGF0aCwgMTAwKSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgLy8gaWYgdGhlIG9ubHkgd2F0Y2hlZCBmaWxlIGlzIHJlbW92ZWQsIHdhdGNoIGZvciBpdHMgcmV0dXJuXG4gICAgICAgIGlmICghaXNEaXJlY3RvcnkgJiYgdGhpcy5fd2F0Y2hlZC5zaXplID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLmFkZChkaXJlY3RvcnksIGl0ZW0sIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoaXMgd2lsbCBjcmVhdGUgYSBuZXcgZW50cnkgaW4gdGhlIHdhdGNoZWQgb2JqZWN0IGluIGVpdGhlciBjYXNlXG4gICAgICAgIC8vIHNvIHdlIGdvdCB0byBkbyB0aGUgZGlyZWN0b3J5IGNoZWNrIGJlZm9yZWhhbmRcbiAgICAgICAgY29uc3Qgd3AgPSB0aGlzLl9nZXRXYXRjaGVkRGlyKHBhdGgpO1xuICAgICAgICBjb25zdCBuZXN0ZWREaXJlY3RvcnlDaGlsZHJlbiA9IHdwLmdldENoaWxkcmVuKCk7XG4gICAgICAgIC8vIFJlY3Vyc2l2ZWx5IHJlbW92ZSBjaGlsZHJlbiBkaXJlY3RvcmllcyAvIGZpbGVzLlxuICAgICAgICBuZXN0ZWREaXJlY3RvcnlDaGlsZHJlbi5mb3JFYWNoKChuZXN0ZWQpID0+IHRoaXMuX3JlbW92ZShwYXRoLCBuZXN0ZWQpKTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgaXRlbSB3YXMgb24gdGhlIHdhdGNoZWQgbGlzdCBhbmQgcmVtb3ZlIGl0XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuX2dldFdhdGNoZWREaXIoZGlyZWN0b3J5KTtcbiAgICAgICAgY29uc3Qgd2FzVHJhY2tlZCA9IHBhcmVudC5oYXMoaXRlbSk7XG4gICAgICAgIHBhcmVudC5yZW1vdmUoaXRlbSk7XG4gICAgICAgIC8vIEZpeGVzIGlzc3VlICMxMDQyIC0+IFJlbGF0aXZlIHBhdGhzIHdlcmUgZGV0ZWN0ZWQgYW5kIGFkZGVkIGFzIHN5bWxpbmtzXG4gICAgICAgIC8vIChodHRwczovL2dpdGh1Yi5jb20vcGF1bG1pbGxyL2Nob2tpZGFyL2Jsb2IvZTE3NTNkZGJjOTU3MWJkYzMzYjRhNGFmMTcyZDUyY2I2ZTYxMWMxMC9saWIvbm9kZWZzLWhhbmRsZXIuanMjTDYxMiksXG4gICAgICAgIC8vIGJ1dCBuZXZlciByZW1vdmVkIGZyb20gdGhlIG1hcCBpbiBjYXNlIHRoZSBwYXRoIHdhcyBkZWxldGVkLlxuICAgICAgICAvLyBUaGlzIGxlYWRzIHRvIGFuIGluY29ycmVjdCBzdGF0ZSBpZiB0aGUgcGF0aCB3YXMgcmVjcmVhdGVkOlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGF1bG1pbGxyL2Nob2tpZGFyL2Jsb2IvZTE3NTNkZGJjOTU3MWJkYzMzYjRhNGFmMTcyZDUyY2I2ZTYxMWMxMC9saWIvbm9kZWZzLWhhbmRsZXIuanMjTDU1M1xuICAgICAgICBpZiAodGhpcy5fc3ltbGlua1BhdGhzLmhhcyhmdWxsUGF0aCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3N5bWxpbmtQYXRocy5kZWxldGUoZnVsbFBhdGgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHdlIHdhaXQgZm9yIHRoaXMgZmlsZSB0byBiZSBmdWxseSB3cml0dGVuLCBjYW5jZWwgdGhlIHdhaXQuXG4gICAgICAgIGxldCByZWxQYXRoID0gcGF0aDtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5jd2QpXG4gICAgICAgICAgICByZWxQYXRoID0gc3lzUGF0aC5yZWxhdGl2ZSh0aGlzLm9wdGlvbnMuY3dkLCBwYXRoKTtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5hd2FpdFdyaXRlRmluaXNoICYmIHRoaXMuX3BlbmRpbmdXcml0ZXMuaGFzKHJlbFBhdGgpKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudCA9IHRoaXMuX3BlbmRpbmdXcml0ZXMuZ2V0KHJlbFBhdGgpLmNhbmNlbFdhaXQoKTtcbiAgICAgICAgICAgIGlmIChldmVudCA9PT0gRVYuQUREKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgRW50cnkgd2lsbCBlaXRoZXIgYmUgYSBkaXJlY3RvcnkgdGhhdCBqdXN0IGdvdCByZW1vdmVkXG4gICAgICAgIC8vIG9yIGEgYm9ndXMgZW50cnkgdG8gYSBmaWxlLCBpbiBlaXRoZXIgY2FzZSB3ZSBoYXZlIHRvIHJlbW92ZSBpdFxuICAgICAgICB0aGlzLl93YXRjaGVkLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgdGhpcy5fd2F0Y2hlZC5kZWxldGUoZnVsbFBhdGgpO1xuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBpc0RpcmVjdG9yeSA/IEVWLlVOTElOS19ESVIgOiBFVi5VTkxJTks7XG4gICAgICAgIGlmICh3YXNUcmFja2VkICYmICF0aGlzLl9pc0lnbm9yZWQocGF0aCkpXG4gICAgICAgICAgICB0aGlzLl9lbWl0KGV2ZW50TmFtZSwgcGF0aCk7XG4gICAgICAgIC8vIEF2b2lkIGNvbmZsaWN0cyBpZiB3ZSBsYXRlciBjcmVhdGUgYW5vdGhlciBmaWxlIHdpdGggdGhlIHNhbWUgbmFtZVxuICAgICAgICB0aGlzLl9jbG9zZVBhdGgocGF0aCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENsb3NlcyBhbGwgd2F0Y2hlcnMgZm9yIGEgcGF0aFxuICAgICAqL1xuICAgIF9jbG9zZVBhdGgocGF0aCkge1xuICAgICAgICB0aGlzLl9jbG9zZUZpbGUocGF0aCk7XG4gICAgICAgIGNvbnN0IGRpciA9IHN5c1BhdGguZGlybmFtZShwYXRoKTtcbiAgICAgICAgdGhpcy5fZ2V0V2F0Y2hlZERpcihkaXIpLnJlbW92ZShzeXNQYXRoLmJhc2VuYW1lKHBhdGgpKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2xvc2VzIG9ubHkgZmlsZS1zcGVjaWZpYyB3YXRjaGVyc1xuICAgICAqL1xuICAgIF9jbG9zZUZpbGUocGF0aCkge1xuICAgICAgICBjb25zdCBjbG9zZXJzID0gdGhpcy5fY2xvc2Vycy5nZXQocGF0aCk7XG4gICAgICAgIGlmICghY2xvc2VycylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY2xvc2Vycy5mb3JFYWNoKChjbG9zZXIpID0+IGNsb3NlcigpKTtcbiAgICAgICAgdGhpcy5fY2xvc2Vycy5kZWxldGUocGF0aCk7XG4gICAgfVxuICAgIF9hZGRQYXRoQ2xvc2VyKHBhdGgsIGNsb3Nlcikge1xuICAgICAgICBpZiAoIWNsb3NlcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgbGV0IGxpc3QgPSB0aGlzLl9jbG9zZXJzLmdldChwYXRoKTtcbiAgICAgICAgaWYgKCFsaXN0KSB7XG4gICAgICAgICAgICBsaXN0ID0gW107XG4gICAgICAgICAgICB0aGlzLl9jbG9zZXJzLnNldChwYXRoLCBsaXN0KTtcbiAgICAgICAgfVxuICAgICAgICBsaXN0LnB1c2goY2xvc2VyKTtcbiAgICB9XG4gICAgX3JlYWRkaXJwKHJvb3QsIG9wdHMpIHtcbiAgICAgICAgaWYgKHRoaXMuY2xvc2VkKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBvcHRpb25zID0geyB0eXBlOiBFVi5BTEwsIGFsd2F5c1N0YXQ6IHRydWUsIGxzdGF0OiB0cnVlLCAuLi5vcHRzLCBkZXB0aDogMCB9O1xuICAgICAgICBsZXQgc3RyZWFtID0gcmVhZGRpcnAocm9vdCwgb3B0aW9ucyk7XG4gICAgICAgIHRoaXMuX3N0cmVhbXMuYWRkKHN0cmVhbSk7XG4gICAgICAgIHN0cmVhbS5vbmNlKFNUUl9DTE9TRSwgKCkgPT4ge1xuICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICB9KTtcbiAgICAgICAgc3RyZWFtLm9uY2UoU1RSX0VORCwgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHN0cmVhbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0cmVhbXMuZGVsZXRlKHN0cmVhbSk7XG4gICAgICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN0cmVhbTtcbiAgICB9XG59XG4vKipcbiAqIEluc3RhbnRpYXRlcyB3YXRjaGVyIHdpdGggcGF0aHMgdG8gYmUgdHJhY2tlZC5cbiAqIEBwYXJhbSBwYXRocyBmaWxlIC8gZGlyZWN0b3J5IHBhdGhzXG4gKiBAcGFyYW0gb3B0aW9ucyBvcHRzLCBzdWNoIGFzIGBhdG9taWNgLCBgYXdhaXRXcml0ZUZpbmlzaGAsIGBpZ25vcmVkYCwgYW5kIG90aGVyc1xuICogQHJldHVybnMgYW4gaW5zdGFuY2Ugb2YgRlNXYXRjaGVyIGZvciBjaGFpbmluZy5cbiAqIEBleGFtcGxlXG4gKiBjb25zdCB3YXRjaGVyID0gd2F0Y2goJy4nKS5vbignYWxsJywgKGV2ZW50LCBwYXRoKSA9PiB7IGNvbnNvbGUubG9nKGV2ZW50LCBwYXRoKTsgfSk7XG4gKiB3YXRjaCgnLicsIHsgYXRvbWljOiB0cnVlLCBhd2FpdFdyaXRlRmluaXNoOiB0cnVlLCBpZ25vcmVkOiAoZiwgc3RhdHMpID0+IHN0YXRzPy5pc0ZpbGUoKSAmJiAhZi5lbmRzV2l0aCgnLmpzJykgfSlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGNoKHBhdGhzLCBvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCB3YXRjaGVyID0gbmV3IEZTV2F0Y2hlcihvcHRpb25zKTtcbiAgICB3YXRjaGVyLmFkZChwYXRocyk7XG4gICAgcmV0dXJuIHdhdGNoZXI7XG59XG5leHBvcnQgZGVmYXVsdCB7IHdhdGNoLCBGU1dhdGNoZXIgfTtcbiIsICJpbXBvcnQgeyBzdGF0LCBsc3RhdCwgcmVhZGRpciwgcmVhbHBhdGggfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJztcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSAnbm9kZTpzdHJlYW0nO1xuaW1wb3J0IHsgcmVzb2x2ZSBhcyBwcmVzb2x2ZSwgcmVsYXRpdmUgYXMgcHJlbGF0aXZlLCBqb2luIGFzIHBqb2luLCBzZXAgYXMgcHNlcCB9IGZyb20gJ25vZGU6cGF0aCc7XG5leHBvcnQgY29uc3QgRW50cnlUeXBlcyA9IHtcbiAgICBGSUxFX1RZUEU6ICdmaWxlcycsXG4gICAgRElSX1RZUEU6ICdkaXJlY3RvcmllcycsXG4gICAgRklMRV9ESVJfVFlQRTogJ2ZpbGVzX2RpcmVjdG9yaWVzJyxcbiAgICBFVkVSWVRISU5HX1RZUEU6ICdhbGwnLFxufTtcbmNvbnN0IGRlZmF1bHRPcHRpb25zID0ge1xuICAgIHJvb3Q6ICcuJyxcbiAgICBmaWxlRmlsdGVyOiAoX2VudHJ5SW5mbykgPT4gdHJ1ZSxcbiAgICBkaXJlY3RvcnlGaWx0ZXI6IChfZW50cnlJbmZvKSA9PiB0cnVlLFxuICAgIHR5cGU6IEVudHJ5VHlwZXMuRklMRV9UWVBFLFxuICAgIGxzdGF0OiBmYWxzZSxcbiAgICBkZXB0aDogMjE0NzQ4MzY0OCxcbiAgICBhbHdheXNTdGF0OiBmYWxzZSxcbiAgICBoaWdoV2F0ZXJNYXJrOiA0MDk2LFxufTtcbk9iamVjdC5mcmVlemUoZGVmYXVsdE9wdGlvbnMpO1xuY29uc3QgUkVDVVJTSVZFX0VSUk9SX0NPREUgPSAnUkVBRERJUlBfUkVDVVJTSVZFX0VSUk9SJztcbmNvbnN0IE5PUk1BTF9GTE9XX0VSUk9SUyA9IG5ldyBTZXQoWydFTk9FTlQnLCAnRVBFUk0nLCAnRUFDQ0VTJywgJ0VMT09QJywgUkVDVVJTSVZFX0VSUk9SX0NPREVdKTtcbmNvbnN0IEFMTF9UWVBFUyA9IFtcbiAgICBFbnRyeVR5cGVzLkRJUl9UWVBFLFxuICAgIEVudHJ5VHlwZXMuRVZFUllUSElOR19UWVBFLFxuICAgIEVudHJ5VHlwZXMuRklMRV9ESVJfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkZJTEVfVFlQRSxcbl07XG5jb25zdCBESVJfVFlQRVMgPSBuZXcgU2V0KFtcbiAgICBFbnRyeVR5cGVzLkRJUl9UWVBFLFxuICAgIEVudHJ5VHlwZXMuRVZFUllUSElOR19UWVBFLFxuICAgIEVudHJ5VHlwZXMuRklMRV9ESVJfVFlQRSxcbl0pO1xuY29uc3QgRklMRV9UWVBFUyA9IG5ldyBTZXQoW1xuICAgIEVudHJ5VHlwZXMuRVZFUllUSElOR19UWVBFLFxuICAgIEVudHJ5VHlwZXMuRklMRV9ESVJfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkZJTEVfVFlQRSxcbl0pO1xuY29uc3QgaXNOb3JtYWxGbG93RXJyb3IgPSAoZXJyb3IpID0+IE5PUk1BTF9GTE9XX0VSUk9SUy5oYXMoZXJyb3IuY29kZSk7XG5jb25zdCB3YW50QmlnaW50RnNTdGF0cyA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMic7XG5jb25zdCBlbXB0eUZuID0gKF9lbnRyeUluZm8pID0+IHRydWU7XG5jb25zdCBub3JtYWxpemVGaWx0ZXIgPSAoZmlsdGVyKSA9PiB7XG4gICAgaWYgKGZpbHRlciA9PT0gdW5kZWZpbmVkKVxuICAgICAgICByZXR1cm4gZW1wdHlGbjtcbiAgICBpZiAodHlwZW9mIGZpbHRlciA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgcmV0dXJuIGZpbHRlcjtcbiAgICBpZiAodHlwZW9mIGZpbHRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29uc3QgZmwgPSBmaWx0ZXIudHJpbSgpO1xuICAgICAgICByZXR1cm4gKGVudHJ5KSA9PiBlbnRyeS5iYXNlbmFtZSA9PT0gZmw7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGZpbHRlcikpIHtcbiAgICAgICAgY29uc3QgdHJJdGVtcyA9IGZpbHRlci5tYXAoKGl0ZW0pID0+IGl0ZW0udHJpbSgpKTtcbiAgICAgICAgcmV0dXJuIChlbnRyeSkgPT4gdHJJdGVtcy5zb21lKChmKSA9PiBlbnRyeS5iYXNlbmFtZSA9PT0gZik7XG4gICAgfVxuICAgIHJldHVybiBlbXB0eUZuO1xufTtcbi8qKiBSZWFkYWJsZSByZWFkZGlyIHN0cmVhbSwgZW1pdHRpbmcgbmV3IGZpbGVzIGFzIHRoZXkncmUgYmVpbmcgbGlzdGVkLiAqL1xuZXhwb3J0IGNsYXNzIFJlYWRkaXJwU3RyZWFtIGV4dGVuZHMgUmVhZGFibGUge1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMgPSB7fSkge1xuICAgICAgICBzdXBlcih7XG4gICAgICAgICAgICBvYmplY3RNb2RlOiB0cnVlLFxuICAgICAgICAgICAgYXV0b0Rlc3Ryb3k6IHRydWUsXG4gICAgICAgICAgICBoaWdoV2F0ZXJNYXJrOiBvcHRpb25zLmhpZ2hXYXRlck1hcmssXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBvcHRzID0geyAuLi5kZWZhdWx0T3B0aW9ucywgLi4ub3B0aW9ucyB9O1xuICAgICAgICBjb25zdCB7IHJvb3QsIHR5cGUgfSA9IG9wdHM7XG4gICAgICAgIHRoaXMuX2ZpbGVGaWx0ZXIgPSBub3JtYWxpemVGaWx0ZXIob3B0cy5maWxlRmlsdGVyKTtcbiAgICAgICAgdGhpcy5fZGlyZWN0b3J5RmlsdGVyID0gbm9ybWFsaXplRmlsdGVyKG9wdHMuZGlyZWN0b3J5RmlsdGVyKTtcbiAgICAgICAgY29uc3Qgc3RhdE1ldGhvZCA9IG9wdHMubHN0YXQgPyBsc3RhdCA6IHN0YXQ7XG4gICAgICAgIC8vIFVzZSBiaWdpbnQgc3RhdHMgaWYgaXQncyB3aW5kb3dzIGFuZCBzdGF0KCkgc3VwcG9ydHMgb3B0aW9ucyAobm9kZSAxMCspLlxuICAgICAgICBpZiAod2FudEJpZ2ludEZzU3RhdHMpIHtcbiAgICAgICAgICAgIHRoaXMuX3N0YXQgPSAocGF0aCkgPT4gc3RhdE1ldGhvZChwYXRoLCB7IGJpZ2ludDogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3N0YXQgPSBzdGF0TWV0aG9kO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX21heERlcHRoID0gb3B0cy5kZXB0aCA/PyBkZWZhdWx0T3B0aW9ucy5kZXB0aDtcbiAgICAgICAgdGhpcy5fd2FudHNEaXIgPSB0eXBlID8gRElSX1RZUEVTLmhhcyh0eXBlKSA6IGZhbHNlO1xuICAgICAgICB0aGlzLl93YW50c0ZpbGUgPSB0eXBlID8gRklMRV9UWVBFUy5oYXModHlwZSkgOiBmYWxzZTtcbiAgICAgICAgdGhpcy5fd2FudHNFdmVyeXRoaW5nID0gdHlwZSA9PT0gRW50cnlUeXBlcy5FVkVSWVRISU5HX1RZUEU7XG4gICAgICAgIHRoaXMuX3Jvb3QgPSBwcmVzb2x2ZShyb290KTtcbiAgICAgICAgdGhpcy5faXNEaXJlbnQgPSAhb3B0cy5hbHdheXNTdGF0O1xuICAgICAgICB0aGlzLl9zdGF0c1Byb3AgPSB0aGlzLl9pc0RpcmVudCA/ICdkaXJlbnQnIDogJ3N0YXRzJztcbiAgICAgICAgdGhpcy5fcmRPcHRpb25zID0geyBlbmNvZGluZzogJ3V0ZjgnLCB3aXRoRmlsZVR5cGVzOiB0aGlzLl9pc0RpcmVudCB9O1xuICAgICAgICAvLyBMYXVuY2ggc3RyZWFtIHdpdGggb25lIHBhcmVudCwgdGhlIHJvb3QgZGlyLlxuICAgICAgICB0aGlzLnBhcmVudHMgPSBbdGhpcy5fZXhwbG9yZURpcihyb290LCAxKV07XG4gICAgICAgIHRoaXMucmVhZGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnBhcmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgYXN5bmMgX3JlYWQoYmF0Y2gpIHtcbiAgICAgICAgaWYgKHRoaXMucmVhZGluZylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWFkaW5nID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHdoaWxlICghdGhpcy5kZXN0cm95ZWQgJiYgYmF0Y2ggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyID0gdGhpcy5wYXJlbnQ7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsID0gcGFyICYmIHBhci5maWxlcztcbiAgICAgICAgICAgICAgICBpZiAoZmlsICYmIGZpbC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgcGF0aCwgZGVwdGggfSA9IHBhcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2xpY2UgPSBmaWwuc3BsaWNlKDAsIGJhdGNoKS5tYXAoKGRpcmVudCkgPT4gdGhpcy5fZm9ybWF0RW50cnkoZGlyZW50LCBwYXRoKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBQcm9taXNlLmFsbChzbGljZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgYXdhaXRlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFlbnRyeSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRlc3Ryb3llZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnRyeVR5cGUgPSBhd2FpdCB0aGlzLl9nZXRFbnRyeVR5cGUoZW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVudHJ5VHlwZSA9PT0gJ2RpcmVjdG9yeScgJiYgdGhpcy5fZGlyZWN0b3J5RmlsdGVyKGVudHJ5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aCA8PSB0aGlzLl9tYXhEZXB0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcmVudHMucHVzaCh0aGlzLl9leHBsb3JlRGlyKGVudHJ5LmZ1bGxQYXRoLCBkZXB0aCArIDEpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3dhbnRzRGlyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVzaChlbnRyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoKGVudHJ5VHlwZSA9PT0gJ2ZpbGUnIHx8IHRoaXMuX2luY2x1ZGVBc0ZpbGUoZW50cnkpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2ZpbGVGaWx0ZXIoZW50cnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3dhbnRzRmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1c2goZW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5wYXJlbnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXNoKG51bGwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJlbnQgPSBhd2FpdCBwYXJlbnQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRlc3Ryb3llZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3koZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5yZWFkaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYXN5bmMgX2V4cGxvcmVEaXIocGF0aCwgZGVwdGgpIHtcbiAgICAgICAgbGV0IGZpbGVzO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmlsZXMgPSBhd2FpdCByZWFkZGlyKHBhdGgsIHRoaXMuX3JkT3B0aW9ucyk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLl9vbkVycm9yKGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBmaWxlcywgZGVwdGgsIHBhdGggfTtcbiAgICB9XG4gICAgYXN5bmMgX2Zvcm1hdEVudHJ5KGRpcmVudCwgcGF0aCkge1xuICAgICAgICBsZXQgZW50cnk7XG4gICAgICAgIGNvbnN0IGJhc2VuYW1lID0gdGhpcy5faXNEaXJlbnQgPyBkaXJlbnQubmFtZSA6IGRpcmVudDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcHJlc29sdmUocGpvaW4ocGF0aCwgYmFzZW5hbWUpKTtcbiAgICAgICAgICAgIGVudHJ5ID0geyBwYXRoOiBwcmVsYXRpdmUodGhpcy5fcm9vdCwgZnVsbFBhdGgpLCBmdWxsUGF0aCwgYmFzZW5hbWUgfTtcbiAgICAgICAgICAgIGVudHJ5W3RoaXMuX3N0YXRzUHJvcF0gPSB0aGlzLl9pc0RpcmVudCA/IGRpcmVudCA6IGF3YWl0IHRoaXMuX3N0YXQoZnVsbFBhdGgpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHRoaXMuX29uRXJyb3IoZXJyKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgfVxuICAgIF9vbkVycm9yKGVycikge1xuICAgICAgICBpZiAoaXNOb3JtYWxGbG93RXJyb3IoZXJyKSAmJiAhdGhpcy5kZXN0cm95ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnd2FybicsIGVycik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3koZXJyKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhc3luYyBfZ2V0RW50cnlUeXBlKGVudHJ5KSB7XG4gICAgICAgIC8vIGVudHJ5IG1heSBiZSB1bmRlZmluZWQsIGJlY2F1c2UgYSB3YXJuaW5nIG9yIGFuIGVycm9yIHdlcmUgZW1pdHRlZFxuICAgICAgICAvLyBhbmQgdGhlIHN0YXRzUHJvcCBpcyB1bmRlZmluZWRcbiAgICAgICAgaWYgKCFlbnRyeSAmJiB0aGlzLl9zdGF0c1Byb3AgaW4gZW50cnkpIHtcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGF0cyA9IGVudHJ5W3RoaXMuX3N0YXRzUHJvcF07XG4gICAgICAgIGlmIChzdGF0cy5pc0ZpbGUoKSlcbiAgICAgICAgICAgIHJldHVybiAnZmlsZSc7XG4gICAgICAgIGlmIChzdGF0cy5pc0RpcmVjdG9yeSgpKVxuICAgICAgICAgICAgcmV0dXJuICdkaXJlY3RvcnknO1xuICAgICAgICBpZiAoc3RhdHMgJiYgc3RhdHMuaXNTeW1ib2xpY0xpbmsoKSkge1xuICAgICAgICAgICAgY29uc3QgZnVsbCA9IGVudHJ5LmZ1bGxQYXRoO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeVJlYWxQYXRoID0gYXdhaXQgcmVhbHBhdGgoZnVsbCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnlSZWFsUGF0aFN0YXRzID0gYXdhaXQgbHN0YXQoZW50cnlSZWFsUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKGVudHJ5UmVhbFBhdGhTdGF0cy5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ2ZpbGUnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZW50cnlSZWFsUGF0aFN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGVuID0gZW50cnlSZWFsUGF0aC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmdWxsLnN0YXJ0c1dpdGgoZW50cnlSZWFsUGF0aCkgJiYgZnVsbC5zdWJzdHIobGVuLCAxKSA9PT0gcHNlcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjdXJzaXZlRXJyb3IgPSBuZXcgRXJyb3IoYENpcmN1bGFyIHN5bWxpbmsgZGV0ZWN0ZWQ6IFwiJHtmdWxsfVwiIHBvaW50cyB0byBcIiR7ZW50cnlSZWFsUGF0aH1cImApO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVjdXJzaXZlRXJyb3IuY29kZSA9IFJFQ1VSU0lWRV9FUlJPUl9DT0RFO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX29uRXJyb3IocmVjdXJzaXZlRXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnZGlyZWN0b3J5JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9vbkVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2luY2x1ZGVBc0ZpbGUoZW50cnkpIHtcbiAgICAgICAgY29uc3Qgc3RhdHMgPSBlbnRyeSAmJiBlbnRyeVt0aGlzLl9zdGF0c1Byb3BdO1xuICAgICAgICByZXR1cm4gc3RhdHMgJiYgdGhpcy5fd2FudHNFdmVyeXRoaW5nICYmICFzdGF0cy5pc0RpcmVjdG9yeSgpO1xuICAgIH1cbn1cbi8qKlxuICogU3RyZWFtaW5nIHZlcnNpb246IFJlYWRzIGFsbCBmaWxlcyBhbmQgZGlyZWN0b3JpZXMgaW4gZ2l2ZW4gcm9vdCByZWN1cnNpdmVseS5cbiAqIENvbnN1bWVzIH5jb25zdGFudCBzbWFsbCBhbW91bnQgb2YgUkFNLlxuICogQHBhcmFtIHJvb3QgUm9vdCBkaXJlY3RvcnlcbiAqIEBwYXJhbSBvcHRpb25zIE9wdGlvbnMgdG8gc3BlY2lmeSByb290IChzdGFydCBkaXJlY3RvcnkpLCBmaWx0ZXJzIGFuZCByZWN1cnNpb24gZGVwdGhcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRkaXJwKHJvb3QsIG9wdGlvbnMgPSB7fSkge1xuICAgIC8vIEB0cy1pZ25vcmVcbiAgICBsZXQgdHlwZSA9IG9wdGlvbnMuZW50cnlUeXBlIHx8IG9wdGlvbnMudHlwZTtcbiAgICBpZiAodHlwZSA9PT0gJ2JvdGgnKVxuICAgICAgICB0eXBlID0gRW50cnlUeXBlcy5GSUxFX0RJUl9UWVBFOyAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eVxuICAgIGlmICh0eXBlKVxuICAgICAgICBvcHRpb25zLnR5cGUgPSB0eXBlO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlYWRkaXJwOiByb290IGFyZ3VtZW50IGlzIHJlcXVpcmVkLiBVc2FnZTogcmVhZGRpcnAocm9vdCwgb3B0aW9ucyknKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIHJvb3QgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3JlYWRkaXJwOiByb290IGFyZ3VtZW50IG11c3QgYmUgYSBzdHJpbmcuIFVzYWdlOiByZWFkZGlycChyb290LCBvcHRpb25zKScpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlICYmICFBTExfVFlQRVMuaW5jbHVkZXModHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGByZWFkZGlycDogSW52YWxpZCB0eXBlIHBhc3NlZC4gVXNlIG9uZSBvZiAke0FMTF9UWVBFUy5qb2luKCcsICcpfWApO1xuICAgIH1cbiAgICBvcHRpb25zLnJvb3QgPSByb290O1xuICAgIHJldHVybiBuZXcgUmVhZGRpcnBTdHJlYW0ob3B0aW9ucyk7XG59XG4vKipcbiAqIFByb21pc2UgdmVyc2lvbjogUmVhZHMgYWxsIGZpbGVzIGFuZCBkaXJlY3RvcmllcyBpbiBnaXZlbiByb290IHJlY3Vyc2l2ZWx5LlxuICogQ29tcGFyZWQgdG8gc3RyZWFtaW5nIHZlcnNpb24sIHdpbGwgY29uc3VtZSBhIGxvdCBvZiBSQU0gZS5nLiB3aGVuIDEgbWlsbGlvbiBmaWxlcyBhcmUgbGlzdGVkLlxuICogQHJldHVybnMgYXJyYXkgb2YgcGF0aHMgYW5kIHRoZWlyIGVudHJ5IGluZm9zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkZGlycFByb21pc2Uocm9vdCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBbXTtcbiAgICAgICAgcmVhZGRpcnAocm9vdCwgb3B0aW9ucylcbiAgICAgICAgICAgIC5vbignZGF0YScsIChlbnRyeSkgPT4gZmlsZXMucHVzaChlbnRyeSkpXG4gICAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHJlc29sdmUoZmlsZXMpKVxuICAgICAgICAgICAgLm9uKCdlcnJvcicsIChlcnJvcikgPT4gcmVqZWN0KGVycm9yKSk7XG4gICAgfSk7XG59XG5leHBvcnQgZGVmYXVsdCByZWFkZGlycDtcbiIsICJpbXBvcnQgeyB3YXRjaEZpbGUsIHVud2F0Y2hGaWxlLCB3YXRjaCBhcyBmc193YXRjaCB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IG9wZW4sIHN0YXQsIGxzdGF0LCByZWFscGF0aCBhcyBmc3JlYWxwYXRoIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0ICogYXMgc3lzUGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHR5cGUgYXMgb3NUeXBlIH0gZnJvbSAnb3MnO1xuZXhwb3J0IGNvbnN0IFNUUl9EQVRBID0gJ2RhdGEnO1xuZXhwb3J0IGNvbnN0IFNUUl9FTkQgPSAnZW5kJztcbmV4cG9ydCBjb25zdCBTVFJfQ0xPU0UgPSAnY2xvc2UnO1xuZXhwb3J0IGNvbnN0IEVNUFRZX0ZOID0gKCkgPT4geyB9O1xuZXhwb3J0IGNvbnN0IElERU5USVRZX0ZOID0gKHZhbCkgPT4gdmFsO1xuY29uc3QgcGwgPSBwcm9jZXNzLnBsYXRmb3JtO1xuZXhwb3J0IGNvbnN0IGlzV2luZG93cyA9IHBsID09PSAnd2luMzInO1xuZXhwb3J0IGNvbnN0IGlzTWFjb3MgPSBwbCA9PT0gJ2Rhcndpbic7XG5leHBvcnQgY29uc3QgaXNMaW51eCA9IHBsID09PSAnbGludXgnO1xuZXhwb3J0IGNvbnN0IGlzRnJlZUJTRCA9IHBsID09PSAnZnJlZWJzZCc7XG5leHBvcnQgY29uc3QgaXNJQk1pID0gb3NUeXBlKCkgPT09ICdPUzQwMCc7XG5leHBvcnQgY29uc3QgRVZFTlRTID0ge1xuICAgIEFMTDogJ2FsbCcsXG4gICAgUkVBRFk6ICdyZWFkeScsXG4gICAgQUREOiAnYWRkJyxcbiAgICBDSEFOR0U6ICdjaGFuZ2UnLFxuICAgIEFERF9ESVI6ICdhZGREaXInLFxuICAgIFVOTElOSzogJ3VubGluaycsXG4gICAgVU5MSU5LX0RJUjogJ3VubGlua0RpcicsXG4gICAgUkFXOiAncmF3JyxcbiAgICBFUlJPUjogJ2Vycm9yJyxcbn07XG5jb25zdCBFViA9IEVWRU5UUztcbmNvbnN0IFRIUk9UVExFX01PREVfV0FUQ0ggPSAnd2F0Y2gnO1xuY29uc3Qgc3RhdE1ldGhvZHMgPSB7IGxzdGF0LCBzdGF0IH07XG5jb25zdCBLRVlfTElTVEVORVJTID0gJ2xpc3RlbmVycyc7XG5jb25zdCBLRVlfRVJSID0gJ2VyckhhbmRsZXJzJztcbmNvbnN0IEtFWV9SQVcgPSAncmF3RW1pdHRlcnMnO1xuY29uc3QgSEFORExFUl9LRVlTID0gW0tFWV9MSVNURU5FUlMsIEtFWV9FUlIsIEtFWV9SQVddO1xuLy8gcHJldHRpZXItaWdub3JlXG5jb25zdCBiaW5hcnlFeHRlbnNpb25zID0gbmV3IFNldChbXG4gICAgJzNkbScsICczZHMnLCAnM2cyJywgJzNncCcsICc3eicsICdhJywgJ2FhYycsICdhZHAnLCAnYWZkZXNpZ24nLCAnYWZwaG90bycsICdhZnB1YicsICdhaScsXG4gICAgJ2FpZicsICdhaWZmJywgJ2FseicsICdhcGUnLCAnYXBrJywgJ2FwcGltYWdlJywgJ2FyJywgJ2FyaicsICdhc2YnLCAnYXUnLCAnYXZpJyxcbiAgICAnYmFrJywgJ2JhbWwnLCAnYmgnLCAnYmluJywgJ2JrJywgJ2JtcCcsICdidGlmJywgJ2J6MicsICdiemlwMicsXG4gICAgJ2NhYicsICdjYWYnLCAnY2dtJywgJ2NsYXNzJywgJ2NteCcsICdjcGlvJywgJ2NyMicsICdjdXInLCAnZGF0JywgJ2RjbScsICdkZWInLCAnZGV4JywgJ2RqdnUnLFxuICAgICdkbGwnLCAnZG1nJywgJ2RuZycsICdkb2MnLCAnZG9jbScsICdkb2N4JywgJ2RvdCcsICdkb3RtJywgJ2RyYScsICdEU19TdG9yZScsICdkc2snLCAnZHRzJyxcbiAgICAnZHRzaGQnLCAnZHZiJywgJ2R3ZycsICdkeGYnLFxuICAgICdlY2VscDQ4MDAnLCAnZWNlbHA3NDcwJywgJ2VjZWxwOTYwMCcsICdlZ2cnLCAnZW9sJywgJ2VvdCcsICdlcHViJywgJ2V4ZScsXG4gICAgJ2Y0dicsICdmYnMnLCAnZmgnLCAnZmxhJywgJ2ZsYWMnLCAnZmxhdHBhaycsICdmbGknLCAnZmx2JywgJ2ZweCcsICdmc3QnLCAnZnZ0JyxcbiAgICAnZzMnLCAnZ2gnLCAnZ2lmJywgJ2dyYWZmbGUnLCAnZ3onLCAnZ3ppcCcsXG4gICAgJ2gyNjEnLCAnaDI2MycsICdoMjY0JywgJ2ljbnMnLCAnaWNvJywgJ2llZicsICdpbWcnLCAnaXBhJywgJ2lzbycsXG4gICAgJ2phcicsICdqcGVnJywgJ2pwZycsICdqcGd2JywgJ2pwbScsICdqeHInLCAna2V5JywgJ2t0eCcsXG4gICAgJ2xoYScsICdsaWInLCAnbHZwJywgJ2x6JywgJ2x6aCcsICdsem1hJywgJ2x6bycsXG4gICAgJ20zdScsICdtNGEnLCAnbTR2JywgJ21hcicsICdtZGknLCAnbWh0JywgJ21pZCcsICdtaWRpJywgJ21qMicsICdta2EnLCAnbWt2JywgJ21tcicsICdtbmcnLFxuICAgICdtb2JpJywgJ21vdicsICdtb3ZpZScsICdtcDMnLFxuICAgICdtcDQnLCAnbXA0YScsICdtcGVnJywgJ21wZycsICdtcGdhJywgJ214dScsXG4gICAgJ25lZicsICducHgnLCAnbnVtYmVycycsICdudXBrZycsXG4gICAgJ28nLCAnb2RwJywgJ29kcycsICdvZHQnLCAnb2dhJywgJ29nZycsICdvZ3YnLCAnb3RmJywgJ290dCcsXG4gICAgJ3BhZ2VzJywgJ3BibScsICdwY3gnLCAncGRiJywgJ3BkZicsICdwZWEnLCAncGdtJywgJ3BpYycsICdwbmcnLCAncG5tJywgJ3BvdCcsICdwb3RtJyxcbiAgICAncG90eCcsICdwcGEnLCAncHBhbScsXG4gICAgJ3BwbScsICdwcHMnLCAncHBzbScsICdwcHN4JywgJ3BwdCcsICdwcHRtJywgJ3BwdHgnLCAncHNkJywgJ3B5YScsICdweWMnLCAncHlvJywgJ3B5dicsXG4gICAgJ3F0JyxcbiAgICAncmFyJywgJ3JhcycsICdyYXcnLCAncmVzb3VyY2VzJywgJ3JnYicsICdyaXAnLCAncmxjJywgJ3JtZicsICdybXZiJywgJ3JwbScsICdydGYnLCAncnonLFxuICAgICdzM20nLCAnczd6JywgJ3NjcHQnLCAnc2dpJywgJ3NoYXInLCAnc25hcCcsICdzaWwnLCAnc2tldGNoJywgJ3NsaycsICdzbXYnLCAnc25rJywgJ3NvJyxcbiAgICAnc3RsJywgJ3N1bycsICdzdWInLCAnc3dmJyxcbiAgICAndGFyJywgJ3RieicsICd0YnoyJywgJ3RnYScsICd0Z3onLCAndGhteCcsICd0aWYnLCAndGlmZicsICd0bHonLCAndHRjJywgJ3R0ZicsICd0eHonLFxuICAgICd1ZGYnLCAndXZoJywgJ3V2aScsICd1dm0nLCAndXZwJywgJ3V2cycsICd1dnUnLFxuICAgICd2aXYnLCAndm9iJyxcbiAgICAnd2FyJywgJ3dhdicsICd3YXgnLCAnd2JtcCcsICd3ZHAnLCAnd2ViYScsICd3ZWJtJywgJ3dlYnAnLCAnd2hsJywgJ3dpbScsICd3bScsICd3bWEnLFxuICAgICd3bXYnLCAnd214JywgJ3dvZmYnLCAnd29mZjInLCAnd3JtJywgJ3d2eCcsXG4gICAgJ3hibScsICd4aWYnLCAneGxhJywgJ3hsYW0nLCAneGxzJywgJ3hsc2InLCAneGxzbScsICd4bHN4JywgJ3hsdCcsICd4bHRtJywgJ3hsdHgnLCAneG0nLFxuICAgICd4bWluZCcsICd4cGknLCAneHBtJywgJ3h3ZCcsICd4eicsXG4gICAgJ3onLCAnemlwJywgJ3ppcHgnLFxuXSk7XG5jb25zdCBpc0JpbmFyeVBhdGggPSAoZmlsZVBhdGgpID0+IGJpbmFyeUV4dGVuc2lvbnMuaGFzKHN5c1BhdGguZXh0bmFtZShmaWxlUGF0aCkuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSk7XG4vLyBUT0RPOiBlbWl0IGVycm9ycyBwcm9wZXJseS4gRXhhbXBsZTogRU1GSUxFIG9uIE1hY29zLlxuY29uc3QgZm9yZWFjaCA9ICh2YWwsIGZuKSA9PiB7XG4gICAgaWYgKHZhbCBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICB2YWwuZm9yRWFjaChmbik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBmbih2YWwpO1xuICAgIH1cbn07XG5jb25zdCBhZGRBbmRDb252ZXJ0ID0gKG1haW4sIHByb3AsIGl0ZW0pID0+IHtcbiAgICBsZXQgY29udGFpbmVyID0gbWFpbltwcm9wXTtcbiAgICBpZiAoIShjb250YWluZXIgaW5zdGFuY2VvZiBTZXQpKSB7XG4gICAgICAgIG1haW5bcHJvcF0gPSBjb250YWluZXIgPSBuZXcgU2V0KFtjb250YWluZXJdKTtcbiAgICB9XG4gICAgY29udGFpbmVyLmFkZChpdGVtKTtcbn07XG5jb25zdCBjbGVhckl0ZW0gPSAoY29udCkgPT4gKGtleSkgPT4ge1xuICAgIGNvbnN0IHNldCA9IGNvbnRba2V5XTtcbiAgICBpZiAoc2V0IGluc3RhbmNlb2YgU2V0KSB7XG4gICAgICAgIHNldC5jbGVhcigpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgZGVsZXRlIGNvbnRba2V5XTtcbiAgICB9XG59O1xuY29uc3QgZGVsRnJvbVNldCA9IChtYWluLCBwcm9wLCBpdGVtKSA9PiB7XG4gICAgY29uc3QgY29udGFpbmVyID0gbWFpbltwcm9wXTtcbiAgICBpZiAoY29udGFpbmVyIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgICAgIGNvbnRhaW5lci5kZWxldGUoaXRlbSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNvbnRhaW5lciA9PT0gaXRlbSkge1xuICAgICAgICBkZWxldGUgbWFpbltwcm9wXTtcbiAgICB9XG59O1xuY29uc3QgaXNFbXB0eVNldCA9ICh2YWwpID0+ICh2YWwgaW5zdGFuY2VvZiBTZXQgPyB2YWwuc2l6ZSA9PT0gMCA6ICF2YWwpO1xuY29uc3QgRnNXYXRjaEluc3RhbmNlcyA9IG5ldyBNYXAoKTtcbi8qKlxuICogSW5zdGFudGlhdGVzIHRoZSBmc193YXRjaCBpbnRlcmZhY2VcbiAqIEBwYXJhbSBwYXRoIHRvIGJlIHdhdGNoZWRcbiAqIEBwYXJhbSBvcHRpb25zIHRvIGJlIHBhc3NlZCB0byBmc193YXRjaFxuICogQHBhcmFtIGxpc3RlbmVyIG1haW4gZXZlbnQgaGFuZGxlclxuICogQHBhcmFtIGVyckhhbmRsZXIgZW1pdHMgaW5mbyBhYm91dCBlcnJvcnNcbiAqIEBwYXJhbSBlbWl0UmF3IGVtaXRzIHJhdyBldmVudCBkYXRhXG4gKiBAcmV0dXJucyB7TmF0aXZlRnNXYXRjaGVyfVxuICovXG5mdW5jdGlvbiBjcmVhdGVGc1dhdGNoSW5zdGFuY2UocGF0aCwgb3B0aW9ucywgbGlzdGVuZXIsIGVyckhhbmRsZXIsIGVtaXRSYXcpIHtcbiAgICBjb25zdCBoYW5kbGVFdmVudCA9IChyYXdFdmVudCwgZXZQYXRoKSA9PiB7XG4gICAgICAgIGxpc3RlbmVyKHBhdGgpO1xuICAgICAgICBlbWl0UmF3KHJhd0V2ZW50LCBldlBhdGgsIHsgd2F0Y2hlZFBhdGg6IHBhdGggfSk7XG4gICAgICAgIC8vIGVtaXQgYmFzZWQgb24gZXZlbnRzIG9jY3VycmluZyBmb3IgZmlsZXMgZnJvbSBhIGRpcmVjdG9yeSdzIHdhdGNoZXIgaW5cbiAgICAgICAgLy8gY2FzZSB0aGUgZmlsZSdzIHdhdGNoZXIgbWlzc2VzIGl0IChhbmQgcmVseSBvbiB0aHJvdHRsaW5nIHRvIGRlLWR1cGUpXG4gICAgICAgIGlmIChldlBhdGggJiYgcGF0aCAhPT0gZXZQYXRoKSB7XG4gICAgICAgICAgICBmc1dhdGNoQnJvYWRjYXN0KHN5c1BhdGgucmVzb2x2ZShwYXRoLCBldlBhdGgpLCBLRVlfTElTVEVORVJTLCBzeXNQYXRoLmpvaW4ocGF0aCwgZXZQYXRoKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBmc193YXRjaChwYXRoLCB7XG4gICAgICAgICAgICBwZXJzaXN0ZW50OiBvcHRpb25zLnBlcnNpc3RlbnQsXG4gICAgICAgIH0sIGhhbmRsZUV2ZW50KTtcbiAgICB9XG4gICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGVyckhhbmRsZXIoZXJyb3IpO1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbn1cbi8qKlxuICogSGVscGVyIGZvciBwYXNzaW5nIGZzX3dhdGNoIGV2ZW50IGRhdGEgdG8gYSBjb2xsZWN0aW9uIG9mIGxpc3RlbmVyc1xuICogQHBhcmFtIGZ1bGxQYXRoIGFic29sdXRlIHBhdGggYm91bmQgdG8gZnNfd2F0Y2ggaW5zdGFuY2VcbiAqL1xuY29uc3QgZnNXYXRjaEJyb2FkY2FzdCA9IChmdWxsUGF0aCwgbGlzdGVuZXJUeXBlLCB2YWwxLCB2YWwyLCB2YWwzKSA9PiB7XG4gICAgY29uc3QgY29udCA9IEZzV2F0Y2hJbnN0YW5jZXMuZ2V0KGZ1bGxQYXRoKTtcbiAgICBpZiAoIWNvbnQpXG4gICAgICAgIHJldHVybjtcbiAgICBmb3JlYWNoKGNvbnRbbGlzdGVuZXJUeXBlXSwgKGxpc3RlbmVyKSA9PiB7XG4gICAgICAgIGxpc3RlbmVyKHZhbDEsIHZhbDIsIHZhbDMpO1xuICAgIH0pO1xufTtcbi8qKlxuICogSW5zdGFudGlhdGVzIHRoZSBmc193YXRjaCBpbnRlcmZhY2Ugb3IgYmluZHMgbGlzdGVuZXJzXG4gKiB0byBhbiBleGlzdGluZyBvbmUgY292ZXJpbmcgdGhlIHNhbWUgZmlsZSBzeXN0ZW0gZW50cnlcbiAqIEBwYXJhbSBwYXRoXG4gKiBAcGFyYW0gZnVsbFBhdGggYWJzb2x1dGUgcGF0aFxuICogQHBhcmFtIG9wdGlvbnMgdG8gYmUgcGFzc2VkIHRvIGZzX3dhdGNoXG4gKiBAcGFyYW0gaGFuZGxlcnMgY29udGFpbmVyIGZvciBldmVudCBsaXN0ZW5lciBmdW5jdGlvbnNcbiAqL1xuY29uc3Qgc2V0RnNXYXRjaExpc3RlbmVyID0gKHBhdGgsIGZ1bGxQYXRoLCBvcHRpb25zLCBoYW5kbGVycykgPT4ge1xuICAgIGNvbnN0IHsgbGlzdGVuZXIsIGVyckhhbmRsZXIsIHJhd0VtaXR0ZXIgfSA9IGhhbmRsZXJzO1xuICAgIGxldCBjb250ID0gRnNXYXRjaEluc3RhbmNlcy5nZXQoZnVsbFBhdGgpO1xuICAgIGxldCB3YXRjaGVyO1xuICAgIGlmICghb3B0aW9ucy5wZXJzaXN0ZW50KSB7XG4gICAgICAgIHdhdGNoZXIgPSBjcmVhdGVGc1dhdGNoSW5zdGFuY2UocGF0aCwgb3B0aW9ucywgbGlzdGVuZXIsIGVyckhhbmRsZXIsIHJhd0VtaXR0ZXIpO1xuICAgICAgICBpZiAoIXdhdGNoZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHJldHVybiB3YXRjaGVyLmNsb3NlLmJpbmQod2F0Y2hlcik7XG4gICAgfVxuICAgIGlmIChjb250KSB7XG4gICAgICAgIGFkZEFuZENvbnZlcnQoY29udCwgS0VZX0xJU1RFTkVSUywgbGlzdGVuZXIpO1xuICAgICAgICBhZGRBbmRDb252ZXJ0KGNvbnQsIEtFWV9FUlIsIGVyckhhbmRsZXIpO1xuICAgICAgICBhZGRBbmRDb252ZXJ0KGNvbnQsIEtFWV9SQVcsIHJhd0VtaXR0ZXIpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgd2F0Y2hlciA9IGNyZWF0ZUZzV2F0Y2hJbnN0YW5jZShwYXRoLCBvcHRpb25zLCBmc1dhdGNoQnJvYWRjYXN0LmJpbmQobnVsbCwgZnVsbFBhdGgsIEtFWV9MSVNURU5FUlMpLCBlcnJIYW5kbGVyLCAvLyBubyBuZWVkIHRvIHVzZSBicm9hZGNhc3QgaGVyZVxuICAgICAgICBmc1dhdGNoQnJvYWRjYXN0LmJpbmQobnVsbCwgZnVsbFBhdGgsIEtFWV9SQVcpKTtcbiAgICAgICAgaWYgKCF3YXRjaGVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB3YXRjaGVyLm9uKEVWLkVSUk9SLCBhc3luYyAoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJyb2FkY2FzdEVyciA9IGZzV2F0Y2hCcm9hZGNhc3QuYmluZChudWxsLCBmdWxsUGF0aCwgS0VZX0VSUik7XG4gICAgICAgICAgICBpZiAoY29udClcbiAgICAgICAgICAgICAgICBjb250LndhdGNoZXJVbnVzYWJsZSA9IHRydWU7IC8vIGRvY3VtZW50ZWQgc2luY2UgTm9kZSAxMC40LjFcbiAgICAgICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9pc3N1ZXMvNDMzN1xuICAgICAgICAgICAgaWYgKGlzV2luZG93cyAmJiBlcnJvci5jb2RlID09PSAnRVBFUk0nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmQgPSBhd2FpdCBvcGVuKHBhdGgsICdyJyk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGZkLmNsb3NlKCk7XG4gICAgICAgICAgICAgICAgICAgIGJyb2FkY2FzdEVycihlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZG8gbm90aGluZ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGJyb2FkY2FzdEVycihlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb250ID0ge1xuICAgICAgICAgICAgbGlzdGVuZXJzOiBsaXN0ZW5lcixcbiAgICAgICAgICAgIGVyckhhbmRsZXJzOiBlcnJIYW5kbGVyLFxuICAgICAgICAgICAgcmF3RW1pdHRlcnM6IHJhd0VtaXR0ZXIsXG4gICAgICAgICAgICB3YXRjaGVyLFxuICAgICAgICB9O1xuICAgICAgICBGc1dhdGNoSW5zdGFuY2VzLnNldChmdWxsUGF0aCwgY29udCk7XG4gICAgfVxuICAgIC8vIGNvbnN0IGluZGV4ID0gY29udC5saXN0ZW5lcnMuaW5kZXhPZihsaXN0ZW5lcik7XG4gICAgLy8gcmVtb3ZlcyB0aGlzIGluc3RhbmNlJ3MgbGlzdGVuZXJzIGFuZCBjbG9zZXMgdGhlIHVuZGVybHlpbmcgZnNfd2F0Y2hcbiAgICAvLyBpbnN0YW5jZSBpZiB0aGVyZSBhcmUgbm8gbW9yZSBsaXN0ZW5lcnMgbGVmdFxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIGRlbEZyb21TZXQoY29udCwgS0VZX0xJU1RFTkVSUywgbGlzdGVuZXIpO1xuICAgICAgICBkZWxGcm9tU2V0KGNvbnQsIEtFWV9FUlIsIGVyckhhbmRsZXIpO1xuICAgICAgICBkZWxGcm9tU2V0KGNvbnQsIEtFWV9SQVcsIHJhd0VtaXR0ZXIpO1xuICAgICAgICBpZiAoaXNFbXB0eVNldChjb250Lmxpc3RlbmVycykpIHtcbiAgICAgICAgICAgIC8vIENoZWNrIHRvIHByb3RlY3QgYWdhaW5zdCBpc3N1ZSBnaC03MzAuXG4gICAgICAgICAgICAvLyBpZiAoY29udC53YXRjaGVyVW51c2FibGUpIHtcbiAgICAgICAgICAgIGNvbnQud2F0Y2hlci5jbG9zZSgpO1xuICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgRnNXYXRjaEluc3RhbmNlcy5kZWxldGUoZnVsbFBhdGgpO1xuICAgICAgICAgICAgSEFORExFUl9LRVlTLmZvckVhY2goY2xlYXJJdGVtKGNvbnQpKTtcbiAgICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICAgIGNvbnQud2F0Y2hlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIE9iamVjdC5mcmVlemUoY29udCk7XG4gICAgICAgIH1cbiAgICB9O1xufTtcbi8vIGZzX3dhdGNoRmlsZSBoZWxwZXJzXG4vLyBvYmplY3QgdG8gaG9sZCBwZXItcHJvY2VzcyBmc193YXRjaEZpbGUgaW5zdGFuY2VzXG4vLyAobWF5IGJlIHNoYXJlZCBhY3Jvc3MgY2hva2lkYXIgRlNXYXRjaGVyIGluc3RhbmNlcylcbmNvbnN0IEZzV2F0Y2hGaWxlSW5zdGFuY2VzID0gbmV3IE1hcCgpO1xuLyoqXG4gKiBJbnN0YW50aWF0ZXMgdGhlIGZzX3dhdGNoRmlsZSBpbnRlcmZhY2Ugb3IgYmluZHMgbGlzdGVuZXJzXG4gKiB0byBhbiBleGlzdGluZyBvbmUgY292ZXJpbmcgdGhlIHNhbWUgZmlsZSBzeXN0ZW0gZW50cnlcbiAqIEBwYXJhbSBwYXRoIHRvIGJlIHdhdGNoZWRcbiAqIEBwYXJhbSBmdWxsUGF0aCBhYnNvbHV0ZSBwYXRoXG4gKiBAcGFyYW0gb3B0aW9ucyBvcHRpb25zIHRvIGJlIHBhc3NlZCB0byBmc193YXRjaEZpbGVcbiAqIEBwYXJhbSBoYW5kbGVycyBjb250YWluZXIgZm9yIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uc1xuICogQHJldHVybnMgY2xvc2VyXG4gKi9cbmNvbnN0IHNldEZzV2F0Y2hGaWxlTGlzdGVuZXIgPSAocGF0aCwgZnVsbFBhdGgsIG9wdGlvbnMsIGhhbmRsZXJzKSA9PiB7XG4gICAgY29uc3QgeyBsaXN0ZW5lciwgcmF3RW1pdHRlciB9ID0gaGFuZGxlcnM7XG4gICAgbGV0IGNvbnQgPSBGc1dhdGNoRmlsZUluc3RhbmNlcy5nZXQoZnVsbFBhdGgpO1xuICAgIC8vIGxldCBsaXN0ZW5lcnMgPSBuZXcgU2V0KCk7XG4gICAgLy8gbGV0IHJhd0VtaXR0ZXJzID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IGNvcHRzID0gY29udCAmJiBjb250Lm9wdGlvbnM7XG4gICAgaWYgKGNvcHRzICYmIChjb3B0cy5wZXJzaXN0ZW50IDwgb3B0aW9ucy5wZXJzaXN0ZW50IHx8IGNvcHRzLmludGVydmFsID4gb3B0aW9ucy5pbnRlcnZhbCkpIHtcbiAgICAgICAgLy8gXCJVcGdyYWRlXCIgdGhlIHdhdGNoZXIgdG8gcGVyc2lzdGVuY2Ugb3IgYSBxdWlja2VyIGludGVydmFsLlxuICAgICAgICAvLyBUaGlzIGNyZWF0ZXMgc29tZSB1bmxpa2VseSBlZGdlIGNhc2UgaXNzdWVzIGlmIHRoZSB1c2VyIG1peGVzXG4gICAgICAgIC8vIHNldHRpbmdzIGluIGEgdmVyeSB3ZWlyZCB3YXksIGJ1dCBzb2x2aW5nIGZvciB0aG9zZSBjYXNlc1xuICAgICAgICAvLyBkb2Vzbid0IHNlZW0gd29ydGh3aGlsZSBmb3IgdGhlIGFkZGVkIGNvbXBsZXhpdHkuXG4gICAgICAgIC8vIGxpc3RlbmVycyA9IGNvbnQubGlzdGVuZXJzO1xuICAgICAgICAvLyByYXdFbWl0dGVycyA9IGNvbnQucmF3RW1pdHRlcnM7XG4gICAgICAgIHVud2F0Y2hGaWxlKGZ1bGxQYXRoKTtcbiAgICAgICAgY29udCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgaWYgKGNvbnQpIHtcbiAgICAgICAgYWRkQW5kQ29udmVydChjb250LCBLRVlfTElTVEVORVJTLCBsaXN0ZW5lcik7XG4gICAgICAgIGFkZEFuZENvbnZlcnQoY29udCwgS0VZX1JBVywgcmF3RW1pdHRlcik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICAvLyBUT0RPXG4gICAgICAgIC8vIGxpc3RlbmVycy5hZGQobGlzdGVuZXIpO1xuICAgICAgICAvLyByYXdFbWl0dGVycy5hZGQocmF3RW1pdHRlcik7XG4gICAgICAgIGNvbnQgPSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnM6IGxpc3RlbmVyLFxuICAgICAgICAgICAgcmF3RW1pdHRlcnM6IHJhd0VtaXR0ZXIsXG4gICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgICAgd2F0Y2hlcjogd2F0Y2hGaWxlKGZ1bGxQYXRoLCBvcHRpb25zLCAoY3VyciwgcHJldikgPT4ge1xuICAgICAgICAgICAgICAgIGZvcmVhY2goY29udC5yYXdFbWl0dGVycywgKHJhd0VtaXR0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmF3RW1pdHRlcihFVi5DSEFOR0UsIGZ1bGxQYXRoLCB7IGN1cnIsIHByZXYgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgY3Vycm10aW1lID0gY3Vyci5tdGltZU1zO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyLnNpemUgIT09IHByZXYuc2l6ZSB8fCBjdXJybXRpbWUgPiBwcmV2Lm10aW1lTXMgfHwgY3Vycm10aW1lID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcmVhY2goY29udC5saXN0ZW5lcnMsIChsaXN0ZW5lcikgPT4gbGlzdGVuZXIocGF0aCwgY3VycikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLFxuICAgICAgICB9O1xuICAgICAgICBGc1dhdGNoRmlsZUluc3RhbmNlcy5zZXQoZnVsbFBhdGgsIGNvbnQpO1xuICAgIH1cbiAgICAvLyBjb25zdCBpbmRleCA9IGNvbnQubGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuICAgIC8vIFJlbW92ZXMgdGhpcyBpbnN0YW5jZSdzIGxpc3RlbmVycyBhbmQgY2xvc2VzIHRoZSB1bmRlcmx5aW5nIGZzX3dhdGNoRmlsZVxuICAgIC8vIGluc3RhbmNlIGlmIHRoZXJlIGFyZSBubyBtb3JlIGxpc3RlbmVycyBsZWZ0LlxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIGRlbEZyb21TZXQoY29udCwgS0VZX0xJU1RFTkVSUywgbGlzdGVuZXIpO1xuICAgICAgICBkZWxGcm9tU2V0KGNvbnQsIEtFWV9SQVcsIHJhd0VtaXR0ZXIpO1xuICAgICAgICBpZiAoaXNFbXB0eVNldChjb250Lmxpc3RlbmVycykpIHtcbiAgICAgICAgICAgIEZzV2F0Y2hGaWxlSW5zdGFuY2VzLmRlbGV0ZShmdWxsUGF0aCk7XG4gICAgICAgICAgICB1bndhdGNoRmlsZShmdWxsUGF0aCk7XG4gICAgICAgICAgICBjb250Lm9wdGlvbnMgPSBjb250LndhdGNoZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBPYmplY3QuZnJlZXplKGNvbnQpO1xuICAgICAgICB9XG4gICAgfTtcbn07XG4vKipcbiAqIEBtaXhpblxuICovXG5leHBvcnQgY2xhc3MgTm9kZUZzSGFuZGxlciB7XG4gICAgY29uc3RydWN0b3IoZnNXKSB7XG4gICAgICAgIHRoaXMuZnN3ID0gZnNXO1xuICAgICAgICB0aGlzLl9ib3VuZEhhbmRsZUVycm9yID0gKGVycm9yKSA9PiBmc1cuX2hhbmRsZUVycm9yKGVycm9yKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogV2F0Y2ggZmlsZSBmb3IgY2hhbmdlcyB3aXRoIGZzX3dhdGNoRmlsZSBvciBmc193YXRjaC5cbiAgICAgKiBAcGFyYW0gcGF0aCB0byBmaWxlIG9yIGRpclxuICAgICAqIEBwYXJhbSBsaXN0ZW5lciBvbiBmcyBjaGFuZ2VcbiAgICAgKiBAcmV0dXJucyBjbG9zZXIgZm9yIHRoZSB3YXRjaGVyIGluc3RhbmNlXG4gICAgICovXG4gICAgX3dhdGNoV2l0aE5vZGVGcyhwYXRoLCBsaXN0ZW5lcikge1xuICAgICAgICBjb25zdCBvcHRzID0gdGhpcy5mc3cub3B0aW9ucztcbiAgICAgICAgY29uc3QgZGlyZWN0b3J5ID0gc3lzUGF0aC5kaXJuYW1lKHBhdGgpO1xuICAgICAgICBjb25zdCBiYXNlbmFtZSA9IHN5c1BhdGguYmFzZW5hbWUocGF0aCk7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKGRpcmVjdG9yeSk7XG4gICAgICAgIHBhcmVudC5hZGQoYmFzZW5hbWUpO1xuICAgICAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBzeXNQYXRoLnJlc29sdmUocGF0aCk7XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBwZXJzaXN0ZW50OiBvcHRzLnBlcnNpc3RlbnQsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghbGlzdGVuZXIpXG4gICAgICAgICAgICBsaXN0ZW5lciA9IEVNUFRZX0ZOO1xuICAgICAgICBsZXQgY2xvc2VyO1xuICAgICAgICBpZiAob3B0cy51c2VQb2xsaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBlbmFibGVCaW4gPSBvcHRzLmludGVydmFsICE9PSBvcHRzLmJpbmFyeUludGVydmFsO1xuICAgICAgICAgICAgb3B0aW9ucy5pbnRlcnZhbCA9IGVuYWJsZUJpbiAmJiBpc0JpbmFyeVBhdGgoYmFzZW5hbWUpID8gb3B0cy5iaW5hcnlJbnRlcnZhbCA6IG9wdHMuaW50ZXJ2YWw7XG4gICAgICAgICAgICBjbG9zZXIgPSBzZXRGc1dhdGNoRmlsZUxpc3RlbmVyKHBhdGgsIGFic29sdXRlUGF0aCwgb3B0aW9ucywge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyLFxuICAgICAgICAgICAgICAgIHJhd0VtaXR0ZXI6IHRoaXMuZnN3Ll9lbWl0UmF3LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjbG9zZXIgPSBzZXRGc1dhdGNoTGlzdGVuZXIocGF0aCwgYWJzb2x1dGVQYXRoLCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIsXG4gICAgICAgICAgICAgICAgZXJySGFuZGxlcjogdGhpcy5fYm91bmRIYW5kbGVFcnJvcixcbiAgICAgICAgICAgICAgICByYXdFbWl0dGVyOiB0aGlzLmZzdy5fZW1pdFJhdyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjbG9zZXI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdhdGNoIGEgZmlsZSBhbmQgZW1pdCBhZGQgZXZlbnQgaWYgd2FycmFudGVkLlxuICAgICAqIEByZXR1cm5zIGNsb3NlciBmb3IgdGhlIHdhdGNoZXIgaW5zdGFuY2VcbiAgICAgKi9cbiAgICBfaGFuZGxlRmlsZShmaWxlLCBzdGF0cywgaW5pdGlhbEFkZCkge1xuICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGlybmFtZSA9IHN5c1BhdGguZGlybmFtZShmaWxlKTtcbiAgICAgICAgY29uc3QgYmFzZW5hbWUgPSBzeXNQYXRoLmJhc2VuYW1lKGZpbGUpO1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihkaXJuYW1lKTtcbiAgICAgICAgLy8gc3RhdHMgaXMgYWx3YXlzIHByZXNlbnRcbiAgICAgICAgbGV0IHByZXZTdGF0cyA9IHN0YXRzO1xuICAgICAgICAvLyBpZiB0aGUgZmlsZSBpcyBhbHJlYWR5IGJlaW5nIHdhdGNoZWQsIGRvIG5vdGhpbmdcbiAgICAgICAgaWYgKHBhcmVudC5oYXMoYmFzZW5hbWUpKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBsaXN0ZW5lciA9IGFzeW5jIChwYXRoLCBuZXdTdGF0cykgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmZzdy5fdGhyb3R0bGUoVEhST1RUTEVfTU9ERV9XQVRDSCwgZmlsZSwgNSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCFuZXdTdGF0cyB8fCBuZXdTdGF0cy5tdGltZU1zID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3U3RhdHMgPSBhd2FpdCBzdGF0KGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayB0aGF0IGNoYW5nZSBldmVudCB3YXMgbm90IGZpcmVkIGJlY2F1c2Ugb2YgY2hhbmdlZCBvbmx5IGFjY2Vzc1RpbWUuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGF0ID0gbmV3U3RhdHMuYXRpbWVNcztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbXQgPSBuZXdTdGF0cy5tdGltZU1zO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWF0IHx8IGF0IDw9IG10IHx8IG10ICE9PSBwcmV2U3RhdHMubXRpbWVNcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQ0hBTkdFLCBmaWxlLCBuZXdTdGF0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKChpc01hY29zIHx8IGlzTGludXggfHwgaXNGcmVlQlNEKSAmJiBwcmV2U3RhdHMuaW5vICE9PSBuZXdTdGF0cy5pbm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9jbG9zZUZpbGUocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2U3RhdHMgPSBuZXdTdGF0cztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsb3NlciA9IHRoaXMuX3dhdGNoV2l0aE5vZGVGcyhmaWxlLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xvc2VyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9hZGRQYXRoQ2xvc2VyKHBhdGgsIGNsb3Nlcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2U3RhdHMgPSBuZXdTdGF0cztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRml4IGlzc3VlcyB3aGVyZSBtdGltZSBpcyBudWxsIGJ1dCBmaWxlIGlzIHN0aWxsIHByZXNlbnRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX3JlbW92ZShkaXJuYW1lLCBiYXNlbmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGFkZCBpcyBhYm91dCB0byBiZSBlbWl0dGVkIGlmIGZpbGUgbm90IGFscmVhZHkgdHJhY2tlZCBpbiBwYXJlbnRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHBhcmVudC5oYXMoYmFzZW5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgdGhhdCBjaGFuZ2UgZXZlbnQgd2FzIG5vdCBmaXJlZCBiZWNhdXNlIG9mIGNoYW5nZWQgb25seSBhY2Nlc3NUaW1lLlxuICAgICAgICAgICAgICAgIGNvbnN0IGF0ID0gbmV3U3RhdHMuYXRpbWVNcztcbiAgICAgICAgICAgICAgICBjb25zdCBtdCA9IG5ld1N0YXRzLm10aW1lTXM7XG4gICAgICAgICAgICAgICAgaWYgKCFhdCB8fCBhdCA8PSBtdCB8fCBtdCAhPT0gcHJldlN0YXRzLm10aW1lTXMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQ0hBTkdFLCBmaWxlLCBuZXdTdGF0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXZTdGF0cyA9IG5ld1N0YXRzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBraWNrIG9mZiB0aGUgd2F0Y2hlclxuICAgICAgICBjb25zdCBjbG9zZXIgPSB0aGlzLl93YXRjaFdpdGhOb2RlRnMoZmlsZSwgbGlzdGVuZXIpO1xuICAgICAgICAvLyBlbWl0IGFuIGFkZCBldmVudCBpZiB3ZSdyZSBzdXBwb3NlZCB0b1xuICAgICAgICBpZiAoIShpbml0aWFsQWRkICYmIHRoaXMuZnN3Lm9wdGlvbnMuaWdub3JlSW5pdGlhbCkgJiYgdGhpcy5mc3cuX2lzbnRJZ25vcmVkKGZpbGUpKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuZnN3Ll90aHJvdHRsZShFVi5BREQsIGZpbGUsIDApKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkFERCwgZmlsZSwgc3RhdHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjbG9zZXI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEhhbmRsZSBzeW1saW5rcyBlbmNvdW50ZXJlZCB3aGlsZSByZWFkaW5nIGEgZGlyLlxuICAgICAqIEBwYXJhbSBlbnRyeSByZXR1cm5lZCBieSByZWFkZGlycFxuICAgICAqIEBwYXJhbSBkaXJlY3RvcnkgcGF0aCBvZiBkaXIgYmVpbmcgcmVhZFxuICAgICAqIEBwYXJhbSBwYXRoIG9mIHRoaXMgaXRlbVxuICAgICAqIEBwYXJhbSBpdGVtIGJhc2VuYW1lIG9mIHRoaXMgaXRlbVxuICAgICAqIEByZXR1cm5zIHRydWUgaWYgbm8gbW9yZSBwcm9jZXNzaW5nIGlzIG5lZWRlZCBmb3IgdGhpcyBlbnRyeS5cbiAgICAgKi9cbiAgICBhc3luYyBfaGFuZGxlU3ltbGluayhlbnRyeSwgZGlyZWN0b3J5LCBwYXRoLCBpdGVtKSB7XG4gICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsID0gZW50cnkuZnVsbFBhdGg7XG4gICAgICAgIGNvbnN0IGRpciA9IHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKGRpcmVjdG9yeSk7XG4gICAgICAgIGlmICghdGhpcy5mc3cub3B0aW9ucy5mb2xsb3dTeW1saW5rcykge1xuICAgICAgICAgICAgLy8gd2F0Y2ggc3ltbGluayBkaXJlY3RseSAoZG9uJ3QgZm9sbG93KSBhbmQgZGV0ZWN0IGNoYW5nZXNcbiAgICAgICAgICAgIHRoaXMuZnN3Ll9pbmNyUmVhZHlDb3VudCgpO1xuICAgICAgICAgICAgbGV0IGxpbmtQYXRoO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBsaW5rUGF0aCA9IGF3YWl0IGZzcmVhbHBhdGgocGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0UmVhZHkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGRpci5oYXMoaXRlbSkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuX3N5bWxpbmtQYXRocy5nZXQoZnVsbCkgIT09IGxpbmtQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuc2V0KGZ1bGwsIGxpbmtQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQ0hBTkdFLCBwYXRoLCBlbnRyeS5zdGF0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGlyLmFkZChpdGVtKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fc3ltbGlua1BhdGhzLnNldChmdWxsLCBsaW5rUGF0aCk7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQURELCBwYXRoLCBlbnRyeS5zdGF0cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZzdy5fZW1pdFJlYWR5KCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBkb24ndCBmb2xsb3cgdGhlIHNhbWUgc3ltbGluayBtb3JlIHRoYW4gb25jZVxuICAgICAgICBpZiAodGhpcy5mc3cuX3N5bWxpbmtQYXRocy5oYXMoZnVsbCkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuc2V0KGZ1bGwsIHRydWUpO1xuICAgIH1cbiAgICBfaGFuZGxlUmVhZChkaXJlY3RvcnksIGluaXRpYWxBZGQsIHdoLCB0YXJnZXQsIGRpciwgZGVwdGgsIHRocm90dGxlcikge1xuICAgICAgICAvLyBOb3JtYWxpemUgdGhlIGRpcmVjdG9yeSBuYW1lIG9uIFdpbmRvd3NcbiAgICAgICAgZGlyZWN0b3J5ID0gc3lzUGF0aC5qb2luKGRpcmVjdG9yeSwgJycpO1xuICAgICAgICB0aHJvdHRsZXIgPSB0aGlzLmZzdy5fdGhyb3R0bGUoJ3JlYWRkaXInLCBkaXJlY3RvcnksIDEwMDApO1xuICAgICAgICBpZiAoIXRocm90dGxlcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcih3aC5wYXRoKTtcbiAgICAgICAgY29uc3QgY3VycmVudCA9IG5ldyBTZXQoKTtcbiAgICAgICAgbGV0IHN0cmVhbSA9IHRoaXMuZnN3Ll9yZWFkZGlycChkaXJlY3RvcnksIHtcbiAgICAgICAgICAgIGZpbGVGaWx0ZXI6IChlbnRyeSkgPT4gd2guZmlsdGVyUGF0aChlbnRyeSksXG4gICAgICAgICAgICBkaXJlY3RvcnlGaWx0ZXI6IChlbnRyeSkgPT4gd2guZmlsdGVyRGlyKGVudHJ5KSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghc3RyZWFtKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBzdHJlYW1cbiAgICAgICAgICAgIC5vbihTVFJfREFUQSwgYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBlbnRyeS5wYXRoO1xuICAgICAgICAgICAgbGV0IHBhdGggPSBzeXNQYXRoLmpvaW4oZGlyZWN0b3J5LCBpdGVtKTtcbiAgICAgICAgICAgIGN1cnJlbnQuYWRkKGl0ZW0pO1xuICAgICAgICAgICAgaWYgKGVudHJ5LnN0YXRzLmlzU3ltYm9saWNMaW5rKCkgJiZcbiAgICAgICAgICAgICAgICAoYXdhaXQgdGhpcy5faGFuZGxlU3ltbGluayhlbnRyeSwgZGlyZWN0b3J5LCBwYXRoLCBpdGVtKSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEZpbGVzIHRoYXQgcHJlc2VudCBpbiBjdXJyZW50IGRpcmVjdG9yeSBzbmFwc2hvdFxuICAgICAgICAgICAgLy8gYnV0IGFic2VudCBpbiBwcmV2aW91cyBhcmUgYWRkZWQgdG8gd2F0Y2ggbGlzdCBhbmRcbiAgICAgICAgICAgIC8vIGVtaXQgYGFkZGAgZXZlbnQuXG4gICAgICAgICAgICBpZiAoaXRlbSA9PT0gdGFyZ2V0IHx8ICghdGFyZ2V0ICYmICFwcmV2aW91cy5oYXMoaXRlbSkpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2luY3JSZWFkeUNvdW50KCk7XG4gICAgICAgICAgICAgICAgLy8gZW5zdXJlIHJlbGF0aXZlbmVzcyBvZiBwYXRoIGlzIHByZXNlcnZlZCBpbiBjYXNlIG9mIHdhdGNoZXIgcmV1c2VcbiAgICAgICAgICAgICAgICBwYXRoID0gc3lzUGF0aC5qb2luKGRpciwgc3lzUGF0aC5yZWxhdGl2ZShkaXIsIHBhdGgpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRUb05vZGVGcyhwYXRoLCBpbml0aWFsQWRkLCB3aCwgZGVwdGggKyAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbihFVi5FUlJPUiwgdGhpcy5fYm91bmRIYW5kbGVFcnJvcik7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXN0cmVhbSlcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KCk7XG4gICAgICAgICAgICBzdHJlYW0ub25jZShTVFJfRU5ELCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgd2FzVGhyb3R0bGVkID0gdGhyb3R0bGVyID8gdGhyb3R0bGVyLmNsZWFyKCkgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgLy8gRmlsZXMgdGhhdCBhYnNlbnQgaW4gY3VycmVudCBkaXJlY3Rvcnkgc25hcHNob3RcbiAgICAgICAgICAgICAgICAvLyBidXQgcHJlc2VudCBpbiBwcmV2aW91cyBlbWl0IGByZW1vdmVgIGV2ZW50XG4gICAgICAgICAgICAgICAgLy8gYW5kIGFyZSByZW1vdmVkIGZyb20gQHdhdGNoZWRbZGlyZWN0b3J5XS5cbiAgICAgICAgICAgICAgICBwcmV2aW91c1xuICAgICAgICAgICAgICAgICAgICAuZ2V0Q2hpbGRyZW4oKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpdGVtICE9PSBkaXJlY3RvcnkgJiYgIWN1cnJlbnQuaGFzKGl0ZW0pO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9yZW1vdmUoZGlyZWN0b3J5LCBpdGVtKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgLy8gb25lIG1vcmUgdGltZSBmb3IgYW55IG1pc3NlZCBpbiBjYXNlIGNoYW5nZXMgY2FtZSBpbiBleHRyZW1lbHkgcXVpY2tseVxuICAgICAgICAgICAgICAgIGlmICh3YXNUaHJvdHRsZWQpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2hhbmRsZVJlYWQoZGlyZWN0b3J5LCBmYWxzZSwgd2gsIHRhcmdldCwgZGlyLCBkZXB0aCwgdGhyb3R0bGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBkaXJlY3RvcnkgdG8gYWRkIC8gcmVtb3ZlIGZpbGVzIGZyb20gYEB3YXRjaGVkYCBsaXN0IGFuZCByZS1yZWFkIGl0IG9uIGNoYW5nZS5cbiAgICAgKiBAcGFyYW0gZGlyIGZzIHBhdGhcbiAgICAgKiBAcGFyYW0gc3RhdHNcbiAgICAgKiBAcGFyYW0gaW5pdGlhbEFkZFxuICAgICAqIEBwYXJhbSBkZXB0aCByZWxhdGl2ZSB0byB1c2VyLXN1cHBsaWVkIHBhdGhcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IGNoaWxkIHBhdGggdGFyZ2V0ZWQgZm9yIHdhdGNoXG4gICAgICogQHBhcmFtIHdoIENvbW1vbiB3YXRjaCBoZWxwZXJzIGZvciB0aGlzIHBhdGhcbiAgICAgKiBAcGFyYW0gcmVhbHBhdGhcbiAgICAgKiBAcmV0dXJucyBjbG9zZXIgZm9yIHRoZSB3YXRjaGVyIGluc3RhbmNlLlxuICAgICAqL1xuICAgIGFzeW5jIF9oYW5kbGVEaXIoZGlyLCBzdGF0cywgaW5pdGlhbEFkZCwgZGVwdGgsIHRhcmdldCwgd2gsIHJlYWxwYXRoKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudERpciA9IHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKHN5c1BhdGguZGlybmFtZShkaXIpKTtcbiAgICAgICAgY29uc3QgdHJhY2tlZCA9IHBhcmVudERpci5oYXMoc3lzUGF0aC5iYXNlbmFtZShkaXIpKTtcbiAgICAgICAgaWYgKCEoaW5pdGlhbEFkZCAmJiB0aGlzLmZzdy5vcHRpb25zLmlnbm9yZUluaXRpYWwpICYmICF0YXJnZXQgJiYgIXRyYWNrZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkFERF9ESVIsIGRpciwgc3RhdHMpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGVuc3VyZSBkaXIgaXMgdHJhY2tlZCAoaGFybWxlc3MgaWYgcmVkdW5kYW50KVxuICAgICAgICBwYXJlbnREaXIuYWRkKHN5c1BhdGguYmFzZW5hbWUoZGlyKSk7XG4gICAgICAgIHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKGRpcik7XG4gICAgICAgIGxldCB0aHJvdHRsZXI7XG4gICAgICAgIGxldCBjbG9zZXI7XG4gICAgICAgIGNvbnN0IG9EZXB0aCA9IHRoaXMuZnN3Lm9wdGlvbnMuZGVwdGg7XG4gICAgICAgIGlmICgob0RlcHRoID09IG51bGwgfHwgZGVwdGggPD0gb0RlcHRoKSAmJiAhdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5oYXMocmVhbHBhdGgpKSB7XG4gICAgICAgICAgICBpZiAoIXRhcmdldCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuX2hhbmRsZVJlYWQoZGlyLCBpbml0aWFsQWRkLCB3aCwgdGFyZ2V0LCBkaXIsIGRlcHRoLCB0aHJvdHRsZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsb3NlciA9IHRoaXMuX3dhdGNoV2l0aE5vZGVGcyhkaXIsIChkaXJQYXRoLCBzdGF0cykgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGlmIGN1cnJlbnQgZGlyZWN0b3J5IGlzIHJlbW92ZWQsIGRvIG5vdGhpbmdcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHMgJiYgc3RhdHMubXRpbWVNcyA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHRoaXMuX2hhbmRsZVJlYWQoZGlyUGF0aCwgZmFsc2UsIHdoLCB0YXJnZXQsIGRpciwgZGVwdGgsIHRocm90dGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2xvc2VyO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBIYW5kbGUgYWRkZWQgZmlsZSwgZGlyZWN0b3J5LCBvciBnbG9iIHBhdHRlcm4uXG4gICAgICogRGVsZWdhdGVzIGNhbGwgdG8gX2hhbmRsZUZpbGUgLyBfaGFuZGxlRGlyIGFmdGVyIGNoZWNrcy5cbiAgICAgKiBAcGFyYW0gcGF0aCB0byBmaWxlIG9yIGlyXG4gICAgICogQHBhcmFtIGluaXRpYWxBZGQgd2FzIHRoZSBmaWxlIGFkZGVkIGF0IHdhdGNoIGluc3RhbnRpYXRpb24/XG4gICAgICogQHBhcmFtIHByaW9yV2ggZGVwdGggcmVsYXRpdmUgdG8gdXNlci1zdXBwbGllZCBwYXRoXG4gICAgICogQHBhcmFtIGRlcHRoIENoaWxkIHBhdGggYWN0dWFsbHkgdGFyZ2V0ZWQgZm9yIHdhdGNoXG4gICAgICogQHBhcmFtIHRhcmdldCBDaGlsZCBwYXRoIGFjdHVhbGx5IHRhcmdldGVkIGZvciB3YXRjaFxuICAgICAqL1xuICAgIGFzeW5jIF9hZGRUb05vZGVGcyhwYXRoLCBpbml0aWFsQWRkLCBwcmlvcldoLCBkZXB0aCwgdGFyZ2V0KSB7XG4gICAgICAgIGNvbnN0IHJlYWR5ID0gdGhpcy5mc3cuX2VtaXRSZWFkeTtcbiAgICAgICAgaWYgKHRoaXMuZnN3Ll9pc0lnbm9yZWQocGF0aCkgfHwgdGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHdoID0gdGhpcy5mc3cuX2dldFdhdGNoSGVscGVycyhwYXRoKTtcbiAgICAgICAgaWYgKHByaW9yV2gpIHtcbiAgICAgICAgICAgIHdoLmZpbHRlclBhdGggPSAoZW50cnkpID0+IHByaW9yV2guZmlsdGVyUGF0aChlbnRyeSk7XG4gICAgICAgICAgICB3aC5maWx0ZXJEaXIgPSAoZW50cnkpID0+IHByaW9yV2guZmlsdGVyRGlyKGVudHJ5KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBldmFsdWF0ZSB3aGF0IGlzIGF0IHRoZSBwYXRoIHdlJ3JlIGJlaW5nIGFza2VkIHRvIHdhdGNoXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IHN0YXRNZXRob2RzW3doLnN0YXRNZXRob2RdKHdoLndhdGNoUGF0aCk7XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5faXNJZ25vcmVkKHdoLndhdGNoUGF0aCwgc3RhdHMpKSB7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBmb2xsb3cgPSB0aGlzLmZzdy5vcHRpb25zLmZvbGxvd1N5bWxpbmtzO1xuICAgICAgICAgICAgbGV0IGNsb3NlcjtcbiAgICAgICAgICAgIGlmIChzdGF0cy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWJzUGF0aCA9IHN5c1BhdGgucmVzb2x2ZShwYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gZm9sbG93ID8gYXdhaXQgZnNyZWFscGF0aChwYXRoKSA6IHBhdGg7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNsb3NlciA9IGF3YWl0IHRoaXMuX2hhbmRsZURpcih3aC53YXRjaFBhdGgsIHN0YXRzLCBpbml0aWFsQWRkLCBkZXB0aCwgdGFyZ2V0LCB3aCwgdGFyZ2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIHByZXNlcnZlIHRoaXMgc3ltbGluaydzIHRhcmdldCBwYXRoXG4gICAgICAgICAgICAgICAgaWYgKGFic1BhdGggIT09IHRhcmdldFBhdGggJiYgdGFyZ2V0UGF0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuc2V0KGFic1BhdGgsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRzLmlzU3ltYm9saWNMaW5rKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gZm9sbG93ID8gYXdhaXQgZnNyZWFscGF0aChwYXRoKSA6IHBhdGg7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHN5c1BhdGguZGlybmFtZSh3aC53YXRjaFBhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKHBhcmVudCkuYWRkKHdoLndhdGNoUGF0aCk7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQURELCB3aC53YXRjaFBhdGgsIHN0YXRzKTtcbiAgICAgICAgICAgICAgICBjbG9zZXIgPSBhd2FpdCB0aGlzLl9oYW5kbGVEaXIocGFyZW50LCBzdGF0cywgaW5pdGlhbEFkZCwgZGVwdGgsIHBhdGgsIHdoLCB0YXJnZXRQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gcHJlc2VydmUgdGhpcyBzeW1saW5rJ3MgdGFyZ2V0IHBhdGhcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0UGF0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuc2V0KHN5c1BhdGgucmVzb2x2ZShwYXRoKSwgdGFyZ2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY2xvc2VyID0gdGhpcy5faGFuZGxlRmlsZSh3aC53YXRjaFBhdGgsIHN0YXRzLCBpbml0aWFsQWRkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICBpZiAoY2xvc2VyKVxuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9hZGRQYXRoQ2xvc2VyKHBhdGgsIGNsb3Nlcik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuX2hhbmRsZUVycm9yKGVycm9yKSkge1xuICAgICAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCAiLyoqXG4gKiBEaXNjb3ZlciB0d2Vha3MgdW5kZXIgPHVzZXJSb290Pi90d2Vha3MuIEVhY2ggdHdlYWsgaXMgYSBkaXJlY3Rvcnkgd2l0aCBhXG4gKiBtYW5pZmVzdC5qc29uIGFuZCBhbiBlbnRyeSBzY3JpcHQuIEVudHJ5IHJlc29sdXRpb24gaXMgbWFuaWZlc3QubWFpbiBmaXJzdCxcbiAqIHRoZW4gaW5kZXguanMsIGluZGV4Lm1qcywgYW5kIGluZGV4LmNqcy5cbiAqXG4gKiBUaGUgbWFuaWZlc3QgZ2F0ZSBpcyBpbnRlbnRpb25hbGx5IHN0cmljdC4gQSB0d2VhayBtdXN0IGlkZW50aWZ5IGl0cyBHaXRIdWJcbiAqIHJlcG9zaXRvcnkgc28gdGhlIG1hbmFnZXIgY2FuIGNoZWNrIHJlbGVhc2VzIHdpdGhvdXQgZ3JhbnRpbmcgdGhlIHR3ZWFrIGFuXG4gKiB1cGRhdGUvaW5zdGFsbCBjaGFubmVsLiBVcGRhdGUgY2hlY2tzIGFyZSBhZHZpc29yeSBvbmx5LlxuICovXG5pbXBvcnQgeyByZWFkZGlyU3luYywgc3RhdFN5bmMsIHJlYWRGaWxlU3luYywgZXhpc3RzU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHR5cGUgeyBUd2Vha01hbmlmZXN0IH0gZnJvbSBcIkBjb2RleC1wbHVzcGx1cy9zZGtcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaXNjb3ZlcmVkVHdlYWsge1xuICBkaXI6IHN0cmluZztcbiAgZW50cnk6IHN0cmluZztcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG59XG5cbmNvbnN0IEVOVFJZX0NBTkRJREFURVMgPSBbXCJpbmRleC5qc1wiLCBcImluZGV4LmNqc1wiLCBcImluZGV4Lm1qc1wiXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRpc2NvdmVyVHdlYWtzKHR3ZWFrc0Rpcjogc3RyaW5nKTogRGlzY292ZXJlZFR3ZWFrW10ge1xuICBpZiAoIWV4aXN0c1N5bmModHdlYWtzRGlyKSkgcmV0dXJuIFtdO1xuICBjb25zdCBvdXQ6IERpc2NvdmVyZWRUd2Vha1tdID0gW107XG4gIGZvciAoY29uc3QgbmFtZSBvZiByZWFkZGlyU3luYyh0d2Vha3NEaXIpKSB7XG4gICAgY29uc3QgZGlyID0gam9pbih0d2Vha3NEaXIsIG5hbWUpO1xuICAgIGlmICghc3RhdFN5bmMoZGlyKS5pc0RpcmVjdG9yeSgpKSBjb250aW51ZTtcbiAgICBjb25zdCBtYW5pZmVzdFBhdGggPSBqb2luKGRpciwgXCJtYW5pZmVzdC5qc29uXCIpO1xuICAgIGlmICghZXhpc3RzU3luYyhtYW5pZmVzdFBhdGgpKSBjb250aW51ZTtcbiAgICBsZXQgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gICAgdHJ5IHtcbiAgICAgIG1hbmlmZXN0ID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMobWFuaWZlc3RQYXRoLCBcInV0ZjhcIikpIGFzIFR3ZWFrTWFuaWZlc3Q7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKCFpc1ZhbGlkTWFuaWZlc3QobWFuaWZlc3QpKSBjb250aW51ZTtcbiAgICBjb25zdCBlbnRyeSA9IHJlc29sdmVFbnRyeShkaXIsIG1hbmlmZXN0KTtcbiAgICBpZiAoIWVudHJ5KSBjb250aW51ZTtcbiAgICBvdXQucHVzaCh7IGRpciwgZW50cnksIG1hbmlmZXN0IH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGlzVmFsaWRNYW5pZmVzdChtOiBUd2Vha01hbmlmZXN0KTogYm9vbGVhbiB7XG4gIGlmICghbS5pZCB8fCAhbS5uYW1lIHx8ICFtLnZlcnNpb24gfHwgIW0uZ2l0aHViUmVwbykgcmV0dXJuIGZhbHNlO1xuICBpZiAoIS9eW2EtekEtWjAtOS5fLV0rXFwvW2EtekEtWjAtOS5fLV0rJC8udGVzdChtLmdpdGh1YlJlcG8pKSByZXR1cm4gZmFsc2U7XG4gIGlmIChtLnNjb3BlICYmICFbXCJyZW5kZXJlclwiLCBcIm1haW5cIiwgXCJib3RoXCJdLmluY2x1ZGVzKG0uc2NvcGUpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlRW50cnkoZGlyOiBzdHJpbmcsIG06IFR3ZWFrTWFuaWZlc3QpOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKG0ubWFpbikge1xuICAgIGNvbnN0IHAgPSBqb2luKGRpciwgbS5tYWluKTtcbiAgICByZXR1cm4gZXhpc3RzU3luYyhwKSA/IHAgOiBudWxsO1xuICB9XG4gIGZvciAoY29uc3QgYyBvZiBFTlRSWV9DQU5ESURBVEVTKSB7XG4gICAgY29uc3QgcCA9IGpvaW4oZGlyLCBjKTtcbiAgICBpZiAoZXhpc3RzU3luYyhwKSkgcmV0dXJuIHA7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiLyoqXG4gKiBEaXNrLWJhY2tlZCBrZXkvdmFsdWUgc3RvcmFnZSBmb3IgbWFpbi1wcm9jZXNzIHR3ZWFrcy5cbiAqXG4gKiBFYWNoIHR3ZWFrIGdldHMgb25lIEpTT04gZmlsZSB1bmRlciBgPHVzZXJSb290Pi9zdG9yYWdlLzxpZD4uanNvbmAuXG4gKiBXcml0ZXMgYXJlIGRlYm91bmNlZCAoNTAgbXMpIGFuZCBhdG9taWMgKHdyaXRlIHRvIDxmaWxlPi50bXAgdGhlbiByZW5hbWUpLlxuICogUmVhZHMgYXJlIGVhZ2VyICsgY2FjaGVkIGluLW1lbW9yeTsgd2UgbG9hZCBvbiBmaXJzdCBhY2Nlc3MuXG4gKi9cbmltcG9ydCB7XG4gIGV4aXN0c1N5bmMsXG4gIG1rZGlyU3luYyxcbiAgcmVhZEZpbGVTeW5jLFxuICByZW5hbWVTeW5jLFxuICB3cml0ZUZpbGVTeW5jLFxufSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaXNrU3RvcmFnZSB7XG4gIGdldDxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQ7XG4gIHNldChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkO1xuICBkZWxldGUoa2V5OiBzdHJpbmcpOiB2b2lkO1xuICBhbGwoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGZsdXNoKCk6IHZvaWQ7XG59XG5cbmNvbnN0IEZMVVNIX0RFTEFZX01TID0gNTA7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaXNrU3RvcmFnZShyb290RGlyOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBEaXNrU3RvcmFnZSB7XG4gIGNvbnN0IGRpciA9IGpvaW4ocm9vdERpciwgXCJzdG9yYWdlXCIpO1xuICBta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgY29uc3QgZmlsZSA9IGpvaW4oZGlyLCBgJHtzYW5pdGl6ZShpZCl9Lmpzb25gKTtcblxuICBsZXQgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgaWYgKGV4aXN0c1N5bmMoZmlsZSkpIHtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGZpbGUsIFwidXRmOFwiKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBDb3JydXB0IGZpbGUgXHUyMDE0IHN0YXJ0IGZyZXNoLCBidXQgZG9uJ3QgY2xvYmJlciB0aGUgb3JpZ2luYWwgdW50aWwgd2VcbiAgICAgIC8vIHN1Y2Nlc3NmdWxseSB3cml0ZSBhZ2Fpbi4gKE1vdmUgaXQgYXNpZGUgZm9yIGZvcmVuc2ljcy4pXG4gICAgICB0cnkge1xuICAgICAgICByZW5hbWVTeW5jKGZpbGUsIGAke2ZpbGV9LmNvcnJ1cHQtJHtEYXRlLm5vdygpfWApO1xuICAgICAgfSBjYXRjaCB7fVxuICAgICAgZGF0YSA9IHt9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBkaXJ0eSA9IGZhbHNlO1xuICBsZXQgdGltZXI6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3Qgc2NoZWR1bGVGbHVzaCA9ICgpID0+IHtcbiAgICBkaXJ0eSA9IHRydWU7XG4gICAgaWYgKHRpbWVyKSByZXR1cm47XG4gICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRpbWVyID0gbnVsbDtcbiAgICAgIGlmIChkaXJ0eSkgZmx1c2goKTtcbiAgICB9LCBGTFVTSF9ERUxBWV9NUyk7XG4gIH07XG5cbiAgY29uc3QgZmx1c2ggPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCFkaXJ0eSkgcmV0dXJuO1xuICAgIGNvbnN0IHRtcCA9IGAke2ZpbGV9LnRtcGA7XG4gICAgdHJ5IHtcbiAgICAgIHdyaXRlRmlsZVN5bmModG1wLCBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKSwgXCJ1dGY4XCIpO1xuICAgICAgcmVuYW1lU3luYyh0bXAsIGZpbGUpO1xuICAgICAgZGlydHkgPSBmYWxzZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvLyBMZWF2ZSBkaXJ0eT10cnVlIHNvIGEgZnV0dXJlIGZsdXNoIHJldHJpZXMuXG4gICAgICBjb25zb2xlLmVycm9yKFwiW2NvZGV4LXBsdXNwbHVzXSBzdG9yYWdlIGZsdXNoIGZhaWxlZDpcIiwgaWQsIGUpO1xuICAgIH1cbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGdldDogPFQ+KGs6IHN0cmluZywgZD86IFQpOiBUID0+XG4gICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgaykgPyAoZGF0YVtrXSBhcyBUKSA6IChkIGFzIFQpLFxuICAgIHNldChrLCB2KSB7XG4gICAgICBkYXRhW2tdID0gdjtcbiAgICAgIHNjaGVkdWxlRmx1c2goKTtcbiAgICB9LFxuICAgIGRlbGV0ZShrKSB7XG4gICAgICBpZiAoayBpbiBkYXRhKSB7XG4gICAgICAgIGRlbGV0ZSBkYXRhW2tdO1xuICAgICAgICBzY2hlZHVsZUZsdXNoKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICBhbGw6ICgpID0+ICh7IC4uLmRhdGEgfSksXG4gICAgZmx1c2gsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplKGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyBUd2VhayBpZHMgYXJlIGF1dGhvci1jb250cm9sbGVkOyBjbGFtcCB0byBhIHNhZmUgZmlsZW5hbWUuXG4gIHJldHVybiBpZC5yZXBsYWNlKC9bXmEtekEtWjAtOS5fQC1dL2csIFwiX1wiKTtcbn1cbiIsICJpbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBkaXJuYW1lLCBpc0Fic29sdXRlLCByZXNvbHZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHR5cGUgeyBUd2Vha01jcFNlcnZlciB9IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5cbmV4cG9ydCBjb25zdCBNQ1BfTUFOQUdFRF9TVEFSVCA9IFwiIyBCRUdJTiBDT0RFWCsrIE1BTkFHRUQgTUNQIFNFUlZFUlNcIjtcbmV4cG9ydCBjb25zdCBNQ1BfTUFOQUdFRF9FTkQgPSBcIiMgRU5EIENPREVYKysgTUFOQUdFRCBNQ1AgU0VSVkVSU1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1jcFN5bmNUd2VhayB7XG4gIGRpcjogc3RyaW5nO1xuICBtYW5pZmVzdDoge1xuICAgIGlkOiBzdHJpbmc7XG4gICAgbWNwPzogVHdlYWtNY3BTZXJ2ZXI7XG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbHRNYW5hZ2VkTWNwQmxvY2sge1xuICBibG9jazogc3RyaW5nO1xuICBzZXJ2ZXJOYW1lczogc3RyaW5nW107XG4gIHNraXBwZWRTZXJ2ZXJOYW1lczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFuYWdlZE1jcFN5bmNSZXN1bHQgZXh0ZW5kcyBCdWlsdE1hbmFnZWRNY3BCbG9jayB7XG4gIGNoYW5nZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzeW5jTWFuYWdlZE1jcFNlcnZlcnMoe1xuICBjb25maWdQYXRoLFxuICB0d2Vha3MsXG59OiB7XG4gIGNvbmZpZ1BhdGg6IHN0cmluZztcbiAgdHdlYWtzOiBNY3BTeW5jVHdlYWtbXTtcbn0pOiBNYW5hZ2VkTWNwU3luY1Jlc3VsdCB7XG4gIGNvbnN0IGN1cnJlbnQgPSBleGlzdHNTeW5jKGNvbmZpZ1BhdGgpID8gcmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsIFwidXRmOFwiKSA6IFwiXCI7XG4gIGNvbnN0IGJ1aWx0ID0gYnVpbGRNYW5hZ2VkTWNwQmxvY2sodHdlYWtzLCBjdXJyZW50KTtcbiAgY29uc3QgbmV4dCA9IG1lcmdlTWFuYWdlZE1jcEJsb2NrKGN1cnJlbnQsIGJ1aWx0LmJsb2NrKTtcblxuICBpZiAobmV4dCAhPT0gY3VycmVudCkge1xuICAgIG1rZGlyU3luYyhkaXJuYW1lKGNvbmZpZ1BhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB3cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIG5leHQsIFwidXRmOFwiKTtcbiAgfVxuXG4gIHJldHVybiB7IC4uLmJ1aWx0LCBjaGFuZ2VkOiBuZXh0ICE9PSBjdXJyZW50IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1hbmFnZWRNY3BCbG9jayhcbiAgdHdlYWtzOiBNY3BTeW5jVHdlYWtbXSxcbiAgZXhpc3RpbmdUb21sID0gXCJcIixcbik6IEJ1aWx0TWFuYWdlZE1jcEJsb2NrIHtcbiAgY29uc3QgbWFudWFsVG9tbCA9IHN0cmlwTWFuYWdlZE1jcEJsb2NrKGV4aXN0aW5nVG9tbCk7XG4gIGNvbnN0IG1hbnVhbE5hbWVzID0gZmluZE1jcFNlcnZlck5hbWVzKG1hbnVhbFRvbWwpO1xuICBjb25zdCB1c2VkTmFtZXMgPSBuZXcgU2V0KG1hbnVhbE5hbWVzKTtcbiAgY29uc3Qgc2VydmVyTmFtZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHNraXBwZWRTZXJ2ZXJOYW1lczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHR3ZWFrIG9mIHR3ZWFrcykge1xuICAgIGNvbnN0IG1jcCA9IG5vcm1hbGl6ZU1jcFNlcnZlcih0d2Vhay5tYW5pZmVzdC5tY3ApO1xuICAgIGlmICghbWNwKSBjb250aW51ZTtcblxuICAgIGNvbnN0IGJhc2VOYW1lID0gbWNwU2VydmVyTmFtZUZyb21Ud2Vha0lkKHR3ZWFrLm1hbmlmZXN0LmlkKTtcbiAgICBpZiAobWFudWFsTmFtZXMuaGFzKGJhc2VOYW1lKSkge1xuICAgICAgc2tpcHBlZFNlcnZlck5hbWVzLnB1c2goYmFzZU5hbWUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyTmFtZSA9IHJlc2VydmVVbmlxdWVOYW1lKGJhc2VOYW1lLCB1c2VkTmFtZXMpO1xuICAgIHNlcnZlck5hbWVzLnB1c2goc2VydmVyTmFtZSk7XG4gICAgZW50cmllcy5wdXNoKGZvcm1hdE1jcFNlcnZlcihzZXJ2ZXJOYW1lLCB0d2Vhay5kaXIsIG1jcCkpO1xuICB9XG5cbiAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHsgYmxvY2s6IFwiXCIsIHNlcnZlck5hbWVzLCBza2lwcGVkU2VydmVyTmFtZXMgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmxvY2s6IFtNQ1BfTUFOQUdFRF9TVEFSVCwgLi4uZW50cmllcywgTUNQX01BTkFHRURfRU5EXS5qb2luKFwiXFxuXCIpLFxuICAgIHNlcnZlck5hbWVzLFxuICAgIHNraXBwZWRTZXJ2ZXJOYW1lcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlTWFuYWdlZE1jcEJsb2NrKGN1cnJlbnRUb21sOiBzdHJpbmcsIG1hbmFnZWRCbG9jazogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCFtYW5hZ2VkQmxvY2sgJiYgIWN1cnJlbnRUb21sLmluY2x1ZGVzKE1DUF9NQU5BR0VEX1NUQVJUKSkgcmV0dXJuIGN1cnJlbnRUb21sO1xuICBjb25zdCBzdHJpcHBlZCA9IHN0cmlwTWFuYWdlZE1jcEJsb2NrKGN1cnJlbnRUb21sKS50cmltRW5kKCk7XG4gIGlmICghbWFuYWdlZEJsb2NrKSByZXR1cm4gc3RyaXBwZWQgPyBgJHtzdHJpcHBlZH1cXG5gIDogXCJcIjtcbiAgcmV0dXJuIGAke3N0cmlwcGVkID8gYCR7c3RyaXBwZWR9XFxuXFxuYCA6IFwiXCJ9JHttYW5hZ2VkQmxvY2t9XFxuYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwTWFuYWdlZE1jcEJsb2NrKHRvbWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgIGBcXFxcbj8ke2VzY2FwZVJlZ0V4cChNQ1BfTUFOQUdFRF9TVEFSVCl9W1xcXFxzXFxcXFNdKj8ke2VzY2FwZVJlZ0V4cChNQ1BfTUFOQUdFRF9FTkQpfVxcXFxuP2AsXG4gICAgXCJnXCIsXG4gICk7XG4gIHJldHVybiB0b21sLnJlcGxhY2UocGF0dGVybiwgXCJcXG5cIikucmVwbGFjZSgvXFxuezMsfS9nLCBcIlxcblxcblwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1jcFNlcnZlck5hbWVGcm9tVHdlYWtJZChpZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgd2l0aG91dFB1Ymxpc2hlciA9IGlkLnJlcGxhY2UoL15jb1xcLmJlbm5ldHRcXC4vLCBcIlwiKTtcbiAgY29uc3Qgc2x1ZyA9IHdpdGhvdXRQdWJsaXNoZXJcbiAgICAucmVwbGFjZSgvW15hLXpBLVowLTlfLV0rL2csIFwiLVwiKVxuICAgIC5yZXBsYWNlKC9eLSt8LSskL2csIFwiXCIpXG4gICAgLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiBzbHVnIHx8IFwidHdlYWstbWNwXCI7XG59XG5cbmZ1bmN0aW9uIGZpbmRNY3BTZXJ2ZXJOYW1lcyh0b21sOiBzdHJpbmcpOiBTZXQ8c3RyaW5nPiB7XG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHRhYmxlUGF0dGVybiA9IC9eXFxzKlxcW21jcF9zZXJ2ZXJzXFwuKFteXFxdXFxzXSspXFxdXFxzKiQvZ207XG4gIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgd2hpbGUgKChtYXRjaCA9IHRhYmxlUGF0dGVybi5leGVjKHRvbWwpKSAhPT0gbnVsbCkge1xuICAgIG5hbWVzLmFkZCh1bnF1b3RlVG9tbEtleShtYXRjaFsxXSA/PyBcIlwiKSk7XG4gIH1cbiAgcmV0dXJuIG5hbWVzO1xufVxuXG5mdW5jdGlvbiByZXNlcnZlVW5pcXVlTmFtZShiYXNlTmFtZTogc3RyaW5nLCB1c2VkTmFtZXM6IFNldDxzdHJpbmc+KTogc3RyaW5nIHtcbiAgaWYgKCF1c2VkTmFtZXMuaGFzKGJhc2VOYW1lKSkge1xuICAgIHVzZWROYW1lcy5hZGQoYmFzZU5hbWUpO1xuICAgIHJldHVybiBiYXNlTmFtZTtcbiAgfVxuICBmb3IgKGxldCBpID0gMjsgOyBpICs9IDEpIHtcbiAgICBjb25zdCBjYW5kaWRhdGUgPSBgJHtiYXNlTmFtZX0tJHtpfWA7XG4gICAgaWYgKCF1c2VkTmFtZXMuaGFzKGNhbmRpZGF0ZSkpIHtcbiAgICAgIHVzZWROYW1lcy5hZGQoY2FuZGlkYXRlKTtcbiAgICAgIHJldHVybiBjYW5kaWRhdGU7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU1jcFNlcnZlcih2YWx1ZTogVHdlYWtNY3BTZXJ2ZXIgfCB1bmRlZmluZWQpOiBUd2Vha01jcFNlcnZlciB8IG51bGwge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZS5jb21tYW5kICE9PSBcInN0cmluZ1wiIHx8IHZhbHVlLmNvbW1hbmQubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgaWYgKHZhbHVlLmFyZ3MgIT09IHVuZGVmaW5lZCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZS5hcmdzKSkgcmV0dXJuIG51bGw7XG4gIGlmICh2YWx1ZS5hcmdzPy5zb21lKChhcmcpID0+IHR5cGVvZiBhcmcgIT09IFwic3RyaW5nXCIpKSByZXR1cm4gbnVsbDtcbiAgaWYgKHZhbHVlLmVudiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKCF2YWx1ZS5lbnYgfHwgdHlwZW9mIHZhbHVlLmVudiAhPT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KHZhbHVlLmVudikpIHJldHVybiBudWxsO1xuICAgIGlmIChPYmplY3QudmFsdWVzKHZhbHVlLmVudikuc29tZSgoZW52VmFsdWUpID0+IHR5cGVvZiBlbnZWYWx1ZSAhPT0gXCJzdHJpbmdcIikpIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0TWNwU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZywgdHdlYWtEaXI6IHN0cmluZywgbWNwOiBUd2Vha01jcFNlcnZlcik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzID0gW1xuICAgIGBbbWNwX3NlcnZlcnMuJHtmb3JtYXRUb21sS2V5KHNlcnZlck5hbWUpfV1gLFxuICAgIGBjb21tYW5kID0gJHtmb3JtYXRUb21sU3RyaW5nKHJlc29sdmVDb21tYW5kKHR3ZWFrRGlyLCBtY3AuY29tbWFuZCkpfWAsXG4gIF07XG5cbiAgaWYgKG1jcC5hcmdzICYmIG1jcC5hcmdzLmxlbmd0aCA+IDApIHtcbiAgICBsaW5lcy5wdXNoKGBhcmdzID0gJHtmb3JtYXRUb21sU3RyaW5nQXJyYXkobWNwLmFyZ3MubWFwKChhcmcpID0+IHJlc29sdmVBcmcodHdlYWtEaXIsIGFyZykpKX1gKTtcbiAgfVxuXG4gIGlmIChtY3AuZW52ICYmIE9iamVjdC5rZXlzKG1jcC5lbnYpLmxlbmd0aCA+IDApIHtcbiAgICBsaW5lcy5wdXNoKGBlbnYgPSAke2Zvcm1hdFRvbWxJbmxpbmVUYWJsZShtY3AuZW52KX1gKTtcbiAgfVxuXG4gIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQ29tbWFuZCh0d2Vha0Rpcjogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoaXNBYnNvbHV0ZShjb21tYW5kKSB8fCAhbG9va3NMaWtlUmVsYXRpdmVQYXRoKGNvbW1hbmQpKSByZXR1cm4gY29tbWFuZDtcbiAgcmV0dXJuIHJlc29sdmUodHdlYWtEaXIsIGNvbW1hbmQpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQXJnKHR3ZWFrRGlyOiBzdHJpbmcsIGFyZzogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKGlzQWJzb2x1dGUoYXJnKSB8fCBhcmcuc3RhcnRzV2l0aChcIi1cIikpIHJldHVybiBhcmc7XG4gIGNvbnN0IGNhbmRpZGF0ZSA9IHJlc29sdmUodHdlYWtEaXIsIGFyZyk7XG4gIHJldHVybiBleGlzdHNTeW5jKGNhbmRpZGF0ZSkgPyBjYW5kaWRhdGUgOiBhcmc7XG59XG5cbmZ1bmN0aW9uIGxvb2tzTGlrZVJlbGF0aXZlUGF0aCh2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZS5zdGFydHNXaXRoKFwiLi9cIikgfHwgdmFsdWUuc3RhcnRzV2l0aChcIi4uL1wiKSB8fCB2YWx1ZS5pbmNsdWRlcyhcIi9cIik7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRvbWxTdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRvbWxTdHJpbmdBcnJheSh2YWx1ZXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBbJHt2YWx1ZXMubWFwKGZvcm1hdFRvbWxTdHJpbmcpLmpvaW4oXCIsIFwiKX1dYDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VG9tbElubGluZVRhYmxlKHJlY29yZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB7XG4gIHJldHVybiBgeyAke09iamVjdC5lbnRyaWVzKHJlY29yZClcbiAgICAubWFwKChba2V5LCB2YWx1ZV0pID0+IGAke2Zvcm1hdFRvbWxLZXkoa2V5KX0gPSAke2Zvcm1hdFRvbWxTdHJpbmcodmFsdWUpfWApXG4gICAgLmpvaW4oXCIsIFwiKX0gfWA7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRvbWxLZXkoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gL15bYS16QS1aMC05Xy1dKyQvLnRlc3Qoa2V5KSA/IGtleSA6IGZvcm1hdFRvbWxTdHJpbmcoa2V5KTtcbn1cblxuZnVuY3Rpb24gdW5xdW90ZVRvbWxLZXkoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIWtleS5zdGFydHNXaXRoKCdcIicpIHx8ICFrZXkuZW5kc1dpdGgoJ1wiJykpIHJldHVybiBrZXk7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2Uoa2V5KSBhcyBzdHJpbmc7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBrZXk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuIiwgImltcG9ydCB7IGV4ZWNGaWxlU3luYyB9IGZyb20gXCJub2RlOmNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBob21lZGlyLCBwbGF0Zm9ybSB9IGZyb20gXCJub2RlOm9zXCI7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuXG50eXBlIENoZWNrU3RhdHVzID0gXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzdGF0dXM6IENoZWNrU3RhdHVzO1xuICBkZXRhaWw6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXRjaGVySGVhbHRoIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIHN0YXR1czogQ2hlY2tTdGF0dXM7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk6IHN0cmluZztcbiAgd2F0Y2hlcjogc3RyaW5nO1xuICBjaGVja3M6IFdhdGNoZXJIZWFsdGhDaGVja1tdO1xufVxuXG5pbnRlcmZhY2UgSW5zdGFsbGVyU3RhdGUge1xuICBhcHBSb290Pzogc3RyaW5nO1xuICB2ZXJzaW9uPzogc3RyaW5nO1xuICB3YXRjaGVyPzogXCJsYXVuY2hkXCIgfCBcImxvZ2luLWl0ZW1cIiB8IFwic2NoZWR1bGVkLXRhc2tcIiB8IFwic3lzdGVtZFwiIHwgXCJub25lXCI7XG59XG5cbmludGVyZmFjZSBSdW50aW1lQ29uZmlnIHtcbiAgY29kZXhQbHVzUGx1cz86IHtcbiAgICBhdXRvVXBkYXRlPzogYm9vbGVhbjtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIFNlbGZVcGRhdGVTdGF0ZSB7XG4gIHN0YXR1cz86IFwiY2hlY2tpbmdcIiB8IFwidXAtdG8tZGF0ZVwiIHwgXCJ1cGRhdGVkXCIgfCBcImZhaWxlZFwiIHwgXCJkaXNhYmxlZFwiO1xuICBjb21wbGV0ZWRBdD86IHN0cmluZztcbiAgY2hlY2tlZEF0Pzogc3RyaW5nO1xuICBsYXRlc3RWZXJzaW9uPzogc3RyaW5nIHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmNvbnN0IExBVU5DSERfTEFCRUwgPSBcImNvbS5jb2RleHBsdXNwbHVzLndhdGNoZXJcIjtcbmNvbnN0IFdBVENIRVJfTE9HID0gam9pbihob21lZGlyKCksIFwiTGlicmFyeVwiLCBcIkxvZ3NcIiwgXCJjb2RleC1wbHVzcGx1cy13YXRjaGVyLmxvZ1wiKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdhdGNoZXJIZWFsdGgodXNlclJvb3Q6IHN0cmluZyk6IFdhdGNoZXJIZWFsdGgge1xuICBjb25zdCBjaGVja3M6IFdhdGNoZXJIZWFsdGhDaGVja1tdID0gW107XG4gIGNvbnN0IHN0YXRlID0gcmVhZEpzb248SW5zdGFsbGVyU3RhdGU+KGpvaW4odXNlclJvb3QsIFwic3RhdGUuanNvblwiKSk7XG4gIGNvbnN0IGNvbmZpZyA9IHJlYWRKc29uPFJ1bnRpbWVDb25maWc+KGpvaW4odXNlclJvb3QsIFwiY29uZmlnLmpzb25cIikpID8/IHt9O1xuICBjb25zdCBzZWxmVXBkYXRlID0gcmVhZEpzb248U2VsZlVwZGF0ZVN0YXRlPihqb2luKHVzZXJSb290LCBcInNlbGYtdXBkYXRlLXN0YXRlLmpzb25cIikpO1xuXG4gIGNoZWNrcy5wdXNoKHtcbiAgICBuYW1lOiBcIkluc3RhbGwgc3RhdGVcIixcbiAgICBzdGF0dXM6IHN0YXRlID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgIGRldGFpbDogc3RhdGUgPyBgQ29kZXgrKyAke3N0YXRlLnZlcnNpb24gPz8gXCIodW5rbm93biB2ZXJzaW9uKVwifWAgOiBcInN0YXRlLmpzb24gaXMgbWlzc2luZ1wiLFxuICB9KTtcblxuICBpZiAoIXN0YXRlKSByZXR1cm4gc3VtbWFyaXplKFwibm9uZVwiLCBjaGVja3MpO1xuXG4gIGNvbnN0IGF1dG9VcGRhdGUgPSBjb25maWcuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2U7XG4gIGNoZWNrcy5wdXNoKHtcbiAgICBuYW1lOiBcIkF1dG9tYXRpYyByZWZyZXNoXCIsXG4gICAgc3RhdHVzOiBhdXRvVXBkYXRlID8gXCJva1wiIDogXCJ3YXJuXCIsXG4gICAgZGV0YWlsOiBhdXRvVXBkYXRlID8gXCJlbmFibGVkXCIgOiBcImRpc2FibGVkIGluIENvZGV4KysgY29uZmlnXCIsXG4gIH0pO1xuXG4gIGNoZWNrcy5wdXNoKHtcbiAgICBuYW1lOiBcIldhdGNoZXIga2luZFwiLFxuICAgIHN0YXR1czogc3RhdGUud2F0Y2hlciAmJiBzdGF0ZS53YXRjaGVyICE9PSBcIm5vbmVcIiA/IFwib2tcIiA6IFwiZXJyb3JcIixcbiAgICBkZXRhaWw6IHN0YXRlLndhdGNoZXIgPz8gXCJub25lXCIsXG4gIH0pO1xuXG4gIGlmIChzZWxmVXBkYXRlKSB7XG4gICAgY2hlY2tzLnB1c2goc2VsZlVwZGF0ZUNoZWNrKHNlbGZVcGRhdGUpKTtcbiAgfVxuXG4gIGNvbnN0IGFwcFJvb3QgPSBzdGF0ZS5hcHBSb290ID8/IFwiXCI7XG4gIGNoZWNrcy5wdXNoKHtcbiAgICBuYW1lOiBcIkNvZGV4IGFwcFwiLFxuICAgIHN0YXR1czogYXBwUm9vdCAmJiBleGlzdHNTeW5jKGFwcFJvb3QpID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgIGRldGFpbDogYXBwUm9vdCB8fCBcIm1pc3NpbmcgYXBwUm9vdCBpbiBzdGF0ZVwiLFxuICB9KTtcblxuICBzd2l0Y2ggKHBsYXRmb3JtKCkpIHtcbiAgICBjYXNlIFwiZGFyd2luXCI6XG4gICAgICBjaGVja3MucHVzaCguLi5jaGVja0xhdW5jaGRXYXRjaGVyKGFwcFJvb3QpKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW51eFwiOlxuICAgICAgY2hlY2tzLnB1c2goLi4uY2hlY2tTeXN0ZW1kV2F0Y2hlcihhcHBSb290KSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwid2luMzJcIjpcbiAgICAgIGNoZWNrcy5wdXNoKC4uLmNoZWNrU2NoZWR1bGVkVGFza1dhdGNoZXIoKSk7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgY2hlY2tzLnB1c2goe1xuICAgICAgICBuYW1lOiBcIlBsYXRmb3JtIHdhdGNoZXJcIixcbiAgICAgICAgc3RhdHVzOiBcIndhcm5cIixcbiAgICAgICAgZGV0YWlsOiBgdW5zdXBwb3J0ZWQgcGxhdGZvcm06ICR7cGxhdGZvcm0oKX1gLFxuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gc3VtbWFyaXplKHN0YXRlLndhdGNoZXIgPz8gXCJub25lXCIsIGNoZWNrcyk7XG59XG5cbmZ1bmN0aW9uIHNlbGZVcGRhdGVDaGVjayhzdGF0ZTogU2VsZlVwZGF0ZVN0YXRlKTogV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgY29uc3QgYXQgPSBzdGF0ZS5jb21wbGV0ZWRBdCA/PyBzdGF0ZS5jaGVja2VkQXQgPz8gXCJ1bmtub3duIHRpbWVcIjtcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJmYWlsZWRcIikge1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBcImxhc3QgQ29kZXgrKyB1cGRhdGVcIixcbiAgICAgIHN0YXR1czogXCJ3YXJuXCIsXG4gICAgICBkZXRhaWw6IHN0YXRlLmVycm9yID8gYGZhaWxlZCAke2F0fTogJHtzdGF0ZS5lcnJvcn1gIDogYGZhaWxlZCAke2F0fWAsXG4gICAgfTtcbiAgfVxuICBpZiAoc3RhdGUuc3RhdHVzID09PSBcImRpc2FibGVkXCIpIHtcbiAgICByZXR1cm4geyBuYW1lOiBcImxhc3QgQ29kZXgrKyB1cGRhdGVcIiwgc3RhdHVzOiBcIndhcm5cIiwgZGV0YWlsOiBgc2tpcHBlZCAke2F0fTogYXV0b21hdGljIHJlZnJlc2ggZGlzYWJsZWRgIH07XG4gIH1cbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJ1cGRhdGVkXCIpIHtcbiAgICByZXR1cm4geyBuYW1lOiBcImxhc3QgQ29kZXgrKyB1cGRhdGVcIiwgc3RhdHVzOiBcIm9rXCIsIGRldGFpbDogYHVwZGF0ZWQgJHthdH0gdG8gJHtzdGF0ZS5sYXRlc3RWZXJzaW9uID8/IFwibmV3IHJlbGVhc2VcIn1gIH07XG4gIH1cbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJ1cC10by1kYXRlXCIpIHtcbiAgICByZXR1cm4geyBuYW1lOiBcImxhc3QgQ29kZXgrKyB1cGRhdGVcIiwgc3RhdHVzOiBcIm9rXCIsIGRldGFpbDogYHVwIHRvIGRhdGUgJHthdH1gIH07XG4gIH1cbiAgcmV0dXJuIHsgbmFtZTogXCJsYXN0IENvZGV4KysgdXBkYXRlXCIsIHN0YXR1czogXCJ3YXJuXCIsIGRldGFpbDogYGNoZWNraW5nIHNpbmNlICR7YXR9YCB9O1xufVxuXG5mdW5jdGlvbiBjaGVja0xhdW5jaGRXYXRjaGVyKGFwcFJvb3Q6IHN0cmluZyk6IFdhdGNoZXJIZWFsdGhDaGVja1tdIHtcbiAgY29uc3QgY2hlY2tzOiBXYXRjaGVySGVhbHRoQ2hlY2tbXSA9IFtdO1xuICBjb25zdCBwbGlzdFBhdGggPSBqb2luKGhvbWVkaXIoKSwgXCJMaWJyYXJ5XCIsIFwiTGF1bmNoQWdlbnRzXCIsIGAke0xBVU5DSERfTEFCRUx9LnBsaXN0YCk7XG4gIGNvbnN0IHBsaXN0ID0gZXhpc3RzU3luYyhwbGlzdFBhdGgpID8gcmVhZEZpbGVTYWZlKHBsaXN0UGF0aCkgOiBcIlwiO1xuICBjb25zdCBhc2FyUGF0aCA9IGFwcFJvb3QgPyBqb2luKGFwcFJvb3QsIFwiQ29udGVudHNcIiwgXCJSZXNvdXJjZXNcIiwgXCJhcHAuYXNhclwiKSA6IFwiXCI7XG5cbiAgY2hlY2tzLnB1c2goe1xuICAgIG5hbWU6IFwibGF1bmNoZCBwbGlzdFwiLFxuICAgIHN0YXR1czogcGxpc3QgPyBcIm9rXCIgOiBcImVycm9yXCIsXG4gICAgZGV0YWlsOiBwbGlzdFBhdGgsXG4gIH0pO1xuXG4gIGlmIChwbGlzdCkge1xuICAgIGNoZWNrcy5wdXNoKHtcbiAgICAgIG5hbWU6IFwibGF1bmNoZCBsYWJlbFwiLFxuICAgICAgc3RhdHVzOiBwbGlzdC5pbmNsdWRlcyhMQVVOQ0hEX0xBQkVMKSA/IFwib2tcIiA6IFwiZXJyb3JcIixcbiAgICAgIGRldGFpbDogTEFVTkNIRF9MQUJFTCxcbiAgICB9KTtcbiAgICBjaGVja3MucHVzaCh7XG4gICAgICBuYW1lOiBcImxhdW5jaGQgdHJpZ2dlclwiLFxuICAgICAgc3RhdHVzOiBhc2FyUGF0aCAmJiBwbGlzdC5pbmNsdWRlcyhhc2FyUGF0aCkgPyBcIm9rXCIgOiBcImVycm9yXCIsXG4gICAgICBkZXRhaWw6IGFzYXJQYXRoIHx8IFwibWlzc2luZyBhcHBSb290XCIsXG4gICAgfSk7XG4gICAgY2hlY2tzLnB1c2goe1xuICAgICAgbmFtZTogXCJ3YXRjaGVyIGNvbW1hbmRcIixcbiAgICAgIHN0YXR1czogcGxpc3QuaW5jbHVkZXMoXCJDT0RFWF9QTFVTUExVU19XQVRDSEVSPTFcIikgJiYgcGxpc3QuaW5jbHVkZXMoXCIgdXBkYXRlIC0td2F0Y2hlciAtLXF1aWV0XCIpXG4gICAgICAgID8gXCJva1wiXG4gICAgICAgIDogXCJlcnJvclwiLFxuICAgICAgZGV0YWlsOiBjb21tYW5kU3VtbWFyeShwbGlzdCksXG4gICAgfSk7XG5cbiAgICBjb25zdCBjbGlQYXRoID0gZXh0cmFjdEZpcnN0KHBsaXN0LCAvJyhbXiddKnBhY2thZ2VzXFwvaW5zdGFsbGVyXFwvZGlzdFxcL2NsaVxcLmpzKScvKTtcbiAgICBpZiAoY2xpUGF0aCkge1xuICAgICAgY2hlY2tzLnB1c2goe1xuICAgICAgICBuYW1lOiBcInJlcGFpciBDTElcIixcbiAgICAgICAgc3RhdHVzOiBleGlzdHNTeW5jKGNsaVBhdGgpID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgICAgICBkZXRhaWw6IGNsaVBhdGgsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBsb2FkZWQgPSBjb21tYW5kU3VjY2VlZHMoXCJsYXVuY2hjdGxcIiwgW1wibGlzdFwiLCBMQVVOQ0hEX0xBQkVMXSk7XG4gIGNoZWNrcy5wdXNoKHtcbiAgICBuYW1lOiBcImxhdW5jaGQgbG9hZGVkXCIsXG4gICAgc3RhdHVzOiBsb2FkZWQgPyBcIm9rXCIgOiBcImVycm9yXCIsXG4gICAgZGV0YWlsOiBsb2FkZWQgPyBcInNlcnZpY2UgaXMgbG9hZGVkXCIgOiBcImxhdW5jaGN0bCBjYW5ub3QgZmluZCB0aGUgd2F0Y2hlclwiLFxuICB9KTtcblxuICBjaGVja3MucHVzaCh3YXRjaGVyTG9nQ2hlY2soKSk7XG4gIHJldHVybiBjaGVja3M7XG59XG5cbmZ1bmN0aW9uIGNoZWNrU3lzdGVtZFdhdGNoZXIoYXBwUm9vdDogc3RyaW5nKTogV2F0Y2hlckhlYWx0aENoZWNrW10ge1xuICBjb25zdCBkaXIgPSBqb2luKGhvbWVkaXIoKSwgXCIuY29uZmlnXCIsIFwic3lzdGVtZFwiLCBcInVzZXJcIik7XG4gIGNvbnN0IHNlcnZpY2UgPSBqb2luKGRpciwgXCJjb2RleC1wbHVzcGx1cy13YXRjaGVyLnNlcnZpY2VcIik7XG4gIGNvbnN0IHRpbWVyID0gam9pbihkaXIsIFwiY29kZXgtcGx1c3BsdXMtd2F0Y2hlci50aW1lclwiKTtcbiAgY29uc3QgcGF0aFVuaXQgPSBqb2luKGRpciwgXCJjb2RleC1wbHVzcGx1cy13YXRjaGVyLnBhdGhcIik7XG4gIGNvbnN0IGV4cGVjdGVkUGF0aCA9IGFwcFJvb3QgPyBqb2luKGFwcFJvb3QsIFwicmVzb3VyY2VzXCIsIFwiYXBwLmFzYXJcIikgOiBcIlwiO1xuICBjb25zdCBwYXRoQm9keSA9IGV4aXN0c1N5bmMocGF0aFVuaXQpID8gcmVhZEZpbGVTYWZlKHBhdGhVbml0KSA6IFwiXCI7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBuYW1lOiBcInN5c3RlbWQgc2VydmljZVwiLFxuICAgICAgc3RhdHVzOiBleGlzdHNTeW5jKHNlcnZpY2UpID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgICAgZGV0YWlsOiBzZXJ2aWNlLFxuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogXCJzeXN0ZW1kIHRpbWVyXCIsXG4gICAgICBzdGF0dXM6IGV4aXN0c1N5bmModGltZXIpID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgICAgZGV0YWlsOiB0aW1lcixcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6IFwic3lzdGVtZCBwYXRoXCIsXG4gICAgICBzdGF0dXM6IHBhdGhCb2R5ICYmIGV4cGVjdGVkUGF0aCAmJiBwYXRoQm9keS5pbmNsdWRlcyhleHBlY3RlZFBhdGgpID8gXCJva1wiIDogXCJlcnJvclwiLFxuICAgICAgZGV0YWlsOiBleHBlY3RlZFBhdGggfHwgcGF0aFVuaXQsXG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiBcInBhdGggdW5pdCBhY3RpdmVcIixcbiAgICAgIHN0YXR1czogY29tbWFuZFN1Y2NlZWRzKFwic3lzdGVtY3RsXCIsIFtcIi0tdXNlclwiLCBcImlzLWFjdGl2ZVwiLCBcIi0tcXVpZXRcIiwgXCJjb2RleC1wbHVzcGx1cy13YXRjaGVyLnBhdGhcIl0pID8gXCJva1wiIDogXCJ3YXJuXCIsXG4gICAgICBkZXRhaWw6IFwic3lzdGVtY3RsIC0tdXNlciBpcy1hY3RpdmUgY29kZXgtcGx1c3BsdXMtd2F0Y2hlci5wYXRoXCIsXG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiBcInRpbWVyIGFjdGl2ZVwiLFxuICAgICAgc3RhdHVzOiBjb21tYW5kU3VjY2VlZHMoXCJzeXN0ZW1jdGxcIiwgW1wiLS11c2VyXCIsIFwiaXMtYWN0aXZlXCIsIFwiLS1xdWlldFwiLCBcImNvZGV4LXBsdXNwbHVzLXdhdGNoZXIudGltZXJcIl0pID8gXCJva1wiIDogXCJ3YXJuXCIsXG4gICAgICBkZXRhaWw6IFwic3lzdGVtY3RsIC0tdXNlciBpcy1hY3RpdmUgY29kZXgtcGx1c3BsdXMtd2F0Y2hlci50aW1lclwiLFxuICAgIH0sXG4gIF07XG59XG5cbmZ1bmN0aW9uIGNoZWNrU2NoZWR1bGVkVGFza1dhdGNoZXIoKTogV2F0Y2hlckhlYWx0aENoZWNrW10ge1xuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIG5hbWU6IFwibG9nb24gdGFza1wiLFxuICAgICAgc3RhdHVzOiBjb21tYW5kU3VjY2VlZHMoXCJzY2h0YXNrcy5leGVcIiwgW1wiL1F1ZXJ5XCIsIFwiL1ROXCIsIFwiY29kZXgtcGx1c3BsdXMtd2F0Y2hlclwiXSkgPyBcIm9rXCIgOiBcImVycm9yXCIsXG4gICAgICBkZXRhaWw6IFwiY29kZXgtcGx1c3BsdXMtd2F0Y2hlclwiLFxuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogXCJob3VybHkgdGFza1wiLFxuICAgICAgc3RhdHVzOiBjb21tYW5kU3VjY2VlZHMoXCJzY2h0YXNrcy5leGVcIiwgW1wiL1F1ZXJ5XCIsIFwiL1ROXCIsIFwiY29kZXgtcGx1c3BsdXMtd2F0Y2hlci1ob3VybHlcIl0pID8gXCJva1wiIDogXCJ3YXJuXCIsXG4gICAgICBkZXRhaWw6IFwiY29kZXgtcGx1c3BsdXMtd2F0Y2hlci1ob3VybHlcIixcbiAgICB9LFxuICBdO1xufVxuXG5mdW5jdGlvbiB3YXRjaGVyTG9nQ2hlY2soKTogV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgaWYgKCFleGlzdHNTeW5jKFdBVENIRVJfTE9HKSkge1xuICAgIHJldHVybiB7IG5hbWU6IFwid2F0Y2hlciBsb2dcIiwgc3RhdHVzOiBcIndhcm5cIiwgZGV0YWlsOiBcIm5vIHdhdGNoZXIgbG9nIHlldFwiIH07XG4gIH1cbiAgY29uc3QgdGFpbCA9IHJlYWRGaWxlU2FmZShXQVRDSEVSX0xPRykuc3BsaXQoL1xccj9cXG4vKS5zbGljZSgtNDApLmpvaW4oXCJcXG5cIik7XG4gIHJldHVybiBhbmFseXplV2F0Y2hlckxvZ1RhaWwodGFpbCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbmFseXplV2F0Y2hlckxvZ1RhaWwodGFpbDogc3RyaW5nKTogV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgY29uc3QgaGFzRXJyb3IgPSAvXHUyNzE3IGNvZGV4LXBsdXNwbHVzIGZhaWxlZHxjb2RleC1wbHVzcGx1cyBmYWlsZWR8ZXJyb3J8ZmFpbGVkL2kudGVzdCh0YWlsKTtcbiAgY29uc3QgbmVlZHNNYW51YWxSZXBhaXIgPVxuICAgIGhhc0Vycm9yICYmXG4gICAgL0Nhbm5vdCB3cml0ZSB0byAuKkNvZGV4LipcXC5hcHB8QXBwIE1hbmFnZW1lbnR8ZmlsZSBvd25lcnNoaXB8c3VkbyBjb2RleHBsdXNwbHVzICg/Omluc3RhbGx8cmVwYWlyKXxFQUNDRVN8RVBFUk0vaS50ZXN0KHRhaWwpO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IFwid2F0Y2hlciBsb2dcIixcbiAgICBzdGF0dXM6IGhhc0Vycm9yID8gXCJ3YXJuXCIgOiBcIm9rXCIsXG4gICAgZGV0YWlsOiBoYXNFcnJvclxuICAgICAgPyBuZWVkc01hbnVhbFJlcGFpclxuICAgICAgICA/IFwiYXV0by1yZXBhaXIgbmVlZHMgYXBwIHBlcm1pc3Npb25zOyBydW4gYGNvZGV4cGx1c3BsdXMgcmVwYWlyYCBmcm9tIFRlcm1pbmFsXCJcbiAgICAgICAgOiBcInJlY2VudCB3YXRjaGVyIGxvZyBjb250YWlucyBhbiBlcnJvclwiXG4gICAgICA6IFdBVENIRVJfTE9HLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzdW1tYXJpemUod2F0Y2hlcjogc3RyaW5nLCBjaGVja3M6IFdhdGNoZXJIZWFsdGhDaGVja1tdKTogV2F0Y2hlckhlYWx0aCB7XG4gIGNvbnN0IGhhc0Vycm9yID0gY2hlY2tzLnNvbWUoKGMpID0+IGMuc3RhdHVzID09PSBcImVycm9yXCIpO1xuICBjb25zdCBoYXNXYXJuID0gY2hlY2tzLnNvbWUoKGMpID0+IGMuc3RhdHVzID09PSBcIndhcm5cIik7XG4gIGNvbnN0IHN0YXR1czogQ2hlY2tTdGF0dXMgPSBoYXNFcnJvciA/IFwiZXJyb3JcIiA6IGhhc1dhcm4gPyBcIndhcm5cIiA6IFwib2tcIjtcbiAgY29uc3QgZmFpbGVkID0gY2hlY2tzLmZpbHRlcigoYykgPT4gYy5zdGF0dXMgPT09IFwiZXJyb3JcIikubGVuZ3RoO1xuICBjb25zdCB3YXJuZWQgPSBjaGVja3MuZmlsdGVyKChjKSA9PiBjLnN0YXR1cyA9PT0gXCJ3YXJuXCIpLmxlbmd0aDtcbiAgY29uc3QgdGl0bGUgPVxuICAgIHN0YXR1cyA9PT0gXCJva1wiXG4gICAgICA/IFwiQXV0by1yZXBhaXIgd2F0Y2hlciBpcyByZWFkeVwiXG4gICAgICA6IHN0YXR1cyA9PT0gXCJ3YXJuXCJcbiAgICAgICAgPyBcIkF1dG8tcmVwYWlyIHdhdGNoZXIgbmVlZHMgcmV2aWV3XCJcbiAgICAgICAgOiBcIkF1dG8tcmVwYWlyIHdhdGNoZXIgaXMgbm90IHJlYWR5XCI7XG4gIGNvbnN0IHN1bW1hcnkgPVxuICAgIHN0YXR1cyA9PT0gXCJva1wiXG4gICAgICA/IFwiQ29kZXgrKyBzaG91bGQgYXV0b21hdGljYWxseSByZXBhaXIgaXRzZWxmIGFmdGVyIENvZGV4IHVwZGF0ZXMuXCJcbiAgICAgIDogYCR7ZmFpbGVkfSBmYWlsaW5nIGNoZWNrKHMpLCAke3dhcm5lZH0gd2FybmluZyhzKS5gO1xuXG4gIHJldHVybiB7XG4gICAgY2hlY2tlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgc3RhdHVzLFxuICAgIHRpdGxlLFxuICAgIHN1bW1hcnksXG4gICAgd2F0Y2hlcixcbiAgICBjaGVja3MsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRTdWNjZWVkcyhjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgZXhlY0ZpbGVTeW5jKGNvbW1hbmQsIGFyZ3MsIHsgc3RkaW86IFwiaWdub3JlXCIsIHRpbWVvdXQ6IDVfMDAwIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29tbWFuZFN1bW1hcnkocGxpc3Q6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGNvbW1hbmQgPSBleHRyYWN0Rmlyc3QocGxpc3QsIC88c3RyaW5nPihbXjxdKig/OnVwZGF0ZSAtLXdhdGNoZXIgLS1xdWlldHxyZXBhaXIgLS1xdWlldClbXjxdKik8XFwvc3RyaW5nPi8pO1xuICByZXR1cm4gY29tbWFuZCA/IHVuZXNjYXBlWG1sKGNvbW1hbmQpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKSA6IFwid2F0Y2hlciBjb21tYW5kIG5vdCBmb3VuZFwiO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Rmlyc3Qoc291cmNlOiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCk6IHN0cmluZyB8IG51bGwge1xuICByZXR1cm4gc291cmNlLm1hdGNoKHBhdHRlcm4pPy5bMV0gPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVhZEpzb248VD4ocGF0aDogc3RyaW5nKTogVCB8IG51bGwge1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhwYXRoLCBcInV0ZjhcIikpIGFzIFQ7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRGaWxlU2FmZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiByZWFkRmlsZVN5bmMocGF0aCwgXCJ1dGY4XCIpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB1bmVzY2FwZVhtbCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlXG4gICAgLnJlcGxhY2UoLyZxdW90Oy9nLCBcIlxcXCJcIilcbiAgICAucmVwbGFjZSgvJmFwb3M7L2csIFwiJ1wiKVxuICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgIC5yZXBsYWNlKC8mZ3Q7L2csIFwiPlwiKVxuICAgIC5yZXBsYWNlKC8mYW1wOy9nLCBcIiZcIik7XG59XG4iLCAiZXhwb3J0IHR5cGUgVHdlYWtTY29wZSA9IFwicmVuZGVyZXJcIiB8IFwibWFpblwiIHwgXCJib3RoXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVsb2FkVHdlYWtzRGVwcyB7XG4gIGxvZ0luZm8obWVzc2FnZTogc3RyaW5nKTogdm9pZDtcbiAgc3RvcEFsbE1haW5Ud2Vha3MoKTogdm9pZDtcbiAgY2xlYXJUd2Vha01vZHVsZUNhY2hlKCk6IHZvaWQ7XG4gIGxvYWRBbGxNYWluVHdlYWtzKCk6IHZvaWQ7XG4gIGJyb2FkY2FzdFJlbG9hZCgpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNldFR3ZWFrRW5hYmxlZEFuZFJlbG9hZERlcHMgZXh0ZW5kcyBSZWxvYWRUd2Vha3NEZXBzIHtcbiAgc2V0VHdlYWtFbmFibGVkKGlkOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNYWluUHJvY2Vzc1R3ZWFrU2NvcGUoc2NvcGU6IFR3ZWFrU2NvcGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcbiAgcmV0dXJuIHNjb3BlICE9PSBcInJlbmRlcmVyXCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWxvYWRUd2Vha3MocmVhc29uOiBzdHJpbmcsIGRlcHM6IFJlbG9hZFR3ZWFrc0RlcHMpOiB2b2lkIHtcbiAgZGVwcy5sb2dJbmZvKGByZWxvYWRpbmcgdHdlYWtzICgke3JlYXNvbn0pYCk7XG4gIGRlcHMuc3RvcEFsbE1haW5Ud2Vha3MoKTtcbiAgZGVwcy5jbGVhclR3ZWFrTW9kdWxlQ2FjaGUoKTtcbiAgZGVwcy5sb2FkQWxsTWFpblR3ZWFrcygpO1xuICBkZXBzLmJyb2FkY2FzdFJlbG9hZCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0VHdlYWtFbmFibGVkQW5kUmVsb2FkKFxuICBpZDogc3RyaW5nLFxuICBlbmFibGVkOiB1bmtub3duLFxuICBkZXBzOiBTZXRUd2Vha0VuYWJsZWRBbmRSZWxvYWREZXBzLFxuKTogdHJ1ZSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWRFbmFibGVkID0gISFlbmFibGVkO1xuICBkZXBzLnNldFR3ZWFrRW5hYmxlZChpZCwgbm9ybWFsaXplZEVuYWJsZWQpO1xuICBkZXBzLmxvZ0luZm8oYHR3ZWFrICR7aWR9IGVuYWJsZWQ9JHtub3JtYWxpemVkRW5hYmxlZH1gKTtcbiAgcmVsb2FkVHdlYWtzKFwiZW5hYmxlZC10b2dnbGVcIiwgZGVwcyk7XG4gIHJldHVybiB0cnVlO1xufVxuIiwgImltcG9ydCB7IGFwcGVuZEZpbGVTeW5jLCBleGlzdHNTeW5jLCByZWFkRmlsZVN5bmMsIHN0YXRTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcblxuZXhwb3J0IGNvbnN0IE1BWF9MT0dfQllURVMgPSAxMCAqIDEwMjQgKiAxMDI0O1xuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kQ2FwcGVkTG9nKHBhdGg6IHN0cmluZywgbGluZTogc3RyaW5nLCBtYXhCeXRlcyA9IE1BWF9MT0dfQllURVMpOiB2b2lkIHtcbiAgY29uc3QgaW5jb21pbmcgPSBCdWZmZXIuZnJvbShsaW5lKTtcbiAgaWYgKGluY29taW5nLmJ5dGVMZW5ndGggPj0gbWF4Qnl0ZXMpIHtcbiAgICB3cml0ZUZpbGVTeW5jKHBhdGgsIGluY29taW5nLnN1YmFycmF5KGluY29taW5nLmJ5dGVMZW5ndGggLSBtYXhCeXRlcykpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWYgKGV4aXN0c1N5bmMocGF0aCkpIHtcbiAgICAgIGNvbnN0IHNpemUgPSBzdGF0U3luYyhwYXRoKS5zaXplO1xuICAgICAgY29uc3QgYWxsb3dlZEV4aXN0aW5nID0gbWF4Qnl0ZXMgLSBpbmNvbWluZy5ieXRlTGVuZ3RoO1xuICAgICAgaWYgKHNpemUgPiBhbGxvd2VkRXhpc3RpbmcpIHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSByZWFkRmlsZVN5bmMocGF0aCk7XG4gICAgICAgIHdyaXRlRmlsZVN5bmMocGF0aCwgZXhpc3Rpbmcuc3ViYXJyYXkoTWF0aC5tYXgoMCwgZXhpc3RpbmcuYnl0ZUxlbmd0aCAtIGFsbG93ZWRFeGlzdGluZykpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8vIElmIHRyaW1taW5nIGZhaWxzLCBzdGlsbCB0cnkgdG8gYXBwZW5kIGJlbG93OyBsb2dnaW5nIG11c3QgYmUgYmVzdC1lZmZvcnQuXG4gIH1cblxuICBhcHBlbmRGaWxlU3luYyhwYXRoLCBpbmNvbWluZyk7XG59XG4iLCAiaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93IH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgeyBleGlzdHNTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgdHlwZSB7XG4gIENvZGV4Q2RwU3RhdHVzLFxuICBDb2RleENkcFRhcmdldCxcbiAgQ29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzLFxuICBDb2RleFJ1bnRpbWVJbmZvLFxuICBDb2RleFJ1bnRpbWVUeXBlLFxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVQcm9iZU9wdGlvbnMge1xuICB1c2VyUm9vdDogc3RyaW5nO1xuICBydW50aW1lRGlyOiBzdHJpbmc7XG4gIGNvZGV4VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgY2hhbm5lbDogc3RyaW5nIHwgbnVsbDtcbiAgZ2V0V2luZG93U2VydmljZXMoKTogdW5rbm93biB8IG51bGw7XG4gIGdldE5hdGl2ZUNhcGFiaWxpdGllcz8oKTogQ29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzW1wibmF0aXZlXCJdO1xuICBnZXRWaWV3Q2FwYWJpbGl0aWVzPygpOiBDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXNbXCJ2aWV3c1wiXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJ1bnRpbWVJbmZvKG9wdHM6IFJ1bnRpbWVQcm9iZU9wdGlvbnMpOiBDb2RleFJ1bnRpbWVJbmZvIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiBkZXRlY3RSdW50aW1lVHlwZSgpLFxuICAgIGNvZGV4VmVyc2lvbjogb3B0cy5jb2RleFZlcnNpb24gPz8gc2FmZUFwcFZlcnNpb24oKSxcbiAgICBjaGFubmVsOiBvcHRzLmNoYW5uZWwsXG4gICAgYnVpbGRGbGF2b3I6IHNhZmVCdWlsZEZsYXZvcigpLFxuICAgIHVzZXNPd2xBcHBTaGVsbDogbnVsbCxcbiAgICBhcHBQYXRoOiBzYWZlQXBwUGF0aCgpLFxuICAgIHJlc291cmNlc1BhdGg6IHByb2Nlc3MucmVzb3VyY2VzUGF0aCA/PyBudWxsLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UnVudGltZUNhcGFiaWxpdGllcyhvcHRzOiBSdW50aW1lUHJvYmVPcHRpb25zKTogQ29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzIHtcbiAgY29uc3Qgc2VydmljZXMgPSBhc1JlY29yZChvcHRzLmdldFdpbmRvd1NlcnZpY2VzKCkpO1xuICBjb25zdCB3aW5kb3dNYW5hZ2VyID0gYXNSZWNvcmQoc2VydmljZXM/LndpbmRvd01hbmFnZXIpO1xuICBjb25zdCBjZHAgPSBnZXRDZHBTdGF0dXMoKTtcbiAgY29uc3QgbmF0aXZlID0gb3B0cy5nZXROYXRpdmVDYXBhYmlsaXRpZXM/LigpID8/IGRlZmF1bHROYXRpdmVDYXBhYmlsaXRpZXMoKTtcbiAgY29uc3Qgdmlld3MgPSBvcHRzLmdldFZpZXdDYXBhYmlsaXRpZXM/LigpID8/IGRlZmF1bHRWaWV3Q2FwYWJpbGl0aWVzKCk7XG4gIGNvbnN0IGNhbkNyZWF0ZVdpbmRvdyA9IHR5cGVvZiB3aW5kb3dNYW5hZ2VyPy5jcmVhdGVXaW5kb3cgPT09IFwiZnVuY3Rpb25cIiB8fFxuICAgIHR5cGVvZiBzZXJ2aWNlcz8uY3JlYXRlRnJlc2hXaW5kb3cgPT09IFwiZnVuY3Rpb25cIiB8fFxuICAgIHR5cGVvZiBzZXJ2aWNlcz8uY3JlYXRlRnJlc2hMb2NhbFdpbmRvdyA9PT0gXCJmdW5jdGlvblwiIHx8XG4gICAgdHlwZW9mIHNlcnZpY2VzPy5lbnN1cmVIb3N0V2luZG93ID09PSBcImZ1bmN0aW9uXCI7XG4gIHJldHVybiB7XG4gICAgd2luZG93czoge1xuICAgICAgY3JlYXRlOiBjYW5DcmVhdGVXaW5kb3csXG4gICAgICBmb2N1czogdHJ1ZSxcbiAgICAgIHByaW1hcnk6IHR5cGVvZiBzZXJ2aWNlcz8uZ2V0UHJpbWFyeVdpbmRvdyA9PT0gXCJmdW5jdGlvblwiIHx8XG4gICAgICAgIHR5cGVvZiB3aW5kb3dNYW5hZ2VyPy5nZXRQcmltYXJ5V2luZG93ID09PSBcImZ1bmN0aW9uXCIsXG4gICAgICBicm93c2VyVmlldzogdHlwZW9mIHdpbmRvd01hbmFnZXI/LnJlZ2lzdGVyV2luZG93ID09PSBcImZ1bmN0aW9uXCIsXG4gICAgfSxcbiAgICB2aWV3cyxcbiAgICBjZHA6IHtcbiAgICAgIHN1cHBvcnRlZDogdHJ1ZSxcbiAgICAgIGVuYWJsZWQ6IGNkcC5lbmFibGVkLFxuICAgICAgcG9ydDogY2RwLnBvcnQsXG4gICAgfSxcbiAgICBuYXRpdmUsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDZHBTdGF0dXMoKTogQ29kZXhDZHBTdGF0dXMge1xuICBjb25zdCBlbmFibGVkID0gcHJvY2Vzcy5lbnYuQ09ERVhQUF9SRU1PVEVfREVCVUcgPT09IFwiMVwiO1xuICBjb25zdCBwb3J0ID0gcGFyc2VDZHBQb3J0KHByb2Nlc3MuZW52LkNPREVYUFBfUkVNT1RFX0RFQlVHX1BPUlQpO1xuICByZXR1cm4ge1xuICAgIHN1cHBvcnRlZDogdHJ1ZSxcbiAgICBlbmFibGVkLFxuICAgIHBvcnQ6IGVuYWJsZWQgPyBwb3J0IDogbnVsbCxcbiAgICB1cmw6IGVuYWJsZWQgPyBgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9YCA6IG51bGwsXG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0Q2RwVGFyZ2V0cygpOiBQcm9taXNlPENvZGV4Q2RwVGFyZ2V0W10+IHtcbiAgY29uc3Qgc3RhdHVzID0gZ2V0Q2RwU3RhdHVzKCk7XG4gIGlmICghc3RhdHVzLmVuYWJsZWQgfHwgIXN0YXR1cy51cmwpIHJldHVybiBbXTtcbiAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCAxMDAwKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtzdGF0dXMudXJsfS9qc29uYCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgIGlmICghcmVzLm9rKSByZXR1cm4gW107XG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHJlcy5qc29uKCkgYXMgdW5rbm93bjtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocm93cykpIHJldHVybiBbXTtcbiAgICByZXR1cm4gcm93c1xuICAgICAgLm1hcCgocm93KSA9PiBub3JtYWxpemVDZHBUYXJnZXQocm93KSlcbiAgICAgIC5maWx0ZXIoKHJvdyk6IHJvdyBpcyBDb2RleENkcFRhcmdldCA9PiByb3cgIT09IG51bGwpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW107XG4gIH0gZmluYWxseSB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRldGVjdFJ1bnRpbWVUeXBlKCk6IENvZGV4UnVudGltZVR5cGUge1xuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gXCJkYXJ3aW5cIikge1xuICAgIGNvbnN0IGFwcFJvb3QgPSBpbmZlck1hY0FwcFJvb3QoKTtcbiAgICBpZiAoYXBwUm9vdCAmJiBleGlzdHNTeW5jKGpvaW4oYXBwUm9vdCwgXCJDb250ZW50c1wiLCBcIkZyYW1ld29ya3NcIiwgXCJDb2RleCBGcmFtZXdvcmsuZnJhbWV3b3JrXCIpKSkge1xuICAgICAgcmV0dXJuIFwib3dsXCI7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIGFwcFJvb3QgJiZcbiAgICAgIGV4aXN0c1N5bmMoam9pbihhcHBSb290LCBcIkNvbnRlbnRzXCIsIFwiRnJhbWV3b3Jrc1wiLCBcIkVsZWN0cm9uIEZyYW1ld29yay5mcmFtZXdvcmtcIikpXG4gICAgKSB7XG4gICAgICByZXR1cm4gXCJlbGVjdHJvblwiO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5yZXNvdXJjZXNQYXRoICYmIGV4aXN0c1N5bmMoam9pbihwcm9jZXNzLnJlc291cmNlc1BhdGgsIFwiYXBwLmFzYXJcIikpKSB7XG4gICAgICByZXR1cm4gXCJlbGVjdHJvblwiO1xuICAgIH1cbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbiAgcmV0dXJuIHByb2Nlc3MucmVzb3VyY2VzUGF0aCAmJiBleGlzdHNTeW5jKGpvaW4ocHJvY2Vzcy5yZXNvdXJjZXNQYXRoLCBcImFwcC5hc2FyXCIpKVxuICAgID8gXCJlbGVjdHJvblwiXG4gICAgOiBcInVua25vd25cIjtcbn1cblxuZnVuY3Rpb24gaW5mZXJNYWNBcHBSb290KCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBtYXJrZXIgPSBcIi5hcHAvQ29udGVudHMvTWFjT1MvXCI7XG4gIGNvbnN0IGlkeCA9IHByb2Nlc3MuZXhlY1BhdGguaW5kZXhPZihtYXJrZXIpO1xuICByZXR1cm4gaWR4ID49IDAgPyBwcm9jZXNzLmV4ZWNQYXRoLnNsaWNlKDAsIGlkeCArIFwiLmFwcFwiLmxlbmd0aCkgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBzYWZlQXBwVmVyc2lvbigpOiBzdHJpbmcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXBwLmdldFZlcnNpb24oKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2FmZUFwcFBhdGgoKTogc3RyaW5nIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGFwcC5nZXRBcHBQYXRoKCk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBwcm9jZXNzLnJlc291cmNlc1BhdGggPyBqb2luKHByb2Nlc3MucmVzb3VyY2VzUGF0aCwgXCJhcHAuYXNhclwiKSA6IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2FmZUJ1aWxkRmxhdm9yKCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBhcHBQYXRoID0gc2FmZUFwcFBhdGgoKTtcbiAgaWYgKCFhcHBQYXRoKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcGFyZW50ID0gZGlybmFtZShhcHBQYXRoKTtcbiAgaWYgKHBhcmVudC5pbmNsdWRlcyhcIk5pZ2h0bHlcIikpIHJldHVybiBcIm5pZ2h0bHlcIjtcbiAgcmV0dXJuIGFwcC5pc1BhY2thZ2VkID8gXCJwcm9kXCIgOiBcImRldlwiO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNkcFBvcnQodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSA/PyBcIjkyMjJcIik7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHBhcnNlZCkgJiYgcGFyc2VkID4gMCAmJiBwYXJzZWQgPCA2NTUzNiA/IHBhcnNlZCA6IDkyMjI7XG59XG5cbmZ1bmN0aW9uIGhhc05hdGl2ZVdpbmRvd0hhbmRsZXMoKTogYm9vbGVhbiB7XG4gIGNvbnN0IGZvY3VzZWQgPSBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKTtcbiAgaWYgKGZvY3VzZWQgJiYgdHlwZW9mIGZvY3VzZWQuZ2V0TmF0aXZlV2luZG93SGFuZGxlID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB0cnVlO1xuICByZXR1cm4gdHlwZW9mIEJyb3dzZXJXaW5kb3cuZnJvbUlkID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHROYXRpdmVDYXBhYmlsaXRpZXMoKTogQ29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzW1wibmF0aXZlXCJdIHtcbiAgcmV0dXJuIHtcbiAgICBpblByb2Nlc3NNb2R1bGVzOiB0cnVlLFxuICAgIHN3aWZ0TW9kdWxlczogcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gXCJkYXJ3aW5cIixcbiAgICBhcHBLaXRFbWJlZGRpbmc6IGZhbHNlLFxuICAgIGNoaWxkV2luZG93T3ZlcmxheTogZmFsc2UsXG4gICAgZGlyZWN0Vmlld0F0dGFjaDogZmFsc2UsXG4gICAgbWV0YWxWaWV3czogZmFsc2UsXG4gICAgbmF0aXZlSG9zdDogZmFsc2UsXG4gICAgaGVscGVyczogdHJ1ZSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFZpZXdDYXBhYmlsaXRpZXMoKTogQ29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzW1widmlld3NcIl0ge1xuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogZmFsc2UsXG4gICAgcHJpdmF0ZVZpZXdUcmVlOiBmYWxzZSxcbiAgICB3ZWJDb250ZW50c1ZpZXc6IGZhbHNlLFxuICAgIGJyb3dzZXJWaWV3RmFsbGJhY2s6IHR5cGVvZiBCcm93c2VyV2luZG93LmZyb21JZCA9PT0gXCJmdW5jdGlvblwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVDZHBUYXJnZXQocm93OiB1bmtub3duKTogQ29kZXhDZHBUYXJnZXQgfCBudWxsIHtcbiAgY29uc3QgdmFsdWUgPSBhc1JlY29yZChyb3cpO1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZS5pZCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgdmFsdWUudHlwZSAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgdmFsdWUudXJsICE9PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBpZDogdmFsdWUuaWQsXG4gICAgdHlwZTogdmFsdWUudHlwZSxcbiAgICB1cmw6IHZhbHVlLnVybCxcbiAgICAuLi4odHlwZW9mIHZhbHVlLnRpdGxlID09PSBcInN0cmluZ1wiID8geyB0aXRsZTogdmFsdWUudGl0bGUgfSA6IHt9KSxcbiAgICAuLi4odHlwZW9mIHZhbHVlLndlYlNvY2tldERlYnVnZ2VyVXJsID09PSBcInN0cmluZ1wiXG4gICAgICA/IHsgd2ViU29ja2V0RGVidWdnZXJVcmw6IHZhbHVlLndlYlNvY2tldERlYnVnZ2VyVXJsIH1cbiAgICAgIDoge30pLFxuICB9O1xufVxuXG5mdW5jdGlvbiBhc1JlY29yZCh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgbnVsbCB7XG4gIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgPyB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHsgQnJvd3NlcldpbmRvdyB9IGZyb20gXCJlbGVjdHJvblwiO1xuaW1wb3J0IHsgc3Bhd24sIHR5cGUgQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zIH0gZnJvbSBcIm5vZGU6Y2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0IHsgcmFuZG9tVVVJRCB9IGZyb20gXCJub2RlOmNyeXB0b1wiO1xuaW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBjcmVhdGVJbnRlcmZhY2UgfSBmcm9tIFwibm9kZTpyZWFkbGluZVwiO1xuaW1wb3J0IHsgcmVzb2x2ZU5hdGl2ZVR3ZWFrUGF0aCB9IGZyb20gXCIuL25hdGl2ZS1wYXRoc1wiO1xuaW1wb3J0IHR5cGUge1xuICBDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXMsXG4gIE5hdGl2ZUhlbHBlckxhdW5jaE9wdGlvbnMsXG4gIE5hdGl2ZUhlbHBlclJlZixcbiAgTmF0aXZlTW9kdWxlS2luZCxcbiAgTmF0aXZlTW9kdWxlTG9hZE9wdGlvbnMsXG4gIE5hdGl2ZU1vZHVsZVJlZixcbiAgTmF0aXZlUGFuZWxDcmVhdGVPcHRpb25zLFxuICBOYXRpdmVQYW5lbFJlZixcbiAgTmF0aXZlVmlld0F0dGFjaE9wdGlvbnMsXG4gIE5hdGl2ZVZpZXdSZWYsXG59IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmF0aXZlVHdlYWtDb250ZXh0IHtcbiAgaWQ6IHN0cmluZztcbiAgZGlyOiBzdHJpbmc7XG59XG5cbnR5cGUgTmF0aXZlTG9nID0gKGxldmVsOiBcImluZm9cIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmF0aXZlQnJpZGdlT3B0aW9ucyB7XG4gIG5hdGl2ZUhvc3RQYXRoPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgTG9hZGVkTmF0aXZlTW9kdWxlIHtcbiAga2V5OiBzdHJpbmc7XG4gIHR3ZWFrSWQ6IHN0cmluZztcbiAgaWQ6IHN0cmluZztcbiAga2luZDogTmF0aXZlTW9kdWxlS2luZDtcbiAgcGF0aDogc3RyaW5nO1xuICBleHBvcnRzOiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgTmF0aXZlSW5zdGFuY2Uge1xuICBrZXk6IHN0cmluZztcbiAgdHdlYWtJZDogc3RyaW5nO1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBcInBhbmVsXCIgfCBcInZpZXdcIjtcbiAgdmFsdWU6IHVua25vd247XG4gIHBhcmVudFdpbmRvd0lkOiBudW1iZXIgfCBudWxsO1xuICB3aW5kb3dJZDogbnVtYmVyIHwgbnVsbDtcbiAgZGlzcG9zZUJpbmRpbmdzOiBBcnJheTwoKSA9PiB2b2lkPjtcbiAgZGlzcG9zaW5nOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSGVscGVyUmVxdWVzdCB7XG4gIHJlc29sdmUodmFsdWU6IHVua25vd24pOiB2b2lkO1xuICByZWplY3QoZXJyb3I6IEVycm9yKTogdm9pZDtcbiAgdGltZXI6IE5vZGVKUy5UaW1lb3V0O1xufVxuXG5pbnRlcmZhY2UgTmF0aXZlSGVscGVyUHJvY2VzcyB7XG4gIGtleTogc3RyaW5nO1xuICB0d2Vha0lkOiBzdHJpbmc7XG4gIGlkOiBzdHJpbmc7XG4gIGNoaWxkOiBDaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXM7XG4gIHBlbmRpbmc6IE1hcDxzdHJpbmcsIEhlbHBlclJlcXVlc3Q+O1xufVxuXG5leHBvcnQgY2xhc3MgTmF0aXZlQnJpZGdlIHtcbiAgcHJpdmF0ZSBtb2R1bGVzID0gbmV3IE1hcDxzdHJpbmcsIExvYWRlZE5hdGl2ZU1vZHVsZT4oKTtcbiAgcHJpdmF0ZSBpbnN0YW5jZXMgPSBuZXcgTWFwPHN0cmluZywgTmF0aXZlSW5zdGFuY2U+KCk7XG4gIHByaXZhdGUgaGVscGVycyA9IG5ldyBNYXA8c3RyaW5nLCBOYXRpdmVIZWxwZXJQcm9jZXNzPigpO1xuICBwcml2YXRlIG5hdGl2ZUhvc3RFeHBvcnRzOiB1bmtub3duIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbmF0aXZlSG9zdExvYWRFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHJlYWRvbmx5IGxvZzogTmF0aXZlTG9nLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogTmF0aXZlQnJpZGdlT3B0aW9ucyA9IHt9LFxuICApIHt9XG5cbiAgZ2V0Q2FwYWJpbGl0aWVzKCk6IENvZGV4UnVudGltZUNhcGFiaWxpdGllc1tcIm5hdGl2ZVwiXSB7XG4gICAgY29uc3QgaG9zdCA9IHRoaXMubG9hZE5hdGl2ZUhvc3QoZmFsc2UpO1xuICAgIGNvbnN0IGhvc3RDYXBhYmlsaXRpZXMgPSBob3N0ID8gdGhpcy5yZWFkTmF0aXZlSG9zdENhcGFiaWxpdGllcyhob3N0KSA6IHt9O1xuICAgIGNvbnN0IG5hdGl2ZUhvc3QgPSBob3N0ICE9PSBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICBpblByb2Nlc3NNb2R1bGVzOiB0cnVlLFxuICAgICAgc3dpZnRNb2R1bGVzOiBwcm9jZXNzLnBsYXRmb3JtID09PSBcImRhcndpblwiLFxuICAgICAgYXBwS2l0RW1iZWRkaW5nOiBCb29sZWFuKGhvc3RDYXBhYmlsaXRpZXMuYXBwS2l0RW1iZWRkaW5nKSxcbiAgICAgIGNoaWxkV2luZG93T3ZlcmxheTogQm9vbGVhbihob3N0Q2FwYWJpbGl0aWVzLmNoaWxkV2luZG93T3ZlcmxheSksXG4gICAgICBkaXJlY3RWaWV3QXR0YWNoOiBCb29sZWFuKGhvc3RDYXBhYmlsaXRpZXMuZGlyZWN0Vmlld0F0dGFjaCksXG4gICAgICBtZXRhbFZpZXdzOiBCb29sZWFuKGhvc3RDYXBhYmlsaXRpZXMubWV0YWxWaWV3cyksXG4gICAgICBuYXRpdmVIb3N0LFxuICAgICAgaGVscGVyczogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgbG9hZE1vZHVsZShjdHg6IE5hdGl2ZVR3ZWFrQ29udGV4dCwgb3B0aW9uczogTmF0aXZlTW9kdWxlTG9hZE9wdGlvbnMpOiBOYXRpdmVNb2R1bGVSZWYge1xuICAgIGNvbnN0IGlkID0gYXNzZXJ0QnJpZGdlSWQob3B0aW9ucy5pZCwgXCJuYXRpdmUgbW9kdWxlIGlkXCIpO1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gcmVzb2x2ZVR3ZWFrUGF0aChjdHgsIG9wdGlvbnMucGF0aCk7XG4gICAgY29uc3Qga2luZCA9IG9wdGlvbnMua2luZCA/PyBpbmZlck1vZHVsZUtpbmQoZnVsbFBhdGgpO1xuXG4gICAgaWYgKGtpbmQgIT09IFwibm9kZS1hZGRvblwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGAke2tpbmR9IG5hdGl2ZSBtb2R1bGVzIG11c3QgYmUgbG9hZGVkIHRocm91Z2ggYSAubm9kZSBPYmplY3RpdmUtQysrIHNoaW0gaW4gQ29kZXgrKyAxLjAuMGAsXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghZnVsbFBhdGguZW5kc1dpdGgoXCIubm9kZVwiKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm9kZS1hZGRvbiBuYXRpdmUgbW9kdWxlcyBtdXN0IHVzZSBhIC5ub2RlIGZpbGVcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbG9hZGVkID0gcmVxdWlyZShmdWxsUGF0aCkgYXMgdW5rbm93bjtcbiAgICBjb25zdCBleHBvcnRzID0gc2VsZWN0RW50cnlwb2ludChsb2FkZWQsIG9wdGlvbnMuZW50cnlwb2ludCk7XG4gICAgY29uc3Qga2V5ID0gbW9kdWxlS2V5KGN0eC5pZCwgaWQpO1xuICAgIHRoaXMubW9kdWxlcy5zZXQoa2V5LCB7IGtleSwgdHdlYWtJZDogY3R4LmlkLCBpZCwga2luZCwgcGF0aDogZnVsbFBhdGgsIGV4cG9ydHMgfSk7XG4gICAgdGhpcy5sb2coXCJpbmZvXCIsIGBsb2FkZWQgbmF0aXZlIG1vZHVsZSAke2N0eC5pZH06JHtpZH1gLCB7IGtpbmQsIHBhdGg6IGZ1bGxQYXRoIH0pO1xuICAgIHJldHVybiB0aGlzLm1vZHVsZVJlZihjdHguaWQsIGlkLCBraW5kKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZVBhbmVsKGN0eDogTmF0aXZlVHdlYWtDb250ZXh0LCBvcHRpb25zOiBOYXRpdmVQYW5lbENyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPE5hdGl2ZVBhbmVsUmVmPiB7XG4gICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IHRoaXMuY3JlYXRlTmF0aXZlSW5zdGFuY2UoY3R4LCBcInBhbmVsXCIsIG9wdGlvbnMubW9kdWxlSWQsIG9wdGlvbnMuZmFjdG9yeSA/PyBcImNyZWF0ZVBhbmVsXCIsIHtcbiAgICAgIHBhcmVudFdpbmRvd0lkOiBvcHRpb25zLnBhcmVudFdpbmRvd0lkLFxuICAgICAgYm91bmRzOiBvcHRpb25zLmJvdW5kcyxcbiAgICAgIHRyYW5zcGFyZW50OiBvcHRpb25zLnRyYW5zcGFyZW50ID09PSB0cnVlLFxuICAgICAgcGFzc3Rocm91Z2hNb3VzZTogb3B0aW9ucy5wYXNzdGhyb3VnaE1vdXNlID09PSB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLnBhbmVsUmVmKGNyZWF0ZWQpO1xuICB9XG5cbiAgYXN5bmMgYXR0YWNoVmlldyhjdHg6IE5hdGl2ZVR3ZWFrQ29udGV4dCwgb3B0aW9uczogTmF0aXZlVmlld0F0dGFjaE9wdGlvbnMpOiBQcm9taXNlPE5hdGl2ZVZpZXdSZWY+IHtcbiAgICBjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5jcmVhdGVOYXRpdmVJbnN0YW5jZShjdHgsIFwidmlld1wiLCBvcHRpb25zLm1vZHVsZUlkLCBvcHRpb25zLmZhY3RvcnkgPz8gXCJhdHRhY2hWaWV3XCIsIHtcbiAgICAgIHBhcmVudFdpbmRvd0lkOiBvcHRpb25zLnBhcmVudFdpbmRvd0lkLFxuICAgICAgYm91bmRzOiBvcHRpb25zLmJvdW5kcyxcbiAgICAgIHpJbmRleDogb3B0aW9ucy56SW5kZXgsXG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMudmlld1JlZihjcmVhdGVkKTtcbiAgfVxuXG4gIGxhdW5jaEhlbHBlcihjdHg6IE5hdGl2ZVR3ZWFrQ29udGV4dCwgb3B0aW9uczogTmF0aXZlSGVscGVyTGF1bmNoT3B0aW9ucyk6IE5hdGl2ZUhlbHBlclJlZiB7XG4gICAgY29uc3QgaWQgPSBhc3NlcnRCcmlkZ2VJZChvcHRpb25zLmlkLCBcIm5hdGl2ZSBoZWxwZXIgaWRcIik7XG4gICAgaWYgKChvcHRpb25zLnRyYW5zcG9ydCA/PyBcInN0ZGlvXCIpICE9PSBcInN0ZGlvXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm5hdGl2ZSBoZWxwZXJzIHN1cHBvcnQgb25seSBzdGRpbyB0cmFuc3BvcnQgaW4gQ29kZXgrKyAxLjAuMFwiKTtcbiAgICB9XG4gICAgaWYgKChvcHRpb25zLnJlc3RhcnQgPz8gXCJuZXZlclwiKSAhPT0gXCJuZXZlclwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJuYXRpdmUgaGVscGVyIHJlc3RhcnQgcG9saWNpZXMgYXJlIG5vdCBhdmFpbGFibGUgaW4gQ29kZXgrKyAxLjAuMFwiKTtcbiAgICB9XG4gICAgY29uc3QgZXhlY3V0YWJsZSA9IHJlc29sdmVUd2Vha1BhdGgoY3R4LCBvcHRpb25zLmV4ZWN1dGFibGUpO1xuICAgIGNvbnN0IGFyZ3MgPSBvcHRpb25zLmFyZ3MgPz8gW107XG4gICAgY29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgLi4uKG9wdGlvbnMuZW52ID8/IHt9KSB9O1xuICAgIGNvbnN0IGNoaWxkID0gc3Bhd24oZXhlY3V0YWJsZSwgYXJncywge1xuICAgICAgY3dkOiBjdHguZGlyLFxuICAgICAgZW52LFxuICAgICAgc3RkaW86IFtcInBpcGVcIiwgXCJwaXBlXCIsIFwicGlwZVwiXSxcbiAgICB9KTtcbiAgICBjb25zdCBrZXkgPSBoZWxwZXJLZXkoY3R4LmlkLCBpZCk7XG4gICAgY29uc3QgaGVscGVyOiBOYXRpdmVIZWxwZXJQcm9jZXNzID0ge1xuICAgICAga2V5LFxuICAgICAgdHdlYWtJZDogY3R4LmlkLFxuICAgICAgaWQsXG4gICAgICBjaGlsZCxcbiAgICAgIHBlbmRpbmc6IG5ldyBNYXAoKSxcbiAgICB9O1xuICAgIHRoaXMuaGVscGVycy5zZXQoa2V5LCBoZWxwZXIpO1xuXG4gICAgY29uc3Qgc3Rkb3V0ID0gY3JlYXRlSW50ZXJmYWNlKHsgaW5wdXQ6IGNoaWxkLnN0ZG91dCB9KTtcbiAgICBzdGRvdXQub24oXCJsaW5lXCIsIChsaW5lKSA9PiB0aGlzLmhhbmRsZUhlbHBlckxpbmUoaGVscGVyLCBsaW5lKSk7XG4gICAgY2hpbGQuc3RkZXJyLm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IHtcbiAgICAgIHRoaXMubG9nKFwid2FyblwiLCBgbmF0aXZlIGhlbHBlciAke2N0eC5pZH06JHtpZH0gc3RkZXJyYCwgU3RyaW5nKGNodW5rKSk7XG4gICAgfSk7XG4gICAgY2hpbGQub24oXCJleGl0XCIsIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgIHRoaXMubG9nKFwiaW5mb1wiLCBgbmF0aXZlIGhlbHBlciAke2N0eC5pZH06JHtpZH0gZXhpdGVkYCwgeyBjb2RlLCBzaWduYWwgfSk7XG4gICAgICB0aGlzLmhlbHBlcnMuZGVsZXRlKGtleSk7XG4gICAgICBmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgaGVscGVyLnBlbmRpbmcudmFsdWVzKCkpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHJlcXVlc3QudGltZXIpO1xuICAgICAgICByZXF1ZXN0LnJlamVjdChuZXcgRXJyb3IoYG5hdGl2ZSBoZWxwZXIgZXhpdGVkIGJlZm9yZSByZXNwb25zZWApKTtcbiAgICAgIH1cbiAgICAgIGhlbHBlci5wZW5kaW5nLmNsZWFyKCk7XG4gICAgfSk7XG4gICAgY2hpbGQub24oXCJlcnJvclwiLCAoZXJyb3IpID0+IHtcbiAgICAgIHRoaXMubG9nKFwiZXJyb3JcIiwgYG5hdGl2ZSBoZWxwZXIgJHtjdHguaWR9OiR7aWR9IGZhaWxlZGAsIGVycm9yKTtcbiAgICAgIHRoaXMuaGVscGVycy5kZWxldGUoa2V5KTtcbiAgICAgIGZvciAoY29uc3QgcmVxdWVzdCBvZiBoZWxwZXIucGVuZGluZy52YWx1ZXMoKSkge1xuICAgICAgICBjbGVhclRpbWVvdXQocmVxdWVzdC50aW1lcik7XG4gICAgICAgIHJlcXVlc3QucmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICAgIGhlbHBlci5wZW5kaW5nLmNsZWFyKCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLmxvZyhcImluZm9cIiwgYGxhdW5jaGVkIG5hdGl2ZSBoZWxwZXIgJHtjdHguaWR9OiR7aWR9YCwgeyBwaWQ6IGNoaWxkLnBpZCwgZXhlY3V0YWJsZSB9KTtcbiAgICByZXR1cm4gdGhpcy5oZWxwZXJSZWYoY3R4LmlkLCBpZCwgY2hpbGQucGlkID8/IC0xKTtcbiAgfVxuXG4gIGRpc3Bvc2VUd2Vhayh0d2Vha0lkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIGluc3RhbmNlXSBvZiBbLi4udGhpcy5pbnN0YW5jZXNdKSB7XG4gICAgICBpZiAoaW5zdGFuY2UudHdlYWtJZCAhPT0gdHdlYWtJZCkgY29udGludWU7XG4gICAgICB2b2lkIHRoaXMuZGlzcG9zZUluc3RhbmNlKGluc3RhbmNlKS5maW5hbGx5KCgpID0+IHRoaXMuaW5zdGFuY2VzLmRlbGV0ZShrZXkpKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBba2V5LCBoZWxwZXJdIG9mIFsuLi50aGlzLmhlbHBlcnNdKSB7XG4gICAgICBpZiAoaGVscGVyLnR3ZWFrSWQgIT09IHR3ZWFrSWQpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5zdG9wSGVscGVyKGhlbHBlcik7XG4gICAgICB0aGlzLmhlbHBlcnMuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW2tleSwgbW9kXSBvZiBbLi4udGhpcy5tb2R1bGVzXSkge1xuICAgICAgaWYgKG1vZC50d2Vha0lkICE9PSB0d2Vha0lkKSBjb250aW51ZTtcbiAgICAgIHZvaWQgY2FsbE9wdGlvbmFsKG1vZC5leHBvcnRzLCBcImRpc3Bvc2VcIiwgW10pO1xuICAgICAgdGhpcy5tb2R1bGVzLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgfVxuXG4gIGRpc3Bvc2VBbGwoKTogdm9pZCB7XG4gICAgY29uc3QgdHdlYWtJZHMgPSBuZXcgU2V0KFtcbiAgICAgIC4uLlsuLi50aGlzLm1vZHVsZXMudmFsdWVzKCldLm1hcCgoaXRlbSkgPT4gaXRlbS50d2Vha0lkKSxcbiAgICAgIC4uLlsuLi50aGlzLmluc3RhbmNlcy52YWx1ZXMoKV0ubWFwKChpdGVtKSA9PiBpdGVtLnR3ZWFrSWQpLFxuICAgICAgLi4uWy4uLnRoaXMuaGVscGVycy52YWx1ZXMoKV0ubWFwKChpdGVtKSA9PiBpdGVtLnR3ZWFrSWQpLFxuICAgIF0pO1xuICAgIGZvciAoY29uc3QgaWQgb2YgdHdlYWtJZHMpIHRoaXMuZGlzcG9zZVR3ZWFrKGlkKTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxJbnN0YW5jZShcbiAgICB0d2Vha0lkOiBzdHJpbmcsXG4gICAga2luZDogXCJwYW5lbFwiIHwgXCJ2aWV3XCIsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBtZXRob2Q6IHN0cmluZyxcbiAgICBhcmc/OiB1bmtub3duLFxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoa2luZCA9PT0gXCJwYW5lbFwiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcInNldEJvdW5kc1wiKSByZXR1cm4gdGhpcy5pbnZva2VJbnN0YW5jZSh0d2Vha0lkLCBpZCwgXCJzZXRCb3VuZHNcIiwgW2FyZ10pO1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJzaG93XCIpIHJldHVybiB0aGlzLmludm9rZUluc3RhbmNlKHR3ZWFrSWQsIGlkLCBcInNob3dcIiwgW10pO1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJoaWRlXCIpIHJldHVybiB0aGlzLmludm9rZUluc3RhbmNlKHR3ZWFrSWQsIGlkLCBcImhpZGVcIiwgW10pO1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJkaXNwb3NlXCIpIHJldHVybiB0aGlzLmRpc3Bvc2VJbnN0YW5jZUJ5SWQodHdlYWtJZCwgaWQpO1xuICAgIH1cbiAgICBpZiAoa2luZCA9PT0gXCJ2aWV3XCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwic2V0Qm91bmRzXCIpIHJldHVybiB0aGlzLmludm9rZUluc3RhbmNlKHR3ZWFrSWQsIGlkLCBcInNldEJvdW5kc1wiLCBbYXJnXSk7XG4gICAgICBpZiAobWV0aG9kID09PSBcInNldFZpc2libGVcIikgcmV0dXJuIHRoaXMuaW52b2tlSW5zdGFuY2UodHdlYWtJZCwgaWQsIFwic2V0VmlzaWJsZVwiLCBbYXJnXSk7XG4gICAgICBpZiAobWV0aG9kID09PSBcImRpc3Bvc2VcIikgcmV0dXJuIHRoaXMuZGlzcG9zZUluc3RhbmNlQnlJZCh0d2Vha0lkLCBpZCk7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBuYXRpdmUgJHtraW5kfSBtZXRob2Q6ICR7bWV0aG9kfWApO1xuICB9XG5cbiAgYXN5bmMgY2FsbEhlbHBlcihcbiAgICB0d2Vha0lkOiBzdHJpbmcsXG4gICAgaGVscGVySWQ6IHN0cmluZyxcbiAgICBtZXRob2Q6IHN0cmluZyxcbiAgICBwYXlsb2FkPzogdW5rbm93bixcbiAgICB0aW1lb3V0TXM/OiBudW1iZXIsXG4gICk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIGlmIChtZXRob2QgPT09IFwic2VuZFwiKSByZXR1cm4gdGhpcy5zZW5kSGVscGVyKHR3ZWFrSWQsIGhlbHBlcklkLCBwYXlsb2FkKTtcbiAgICBpZiAobWV0aG9kID09PSBcInJlcXVlc3RcIikgcmV0dXJuIHRoaXMucmVxdWVzdEhlbHBlcih0d2Vha0lkLCBoZWxwZXJJZCwgcGF5bG9hZCwgdGltZW91dE1zKTtcbiAgICBpZiAobWV0aG9kID09PSBcInN0b3BcIikgcmV0dXJuIHRoaXMuc3RvcEhlbHBlckJ5SWQodHdlYWtJZCwgaGVscGVySWQpO1xuICAgIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBuYXRpdmUgaGVscGVyIG1ldGhvZDogJHttZXRob2R9YCk7XG4gIH1cblxuICBwcml2YXRlIG1vZHVsZVJlZih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGtpbmQgPSB0aGlzLm1vZHVsZUZvcih0d2Vha0lkLCBpZCkua2luZCk6IE5hdGl2ZU1vZHVsZVJlZiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkLFxuICAgICAga2luZCxcbiAgICAgIHJlcXVlc3Q6IChtZXRob2QsIHBheWxvYWQsIHRpbWVvdXRNcykgPT5cbiAgICAgICAgdGhpcy5yZXF1ZXN0TW9kdWxlKHR3ZWFrSWQsIGlkLCBtZXRob2QsIHBheWxvYWQsIHRpbWVvdXRNcyksXG4gICAgICBkaXNwb3NlOiAoKSA9PiB0aGlzLmRpc3Bvc2VNb2R1bGUodHdlYWtJZCwgaWQpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHBhbmVsUmVmKGluc3RhbmNlOiBOYXRpdmVJbnN0YW5jZSk6IE5hdGl2ZVBhbmVsUmVmIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGluc3RhbmNlLmlkLFxuICAgICAgd2luZG93SWQ6IGluc3RhbmNlLndpbmRvd0lkLFxuICAgICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PiB0aGlzLmludm9rZUluc3RhbmNlKGluc3RhbmNlLnR3ZWFrSWQsIGluc3RhbmNlLmlkLCBcInNldEJvdW5kc1wiLCBbYm91bmRzXSksXG4gICAgICBzaG93OiAoKSA9PiB0aGlzLmludm9rZUluc3RhbmNlKGluc3RhbmNlLnR3ZWFrSWQsIGluc3RhbmNlLmlkLCBcInNob3dcIiwgW10pLFxuICAgICAgaGlkZTogKCkgPT4gdGhpcy5pbnZva2VJbnN0YW5jZShpbnN0YW5jZS50d2Vha0lkLCBpbnN0YW5jZS5pZCwgXCJoaWRlXCIsIFtdKSxcbiAgICAgIGRpc3Bvc2U6ICgpID0+IHRoaXMuZGlzcG9zZUluc3RhbmNlQnlJZChpbnN0YW5jZS50d2Vha0lkLCBpbnN0YW5jZS5pZCksXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgdmlld1JlZihpbnN0YW5jZTogTmF0aXZlSW5zdGFuY2UpOiBOYXRpdmVWaWV3UmVmIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGluc3RhbmNlLmlkLFxuICAgICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PiB0aGlzLmludm9rZUluc3RhbmNlKGluc3RhbmNlLnR3ZWFrSWQsIGluc3RhbmNlLmlkLCBcInNldEJvdW5kc1wiLCBbYm91bmRzXSksXG4gICAgICBzZXRWaXNpYmxlOiAodmlzaWJsZSkgPT4gdGhpcy5pbnZva2VJbnN0YW5jZShpbnN0YW5jZS50d2Vha0lkLCBpbnN0YW5jZS5pZCwgXCJzZXRWaXNpYmxlXCIsIFt2aXNpYmxlXSksXG4gICAgICBkaXNwb3NlOiAoKSA9PiB0aGlzLmRpc3Bvc2VJbnN0YW5jZUJ5SWQoaW5zdGFuY2UudHdlYWtJZCwgaW5zdGFuY2UuaWQpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGhlbHBlclJlZih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcsIHBpZDogbnVtYmVyKTogTmF0aXZlSGVscGVyUmVmIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBwaWQsXG4gICAgICBzZW5kOiAobWVzc2FnZSkgPT4gdGhpcy5zZW5kSGVscGVyKHR3ZWFrSWQsIGlkLCBtZXNzYWdlKSxcbiAgICAgIHJlcXVlc3Q6IChtZXNzYWdlLCB0aW1lb3V0TXMpID0+IHRoaXMucmVxdWVzdEhlbHBlcih0d2Vha0lkLCBpZCwgbWVzc2FnZSwgdGltZW91dE1zKSxcbiAgICAgIHN0b3A6ICgpID0+IHRoaXMuc3RvcEhlbHBlckJ5SWQodHdlYWtJZCwgaWQpLFxuICAgIH07XG4gIH1cblxuICBhc3luYyByZXF1ZXN0TW9kdWxlKFxuICAgIHR3ZWFrSWQ6IHN0cmluZyxcbiAgICBpZDogc3RyaW5nLFxuICAgIG1ldGhvZDogc3RyaW5nLFxuICAgIHBheWxvYWQ/OiB1bmtub3duLFxuICAgIF90aW1lb3V0TXM/OiBudW1iZXIsXG4gICk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIGNvbnN0IG1vZCA9IHRoaXMubW9kdWxlRm9yKHR3ZWFrSWQsIGlkKTtcbiAgICBjb25zdCB0YXJnZXQgPSBhc1JlY29yZChtb2QuZXhwb3J0cyk7XG4gICAgY29uc3QgZm4gPSB0YXJnZXQ/LnJlcXVlc3Q7XG4gICAgaWYgKHR5cGVvZiBmbiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gYXdhaXQgZm4uY2FsbChtb2QuZXhwb3J0cywgbWV0aG9kLCBwYXlsb2FkKTtcbiAgICB9XG4gICAgY29uc3QgbWV0aG9kRm4gPSB0YXJnZXQ/LlttZXRob2RdO1xuICAgIGlmICh0eXBlb2YgbWV0aG9kRm4gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIGF3YWl0IG1ldGhvZEZuLmNhbGwobW9kLmV4cG9ydHMsIHBheWxvYWQpO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoYG5hdGl2ZSBtb2R1bGUgJHt0d2Vha0lkfToke2lkfSBoYXMgbm8gcmVxdWVzdCgpIG9yICR7bWV0aG9kfSgpYCk7XG4gIH1cblxuICBhc3luYyBkaXNwb3NlTW9kdWxlKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGtleSA9IG1vZHVsZUtleSh0d2Vha0lkLCBpZCk7XG4gICAgY29uc3QgbW9kID0gdGhpcy5tb2R1bGVzLmdldChrZXkpO1xuICAgIGlmICghbW9kKSByZXR1cm47XG4gICAgYXdhaXQgY2FsbE9wdGlvbmFsKG1vZC5leHBvcnRzLCBcImRpc3Bvc2VcIiwgW10pO1xuICAgIHRoaXMubW9kdWxlcy5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlTmF0aXZlSW5zdGFuY2UoXG4gICAgY3R4OiBOYXRpdmVUd2Vha0NvbnRleHQsXG4gICAga2luZDogXCJwYW5lbFwiIHwgXCJ2aWV3XCIsXG4gICAgbW9kdWxlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBmYWN0b3J5OiBzdHJpbmcsXG4gICAgb3B0aW9uczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICk6IFByb21pc2U8TmF0aXZlSW5zdGFuY2U+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBtb2R1bGVJZCA/IHRoaXMubW9kdWxlRm9yKGN0eC5pZCwgbW9kdWxlSWQpLmV4cG9ydHMgOiB0aGlzLmxvYWROYXRpdmVIb3N0KHRydWUpO1xuICAgIGNvbnN0IGZuID0gYXNSZWNvcmQodGFyZ2V0KT8uW2ZhY3RvcnldO1xuICAgIGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgY29uc3QgbGFiZWwgPSBtb2R1bGVJZCA/IGBuYXRpdmUgbW9kdWxlICR7Y3R4LmlkfToke21vZHVsZUlkfWAgOiBcIkNvZGV4KysgbmF0aXZlIGhvc3RcIjtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtsYWJlbH0gaGFzIG5vIGZhY3RvcnkgJHtmYWN0b3J5fSgpYCk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyZW50V2luZG93ID0gdHlwZW9mIG9wdGlvbnMucGFyZW50V2luZG93SWQgPT09IFwibnVtYmVyXCJcbiAgICAgID8gQnJvd3NlcldpbmRvdy5mcm9tSWQob3B0aW9ucy5wYXJlbnRXaW5kb3dJZClcbiAgICAgIDogQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG4gICAgY29uc3QgcGFyZW50TmF0aXZlSGFuZGxlID0gbmF0aXZlSGFuZGxlRm9yV2luZG93KHBhcmVudFdpbmRvdyk7XG4gICAgY29uc3QgdmFsdWUgPSBhd2FpdCBmbi5jYWxsKHRhcmdldCwge1xuICAgICAgLi4ub3B0aW9ucyxcbiAgICAgIHBhcmVudFdpbmRvd0lkOiB3aW5kb3dJZEZvcihwYXJlbnRXaW5kb3cpLFxuICAgICAgcGFyZW50V2ViQ29udGVudHNJZDogd2ViQ29udGVudHNJZEZvcihwYXJlbnRXaW5kb3cpLFxuICAgICAgcGFyZW50TmF0aXZlSGFuZGxlLFxuICAgIH0pO1xuICAgIGNvbnN0IGlkID0gdHlwZW9mIGFzUmVjb3JkKHZhbHVlKT8uaWQgPT09IFwic3RyaW5nXCIgPyBTdHJpbmcoYXNSZWNvcmQodmFsdWUpPy5pZCkgOiByYW5kb21VVUlEKCk7XG4gICAgY29uc3Qgd2luZG93SWQgPSB0eXBlb2YgYXNSZWNvcmQodmFsdWUpPy53aW5kb3dJZCA9PT0gXCJudW1iZXJcIiA/IE51bWJlcihhc1JlY29yZCh2YWx1ZSk/LndpbmRvd0lkKSA6IG51bGw7XG4gICAgY29uc3QgaW5zdGFuY2U6IE5hdGl2ZUluc3RhbmNlID0ge1xuICAgICAga2V5OiBpbnN0YW5jZUtleShjdHguaWQsIGlkKSxcbiAgICAgIHR3ZWFrSWQ6IGN0eC5pZCxcbiAgICAgIGlkLFxuICAgICAga2luZCxcbiAgICAgIHZhbHVlLFxuICAgICAgcGFyZW50V2luZG93SWQ6IHdpbmRvd0lkRm9yKHBhcmVudFdpbmRvdyksXG4gICAgICB3aW5kb3dJZCxcbiAgICAgIGRpc3Bvc2VCaW5kaW5nczogW10sXG4gICAgICBkaXNwb3Npbmc6IGZhbHNlLFxuICAgIH07XG4gICAgdGhpcy5pbnN0YW5jZXMuc2V0KGluc3RhbmNlLmtleSwgaW5zdGFuY2UpO1xuICAgIGlmIChjYW5CaW5kUGFyZW50V2luZG93KHBhcmVudFdpbmRvdykpIHtcbiAgICAgIHRoaXMuYmluZEluc3RhbmNlVG9QYXJlbnQoaW5zdGFuY2UsIHBhcmVudFdpbmRvdyk7XG4gICAgICB0aGlzLnN5bmNQYXJlbnRTdGF0ZShpbnN0YW5jZSwgcGFyZW50V2luZG93LCBcImNyZWF0ZWRcIik7XG4gICAgfVxuICAgIHRoaXMubG9nKFwiaW5mb1wiLCBgY3JlYXRlZCBuYXRpdmUgJHtraW5kfSAke2N0eC5pZH06JHtpZH1gLCB7XG4gICAgICBtb2R1bGVJZDogbW9kdWxlSWQgPz8gXCJjb2RleHBwLm5hdGl2ZS1ob3N0XCIsXG4gICAgICBmYWN0b3J5LFxuICAgICAgd2luZG93SWQsXG4gICAgfSk7XG4gICAgcmV0dXJuIGluc3RhbmNlO1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkTmF0aXZlSG9zdChyZXF1aXJlZDogdHJ1ZSk6IHVua25vd247XG4gIHByaXZhdGUgbG9hZE5hdGl2ZUhvc3QocmVxdWlyZWQ6IGZhbHNlKTogdW5rbm93biB8IG51bGw7XG4gIHByaXZhdGUgbG9hZE5hdGl2ZUhvc3QocmVxdWlyZWQ6IGJvb2xlYW4pOiB1bmtub3duIHwgbnVsbCB7XG4gICAgaWYgKHRoaXMubmF0aXZlSG9zdEV4cG9ydHMpIHJldHVybiB0aGlzLm5hdGl2ZUhvc3RFeHBvcnRzO1xuICAgIGlmICh0aGlzLm5hdGl2ZUhvc3RMb2FkRXJyb3IgJiYgIXJlcXVpcmVkKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBuYXRpdmVIb3N0UGF0aCA9IHRoaXMub3B0aW9ucy5uYXRpdmVIb3N0UGF0aDtcbiAgICBpZiAoIW5hdGl2ZUhvc3RQYXRoIHx8ICFleGlzdHNTeW5jKG5hdGl2ZUhvc3RQYXRoKSkge1xuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoXCJDb2RleCsrIG5hdGl2ZSBob3N0IGlzIG5vdCBpbnN0YWxsZWRcIik7XG4gICAgICB0aGlzLm5hdGl2ZUhvc3RMb2FkRXJyb3IgPSBlcnJvcjtcbiAgICAgIGlmIChyZXF1aXJlZCkgdGhyb3cgZXJyb3I7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMubmF0aXZlSG9zdEV4cG9ydHMgPSByZXF1aXJlKG5hdGl2ZUhvc3RQYXRoKSBhcyB1bmtub3duO1xuICAgICAgdGhpcy5uYXRpdmVIb3N0TG9hZEVycm9yID0gbnVsbDtcbiAgICAgIHRoaXMubG9nKFwiaW5mb1wiLCBcImxvYWRlZCBDb2RleCsrIG5hdGl2ZSBob3N0XCIsIHsgcGF0aDogbmF0aXZlSG9zdFBhdGggfSk7XG4gICAgICByZXR1cm4gdGhpcy5uYXRpdmVIb3N0RXhwb3J0cztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5uYXRpdmVIb3N0TG9hZEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xuICAgICAgdGhpcy5sb2coXCJlcnJvclwiLCBcImZhaWxlZCB0byBsb2FkIENvZGV4KysgbmF0aXZlIGhvc3RcIiwgdGhpcy5uYXRpdmVIb3N0TG9hZEVycm9yKTtcbiAgICAgIGlmIChyZXF1aXJlZCkgdGhyb3cgdGhpcy5uYXRpdmVIb3N0TG9hZEVycm9yO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWFkTmF0aXZlSG9zdENhcGFiaWxpdGllcyhob3N0OiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICAgIGNvbnN0IGdldENhcGFiaWxpdGllcyA9IGFzUmVjb3JkKGhvc3QpPy5nZXRDYXBhYmlsaXRpZXM7XG4gICAgaWYgKHR5cGVvZiBnZXRDYXBhYmlsaXRpZXMgIT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHt9O1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjYXBhYmlsaXRpZXMgPSBnZXRDYXBhYmlsaXRpZXMuY2FsbChob3N0KTtcbiAgICAgIHJldHVybiBhc1JlY29yZChjYXBhYmlsaXRpZXMpID8/IHt9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLmxvZyhcIndhcm5cIiwgXCJDb2RleCsrIG5hdGl2ZSBob3N0IGNhcGFiaWxpdHkgcHJvYmUgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGludm9rZUluc3RhbmNlKFxuICAgIHR3ZWFrSWQ6IHN0cmluZyxcbiAgICBpZDogc3RyaW5nLFxuICAgIG1ldGhvZDogc3RyaW5nLFxuICAgIGFyZ3M6IHVua25vd25bXSxcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgaW5zdGFuY2UgPSB0aGlzLmluc3RhbmNlRm9yKHR3ZWFrSWQsIGlkKTtcbiAgICBjb25zdCBmbiA9IGFzUmVjb3JkKGluc3RhbmNlLnZhbHVlKT8uW21ldGhvZF07XG4gICAgaWYgKHR5cGVvZiBmbiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBhd2FpdCBmbi5hcHBseShpbnN0YW5jZS52YWx1ZSwgYXJncyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbnN0YW5jZS53aW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgd2luID0gQnJvd3NlcldpbmRvdy5mcm9tSWQoaW5zdGFuY2Uud2luZG93SWQpO1xuICAgICAgaWYgKHdpbiAmJiAhd2luLmlzRGVzdHJveWVkKCkpIHtcbiAgICAgICAgaWYgKG1ldGhvZCA9PT0gXCJzZXRCb3VuZHNcIikgd2luLnNldEJvdW5kcyhhcmdzWzBdIGFzIEVsZWN0cm9uLlJlY3RhbmdsZSk7XG4gICAgICAgIGVsc2UgaWYgKG1ldGhvZCA9PT0gXCJzaG93XCIpIHdpbi5zaG93KCk7XG4gICAgICAgIGVsc2UgaWYgKG1ldGhvZCA9PT0gXCJoaWRlXCIpIHdpbi5oaWRlKCk7XG4gICAgICAgIGVsc2UgaWYgKG1ldGhvZCA9PT0gXCJzZXRWaXNpYmxlXCIpIChhcmdzWzBdID8gd2luLnNob3coKSA6IHdpbi5oaWRlKCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgbmF0aXZlICR7aW5zdGFuY2Uua2luZH0gJHt0d2Vha0lkfToke2lkfSBkb2VzIG5vdCBpbXBsZW1lbnQgJHttZXRob2R9KClgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGlzcG9zZUluc3RhbmNlQnlJZCh0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBrZXkgPSBpbnN0YW5jZUtleSh0d2Vha0lkLCBpZCk7XG4gICAgY29uc3QgaW5zdGFuY2UgPSB0aGlzLmluc3RhbmNlcy5nZXQoa2V5KTtcbiAgICBpZiAoIWluc3RhbmNlKSByZXR1cm47XG4gICAgYXdhaXQgdGhpcy5kaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UpO1xuICAgIHRoaXMuaW5zdGFuY2VzLmRlbGV0ZShrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2U6IE5hdGl2ZUluc3RhbmNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKGluc3RhbmNlLmRpc3Bvc2luZykgcmV0dXJuO1xuICAgIGluc3RhbmNlLmRpc3Bvc2luZyA9IHRydWU7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIGluc3RhbmNlLmRpc3Bvc2VCaW5kaW5ncy5zcGxpY2UoMCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgIH0gY2F0Y2gge31cbiAgICB9XG4gICAgYXdhaXQgY2FsbE9wdGlvbmFsKGluc3RhbmNlLnZhbHVlLCBcImRpc3Bvc2VcIiwgW10pO1xuICAgIGlmIChpbnN0YW5jZS53aW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgd2luID0gQnJvd3NlcldpbmRvdy5mcm9tSWQoaW5zdGFuY2Uud2luZG93SWQpO1xuICAgICAgaWYgKHdpbiAmJiAhd2luLmlzRGVzdHJveWVkKCkpIHdpbi5jbG9zZSgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYmluZEluc3RhbmNlVG9QYXJlbnQoaW5zdGFuY2U6IE5hdGl2ZUluc3RhbmNlLCBwYXJlbnRXaW5kb3c6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cpOiB2b2lkIHtcbiAgICBjb25zdCBvbiA9IChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgcGFyZW50V2luZG93Lm9uKGV2ZW50IGFzIG5ldmVyLCBsaXN0ZW5lciBhcyBuZXZlcik7XG4gICAgICBpbnN0YW5jZS5kaXNwb3NlQmluZGluZ3MucHVzaCgoKSA9PiBwYXJlbnRXaW5kb3cub2ZmKGV2ZW50IGFzIG5ldmVyLCBsaXN0ZW5lciBhcyBuZXZlcikpO1xuICAgIH07XG4gICAgY29uc3Qgc3luY0JvdW5kcyA9ICgpID0+IHRoaXMuc3luY1BhcmVudFN0YXRlKGluc3RhbmNlLCBwYXJlbnRXaW5kb3csIFwiYm91bmRzXCIpO1xuICAgIGNvbnN0IHN5bmNGb2N1cyA9IChmb2N1c2VkOiBib29sZWFuKSA9PiB0aGlzLnNpZ25hbFBhcmVudFN0YXRlKGluc3RhbmNlLCBwYXJlbnRXaW5kb3csIFwiZm9jdXNcIiwgeyBmb2N1c2VkIH0pO1xuICAgIGNvbnN0IHN5bmNWaXNpYmlsaXR5ID0gKHZpc2libGU6IGJvb2xlYW4pID0+XG4gICAgICB0aGlzLnNpZ25hbFBhcmVudFN0YXRlKGluc3RhbmNlLCBwYXJlbnRXaW5kb3csIFwidmlzaWJpbGl0eVwiLCB7IHZpc2libGUgfSk7XG4gICAgY29uc3QgZGlzcG9zZVdpdGhQYXJlbnQgPSAoKSA9PiB7XG4gICAgICB0aGlzLmxvZyhcImluZm9cIiwgYGRpc3Bvc2luZyBuYXRpdmUgJHtpbnN0YW5jZS5raW5kfSAke2luc3RhbmNlLnR3ZWFrSWR9OiR7aW5zdGFuY2UuaWR9OyBwYXJlbnQgY2xvc2VkYCk7XG4gICAgICB2b2lkIHRoaXMuZGlzcG9zZUluc3RhbmNlQnlJZChpbnN0YW5jZS50d2Vha0lkLCBpbnN0YW5jZS5pZCk7XG4gICAgfTtcblxuICAgIG9uKFwibW92ZVwiLCBzeW5jQm91bmRzKTtcbiAgICBvbihcInJlc2l6ZVwiLCBzeW5jQm91bmRzKTtcbiAgICBvbihcImVudGVyLWZ1bGwtc2NyZWVuXCIsIHN5bmNCb3VuZHMpO1xuICAgIG9uKFwibGVhdmUtZnVsbC1zY3JlZW5cIiwgc3luY0JvdW5kcyk7XG4gICAgb24oXCJtYXhpbWl6ZVwiLCBzeW5jQm91bmRzKTtcbiAgICBvbihcInVubWF4aW1pemVcIiwgc3luY0JvdW5kcyk7XG4gICAgb24oXCJtaW5pbWl6ZVwiLCBzeW5jQm91bmRzKTtcbiAgICBvbihcInJlc3RvcmVcIiwgc3luY0JvdW5kcyk7XG4gICAgb24oXCJzaG93XCIsICgpID0+IHN5bmNWaXNpYmlsaXR5KHRydWUpKTtcbiAgICBvbihcImhpZGVcIiwgKCkgPT4gc3luY1Zpc2liaWxpdHkoZmFsc2UpKTtcbiAgICBvbihcImZvY3VzXCIsICgpID0+IHN5bmNGb2N1cyh0cnVlKSk7XG4gICAgb24oXCJibHVyXCIsICgpID0+IHN5bmNGb2N1cyhmYWxzZSkpO1xuICAgIG9uKFwiY2xvc2VcIiwgZGlzcG9zZVdpdGhQYXJlbnQpO1xuICAgIG9uKFwiY2xvc2VkXCIsIGRpc3Bvc2VXaXRoUGFyZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgc3luY1BhcmVudFN0YXRlKFxuICAgIGluc3RhbmNlOiBOYXRpdmVJbnN0YW5jZSxcbiAgICBwYXJlbnRXaW5kb3c6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3csXG4gICAgcmVhc29uOiBzdHJpbmcsXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHN0YXRlID0gcGFyZW50V2luZG93U3RhdGUocGFyZW50V2luZG93LCByZWFzb24pO1xuICAgIGlmICghc3RhdGUpIHJldHVybjtcbiAgICB2b2lkIHRoaXMuY2FsbEZpcnN0T3B0aW9uYWxJbnN0YW5jZShpbnN0YW5jZSwgW1wic3luY1BhcmVudFwiLCBcInBhcmVudENoYW5nZWRcIl0sIFtzdGF0ZV0pXG4gICAgICAudGhlbigoaGFuZGxlZCkgPT4ge1xuICAgICAgICBpZiAoIWhhbmRsZWQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsRmlyc3RPcHRpb25hbEluc3RhbmNlKFxuICAgICAgICAgICAgaW5zdGFuY2UsXG4gICAgICAgICAgICBbXCJzZXRQYXJlbnRCb3VuZHNcIiwgXCJwYXJlbnRCb3VuZHNDaGFuZ2VkXCJdLFxuICAgICAgICAgICAgW3N0YXRlLmJvdW5kcywgc3RhdGVdLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHRoaXMubG9nKFwid2FyblwiLCBgbmF0aXZlICR7aW5zdGFuY2Uua2luZH0gcGFyZW50IHN5bmMgZmFpbGVkYCwgZXJyb3IpKTtcbiAgfVxuXG4gIHByaXZhdGUgc2lnbmFsUGFyZW50U3RhdGUoXG4gICAgaW5zdGFuY2U6IE5hdGl2ZUluc3RhbmNlLFxuICAgIHBhcmVudFdpbmRvdzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyxcbiAgICByZWFzb246IHN0cmluZyxcbiAgICBwYXRjaDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHN0YXRlID0gcGFyZW50V2luZG93U3RhdGUocGFyZW50V2luZG93LCByZWFzb24pO1xuICAgIGlmICghc3RhdGUpIHJldHVybjtcbiAgICBjb25zdCBwYXlsb2FkID0geyAuLi5zdGF0ZSwgLi4ucGF0Y2ggfTtcbiAgICB2b2lkIHRoaXMuY2FsbEZpcnN0T3B0aW9uYWxJbnN0YW5jZShpbnN0YW5jZSwgW1wicGFyZW50U3RhdGVDaGFuZ2VkXCIsIFwicGFyZW50Q2hhbmdlZFwiXSwgW3BheWxvYWRdKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4gdGhpcy5sb2coXCJ3YXJuXCIsIGBuYXRpdmUgJHtpbnN0YW5jZS5raW5kfSBwYXJlbnQgc2lnbmFsIGZhaWxlZGAsIGVycm9yKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhbGxGaXJzdE9wdGlvbmFsSW5zdGFuY2UoXG4gICAgaW5zdGFuY2U6IE5hdGl2ZUluc3RhbmNlLFxuICAgIG1ldGhvZHM6IHN0cmluZ1tdLFxuICAgIGFyZ3M6IHVua25vd25bXSxcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gYXNSZWNvcmQoaW5zdGFuY2UudmFsdWUpO1xuICAgIGZvciAoY29uc3QgbWV0aG9kIG9mIG1ldGhvZHMpIHtcbiAgICAgIGNvbnN0IGZuID0gdGFyZ2V0Py5bbWV0aG9kXTtcbiAgICAgIGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgY29udGludWU7XG4gICAgICBhd2FpdCBmbi5hcHBseShpbnN0YW5jZS52YWx1ZSwgYXJncyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kSGVscGVyKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZywgbWVzc2FnZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGhlbHBlciA9IHRoaXMuaGVscGVyRm9yKHR3ZWFrSWQsIGlkKTtcbiAgICBoZWxwZXIuY2hpbGQuc3RkaW4ud3JpdGUoYCR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZSl9XFxuYCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlcXVlc3RIZWxwZXIoXG4gICAgdHdlYWtJZDogc3RyaW5nLFxuICAgIGlkOiBzdHJpbmcsXG4gICAgbWVzc2FnZTogdW5rbm93bixcbiAgICB0aW1lb3V0TXMgPSAxMF8wMDAsXG4gICk6IFByb21pc2U8dW5rbm93bj4ge1xuICAgIGNvbnN0IGhlbHBlciA9IHRoaXMuaGVscGVyRm9yKHR3ZWFrSWQsIGlkKTtcbiAgICBjb25zdCByZXF1ZXN0SWQgPSByYW5kb21VVUlEKCk7XG4gICAgY29uc3QgcGF5bG9hZCA9IHsgaWQ6IHJlcXVlc3RJZCwgbWVzc2FnZSB9O1xuICAgIHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBoZWxwZXIucGVuZGluZy5kZWxldGUocmVxdWVzdElkKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgbmF0aXZlIGhlbHBlciByZXF1ZXN0IHRpbWVkIG91dDogJHt0d2Vha0lkfToke2lkfWApKTtcbiAgICAgIH0sIHRpbWVvdXRNcyk7XG4gICAgICBoZWxwZXIucGVuZGluZy5zZXQocmVxdWVzdElkLCB7IHJlc29sdmUsIHJlamVjdCwgdGltZXIgfSk7XG4gICAgICBoZWxwZXIuY2hpbGQuc3RkaW4ud3JpdGUoYCR7SlNPTi5zdHJpbmdpZnkocGF5bG9hZCl9XFxuYCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0b3BIZWxwZXJCeUlkKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGtleSA9IGhlbHBlcktleSh0d2Vha0lkLCBpZCk7XG4gICAgY29uc3QgaGVscGVyID0gdGhpcy5oZWxwZXJzLmdldChrZXkpO1xuICAgIGlmICghaGVscGVyKSByZXR1cm47XG4gICAgdGhpcy5zdG9wSGVscGVyKGhlbHBlcik7XG4gICAgdGhpcy5oZWxwZXJzLmRlbGV0ZShrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdG9wSGVscGVyKGhlbHBlcjogTmF0aXZlSGVscGVyUHJvY2Vzcyk6IHZvaWQge1xuICAgIGlmIChoZWxwZXIuY2hpbGQua2lsbGVkKSByZXR1cm47XG4gICAgaGVscGVyLmNoaWxkLmtpbGwoKTtcbiAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCFoZWxwZXIuY2hpbGQua2lsbGVkKSBoZWxwZXIuY2hpbGQua2lsbChcIlNJR0tJTExcIik7XG4gICAgfSwgMTUwMCk7XG4gICAgdGltZXIudW5yZWY/LigpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVIZWxwZXJMaW5lKGhlbHBlcjogTmF0aXZlSGVscGVyUHJvY2VzcywgbGluZTogc3RyaW5nKTogdm9pZCB7XG4gICAgbGV0IHBheWxvYWQ6IHsgaWQ/OiB1bmtub3duOyByZXN1bHQ/OiB1bmtub3duOyBlcnJvcj86IHVua25vd24gfTtcbiAgICB0cnkge1xuICAgICAgcGF5bG9hZCA9IEpTT04ucGFyc2UobGluZSkgYXMgdHlwZW9mIHBheWxvYWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLmxvZyhcImluZm9cIiwgYG5hdGl2ZSBoZWxwZXIgJHtoZWxwZXIudHdlYWtJZH06JHtoZWxwZXIuaWR9YCwgbGluZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcGF5bG9hZC5pZCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuO1xuICAgIGNvbnN0IHJlcXVlc3QgPSBoZWxwZXIucGVuZGluZy5nZXQocGF5bG9hZC5pZCk7XG4gICAgaWYgKCFyZXF1ZXN0KSByZXR1cm47XG4gICAgaGVscGVyLnBlbmRpbmcuZGVsZXRlKHBheWxvYWQuaWQpO1xuICAgIGNsZWFyVGltZW91dChyZXF1ZXN0LnRpbWVyKTtcbiAgICBpZiAocGF5bG9hZC5lcnJvcikge1xuICAgICAgcmVxdWVzdC5yZWplY3QobmV3IEVycm9yKFN0cmluZyhwYXlsb2FkLmVycm9yKSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0LnJlc29sdmUocGF5bG9hZC5yZXN1bHQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgbW9kdWxlRm9yKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IExvYWRlZE5hdGl2ZU1vZHVsZSB7XG4gICAgY29uc3QgbW9kID0gdGhpcy5tb2R1bGVzLmdldChtb2R1bGVLZXkodHdlYWtJZCwgaWQpKTtcbiAgICBpZiAoIW1vZCkgdGhyb3cgbmV3IEVycm9yKGBuYXRpdmUgbW9kdWxlIGlzIG5vdCBsb2FkZWQ6ICR7dHdlYWtJZH06JHtpZH1gKTtcbiAgICByZXR1cm4gbW9kO1xuICB9XG5cbiAgcHJpdmF0ZSBpbnN0YW5jZUZvcih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBOYXRpdmVJbnN0YW5jZSB7XG4gICAgY29uc3QgaW5zdGFuY2UgPSB0aGlzLmluc3RhbmNlcy5nZXQoaW5zdGFuY2VLZXkodHdlYWtJZCwgaWQpKTtcbiAgICBpZiAoIWluc3RhbmNlKSB0aHJvdyBuZXcgRXJyb3IoYG5hdGl2ZSBpbnN0YW5jZSBpcyBub3QgbG9hZGVkOiAke3R3ZWFrSWR9OiR7aWR9YCk7XG4gICAgcmV0dXJuIGluc3RhbmNlO1xuICB9XG5cbiAgcHJpdmF0ZSBoZWxwZXJGb3IodHdlYWtJZDogc3RyaW5nLCBpZDogc3RyaW5nKTogTmF0aXZlSGVscGVyUHJvY2VzcyB7XG4gICAgY29uc3QgaGVscGVyID0gdGhpcy5oZWxwZXJzLmdldChoZWxwZXJLZXkodHdlYWtJZCwgaWQpKTtcbiAgICBpZiAoIWhlbHBlcikgdGhyb3cgbmV3IEVycm9yKGBuYXRpdmUgaGVscGVyIGlzIG5vdCBydW5uaW5nOiAke3R3ZWFrSWR9OiR7aWR9YCk7XG4gICAgcmV0dXJuIGhlbHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXNvbHZlVHdlYWtQYXRoKGN0eDogTmF0aXZlVHdlYWtDb250ZXh0LCBwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcmVzb2x2ZU5hdGl2ZVR3ZWFrUGF0aChjdHguZGlyLCBwYXRoKTtcbn1cblxuZnVuY3Rpb24gaW5mZXJNb2R1bGVLaW5kKHBhdGg6IHN0cmluZyk6IE5hdGl2ZU1vZHVsZUtpbmQge1xuICBpZiAocGF0aC5lbmRzV2l0aChcIi5ub2RlXCIpKSByZXR1cm4gXCJub2RlLWFkZG9uXCI7XG4gIGlmIChwYXRoLmVuZHNXaXRoKFwiLmR5bGliXCIpKSByZXR1cm4gXCJkeWxpYlwiO1xuICBpZiAocGF0aC5lbmRzV2l0aChcIi5mcmFtZXdvcmtcIikpIHJldHVybiBcImZyYW1ld29ya1wiO1xuICB0aHJvdyBuZXcgRXJyb3IoXCJuYXRpdmUgbW9kdWxlIHBhdGggbXVzdCBlbmQgaW4gLm5vZGUsIC5keWxpYiwgb3IgLmZyYW1ld29ya1wiKTtcbn1cblxuZnVuY3Rpb24gc2VsZWN0RW50cnlwb2ludChsb2FkZWQ6IHVua25vd24sIGVudHJ5cG9pbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHVua25vd24ge1xuICBpZiAoIWVudHJ5cG9pbnQpIHJldHVybiBhc1JlY29yZChsb2FkZWQpPy5kZWZhdWx0ID8/IGxvYWRlZDtcbiAgY29uc3Qgc2VsZWN0ZWQgPSBhc1JlY29yZChsb2FkZWQpPy5bZW50cnlwb2ludF07XG4gIGlmIChzZWxlY3RlZCA9PT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoYG5hdGl2ZSBtb2R1bGUgZW50cnlwb2ludCBub3QgZm91bmQ6ICR7ZW50cnlwb2ludH1gKTtcbiAgcmV0dXJuIHNlbGVjdGVkO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRCcmlkZ2VJZCh2YWx1ZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIiB8fCAhL15bYS16QS1aMC05Ll8tXSskLy50ZXN0KHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgJHtsYWJlbH0gbWF5IG9ubHkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCB1bmRlcnNjb3JlcywgYW5kIGRhc2hlc2ApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlS2V5KHR3ZWFrSWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgJHt0d2Vha0lkfToke21vZHVsZUlkfWA7XG59XG5cbmZ1bmN0aW9uIGluc3RhbmNlS2V5KHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgJHt0d2Vha0lkfToke2lkfWA7XG59XG5cbmZ1bmN0aW9uIGhlbHBlcktleSh0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYCR7dHdlYWtJZH06JHtpZH1gO1xufVxuXG5mdW5jdGlvbiBhc1JlY29yZCh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgbnVsbCB7XG4gIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgPyB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA6IG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxPcHRpb25hbCh0YXJnZXQ6IHVua25vd24sIG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZm4gPSBhc1JlY29yZCh0YXJnZXQpPy5bbWV0aG9kXTtcbiAgaWYgKHR5cGVvZiBmbiA9PT0gXCJmdW5jdGlvblwiKSBhd2FpdCBmbi5hcHBseSh0YXJnZXQsIGFyZ3MpO1xufVxuXG5mdW5jdGlvbiBwYXJlbnRXaW5kb3dTdGF0ZShwYXJlbnRXaW5kb3c6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3csIHJlYXNvbjogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcbiAgaWYgKGlzV2luZG93RGVzdHJveWVkKHBhcmVudFdpbmRvdykpIHJldHVybiBudWxsO1xuICBjb25zdCBib3VuZHMgPSBjYWxsV2luZG93TWV0aG9kPEVsZWN0cm9uLlJlY3RhbmdsZT4ocGFyZW50V2luZG93LCBcImdldEJvdW5kc1wiKTtcbiAgY29uc3QgY29udGVudEJvdW5kcyA9IGNhbGxXaW5kb3dNZXRob2Q8RWxlY3Ryb24uUmVjdGFuZ2xlPihwYXJlbnRXaW5kb3csIFwiZ2V0Q29udGVudEJvdW5kc1wiKTtcbiAgcmV0dXJuIHtcbiAgICByZWFzb24sXG4gICAgd2luZG93SWQ6IHdpbmRvd0lkRm9yKHBhcmVudFdpbmRvdyksXG4gICAgd2ViQ29udGVudHNJZDogd2ViQ29udGVudHNJZEZvcihwYXJlbnRXaW5kb3cpLFxuICAgIGJvdW5kcyxcbiAgICBjb250ZW50Qm91bmRzLFxuICAgIHZpc2libGU6IGNhbGxXaW5kb3dNZXRob2Q8Ym9vbGVhbj4ocGFyZW50V2luZG93LCBcImlzVmlzaWJsZVwiKSA/PyBudWxsLFxuICAgIGZvY3VzZWQ6IGNhbGxXaW5kb3dNZXRob2Q8Ym9vbGVhbj4ocGFyZW50V2luZG93LCBcImlzRm9jdXNlZFwiKSA/PyBudWxsLFxuICAgIG1pbmltaXplZDogY2FsbFdpbmRvd01ldGhvZDxib29sZWFuPihwYXJlbnRXaW5kb3csIFwiaXNNaW5pbWl6ZWRcIikgPz8gbnVsbCxcbiAgICBtYXhpbWl6ZWQ6IGNhbGxXaW5kb3dNZXRob2Q8Ym9vbGVhbj4ocGFyZW50V2luZG93LCBcImlzTWF4aW1pemVkXCIpID8/IG51bGwsXG4gICAgZnVsbHNjcmVlbjogY2FsbFdpbmRvd01ldGhvZDxib29sZWFuPihwYXJlbnRXaW5kb3csIFwiaXNGdWxsU2NyZWVuXCIpID8/IG51bGwsXG4gIH07XG59XG5cbmZ1bmN0aW9uIG5hdGl2ZUhhbmRsZUZvcldpbmRvdyhwYXJlbnRXaW5kb3c6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsIHwgdW5kZWZpbmVkKTogQnVmZmVyIHwgbnVsbCB7XG4gIGlmICghcGFyZW50V2luZG93IHx8IGlzV2luZG93RGVzdHJveWVkKHBhcmVudFdpbmRvdykpIHJldHVybiBudWxsO1xuICBjb25zdCBmbiA9IGFzUmVjb3JkKHBhcmVudFdpbmRvdyk/LmdldE5hdGl2ZVdpbmRvd0hhbmRsZTtcbiAgaWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCBoYW5kbGUgPSBmbi5jYWxsKHBhcmVudFdpbmRvdyk7XG4gICAgcmV0dXJuIEJ1ZmZlci5pc0J1ZmZlcihoYW5kbGUpID8gaGFuZGxlIDogbnVsbDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2FuQmluZFBhcmVudFdpbmRvdyhcbiAgcGFyZW50V2luZG93OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCB8IHVuZGVmaW5lZCxcbik6IHBhcmVudFdpbmRvdyBpcyBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHtcbiAgaWYgKCFwYXJlbnRXaW5kb3cgfHwgaXNXaW5kb3dEZXN0cm95ZWQocGFyZW50V2luZG93KSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHlwZW9mIGFzUmVjb3JkKHBhcmVudFdpbmRvdyk/Lm9uID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICB0eXBlb2YgYXNSZWNvcmQocGFyZW50V2luZG93KT8ub2ZmID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmZ1bmN0aW9uIGlzV2luZG93RGVzdHJveWVkKHBhcmVudFdpbmRvdzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcbiAgY29uc3QgZm4gPSBhc1JlY29yZChwYXJlbnRXaW5kb3cpPy5pc0Rlc3Ryb3llZDtcbiAgaWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEJvb2xlYW4oZm4uY2FsbChwYXJlbnRXaW5kb3cpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZnVuY3Rpb24gd2luZG93SWRGb3IocGFyZW50V2luZG93OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCB8IHVuZGVmaW5lZCk6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBpZCA9IGFzUmVjb3JkKHBhcmVudFdpbmRvdyk/LmlkO1xuICByZXR1cm4gdHlwZW9mIGlkID09PSBcIm51bWJlclwiID8gaWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiB3ZWJDb250ZW50c0lkRm9yKHBhcmVudFdpbmRvdzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IG51bGwgfCB1bmRlZmluZWQpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3Qgd2ViQ29udGVudHMgPSBhc1JlY29yZChhc1JlY29yZChwYXJlbnRXaW5kb3cpPy53ZWJDb250ZW50cyk7XG4gIGNvbnN0IGlkID0gd2ViQ29udGVudHM/LmlkO1xuICByZXR1cm4gdHlwZW9mIGlkID09PSBcIm51bWJlclwiID8gaWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBjYWxsV2luZG93TWV0aG9kPFQ+KHBhcmVudFdpbmRvdzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdywgbWV0aG9kOiBzdHJpbmcpOiBUIHwgbnVsbCB7XG4gIGNvbnN0IGZuID0gYXNSZWNvcmQocGFyZW50V2luZG93KT8uW21ldGhvZF07XG4gIGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGZuLmNhbGwocGFyZW50V2luZG93KSBhcyBUO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuIiwgImltcG9ydCB7IHJlYWxwYXRoU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBpc0Fic29sdXRlLCByZWxhdGl2ZSwgcmVzb2x2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVOYXRpdmVUd2Vha1BhdGgodHdlYWtEaXI6IHN0cmluZywgcGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBwYXRoICE9PSBcInN0cmluZ1wiIHx8IHBhdGgudHJpbSgpID09PSBcIlwiKSB0aHJvdyBuZXcgRXJyb3IoXCJuYXRpdmUgcGF0aCBpcyByZXF1aXJlZFwiKTtcbiAgY29uc3Qgcm9vdCA9IHJlYWxwYXRoU3luYyh0d2Vha0Rpcik7XG4gIGNvbnN0IGZ1bGwgPSByZXNvbHZlKHR3ZWFrRGlyLCBwYXRoKTtcbiAgbGV0IHRhcmdldDogc3RyaW5nO1xuICB0cnkge1xuICAgIHRhcmdldCA9IHJlYWxwYXRoU3luYyhmdWxsKTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwibmF0aXZlIHBhdGggZG9lcyBub3QgZXhpc3RcIik7XG4gIH1cbiAgaWYgKCFpc1BhdGhJbnNpZGUocm9vdCwgdGFyZ2V0KSB8fCB0YXJnZXQgPT09IHJvb3QpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJuYXRpdmUgcGF0aCBtdXN0IHN0YXkgaW5zaWRlIHRoZSB0d2VhayBkaXJlY3RvcnlcIik7XG4gIH1cbiAgcmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUGF0aEluc2lkZShwYXJlbnQ6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgcmVsID0gcmVsYXRpdmUocmVzb2x2ZShwYXJlbnQpLCByZXNvbHZlKHRhcmdldCkpO1xuICByZXR1cm4gcmVsID09PSBcIlwiIHx8ICghIXJlbCAmJiAhcmVsLnN0YXJ0c1dpdGgoXCIuLlwiKSAmJiAhaXNBYnNvbHV0ZShyZWwpKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR3ZWFrTWFuaWZlc3QgfSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9UV0VBS19TVE9SRV9JTkRFWF9VUkwgPVxuICBcImh0dHBzOi8vYi1ubmV0dC5naXRodWIuaW8vY29kZXgtcGx1c3BsdXMvc3RvcmUvaW5kZXguanNvblwiO1xuZXhwb3J0IGNvbnN0IFRXRUFLX1NUT1JFX1JFVklFV19JU1NVRV9VUkwgPVxuICBcImh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXdcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUd2Vha1N0b3JlUmVnaXN0cnkge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgZW50cmllczogVHdlYWtTdG9yZUVudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZUVudHJ5IHtcbiAgaWQ6IHN0cmluZztcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gIHJlcG86IHN0cmluZztcbiAgYXBwcm92ZWRDb21taXRTaGE6IHN0cmluZztcbiAgYXBwcm92ZWRBdDogc3RyaW5nO1xuICBhcHByb3ZlZEJ5OiBzdHJpbmc7XG4gIHBsYXRmb3Jtcz86IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdO1xuICByZWxlYXNlVXJsPzogc3RyaW5nO1xuICByZXZpZXdVcmw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFR3ZWFrU3RvcmVQbGF0Zm9ybSA9IFwiZGFyd2luXCIgfCBcIndpbjMyXCIgfCBcImxpbnV4XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uIHtcbiAgcmVwbzogc3RyaW5nO1xuICBkZWZhdWx0QnJhbmNoOiBzdHJpbmc7XG4gIGNvbW1pdFNoYTogc3RyaW5nO1xuICBjb21taXRVcmw6IHN0cmluZztcbiAgbWFuaWZlc3Q/OiB7XG4gICAgaWQ/OiBzdHJpbmc7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICB2ZXJzaW9uPzogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICAgIGljb25Vcmw/OiBzdHJpbmc7XG4gIH07XG59XG5cbmNvbnN0IEdJVEhVQl9SRVBPX1JFID0gL15bQS1aYS16MC05Xy4tXStcXC9bQS1aYS16MC05Xy4tXSskLztcbmNvbnN0IEZVTExfU0hBX1JFID0gL15bYS1mMC05XXs0MH0kL2k7XG5jb25zdCBWRVJTSU9OX1JFID0gL152PyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlstK10uKik/JC9pO1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplR2l0SHViUmVwbyhpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgcmF3ID0gaW5wdXQudHJpbSgpO1xuICBpZiAoIXJhdykgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gaXMgcmVxdWlyZWRcIik7XG5cbiAgY29uc3Qgc3NoID0gL15naXRAZ2l0aHViXFwuY29tOihbXi9dK1xcL1teL10rPykoPzpcXC5naXQpPyQvaS5leGVjKHJhdyk7XG4gIGlmIChzc2gpIHJldHVybiBub3JtYWxpemVSZXBvUGFydChzc2hbMV0pO1xuXG4gIGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHJhdykpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhdyk7XG4gICAgaWYgKHVybC5ob3N0bmFtZSAhPT0gXCJnaXRodWIuY29tXCIpIHRocm93IG5ldyBFcnJvcihcIk9ubHkgZ2l0aHViLmNvbSByZXBvc2l0b3JpZXMgYXJlIHN1cHBvcnRlZFwiKTtcbiAgICBjb25zdCBwYXJ0cyA9IHVybC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8IDIpIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiByZXBvIFVSTCBtdXN0IGluY2x1ZGUgb3duZXIgYW5kIHJlcG9zaXRvcnlcIik7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZVJlcG9QYXJ0KGAke3BhcnRzWzBdfS8ke3BhcnRzWzFdfWApO1xuICB9XG5cbiAgcmV0dXJuIG5vcm1hbGl6ZVJlcG9QYXJ0KHJhdyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVTdG9yZVJlZ2lzdHJ5KGlucHV0OiB1bmtub3duKTogVHdlYWtTdG9yZVJlZ2lzdHJ5IHtcbiAgY29uc3QgcmVnaXN0cnkgPSBpbnB1dCBhcyBQYXJ0aWFsPFR3ZWFrU3RvcmVSZWdpc3RyeT4gfCBudWxsO1xuICBpZiAoIXJlZ2lzdHJ5IHx8IHJlZ2lzdHJ5LnNjaGVtYVZlcnNpb24gIT09IDEgfHwgIUFycmF5LmlzQXJyYXkocmVnaXN0cnkuZW50cmllcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnN1cHBvcnRlZCB0d2VhayBzdG9yZSByZWdpc3RyeVwiKTtcbiAgfVxuICBjb25zdCBlbnRyaWVzID0gcmVnaXN0cnkuZW50cmllcy5tYXAobm9ybWFsaXplU3RvcmVFbnRyeSk7XG4gIGVudHJpZXMuc29ydCgoYSwgYikgPT4gYS5tYW5pZmVzdC5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tYW5pZmVzdC5uYW1lKSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hVmVyc2lvbjogMSxcbiAgICBnZW5lcmF0ZWRBdDogdHlwZW9mIHJlZ2lzdHJ5LmdlbmVyYXRlZEF0ID09PSBcInN0cmluZ1wiID8gcmVnaXN0cnkuZ2VuZXJhdGVkQXQgOiB1bmRlZmluZWQsXG4gICAgZW50cmllcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNodWZmbGVTdG9yZUVudHJpZXM8VD4oXG4gIGVudHJpZXM6IHJlYWRvbmx5IFRbXSxcbiAgcmFuZG9tSW5kZXg6IChleGNsdXNpdmVNYXg6IG51bWJlcikgPT4gbnVtYmVyID0gKGV4Y2x1c2l2ZU1heCkgPT4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZXhjbHVzaXZlTWF4KSxcbik6IFRbXSB7XG4gIGNvbnN0IHNodWZmbGVkID0gWy4uLmVudHJpZXNdO1xuICBmb3IgKGxldCBpID0gc2h1ZmZsZWQubGVuZ3RoIC0gMTsgaSA+IDA7IGkgLT0gMSkge1xuICAgIGNvbnN0IGogPSByYW5kb21JbmRleChpICsgMSk7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGopIHx8IGogPCAwIHx8IGogPiBpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHNodWZmbGUgcmFuZG9tSW5kZXggcmV0dXJuZWQgJHtqfTsgZXhwZWN0ZWQgYW4gaW50ZWdlciBmcm9tIDAgdG8gJHtpfWApO1xuICAgIH1cbiAgICBbc2h1ZmZsZWRbaV0sIHNodWZmbGVkW2pdXSA9IFtzaHVmZmxlZFtqXSwgc2h1ZmZsZWRbaV1dO1xuICB9XG4gIHJldHVybiBzaHVmZmxlZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVN0b3JlRW50cnkoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlRW50cnkge1xuICBjb25zdCBlbnRyeSA9IGlucHV0IGFzIFBhcnRpYWw8VHdlYWtTdG9yZUVudHJ5PiB8IG51bGw7XG4gIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSBcIm9iamVjdFwiKSB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHR3ZWFrIHN0b3JlIGVudHJ5XCIpO1xuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhTdHJpbmcoZW50cnkucmVwbyA/PyBlbnRyeS5tYW5pZmVzdD8uZ2l0aHViUmVwbyA/PyBcIlwiKSk7XG4gIGNvbnN0IG1hbmlmZXN0ID0gZW50cnkubWFuaWZlc3QgYXMgVHdlYWtNYW5pZmVzdCB8IHVuZGVmaW5lZDtcbiAgaWYgKCFtYW5pZmVzdD8uaWQgfHwgIW1hbmlmZXN0Lm5hbWUgfHwgIW1hbmlmZXN0LnZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5IGZvciAke3JlcG99IGlzIG1pc3NpbmcgbWFuaWZlc3QgZmllbGRzYCk7XG4gIH1cbiAgaWYgKG5vcm1hbGl6ZUdpdEh1YlJlcG8obWFuaWZlc3QuZ2l0aHViUmVwbykgIT09IHJlcG8pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IHJlcG8gZG9lcyBub3QgbWF0Y2ggbWFuaWZlc3QgZ2l0aHViUmVwb2ApO1xuICB9XG4gIGlmICghaXNGdWxsQ29tbWl0U2hhKFN0cmluZyhlbnRyeS5hcHByb3ZlZENvbW1pdFNoYSA/PyBcIlwiKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IG11c3QgcGluIGEgZnVsbCBhcHByb3ZlZCBjb21taXQgU0hBYCk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBpZDogbWFuaWZlc3QuaWQsXG4gICAgbWFuaWZlc3QsXG4gICAgcmVwbyxcbiAgICBhcHByb3ZlZENvbW1pdFNoYTogU3RyaW5nKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhKSxcbiAgICBhcHByb3ZlZEF0OiB0eXBlb2YgZW50cnkuYXBwcm92ZWRBdCA9PT0gXCJzdHJpbmdcIiA/IGVudHJ5LmFwcHJvdmVkQXQgOiBcIlwiLFxuICAgIGFwcHJvdmVkQnk6IHR5cGVvZiBlbnRyeS5hcHByb3ZlZEJ5ID09PSBcInN0cmluZ1wiID8gZW50cnkuYXBwcm92ZWRCeSA6IFwiXCIsXG4gICAgcGxhdGZvcm1zOiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcygoZW50cnkgYXMgeyBwbGF0Zm9ybXM/OiB1bmtub3duIH0pLnBsYXRmb3JtcyksXG4gICAgcmVsZWFzZVVybDogb3B0aW9uYWxHaXRodWJVcmwoZW50cnkucmVsZWFzZVVybCksXG4gICAgcmV2aWV3VXJsOiBvcHRpb25hbEdpdGh1YlVybChlbnRyeS5yZXZpZXdVcmwpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RvcmVBcmNoaXZlVXJsKGVudHJ5OiBUd2Vha1N0b3JlRW50cnkpOiBzdHJpbmcge1xuICBpZiAoIWlzRnVsbENvbW1pdFNoYShlbnRyeS5hcHByb3ZlZENvbW1pdFNoYSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7ZW50cnkuaWR9IGlzIG5vdCBwaW5uZWQgdG8gYSBmdWxsIGNvbW1pdCBTSEFgKTtcbiAgfVxuICByZXR1cm4gYGh0dHBzOi8vY29kZWxvYWQuZ2l0aHViLmNvbS8ke2VudHJ5LnJlcG99L3Rhci5nei8ke2VudHJ5LmFwcHJvdmVkQ29tbWl0U2hhfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b3JlVXBkYXRlQXZhaWxhYmxlKGluc3RhbGxlZFZlcnNpb246IHN0cmluZywgYXBwcm92ZWRWZXJzaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgaW5zdGFsbGVkID0gVkVSU0lPTl9SRS5leGVjKGluc3RhbGxlZFZlcnNpb24udHJpbSgpKTtcbiAgY29uc3QgYXBwcm92ZWQgPSBWRVJTSU9OX1JFLmV4ZWMoYXBwcm92ZWRWZXJzaW9uLnRyaW0oKSk7XG4gIGlmICghaW5zdGFsbGVkIHx8ICFhcHByb3ZlZCkgcmV0dXJuIGZhbHNlO1xuICBmb3IgKGxldCBpID0gMTsgaSA8PSAzOyBpKyspIHtcbiAgICBjb25zdCBkaWZmID0gTnVtYmVyKGFwcHJvdmVkW2ldKSAtIE51bWJlcihpbnN0YWxsZWRbaV0pO1xuICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZiA+IDA7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRUd2Vha1B1Ymxpc2hJc3N1ZVVybChzdWJtaXNzaW9uOiBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb24pOiBzdHJpbmcge1xuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhzdWJtaXNzaW9uLnJlcG8pO1xuICBpZiAoIWlzRnVsbENvbW1pdFNoYShzdWJtaXNzaW9uLmNvbW1pdFNoYSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJTdWJtaXNzaW9uIG11c3QgaW5jbHVkZSB0aGUgZnVsbCBjb21taXQgU0hBIHRvIHJldmlld1wiKTtcbiAgfVxuICBjb25zdCB0aXRsZSA9IGBUd2VhayBzdG9yZSByZXZpZXc6ICR7cmVwb31gO1xuICBjb25zdCBib2R5ID0gW1xuICAgIFwiIyMgVHdlYWsgcmVwb1wiLFxuICAgIGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfWAsXG4gICAgXCJcIixcbiAgICBcIiMjIENvbW1pdCB0byByZXZpZXdcIixcbiAgICBzdWJtaXNzaW9uLmNvbW1pdFNoYSxcbiAgICBzdWJtaXNzaW9uLmNvbW1pdFVybCxcbiAgICBcIlwiLFxuICAgIFwiRG8gbm90IGFwcHJvdmUgYSBkaWZmZXJlbnQgY29tbWl0LiBJZiB0aGUgYXV0aG9yIHB1c2hlcyBjaGFuZ2VzLCBhc2sgdGhlbSB0byByZXN1Ym1pdC5cIixcbiAgICBcIlwiLFxuICAgIFwiIyMgTWFuaWZlc3RcIixcbiAgICBgLSBpZDogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py5pZCA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBgLSBuYW1lOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/Lm5hbWUgPz8gXCIobm90IGRldGVjdGVkKVwifWAsXG4gICAgYC0gdmVyc2lvbjogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py52ZXJzaW9uID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxuICAgIGAtIGRlc2NyaXB0aW9uOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/LmRlc2NyaXB0aW9uID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxuICAgIGAtIGljb25Vcmw6ICR7c3VibWlzc2lvbi5tYW5pZmVzdD8uaWNvblVybCA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBcIlwiLFxuICAgIFwiIyMgQWRtaW4gY2hlY2tsaXN0XCIsXG4gICAgXCItIFsgXSBtYW5pZmVzdC5qc29uIGlzIHZhbGlkXCIsXG4gICAgXCItIFsgXSBtYW5pZmVzdC5pY29uVXJsIGlzIHVzYWJsZSBhcyB0aGUgc3RvcmUgaWNvblwiLFxuICAgIFwiLSBbIF0gc291cmNlIHdhcyByZXZpZXdlZCBhdCB0aGUgZXhhY3QgY29tbWl0IGFib3ZlXCIsXG4gICAgXCItIFsgXSBgc3RvcmUvaW5kZXguanNvbmAgZW50cnkgcGlucyBgYXBwcm92ZWRDb21taXRTaGFgIHRvIHRoZSBleGFjdCBjb21taXQgYWJvdmVcIixcbiAgXS5qb2luKFwiXFxuXCIpO1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKFRXRUFLX1NUT1JFX1JFVklFV19JU1NVRV9VUkwpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInRlbXBsYXRlXCIsIFwidHdlYWstc3RvcmUtcmV2aWV3Lm1kXCIpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInRpdGxlXCIsIHRpdGxlKTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJib2R5XCIsIGJvZHkpO1xuICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0Z1bGxDb21taXRTaGEodmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gRlVMTF9TSEFfUkUudGVzdCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVJlcG9QYXJ0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCByZXBvID0gdmFsdWUudHJpbSgpLnJlcGxhY2UoL1xcLmdpdCQvaSwgXCJcIikucmVwbGFjZSgvXlxcLyt8XFwvKyQvZywgXCJcIik7XG4gIGlmICghR0lUSFVCX1JFUE9fUkUudGVzdChyZXBvKSkgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gbXVzdCBiZSBpbiBvd25lci9yZXBvIGZvcm1cIik7XG4gIHJldHVybiByZXBvO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcyhpbnB1dDogdW5rbm93bik6IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdIHwgdW5kZWZpbmVkIHtcbiAgaWYgKGlucHV0ID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmICghQXJyYXkuaXNBcnJheShpbnB1dCkpIHRocm93IG5ldyBFcnJvcihcIlN0b3JlIGVudHJ5IHBsYXRmb3JtcyBtdXN0IGJlIGFuIGFycmF5XCIpO1xuICBjb25zdCBhbGxvd2VkID0gbmV3IFNldDxUd2Vha1N0b3JlUGxhdGZvcm0+KFtcImRhcndpblwiLCBcIndpbjMyXCIsIFwibGludXhcIl0pO1xuICBjb25zdCBwbGF0Zm9ybXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoaW5wdXQubWFwKCh2YWx1ZSkgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIgfHwgIWFsbG93ZWQuaGFzKHZhbHVlIGFzIFR3ZWFrU3RvcmVQbGF0Zm9ybSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgc3RvcmUgcGxhdGZvcm06ICR7U3RyaW5nKHZhbHVlKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlIGFzIFR3ZWFrU3RvcmVQbGF0Zm9ybTtcbiAgfSkpKTtcbiAgcmV0dXJuIHBsYXRmb3Jtcy5sZW5ndGggPiAwID8gcGxhdGZvcm1zIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBvcHRpb25hbEdpdGh1YlVybCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIgfHwgIXZhbHVlLnRyaW0oKSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7XG4gIGlmICh1cmwucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgfHwgdXJsLmhvc3RuYW1lICE9PSBcImdpdGh1Yi5jb21cIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xufVxuIiwgImltcG9ydCB7IGFwcCwgQnJvd3NlclZpZXcsIEJyb3dzZXJXaW5kb3csIE1lc3NhZ2VDaGFubmVsTWFpbiwgaXBjTWFpbiwgbmF0aXZlVGhlbWUgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IGNyZWF0ZUhhc2gsIHJhbmRvbVVVSUQgfSBmcm9tIFwibm9kZTpjcnlwdG9cIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYywgc3RhdFN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgY3JlYXRlU2VydmVyLCB0eXBlIEluY29taW5nTWVzc2FnZSwgdHlwZSBTZXJ2ZXIsIHR5cGUgU2VydmVyUmVzcG9uc2UgfSBmcm9tIFwibm9kZTpodHRwXCI7XG5pbXBvcnQgeyBqb2luLCBub3JtYWxpemUsIHJlbGF0aXZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHR5cGUgeyBTb2NrZXQgfSBmcm9tIFwibm9kZTpuZXRcIjtcblxuY29uc3QgQ09OTkVDVF9QT1JUX0NIQU5ORUwgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1jb25uZWN0LWFwcC1ob3N0XCI7XG5jb25zdCBCUklER0VfUkVRVUVTVF9DSEFOTkVMID0gXCJjb2RleHBwOmJyb3dzZXItdWktYnJpZGdlLXJlcXVlc3RcIjtcbmNvbnN0IEJSSURHRV9SRVNQT05TRV9DSEFOTkVMID0gXCJjb2RleHBwOmJyb3dzZXItdWktYnJpZGdlLXJlc3BvbnNlXCI7XG5jb25zdCBNRVNTQUdFX0ZPUl9WSUVXX0NIQU5ORUwgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1tZXNzYWdlLWZvci12aWV3XCI7XG5jb25zdCBXT1JLRVJfTUVTU0FHRV9DSEFOTkVMID0gXCJjb2RleHBwOmJyb3dzZXItdWktd29ya2VyLW1lc3NhZ2VcIjtcbmNvbnN0IFNZU1RFTV9USEVNRV9DSEFOTkVMID0gXCJjb2RleHBwOmJyb3dzZXItdWktc3lzdGVtLXRoZW1lXCI7XG5cbnR5cGUgTG9nRm4gPSAobGV2ZWw6IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZDtcblxuaW50ZXJmYWNlIENvZGV4V2luZG93U2VydmljZXMge1xuICBnZXRDb250ZXh0PzogKGhvc3RJZDogc3RyaW5nKSA9PiB7IHJlZ2lzdGVyV2luZG93PzogKHdpbmRvd0xpa2U6IENvZGV4V2luZG93TGlrZSkgPT4gdm9pZCB9IHwgbnVsbDtcbiAgZ2V0Q29udGV4dEZvcldlYkNvbnRlbnRzPzogKFxuICAgIHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cyxcbiAgKSA9PiB7IHJlZ2lzdGVyV2luZG93PzogKHdpbmRvd0xpa2U6IENvZGV4V2luZG93TGlrZSkgPT4gdm9pZCB9IHwgbnVsbDtcbiAgd2luZG93TWFuYWdlcj86IHtcbiAgICByZWdpc3RlcldpbmRvdz86IChcbiAgICAgIHdpbmRvd0xpa2U6IENvZGV4V2luZG93TGlrZSxcbiAgICAgIGhvc3RJZDogc3RyaW5nLFxuICAgICAgcHJpbWFyeTogYm9vbGVhbixcbiAgICAgIGFwcGVhcmFuY2U6IHN0cmluZyxcbiAgICApID0+IHZvaWQ7XG4gICAgb3B0aW9ucz86IHtcbiAgICAgIGFsbG93RGV2dG9vbHM/OiBib29sZWFuO1xuICAgICAgcHJlbG9hZFBhdGg/OiBzdHJpbmc7XG4gICAgfTtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIENvZGV4V2luZG93TGlrZSB7XG4gIGlkOiBudW1iZXI7XG4gIHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcbiAgb24oZXZlbnQ6IFwiY2xvc2VkXCIsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgb25jZT8oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiB1bmtub3duO1xuICBvZmY/KGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgcmVtb3ZlTGlzdGVuZXI/KGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdW5rbm93bjtcbiAgaXNEZXN0cm95ZWQ/KCk6IGJvb2xlYW47XG4gIGlzRm9jdXNlZD8oKTogYm9vbGVhbjtcbiAgZm9jdXM/KCk6IHZvaWQ7XG4gIHNob3c/KCk6IHZvaWQ7XG4gIGhpZGU/KCk6IHZvaWQ7XG4gIGdldEJvdW5kcz8oKTogRWxlY3Ryb24uUmVjdGFuZ2xlO1xuICBnZXRDb250ZW50Qm91bmRzPygpOiBFbGVjdHJvbi5SZWN0YW5nbGU7XG4gIGdldFNpemU/KCk6IFtudW1iZXIsIG51bWJlcl07XG4gIGdldENvbnRlbnRTaXplPygpOiBbbnVtYmVyLCBudW1iZXJdO1xuICBzZXRUaXRsZT8odGl0bGU6IHN0cmluZyk6IHZvaWQ7XG4gIGdldFRpdGxlPygpOiBzdHJpbmc7XG4gIHNldFJlcHJlc2VudGVkRmlsZW5hbWU/KGZpbGVuYW1lOiBzdHJpbmcpOiB2b2lkO1xuICBzZXREb2N1bWVudEVkaXRlZD8oZWRpdGVkOiBib29sZWFuKTogdm9pZDtcbiAgc2V0V2luZG93QnV0dG9uVmlzaWJpbGl0eT8odmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBCcm93c2VyVWlTZXJ2ZXJPcHRpb25zIHtcbiAgcG9ydDogbnVtYmVyO1xuICBob3N0OiBzdHJpbmc7XG4gIGhpZGVNYWluV2luZG93OiBib29sZWFuO1xuICBnZXRXaW5kb3dTZXJ2aWNlczogKCkgPT4gQ29kZXhXaW5kb3dTZXJ2aWNlcyB8IG51bGw7XG4gIGxvZzogTG9nRm47XG59XG5cbmludGVyZmFjZSBCcm93c2VyVWlIb3N0IHtcbiAgdmlldzogRWxlY3Ryb24uQnJvd3NlclZpZXc7XG4gIHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcbn1cblxuaW50ZXJmYWNlIEJyaWRnZVBlbmRpbmdSZXF1ZXN0IHtcbiAgcmVzb2x2ZTogKHZhbHVlOiB1bmtub3duKSA9PiB2b2lkO1xuICByZWplY3Q6IChlcnJvcjogRXJyb3IpID0+IHZvaWQ7XG4gIHRpbWVyOiBOb2RlSlMuVGltZW91dDtcbn1cblxuaW50ZXJmYWNlIEluaXRpYWxTdGF0ZSB7XG4gIHNuYXBzaG90OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgc3lzdGVtVGhlbWVWYXJpYW50OiBzdHJpbmc7XG4gIHNlbnRyeUluaXRPcHRpb25zOiB1bmtub3duO1xuICBidWlsZEZsYXZvcjogdW5rbm93bjtcbiAgdXNlc093bEFwcFNoZWxsOiBib29sZWFuO1xuICBwbGF0Zm9ybTogTm9kZUpTLlBsYXRmb3JtO1xuICBhcmNoOiBzdHJpbmc7XG59XG5cbmNvbnN0IE1JTUVfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiLmh0bWxcIjogXCJ0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLThcIixcbiAgXCIuanNcIjogXCJ0ZXh0L2phdmFzY3JpcHQ7IGNoYXJzZXQ9dXRmLThcIixcbiAgXCIuY3NzXCI6IFwidGV4dC9jc3M7IGNoYXJzZXQ9dXRmLThcIixcbiAgXCIuanNvblwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCIuc3ZnXCI6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxuICBcIi5wbmdcIjogXCJpbWFnZS9wbmdcIixcbiAgXCIuanBnXCI6IFwiaW1hZ2UvanBlZ1wiLFxuICBcIi5qcGVnXCI6IFwiaW1hZ2UvanBlZ1wiLFxuICBcIi53ZWJwXCI6IFwiaW1hZ2Uvd2VicFwiLFxuICBcIi5pY29cIjogXCJpbWFnZS94LWljb25cIixcbiAgXCIud29mZlwiOiBcImZvbnQvd29mZlwiLFxuICBcIi53b2ZmMlwiOiBcImZvbnQvd29mZjJcIixcbn07XG5cbmxldCBhY3RpdmVTZXJ2ZXI6IFNlcnZlciB8IG51bGwgPSBudWxsO1xubGV0IGFjdGl2ZUhvc3Q6IEJyb3dzZXJVaUhvc3QgfCBudWxsID0gbnVsbDtcbmxldCBhY3RpdmVPcHRpb25zOiBCcm93c2VyVWlTZXJ2ZXJPcHRpb25zIHwgbnVsbCA9IG51bGw7XG5jb25zdCBicmlkZ2VSZXF1ZXN0cyA9IG5ldyBNYXA8c3RyaW5nLCBCcmlkZ2VQZW5kaW5nUmVxdWVzdD4oKTtcbmNvbnN0IGNvbnRyb2xDbGllbnRzID0gbmV3IFNldDxXZWJTb2NrZXRDb25uZWN0aW9uPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVTdGFydEJyb3dzZXJVaVNlcnZlcihcbiAgb3B0czogUGljazxCcm93c2VyVWlTZXJ2ZXJPcHRpb25zLCBcImdldFdpbmRvd1NlcnZpY2VzXCIgfCBcImxvZ1wiPixcbik6IHZvaWQge1xuICBpZiAocHJvY2Vzcy5lbnYuQ09ERVhQUF9CUk9XU0VSX1VJICE9PSBcIjFcIikgcmV0dXJuO1xuICBjb25zdCBwb3J0ID0gcGFyc2VQb3J0KHByb2Nlc3MuZW52LkNPREVYUFBfQlJPV1NFUl9VSV9QT1JULCA4NzY1KTtcbiAgc3RhcnRCcm93c2VyVWlTZXJ2ZXIoe1xuICAgIC4uLm9wdHMsXG4gICAgcG9ydCxcbiAgICBob3N0OiBcIjEyNy4wLjAuMVwiLFxuICAgIGhpZGVNYWluV2luZG93OiBwcm9jZXNzLmVudi5DT0RFWFBQX0JST1dTRVJfVUlfSElERV9NQUlOID09PSBcIjFcIixcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydEJyb3dzZXJVaVNlcnZlcihvcHRzOiBCcm93c2VyVWlTZXJ2ZXJPcHRpb25zKTogdm9pZCB7XG4gIGlmIChhY3RpdmVTZXJ2ZXIpIHJldHVybjtcbiAgYWN0aXZlT3B0aW9ucyA9IG9wdHM7XG4gIGluc3RhbGxCcm93c2VyVWlJcGNIYW5kbGVycyhvcHRzLmxvZyk7XG5cbiAgY29uc3Qgc2VydmVyID0gY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4ge1xuICAgIGhhbmRsZUh0dHBSZXF1ZXN0KHJlcSwgcmVzKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIG9wdHMubG9nKFwiZXJyb3JcIiwgXCJicm93c2VyIFVJIHJlcXVlc3QgZmFpbGVkXCIsIHsgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIHNlbmRUZXh0KHJlcywgNTAwLCBcIkludGVybmFsIFNlcnZlciBFcnJvclxcblwiLCBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgfSk7XG4gIH0pO1xuICBzZXJ2ZXIub24oXCJ1cGdyYWRlXCIsIChyZXEsIHNvY2tldCwgaGVhZCkgPT4ge1xuICAgIGhhbmRsZVVwZ3JhZGUocmVxLCBzb2NrZXQgYXMgU29ja2V0LCBoZWFkKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIG9wdHMubG9nKFwid2FyblwiLCBcImJyb3dzZXIgVUkgd2Vic29ja2V0IHVwZ3JhZGUgZmFpbGVkXCIsIHsgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIHNvY2tldC5kZXN0cm95KCk7XG4gICAgfSk7XG4gIH0pO1xuICBzZXJ2ZXIub24oXCJlcnJvclwiLCAoZXJyb3IpID0+IHtcbiAgICBvcHRzLmxvZyhcImVycm9yXCIsIFwiYnJvd3NlciBVSSBzZXJ2ZXIgZmFpbGVkXCIsIHsgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9KTtcbiAgfSk7XG4gIHNlcnZlci5saXN0ZW4ob3B0cy5wb3J0LCBvcHRzLmhvc3QsICgpID0+IHtcbiAgICBvcHRzLmxvZyhcImluZm9cIiwgYGJyb3dzZXIgVUkgc2VydmVyIGxpc3RlbmluZyBhdCBodHRwOi8vJHtvcHRzLmhvc3R9OiR7b3B0cy5wb3J0fS9gKTtcbiAgfSk7XG4gIGFjdGl2ZVNlcnZlciA9IHNlcnZlcjtcbiAgaWYgKG9wdHMuaGlkZU1haW5XaW5kb3cpIHtcbiAgICBmb3IgKGNvbnN0IGRlbGF5TXMgb2YgWzUwMCwgMV81MDAsIDNfMDAwXSkge1xuICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KGhpZGVWaXNpYmxlQ29kZXhXaW5kb3dzLCBkZWxheU1zKTtcbiAgICAgIHRpbWVyLnVucmVmPy4oKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gaW5zdGFsbEJyb3dzZXJVaUlwY0hhbmRsZXJzKGxvZzogTG9nRm4pOiB2b2lkIHtcbiAgaXBjTWFpbi5yZW1vdmVBbGxMaXN0ZW5lcnMoQlJJREdFX1JFU1BPTlNFX0NIQU5ORUwpO1xuICBpcGNNYWluLnJlbW92ZUFsbExpc3RlbmVycyhNRVNTQUdFX0ZPUl9WSUVXX0NIQU5ORUwpO1xuICBpcGNNYWluLnJlbW92ZUFsbExpc3RlbmVycyhXT1JLRVJfTUVTU0FHRV9DSEFOTkVMKTtcbiAgaXBjTWFpbi5yZW1vdmVBbGxMaXN0ZW5lcnMoU1lTVEVNX1RIRU1FX0NIQU5ORUwpO1xuXG4gIGlwY01haW4ub24oQlJJREdFX1JFU1BPTlNFX0NIQU5ORUwsIChldmVudCwgcGF5bG9hZCkgPT4ge1xuICAgIGlmICghaXNCcm93c2VyVWlIb3N0U2VuZGVyKGV2ZW50LnNlbmRlcikpIHJldHVybjtcbiAgICBjb25zdCByZXNwb25zZSA9IGFzUmVjb3JkKHBheWxvYWQpO1xuICAgIGNvbnN0IGlkID0gdHlwZW9mIHJlc3BvbnNlPy5pZCA9PT0gXCJzdHJpbmdcIiA/IHJlc3BvbnNlLmlkIDogXCJcIjtcbiAgICBjb25zdCBwZW5kaW5nID0gYnJpZGdlUmVxdWVzdHMuZ2V0KGlkKTtcbiAgICBpZiAoIXBlbmRpbmcpIHJldHVybjtcbiAgICBicmlkZ2VSZXF1ZXN0cy5kZWxldGUoaWQpO1xuICAgIGNsZWFyVGltZW91dChwZW5kaW5nLnRpbWVyKTtcbiAgICBpZiAocmVzcG9uc2U/Lm9rID09PSB0cnVlKSB7XG4gICAgICBwZW5kaW5nLnJlc29sdmUocmVzcG9uc2UudmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwZW5kaW5nLnJlamVjdChuZXcgRXJyb3IodHlwZW9mIHJlc3BvbnNlPy5lcnJvciA9PT0gXCJzdHJpbmdcIiA/IHJlc3BvbnNlLmVycm9yIDogXCJCcmlkZ2UgcmVxdWVzdCBmYWlsZWRcIikpO1xuICAgIH1cbiAgfSk7XG5cbiAgaXBjTWFpbi5vbihNRVNTQUdFX0ZPUl9WSUVXX0NIQU5ORUwsIChldmVudCwgbWVzc2FnZSkgPT4ge1xuICAgIGlmICghaXNCcm93c2VyVWlIb3N0U2VuZGVyKGV2ZW50LnNlbmRlcikpIHJldHVybjtcbiAgICBicm9hZGNhc3RDb250cm9sKHsgdHlwZTogXCJtZXNzYWdlLWZvci12aWV3XCIsIG1lc3NhZ2UgfSk7XG4gIH0pO1xuXG4gIGlwY01haW4ub24oV09SS0VSX01FU1NBR0VfQ0hBTk5FTCwgKGV2ZW50LCB3b3JrZXJJZCwgbWVzc2FnZSkgPT4ge1xuICAgIGlmICghaXNCcm93c2VyVWlIb3N0U2VuZGVyKGV2ZW50LnNlbmRlcikpIHJldHVybjtcbiAgICBpZiAodHlwZW9mIHdvcmtlcklkICE9PSBcInN0cmluZ1wiKSByZXR1cm47XG4gICAgYnJvYWRjYXN0Q29udHJvbCh7IHR5cGU6IFwid29ya2VyLW1lc3NhZ2VcIiwgd29ya2VySWQsIG1lc3NhZ2UgfSk7XG4gIH0pO1xuXG4gIGlwY01haW4ub24oU1lTVEVNX1RIRU1FX0NIQU5ORUwsIChldmVudCwgdmFsdWUpID0+IHtcbiAgICBpZiAoIWlzQnJvd3NlclVpSG9zdFNlbmRlcihldmVudC5zZW5kZXIpKSByZXR1cm47XG4gICAgYnJvYWRjYXN0Q29udHJvbCh7IHR5cGU6IFwic3lzdGVtLXRoZW1lLXZhcmlhbnQtdXBkYXRlZFwiLCB2YWx1ZSB9KTtcbiAgfSk7XG5cbiAgcHJvY2Vzcy5vbmNlKFwiZXhpdFwiLCAoKSA9PiB7XG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIGJyaWRnZVJlcXVlc3RzLnZhbHVlcygpKSB7XG4gICAgICBjbGVhclRpbWVvdXQocGVuZGluZy50aW1lcik7XG4gICAgICBwZW5kaW5nLnJlamVjdChuZXcgRXJyb3IoXCJDb2RleCsrIGJyb3dzZXIgVUkgc2VydmVyIHN0b3BwZWRcIikpO1xuICAgIH1cbiAgICBicmlkZ2VSZXF1ZXN0cy5jbGVhcigpO1xuICAgIGZvciAoY29uc3QgY2xpZW50IG9mIGNvbnRyb2xDbGllbnRzKSBjbGllbnQuY2xvc2UoKTtcbiAgICBjb250cm9sQ2xpZW50cy5jbGVhcigpO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYWN0aXZlSG9zdCAmJiAhYWN0aXZlSG9zdC53ZWJDb250ZW50cy5pc0Rlc3Ryb3llZCgpKSB7XG4gICAgICAgIGFjdGl2ZUhvc3Qud2ViQ29udGVudHMuY2xvc2UoeyB3YWl0Rm9yQmVmb3JlVW5sb2FkOiBmYWxzZSB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nKFwid2FyblwiLCBcImJyb3dzZXIgVUkgaG9zdCBjbGVhbnVwIGZhaWxlZFwiLCB7IG1lc3NhZ2U6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlSHR0cFJlcXVlc3QocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgb3B0aW9ucyA9IHJlcXVpcmVPcHRpb25zKCk7XG4gIGNvbnN0IHVybCA9IHJlcXVlc3RVcmwocmVxKTtcbiAgaWYgKCF1cmwpIHtcbiAgICBzZW5kVGV4dChyZXMsIDQwMCwgXCJCYWQgUmVxdWVzdFxcblwiLCBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHVybC5wYXRobmFtZSA9PT0gXCIvY29kZXhwcC9icm93c2VyLXVpL2hlYWx0aFwiKSB7XG4gICAgc2VuZEpzb24ocmVzLCAyMDAsIHsgb2s6IHRydWUgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHVybC5wYXRobmFtZSA9PT0gXCIvY29kZXhwcC9icm93c2VyLXVpL2JyaWRnZVwiKSB7XG4gICAgaWYgKHJlcS5tZXRob2QgIT09IFwiUE9TVFwiKSB7XG4gICAgICBzZW5kVGV4dChyZXMsIDQwNSwgXCJNZXRob2QgTm90IEFsbG93ZWRcXG5cIiwgXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBib2R5ID0gYXNSZWNvcmQoYXdhaXQgcmVhZEpzb25Cb2R5KHJlcSkpO1xuICAgIGNvbnN0IG1ldGhvZCA9IHR5cGVvZiBib2R5Py5tZXRob2QgPT09IFwic3RyaW5nXCIgPyBib2R5Lm1ldGhvZCA6IFwiXCI7XG4gICAgY29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkoYm9keT8uYXJncykgPyBib2R5LmFyZ3MgOiBbXTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCBjYWxsSGlkZGVuQnJpZGdlKG1ldGhvZCwgYXJncyk7XG4gICAgICBzZW5kSnNvbihyZXMsIDIwMCwgeyBvazogdHJ1ZSwgdmFsdWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHNlbmRKc29uKHJlcywgNTAwLCB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodXJsLnBhdGhuYW1lID09PSBcIi9jb2RleHBwL2Jyb3dzZXItdWkvYnJpZGdlLmpzXCIpIHtcbiAgICBpZiAocmVxLm1ldGhvZCAhPT0gXCJHRVRcIiAmJiByZXEubWV0aG9kICE9PSBcIkhFQURcIikge1xuICAgICAgc2VuZFRleHQocmVzLCA0MDUsIFwiTWV0aG9kIE5vdCBBbGxvd2VkXFxuXCIsIFwidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc2NyaXB0ID0gYnJvd3NlckJyaWRnZVNjcmlwdChhd2FpdCBjb2xsZWN0SW5pdGlhbFN0YXRlKG9wdGlvbnMpKTtcbiAgICBzZW5kQnVmZmVyKHJlcywgMjAwLCBCdWZmZXIuZnJvbShzY3JpcHQpLCBNSU1FX1RZUEVTW1wiLmpzXCJdLCByZXEubWV0aG9kID09PSBcIkhFQURcIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHJlcS5tZXRob2QgIT09IFwiR0VUXCIgJiYgcmVxLm1ldGhvZCAhPT0gXCJIRUFEXCIpIHtcbiAgICBzZW5kVGV4dChyZXMsIDQwNSwgXCJNZXRob2QgTm90IEFsbG93ZWRcXG5cIiwgXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh1cmwucGF0aG5hbWUgPT09IFwiL1wiIHx8IHVybC5wYXRobmFtZSA9PT0gXCIvaW5kZXguaHRtbFwiKSB7XG4gICAgY29uc3QgaHRtbCA9IGF3YWl0IGJyb3dzZXJJbmRleEh0bWwob3B0aW9ucyk7XG4gICAgc2VuZEJ1ZmZlcihyZXMsIDIwMCwgQnVmZmVyLmZyb20oaHRtbCksIE1JTUVfVFlQRVNbXCIuaHRtbFwiXSwgcmVxLm1ldGhvZCA9PT0gXCJIRUFEXCIpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGZpbGUgPSB3ZWJ2aWV3RmlsZSh1cmwucGF0aG5hbWUpO1xuICBpZiAoIWZpbGUpIHtcbiAgICBzZW5kVGV4dChyZXMsIDQwNCwgXCJOb3QgRm91bmRcXG5cIiwgXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKGZpbGUpO1xuICBzZW5kQnVmZmVyKHJlcywgMjAwLCBjb250ZW50LCBtaW1lVHlwZShmaWxlKSwgcmVxLm1ldGhvZCA9PT0gXCJIRUFEXCIpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVVcGdyYWRlKHJlcTogSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IFNvY2tldCwgaGVhZDogQnVmZmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHVybCA9IHJlcXVlc3RVcmwocmVxKTtcbiAgaWYgKCF1cmwpIHRocm93IG5ldyBFcnJvcihcImJhZCB3ZWJzb2NrZXQgVVJMXCIpO1xuICBpZiAodXJsLnBhdGhuYW1lICE9PSBcIi9jb2RleHBwL2Jyb3dzZXItdWkvcnBjXCIgJiYgdXJsLnBhdGhuYW1lICE9PSBcIi9jb2RleHBwL2Jyb3dzZXItdWkvY29udHJvbFwiKSB7XG4gICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3MgPSBhY2NlcHRXZWJTb2NrZXQocmVxLCBzb2NrZXQsIGhlYWQpO1xuICBpZiAodXJsLnBhdGhuYW1lID09PSBcIi9jb2RleHBwL2Jyb3dzZXItdWkvY29udHJvbFwiKSB7XG4gICAgY29udHJvbENsaWVudHMuYWRkKHdzKTtcbiAgICB3cy5vbkNsb3NlKCgpID0+IGNvbnRyb2xDbGllbnRzLmRlbGV0ZSh3cykpO1xuICAgIHdzLnNlbmRKc29uKHsgdHlwZTogXCJoZWxsb1wiIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhvc3QgPSBhd2FpdCBlbnN1cmVCcm93c2VyVWlIb3N0KCk7XG4gIGNvbnN0IHsgcG9ydDEsIHBvcnQyIH0gPSBuZXcgTWVzc2FnZUNoYW5uZWxNYWluKCk7XG4gIGhvc3Qud2ViQ29udGVudHMucG9zdE1lc3NhZ2UoQ09OTkVDVF9QT1JUX0NIQU5ORUwsIHt9LCBbcG9ydDJdKTtcbiAgYnJpZGdlTWVzc2FnZVBvcnRUb1dlYlNvY2tldChwb3J0MSwgd3MpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBicm93c2VySW5kZXhIdG1sKG9wdGlvbnM6IEJyb3dzZXJVaVNlcnZlck9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBpbmRleFBhdGggPSBqb2luKHdlYnZpZXdSb290KCksIFwiaW5kZXguaHRtbFwiKTtcbiAgbGV0IGh0bWwgPSByZWxheEJyb3dzZXJVaUNzcChyZWFkRmlsZVN5bmMoaW5kZXhQYXRoLCBcInV0ZjhcIikpO1xuICBjb25zdCBzaGltID0gYDxzY3JpcHQgc3JjPVwiL2NvZGV4cHAvYnJvd3Nlci11aS9icmlkZ2UuanNcIj48L3NjcmlwdD5gO1xuICBpZiAoaHRtbC5pbmNsdWRlcyhcIjwvaGVhZD5cIikpIHtcbiAgICBodG1sID0gaHRtbC5yZXBsYWNlKFwiPC9oZWFkPlwiLCBgJHtzaGltfVxcbiAgPC9oZWFkPmApO1xuICB9IGVsc2Uge1xuICAgIGh0bWwgPSBgJHtzaGltfVxcbiR7aHRtbH1gO1xuICB9XG4gIHJldHVybiBodG1sO1xufVxuXG5mdW5jdGlvbiByZWxheEJyb3dzZXJVaUNzcChodG1sOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gaHRtbC5yZXBsYWNlKFxuICAgIC8oPG1ldGFcXHMraHR0cC1lcXVpdj1bXCInXUNvbnRlbnQtU2VjdXJpdHktUG9saWN5W1wiJ11cXHMrY29udGVudD1cIikoW15cIl0qKShcIikvLFxuICAgIChfbWF0Y2gsIHByZWZpeDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBkaXJlY3RpdmVzID0gcGFyc2VDc3BEaXJlY3RpdmVzKGRlY29kZUh0bWxBdHRyaWJ1dGUoY29udGVudCkpO1xuICAgICAgZGlyZWN0aXZlcy5zZXQoXCJjaGlsZC1zcmNcIiwgXCInc2VsZicgYmxvYjogZGF0YTogaHR0cDogaHR0cHM6XCIpO1xuICAgICAgZGlyZWN0aXZlcy5zZXQoXCJmcmFtZS1zcmNcIiwgXCInc2VsZicgYmxvYjogZGF0YTogaHR0cDogaHR0cHM6XCIpO1xuICAgICAgZGlyZWN0aXZlcy5zZXQoXCJjb25uZWN0LXNyY1wiLCBcIidzZWxmJyBodHRwOiBodHRwczogd3M6IHdzczogc2VudHJ5LWlwYzpcIik7XG4gICAgICByZXR1cm4gYCR7cHJlZml4fSR7ZW5jb2RlSHRtbEF0dHJpYnV0ZShmb3JtYXRDc3BEaXJlY3RpdmVzKGRpcmVjdGl2ZXMpKX0ke3N1ZmZpeH1gO1xuICAgIH0sXG4gICk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ3NwRGlyZWN0aXZlcyhjb250ZW50OiBzdHJpbmcpOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcbiAgY29uc3QgZGlyZWN0aXZlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcGFydCBvZiBjb250ZW50LnNwbGl0KFwiO1wiKSkge1xuICAgIGNvbnN0IHRyaW1tZWQgPSBwYXJ0LnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IFtuYW1lLCAuLi5yZXN0XSA9IHRyaW1tZWQuc3BsaXQoL1xccysvKTtcbiAgICBpZiAoIW5hbWUpIGNvbnRpbnVlO1xuICAgIGRpcmVjdGl2ZXMuc2V0KG5hbWUsIHJlc3Quam9pbihcIiBcIikpO1xuICB9XG4gIHJldHVybiBkaXJlY3RpdmVzO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRDc3BEaXJlY3RpdmVzKGRpcmVjdGl2ZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcge1xuICByZXR1cm4gWy4uLmRpcmVjdGl2ZXMuZW50cmllcygpXVxuICAgIC5tYXAoKFtuYW1lLCB2YWx1ZV0pID0+ICh2YWx1ZSA/IGAke25hbWV9ICR7dmFsdWV9YCA6IG5hbWUpKVxuICAgIC5qb2luKFwiOyBcIik7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUh0bWxBdHRyaWJ1dGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZVxuICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgJ1wiJylcbiAgICAucmVwbGFjZSgvJiMzOTsvZywgXCInXCIpXG4gICAgLnJlcGxhY2UoLyZsdDsvZywgXCI8XCIpXG4gICAgLnJlcGxhY2UoLyZndDsvZywgXCI+XCIpXG4gICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlSHRtbEF0dHJpYnV0ZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlXG4gICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgIC5yZXBsYWNlKC9cIi9nLCBcIiZxdW90O1wiKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29sbGVjdEluaXRpYWxTdGF0ZShvcHRpb25zOiBCcm93c2VyVWlTZXJ2ZXJPcHRpb25zKTogUHJvbWlzZTxJbml0aWFsU3RhdGU+IHtcbiAgYXdhaXQgZW5zdXJlQnJvd3NlclVpSG9zdCgpO1xuICBjb25zdCBbc25hcHNob3QsIHN5c3RlbVRoZW1lVmFyaWFudCwgc2VudHJ5SW5pdE9wdGlvbnMsIGJ1aWxkRmxhdm9yLCB1c2VzT3dsQXBwU2hlbGxdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGNhbGxIaWRkZW5CcmlkZ2UoXCJzbmFwc2hvdFwiLCBbXSksXG4gICAgY2FsbEhpZGRlbkJyaWRnZShcInN5c3RlbVRoZW1lXCIsIFtdKSxcbiAgICBjYWxsSGlkZGVuQnJpZGdlKFwic2VudHJ5T3B0aW9uc1wiLCBbXSksXG4gICAgY2FsbEhpZGRlbkJyaWRnZShcImJ1aWxkRmxhdm9yXCIsIFtdKSxcbiAgICBjYWxsSGlkZGVuQnJpZGdlKFwidXNlc093bEFwcFNoZWxsXCIsIFtdKSxcbiAgXSk7XG4gIGlmIChvcHRpb25zLmhpZGVNYWluV2luZG93KSBoaWRlVmlzaWJsZUNvZGV4V2luZG93cygpO1xuICByZXR1cm4ge1xuICAgIHNuYXBzaG90OiBhc1BsYWluT2JqZWN0KHNuYXBzaG90KSxcbiAgICBzeXN0ZW1UaGVtZVZhcmlhbnQ6IHR5cGVvZiBzeXN0ZW1UaGVtZVZhcmlhbnQgPT09IFwic3RyaW5nXCIgPyBzeXN0ZW1UaGVtZVZhcmlhbnQgOiBjdXJyZW50U3lzdGVtVGhlbWVWYXJpYW50KCksXG4gICAgc2VudHJ5SW5pdE9wdGlvbnMsXG4gICAgYnVpbGRGbGF2b3IsXG4gICAgdXNlc093bEFwcFNoZWxsOiB1c2VzT3dsQXBwU2hlbGwgPT09IHRydWUsXG4gICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgYXJjaDogcHJvY2Vzcy5hcmNoLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVCcm93c2VyVWlIb3N0KCk6IFByb21pc2U8QnJvd3NlclVpSG9zdD4ge1xuICBpZiAoYWN0aXZlSG9zdCAmJiAhYWN0aXZlSG9zdC53ZWJDb250ZW50cy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gYWN0aXZlSG9zdDtcbiAgY29uc3Qgb3B0aW9ucyA9IHJlcXVpcmVPcHRpb25zKCk7XG4gIGNvbnN0IHNlcnZpY2VzID0gYXdhaXQgd2FpdEZvcldpbmRvd1NlcnZpY2VzKG9wdGlvbnMpO1xuICBjb25zdCB3aW5kb3dNYW5hZ2VyID0gc2VydmljZXMud2luZG93TWFuYWdlcjtcbiAgaWYgKCF3aW5kb3dNYW5hZ2VyPy5yZWdpc3RlcldpbmRvdykge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNvZGV4IHdpbmRvdyByZWdpc3RyYXRpb24gc2VydmljZXMgYXJlIHVuYXZhaWxhYmxlXCIpO1xuICB9XG5cbiAgY29uc3QgdmlldyA9IG5ldyBCcm93c2VyVmlldyh7XG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIHByZWxvYWQ6IHdpbmRvd01hbmFnZXIub3B0aW9ucz8ucHJlbG9hZFBhdGgsXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcbiAgICAgIHNwZWxsY2hlY2s6IGZhbHNlLFxuICAgICAgZGV2VG9vbHM6IHdpbmRvd01hbmFnZXIub3B0aW9ucz8uYWxsb3dEZXZ0b29scyxcbiAgICB9LFxuICB9KTtcbiAgY29uc3Qgd2luZG93TGlrZSA9IG1ha2VXaW5kb3dMaWtlRm9yVmlldyh2aWV3KTtcbiAgd2luZG93TWFuYWdlci5yZWdpc3RlcldpbmRvdyh3aW5kb3dMaWtlLCBcImxvY2FsXCIsIGZhbHNlLCBcInNlY29uZGFyeVwiKTtcbiAgY29uc3QgY29udGV4dCA9IHNlcnZpY2VzLmdldENvbnRleHRGb3JXZWJDb250ZW50cz8uKHZpZXcud2ViQ29udGVudHMpID8/IHNlcnZpY2VzLmdldENvbnRleHQ/LihcImxvY2FsXCIpO1xuICBjb250ZXh0Py5yZWdpc3RlcldpbmRvdz8uKHdpbmRvd0xpa2UpO1xuICBhd2FpdCB2aWV3LndlYkNvbnRlbnRzLmxvYWRVUkwoXCJhYm91dDpibGFua1wiKTtcbiAgYWN0aXZlSG9zdCA9IHsgdmlldywgd2ViQ29udGVudHM6IHZpZXcud2ViQ29udGVudHMgfTtcbiAgdmlldy53ZWJDb250ZW50cy5vbmNlKFwiZGVzdHJveWVkXCIsICgpID0+IHtcbiAgICBpZiAoYWN0aXZlSG9zdD8ud2ViQ29udGVudHMgPT09IHZpZXcud2ViQ29udGVudHMpIGFjdGl2ZUhvc3QgPSBudWxsO1xuICB9KTtcbiAgb3B0aW9ucy5sb2coXCJpbmZvXCIsIFwiYnJvd3NlciBVSSBoaWRkZW4gaG9zdCByZWFkeVwiLCB7IHdlYkNvbnRlbnRzSWQ6IHZpZXcud2ViQ29udGVudHMuaWQgfSk7XG4gIHJldHVybiBhY3RpdmVIb3N0O1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yV2luZG93U2VydmljZXMob3B0aW9uczogQnJvd3NlclVpU2VydmVyT3B0aW9ucyk6IFByb21pc2U8Q29kZXhXaW5kb3dTZXJ2aWNlcz4ge1xuICBjb25zdCBzdGFydGVkID0gRGF0ZS5ub3coKTtcbiAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydGVkIDwgMzBfMDAwKSB7XG4gICAgY29uc3Qgc2VydmljZXMgPSBvcHRpb25zLmdldFdpbmRvd1NlcnZpY2VzKCk7XG4gICAgaWYgKFxuICAgICAgc2VydmljZXM/LndpbmRvd01hbmFnZXI/LnJlZ2lzdGVyV2luZG93ICYmXG4gICAgICAoc2VydmljZXMuZ2V0Q29udGV4dCB8fCBzZXJ2aWNlcy5nZXRDb250ZXh0Rm9yV2ViQ29udGVudHMpXG4gICAgKSB7XG4gICAgICByZXR1cm4gc2VydmljZXM7XG4gICAgfVxuICAgIGF3YWl0IGRlbGF5KDEwMCk7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKFwiVGltZWQgb3V0IHdhaXRpbmcgZm9yIENvZGV4IHdpbmRvdyBzZXJ2aWNlc1wiKTtcbn1cblxuZnVuY3Rpb24gY2FsbEhpZGRlbkJyaWRnZShtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIGFzc2VydEJyaWRnZU1ldGhvZChtZXRob2QpO1xuICByZXR1cm4gZW5zdXJlQnJvd3NlclVpSG9zdCgpLnRoZW4oKGhvc3QpID0+IHtcbiAgICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgYnJpZGdlUmVxdWVzdHMuZGVsZXRlKGlkKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgVGltZWQgb3V0IHdhaXRpbmcgZm9yIGJyb3dzZXIgVUkgYnJpZGdlIG1ldGhvZDogJHttZXRob2R9YCkpO1xuICAgICAgfSwgMTVfMDAwKTtcbiAgICAgIGJyaWRnZVJlcXVlc3RzLnNldChpZCwgeyByZXNvbHZlLCByZWplY3QsIHRpbWVyIH0pO1xuICAgICAgaG9zdC53ZWJDb250ZW50cy5zZW5kKEJSSURHRV9SRVFVRVNUX0NIQU5ORUwsIHsgaWQsIG1ldGhvZCwgYXJncyB9KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJyaWRnZU1lc3NhZ2VQb3J0VG9XZWJTb2NrZXQocG9ydDogRWxlY3Ryb24uTWVzc2FnZVBvcnRNYWluLCB3czogV2ViU29ja2V0Q29ubmVjdGlvbik6IHZvaWQge1xuICBsZXQgY2xvc2VkID0gZmFsc2U7XG4gIGNvbnN0IGNsb3NlID0gKCkgPT4ge1xuICAgIGlmIChjbG9zZWQpIHJldHVybjtcbiAgICBjbG9zZWQgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBwb3J0LnBvc3RNZXNzYWdlKG51bGwpO1xuICAgIH0gY2F0Y2gge31cbiAgICB0cnkge1xuICAgICAgcG9ydC5jbG9zZSgpO1xuICAgIH0gY2F0Y2gge31cbiAgICB3cy5jbG9zZSgpO1xuICB9O1xuICBwb3J0LnN0YXJ0KCk7XG4gIHBvcnQub24oXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGlmIChjbG9zZWQpIHJldHVybjtcbiAgICBpZiAoZXZlbnQuZGF0YSA9PSBudWxsKSB7XG4gICAgICBjbG9zZSgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGV2ZW50LmRhdGEgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHdzLnNlbmRUZXh0KGV2ZW50LmRhdGEpO1xuICAgIH1cbiAgfSk7XG4gIHBvcnQub24oXCJjbG9zZVwiLCBjbG9zZSk7XG4gIHdzLm9uVGV4dCgodGV4dCkgPT4ge1xuICAgIGlmIChjbG9zZWQpIHJldHVybjtcbiAgICBwb3J0LnBvc3RNZXNzYWdlKHRleHQpO1xuICB9KTtcbiAgd3Mub25DbG9zZShjbG9zZSk7XG59XG5cbmZ1bmN0aW9uIGJyb2FkY2FzdENvbnRyb2wocGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuICBmb3IgKGNvbnN0IGNsaWVudCBvZiBbLi4uY29udHJvbENsaWVudHNdKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNsaWVudC5zZW5kSnNvbihwYXlsb2FkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNsaWVudC5jbG9zZSgpO1xuICAgICAgY29udHJvbENsaWVudHMuZGVsZXRlKGNsaWVudCk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGJyb3dzZXJCcmlkZ2VTY3JpcHQoc3RhdGU6IEluaXRpYWxTdGF0ZSk6IHN0cmluZyB7XG4gIHJldHVybiBgXG4oKCkgPT4ge1xuICBjb25zdCBpbml0aWFsU3RhdGUgPSAke3NhZmVKc29uKHN0YXRlKX07XG4gIGNvbnN0IHNuYXBzaG90ID0gbmV3IE1hcChPYmplY3QuZW50cmllcyhpbml0aWFsU3RhdGUuc25hcHNob3QgfHwge30pKTtcbiAgY29uc3Qgd29ya2VyU3Vic2NyaWJlcnMgPSBuZXcgTWFwKCk7XG4gIGNvbnN0IHRoZW1lU3Vic2NyaWJlcnMgPSBuZXcgU2V0KCk7XG4gIGNvbnN0IGJyb3dzZXJTaWRlYmFyU25hcHNob3RzID0gbmV3IE1hcCgpO1xuICBjb25zdCBicm93c2VyU2lkZWJhclNlZWRlZExvY2FsU2VydmVycyA9IG5ldyBTZXQoKTtcbiAgbGV0IHN5c3RlbVRoZW1lVmFyaWFudCA9IGluaXRpYWxTdGF0ZS5zeXN0ZW1UaGVtZVZhcmlhbnQgfHwgXCJsaWdodFwiO1xuXG4gIHdpbmRvdy5fX2NvZGV4cHBCcm93c2VyVWkgPSB0cnVlO1xuICBpbnN0YWxsQnJvd3NlclVpV2Vidmlld1NoaW0oKTtcblxuICBjb25zdCBjb250cm9sID0gbmV3IFdlYlNvY2tldChuZXcgVVJMKFwiL2NvZGV4cHAvYnJvd3Nlci11aS9jb250cm9sXCIsIGxvY2F0aW9uLmhyZWYpKTtcbiAgY29udHJvbC5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICBsZXQgcGF5bG9hZDtcbiAgICB0cnkgeyBwYXlsb2FkID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTsgfSBjYXRjaCB7IHJldHVybjsgfVxuICAgIGlmIChwYXlsb2FkLnR5cGUgPT09IFwibWVzc2FnZS1mb3Itdmlld1wiKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gcGF5bG9hZC5tZXNzYWdlO1xuICAgICAgaWYgKG1lc3NhZ2UgJiYgbWVzc2FnZS50eXBlID09PSBcInNoYXJlZC1vYmplY3QtdXBkYXRlZFwiKSB7XG4gICAgICAgIGlmIChtZXNzYWdlLnZhbHVlID09PSB1bmRlZmluZWQpIHNuYXBzaG90LmRlbGV0ZShtZXNzYWdlLmtleSk7XG4gICAgICAgIGVsc2Ugc25hcHNob3Quc2V0KG1lc3NhZ2Uua2V5LCBtZXNzYWdlLnZhbHVlKTtcbiAgICAgIH1cbiAgICAgIHJlbWVtYmVyQnJvd3NlclNpZGViYXJIb3N0TWVzc2FnZShtZXNzYWdlKTtcbiAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBNZXNzYWdlRXZlbnQoXCJtZXNzYWdlXCIsIHsgZGF0YTogbWVzc2FnZSB9KSk7XG4gICAgfSBlbHNlIGlmIChwYXlsb2FkLnR5cGUgPT09IFwid29ya2VyLW1lc3NhZ2VcIikge1xuICAgICAgY29uc3Qgc3VicyA9IHdvcmtlclN1YnNjcmliZXJzLmdldChwYXlsb2FkLndvcmtlcklkKTtcbiAgICAgIGlmIChzdWJzKSBmb3IgKGNvbnN0IGZuIG9mIFsuLi5zdWJzXSkgZm4ocGF5bG9hZC5tZXNzYWdlKTtcbiAgICB9IGVsc2UgaWYgKHBheWxvYWQudHlwZSA9PT0gXCJzeXN0ZW0tdGhlbWUtdmFyaWFudC11cGRhdGVkXCIpIHtcbiAgICAgIHN5c3RlbVRoZW1lVmFyaWFudCA9IHBheWxvYWQudmFsdWU7XG4gICAgICBmb3IgKGNvbnN0IGZuIG9mIFsuLi50aGVtZVN1YnNjcmliZXJzXSkgZm4oKTtcbiAgICB9XG4gIH0pO1xuXG4gIGFzeW5jIGZ1bmN0aW9uIGJyaWRnZShtZXRob2QsIGFyZ3MgPSBbXSkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKFwiL2NvZGV4cHAvYnJvd3Nlci11aS9icmlkZ2VcIiwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWV0aG9kLCBhcmdzIH0pLFxuICAgIH0pO1xuICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZXMuanNvbigpO1xuICAgIGlmICghYm9keS5vaykgdGhyb3cgbmV3IEVycm9yKGJvZHkuZXJyb3IgfHwgXCJDb2RleCsrIGJyb3dzZXIgYnJpZGdlIGZhaWxlZFwiKTtcbiAgICByZXR1cm4gYm9keS52YWx1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxlZ2FjeUJyb3dzZXJUYWJJZChjb252ZXJzYXRpb25JZCkge1xuICAgIHJldHVybiBTdHJpbmcoY29udmVyc2F0aW9uSWQgfHwgXCJuZXctY29udmVyc2F0aW9uXCIpICsgXCI6bGVnYWN5XCI7XG4gIH1cblxuICBmdW5jdGlvbiBicm93c2VyU2lkZWJhcktleShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKSB7XG4gICAgcmV0dXJuIFN0cmluZyhjb252ZXJzYXRpb25JZCB8fCBcIm5ldy1jb252ZXJzYXRpb25cIikgKyBcIjo6XCIgKyBTdHJpbmcoYnJvd3NlclRhYklkIHx8IGxlZ2FjeUJyb3dzZXJUYWJJZChjb252ZXJzYXRpb25JZCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplQnJvd3NlclVybCh2YWx1ZSkge1xuICAgIGNvbnN0IHJhdyA9IFN0cmluZyh2YWx1ZSB8fCBcIlwiKS50cmltKCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBcIlwiO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gbmV3IFVSTChyYXcpLmhyZWY7XG4gICAgfSBjYXRjaCB7fVxuICAgIGlmICgvXlthLXpBLVpdW2EtekEtWjAtOSsuLV0qOi8udGVzdChyYXcpKSByZXR1cm4gcmF3O1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gbmV3IFVSTChcImh0dHBzOi8vXCIgKyByYXcpLmhyZWY7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gcmF3O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGJyb3dzZXJUaXRsZUZvclVybCh1cmwpIHtcbiAgICBpZiAoIXVybCkgcmV0dXJuIFwiTmV3IHRhYlwiO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBob3N0ID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXFxcLi8sIFwiXCIpO1xuICAgICAgcmV0dXJuIGhvc3QgfHwgdXJsO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVybDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBtYWtlQnJvd3NlclNpZGViYXJTbmFwc2hvdCh1cmwsIHBhdGNoID0ge30pIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplQnJvd3NlclVybCh1cmwpO1xuICAgIHJldHVybiB7XG4gICAgICB0YWJUeXBlOiBub3JtYWxpemVkID8gXCJ3ZWJcIiA6IFwibmV3LXRhYi1wYWdlXCIsXG4gICAgICBpc1N1c3BlbmRlZDogZmFsc2UsXG4gICAgICB0aXRsZTogbm9ybWFsaXplZCA/IGJyb3dzZXJUaXRsZUZvclVybChub3JtYWxpemVkKSA6IFwiTmV3IHRhYlwiLFxuICAgICAgdXJsOiBub3JtYWxpemVkLFxuICAgICAgZmF2aWNvblVybDogbnVsbCxcbiAgICAgIGlzTG9hZGluZzogZmFsc2UsXG4gICAgICBjYW5Hb0JhY2s6IGZhbHNlLFxuICAgICAgY2FuR29Gb3J3YXJkOiBmYWxzZSxcbiAgICAgIHpvb21QZXJjZW50OiAxMDAsXG4gICAgICBjb21tZW50TW9kZURpc2FibGVkUmVhc29uOiBudWxsLFxuICAgICAgaW50ZXJhY3Rpb25Nb2RlOiBcImJyb3dzZVwiLFxuICAgICAgYW5ub3RhdGlvbkVkaXRvck1vZGU6IFwiY29tbWVudFwiLFxuICAgICAgaXNBbm5vdGF0aW9uQWRkTW9kaWZpZXJQcmVzc2VkOiBmYWxzZSxcbiAgICAgIGlzT3JpZ2luYWxWaWV3RW5hYmxlZDogZmFsc2UsXG4gICAgICBpc1R3ZWFrc0VkaXRvck9wZW46IGZhbHNlLFxuICAgICAgY29tbWVudHM6IFtdLFxuICAgICAgLi4ucGF0Y2gsXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BhdGNoQnJvd3NlclNpZGViYXJNZXNzYWdlKG1lc3NhZ2UpIHtcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgTWVzc2FnZUV2ZW50KFwibWVzc2FnZVwiLCB7IGRhdGE6IG1lc3NhZ2UgfSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2VlZEJyb3dzZXJTaWRlYmFyTG9jYWxTZXJ2ZXJzKGNvbnZlcnNhdGlvbklkKSB7XG4gICAgaWYgKCFjb252ZXJzYXRpb25JZCB8fCBicm93c2VyU2lkZWJhclNlZWRlZExvY2FsU2VydmVycy5oYXMoY29udmVyc2F0aW9uSWQpKSByZXR1cm47XG4gICAgYnJvd3NlclNpZGViYXJTZWVkZWRMb2NhbFNlcnZlcnMuYWRkKGNvbnZlcnNhdGlvbklkKTtcbiAgICBxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG4gICAgICBkaXNwYXRjaEJyb3dzZXJTaWRlYmFyTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwiYnJvd3Nlci1zaWRlYmFyLWxvY2FsLXNlcnZlcnNcIixcbiAgICAgICAgY29udmVyc2F0aW9uSWQsXG4gICAgICAgIHN0YXRlOiB7IGlzTG9hZGluZzogZmFsc2UsIHNlcnZlcnM6IFtdLCBoaWRkZW5TZXJ2ZXJzOiBbXSB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1lbWJlckJyb3dzZXJTaWRlYmFySG9zdE1lc3NhZ2UobWVzc2FnZSkge1xuICAgIGlmICghbWVzc2FnZSB8fCB0eXBlb2YgbWVzc2FnZSAhPT0gXCJvYmplY3RcIikgcmV0dXJuO1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiYnJvd3Nlci1zaWRlYmFyLXN0YXRlXCIpIHtcbiAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbklkID0gbWVzc2FnZS5jb252ZXJzYXRpb25JZDtcbiAgICAgIGlmICghY29udmVyc2F0aW9uSWQgfHwgIW1lc3NhZ2Uuc25hcHNob3QpIHJldHVybjtcbiAgICAgIGJyb3dzZXJTaWRlYmFyU25hcHNob3RzLnNldChicm93c2VyU2lkZWJhcktleShjb252ZXJzYXRpb25JZCwgbWVzc2FnZS5icm93c2VyVGFiSWQpLCBtZXNzYWdlLnNuYXBzaG90KTtcbiAgICB9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJicm93c2VyLXNpZGViYXItbG9jYWwtc2VydmVyc1wiKSB7XG4gICAgICBpZiAobWVzc2FnZS5jb252ZXJzYXRpb25JZCkgYnJvd3NlclNpZGViYXJTZWVkZWRMb2NhbFNlcnZlcnMuYWRkKG1lc3NhZ2UuY29udmVyc2F0aW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNlbmRCcm93c2VyU2lkZWJhclNuYXBzaG90KGNvbnZlcnNhdGlvbklkLCBicm93c2VyVGFiSWQsIHNuYXBzaG90UGF0Y2gpIHtcbiAgICBpZiAoIWNvbnZlcnNhdGlvbklkKSByZXR1cm47XG4gICAgY29uc3Qga2V5ID0gYnJvd3NlclNpZGViYXJLZXkoY29udmVyc2F0aW9uSWQsIGJyb3dzZXJUYWJJZCk7XG4gICAgY29uc3QgcHJldmlvdXMgPSBicm93c2VyU2lkZWJhclNuYXBzaG90cy5nZXQoa2V5KSB8fCBtYWtlQnJvd3NlclNpZGViYXJTbmFwc2hvdChcIlwiKTtcbiAgICBjb25zdCBuZXh0ID0geyAuLi5wcmV2aW91cywgLi4uc25hcHNob3RQYXRjaCB9O1xuICAgIGJyb3dzZXJTaWRlYmFyU25hcHNob3RzLnNldChrZXksIG5leHQpO1xuICAgIGRpc3BhdGNoQnJvd3NlclNpZGViYXJNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwiYnJvd3Nlci1zaWRlYmFyLXN0YXRlXCIsXG4gICAgICBjb252ZXJzYXRpb25JZCxcbiAgICAgIC4uLihicm93c2VyVGFiSWQgPyB7IGJyb3dzZXJUYWJJZCB9IDoge30pLFxuICAgICAgc25hcHNob3Q6IG5leHQsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRCcm93c2VyU2lkZWJhclVybChjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkLCB1cmwsIGlzTG9hZGluZyA9IGZhbHNlKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUJyb3dzZXJVcmwodXJsKTtcbiAgICBzZW5kQnJvd3NlclNpZGViYXJTbmFwc2hvdChjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkLCBtYWtlQnJvd3NlclNpZGViYXJTbmFwc2hvdChub3JtYWxpemVkLCB7IGlzTG9hZGluZyB9KSk7XG4gIH1cblxuICBmdW5jdGlvbiBmaW5kQnJvd3NlclNpZGViYXJGcmFtZShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKSB7XG4gICAgY29uc3Qgc2VsZWN0b3IgPSBcIltkYXRhLWJyb3dzZXItc2lkZWJhci1jb252ZXJzYXRpb24taWQ9J1wiICsgY3NzRXNjYXBlKGNvbnZlcnNhdGlvbklkKSArIFwiJ11bZGF0YS1icm93c2VyLXNpZGViYXItYnJvd3Nlci10YWItaWQ9J1wiICsgY3NzRXNjYXBlKGJyb3dzZXJUYWJJZCB8fCBsZWdhY3lCcm93c2VyVGFiSWQoY29udmVyc2F0aW9uSWQpKSArIFwiJ11cIjtcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gIH1cblxuICBmdW5jdGlvbiBjc3NFc2NhcGUodmFsdWUpIHtcbiAgICBpZiAod2luZG93LkNTUyAmJiB0eXBlb2Ygd2luZG93LkNTUy5lc2NhcGUgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHdpbmRvdy5DU1MuZXNjYXBlKFN0cmluZyh2YWx1ZSkpO1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUpLnJlcGxhY2UoL1snXFxcXFxcXFxdL2csIFwiXFxcXFxcXFwkJlwiKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUJyb3dzZXJTaWRlYmFyVmlld01lc3NhZ2UobWVzc2FnZSkge1xuICAgIGlmICghbWVzc2FnZSB8fCB0eXBlb2YgbWVzc2FnZSAhPT0gXCJvYmplY3RcIikgcmV0dXJuO1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiYnJvd3Nlci1zaWRlYmFyLXN5bmNcIikge1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCB8fCB7fTtcbiAgICAgIHNlZWRCcm93c2VyU2lkZWJhckxvY2FsU2VydmVycyhwYXlsb2FkLmNvbnZlcnNhdGlvbklkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJicm93c2VyLXNpZGViYXItb3duZXItc3luY1wiKSB7XG4gICAgICBzZWVkQnJvd3NlclNpZGViYXJMb2NhbFNlcnZlcnMobWVzc2FnZS5jb252ZXJzYXRpb25JZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChtZXNzYWdlLnR5cGUgIT09IFwiYnJvd3Nlci1zaWRlYmFyLWNvbW1hbmRcIikgcmV0dXJuO1xuXG4gICAgY29uc3QgY29udmVyc2F0aW9uSWQgPSBtZXNzYWdlLmNvbnZlcnNhdGlvbklkO1xuICAgIGNvbnN0IGJyb3dzZXJUYWJJZCA9IG1lc3NhZ2UuYnJvd3NlclRhYklkO1xuICAgIGNvbnN0IGNvbW1hbmQgPSBtZXNzYWdlLmNvbW1hbmQgfHwge307XG4gICAgc2VlZEJyb3dzZXJTaWRlYmFyTG9jYWxTZXJ2ZXJzKGNvbnZlcnNhdGlvbklkKTtcblxuICAgIGlmIChjb21tYW5kLnR5cGUgPT09IFwibmF2aWdhdGVcIikge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUJyb3dzZXJVcmwoY29tbWFuZC51cmwpO1xuICAgICAgc2V0QnJvd3NlclNpZGViYXJVcmwoY29udmVyc2F0aW9uSWQsIGJyb3dzZXJUYWJJZCwgbm9ybWFsaXplZCwgdHJ1ZSk7XG4gICAgICBxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG4gICAgICAgIGNvbnN0IGZyYW1lID0gZmluZEJyb3dzZXJTaWRlYmFyRnJhbWUoY29udmVyc2F0aW9uSWQsIGJyb3dzZXJUYWJJZCk7XG4gICAgICAgIGlmICghZnJhbWUgfHwgIW5vcm1hbGl6ZWQgfHwgZnJhbWUuZ2V0VVJMPy4oKSA9PT0gbm9ybWFsaXplZCkgcmV0dXJuO1xuICAgICAgICBmcmFtZS5sb2FkVVJMPy4obm9ybWFsaXplZCk7XG4gICAgICB9KTtcbiAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHNldEJyb3dzZXJTaWRlYmFyVXJsKGNvbnZlcnNhdGlvbklkLCBicm93c2VyVGFiSWQsIG5vcm1hbGl6ZWQsIGZhbHNlKSwgNTAwKTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gXCJyZWxvYWRcIikge1xuICAgICAgY29uc3QgZnJhbWUgPSBmaW5kQnJvd3NlclNpZGViYXJGcmFtZShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKTtcbiAgICAgIGZyYW1lPy5yZWxvYWQ/LigpO1xuICAgICAgY29uc3QgY3VycmVudCA9IGJyb3dzZXJTaWRlYmFyU25hcHNob3RzLmdldChicm93c2VyU2lkZWJhcktleShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKSk7XG4gICAgICBpZiAoY3VycmVudD8udXJsKSB7XG4gICAgICAgIHNlbmRCcm93c2VyU2lkZWJhclNuYXBzaG90KGNvbnZlcnNhdGlvbklkLCBicm93c2VyVGFiSWQsIHsgLi4uY3VycmVudCwgaXNMb2FkaW5nOiB0cnVlIH0pO1xuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBzZW5kQnJvd3NlclNpZGViYXJTbmFwc2hvdChjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkLCB7IC4uLmN1cnJlbnQsIGlzTG9hZGluZzogZmFsc2UgfSksIDI1MCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09IFwiZ28tYmFja1wiKSB7XG4gICAgICBmaW5kQnJvd3NlclNpZGViYXJGcmFtZShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKT8uZ29CYWNrPy4oKTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gXCJnby1mb3J3YXJkXCIpIHtcbiAgICAgIGZpbmRCcm93c2VyU2lkZWJhckZyYW1lKGNvbnZlcnNhdGlvbklkLCBicm93c2VyVGFiSWQpPy5nb0ZvcndhcmQ/LigpO1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSBcInN0b3BcIikge1xuICAgICAgY29uc3QgY3VycmVudCA9IGJyb3dzZXJTaWRlYmFyU25hcHNob3RzLmdldChicm93c2VyU2lkZWJhcktleShjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkKSk7XG4gICAgICBpZiAoY3VycmVudCkgc2VuZEJyb3dzZXJTaWRlYmFyU25hcHNob3QoY29udmVyc2F0aW9uSWQsIGJyb3dzZXJUYWJJZCwgeyAuLi5jdXJyZW50LCBpc0xvYWRpbmc6IGZhbHNlIH0pO1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSBcInJlc2V0XCIgfHwgY29tbWFuZC50eXBlID09PSBcImNsb3NlLXRhYlwiKSB7XG4gICAgICBzZW5kQnJvd3NlclNpZGViYXJTbmFwc2hvdChjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkLCBtYWtlQnJvd3NlclNpZGViYXJTbmFwc2hvdChcIlwiKSk7XG4gICAgfVxuICB9XG5cbiAgd2luZG93LmNvZGV4V2luZG93VHlwZSA9IFwiZWxlY3Ryb25cIjtcbiAgd2luZG93LmVsZWN0cm9uQnJpZGdlID0ge1xuICAgIHdpbmRvd1R5cGU6IFwiZWxlY3Ryb25cIixcbiAgICBzZW5kTWVzc2FnZUZyb21WaWV3OiAobWVzc2FnZSkgPT4ge1xuICAgICAgaWYgKG1lc3NhZ2UgJiYgbWVzc2FnZS50eXBlID09PSBcInNoYXJlZC1vYmplY3Qtc2V0XCIpIHNuYXBzaG90LnNldChtZXNzYWdlLmtleSwgbWVzc2FnZS52YWx1ZSk7XG4gICAgICBoYW5kbGVCcm93c2VyU2lkZWJhclZpZXdNZXNzYWdlKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIGJyaWRnZShcInNlbmRNZXNzYWdlRnJvbVZpZXdcIiwgW21lc3NhZ2VdKTtcbiAgICB9LFxuICAgIGdldFBhdGhGb3JGaWxlOiAoKSA9PiBudWxsLFxuICAgIHNlbmRXb3JrZXJNZXNzYWdlRnJvbVZpZXc6ICh3b3JrZXJJZCwgbWVzc2FnZSkgPT4gYnJpZGdlKFwic2VuZFdvcmtlck1lc3NhZ2VGcm9tVmlld1wiLCBbd29ya2VySWQsIG1lc3NhZ2VdKSxcbiAgICBzdWJzY3JpYmVUb1dvcmtlck1lc3NhZ2VzOiAod29ya2VySWQsIGhhbmRsZXIpID0+IHtcbiAgICAgIGxldCBzdWJzID0gd29ya2VyU3Vic2NyaWJlcnMuZ2V0KHdvcmtlcklkKTtcbiAgICAgIGlmICghc3Vicykge1xuICAgICAgICBzdWJzID0gbmV3IFNldCgpO1xuICAgICAgICB3b3JrZXJTdWJzY3JpYmVycy5zZXQod29ya2VySWQsIHN1YnMpO1xuICAgICAgICBicmlkZ2UoXCJzdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiLCBbd29ya2VySWRdKS5jYXRjaChjb25zb2xlLmVycm9yKTtcbiAgICAgIH1cbiAgICAgIHN1YnMuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgY29uc3QgY3VycmVudCA9IHdvcmtlclN1YnNjcmliZXJzLmdldCh3b3JrZXJJZCk7XG4gICAgICAgIGlmICghY3VycmVudCkgcmV0dXJuO1xuICAgICAgICBjdXJyZW50LmRlbGV0ZShoYW5kbGVyKTtcbiAgICAgICAgaWYgKGN1cnJlbnQuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgIHdvcmtlclN1YnNjcmliZXJzLmRlbGV0ZSh3b3JrZXJJZCk7XG4gICAgICAgICAgYnJpZGdlKFwidW5zdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiLCBbd29ya2VySWRdKS5jYXRjaChjb25zb2xlLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9LFxuICAgIHNob3dDb250ZXh0TWVudTogKGl0ZW1zKSA9PiBicmlkZ2UoXCJzaG93Q29udGV4dE1lbnVcIiwgW2l0ZW1zXSksXG4gICAgc2hvd0FwcGxpY2F0aW9uTWVudTogKG1lbnVJZCwgeCwgeSkgPT4gYnJpZGdlKFwic2hvd0FwcGxpY2F0aW9uTWVudVwiLCBbbWVudUlkLCB4LCB5XSksXG4gICAgZ2V0RmFzdE1vZGVSb2xsb3V0TWV0cmljczogKHBhcmFtcykgPT4gYnJpZGdlKFwiZ2V0RmFzdE1vZGVSb2xsb3V0TWV0cmljc1wiLCBbcGFyYW1zXSksXG4gICAgZ2V0U2hhcmVkT2JqZWN0U25hcHNob3RWYWx1ZTogKGtleSkgPT4gc25hcHNob3QuZ2V0KGtleSksXG4gICAgZ2V0U3lzdGVtVGhlbWVWYXJpYW50OiAoKSA9PiBzeXN0ZW1UaGVtZVZhcmlhbnQsXG4gICAgc3Vic2NyaWJlVG9TeXN0ZW1UaGVtZVZhcmlhbnQ6IChoYW5kbGVyKSA9PiB7XG4gICAgICB0aGVtZVN1YnNjcmliZXJzLmFkZChoYW5kbGVyKTtcbiAgICAgIHJldHVybiAoKSA9PiB0aGVtZVN1YnNjcmliZXJzLmRlbGV0ZShoYW5kbGVyKTtcbiAgICB9LFxuICAgIHRyaWdnZXJTZW50cnlUZXN0RXJyb3I6ICgpID0+IGJyaWRnZShcInRyaWdnZXJTZW50cnlUZXN0RXJyb3JcIiwgW10pLFxuICAgIGdldFNlbnRyeUluaXRPcHRpb25zOiAoKSA9PiBudWxsLFxuICAgIGdldEFwcFNlc3Npb25JZDogKCkgPT4gbnVsbCxcbiAgICBnZXRCdWlsZEZsYXZvcjogKCkgPT4gaW5pdGlhbFN0YXRlLmJ1aWxkRmxhdm9yLFxuICAgIGlzSW50ZWxNYWNCdWlsZDogKCkgPT4gaW5pdGlhbFN0YXRlLnBsYXRmb3JtID09PSBcImRhcndpblwiICYmIGluaXRpYWxTdGF0ZS5hcmNoID09PSBcIng2NFwiLFxuICAgIHVzZXNPd2xBcHBTaGVsbDogKCkgPT4gaW5pdGlhbFN0YXRlLnVzZXNPd2xBcHBTaGVsbCxcbiAgfTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93IHx8ICFldmVudC5kYXRhIHx8IGV2ZW50LmRhdGEudHlwZSAhPT0gXCJjb25uZWN0LWFwcC1ob3N0XCIpIHJldHVybjtcbiAgICBjb25zdCBwb3J0ID0gZXZlbnQuZGF0YS5wb3J0O1xuICAgIGlmICghcG9ydCkgcmV0dXJuO1xuICAgIGNvbnN0IHdzID0gbmV3IFdlYlNvY2tldChuZXcgVVJMKFwiL2NvZGV4cHAvYnJvd3Nlci11aS9ycGNcIiwgbG9jYXRpb24uaHJlZikpO1xuICAgIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChtZXNzYWdlKSA9PiBwb3J0LnBvc3RNZXNzYWdlKG1lc3NhZ2UuZGF0YSkpO1xuICAgIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiB7XG4gICAgICB0cnkgeyBwb3J0LnBvc3RNZXNzYWdlKG51bGwpOyB9IGNhdGNoIHt9XG4gICAgICB0cnkgeyBwb3J0LmNsb3NlKCk7IH0gY2F0Y2gge31cbiAgICB9KTtcbiAgICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgICBwb3J0Lm9ubWVzc2FnZSA9IChtZXNzYWdlKSA9PiB7XG4gICAgICAgIGlmIChtZXNzYWdlLmRhdGEgPT0gbnVsbCkge1xuICAgICAgICAgIHdzLmNsb3NlKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHdzLnNlbmQobWVzc2FnZS5kYXRhKTtcbiAgICAgIH07XG4gICAgICBwb3J0LnN0YXJ0ICYmIHBvcnQuc3RhcnQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gaW5zdGFsbEJyb3dzZXJVaVdlYnZpZXdTaGltKCkge1xuICAgIGlmICh3aW5kb3cuX19jb2RleHBwV2Vidmlld1NoaW1JbnN0YWxsZWQpIHJldHVybjtcbiAgICB3aW5kb3cuX19jb2RleHBwV2Vidmlld1NoaW1JbnN0YWxsZWQgPSB0cnVlO1xuICAgIGNvbnN0IG9yaWdpbmFsQ3JlYXRlRWxlbWVudCA9IERvY3VtZW50LnByb3RvdHlwZS5jcmVhdGVFbGVtZW50O1xuICAgIERvY3VtZW50LnByb3RvdHlwZS5jcmVhdGVFbGVtZW50ID0gZnVuY3Rpb24odGFnTmFtZSwgb3B0aW9ucykge1xuICAgICAgaWYgKFN0cmluZyh0YWdOYW1lKS50b0xvd2VyQ2FzZSgpICE9PSBcIndlYnZpZXdcIikge1xuICAgICAgICByZXR1cm4gb3JpZ2luYWxDcmVhdGVFbGVtZW50LmNhbGwodGhpcywgdGFnTmFtZSwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gY3JlYXRlV2Vidmlld0lmcmFtZSh0aGlzKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gY3JlYXRlV2Vidmlld0lmcmFtZShkb2MpIHtcbiAgICAgIGNvbnN0IGlmcmFtZSA9IG9yaWdpbmFsQ3JlYXRlRWxlbWVudC5jYWxsKGRvYywgXCJpZnJhbWVcIik7XG4gICAgICBpZnJhbWUuZGF0YXNldC5jb2RleHBwV2Vidmlld1NoaW0gPSBcInRydWVcIjtcbiAgICAgIGlmcmFtZS5zdHlsZS5ib3JkZXIgPSBcIjBcIjtcbiAgICAgIGlmcmFtZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgaWZyYW1lLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwiI2ZmZlwiO1xuICAgICAgaWZyYW1lLnNldEF0dHJpYnV0ZShcImFsbG93XCIsIFwiYXV0b3BsYXk7IGNsaXBib2FyZC1yZWFkOyBjbGlwYm9hcmQtd3JpdGU7IGRpc3BsYXktY2FwdHVyZTsgZnVsbHNjcmVlbjsgbWljcm9waG9uZTsgY2FtZXJhXCIpO1xuICAgICAgY29uc3QgbmF0aXZlU2V0QXR0cmlidXRlID0gaWZyYW1lLnNldEF0dHJpYnV0ZS5iaW5kKGlmcmFtZSk7XG4gICAgICBjb25zdCBuYXRpdmVHZXRBdHRyaWJ1dGUgPSBpZnJhbWUuZ2V0QXR0cmlidXRlLmJpbmQoaWZyYW1lKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGlmcmFtZSwgXCJ0YWdOYW1lXCIsIHsgY29uZmlndXJhYmxlOiB0cnVlLCBnZXQ6ICgpID0+IFwiV0VCVklFV1wiIH0pO1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaWZyYW1lLCBcIm5vZGVOYW1lXCIsIHsgY29uZmlndXJhYmxlOiB0cnVlLCBnZXQ6ICgpID0+IFwiV0VCVklFV1wiIH0pO1xuICAgICAgfSBjYXRjaCB7fVxuXG4gICAgICBjb25zdCBlbWl0ID0gKHR5cGUsIGV4dHJhID0ge30pID0+IHtcbiAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgRXZlbnQodHlwZSk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZXZlbnQsIGV4dHJhKTtcbiAgICAgICAgaWZyYW1lLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IGN1cnJlbnRVcmwgPSAoKSA9PiBpZnJhbWUuZGF0YXNldC5jb2RleHBwUmVxdWVzdGVkU3JjIHx8IG5hdGl2ZUdldEF0dHJpYnV0ZShcInNyY1wiKSB8fCBcImFib3V0OmJsYW5rXCI7XG4gICAgICBjb25zdCBhY3R1YWxGcmFtZVVybCA9ICh1cmwpID0+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkID0gU3RyaW5nKHVybCB8fCBcImFib3V0OmJsYW5rXCIpO1xuICAgICAgICBpZiAoIXNob3VsZEJyZWFrUmVjdXJzaXZlRnJhbWVMb2FkKHJlcXVlc3RlZCkpIHJldHVybiByZXF1ZXN0ZWQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgbmV4dCA9IG5ldyBVUkwocmVxdWVzdGVkLCBsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgICBuZXh0LnNlYXJjaFBhcmFtcy5zZXQoXCJfX2NvZGV4cHBfZnJhbWVfZGVwdGhcIiwgU3RyaW5nKGZyYW1lQW5jZXN0b3JEZXB0aCgpICsgMSkpO1xuICAgICAgICAgIHJldHVybiBuZXh0LmhyZWY7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjb25zdCBzZXRGcmFtZVVybCA9ICh1cmwpID0+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkID0gU3RyaW5nKHVybCB8fCBcImFib3V0OmJsYW5rXCIpO1xuICAgICAgICBpZnJhbWUuZGF0YXNldC5jb2RleHBwUmVxdWVzdGVkU3JjID0gcmVxdWVzdGVkO1xuICAgICAgICBuYXRpdmVTZXRBdHRyaWJ1dGUoXCJzcmNcIiwgYWN0dWFsRnJhbWVVcmwocmVxdWVzdGVkKSk7XG4gICAgICB9O1xuICAgICAgY29uc3QgbmF2aWdhdGUgPSAodXJsKSA9PiB7XG4gICAgICAgIGNvbnN0IG5leHQgPSBTdHJpbmcodXJsIHx8IFwiYWJvdXQ6YmxhbmtcIik7XG4gICAgICAgIGVtaXQoXCJkaWQtc3RhcnQtbG9hZGluZ1wiLCB7IHVybDogbmV4dCB9KTtcbiAgICAgICAgc2V0RnJhbWVVcmwobmV4dCk7XG4gICAgICB9O1xuXG4gICAgICBpZnJhbWUuc2V0QXR0cmlidXRlID0gKG5hbWUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGlmIChTdHJpbmcobmFtZSkudG9Mb3dlckNhc2UoKSA9PT0gXCJzcmNcIikge1xuICAgICAgICAgIHNldEZyYW1lVXJsKHZhbHVlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbmF0aXZlU2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcbiAgICAgIH07XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShpZnJhbWUsIFwic3JjXCIsIHtcbiAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgICAgZ2V0OiAoKSA9PiBjdXJyZW50VXJsKCksXG4gICAgICAgICAgc2V0OiAodmFsdWUpID0+IHNldEZyYW1lVXJsKHZhbHVlKSxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIHt9XG5cbiAgICAgIGlmcmFtZS5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHVybCA9IGN1cnJlbnRVcmwoKTtcbiAgICAgICAgZW1pdChcImRvbS1yZWFkeVwiLCB7IHVybCB9KTtcbiAgICAgICAgZW1pdChcImRpZC1uYXZpZ2F0ZVwiLCB7IHVybCB9KTtcbiAgICAgICAgZW1pdChcImRpZC1zdG9wLWxvYWRpbmdcIiwgeyB1cmwgfSk7XG4gICAgICAgIGVtaXQoXCJkaWQtZmluaXNoLWxvYWRcIiwgeyB1cmwgfSk7XG4gICAgICAgIGxldCB0aXRsZSA9IFwiXCI7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdGl0bGUgPSBpZnJhbWUuY29udGVudERvY3VtZW50Py50aXRsZSB8fCBcIlwiO1xuICAgICAgICB9IGNhdGNoIHt9XG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbklkID0gaWZyYW1lLmdldEF0dHJpYnV0ZShcImRhdGEtYnJvd3Nlci1zaWRlYmFyLWNvbnZlcnNhdGlvbi1pZFwiKTtcbiAgICAgICAgY29uc3QgYnJvd3NlclRhYklkID0gaWZyYW1lLmdldEF0dHJpYnV0ZShcImRhdGEtYnJvd3Nlci1zaWRlYmFyLWJyb3dzZXItdGFiLWlkXCIpO1xuICAgICAgICBpZiAoY29udmVyc2F0aW9uSWQpIHtcbiAgICAgICAgICBzZW5kQnJvd3NlclNpZGViYXJTbmFwc2hvdChjb252ZXJzYXRpb25JZCwgYnJvd3NlclRhYklkLCBtYWtlQnJvd3NlclNpZGViYXJTbmFwc2hvdCh1cmwsIHtcbiAgICAgICAgICAgIHRpdGxlOiB0aXRsZSB8fCBicm93c2VyVGl0bGVGb3JVcmwodXJsKSxcbiAgICAgICAgICAgIGlzTG9hZGluZzogZmFsc2UsXG4gICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aXRsZSkgZW1pdChcInBhZ2UtdGl0bGUtdXBkYXRlZFwiLCB7IHRpdGxlIH0pO1xuICAgICAgfSk7XG4gICAgICBpZnJhbWUuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcbiAgICAgICAgZW1pdChcImRpZC1mYWlsLWxvYWRcIiwgeyBlcnJvckNvZGU6IC0yLCBlcnJvckRlc2NyaXB0aW9uOiBcImlmcmFtZSBsb2FkIGZhaWxlZFwiLCB2YWxpZGF0ZWRVUkw6IGN1cnJlbnRVcmwoKSB9KTtcbiAgICAgICAgZW1pdChcImRpZC1zdG9wLWxvYWRpbmdcIiwgeyB1cmw6IGN1cnJlbnRVcmwoKSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhpZnJhbWUsIHtcbiAgICAgICAgZGVzdHJveTogeyB2YWx1ZTogKCkgPT4gaWZyYW1lLnJlbW92ZSgpIH0sXG4gICAgICAgIGdldFVSTDogeyB2YWx1ZTogKCkgPT4gY3VycmVudFVybCgpIH0sXG4gICAgICAgIGdldFRpdGxlOiB7XG4gICAgICAgICAgdmFsdWU6ICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJldHVybiBpZnJhbWUuY29udGVudERvY3VtZW50Py50aXRsZSB8fCBcIlwiO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGxvYWRVUkw6IHsgdmFsdWU6ICh1cmwpID0+IHsgbmF2aWdhdGUodXJsKTsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9IH0sXG4gICAgICAgIHJlbG9hZDoge1xuICAgICAgICAgIHZhbHVlOiAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBpZnJhbWUuY29udGVudFdpbmRvdz8ubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgbmF2aWdhdGUoY3VycmVudFVybCgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBzdG9wOiB7IHZhbHVlOiAoKSA9PiB7fSB9LFxuICAgICAgICBjYW5Hb0JhY2s6IHsgdmFsdWU6ICgpID0+IGZhbHNlIH0sXG4gICAgICAgIGNhbkdvRm9yd2FyZDogeyB2YWx1ZTogKCkgPT4gZmFsc2UgfSxcbiAgICAgICAgZ29CYWNrOiB7XG4gICAgICAgICAgdmFsdWU6ICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGlmcmFtZS5jb250ZW50V2luZG93Py5oaXN0b3J5LmJhY2soKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge31cbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBnb0ZvcndhcmQ6IHtcbiAgICAgICAgICB2YWx1ZTogKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgaWZyYW1lLmNvbnRlbnRXaW5kb3c/Lmhpc3RvcnkuZm9yd2FyZCgpO1xuICAgICAgICAgICAgfSBjYXRjaCB7fVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGV4ZWN1dGVKYXZhU2NyaXB0OiB7XG4gICAgICAgICAgdmFsdWU6IChjb2RlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGlmcmFtZS5jb250ZW50V2luZG93Py5ldmFsKFN0cmluZyhjb2RlKSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBpbnNlcnRDU1M6IHsgdmFsdWU6ICgpID0+IFByb21pc2UucmVzb2x2ZShcIlwiKSB9LFxuICAgICAgICBvcGVuRGV2VG9vbHM6IHsgdmFsdWU6ICgpID0+IHt9IH0sXG4gICAgICAgIGNsb3NlRGV2VG9vbHM6IHsgdmFsdWU6ICgpID0+IHt9IH0sXG4gICAgICAgIGlzRGV2VG9vbHNPcGVuZWQ6IHsgdmFsdWU6ICgpID0+IGZhbHNlIH0sXG4gICAgICAgIHNlbmQ6IHsgdmFsdWU6ICgpID0+IHt9IH0sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGlmcmFtZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmcmFtZUFuY2VzdG9yRGVwdGgoKSB7XG4gICAgICBsZXQgZGVwdGggPSAwO1xuICAgICAgbGV0IGN1cnJlbnQgPSB3aW5kb3c7XG4gICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgIXNlZW4uaGFzKGN1cnJlbnQpKSB7XG4gICAgICAgIHNlZW4uYWRkKGN1cnJlbnQpO1xuICAgICAgICBsZXQgcGFyZW50O1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHBhcmVudCA9IGN1cnJlbnQucGFyZW50O1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFyZW50ID09PSBjdXJyZW50KSBicmVhaztcbiAgICAgICAgZGVwdGggKz0gMTtcbiAgICAgICAgY3VycmVudCA9IHBhcmVudDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBkZXB0aDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG91bGRCcmVha1JlY3Vyc2l2ZUZyYW1lTG9hZCh1cmwpIHtcbiAgICAgIGxldCB0YXJnZXQ7XG4gICAgICB0cnkge1xuICAgICAgICB0YXJnZXQgPSBuZXcgVVJMKHVybCwgbG9jYXRpb24uaHJlZikuaHJlZjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBsZXQgY3VycmVudCA9IHdpbmRvdztcbiAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7XG4gICAgICB3aGlsZSAoY3VycmVudCAmJiAhc2Vlbi5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgc2Vlbi5hZGQoY3VycmVudCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaWYgKG5ldyBVUkwoY3VycmVudC5sb2NhdGlvbi5ocmVmKS5ocmVmID09PSB0YXJnZXQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIGlmIChjdXJyZW50LnBhcmVudCA9PT0gY3VycmVudCkgYnJlYWs7XG4gICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50O1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbn0pKCk7XG5gO1xufVxuXG5mdW5jdGlvbiBoaWRlVmlzaWJsZUNvZGV4V2luZG93cygpOiB2b2lkIHtcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09IFwiZGFyd2luXCIpIHtcbiAgICB0cnkge1xuICAgICAgYXBwLmhpZGUoKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbiAgZm9yIChjb25zdCB3aW4gb2YgQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICBpZiAod2luLmlzRGVzdHJveWVkKCkpIGNvbnRpbnVlO1xuICAgIGlmIChhY3RpdmVIb3N0ICYmIHdpbi53ZWJDb250ZW50cy5pZCA9PT0gYWN0aXZlSG9zdC53ZWJDb250ZW50cy5pZCkgY29udGludWU7XG4gICAgaWYgKCF3aW4uaXNWaXNpYmxlKCkpIGNvbnRpbnVlO1xuICAgIHRyeSB7XG4gICAgICB3aW4uaGlkZSgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufVxuXG5mdW5jdGlvbiBtYWtlV2luZG93TGlrZUZvclZpZXcodmlldzogRWxlY3Ryb24uQnJvd3NlclZpZXcpOiBDb2RleFdpbmRvd0xpa2Uge1xuICBjb25zdCB2aWV3Qm91bmRzID0gKCkgPT4gdmlldy5nZXRCb3VuZHMoKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmlldy53ZWJDb250ZW50cy5pZCxcbiAgICB3ZWJDb250ZW50czogdmlldy53ZWJDb250ZW50cyxcbiAgICBvbjogKGV2ZW50OiBcImNsb3NlZFwiLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCkgPT4ge1xuICAgICAgaWYgKGV2ZW50ID09PSBcImNsb3NlZFwiKSB2aWV3LndlYkNvbnRlbnRzLm9uY2UoXCJkZXN0cm95ZWRcIiwgbGlzdGVuZXIpO1xuICAgICAgZWxzZSB2aWV3LndlYkNvbnRlbnRzLm9uKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgICByZXR1cm4gdmlldztcbiAgICB9LFxuICAgIG9uY2U6IChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgdmlldy53ZWJDb250ZW50cy5vbmNlKGV2ZW50IGFzIFwiZGVzdHJveWVkXCIsIGxpc3RlbmVyKTtcbiAgICAgIHJldHVybiB2aWV3O1xuICAgIH0sXG4gICAgb2ZmOiAoZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpID0+IHtcbiAgICAgIHZpZXcud2ViQ29udGVudHMub2ZmKGV2ZW50IGFzIFwiZGVzdHJveWVkXCIsIGxpc3RlbmVyKTtcbiAgICAgIHJldHVybiB2aWV3O1xuICAgIH0sXG4gICAgcmVtb3ZlTGlzdGVuZXI6IChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgdmlldy53ZWJDb250ZW50cy5yZW1vdmVMaXN0ZW5lcihldmVudCBhcyBcImRlc3Ryb3llZFwiLCBsaXN0ZW5lcik7XG4gICAgICByZXR1cm4gdmlldztcbiAgICB9LFxuICAgIGlzRGVzdHJveWVkOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCksXG4gICAgaXNGb2N1c2VkOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmlzRm9jdXNlZCgpLFxuICAgIGZvY3VzOiAoKSA9PiB2aWV3LndlYkNvbnRlbnRzLmZvY3VzKCksXG4gICAgc2hvdzogKCkgPT4ge30sXG4gICAgaGlkZTogKCkgPT4ge30sXG4gICAgZ2V0Qm91bmRzOiB2aWV3Qm91bmRzLFxuICAgIGdldENvbnRlbnRCb3VuZHM6IHZpZXdCb3VuZHMsXG4gICAgZ2V0U2l6ZTogKCkgPT4ge1xuICAgICAgY29uc3QgYiA9IHZpZXdCb3VuZHMoKTtcbiAgICAgIHJldHVybiBbYi53aWR0aCwgYi5oZWlnaHRdO1xuICAgIH0sXG4gICAgZ2V0Q29udGVudFNpemU6ICgpID0+IHtcbiAgICAgIGNvbnN0IGIgPSB2aWV3Qm91bmRzKCk7XG4gICAgICByZXR1cm4gW2Iud2lkdGgsIGIuaGVpZ2h0XTtcbiAgICB9LFxuICAgIHNldFRpdGxlOiAoKSA9PiB7fSxcbiAgICBnZXRUaXRsZTogKCkgPT4gXCJcIixcbiAgICBzZXRSZXByZXNlbnRlZEZpbGVuYW1lOiAoKSA9PiB7fSxcbiAgICBzZXREb2N1bWVudEVkaXRlZDogKCkgPT4ge30sXG4gICAgc2V0V2luZG93QnV0dG9uVmlzaWJpbGl0eTogKCkgPT4ge30sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFjY2VwdFdlYlNvY2tldChyZXE6IEluY29taW5nTWVzc2FnZSwgc29ja2V0OiBTb2NrZXQsIGhlYWQ6IEJ1ZmZlcik6IFdlYlNvY2tldENvbm5lY3Rpb24ge1xuICBjb25zdCBrZXkgPSByZXEuaGVhZGVyc1tcInNlYy13ZWJzb2NrZXQta2V5XCJdO1xuICBpZiAodHlwZW9mIGtleSAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwibWlzc2luZyBTZWMtV2ViU29ja2V0LUtleVwiKTtcbiAgY29uc3QgYWNjZXB0ID0gY3JlYXRlSGFzaChcInNoYTFcIilcbiAgICAudXBkYXRlKGAke2tleX0yNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTFgKVxuICAgIC5kaWdlc3QoXCJiYXNlNjRcIik7XG4gIHNvY2tldC53cml0ZShcbiAgICBbXG4gICAgICBcIkhUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzXCIsXG4gICAgICBcIlVwZ3JhZGU6IHdlYnNvY2tldFwiLFxuICAgICAgXCJDb25uZWN0aW9uOiBVcGdyYWRlXCIsXG4gICAgICBgU2VjLVdlYlNvY2tldC1BY2NlcHQ6ICR7YWNjZXB0fWAsXG4gICAgICBcIlxcclxcblwiLFxuICAgIF0uam9pbihcIlxcclxcblwiKSxcbiAgKTtcbiAgY29uc3Qgd3MgPSBuZXcgV2ViU29ja2V0Q29ubmVjdGlvbihzb2NrZXQpO1xuICBpZiAoaGVhZC5sZW5ndGggPiAwKSB3cy5hY2NlcHRIZWFkKGhlYWQpO1xuICByZXR1cm4gd3M7XG59XG5cbmNsYXNzIFdlYlNvY2tldENvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJ1ZmZlciA9IEJ1ZmZlci5hbGxvYygwKTtcbiAgcHJpdmF0ZSB0ZXh0SGFuZGxlcnMgPSBuZXcgU2V0PCh0ZXh0OiBzdHJpbmcpID0+IHZvaWQ+KCk7XG4gIHByaXZhdGUgY2xvc2VIYW5kbGVycyA9IG5ldyBTZXQ8KCkgPT4gdm9pZD4oKTtcbiAgcHJpdmF0ZSBjbG9zZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNvY2tldDogU29ja2V0KSB7XG4gICAgc29ja2V0Lm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IHRoaXMuYWNjZXB0SGVhZChjaHVuaykpO1xuICAgIHNvY2tldC5vbihcImNsb3NlXCIsICgpID0+IHRoaXMuZW1pdENsb3NlKCkpO1xuICAgIHNvY2tldC5vbihcImVycm9yXCIsICgpID0+IHRoaXMuZW1pdENsb3NlKCkpO1xuICB9XG5cbiAgYWNjZXB0SGVhZChjaHVuazogQnVmZmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuY2xvc2VkKSByZXR1cm47XG4gICAgdGhpcy5idWZmZXIgPSBCdWZmZXIuY29uY2F0KFt0aGlzLmJ1ZmZlciwgY2h1bmtdKTtcbiAgICB0aGlzLnJlYWRGcmFtZXMoKTtcbiAgfVxuXG4gIG9uVGV4dChoYW5kbGVyOiAodGV4dDogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy50ZXh0SGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuICB9XG5cbiAgb25DbG9zZShoYW5kbGVyOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5jbG9zZUhhbmRsZXJzLmFkZChoYW5kbGVyKTtcbiAgfVxuXG4gIHNlbmRKc29uKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgICB0aGlzLnNlbmRUZXh0KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcbiAgfVxuXG4gIHNlbmRUZXh0KHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc2VuZEZyYW1lKDB4MSwgQnVmZmVyLmZyb20odGV4dCwgXCJ1dGY4XCIpKTtcbiAgfVxuXG4gIGNsb3NlKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmNsb3NlZCkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnNlbmRGcmFtZSgweDgsIEJ1ZmZlci5hbGxvYygwKSk7XG4gICAgfSBjYXRjaCB7fVxuICAgIHRoaXMuY2xvc2VkID0gdHJ1ZTtcbiAgICB0aGlzLnNvY2tldC5lbmQoKTtcbiAgICB0aGlzLmVtaXRDbG9zZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWFkRnJhbWVzKCk6IHZvaWQge1xuICAgIHdoaWxlICh0aGlzLmJ1ZmZlci5sZW5ndGggPj0gMikge1xuICAgICAgY29uc3QgZmlyc3QgPSB0aGlzLmJ1ZmZlclswXSE7XG4gICAgICBjb25zdCBzZWNvbmQgPSB0aGlzLmJ1ZmZlclsxXSE7XG4gICAgICBjb25zdCBvcGNvZGUgPSBmaXJzdCAmIDB4MGY7XG4gICAgICBjb25zdCBtYXNrZWQgPSAoc2Vjb25kICYgMHg4MCkgIT09IDA7XG4gICAgICBsZXQgbGVuZ3RoID0gc2Vjb25kICYgMHg3ZjtcbiAgICAgIGxldCBvZmZzZXQgPSAyO1xuICAgICAgaWYgKGxlbmd0aCA9PT0gMTI2KSB7XG4gICAgICAgIGlmICh0aGlzLmJ1ZmZlci5sZW5ndGggPCBvZmZzZXQgKyAyKSByZXR1cm47XG4gICAgICAgIGxlbmd0aCA9IHRoaXMuYnVmZmVyLnJlYWRVSW50MTZCRShvZmZzZXQpO1xuICAgICAgICBvZmZzZXQgKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAobGVuZ3RoID09PSAxMjcpIHtcbiAgICAgICAgaWYgKHRoaXMuYnVmZmVyLmxlbmd0aCA8IG9mZnNldCArIDgpIHJldHVybjtcbiAgICAgICAgY29uc3QgaGlnaCA9IHRoaXMuYnVmZmVyLnJlYWRVSW50MzJCRShvZmZzZXQpO1xuICAgICAgICBjb25zdCBsb3cgPSB0aGlzLmJ1ZmZlci5yZWFkVUludDMyQkUob2Zmc2V0ICsgNCk7XG4gICAgICAgIGlmIChoaWdoICE9PSAwKSB7XG4gICAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZW5ndGggPSBsb3c7XG4gICAgICAgIG9mZnNldCArPSA4O1xuICAgICAgfVxuICAgICAgY29uc3QgbWFza09mZnNldCA9IG9mZnNldDtcbiAgICAgIGlmIChtYXNrZWQpIG9mZnNldCArPSA0O1xuICAgICAgaWYgKHRoaXMuYnVmZmVyLmxlbmd0aCA8IG9mZnNldCArIGxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICBjb25zdCBtYXNrID0gbWFza2VkID8gdGhpcy5idWZmZXIuc3ViYXJyYXkobWFza09mZnNldCwgbWFza09mZnNldCArIDQpIDogbnVsbDtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBCdWZmZXIuZnJvbSh0aGlzLmJ1ZmZlci5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIGxlbmd0aCkpO1xuICAgICAgdGhpcy5idWZmZXIgPSB0aGlzLmJ1ZmZlci5zdWJhcnJheShvZmZzZXQgKyBsZW5ndGgpO1xuICAgICAgaWYgKG1hc2spIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXlsb2FkLmxlbmd0aDsgaSArPSAxKSBwYXlsb2FkW2ldIF49IG1hc2tbaSAlIDRdITtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wY29kZSA9PT0gMHg4KSB7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIH0gZWxzZSBpZiAob3Bjb2RlID09PSAweDkpIHtcbiAgICAgICAgdGhpcy5zZW5kRnJhbWUoMHhBLCBwYXlsb2FkKTtcbiAgICAgIH0gZWxzZSBpZiAob3Bjb2RlID09PSAweDEpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9IHBheWxvYWQudG9TdHJpbmcoXCJ1dGY4XCIpO1xuICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2YgWy4uLnRoaXMudGV4dEhhbmRsZXJzXSkgaGFuZGxlcih0ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNlbmRGcmFtZShvcGNvZGU6IG51bWJlciwgcGF5bG9hZDogQnVmZmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuY2xvc2VkICYmIG9wY29kZSAhPT0gMHg4KSByZXR1cm47XG4gICAgY29uc3QgbGVuZ3RoID0gcGF5bG9hZC5sZW5ndGg7XG4gICAgbGV0IGhlYWRlcjogQnVmZmVyO1xuICAgIGlmIChsZW5ndGggPCAxMjYpIHtcbiAgICAgIGhlYWRlciA9IEJ1ZmZlci5mcm9tKFsweDgwIHwgb3Bjb2RlLCBsZW5ndGhdKTtcbiAgICB9IGVsc2UgaWYgKGxlbmd0aCA8PSAweGZmZmYpIHtcbiAgICAgIGhlYWRlciA9IEJ1ZmZlci5hbGxvYyg0KTtcbiAgICAgIGhlYWRlclswXSA9IDB4ODAgfCBvcGNvZGU7XG4gICAgICBoZWFkZXJbMV0gPSAxMjY7XG4gICAgICBoZWFkZXIud3JpdGVVSW50MTZCRShsZW5ndGgsIDIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoZWFkZXIgPSBCdWZmZXIuYWxsb2MoMTApO1xuICAgICAgaGVhZGVyWzBdID0gMHg4MCB8IG9wY29kZTtcbiAgICAgIGhlYWRlclsxXSA9IDEyNztcbiAgICAgIGhlYWRlci53cml0ZVVJbnQzMkJFKDAsIDIpO1xuICAgICAgaGVhZGVyLndyaXRlVUludDMyQkUobGVuZ3RoLCA2KTtcbiAgICB9XG4gICAgdGhpcy5zb2NrZXQud3JpdGUoQnVmZmVyLmNvbmNhdChbaGVhZGVyLCBwYXlsb2FkXSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBlbWl0Q2xvc2UoKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLmNsb3NlZCkgdGhpcy5jbG9zZWQgPSB0cnVlO1xuICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBbLi4udGhpcy5jbG9zZUhhbmRsZXJzXSkgaGFuZGxlcigpO1xuICAgIHRoaXMuY2xvc2VIYW5kbGVycy5jbGVhcigpO1xuICAgIHRoaXMudGV4dEhhbmRsZXJzLmNsZWFyKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVxdWVzdFVybChyZXE6IEluY29taW5nTWVzc2FnZSk6IFVSTCB8IG51bGwge1xuICB0cnkge1xuICAgIHJldHVybiBuZXcgVVJMKHJlcS51cmwgPz8gXCIvXCIsIFwiaHR0cDovLzEyNy4wLjAuMVwiKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZEpzb25Cb2R5KHJlcTogSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuICAgIGxldCB0b3RhbCA9IDA7XG4gICAgcmVxLm9uKFwiZGF0YVwiLCAoY2h1bms6IEJ1ZmZlcikgPT4ge1xuICAgICAgdG90YWwgKz0gY2h1bmsubGVuZ3RoO1xuICAgICAgaWYgKHRvdGFsID4gMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcInJlcXVlc3QgYm9keSB0b28gbGFyZ2VcIikpO1xuICAgICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjaHVua3MucHVzaChjaHVuayk7XG4gICAgfSk7XG4gICAgcmVxLm9uKFwiZW5kXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJhdyA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZyhcInV0ZjhcIik7XG4gICAgICBpZiAoIXJhdykge1xuICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICByZXNvbHZlKEpTT04ucGFyc2UocmF3KSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJlcS5vbihcImVycm9yXCIsIHJlamVjdCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzZW5kSnNvbihyZXM6IFNlcnZlclJlc3BvbnNlLCBzdGF0dXM6IG51bWJlciwgYm9keTogdW5rbm93bik6IHZvaWQge1xuICBzZW5kQnVmZmVyKHJlcywgc3RhdHVzLCBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShib2R5KSksIE1JTUVfVFlQRVNbXCIuanNvblwiXSwgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBzZW5kVGV4dChyZXM6IFNlcnZlclJlc3BvbnNlLCBzdGF0dXM6IG51bWJlciwgYm9keTogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nKTogdm9pZCB7XG4gIHNlbmRCdWZmZXIocmVzLCBzdGF0dXMsIEJ1ZmZlci5mcm9tKGJvZHkpLCBjb250ZW50VHlwZSwgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBzZW5kQnVmZmVyKFxuICByZXM6IFNlcnZlclJlc3BvbnNlLFxuICBzdGF0dXM6IG51bWJlcixcbiAgYm9keTogQnVmZmVyLFxuICBjb250ZW50VHlwZTogc3RyaW5nLFxuICBoZWFkT25seTogYm9vbGVhbixcbik6IHZvaWQge1xuICByZXMud3JpdGVIZWFkKHN0YXR1cywge1xuICAgIFwiY29udGVudC10eXBlXCI6IGNvbnRlbnRUeXBlLFxuICAgIFwiY29udGVudC1sZW5ndGhcIjogYm9keS5sZW5ndGgsXG4gICAgXCJjYWNoZS1jb250cm9sXCI6IFwibm8tc3RvcmVcIixcbiAgfSk7XG4gIGlmIChoZWFkT25seSkgcmVzLmVuZCgpO1xuICBlbHNlIHJlcy5lbmQoYm9keSk7XG59XG5cbmZ1bmN0aW9uIHdlYnZpZXdSb290KCk6IHN0cmluZyB7XG4gIHJldHVybiBqb2luKHByb2Nlc3MucmVzb3VyY2VzUGF0aCwgXCJhcHAuYXNhclwiLCBcIndlYnZpZXdcIik7XG59XG5cbmZ1bmN0aW9uIHdlYnZpZXdGaWxlKHBhdGhuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgY2xlYW5QYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhdGhuYW1lKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICBpZiAoIWNsZWFuUGF0aCB8fCBjbGVhblBhdGguaW5jbHVkZXMoXCJcXDBcIikpIHJldHVybiBudWxsO1xuICBjb25zdCByb290ID0gd2Vidmlld1Jvb3QoKTtcbiAgY29uc3QgZmlsZSA9IG5vcm1hbGl6ZShqb2luKHJvb3QsIGNsZWFuUGF0aCkpO1xuICBjb25zdCByZWwgPSByZWxhdGl2ZShyb290LCBmaWxlKTtcbiAgaWYgKHJlbC5zdGFydHNXaXRoKFwiLi5cIikgfHwgcmVsID09PSBcIlwiKSByZXR1cm4gbnVsbDtcbiAgaWYgKCFleGlzdHNTeW5jKGZpbGUpIHx8ICFzdGF0U3luYyhmaWxlKS5pc0ZpbGUoKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBmaWxlO1xufVxuXG5mdW5jdGlvbiBtaW1lVHlwZShmaWxlOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBkb3QgPSBmaWxlLmxhc3RJbmRleE9mKFwiLlwiKTtcbiAgY29uc3QgZXh0ID0gZG90ID49IDAgPyBmaWxlLnNsaWNlKGRvdCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIHJldHVybiBNSU1FX1RZUEVTW2V4dF0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZU9wdGlvbnMoKTogQnJvd3NlclVpU2VydmVyT3B0aW9ucyB7XG4gIGlmICghYWN0aXZlT3B0aW9ucykgdGhyb3cgbmV3IEVycm9yKFwiQ29kZXgrKyBicm93c2VyIFVJIHNlcnZlciBpcyBub3QgY29uZmlndXJlZFwiKTtcbiAgcmV0dXJuIGFjdGl2ZU9wdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGlzQnJvd3NlclVpSG9zdFNlbmRlcihzZW5kZXI6IEVsZWN0cm9uLldlYkNvbnRlbnRzKTogYm9vbGVhbiB7XG4gIHJldHVybiAhIWFjdGl2ZUhvc3QgJiYgIWFjdGl2ZUhvc3Qud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSAmJiBzZW5kZXIuaWQgPT09IGFjdGl2ZUhvc3Qud2ViQ29udGVudHMuaWQ7XG59XG5cbmZ1bmN0aW9uIGFzc2VydEJyaWRnZU1ldGhvZChtZXRob2Q6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIS9eW2EtekEtWjAtOS5fOi1dKyQvLnRlc3QobWV0aG9kKSkgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBicmlkZ2UgbWV0aG9kXCIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBvcnQodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHBhcnNlZCkgJiYgcGFyc2VkID4gMCAmJiBwYXJzZWQgPD0gNjU1MzUgPyBwYXJzZWQgOiBmYWxsYmFjaztcbn1cblxuZnVuY3Rpb24gYXNSZWNvcmQodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwge1xuICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiID8gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBhc1BsYWluT2JqZWN0KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICBjb25zdCByZWNvcmQgPSBhc1JlY29yZCh2YWx1ZSk7XG4gIHJldHVybiByZWNvcmQgJiYgIUFycmF5LmlzQXJyYXkocmVjb3JkKSA/IHJlY29yZCA6IHt9O1xufVxuXG5mdW5jdGlvbiBjdXJyZW50U3lzdGVtVGhlbWVWYXJpYW50KCk6IHN0cmluZyB7XG4gIHJldHVybiBuYXRpdmVUaGVtZS5zaG91bGRVc2VEYXJrQ29sb3JzID8gXCJkYXJrXCIgOiBcImxpZ2h0XCI7XG59XG5cbmZ1bmN0aW9uIHNhZmVKc29uKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC88L2csIFwiXFxcXHUwMDNjXCIpO1xufVxuXG5mdW5jdGlvbiBkZWxheShtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVNBLElBQUFBLG1CQUFpRztBQUNqRyxJQUFBQyxtQkFBcUk7QUFDckksSUFBQUMsNkJBQStDO0FBQy9DLElBQUFDLHNCQUFrRDtBQUNsRCxJQUFBQyxvQkFBNkQ7QUFDN0QsSUFBQUMsa0JBQWdDOzs7QUNiaEMsSUFBQUMsYUFBK0I7QUFDL0IsSUFBQUMsbUJBQThCO0FBQzlCLG9CQUE2QjtBQUM3QixJQUFBQyxXQUF5Qjs7O0FDSnpCLHNCQUErQztBQUMvQyx5QkFBeUI7QUFDekIsdUJBQXVGO0FBQ2hGLElBQU0sYUFBYTtBQUFBLEVBQ3RCLFdBQVc7QUFBQSxFQUNYLFVBQVU7QUFBQSxFQUNWLGVBQWU7QUFBQSxFQUNmLGlCQUFpQjtBQUNyQjtBQUNBLElBQU0saUJBQWlCO0FBQUEsRUFDbkIsTUFBTTtBQUFBLEVBQ04sWUFBWSxDQUFDLGVBQWU7QUFBQSxFQUM1QixpQkFBaUIsQ0FBQyxlQUFlO0FBQUEsRUFDakMsTUFBTSxXQUFXO0FBQUEsRUFDakIsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsWUFBWTtB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RUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFDeEQ7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFTO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUN2RjtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVk7QUFBQSxFQUFPO0FBQUEsRUFDckY7QUFBQSxFQUFTO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUN2QjtBQUFBLEVBQWE7QUFBQSxFQUFhO0FBQUEsRUFBYTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUNwRTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBVztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUMxRTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTztBQUFBLEVBQVc7QUFBQSxFQUFNO0FBQUEsRUFDcEM7QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQzVEO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ25EO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUNyRjtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUztBQUFBLEVBQ3hCO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUN0QztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3pCO0FBQUEsRUFBSztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUN0RDtBQUFBLEVBQVM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDL0U7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQ2Y7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ2pGO0FBQUEsRUFDQTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQWE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDcEY7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBVTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ25GO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDckI7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ2hGO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDMUM7QUFBQSxFQUFPO0FBQUEsRUFDUDtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFNO0FBQUEsRUFDaEY7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFTO0FBQUEsRUFBTztBQUFBLEVBQ3RDO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUNuRjtBQUFBLEVBQVM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUM5QjtBQUFBLEVBQUs7QUFBQSxFQUFPO0FBQ2hCLENBQUM7QUFDRCxJQUFNLGVBQWUsQ0FBQyxhQUFhLGlCQUFpQixJQUFZLGdCQUFRLFFBQVEsRUFBRSxNQUFNLENBQUMsRUFBRSxZQUFZLENBQUM7QUFFeEcsSUFBTSxVQUFVLENBQUMsS0FBSyxPQUFPO0FBQ3pCLE1BQUksZUFBZSxLQUFLO0FBQ3BCLFFBQUksUUFBUSxFQUFFO0FBQUEsRUFDbEIsT0FDSztBQUNELE9BQUcsR0FBRztBQUFBLEVBQ1Y7QUFDSjtBQUNBLElBQU0sZ0JBQWdCLENBQUMsTUFBTSxNQUFNLFNBQVM7QUFDeEMsTUFBSSxZQUFZLEtBQUssSUFBSTtBQUN6QixNQUFJLEVBQUUscUJBQXFCLE1BQU07QUFDN0IsU0FBSyxJQUFJLElBQUksWUFBWSxvQkFBSSxJQUFJLENBQUMsU0FBUyxDQUFDO0FBQUEsRUFDaEQ7QUFDQSxZQUFVLElBQUksSUFBSTtBQUN0QjtBQUNBLElBQU0sWUFBWSxDQUFDLFNBQVMsQ0FBQyxRQUFRO0FBQ2pDLFFBQU0sTUFBTSxLQUFLLEdBQUc7QUFDcEIsTUFBSSxlQUFlLEtBQUs7QUFDcEIsUUFBSSxNQUFNO0FBQUEsRUFDZCxPQUNLO0FBQ0QsV0FBTyxLQUFLLEdBQUc7QUFBQSxFQUNuQjtBQUNKO0FBQ0EsSUFBTSxhQUFhLENBQUMsTUFBTSxNQUFNLFNBQVM7QUFDckMsUUFBTSxZQUFZLEtBQUssSUFBSTtBQUMzQixNQUFJLHFCQUFxQixLQUFLO0FBQzFCLGNBQVUsT0FBTyxJQUFJO0FBQUEsRUFDekIsV0FDUyxjQUFjLE1BQU07QUFDekIsV0FBTyxLQUFLLElBQUk7QUFBQSxFQUNwQjtBQUNKO0FBQ0EsSUFBTSxhQUFhLENBQUMsUUFBUyxlQUFlLE1BQU0sSUFBSSxTQUFTLElBQUksQ0FBQztBQUNwRSxJQUFNLG1CQUFtQixvQkFBSSxJQUFJO0FBVWpDLFNBQVMsc0JBQXNCLE1BQU0sU0FBUyxVQUFVLFlBQVksU0FBUztBQUN6RSxRQUFNLGNBQWMsQ0FBQyxVQUFVLFdBQVc7QUFDdEMsYUFBUyxJQUFJO0FBQ2IsWUFBUSxVQUFVLFFBQVEsRUFBRSxhQUFhLEtBQUssQ0FBQztBQUcvQyxRQUFJLFVBQVUsU0FBUyxRQUFRO0FBQzNCLHVCQUF5QixnQkFBUSxNQUFNLE1BQU0sR0FBRyxlQUF1QixhQUFLLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDN0Y7QUFBQSxFQUNKO0FBQ0EsTUFBSTtBQUNBLGVBQU8sVUFBQUMsT0FBUyxNQUFNO0FBQUEsTUFDbEIsWUFBWSxRQUFRO0FBQUEsSUFDeEIsR0FBRyxXQUFXO0FBQUEsRUFDbEIsU0FDTyxPQUFPO0FBQ1YsZUFBVyxLQUFLO0FBQ2hCLFdBQU87QUFBQSxFQUNYO0FBQ0o7QUFLQSxJQUFNLG1CQUFtQixDQUFDLFVBQVUsY0FBYyxNQUFNLE1BQU0sU0FBUztBQUNuRSxRQUFNLE9BQU8saUJBQWlCLElBQUksUUFBUTtBQUMxQyxNQUFJLENBQUM7QUFDRDtBQUNKLFVBQVEsS0FBSyxZQUFZLEdBQUcsQ0FBQyxhQUFhO0FBQ3RDLGFBQVMsTUFBTSxNQUFNLElBQUk7QUFBQSxFQUM3QixDQUFDO0FBQ0w7QUFTQSxJQUFNLHFCQUFxQixDQUFDLE1BQU0sVUFBVSxTQUFTLGFBQWE7QUFDOUQsUUFBTSxFQUFFLFVBQVUsWUFBWSxXQUFXLElBQUk7QUFDN0MsTUFBSSxPQUFPLGlCQUFpQixJQUFJLFFBQVE7QUFDeEMsTUFBSTtBQUNKLE1BQUksQ0FBQyxRQUFRLFlBQVk7QUFDckIsY0FBVSxzQkFBc0IsTUFBTSxTQUFTLFVBQVUsWUFBWSxVQUFVO0FBQy9FLFFBQUksQ0FBQztBQUNEO0FBQ0osV0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPO0FBQUEsRUFDckM7QUFDQSxNQUFJLE1BQU07QUFDTixrQkFBYyxNQUFNLGVBQWUsUUFBUTtBQUMzQyxrQkFBYyxNQUFNLFNBQVMsVUFBVTtBQUN2QyxrQkFBYyxNQUFNLFNBQVMsVUFBVTtBQUFBLEVBQzNDLE9BQ0s7QUFDRCxjQUFVO0FBQUEsTUFBc0I7QUFBQSxNQUFNO0FBQUEsTUFBUyxpQkFBaUIsS0FBSyxNQUFNLFVBQVUsYUFBYTtBQUFBLE1BQUc7QUFBQTtBQUFBLE1BQ3JHLGlCQUFpQixLQUFLLE1BQU0sVUFBVSxPQUFPO0FBQUEsSUFBQztBQUM5QyxRQUFJLENBQUM7QUFDRDtBQUNKLFlBQVEsR0FBRyxHQUFHLE9BQU8sT0FBTyxVQUFVO0FBQ2xDLFlBQU0sZUFBZSxpQkFBaUIsS0FBSyxNQUFNLFVBQVUsT0FBTztBQUNsRSxVQUFJO0FBQ0EsYUFBSyxrQkFBa0I7QUFFM0IsVUFBSSxhQUFhLE1BQU0sU0FBUyxTQUFTO0FBQ3JDLFlBQUk7QUFDQSxnQkFBTSxLQUFLLFVBQU0sdUJBQUssTUFBTSxHQUFHO0FBQy9CLGdCQUFNLEdBQUcsTUFBTTtBQUNmLHVCQUFhLEtBQUs7QUFBQSxRQUN0QixTQUNPLEtBQUs7QUFBQSxRQUVaO0FBQUEsTUFDSixPQUNLO0FBQ0QscUJBQWEsS0FBSztBQUFBLE1BQ3RCO0FBQUEsSUFDSixDQUFDO0FBQ0QsV0FBTztBQUFBLE1BQ0gsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2I7QUFBQSxJQUNKO0FBQ0EscUJBQWlCLElBQUksVUFBVSxJQUFJO0FBQUEsRUFDdkM7QUFJQSxTQUFPLE1BQU07QUFDVCxlQUFXLE1BQU0sZUFBZSxRQUFRO0FBQ3hDLGVBQVcsTUFBTSxTQUFTLFVBQVU7QUFDcEMsZUFBVyxNQUFNLFNBQVMsVUFBVTtBQUNwQyxRQUFJLFdBQVcsS0FBSyxTQUFTLEdBQUc7QUFHNUIsV0FBSyxRQUFRLE1BQU07QUFFbkIsdUJBQWlCLE9BQU8sUUFBUTtBQUNoQyxtQkFBYSxRQUFRLFVBQVUsSUFBSSxDQUFDO0FBRXBDLFdBQUssVUFBVTtBQUNmLGFBQU8sT0FBTyxJQUFJO0FBQUEsSUFDdEI7QUFBQSxFQUNKO0FBQ0o7QUFJQSxJQUFNLHVCQUF1QixvQkFBSSxJQUFJO0FBVXJDLElBQU0seUJBQXlCLENBQUMsTUFBTSxVQUFVLFNBQVMsYUFBYTtBQUNsRSxRQUFNLEVBQUUsVUFBVSxXQUFXLElBQUk7QUFDakMsTUFBSSxPQUFPLHFCQUFxQixJQUFJLFFBQVE7QUFHNUMsUUFBTSxRQUFRLFFBQVEsS0FBSztBQUMzQixNQUFJLFVBQVUsTUFBTSxhQUFhLFFBQVEsY0FBYyxNQUFNLFdBQVcsUUFBUSxXQUFXO0FBT3ZGLCtCQUFZLFFBQVE7QUFDcEIsV0FBTztBQUFBLEVBQ1g7QUFDQSxNQUFJLE1BQU07QUFDTixrQkFBYyxNQUFNLGVBQWUsUUFBUTtBQUMzQyxrQkFBYyxNQUFNLFNBQVMsVUFBVTtBQUFBLEVBQzNDLE9BQ0s7QUFJRCxXQUFPO0FBQUEsTUFDSCxXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYjtBQUFBLE1BQ0EsYUFBUyxxQkFBVSxVQUFVLFNBQVMsQ0FBQyxNQUFNLFNBQVM7QUFDbEQsZ0JBQVEsS0FBSyxhQUFhLENBQUNDLGdCQUFlO0FBQ3RDLFVBQUFBLFlBQVcsR0FBRyxRQUFRLFVBQVUsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLFFBQ2xELENBQUM7QUFDRCxjQUFNLFlBQVksS0FBSztBQUN2QixZQUFJLEtBQUssU0FBUyxLQUFLLFFBQVEsWUFBWSxLQUFLLFdBQVcsY0FBYyxHQUFHO0FBQ3hFLGtCQUFRLEtBQUssV0FBVyxDQUFDQyxjQUFhQSxVQUFTLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDOUQ7QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNMO0FBQ0EseUJBQXFCLElBQUksVUFBVSxJQUFJO0FBQUEsRUFDM0M7QUFJQSxTQUFPLE1BQU07QUFDVCxlQUFXLE1BQU0sZUFBZSxRQUFRO0FBQ3hDLGVBQVcsTUFBTSxTQUFTLFVBQVU7QUFDcEMsUUFBSSxXQUFXLEtBQUssU0FBUyxHQUFHO0FBQzVCLDJCQUFxQixPQUFPLFFBQVE7QUFDcEMsaUNBQVksUUFBUTtBQUNwQixXQUFLLFVBQVUsS0FBSyxVQUFVO0FBQzlCLGFBQU8sT0FBTyxJQUFJO0FBQUEsSUFDdEI7QUFBQSxFQUNKO0FBQ0o7QUFJTyxJQUFNLGdCQUFOLE1BQW9CO0FBQUEsRUFDdkIsWUFBWSxLQUFLO0FBQ2IsU0FBSyxNQUFNO0FBQ1gsU0FBSyxvQkFBb0IsQ0FBQyxVQUFVLElBQUksYUFBYSxLQUFLO0FBQUEsRUFDOUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLGlCQUFpQixNQUFNLFVBQVU7QUFDN0IsVUFBTSxPQUFPLEtBQUssSUFBSTtBQUN0QixVQUFNLFlBQW9CLGdCQUFRLElBQUk7QUFDdEMsVUFBTUMsWUFBbUIsaUJBQVMsSUFBSTtBQUN0QyxVQUFNLFNBQVMsS0FBSyxJQUFJLGVBQWUsU0FBUztBQUNoRCxXQUFPLElBQUlBLFNBQVE7QUFDbkIsVUFBTSxlQUF1QixnQkFBUSxJQUFJO0FBQ3pDLFVBQU0sVUFBVTtBQUFBLE1BQ1osWUFBWSxLQUFLO0FBQUEsSUFDckI7QUFDQSxRQUFJLENBQUM7QUFDRCxpQkFBVztBQUNmLFFBQUk7QUFDSixRQUFJLEtBQUssWUFBWTtBQUNqQixZQUFNLFlBQVksS0FBSyxhQUFhLEtBQUs7QUFDekMsY0FBUSxXQUFXLGFBQWEsYUFBYUEsU0FBUSxJQUFJLEtBQUssaUJBQWlCLEtBQUs7QUFDcEYsZUFBUyx1QkFBdUIsTUFBTSxjQUFjLFNBQVM7QUFBQSxRQUN6RDtBQUFBLFFBQ0EsWUFBWSxLQUFLLElBQUk7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDTCxPQUNLO0FBQ0QsZUFBUyxtQkFBbUIsTUFBTSxjQUFjLFNBQVM7QUFBQSxRQUNyRDtBQUFBLFFBQ0EsWUFBWSxLQUFLO0FBQUEsUUFDakIsWUFBWSxLQUFLLElBQUk7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDTDtBQUNBLFdBQU87QUFBQSxFQUNYO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFlBQVksTUFBTSxPQUFPLFlBQVk7QUFDakMsUUFBSSxLQUFLLElBQUksUUFBUTtBQUNqQjtBQUFBLElBQ0o7QUFDQSxVQUFNQyxXQUFrQixnQkFBUSxJQUFJO0FBQ3BDLFVBQU1ELFlBQW1CLGlCQUFTLElBQUk7QUFDdEMsVUFBTSxTQUFTLEtBQUssSUFBSSxlQUFlQyxRQUFPO0FBRTlDLFFBQUksWUFBWTtBQUVoQixRQUFJLE9BQU8sSUFBSUQsU0FBUTtBQUNuQjtBQUNKLFVBQU0sV0FBVyxPQUFPLE1BQU0sYUFBYTtBQUN2QyxVQUFJLENBQUMsS0FBSyxJQUFJLFVBQVUscUJBQXFCLE1BQU0sQ0FBQztBQUNoRDtBQUNKLFVBQUksQ0FBQyxZQUFZLFNBQVMsWUFBWSxHQUFHO0FBQ3JDLFlBQUk7QUFDQSxnQkFBTUUsWUFBVyxVQUFNLHVCQUFLLElBQUk7QUFDaEMsY0FBSSxLQUFLLElBQUk7QUFDVDtBQUVKLGdCQUFNLEtBQUtBLFVBQVM7QUFDcEIsZ0JBQU0sS0FBS0EsVUFBUztBQUNwQixjQUFJLENBQUMsTUFBTSxNQUFNLE1BQU0sT0FBTyxVQUFVLFNBQVM7QUFDN0MsaUJBQUssSUFBSSxNQUFNLEdBQUcsUUFBUSxNQUFNQSxTQUFRO0FBQUEsVUFDNUM7QUFDQSxlQUFLLFdBQVcsV0FBVyxjQUFjLFVBQVUsUUFBUUEsVUFBUyxLQUFLO0FBQ3JFLGlCQUFLLElBQUksV0FBVyxJQUFJO0FBQ3hCLHdCQUFZQTtBQUNaLGtCQUFNQyxVQUFTLEtBQUssaUJBQWlCLE1BQU0sUUFBUTtBQUNuRCxnQkFBSUE7QUFDQSxtQkFBSyxJQUFJLGVBQWUsTUFBTUEsT0FBTTtBQUFBLFVBQzVDLE9BQ0s7QUFDRCx3QkFBWUQ7QUFBQSxVQUNoQjtBQUFBLFFBQ0osU0FDTyxPQUFPO0FBRVYsZUFBSyxJQUFJLFFBQVFELFVBQVNELFNBQVE7QUFBQSxRQUN0QztBQUFBLE1BRUosV0FDUyxPQUFPLElBQUlBLFNBQVEsR0FBRztBQUUzQixjQUFNLEtBQUssU0FBUztBQUNwQixjQUFNLEtBQUssU0FBUztBQUNwQixZQUFJLENBQUMsTUFBTSxNQUFNLE1BQU0sT0FBTyxVQUFVLFNBQVM7QUFDN0MsZUFBSyxJQUFJLE1BQU0sR0FBRyxRQUFRLE1BQU0sUUFBUTtBQUFBLFFBQzVDO0FBQ0Esb0JBQVk7QUFBQSxNQUNoQjtBQUFBLElBQ0o7QUFFQSxVQUFNLFNBQVMsS0FBSyxpQkFBaUIsTUFBTSxRQUFRO0FBRW5ELFFBQUksRUFBRSxjQUFjLEtBQUssSUFBSSxRQUFRLGtCQUFrQixLQUFLLElBQUksYUFBYSxJQUFJLEdBQUc7QUFDaEYsVUFBSSxDQUFDLEtBQUssSUFBSSxVQUFVLEdBQUcsS0FBSyxNQUFNLENBQUM7QUFDbkM7QUFDSixXQUFLLElBQUksTUFBTSxHQUFHLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDdEM7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQU0sZUFBZSxPQUFPLFdBQVcsTUFBTSxNQUFNO0FBQy9DLFFBQUksS0FBSyxJQUFJLFFBQVE7QUFDakI7QUFBQSxJQUNKO0FBQ0EsVUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBTSxNQUFNLEtBQUssSUFBSSxlQUFlLFNBQVM7QUFDN0MsUUFBSSxDQUFDLEtBQUssSUFBSSxRQUFRLGdCQUFnQjtBQUVsQyxXQUFLLElBQUksZ0JBQWdCO0FBQ3pCLFVBQUk7QUFDSixVQUFJO0FBQ0EsbUJBQVcsVUFBTSxpQkFBQUksVUFBVyxJQUFJO0FBQUEsTUFDcEMsU0FDTyxHQUFHO0FBQ04sYUFBSyxJQUFJLFdBQVc7QUFDcEIsZUFBTztBQUFBLE1BQ1g7QUFDQSxVQUFJLEtBQUssSUFBSTtBQUNUO0FBQ0osVUFBSSxJQUFJLElBQUksSUFBSSxHQUFHO0FBQ2YsWUFBSSxLQUFLLElBQUksY0FBYyxJQUFJLElBQUksTUFBTSxVQUFVO0FBQy9DLGVBQUssSUFBSSxjQUFjLElBQUksTUFBTSxRQUFRO0FBQ3pDLGVBQUssSUFBSSxNQUFNLEdBQUcsUUFBUSxNQUFNLE1BQU0sS0FBSztBQUFBLFFBQy9DO0FBQUEsTUFDSixPQUNLO0FBQ0QsWUFBSSxJQUFJLElBQUk7QUFDWixhQUFLLElBQUksY0FBYyxJQUFJLE1BQU0sUUFBUTtBQUN6QyxhQUFLLElBQUksTUFBTSxHQUFHLEtBQUssTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUM1QztBQUNBLFdBQUssSUFBSSxXQUFXO0FBQ3BCLGFBQU87QUFBQSxJQUNYO0FBRUEsUUFBSSxLQUFLLElBQUksY0FBYyxJQUFJLElBQUksR0FBRztBQUNsQyxhQUFPO0FBQUEsSUFDWDtBQUNBLFNBQUssSUFBSSxjQUFjLElBQUksTUFBTSxJQUFJO0FBQUEsRUFDekM7QUFBQSxFQUNBLFlBQVksV0FBVyxZQUFZLElBQUksUUFBUSxLQUFLLE9BQU8sV0FBVztBQUVsRSxnQkFBb0IsYUFBSyxXQUFXLEVBQUU7QUFDdEMsZ0JBQVksS0FBSyxJQUFJLFVBQVUsV0FBVyxXQUFXLEdBQUk7QUFDekQsUUFBSSxDQUFDO0FBQ0Q7QUFDSixVQUFNLFdBQVcsS0FBSyxJQUFJLGVBQWUsR0FBRyxJQUFJO0FBQ2hELFVBQU0sVUFBVSxvQkFBSSxJQUFJO0FBQ3hCLFFBQUksU0FBUyxLQUFLLElBQUksVUFBVSxXQUFXO0FBQUEsTUFDdkMsWUFBWSxDQUFDLFVBQVUsR0FBRyxXQUFXLEtBQUs7QUFBQSxNQUMxQyxpQkFBaUIsQ0FBQyxVQUFVLEdBQUcsVUFBVSxLQUFLO0FBQUEsSUFDbEQsQ0FBQztBQUNELFFBQUksQ0FBQztBQUNEO0FBQ0osV0FDSyxHQUFHLFVBQVUsT0FBTyxVQUFVO0FBQy9CLFVBQUksS0FBSyxJQUFJLFFBQVE7QUFDakIsaUJBQVM7QUFDVDtBQUFBLE1BQ0o7QUFDQSxZQUFNLE9BQU8sTUFBTTtBQUNuQixVQUFJLE9BQWUsYUFBSyxXQUFXLElBQUk7QUFDdkMsY0FBUSxJQUFJLElBQUk7QUFDaEIsVUFBSSxNQUFNLE1BQU0sZUFBZSxLQUMxQixNQUFNLEtBQUssZUFBZSxPQUFPLFdBQVcsTUFBTSxJQUFJLEdBQUk7QUFDM0Q7QUFBQSxNQUNKO0FBQ0EsVUFBSSxLQUFLLElBQUksUUFBUTtBQUNqQixpQkFBUztBQUNUO0FBQUEsTUFDSjtBQUlBLFVBQUksU0FBUyxVQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsSUFBSSxJQUFJLEdBQUk7QUFDckQsYUFBSyxJQUFJLGdCQUFnQjtBQUV6QixlQUFlLGFBQUssS0FBYSxpQkFBUyxLQUFLLElBQUksQ0FBQztBQUNwRCxhQUFLLGFBQWEsTUFBTSxZQUFZLElBQUksUUFBUSxDQUFDO0FBQUEsTUFDckQ7QUFBQSxJQUNKLENBQUMsRUFDSSxHQUFHLEdBQUcsT0FBTyxLQUFLLGlCQUFpQjtBQUN4QyxXQUFPLElBQUksUUFBUSxDQUFDQyxVQUFTLFdBQVc7QUFDcEMsVUFBSSxDQUFDO0FBQ0QsZUFBTyxPQUFPO0FBQ2xCLGFBQU8sS0FBSyxTQUFTLE1BQU07QUFDdkIsWUFBSSxLQUFLLElBQUksUUFBUTtBQUNqQixtQkFBUztBQUNUO0FBQUEsUUFDSjtBQUNBLGNBQU0sZUFBZSxZQUFZLFVBQVUsTUFBTSxJQUFJO0FBQ3JELFFBQUFBLFNBQVEsTUFBUztBQUlqQixpQkFDSyxZQUFZLEVBQ1osT0FBTyxDQUFDLFNBQVM7QUFDbEIsaUJBQU8sU0FBUyxhQUFhLENBQUMsUUFBUSxJQUFJLElBQUk7QUFBQSxRQUNsRCxDQUFDLEVBQ0ksUUFBUSxDQUFDLFNBQVM7QUFDbkIsZUFBSyxJQUFJLFFBQVEsV0FBVyxJQUFJO0FBQUEsUUFDcEMsQ0FBQztBQUNELGlCQUFTO0FBRVQsWUFBSTtBQUNBLGVBQUssWUFBWSxXQUFXLE9BQU8sSUFBSSxRQUFRLEtBQUssT0FBTyxTQUFTO0FBQUEsTUFDNUUsQ0FBQztBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0w7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZQSxNQUFNLFdBQVcsS0FBSyxPQUFPLFlBQVksT0FBTyxRQUFRLElBQUlDLFdBQVU7QUFDbEUsVUFBTSxZQUFZLEtBQUssSUFBSSxlQUF1QixnQkFBUSxHQUFHLENBQUM7QUFDOUQsVUFBTSxVQUFVLFVBQVUsSUFBWSxpQkFBUyxHQUFHLENBQUM7QUFDbkQsUUFBSSxFQUFFLGNBQWMsS0FBSyxJQUFJLFFBQVEsa0JBQWtCLENBQUMsVUFBVSxDQUFDLFNBQVM7QUFDeEUsV0FBSyxJQUFJLE1BQU0sR0FBRyxTQUFTLEtBQUssS0FBSztBQUFBLElBQ3pDO0FBRUEsY0FBVSxJQUFZLGlCQUFTLEdBQUcsQ0FBQztBQUNuQyxTQUFLLElBQUksZUFBZSxHQUFHO0FBQzNCLFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSxTQUFTLEtBQUssSUFBSSxRQUFRO0FBQ2hDLFNBQUssVUFBVSxRQUFRLFNBQVMsV0FBVyxDQUFDLEtBQUssSUFBSSxjQUFjLElBQUlBLFNBQVEsR0FBRztBQUM5RSxVQUFJLENBQUMsUUFBUTtBQUNULGNBQU0sS0FBSyxZQUFZLEtBQUssWUFBWSxJQUFJLFFBQVEsS0FBSyxPQUFPLFNBQVM7QUFDekUsWUFBSSxLQUFLLElBQUk7QUFDVDtBQUFBLE1BQ1I7QUFDQSxlQUFTLEtBQUssaUJBQWlCLEtBQUssQ0FBQyxTQUFTQyxXQUFVO0FBRXBELFlBQUlBLFVBQVNBLE9BQU0sWUFBWTtBQUMzQjtBQUNKLGFBQUssWUFBWSxTQUFTLE9BQU8sSUFBSSxRQUFRLEtBQUssT0FBTyxTQUFTO0FBQUEsTUFDdEUsQ0FBQztBQUFBLElBQ0w7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBTSxhQUFhLE1BQU0sWUFBWSxTQUFTLE9BQU8sUUFBUTtBQUN6RCxVQUFNLFFBQVEsS0FBSyxJQUFJO0FBQ3ZCLFFBQUksS0FBSyxJQUFJLFdBQVcsSUFBSSxLQUFLLEtBQUssSUFBSSxRQUFRO0FBQzlDLFlBQU07QUFDTixhQUFPO0FBQUEsSUFDWDtBQUNBLFVBQU0sS0FBSyxLQUFLLElBQUksaUJBQWlCLElBQUk7QUFDekMsUUFBSSxTQUFTO0FBQ1QsU0FBRyxhQUFhLENBQUMsVUFBVSxRQUFRLFdBQVcsS0FBSztBQUNuRCxTQUFHLFlBQVksQ0FBQyxVQUFVLFFBQVEsVUFBVSxLQUFLO0FBQUEsSUFDckQ7QUFFQSxRQUFJO0FBQ0EsWUFBTSxRQUFRLE1BQU0sWUFBWSxHQUFHLFVBQVUsRUFBRSxHQUFHLFNBQVM7QUFDM0QsVUFBSSxLQUFLLElBQUk7QUFDVDtBQUNKLFVBQUksS0FBSyxJQUFJLFdBQVcsR0FBRyxXQUFXLEtBQUssR0FBRztBQUMxQyxjQUFNO0FBQ04sZUFBTztBQUFBLE1BQ1g7QUFDQSxZQUFNLFNBQVMsS0FBSyxJQUFJLFFBQVE7QUFDaEMsVUFBSTtBQUNKLFVBQUksTUFBTSxZQUFZLEdBQUc7QUFDckIsY0FBTSxVQUFrQixnQkFBUSxJQUFJO0FBQ3BDLGNBQU0sYUFBYSxTQUFTLFVBQU0saUJBQUFILFVBQVcsSUFBSSxJQUFJO0FBQ3JELFlBQUksS0FBSyxJQUFJO0FBQ1Q7QUFDSixpQkFBUyxNQUFNLEtBQUssV0FBVyxHQUFHLFdBQVcsT0FBTyxZQUFZLE9BQU8sUUFBUSxJQUFJLFVBQVU7QUFDN0YsWUFBSSxLQUFLLElBQUk7QUFDVDtBQUVKLFlBQUksWUFBWSxjQUFjLGVBQWUsUUFBVztBQUNwRCxlQUFLLElBQUksY0FBYyxJQUFJLFNBQVMsVUFBVTtBQUFBLFFBQ2xEO0FBQUEsTUFDSixXQUNTLE1BQU0sZUFBZSxHQUFHO0FBQzdCLGNBQU0sYUFBYSxTQUFTLFVBQU0saUJBQUFBLFVBQVcsSUFBSSxJQUFJO0FBQ3JELFlBQUksS0FBSyxJQUFJO0FBQ1Q7QUFDSixjQUFNLFNBQWlCLGdCQUFRLEdBQUcsU0FBUztBQUMzQyxhQUFLLElBQUksZUFBZSxNQUFNLEVBQUUsSUFBSSxHQUFHLFNBQVM7QUFDaEQsYUFBSyxJQUFJLE1BQU0sR0FBRyxLQUFLLEdBQUcsV0FBVyxLQUFLO0FBQzFDLGlCQUFTLE1BQU0sS0FBSyxXQUFXLFFBQVEsT0FBTyxZQUFZLE9BQU8sTUFBTSxJQUFJLFVBQVU7QUFDckYsWUFBSSxLQUFLLElBQUk7QUFDVDtBQUVKLFlBQUksZUFBZSxRQUFXO0FBQzFCLGVBQUssSUFBSSxjQUFjLElBQVksZ0JBQVEsSUFBSSxHQUFHLFVBQVU7QUFBQSxRQUNoRTtBQUFBLE1BQ0osT0FDSztBQUNELGlCQUFTLEtBQUssWUFBWSxHQUFHLFdBQVcsT0FBTyxVQUFVO0FBQUEsTUFDN0Q7QUFDQSxZQUFNO0FBQ04sVUFBSTtBQUNBLGFBQUssSUFBSSxlQUFlLE1BQU0sTUFBTTtBQUN4QyxhQUFPO0FBQUEsSUFDWCxTQUNPLE9BQU87QUFDVixVQUFJLEtBQUssSUFBSSxhQUFhLEtBQUssR0FBRztBQUM5QixjQUFNO0FBQ04sZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUNKOzs7QUY3bUJBLElBQU0sUUFBUTtBQUNkLElBQU0sY0FBYztBQUNwQixJQUFNLFVBQVU7QUFDaEIsSUFBTSxXQUFXO0FBQ2pCLElBQU0sY0FBYztBQUNwQixJQUFNLGdCQUFnQjtBQUN0QixJQUFNLGtCQUFrQjtBQUN4QixJQUFNLFNBQVM7QUFDZixJQUFNLGNBQWM7QUFDcEIsU0FBUyxPQUFPLE1BQU07QUFDbEIsU0FBTyxNQUFNLFFBQVEsSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJO0FBQzdDO0FBQ0EsSUFBTSxrQkFBa0IsQ0FBQyxZQUFZLE9BQU8sWUFBWSxZQUFZLFlBQVksUUFBUSxFQUFFLG1CQUFtQjtBQUM3RyxTQUFTLGNBQWMsU0FBUztBQUM1QixNQUFJLE9BQU8sWUFBWTtBQUNuQixXQUFPO0FBQ1gsTUFBSSxPQUFPLFlBQVk7QUFDbkIsV0FBTyxDQUFDLFdBQVcsWUFBWTtBQUNuQyxNQUFJLG1CQUFtQjtBQUNuQixXQUFPLENBQUMsV0FBVyxRQUFRLEtBQUssTUFBTTtBQUMxQyxNQUFJLE9BQU8sWUFBWSxZQUFZLFlBQVksTUFBTTtBQUNqRCxXQUFPLENBQUMsV0FBVztBQUNmLFVBQUksUUFBUSxTQUFTO0FBQ2pCLGVBQU87QUFDWCxVQUFJLFFBQVEsV0FBVztBQUNuQixjQUFNSSxZQUFtQixrQkFBUyxRQUFRLE1BQU0sTUFBTTtBQUN0RCxZQUFJLENBQUNBLFdBQVU7QUFDWCxpQkFBTztBQUFBLFFBQ1g7QUFDQSxlQUFPLENBQUNBLFVBQVMsV0FBVyxJQUFJLEtBQUssQ0FBUyxvQkFBV0EsU0FBUTtBQUFBLE1BQ3JFO0FBQ0EsYUFBTztBQUFBLElBQ1g7QUFBQSxFQUNKO0FBQ0EsU0FBTyxNQUFNO0FBQ2pCO0FBQ0EsU0FBUyxjQUFjLE1BQU07QUFDekIsTUFBSSxPQUFPLFNBQVM7QUFDaEIsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQ3JDLFNBQWUsbUJBQVUsSUFBSTtBQUM3QixTQUFPLEtBQUssUUFBUSxPQUFPLEdBQUc7QUFDOUIsTUFBSSxVQUFVO0FBQ2QsTUFBSSxLQUFLLFdBQVcsSUFBSTtBQUNwQixjQUFVO0FBQ2QsUUFBTUMsbUJBQWtCO0FBQ3hCLFNBQU8sS0FBSyxNQUFNQSxnQkFBZTtBQUM3QixXQUFPLEtBQUssUUFBUUEsa0JBQWlCLEdBQUc7QUFDNUMsTUFBSTtBQUNBLFdBQU8sTUFBTTtBQUNqQixTQUFPO0FBQ1g7QUFDQSxTQUFTLGNBQWMsVUFBVSxZQUFZLE9BQU87QUFDaEQsUUFBTSxPQUFPLGNBQWMsVUFBVTtBQUNyQyxXQUFTLFFBQVEsR0FBRyxRQUFRLFNBQVMsUUFBUSxTQUFTO0FBQ2xELFVBQU0sVUFBVSxTQUFTLEtBQUs7QUFDOUIsUUFBSSxRQUFRLE1BQU0sS0FBSyxHQUFHO0FBQ3RCLGFBQU87QUFBQSxJQUNYO0FBQUEsRUFDSjtBQUNBLFNBQU87QUFDWDtBQUNBLFNBQVMsU0FBUyxVQUFVLFlBQVk7QUFDcEMsTUFBSSxZQUFZLE1BQU07QUFDbEIsVUFBTSxJQUFJLFVBQVUsa0NBQWtDO0FBQUEsRUFDMUQ7QUFFQSxRQUFNLGdCQUFnQixPQUFPLFFBQVE7QUFDckMsUUFBTSxXQUFXLGNBQWMsSUFBSSxDQUFDLFlBQVksY0FBYyxPQUFPLENBQUM7QUFDdEUsTUFBSSxjQUFjLE1BQU07QUFDcEIsV0FBTyxDQUFDQyxhQUFZLFVBQVU7QUFDMUIsYUFBTyxjQUFjLFVBQVVBLGFBQVksS0FBSztBQUFBLElBQ3BEO0FBQUEsRUFDSjtBQUNBLFNBQU8sY0FBYyxVQUFVLFVBQVU7QUFDN0M7QUFDQSxJQUFNLGFBQWEsQ0FBQyxXQUFXO0FBQzNCLFFBQU0sUUFBUSxPQUFPLE1BQU0sRUFBRSxLQUFLO0FBQ2xDLE1BQUksQ0FBQyxNQUFNLE1BQU0sQ0FBQyxNQUFNLE9BQU8sTUFBTSxXQUFXLEdBQUc7QUFDL0MsVUFBTSxJQUFJLFVBQVUsc0NBQXNDLEtBQUssRUFBRTtBQUFBLEVBQ3JFO0FBQ0EsU0FBTyxNQUFNLElBQUksbUJBQW1CO0FBQ3hDO0FBR0EsSUFBTSxTQUFTLENBQUMsV0FBVztBQUN2QixNQUFJLE1BQU0sT0FBTyxRQUFRLGVBQWUsS0FBSztBQUM3QyxNQUFJLFVBQVU7QUFDZCxNQUFJLElBQUksV0FBVyxXQUFXLEdBQUc7QUFDN0IsY0FBVTtBQUFBLEVBQ2Q7QUFDQSxTQUFPLElBQUksTUFBTSxlQUFlLEdBQUc7QUFDL0IsVUFBTSxJQUFJLFFBQVEsaUJBQWlCLEtBQUs7QUFBQSxFQUM1QztBQUNBLE1BQUksU0FBUztBQUNULFVBQU0sUUFBUTtBQUFBLEVBQ2xCO0FBQ0EsU0FBTztBQUNYO0FBR0EsSUFBTSxzQkFBc0IsQ0FBQyxTQUFTLE9BQWUsbUJBQVUsT0FBTyxJQUFJLENBQUMsQ0FBQztBQUU1RSxJQUFNLG1CQUFtQixDQUFDLE1BQU0sT0FBTyxDQUFDLFNBQVM7QUFDN0MsTUFBSSxPQUFPLFNBQVMsVUFBVTtBQUMxQixXQUFPLG9CQUE0QixvQkFBVyxJQUFJLElBQUksT0FBZSxjQUFLLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDeEYsT0FDSztBQUNELFdBQU87QUFBQSxFQUNYO0FBQ0o7QUFDQSxJQUFNLGtCQUFrQixDQUFDLE1BQU0sUUFBUTtBQUNuQyxNQUFZLG9CQUFXLElBQUksR0FBRztBQUMxQixXQUFPO0FBQUEsRUFDWDtBQUNBLFNBQWUsY0FBSyxLQUFLLElBQUk7QUFDakM7QUFDQSxJQUFNLFlBQVksT0FBTyxPQUFPLG9CQUFJLElBQUksQ0FBQztBQUl6QyxJQUFNLFdBQU4sTUFBZTtBQUFBLEVBQ1gsWUFBWSxLQUFLLGVBQWU7QUFDNUIsU0FBSyxPQUFPO0FBQ1osU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxRQUFRLG9CQUFJLElBQUk7QUFBQSxFQUN6QjtBQUFBLEVBQ0EsSUFBSSxNQUFNO0FBQ04sVUFBTSxFQUFFLE1BQU0sSUFBSTtBQUNsQixRQUFJLENBQUM7QUFDRDtBQUNKLFFBQUksU0FBUyxXQUFXLFNBQVM7QUFDN0IsWUFBTSxJQUFJLElBQUk7QUFBQSxFQUN0QjtBQUFBLEVBQ0EsTUFBTSxPQUFPLE1BQU07QUFDZixVQUFNLEVBQUUsTUFBTSxJQUFJO0FBQ2xCLFFBQUksQ0FBQztBQUNEO0FBQ0osVUFBTSxPQUFPLElBQUk7QUFDakIsUUFBSSxNQUFNLE9BQU87QUFDYjtBQUNKLFVBQU0sTUFBTSxLQUFLO0FBQ2pCLFFBQUk7QUFDQSxnQkFBTSwwQkFBUSxHQUFHO0FBQUEsSUFDckIsU0FDTyxLQUFLO0FBQ1IsVUFBSSxLQUFLLGdCQUFnQjtBQUNyQixhQUFLLGVBQXVCLGlCQUFRLEdBQUcsR0FBVyxrQkFBUyxHQUFHLENBQUM7QUFBQSxNQUNuRTtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUEsRUFDQSxJQUFJLE1BQU07QUFDTixVQUFNLEVBQUUsTUFBTSxJQUFJO0FBQ2xCLFFBQUksQ0FBQztBQUNEO0FBQ0osV0FBTyxNQUFNLElBQUksSUFBSTtBQUFBLEVBQ3pCO0FBQUEsRUFDQSxjQUFjO0FBQ1YsVUFBTSxFQUFFLE1BQU0sSUFBSTtBQUNsQixRQUFJLENBQUM7QUFDRCxhQUFPLENBQUM7QUFDWixXQUFPLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQzdCO0FBQUEsRUFDQSxVQUFVO0FBQ04sU0FBSyxNQUFNLE1BQU07QUFDakIsU0FBSyxPQUFPO0FBQ1osU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxRQUFRO0FBQ2IsV0FBTyxPQUFPLElBQUk7QUFBQSxFQUN0QjtBQUNKO0FBQ0EsSUFBTSxnQkFBZ0I7QUFDdEIsSUFBTSxnQkFBZ0I7QUFDZixJQUFNLGNBQU4sTUFBa0I7QUFBQSxFQUNyQixZQUFZLE1BQU0sUUFBUSxLQUFLO0FBQzNCLFNBQUssTUFBTTtBQUNYLFVBQU0sWUFBWTtBQUNsQixTQUFLLE9BQU8sT0FBTyxLQUFLLFFBQVEsYUFBYSxFQUFFO0FBQy9DLFNBQUssWUFBWTtBQUNqQixTQUFLLGdCQUF3QixpQkFBUSxTQUFTO0FBQzlDLFNBQUssV0FBVyxDQUFDO0FBQ2pCLFNBQUssU0FBUyxRQUFRLENBQUMsVUFBVTtBQUM3QixVQUFJLE1BQU0sU0FBUztBQUNmLGNBQU0sSUFBSTtBQUFBLElBQ2xCLENBQUM7QUFDRCxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGFBQWEsU0FBUyxnQkFBZ0I7QUFBQSxFQUMvQztBQUFBLEVBQ0EsVUFBVSxPQUFPO0FBQ2IsV0FBZSxjQUFLLEtBQUssV0FBbUIsa0JBQVMsS0FBSyxXQUFXLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDeEY7QUFBQSxFQUNBLFdBQVcsT0FBTztBQUNkLFVBQU0sRUFBRSxNQUFNLElBQUk7QUFDbEIsUUFBSSxTQUFTLE1BQU0sZUFBZTtBQUM5QixhQUFPLEtBQUssVUFBVSxLQUFLO0FBQy9CLFVBQU0sZUFBZSxLQUFLLFVBQVUsS0FBSztBQUV6QyxXQUFPLEtBQUssSUFBSSxhQUFhLGNBQWMsS0FBSyxLQUFLLEtBQUssSUFBSSxvQkFBb0IsS0FBSztBQUFBLEVBQzNGO0FBQUEsRUFDQSxVQUFVLE9BQU87QUFDYixXQUFPLEtBQUssSUFBSSxhQUFhLEtBQUssVUFBVSxLQUFLLEdBQUcsTUFBTSxLQUFLO0FBQUEsRUFDbkU7QUFDSjtBQVNPLElBQU0sWUFBTixjQUF3QiwyQkFBYTtBQUFBO0FBQUEsRUFFeEMsWUFBWSxRQUFRLENBQUMsR0FBRztBQUNwQixVQUFNO0FBQ04sU0FBSyxTQUFTO0FBQ2QsU0FBSyxXQUFXLG9CQUFJLElBQUk7QUFDeEIsU0FBSyxnQkFBZ0Isb0JBQUksSUFBSTtBQUM3QixTQUFLLGFBQWEsb0JBQUksSUFBSTtBQUMxQixTQUFLLFdBQVcsb0JBQUksSUFBSTtBQUN4QixTQUFLLGdCQUFnQixvQkFBSSxJQUFJO0FBQzdCLFNBQUssV0FBVyxvQkFBSSxJQUFJO0FBQ3hCLFNBQUssaUJBQWlCLG9CQUFJLElBQUk7QUFDOUIsU0FBSyxrQkFBa0Isb0JBQUksSUFBSTtBQUMvQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFDckIsVUFBTSxNQUFNLE1BQU07QUFDbEIsVUFBTSxVQUFVLEVBQUUsb0JBQW9CLEtBQU0sY0FBYyxJQUFJO0FBQzlELFVBQU0sT0FBTztBQUFBO0FBQUEsTUFFVCxZQUFZO0FBQUEsTUFDWixlQUFlO0FBQUEsTUFDZix3QkFBd0I7QUFBQSxNQUN4QixVQUFVO0FBQUEsTUFDVixnQkFBZ0I7QUFBQSxNQUNoQixnQkFBZ0I7QUFBQSxNQUNoQixZQUFZO0FBQUE7QUFBQSxNQUVaLFFBQVE7QUFBQTtBQUFBLE1BQ1IsR0FBRztBQUFBO0FBQUEsTUFFSCxTQUFTLE1BQU0sVUFBVSxPQUFPLE1BQU0sT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDMUQsa0JBQWtCLFFBQVEsT0FBTyxVQUFVLE9BQU8sUUFBUSxXQUFXLEVBQUUsR0FBRyxTQUFTLEdBQUcsSUFBSSxJQUFJO0FBQUEsSUFDbEc7QUFFQSxRQUFJO0FBQ0EsV0FBSyxhQUFhO0FBRXRCLFFBQUksS0FBSyxXQUFXO0FBQ2hCLFdBQUssU0FBUyxDQUFDLEtBQUs7QUFJeEIsVUFBTSxVQUFVLFFBQVEsSUFBSTtBQUM1QixRQUFJLFlBQVksUUFBVztBQUN2QixZQUFNLFdBQVcsUUFBUSxZQUFZO0FBQ3JDLFVBQUksYUFBYSxXQUFXLGFBQWE7QUFDckMsYUFBSyxhQUFhO0FBQUEsZUFDYixhQUFhLFVBQVUsYUFBYTtBQUN6QyxhQUFLLGFBQWE7QUFBQTtBQUVsQixhQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsSUFDNUI7QUFDQSxVQUFNLGNBQWMsUUFBUSxJQUFJO0FBQ2hDLFFBQUk7QUFDQSxXQUFLLFdBQVcsT0FBTyxTQUFTLGFBQWEsRUFBRTtBQUVuRCxRQUFJLGFBQWE7QUFDakIsU0FBSyxhQUFhLE1BQU07QUFDcEI7QUFDQSxVQUFJLGNBQWMsS0FBSyxhQUFhO0FBQ2hDLGFBQUssYUFBYTtBQUNsQixhQUFLLGdCQUFnQjtBQUVyQixnQkFBUSxTQUFTLE1BQU0sS0FBSyxLQUFLLE9BQUcsS0FBSyxDQUFDO0FBQUEsTUFDOUM7QUFBQSxJQUNKO0FBQ0EsU0FBSyxXQUFXLElBQUksU0FBUyxLQUFLLEtBQUssT0FBRyxLQUFLLEdBQUcsSUFBSTtBQUN0RCxTQUFLLGVBQWUsS0FBSyxRQUFRLEtBQUssSUFBSTtBQUMxQyxTQUFLLFVBQVU7QUFDZixTQUFLLGlCQUFpQixJQUFJLGNBQWMsSUFBSTtBQUU1QyxXQUFPLE9BQU8sSUFBSTtBQUFBLEVBQ3RCO0FBQUEsRUFDQSxnQkFBZ0IsU0FBUztBQUNyQixRQUFJLGdCQUFnQixPQUFPLEdBQUc7QUFFMUIsaUJBQVcsV0FBVyxLQUFLLGVBQWU7QUFDdEMsWUFBSSxnQkFBZ0IsT0FBTyxLQUN2QixRQUFRLFNBQVMsUUFBUSxRQUN6QixRQUFRLGNBQWMsUUFBUSxXQUFXO0FBQ3pDO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQ0EsU0FBSyxjQUFjLElBQUksT0FBTztBQUFBLEVBQ2xDO0FBQUEsRUFDQSxtQkFBbUIsU0FBUztBQUN4QixTQUFLLGNBQWMsT0FBTyxPQUFPO0FBRWpDLFFBQUksT0FBTyxZQUFZLFVBQVU7QUFDN0IsaUJBQVcsV0FBVyxLQUFLLGVBQWU7QUFJdEMsWUFBSSxnQkFBZ0IsT0FBTyxLQUFLLFFBQVEsU0FBUyxTQUFTO0FBQ3RELGVBQUssY0FBYyxPQUFPLE9BQU87QUFBQSxRQUNyQztBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLElBQUksUUFBUSxVQUFVLFdBQVc7QUFDN0IsVUFBTSxFQUFFLElBQUksSUFBSSxLQUFLO0FBQ3JCLFNBQUssU0FBUztBQUNkLFNBQUssZ0JBQWdCO0FBQ3JCLFFBQUksUUFBUSxXQUFXLE1BQU07QUFDN0IsUUFBSSxLQUFLO0FBQ0wsY0FBUSxNQUFNLElBQUksQ0FBQyxTQUFTO0FBQ3hCLGNBQU0sVUFBVSxnQkFBZ0IsTUFBTSxHQUFHO0FBRXpDLGVBQU87QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNMO0FBQ0EsVUFBTSxRQUFRLENBQUMsU0FBUztBQUNwQixXQUFLLG1CQUFtQixJQUFJO0FBQUEsSUFDaEMsQ0FBQztBQUNELFNBQUssZUFBZTtBQUNwQixRQUFJLENBQUMsS0FBSztBQUNOLFdBQUssY0FBYztBQUN2QixTQUFLLGVBQWUsTUFBTTtBQUMxQixZQUFRLElBQUksTUFBTSxJQUFJLE9BQU8sU0FBUztBQUNsQyxZQUFNLE1BQU0sTUFBTSxLQUFLLGVBQWUsYUFBYSxNQUFNLENBQUMsV0FBVyxRQUFXLEdBQUcsUUFBUTtBQUMzRixVQUFJO0FBQ0EsYUFBSyxXQUFXO0FBQ3BCLGFBQU87QUFBQSxJQUNYLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxZQUFZO0FBQ2xCLFVBQUksS0FBSztBQUNMO0FBQ0osY0FBUSxRQUFRLENBQUMsU0FBUztBQUN0QixZQUFJO0FBQ0EsZUFBSyxJQUFZLGlCQUFRLElBQUksR0FBVyxrQkFBUyxZQUFZLElBQUksQ0FBQztBQUFBLE1BQzFFLENBQUM7QUFBQSxJQUNMLENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSUEsUUFBUSxRQUFRO0FBQ1osUUFBSSxLQUFLO0FBQ0wsYUFBTztBQUNYLFVBQU0sUUFBUSxXQUFXLE1BQU07QUFDL0IsVUFBTSxFQUFFLElBQUksSUFBSSxLQUFLO0FBQ3JCLFVBQU0sUUFBUSxDQUFDLFNBQVM7QUFFcEIsVUFBSSxDQUFTLG9CQUFXLElBQUksS0FBSyxDQUFDLEtBQUssU0FBUyxJQUFJLElBQUksR0FBRztBQUN2RCxZQUFJO0FBQ0EsaUJBQWUsY0FBSyxLQUFLLElBQUk7QUFDakMsZUFBZSxpQkFBUSxJQUFJO0FBQUEsTUFDL0I7QUFDQSxXQUFLLFdBQVcsSUFBSTtBQUNwQixXQUFLLGdCQUFnQixJQUFJO0FBQ3pCLFVBQUksS0FBSyxTQUFTLElBQUksSUFBSSxHQUFHO0FBQ3pCLGFBQUssZ0JBQWdCO0FBQUEsVUFDakI7QUFBQSxVQUNBLFdBQVc7QUFBQSxRQUNmLENBQUM7QUFBQSxNQUNMO0FBR0EsV0FBSyxlQUFlO0FBQUEsSUFDeEIsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNYO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJQSxRQUFRO0FBQ0osUUFBSSxLQUFLLGVBQWU7QUFDcEIsYUFBTyxLQUFLO0FBQUEsSUFDaEI7QUFDQSxTQUFLLFNBQVM7QUFFZCxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLFVBQVUsQ0FBQztBQUNqQixTQUFLLFNBQVMsUUFBUSxDQUFDLGVBQWUsV0FBVyxRQUFRLENBQUMsV0FBVztBQUNqRSxZQUFNLFVBQVUsT0FBTztBQUN2QixVQUFJLG1CQUFtQjtBQUNuQixnQkFBUSxLQUFLLE9BQU87QUFBQSxJQUM1QixDQUFDLENBQUM7QUFDRixTQUFLLFNBQVMsUUFBUSxDQUFDLFdBQVcsT0FBTyxRQUFRLENBQUM7QUFDbEQsU0FBSyxlQUFlO0FBQ3BCLFNBQUssY0FBYztBQUNuQixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLFNBQVMsUUFBUSxDQUFDLFdBQVcsT0FBTyxRQUFRLENBQUM7QUFDbEQsU0FBSyxTQUFTLE1BQU07QUFDcEIsU0FBSyxTQUFTLE1BQU07QUFDcEIsU0FBSyxTQUFTLE1BQU07QUFDcEIsU0FBSyxjQUFjLE1BQU07QUFDekIsU0FBSyxXQUFXLE1BQU07QUFDdEIsU0FBSyxnQkFBZ0IsUUFBUSxTQUN2QixRQUFRLElBQUksT0FBTyxFQUFFLEtBQUssTUFBTSxNQUFTLElBQ3pDLFFBQVEsUUFBUTtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNoQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxhQUFhO0FBQ1QsVUFBTSxZQUFZLENBQUM7QUFDbkIsU0FBSyxTQUFTLFFBQVEsQ0FBQyxPQUFPLFFBQVE7QUFDbEMsWUFBTSxNQUFNLEtBQUssUUFBUSxNQUFjLGtCQUFTLEtBQUssUUFBUSxLQUFLLEdBQUcsSUFBSTtBQUN6RSxZQUFNLFFBQVEsT0FBTztBQUNyQixnQkFBVSxLQUFLLElBQUksTUFBTSxZQUFZLEVBQUUsS0FBSztBQUFBLElBQ2hELENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDWDtBQUFBLEVBQ0EsWUFBWSxPQUFPLE1BQU07QUFDckIsU0FBSyxLQUFLLE9BQU8sR0FBRyxJQUFJO0FBQ3hCLFFBQUksVUFBVSxPQUFHO0FBQ2IsV0FBSyxLQUFLLE9BQUcsS0FBSyxPQUFPLEdBQUcsSUFBSTtBQUFBLEVBQ3hDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdBLE1BQU0sTUFBTSxPQUFPLE1BQU0sT0FBTztBQUM1QixRQUFJLEtBQUs7QUFDTDtBQUNKLFVBQU0sT0FBTyxLQUFLO0FBQ2xCLFFBQUk7QUFDQSxhQUFlLG1CQUFVLElBQUk7QUFDakMsUUFBSSxLQUFLO0FBQ0wsYUFBZSxrQkFBUyxLQUFLLEtBQUssSUFBSTtBQUMxQyxVQUFNLE9BQU8sQ0FBQyxJQUFJO0FBQ2xCLFFBQUksU0FBUztBQUNULFdBQUssS0FBSyxLQUFLO0FBQ25CLFVBQU0sTUFBTSxLQUFLO0FBQ2pCLFFBQUk7QUFDSixRQUFJLFFBQVEsS0FBSyxLQUFLLGVBQWUsSUFBSSxJQUFJLElBQUk7QUFDN0MsU0FBRyxhQUFhLG9CQUFJLEtBQUs7QUFDekIsYUFBTztBQUFBLElBQ1g7QUFDQSxRQUFJLEtBQUssUUFBUTtBQUNiLFVBQUksVUFBVSxPQUFHLFFBQVE7QUFDckIsYUFBSyxnQkFBZ0IsSUFBSSxNQUFNLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztBQUMvQyxtQkFBVyxNQUFNO0FBQ2IsZUFBSyxnQkFBZ0IsUUFBUSxDQUFDLE9BQU9DLFVBQVM7QUFDMUMsaUJBQUssS0FBSyxHQUFHLEtBQUs7QUFDbEIsaUJBQUssS0FBSyxPQUFHLEtBQUssR0FBRyxLQUFLO0FBQzFCLGlCQUFLLGdCQUFnQixPQUFPQSxLQUFJO0FBQUEsVUFDcEMsQ0FBQztBQUFBLFFBQ0wsR0FBRyxPQUFPLEtBQUssV0FBVyxXQUFXLEtBQUssU0FBUyxHQUFHO0FBQ3RELGVBQU87QUFBQSxNQUNYO0FBQ0EsVUFBSSxVQUFVLE9BQUcsT0FBTyxLQUFLLGdCQUFnQixJQUFJLElBQUksR0FBRztBQUNwRCxnQkFBUSxPQUFHO0FBQ1gsYUFBSyxnQkFBZ0IsT0FBTyxJQUFJO0FBQUEsTUFDcEM7QUFBQSxJQUNKO0FBQ0EsUUFBSSxRQUFRLFVBQVUsT0FBRyxPQUFPLFVBQVUsT0FBRyxXQUFXLEtBQUssZUFBZTtBQUN4RSxZQUFNLFVBQVUsQ0FBQyxLQUFLQyxXQUFVO0FBQzVCLFlBQUksS0FBSztBQUNMLGtCQUFRLE9BQUc7QUFDWCxlQUFLLENBQUMsSUFBSTtBQUNWLGVBQUssWUFBWSxPQUFPLElBQUk7QUFBQSxRQUNoQyxXQUNTQSxRQUFPO0FBRVosY0FBSSxLQUFLLFNBQVMsR0FBRztBQUNqQixpQkFBSyxDQUFDLElBQUlBO0FBQUEsVUFDZCxPQUNLO0FBQ0QsaUJBQUssS0FBS0EsTUFBSztBQUFBLFVBQ25CO0FBQ0EsZUFBSyxZQUFZLE9BQU8sSUFBSTtBQUFBLFFBQ2hDO0FBQUEsTUFDSjtBQUNBLFdBQUssa0JBQWtCLE1BQU0sSUFBSSxvQkFBb0IsT0FBTyxPQUFPO0FBQ25FLGFBQU87QUFBQSxJQUNYO0FBQ0EsUUFBSSxVQUFVLE9BQUcsUUFBUTtBQUNyQixZQUFNLGNBQWMsQ0FBQyxLQUFLLFVBQVUsT0FBRyxRQUFRLE1BQU0sRUFBRTtBQUN2RCxVQUFJO0FBQ0EsZUFBTztBQUFBLElBQ2Y7QUFDQSxRQUFJLEtBQUssY0FDTCxVQUFVLFdBQ1QsVUFBVSxPQUFHLE9BQU8sVUFBVSxPQUFHLFdBQVcsVUFBVSxPQUFHLFNBQVM7QUFDbkUsWUFBTSxXQUFXLEtBQUssTUFBYyxjQUFLLEtBQUssS0FBSyxJQUFJLElBQUk7QUFDM0QsVUFBSUE7QUFDSixVQUFJO0FBQ0EsUUFBQUEsU0FBUSxVQUFNLHVCQUFLLFFBQVE7QUFBQSxNQUMvQixTQUNPLEtBQUs7QUFBQSxNQUVaO0FBRUEsVUFBSSxDQUFDQSxVQUFTLEtBQUs7QUFDZjtBQUNKLFdBQUssS0FBS0EsTUFBSztBQUFBLElBQ25CO0FBQ0EsU0FBSyxZQUFZLE9BQU8sSUFBSTtBQUM1QixXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxhQUFhLE9BQU87QUFDaEIsVUFBTSxPQUFPLFNBQVMsTUFBTTtBQUM1QixRQUFJLFNBQ0EsU0FBUyxZQUNULFNBQVMsY0FDUixDQUFDLEtBQUssUUFBUSwwQkFBMkIsU0FBUyxXQUFXLFNBQVMsV0FBWTtBQUNuRixXQUFLLEtBQUssT0FBRyxPQUFPLEtBQUs7QUFBQSxJQUM3QjtBQUNBLFdBQU8sU0FBUyxLQUFLO0FBQUEsRUFDekI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsVUFBVSxZQUFZLE1BQU0sU0FBUztBQUNqQyxRQUFJLENBQUMsS0FBSyxXQUFXLElBQUksVUFBVSxHQUFHO0FBQ2xDLFdBQUssV0FBVyxJQUFJLFlBQVksb0JBQUksSUFBSSxDQUFDO0FBQUEsSUFDN0M7QUFDQSxVQUFNLFNBQVMsS0FBSyxXQUFXLElBQUksVUFBVTtBQUM3QyxRQUFJLENBQUM7QUFDRCxZQUFNLElBQUksTUFBTSxrQkFBa0I7QUFDdEMsVUFBTSxhQUFhLE9BQU8sSUFBSSxJQUFJO0FBQ2xDLFFBQUksWUFBWTtBQUNaLGlCQUFXO0FBQ1gsYUFBTztBQUFBLElBQ1g7QUFFQSxRQUFJO0FBQ0osVUFBTSxRQUFRLE1BQU07QUFDaEIsWUFBTSxPQUFPLE9BQU8sSUFBSSxJQUFJO0FBQzVCLFlBQU0sUUFBUSxPQUFPLEtBQUssUUFBUTtBQUNsQyxhQUFPLE9BQU8sSUFBSTtBQUNsQixtQkFBYSxhQUFhO0FBQzFCLFVBQUk7QUFDQSxxQkFBYSxLQUFLLGFBQWE7QUFDbkMsYUFBTztBQUFBLElBQ1g7QUFDQSxvQkFBZ0IsV0FBVyxPQUFPLE9BQU87QUFDekMsVUFBTSxNQUFNLEVBQUUsZUFBZSxPQUFPLE9BQU8sRUFBRTtBQUM3QyxXQUFPLElBQUksTUFBTSxHQUFHO0FBQ3BCLFdBQU87QUFBQSxFQUNYO0FBQUEsRUFDQSxrQkFBa0I7QUFDZCxXQUFPLEtBQUs7QUFBQSxFQUNoQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLGtCQUFrQixNQUFNLFdBQVcsT0FBTyxTQUFTO0FBQy9DLFVBQU0sTUFBTSxLQUFLLFFBQVE7QUFDekIsUUFBSSxPQUFPLFFBQVE7QUFDZjtBQUNKLFVBQU0sZUFBZSxJQUFJO0FBQ3pCLFFBQUk7QUFDSixRQUFJLFdBQVc7QUFDZixRQUFJLEtBQUssUUFBUSxPQUFPLENBQVMsb0JBQVcsSUFBSSxHQUFHO0FBQy9DLGlCQUFtQixjQUFLLEtBQUssUUFBUSxLQUFLLElBQUk7QUFBQSxJQUNsRDtBQUNBLFVBQU0sTUFBTSxvQkFBSSxLQUFLO0FBQ3JCLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLGFBQVMsbUJBQW1CLFVBQVU7QUFDbEMscUJBQUFDLE1BQU8sVUFBVSxDQUFDLEtBQUssWUFBWTtBQUMvQixZQUFJLE9BQU8sQ0FBQyxPQUFPLElBQUksSUFBSSxHQUFHO0FBQzFCLGNBQUksT0FBTyxJQUFJLFNBQVM7QUFDcEIsb0JBQVEsR0FBRztBQUNmO0FBQUEsUUFDSjtBQUNBLGNBQU1DLE9BQU0sT0FBTyxvQkFBSSxLQUFLLENBQUM7QUFDN0IsWUFBSSxZQUFZLFFBQVEsU0FBUyxTQUFTLE1BQU07QUFDNUMsaUJBQU8sSUFBSSxJQUFJLEVBQUUsYUFBYUE7QUFBQSxRQUNsQztBQUNBLGNBQU0sS0FBSyxPQUFPLElBQUksSUFBSTtBQUMxQixjQUFNLEtBQUtBLE9BQU0sR0FBRztBQUNwQixZQUFJLE1BQU0sV0FBVztBQUNqQixpQkFBTyxPQUFPLElBQUk7QUFDbEIsa0JBQVEsUUFBVyxPQUFPO0FBQUEsUUFDOUIsT0FDSztBQUNELDJCQUFpQixXQUFXLG9CQUFvQixjQUFjLE9BQU87QUFBQSxRQUN6RTtBQUFBLE1BQ0osQ0FBQztBQUFBLElBQ0w7QUFDQSxRQUFJLENBQUMsT0FBTyxJQUFJLElBQUksR0FBRztBQUNuQixhQUFPLElBQUksTUFBTTtBQUFBLFFBQ2IsWUFBWTtBQUFBLFFBQ1osWUFBWSxNQUFNO0FBQ2QsaUJBQU8sT0FBTyxJQUFJO0FBQ2xCLHVCQUFhLGNBQWM7QUFDM0IsaUJBQU87QUFBQSxRQUNYO0FBQUEsTUFDSixDQUFDO0FBQ0QsdUJBQWlCLFdBQVcsb0JBQW9CLFlBQVk7QUFBQSxJQUNoRTtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUlBLFdBQVcsTUFBTSxPQUFPO0FBQ3BCLFFBQUksS0FBSyxRQUFRLFVBQVUsT0FBTyxLQUFLLElBQUk7QUFDdkMsYUFBTztBQUNYLFFBQUksQ0FBQyxLQUFLLGNBQWM7QUFDcEIsWUFBTSxFQUFFLElBQUksSUFBSSxLQUFLO0FBQ3JCLFlBQU0sTUFBTSxLQUFLLFFBQVE7QUFDekIsWUFBTSxXQUFXLE9BQU8sQ0FBQyxHQUFHLElBQUksaUJBQWlCLEdBQUcsQ0FBQztBQUNyRCxZQUFNLGVBQWUsQ0FBQyxHQUFHLEtBQUssYUFBYTtBQUMzQyxZQUFNLE9BQU8sQ0FBQyxHQUFHLGFBQWEsSUFBSSxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsR0FBRyxPQUFPO0FBQ3BFLFdBQUssZUFBZSxTQUFTLE1BQU0sTUFBUztBQUFBLElBQ2hEO0FBQ0EsV0FBTyxLQUFLLGFBQWEsTUFBTSxLQUFLO0FBQUEsRUFDeEM7QUFBQSxFQUNBLGFBQWEsTUFBTUMsT0FBTTtBQUNyQixXQUFPLENBQUMsS0FBSyxXQUFXLE1BQU1BLEtBQUk7QUFBQSxFQUN0QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxpQkFBaUIsTUFBTTtBQUNuQixXQUFPLElBQUksWUFBWSxNQUFNLEtBQUssUUFBUSxnQkFBZ0IsSUFBSTtBQUFBLEVBQ2xFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxlQUFlLFdBQVc7QUFDdEIsVUFBTSxNQUFjLGlCQUFRLFNBQVM7QUFDckMsUUFBSSxDQUFDLEtBQUssU0FBUyxJQUFJLEdBQUc7QUFDdEIsV0FBSyxTQUFTLElBQUksS0FBSyxJQUFJLFNBQVMsS0FBSyxLQUFLLFlBQVksQ0FBQztBQUMvRCxXQUFPLEtBQUssU0FBUyxJQUFJLEdBQUc7QUFBQSxFQUNoQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLG9CQUFvQixPQUFPO0FBQ3ZCLFFBQUksS0FBSyxRQUFRO0FBQ2IsYUFBTztBQUNYLFdBQU8sUUFBUSxPQUFPLE1BQU0sSUFBSSxJQUFJLEdBQUs7QUFBQSxFQUM3QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxRQUFRLFdBQVcsTUFBTSxhQUFhO0FBSWxDLFVBQU0sT0FBZSxjQUFLLFdBQVcsSUFBSTtBQUN6QyxVQUFNLFdBQW1CLGlCQUFRLElBQUk7QUFDckMsa0JBQ0ksZUFBZSxPQUFPLGNBQWMsS0FBSyxTQUFTLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxJQUFJLFFBQVE7QUFHN0YsUUFBSSxDQUFDLEtBQUssVUFBVSxVQUFVLE1BQU0sR0FBRztBQUNuQztBQUVKLFFBQUksQ0FBQyxlQUFlLEtBQUssU0FBUyxTQUFTLEdBQUc7QUFDMUMsV0FBSyxJQUFJLFdBQVcsTUFBTSxJQUFJO0FBQUEsSUFDbEM7QUFHQSxVQUFNLEtBQUssS0FBSyxlQUFlLElBQUk7QUFDbkMsVUFBTSwwQkFBMEIsR0FBRyxZQUFZO0FBRS9DLDRCQUF3QixRQUFRLENBQUMsV0FBVyxLQUFLLFFBQVEsTUFBTSxNQUFNLENBQUM7QUFFdEUsVUFBTSxTQUFTLEtBQUssZUFBZSxTQUFTO0FBQzVDLFVBQU0sYUFBYSxPQUFPLElBQUksSUFBSTtBQUNsQyxXQUFPLE9BQU8sSUFBSTtBQU1sQixRQUFJLEtBQUssY0FBYyxJQUFJLFFBQVEsR0FBRztBQUNsQyxXQUFLLGNBQWMsT0FBTyxRQUFRO0FBQUEsSUFDdEM7QUFFQSxRQUFJLFVBQVU7QUFDZCxRQUFJLEtBQUssUUFBUTtBQUNiLGdCQUFrQixrQkFBUyxLQUFLLFFBQVEsS0FBSyxJQUFJO0FBQ3JELFFBQUksS0FBSyxRQUFRLG9CQUFvQixLQUFLLGVBQWUsSUFBSSxPQUFPLEdBQUc7QUFDbkUsWUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU8sRUFBRSxXQUFXO0FBQzFELFVBQUksVUFBVSxPQUFHO0FBQ2I7QUFBQSxJQUNSO0FBR0EsU0FBSyxTQUFTLE9BQU8sSUFBSTtBQUN6QixTQUFLLFNBQVMsT0FBTyxRQUFRO0FBQzdCLFVBQU0sWUFBWSxjQUFjLE9BQUcsYUFBYSxPQUFHO0FBQ25ELFFBQUksY0FBYyxDQUFDLEtBQUssV0FBVyxJQUFJO0FBQ25DLFdBQUssTUFBTSxXQUFXLElBQUk7QUFFOUIsU0FBSyxXQUFXLElBQUk7QUFBQSxFQUN4QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSUEsV0FBVyxNQUFNO0FBQ2IsU0FBSyxXQUFXLElBQUk7QUFDcEIsVUFBTSxNQUFjLGlCQUFRLElBQUk7QUFDaEMsU0FBSyxlQUFlLEdBQUcsRUFBRSxPQUFlLGtCQUFTLElBQUksQ0FBQztBQUFBLEVBQzFEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJQSxXQUFXLE1BQU07QUFDYixVQUFNLFVBQVUsS0FBSyxTQUFTLElBQUksSUFBSTtBQUN0QyxRQUFJLENBQUM7QUFDRDtBQUNKLFlBQVEsUUFBUSxDQUFDLFdBQVcsT0FBTyxDQUFDO0FBQ3BDLFNBQUssU0FBUyxPQUFPLElBQUk7QUFBQSxFQUM3QjtBQUFBLEVBQ0EsZUFBZSxNQUFNLFFBQVE7QUFDekIsUUFBSSxDQUFDO0FBQ0Q7QUFDSixRQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksSUFBSTtBQUNqQyxRQUFJLENBQUMsTUFBTTtBQUNQLGFBQU8sQ0FBQztBQUNSLFdBQUssU0FBUyxJQUFJLE1BQU0sSUFBSTtBQUFBLElBQ2hDO0FBQ0EsU0FBSyxLQUFLLE1BQU07QUFBQSxFQUNwQjtBQUFBLEVBQ0EsVUFBVSxNQUFNLE1BQU07QUFDbEIsUUFBSSxLQUFLO0FBQ0w7QUFDSixVQUFNLFVBQVUsRUFBRSxNQUFNLE9BQUcsS0FBSyxZQUFZLE1BQU0sT0FBTyxNQUFNLEdBQUcsTUFBTSxPQUFPLEVBQUU7QUFDakYsUUFBSSxTQUFTLFNBQVMsTUFBTSxPQUFPO0FBQ25DLFNBQUssU0FBUyxJQUFJLE1BQU07QUFDeEIsV0FBTyxLQUFLLFdBQVcsTUFBTTtBQUN6QixlQUFTO0FBQUEsSUFDYixDQUFDO0FBQ0QsV0FBTyxLQUFLLFNBQVMsTUFBTTtBQUN2QixVQUFJLFFBQVE7QUFDUixhQUFLLFNBQVMsT0FBTyxNQUFNO0FBQzNCLGlCQUFTO0FBQUEsTUFDYjtBQUFBLElBQ0osQ0FBQztBQUNELFdBQU87QUFBQSxFQUNYO0FBQ0o7QUFVTyxTQUFTLE1BQU0sT0FBTyxVQUFVLENBQUMsR0FBRztBQUN2QyxRQUFNLFVBQVUsSUFBSSxVQUFVLE9BQU87QUFDckMsVUFBUSxJQUFJLEtBQUs7QUFDakIsU0FBTztBQUNYO0FBQ0EsSUFBTyxjQUFRLEVBQUUsT0FBTyxVQUFVOzs7QUdweEJsQyxxQkFBZ0U7QUFDaEUsSUFBQUMsb0JBQXFCO0FBU3JCLElBQU0sbUJBQW1CLENBQUMsWUFBWSxhQUFhLFdBQVc7QUFFdkQsU0FBUyxlQUFlLFdBQXNDO0FBQ25FLE1BQUksS0FBQywyQkFBVyxTQUFTLEVBQUcsUUFBTyxDQUFDO0FBQ3BDLFFBQU0sTUFBeUIsQ0FBQztBQUNoQyxhQUFXLFlBQVEsNEJBQVksU0FBUyxHQUFHO0FBQ3pDLFVBQU0sVUFBTSx3QkFBSyxXQUFXLElBQUk7QUFDaEMsUUFBSSxLQUFDLHlCQUFTLEdBQUcsRUFBRSxZQUFZLEVBQUc7QUFDbEMsVUFBTSxtQkFBZSx3QkFBSyxLQUFLLGVBQWU7QUFDOUMsUUFBSSxLQUFDLDJCQUFXLFlBQVksRUFBRztBQUMvQixRQUFJO0FBQ0osUUFBSTtBQUNGLGlCQUFXLEtBQUssVUFBTSw2QkFBYSxjQUFjLE1BQU0sQ0FBQztBQUFBLElBQzFELFFBQVE7QUFDTjtBQUFBLElBQ0Y7QUFDQSxRQUFJLENBQUMsZ0JBQWdCLFFBQVEsRUFBRztBQUNoQyxVQUFNLFFBQVEsYUFBYSxLQUFLLFFBQVE7QUFDeEMsUUFBSSxDQUFDLE1BQU87QUFDWixRQUFJLEtBQUssRUFBRSxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQUEsRUFDbkM7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGdCQUFnQixHQUEyQjtBQUNsRCxNQUFJLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLENBQUMsRUFBRSxXQUFZLFFBQU87QUFDNUQsTUFBSSxDQUFDLHFDQUFxQyxLQUFLLEVBQUUsVUFBVSxFQUFHLFFBQU87QUFDckUsTUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLFlBQVksUUFBUSxNQUFNLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRyxRQUFPO0FBQ3ZFLFNBQU87QUFDVDtBQUVBLFNBQVMsYUFBYSxLQUFhLEdBQWlDO0FBQ2xFLE1BQUksRUFBRSxNQUFNO0FBQ1YsVUFBTSxRQUFJLHdCQUFLLEtBQUssRUFBRSxJQUFJO0FBQzFCLGVBQU8sMkJBQVcsQ0FBQyxJQUFJLElBQUk7QUFBQSxFQUM3QjtBQUNBLGFBQVcsS0FBSyxrQkFBa0I7QUFDaEMsVUFBTSxRQUFJLHdCQUFLLEtBQUssQ0FBQztBQUNyQixZQUFJLDJCQUFXLENBQUMsRUFBRyxRQUFPO0FBQUEsRUFDNUI7QUFDQSxTQUFPO0FBQ1Q7OztBQ3JEQSxJQUFBQyxrQkFNTztBQUNQLElBQUFDLG9CQUFxQjtBQVVyQixJQUFNLGlCQUFpQjtBQUVoQixTQUFTLGtCQUFrQixTQUFpQixJQUF5QjtBQUMxRSxRQUFNLFVBQU0sd0JBQUssU0FBUyxTQUFTO0FBQ25DLGlDQUFVLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNsQyxRQUFNLFdBQU8sd0JBQUssS0FBSyxHQUFHLFNBQVMsRUFBRSxDQUFDLE9BQU87QUFFN0MsTUFBSSxPQUFnQyxDQUFDO0FBQ3JDLFVBQUksNEJBQVcsSUFBSSxHQUFHO0FBQ3BCLFFBQUk7QUFDRixhQUFPLEtBQUssVUFBTSw4QkFBYSxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQzlDLFFBQVE7QUFHTixVQUFJO0FBQ0Ysd0NBQVcsTUFBTSxHQUFHLElBQUksWUFBWSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDbEQsUUFBUTtBQUFBLE1BQUM7QUFDVCxhQUFPLENBQUM7QUFBQSxJQUNWO0FBQUEsRUFDRjtBQUVBLE1BQUksUUFBUTtBQUNaLE1BQUksUUFBK0I7QUFFbkMsUUFBTSxnQkFBZ0IsTUFBTTtBQUMxQixZQUFRO0FBQ1IsUUFBSSxNQUFPO0FBQ1gsWUFBUSxXQUFXLE1BQU07QUFDdkIsY0FBUTtBQUNSLFVBQUksTUFBTyxPQUFNO0FBQUEsSUFDbkIsR0FBRyxjQUFjO0FBQUEsRUFDbkI7QUFFQSxRQUFNLFFBQVEsTUFBWTtBQUN4QixRQUFJLENBQUMsTUFBTztBQUNaLFVBQU0sTUFBTSxHQUFHLElBQUk7QUFDbkIsUUFBSTtBQUNGLHlDQUFjLEtBQUssS0FBSyxVQUFVLE1BQU0sTUFBTSxDQUFDLEdBQUcsTUFBTTtBQUN4RCxzQ0FBVyxLQUFLLElBQUk7QUFDcEIsY0FBUTtBQUFBLElBQ1YsU0FBUyxHQUFHO0FBRVYsY0FBUSxNQUFNLDBDQUEwQyxJQUFJLENBQUM7QUFBQSxJQUMvRDtBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQUEsSUFDTCxLQUFLLENBQUksR0FBVyxNQUNsQixPQUFPLFVBQVUsZUFBZSxLQUFLLE1BQU0sQ0FBQyxJQUFLLEtBQUssQ0FBQyxJQUFXO0FBQUEsSUFDcEUsSUFBSSxHQUFHLEdBQUc7QUFDUixXQUFLLENBQUMsSUFBSTtBQUNWLG9CQUFjO0FBQUEsSUFDaEI7QUFBQSxJQUNBLE9BQU8sR0FBRztBQUNSLFVBQUksS0FBSyxNQUFNO0FBQ2IsZUFBTyxLQUFLLENBQUM7QUFDYixzQkFBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLElBQ0EsS0FBSyxPQUFPLEVBQUUsR0FBRyxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLFNBQVMsSUFBb0I7QUFFcEMsU0FBTyxHQUFHLFFBQVEscUJBQXFCLEdBQUc7QUFDNUM7OztBQzNGQSxJQUFBQyxrQkFBbUU7QUFDbkUsSUFBQUMsb0JBQTZDO0FBR3RDLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sa0JBQWtCO0FBb0J4QixTQUFTLHNCQUFzQjtBQUFBLEVBQ3BDO0FBQUEsRUFDQTtBQUNGLEdBR3lCO0FBQ3ZCLFFBQU0sY0FBVSw0QkFBVyxVQUFVLFFBQUksOEJBQWEsWUFBWSxNQUFNLElBQUk7QUFDNUUsUUFBTSxRQUFRLHFCQUFxQixRQUFRLE9BQU87QUFDbEQsUUFBTSxPQUFPLHFCQUFxQixTQUFTLE1BQU0sS0FBSztBQUV0RCxNQUFJLFNBQVMsU0FBUztBQUNwQix1Q0FBVSwyQkFBUSxVQUFVLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNsRCx1Q0FBYyxZQUFZLE1BQU0sTUFBTTtBQUFBLEVBQ3hDO0FBRUEsU0FBTyxFQUFFLEdBQUcsT0FBTyxTQUFTLFNBQVMsUUFBUTtBQUMvQztBQUVPLFNBQVMscUJBQ2QsUUFDQSxlQUFlLElBQ087QUFDdEIsUUFBTSxhQUFhLHFCQUFxQixZQUFZO0FBQ3BELFFBQU0sY0FBYyxtQkFBbUIsVUFBVTtBQUNqRCxRQUFNLFlBQVksSUFBSSxJQUFJLFdBQVc7QUFDckMsUUFBTSxjQUF3QixDQUFDO0FBQy9CLFFBQU0scUJBQStCLENBQUM7QUFDdEMsUUFBTSxVQUFvQixDQUFDO0FBRTNCLGFBQVcsU0FBUyxRQUFRO0FBQzFCLFVBQU0sTUFBTSxtQkFBbUIsTUFBTSxTQUFTLEdBQUc7QUFDakQsUUFBSSxDQUFDLElBQUs7QUFFVixVQUFNLFdBQVcseUJBQXlCLE1BQU0sU0FBUyxFQUFFO0FBQzNELFFBQUksWUFBWSxJQUFJLFFBQVEsR0FBRztBQUM3Qix5QkFBbUIsS0FBSyxRQUFRO0FBQ2hDO0FBQUEsSUFDRjtBQUVBLFVBQU0sYUFBYSxrQkFBa0IsVUFBVSxTQUFTO0FBQ3hELGdCQUFZLEtBQUssVUFBVTtBQUMzQixZQUFRLEtBQUssZ0JBQWdCLFlBQVksTUFBTSxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQzFEO0FBRUEsTUFBSSxRQUFRLFdBQVcsR0FBRztBQUN4QixXQUFPLEVBQUUsT0FBTyxJQUFJLGFBQWEsbUJBQW1CO0FBQUEsRUFDdEQ7QUFFQSxTQUFPO0FBQUEsSUFDTCxPQUFPLENBQUMsbUJBQW1CLEdBQUcsU0FBUyxlQUFlLEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDakU7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUNGO0FBRU8sU0FBUyxxQkFBcUIsYUFBcUIsY0FBOEI7QUFDdEYsTUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVksU0FBUyxpQkFBaUIsRUFBRyxRQUFPO0FBQ3RFLFFBQU0sV0FBVyxxQkFBcUIsV0FBVyxFQUFFLFFBQVE7QUFDM0QsTUFBSSxDQUFDLGFBQWMsUUFBTyxXQUFXLEdBQUcsUUFBUTtBQUFBLElBQU87QUFDdkQsU0FBTyxHQUFHLFdBQVcsR0FBRyxRQUFRO0FBQUE7QUFBQSxJQUFTLEVBQUUsR0FBRyxZQUFZO0FBQUE7QUFDNUQ7QUFFTyxTQUFTLHFCQUFxQixNQUFzQjtBQUN6RCxRQUFNLFVBQVUsSUFBSTtBQUFBLElBQ2xCLE9BQU8sYUFBYSxpQkFBaUIsQ0FBQyxhQUFhLGFBQWEsZUFBZSxDQUFDO0FBQUEsSUFDaEY7QUFBQSxFQUNGO0FBQ0EsU0FBTyxLQUFLLFFBQVEsU0FBUyxJQUFJLEVBQUUsUUFBUSxXQUFXLE1BQU07QUFDOUQ7QUFFTyxTQUFTLHlCQUF5QixJQUFvQjtBQUMzRCxRQUFNLG1CQUFtQixHQUFHLFFBQVEsa0JBQWtCLEVBQUU7QUFDeEQsUUFBTSxPQUFPLGlCQUNWLFFBQVEsb0JBQW9CLEdBQUcsRUFDL0IsUUFBUSxZQUFZLEVBQUUsRUFDdEIsWUFBWTtBQUNmLFNBQU8sUUFBUTtBQUNqQjtBQUVBLFNBQVMsbUJBQW1CLE1BQTJCO0FBQ3JELFFBQU0sUUFBUSxvQkFBSSxJQUFZO0FBQzlCLFFBQU0sZUFBZTtBQUNyQixNQUFJO0FBQ0osVUFBUSxRQUFRLGFBQWEsS0FBSyxJQUFJLE9BQU8sTUFBTTtBQUNqRCxVQUFNLElBQUksZUFBZSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7QUFBQSxFQUMxQztBQUNBLFNBQU87QUFDVDtBQUVBLFNBQVMsa0JBQWtCLFVBQWtCLFdBQWdDO0FBQzNFLE1BQUksQ0FBQyxVQUFVLElBQUksUUFBUSxHQUFHO0FBQzVCLGNBQVUsSUFBSSxRQUFRO0FBQ3RCLFdBQU87QUFBQSxFQUNUO0FBQ0EsV0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHO0FBQ3hCLFVBQU0sWUFBWSxHQUFHLFFBQVEsSUFBSSxDQUFDO0FBQ2xDLFFBQUksQ0FBQyxVQUFVLElBQUksU0FBUyxHQUFHO0FBQzdCLGdCQUFVLElBQUksU0FBUztBQUN2QixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsbUJBQW1CLE9BQTBEO0FBQ3BGLE1BQUksQ0FBQyxTQUFTLE9BQU8sTUFBTSxZQUFZLFlBQVksTUFBTSxRQUFRLFdBQVcsRUFBRyxRQUFPO0FBQ3RGLE1BQUksTUFBTSxTQUFTLFVBQWEsQ0FBQyxNQUFNLFFBQVEsTUFBTSxJQUFJLEVBQUcsUUFBTztBQUNuRSxNQUFJLE1BQU0sTUFBTSxLQUFLLENBQUMsUUFBUSxPQUFPLFFBQVEsUUFBUSxFQUFHLFFBQU87QUFDL0QsTUFBSSxNQUFNLFFBQVEsUUFBVztBQUMzQixRQUFJLENBQUMsTUFBTSxPQUFPLE9BQU8sTUFBTSxRQUFRLFlBQVksTUFBTSxRQUFRLE1BQU0sR0FBRyxFQUFHLFFBQU87QUFDcEYsUUFBSSxPQUFPLE9BQU8sTUFBTSxHQUFHLEVBQUUsS0FBSyxDQUFDLGFBQWEsT0FBTyxhQUFhLFFBQVEsRUFBRyxRQUFPO0FBQUEsRUFDeEY7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGdCQUFnQixZQUFvQixVQUFrQixLQUE2QjtBQUMxRixRQUFNLFFBQVE7QUFBQSxJQUNaLGdCQUFnQixjQUFjLFVBQVUsQ0FBQztBQUFBLElBQ3pDLGFBQWEsaUJBQWlCLGVBQWUsVUFBVSxJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDdEU7QUFFQSxNQUFJLElBQUksUUFBUSxJQUFJLEtBQUssU0FBUyxHQUFHO0FBQ25DLFVBQU0sS0FBSyxVQUFVLHNCQUFzQixJQUFJLEtBQUssSUFBSSxDQUFDLFFBQVEsV0FBVyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUFBLEVBQ2hHO0FBRUEsTUFBSSxJQUFJLE9BQU8sT0FBTyxLQUFLLElBQUksR0FBRyxFQUFFLFNBQVMsR0FBRztBQUM5QyxVQUFNLEtBQUssU0FBUyxzQkFBc0IsSUFBSSxHQUFHLENBQUMsRUFBRTtBQUFBLEVBQ3REO0FBRUEsU0FBTyxNQUFNLEtBQUssSUFBSTtBQUN4QjtBQUVBLFNBQVMsZUFBZSxVQUFrQixTQUF5QjtBQUNqRSxVQUFJLDhCQUFXLE9BQU8sS0FBSyxDQUFDLHNCQUFzQixPQUFPLEVBQUcsUUFBTztBQUNuRSxhQUFPLDJCQUFRLFVBQVUsT0FBTztBQUNsQztBQUVBLFNBQVMsV0FBVyxVQUFrQixLQUFxQjtBQUN6RCxVQUFJLDhCQUFXLEdBQUcsS0FBSyxJQUFJLFdBQVcsR0FBRyxFQUFHLFFBQU87QUFDbkQsUUFBTSxnQkFBWSwyQkFBUSxVQUFVLEdBQUc7QUFDdkMsYUFBTyw0QkFBVyxTQUFTLElBQUksWUFBWTtBQUM3QztBQUVBLFNBQVMsc0JBQXNCLE9BQXdCO0FBQ3JELFNBQU8sTUFBTSxXQUFXLElBQUksS0FBSyxNQUFNLFdBQVcsS0FBSyxLQUFLLE1BQU0sU0FBUyxHQUFHO0FBQ2hGO0FBRUEsU0FBUyxpQkFBaUIsT0FBdUI7QUFDL0MsU0FBTyxLQUFLLFVBQVUsS0FBSztBQUM3QjtBQUVBLFNBQVMsc0JBQXNCLFFBQTBCO0FBQ3ZELFNBQU8sSUFBSSxPQUFPLElBQUksZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDcEQ7QUFFQSxTQUFTLHNCQUFzQixRQUF3QztBQUNyRSxTQUFPLEtBQUssT0FBTyxRQUFRLE1BQU0sRUFDOUIsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sR0FBRyxjQUFjLEdBQUcsQ0FBQyxNQUFNLGlCQUFpQixLQUFLLENBQUMsRUFBRSxFQUMxRSxLQUFLLElBQUksQ0FBQztBQUNmO0FBRUEsU0FBUyxjQUFjLEtBQXFCO0FBQzFDLFNBQU8sbUJBQW1CLEtBQUssR0FBRyxJQUFJLE1BQU0saUJBQWlCLEdBQUc7QUFDbEU7QUFFQSxTQUFTLGVBQWUsS0FBcUI7QUFDM0MsTUFBSSxDQUFDLElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLFNBQVMsR0FBRyxFQUFHLFFBQU87QUFDdkQsTUFBSTtBQUNGLFdBQU8sS0FBSyxNQUFNLEdBQUc7QUFBQSxFQUN2QixRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLFNBQVMsYUFBYSxPQUF1QjtBQUMzQyxTQUFPLE1BQU0sUUFBUSx1QkFBdUIsTUFBTTtBQUNwRDs7O0FDek1BLGdDQUE2QjtBQUM3QixJQUFBQyxrQkFBeUM7QUFDekMscUJBQWtDO0FBQ2xDLElBQUFDLG9CQUFxQjtBQXVDckIsSUFBTSxnQkFBZ0I7QUFDdEIsSUFBTSxrQkFBYyw0QkFBSyx3QkFBUSxHQUFHLFdBQVcsUUFBUSw0QkFBNEI7QUFFNUUsU0FBUyxpQkFBaUJDLFdBQWlDO0FBQ2hFLFFBQU0sU0FBK0IsQ0FBQztBQUN0QyxRQUFNLFFBQVEsYUFBeUIsd0JBQUtBLFdBQVUsWUFBWSxDQUFDO0FBQ25FLFFBQU0sU0FBUyxhQUF3Qix3QkFBS0EsV0FBVSxhQUFhLENBQUMsS0FBSyxDQUFDO0FBQzFFLFFBQU0sYUFBYSxhQUEwQix3QkFBS0EsV0FBVSx3QkFBd0IsQ0FBQztBQUVyRixTQUFPLEtBQUs7QUFBQSxJQUNWLE1BQU07QUFBQSxJQUNOLFFBQVEsUUFBUSxPQUFPO0FBQUEsSUFDdkIsUUFBUSxRQUFRLFdBQVcsTUFBTSxXQUFXLG1CQUFtQixLQUFLO0FBQUEsRUFDdEUsQ0FBQztBQUVELE1BQUksQ0FBQyxNQUFPLFFBQU8sVUFBVSxRQUFRLE1BQU07QUFFM0MsUUFBTSxhQUFhLE9BQU8sZUFBZSxlQUFlO0FBQ3hELFNBQU8sS0FBSztBQUFBLElBQ1YsTUFBTTtBQUFBLElBQ04sUUFBUSxhQUFhLE9BQU87QUFBQSxJQUM1QixRQUFRLGFBQWEsWUFBWTtBQUFBLEVBQ25DLENBQUM7QUFFRCxTQUFPLEtBQUs7QUFBQSxJQUNWLE1BQU07QUFBQSxJQUNOLFFBQVEsTUFBTSxXQUFXLE1BQU0sWUFBWSxTQUFTLE9BQU87QUFBQSxJQUMzRCxRQUFRLE1BQU0sV0FBVztBQUFBLEVBQzNCLENBQUM7QUFFRCxNQUFJLFlBQVk7QUFDZCxXQUFPLEtBQUssZ0JBQWdCLFVBQVUsQ0FBQztBQUFBLEVBQ3pDO0FBRUEsUUFBTSxVQUFVLE1BQU0sV0FBVztBQUNqQyxTQUFPLEtBQUs7QUFBQSxJQUNWLE1BQU07QUFBQSxJQUNOLFFBQVEsZUFBVyw0QkFBVyxPQUFPLElBQUksT0FBTztBQUFBLElBQ2hELFFBQVEsV0FBVztBQUFBLEVBQ3JCLENBQUM7QUFFRCxjQUFRLHlCQUFTLEdBQUc7QUFBQSxJQUNsQixLQUFLO0FBQ0gsYUFBTyxLQUFLLEdBQUcsb0JBQW9CLE9BQU8sQ0FBQztBQUMzQztBQUFBLElBQ0YsS0FBSztBQUNILGFBQU8sS0FBSyxHQUFHLG9CQUFvQixPQUFPLENBQUM7QUFDM0M7QUFBQSxJQUNGLEtBQUs7QUFDSCxhQUFPLEtBQUssR0FBRywwQkFBMEIsQ0FBQztBQUMxQztBQUFBLElBQ0Y7QUFDRSxhQUFPLEtBQUs7QUFBQSxRQUNWLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFFBQVEsNkJBQXlCLHlCQUFTLENBQUM7QUFBQSxNQUM3QyxDQUFDO0FBQUEsRUFDTDtBQUVBLFNBQU8sVUFBVSxNQUFNLFdBQVcsUUFBUSxNQUFNO0FBQ2xEO0FBRUEsU0FBUyxnQkFBZ0IsT0FBNEM7QUFDbkUsUUFBTSxLQUFLLE1BQU0sZUFBZSxNQUFNLGFBQWE7QUFDbkQsTUFBSSxNQUFNLFdBQVcsVUFBVTtBQUM3QixXQUFPO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixRQUFRLE1BQU0sUUFBUSxVQUFVLEVBQUUsS0FBSyxNQUFNLEtBQUssS0FBSyxVQUFVLEVBQUU7QUFBQSxJQUNyRTtBQUFBLEVBQ0Y7QUFDQSxNQUFJLE1BQU0sV0FBVyxZQUFZO0FBQy9CLFdBQU8sRUFBRSxNQUFNLHVCQUF1QixRQUFRLFFBQVEsUUFBUSxXQUFXLEVBQUUsK0JBQStCO0FBQUEsRUFDNUc7QUFDQSxNQUFJLE1BQU0sV0FBVyxXQUFXO0FBQzlCLFdBQU8sRUFBRSxNQUFNLHVCQUF1QixRQUFRLE1BQU0sUUFBUSxXQUFXLEVBQUUsT0FBTyxNQUFNLGlCQUFpQixhQUFhLEdBQUc7QUFBQSxFQUN6SDtBQUNBLE1BQUksTUFBTSxXQUFXLGNBQWM7QUFDakMsV0FBTyxFQUFFLE1BQU0sdUJBQXVCLFFBQVEsTUFBTSxRQUFRLGNBQWMsRUFBRSxHQUFHO0FBQUEsRUFDakY7QUFDQSxTQUFPLEVBQUUsTUFBTSx1QkFBdUIsUUFBUSxRQUFRLFFBQVEsa0JBQWtCLEVBQUUsR0FBRztBQUN2RjtBQUVBLFNBQVMsb0JBQW9CLFNBQXVDO0FBQ2xFLFFBQU0sU0FBK0IsQ0FBQztBQUN0QyxRQUFNLGdCQUFZLDRCQUFLLHdCQUFRLEdBQUcsV0FBVyxnQkFBZ0IsR0FBRyxhQUFhLFFBQVE7QUFDckYsUUFBTSxZQUFRLDRCQUFXLFNBQVMsSUFBSSxhQUFhLFNBQVMsSUFBSTtBQUNoRSxRQUFNLFdBQVcsY0FBVSx3QkFBSyxTQUFTLFlBQVksYUFBYSxVQUFVLElBQUk7QUFFaEYsU0FBTyxLQUFLO0FBQUEsSUFDVixNQUFNO0FBQUEsSUFDTixRQUFRLFFBQVEsT0FBTztBQUFBLElBQ3ZCLFFBQVE7QUFBQSxFQUNWLENBQUM7QUFFRCxNQUFJLE9BQU87QUFDVCxXQUFPLEtBQUs7QUFBQSxNQUNWLE1BQU07QUFBQSxNQUNOLFFBQVEsTUFBTSxTQUFTLGFBQWEsSUFBSSxPQUFPO0FBQUEsTUFDL0MsUUFBUTtBQUFBLElBQ1YsQ0FBQztBQUNELFdBQU8sS0FBSztBQUFBLE1BQ1YsTUFBTTtBQUFBLE1BQ04sUUFBUSxZQUFZLE1BQU0sU0FBUyxRQUFRLElBQUksT0FBTztBQUFBLE1BQ3RELFFBQVEsWUFBWTtBQUFBLElBQ3RCLENBQUM7QUFDRCxXQUFPLEtBQUs7QUFBQSxNQUNWLE1BQU07QUFBQSxNQUNOLFFBQVEsTUFBTSxTQUFTLDBCQUEwQixLQUFLLE1BQU0sU0FBUywyQkFBMkIsSUFDNUYsT0FDQTtBQUFBLE1BQ0osUUFBUSxlQUFlLEtBQUs7QUFBQSxJQUM5QixDQUFDO0FBRUQsVUFBTSxVQUFVLGFBQWEsT0FBTyw2Q0FBNkM7QUFDakYsUUFBSSxTQUFTO0FBQ1gsYUFBTyxLQUFLO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixZQUFRLDRCQUFXLE9BQU8sSUFBSSxPQUFPO0FBQUEsUUFDckMsUUFBUTtBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBRUEsUUFBTSxTQUFTLGdCQUFnQixhQUFhLENBQUMsUUFBUSxhQUFhLENBQUM7QUFDbkUsU0FBTyxLQUFLO0FBQUEsSUFDVixNQUFNO0FBQUEsSUFDTixRQUFRLFNBQVMsT0FBTztBQUFBLElBQ3hCLFFBQVEsU0FBUyxzQkFBc0I7QUFBQSxFQUN6QyxDQUFDO0FBRUQsU0FBTyxLQUFLLGdCQUFnQixDQUFDO0FBQzdCLFNBQU87QUFDVDtBQUVBLFNBQVMsb0JBQW9CLFNBQXVDO0FBQ2xFLFFBQU0sVUFBTSw0QkFBSyx3QkFBUSxHQUFHLFdBQVcsV0FBVyxNQUFNO0FBQ3hELFFBQU0sY0FBVSx3QkFBSyxLQUFLLGdDQUFnQztBQUMxRCxRQUFNLFlBQVEsd0JBQUssS0FBSyw4QkFBOEI7QUFDdEQsUUFBTSxlQUFXLHdCQUFLLEtBQUssNkJBQTZCO0FBQ3hELFFBQU0sZUFBZSxjQUFVLHdCQUFLLFNBQVMsYUFBYSxVQUFVLElBQUk7QUFDeEUsUUFBTSxlQUFXLDRCQUFXLFFBQVEsSUFBSSxhQUFhLFFBQVEsSUFBSTtBQUVqRSxTQUFPO0FBQUEsSUFDTDtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sWUFBUSw0QkFBVyxPQUFPLElBQUksT0FBTztBQUFBLE1BQ3JDLFFBQVE7QUFBQSxJQUNWO0FBQUEsSUFDQTtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sWUFBUSw0QkFBVyxLQUFLLElBQUksT0FBTztBQUFBLE1BQ25DLFFBQVE7QUFBQSxJQUNWO0FBQUEsSUFDQTtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sUUFBUSxZQUFZLGdCQUFnQixTQUFTLFNBQVMsWUFBWSxJQUFJLE9BQU87QUFBQSxNQUM3RSxRQUFRLGdCQUFnQjtBQUFBLElBQzFCO0FBQUEsSUFDQTtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sUUFBUSxnQkFBZ0IsYUFBYSxDQUFDLFVBQVUsYUFBYSxXQUFXLDZCQUE2QixDQUFDLElBQUksT0FBTztBQUFBLE1BQ2pILFFBQVE7QUFBQSxJQUNWO0FBQUEsSUFDQTtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sUUFBUSxnQkFBZ0IsYUFBYSxDQUFDLFVBQVUsYUFBYSxXQUFXLDhCQUE4QixDQUFDLElBQUksT0FBTztBQUFBLE1BQ2xILFFBQVE7QUFBQSxJQUNWO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyw0QkFBa0Q7QUFDekQsU0FBTztBQUFBLElBQ0w7QUFBQSxNQUNFLE1BQU07QUFBQSxNQUNOLFFBQVEsZ0JBQWdCLGdCQUFnQixDQUFDLFVBQVUsT0FBTyx3QkFBd0IsQ0FBQyxJQUFJLE9BQU87QUFBQSxNQUM5RixRQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0E7QUFBQSxNQUNFLE1BQU07QUFBQSxNQUNOLFFBQVEsZ0JBQWdCLGdCQUFnQixDQUFDLFVBQVUsT0FBTywrQkFBK0IsQ0FBQyxJQUFJLE9BQU87QUFBQSxNQUNyRyxRQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsa0JBQXNDO0FBQzdDLE1BQUksS0FBQyw0QkFBVyxXQUFXLEdBQUc7QUFDNUIsV0FBTyxFQUFFLE1BQU0sZUFBZSxRQUFRLFFBQVEsUUFBUSxxQkFBcUI7QUFBQSxFQUM3RTtBQUNBLFFBQU0sT0FBTyxhQUFhLFdBQVcsRUFBRSxNQUFNLE9BQU8sRUFBRSxNQUFNLEdBQUcsRUFBRSxLQUFLLElBQUk7QUFDMUUsU0FBTyxzQkFBc0IsSUFBSTtBQUNuQztBQUVPLFNBQVMsc0JBQXNCLE1BQWtDO0FBQ3RFLFFBQU0sV0FBVyw4REFBOEQsS0FBSyxJQUFJO0FBQ3hGLFFBQU0sb0JBQ0osWUFDQSxtSEFBbUgsS0FBSyxJQUFJO0FBQzlILFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLFFBQVEsV0FBVyxTQUFTO0FBQUEsSUFDNUIsUUFBUSxXQUNKLG9CQUNFLGdGQUNBLHlDQUNGO0FBQUEsRUFDTjtBQUNGO0FBRUEsU0FBUyxVQUFVLFNBQWlCLFFBQTZDO0FBQy9FLFFBQU0sV0FBVyxPQUFPLEtBQUssQ0FBQyxNQUFNLEVBQUUsV0FBVyxPQUFPO0FBQ3hELFFBQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxNQUFNLEVBQUUsV0FBVyxNQUFNO0FBQ3RELFFBQU0sU0FBc0IsV0FBVyxVQUFVLFVBQVUsU0FBUztBQUNwRSxRQUFNLFNBQVMsT0FBTyxPQUFPLENBQUMsTUFBTSxFQUFFLFdBQVcsT0FBTyxFQUFFO0FBQzFELFFBQU0sU0FBUyxPQUFPLE9BQU8sQ0FBQyxNQUFNLEVBQUUsV0FBVyxNQUFNLEVBQUU7QUFDekQsUUFBTSxRQUNKLFdBQVcsT0FDUCxpQ0FDQSxXQUFXLFNBQ1QscUNBQ0E7QUFDUixRQUFNLFVBQ0osV0FBVyxPQUNQLG9FQUNBLEdBQUcsTUFBTSxzQkFBc0IsTUFBTTtBQUUzQyxTQUFPO0FBQUEsSUFDTCxZQUFXLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsSUFDbEM7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyxnQkFBZ0IsU0FBaUIsTUFBeUI7QUFDakUsTUFBSTtBQUNGLGdEQUFhLFNBQVMsTUFBTSxFQUFFLE9BQU8sVUFBVSxTQUFTLElBQU0sQ0FBQztBQUMvRCxXQUFPO0FBQUEsRUFDVCxRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLFNBQVMsZUFBZSxPQUF1QjtBQUM3QyxRQUFNLFVBQVUsYUFBYSxPQUFPLDJFQUEyRTtBQUMvRyxTQUFPLFVBQVUsWUFBWSxPQUFPLEVBQUUsUUFBUSxRQUFRLEdBQUcsRUFBRSxLQUFLLElBQUk7QUFDdEU7QUFFQSxTQUFTLGFBQWEsUUFBZ0IsU0FBZ0M7QUFDcEUsU0FBTyxPQUFPLE1BQU0sT0FBTyxJQUFJLENBQUMsS0FBSztBQUN2QztBQUVBLFNBQVMsU0FBWSxNQUF3QjtBQUMzQyxNQUFJO0FBQ0YsV0FBTyxLQUFLLFVBQU0sOEJBQWEsTUFBTSxNQUFNLENBQUM7QUFBQSxFQUM5QyxRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLFNBQVMsYUFBYSxNQUFzQjtBQUMxQyxNQUFJO0FBQ0YsZUFBTyw4QkFBYSxNQUFNLE1BQU07QUFBQSxFQUNsQyxRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLFNBQVMsWUFBWSxPQUF1QjtBQUMxQyxTQUFPLE1BQ0osUUFBUSxXQUFXLEdBQUksRUFDdkIsUUFBUSxXQUFXLEdBQUcsRUFDdEIsUUFBUSxTQUFTLEdBQUcsRUFDcEIsUUFBUSxTQUFTLEdBQUcsRUFDcEIsUUFBUSxVQUFVLEdBQUc7QUFDMUI7OztBQ25UTyxTQUFTLHdCQUF3QixPQUF3QztBQUM5RSxTQUFPLFVBQVU7QUFDbkI7QUFFTyxTQUFTLGFBQWEsUUFBZ0IsTUFBOEI7QUFDekUsT0FBSyxRQUFRLHFCQUFxQixNQUFNLEdBQUc7QUFDM0MsT0FBSyxrQkFBa0I7QUFDdkIsT0FBSyxzQkFBc0I7QUFDM0IsT0FBSyxrQkFBa0I7QUFDdkIsT0FBSyxnQkFBZ0I7QUFDdkI7QUFFTyxTQUFTLHlCQUNkLElBQ0EsU0FDQSxNQUNNO0FBQ04sUUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBQzVCLE9BQUssZ0JBQWdCLElBQUksaUJBQWlCO0FBQzFDLE9BQUssUUFBUSxTQUFTLEVBQUUsWUFBWSxpQkFBaUIsRUFBRTtBQUN2RCxlQUFhLGtCQUFrQixJQUFJO0FBQ25DLFNBQU87QUFDVDs7O0FDcENBLElBQUFDLGtCQUFrRjtBQUUzRSxJQUFNLGdCQUFnQixLQUFLLE9BQU87QUFFbEMsU0FBUyxnQkFBZ0IsTUFBYyxNQUFjLFdBQVcsZUFBcUI7QUFDMUYsUUFBTSxXQUFXLE9BQU8sS0FBSyxJQUFJO0FBQ2pDLE1BQUksU0FBUyxjQUFjLFVBQVU7QUFDbkMsdUNBQWMsTUFBTSxTQUFTLFNBQVMsU0FBUyxhQUFhLFFBQVEsQ0FBQztBQUNyRTtBQUFBLEVBQ0Y7QUFFQSxNQUFJO0FBQ0YsWUFBSSw0QkFBVyxJQUFJLEdBQUc7QUFDcEIsWUFBTSxXQUFPLDBCQUFTLElBQUksRUFBRTtBQUM1QixZQUFNLGtCQUFrQixXQUFXLFNBQVM7QUFDNUMsVUFBSSxPQUFPLGlCQUFpQjtBQUMxQixjQUFNLGVBQVcsOEJBQWEsSUFBSTtBQUNsQywyQ0FBYyxNQUFNLFNBQVMsU0FBUyxLQUFLLElBQUksR0FBRyxTQUFTLGFBQWEsZUFBZSxDQUFDLENBQUM7QUFBQSxNQUMzRjtBQUFBLElBQ0Y7QUFBQSxFQUNGLFFBQVE7QUFBQSxFQUVSO0FBRUEsc0NBQWUsTUFBTSxRQUFRO0FBQy9COzs7QUN6QkEsc0JBQW1DO0FBQ25DLElBQUFDLGtCQUEyQjtBQUMzQixJQUFBQyxvQkFBOEI7QUFtQnZCLFNBQVMsZUFBZSxNQUE2QztBQUMxRSxTQUFPO0FBQUEsSUFDTCxNQUFNLGtCQUFrQjtBQUFBLElBQ3hCLGNBQWMsS0FBSyxnQkFBZ0IsZUFBZTtBQUFBLElBQ2xELFNBQVMsS0FBSztBQUFBLElBQ2QsYUFBYSxnQkFBZ0I7QUFBQSxJQUM3QixpQkFBaUI7QUFBQSxJQUNqQixTQUFTLFlBQVk7QUFBQSxJQUNyQixlQUFlLFFBQVEsaUJBQWlCO0FBQUEsRUFDMUM7QUFDRjtBQUVPLFNBQVMsdUJBQXVCLE1BQXFEO0FBQzFGLFFBQU0sV0FBVyxTQUFTLEtBQUssa0JBQWtCLENBQUM7QUFDbEQsUUFBTSxnQkFBZ0IsU0FBUyxVQUFVLGFBQWE7QUFDdEQsUUFBTSxNQUFNLGFBQWE7QUFDekIsUUFBTSxTQUFTLEtBQUssd0JBQXdCLEtBQUssMEJBQTBCO0FBQzNFLFFBQU0sUUFBUSxLQUFLLHNCQUFzQixLQUFLLHdCQUF3QjtBQUN0RSxRQUFNLGtCQUFrQixPQUFPLGVBQWUsaUJBQWlCLGNBQzdELE9BQU8sVUFBVSxzQkFBc0IsY0FDdkMsT0FBTyxVQUFVLDJCQUEyQixjQUM1QyxPQUFPLFVBQVUscUJBQXFCO0FBQ3hDLFNBQU87QUFBQSxJQUNMLFNBQVM7QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxNQUNQLFNBQVMsT0FBTyxVQUFVLHFCQUFxQixjQUM3QyxPQUFPLGVBQWUscUJBQXFCO0FBQUEsTUFDN0MsYUFBYSxPQUFPLGVBQWUsbUJBQW1CO0FBQUEsSUFDeEQ7QUFBQSxJQUNBO0FBQUEsSUFDQSxLQUFLO0FBQUEsTUFDSCxXQUFXO0FBQUEsTUFDWCxTQUFTLElBQUk7QUFBQSxNQUNiLE1BQU0sSUFBSTtBQUFBLElBQ1o7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUNGO0FBRU8sU0FBUyxlQUErQjtBQUM3QyxRQUFNLFVBQVUsUUFBUSxJQUFJLHlCQUF5QjtBQUNyRCxRQUFNLE9BQU8sYUFBYSxRQUFRLElBQUkseUJBQXlCO0FBQy9ELFNBQU87QUFBQSxJQUNMLFdBQVc7QUFBQSxJQUNYO0FBQUEsSUFDQSxNQUFNLFVBQVUsT0FBTztBQUFBLElBQ3ZCLEtBQUssVUFBVSxvQkFBb0IsSUFBSSxLQUFLO0FBQUEsRUFDOUM7QUFDRjtBQUVBLGVBQXNCLGlCQUE0QztBQUNoRSxRQUFNLFNBQVMsYUFBYTtBQUM1QixNQUFJLENBQUMsT0FBTyxXQUFXLENBQUMsT0FBTyxJQUFLLFFBQU8sQ0FBQztBQUM1QyxRQUFNLGFBQWEsSUFBSSxnQkFBZ0I7QUFDdkMsUUFBTSxVQUFVLFdBQVcsTUFBTSxXQUFXLE1BQU0sR0FBRyxHQUFJO0FBQ3pELE1BQUk7QUFDRixVQUFNLE1BQU0sTUFBTSxNQUFNLEdBQUcsT0FBTyxHQUFHLFNBQVMsRUFBRSxRQUFRLFdBQVcsT0FBTyxDQUFDO0FBQzNFLFFBQUksQ0FBQyxJQUFJLEdBQUksUUFBTyxDQUFDO0FBQ3JCLFVBQU0sT0FBTyxNQUFNLElBQUksS0FBSztBQUM1QixRQUFJLENBQUMsTUFBTSxRQUFRLElBQUksRUFBRyxRQUFPLENBQUM7QUFDbEMsV0FBTyxLQUNKLElBQUksQ0FBQyxRQUFRLG1CQUFtQixHQUFHLENBQUMsRUFDcEMsT0FBTyxDQUFDLFFBQStCLFFBQVEsSUFBSTtBQUFBLEVBQ3hELFFBQVE7QUFDTixXQUFPLENBQUM7QUFBQSxFQUNWLFVBQUU7QUFDQSxpQkFBYSxPQUFPO0FBQUEsRUFDdEI7QUFDRjtBQUVBLFNBQVMsb0JBQXNDO0FBQzdDLE1BQUksUUFBUSxhQUFhLFVBQVU7QUFDakMsVUFBTSxVQUFVLGdCQUFnQjtBQUNoQyxRQUFJLGVBQVcsZ0NBQVcsd0JBQUssU0FBUyxZQUFZLGNBQWMsMkJBQTJCLENBQUMsR0FBRztBQUMvRixhQUFPO0FBQUEsSUFDVDtBQUNBLFFBQ0UsZUFDQSxnQ0FBVyx3QkFBSyxTQUFTLFlBQVksY0FBYyw4QkFBOEIsQ0FBQyxHQUNsRjtBQUNBLGFBQU87QUFBQSxJQUNUO0FBQ0EsUUFBSSxRQUFRLHFCQUFpQixnQ0FBVyx3QkFBSyxRQUFRLGVBQWUsVUFBVSxDQUFDLEdBQUc7QUFDaEYsYUFBTztBQUFBLElBQ1Q7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUNBLFNBQU8sUUFBUSxxQkFBaUIsZ0NBQVcsd0JBQUssUUFBUSxlQUFlLFVBQVUsQ0FBQyxJQUM5RSxhQUNBO0FBQ047QUFFQSxTQUFTLGtCQUFpQztBQUN4QyxRQUFNLFNBQVM7QUFDZixRQUFNLE1BQU0sUUFBUSxTQUFTLFFBQVEsTUFBTTtBQUMzQyxTQUFPLE9BQU8sSUFBSSxRQUFRLFNBQVMsTUFBTSxHQUFHLE1BQU0sT0FBTyxNQUFNLElBQUk7QUFDckU7QUFFQSxTQUFTLGlCQUFnQztBQUN2QyxNQUFJO0FBQ0YsV0FBTyxvQkFBSSxXQUFXO0FBQUEsRUFDeEIsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxTQUFTLGNBQTZCO0FBQ3BDLE1BQUk7QUFDRixXQUFPLG9CQUFJLFdBQVc7QUFBQSxFQUN4QixRQUFRO0FBQ04sV0FBTyxRQUFRLG9CQUFnQix3QkFBSyxRQUFRLGVBQWUsVUFBVSxJQUFJO0FBQUEsRUFDM0U7QUFDRjtBQUVBLFNBQVMsa0JBQWlDO0FBQ3hDLFFBQU0sVUFBVSxZQUFZO0FBQzVCLE1BQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsUUFBTSxhQUFTLDJCQUFRLE9BQU87QUFDOUIsTUFBSSxPQUFPLFNBQVMsU0FBUyxFQUFHLFFBQU87QUFDdkMsU0FBTyxvQkFBSSxhQUFhLFNBQVM7QUFDbkM7QUFFQSxTQUFTLGFBQWEsT0FBbUM7QUFDdkQsUUFBTSxTQUFTLE9BQU8sU0FBUyxNQUFNO0FBQ3JDLFNBQU8sT0FBTyxVQUFVLE1BQU0sS0FBSyxTQUFTLEtBQUssU0FBUyxRQUFRLFNBQVM7QUFDN0U7QUFRQSxTQUFTLDRCQUFnRTtBQUN2RSxTQUFPO0FBQUEsSUFDTCxrQkFBa0I7QUFBQSxJQUNsQixjQUFjLFFBQVEsYUFBYTtBQUFBLElBQ25DLGlCQUFpQjtBQUFBLElBQ2pCLG9CQUFvQjtBQUFBLElBQ3BCLGtCQUFrQjtBQUFBLElBQ2xCLFlBQVk7QUFBQSxJQUNaLFlBQVk7QUFBQSxJQUNaLFNBQVM7QUFBQSxFQUNYO0FBQ0Y7QUFFQSxTQUFTLDBCQUE2RDtBQUNwRSxTQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixpQkFBaUI7QUFBQSxJQUNqQixpQkFBaUI7QUFBQSxJQUNqQixxQkFBcUIsT0FBTyw4QkFBYyxXQUFXO0FBQUEsRUFDdkQ7QUFDRjtBQUVBLFNBQVMsbUJBQW1CLEtBQXFDO0FBQy9ELFFBQU0sUUFBUSxTQUFTLEdBQUc7QUFDMUIsTUFBSSxDQUFDLFNBQVMsT0FBTyxNQUFNLE9BQU8sWUFBWSxPQUFPLE1BQU0sU0FBUyxZQUFZLE9BQU8sTUFBTSxRQUFRLFVBQVU7QUFDN0csV0FBTztBQUFBLEVBQ1Q7QUFDQSxTQUFPO0FBQUEsSUFDTCxJQUFJLE1BQU07QUFBQSxJQUNWLE1BQU0sTUFBTTtBQUFBLElBQ1osS0FBSyxNQUFNO0FBQUEsSUFDWCxHQUFJLE9BQU8sTUFBTSxVQUFVLFdBQVcsRUFBRSxPQUFPLE1BQU0sTUFBTSxJQUFJLENBQUM7QUFBQSxJQUNoRSxHQUFJLE9BQU8sTUFBTSx5QkFBeUIsV0FDdEMsRUFBRSxzQkFBc0IsTUFBTSxxQkFBcUIsSUFDbkQsQ0FBQztBQUFBLEVBQ1A7QUFDRjtBQUVBLFNBQVMsU0FBUyxPQUFnRDtBQUNoRSxTQUFPLFNBQVMsT0FBTyxVQUFVLFdBQVcsUUFBbUM7QUFDakY7OztBQ25NQSxJQUFBQyxtQkFBOEI7QUFDOUIsSUFBQUMsNkJBQTJEO0FBQzNELHlCQUEyQjtBQUMzQixJQUFBQyxrQkFBMkI7QUFDM0IsMkJBQWdDOzs7QUNKaEMsSUFBQUMsa0JBQTZCO0FBQzdCLElBQUFDLG9CQUE4QztBQUV2QyxTQUFTLHVCQUF1QixVQUFrQixNQUFzQjtBQUM3RSxNQUFJLE9BQU8sU0FBUyxZQUFZLEtBQUssS0FBSyxNQUFNLEdBQUksT0FBTSxJQUFJLE1BQU0seUJBQXlCO0FBQzdGLFFBQU0sV0FBTyw4QkFBYSxRQUFRO0FBQ2xDLFFBQU0sV0FBTywyQkFBUSxVQUFVLElBQUk7QUFDbkMsTUFBSTtBQUNKLE1BQUk7QUFDRixpQkFBUyw4QkFBYSxJQUFJO0FBQUEsRUFDNUIsUUFBUTtBQUNOLFVBQU0sSUFBSSxNQUFNLDRCQUE0QjtBQUFBLEVBQzlDO0FBQ0EsTUFBSSxDQUFDLGFBQWEsTUFBTSxNQUFNLEtBQUssV0FBVyxNQUFNO0FBQ2xELFVBQU0sSUFBSSxNQUFNLGtEQUFrRDtBQUFBLEVBQ3BFO0FBQ0EsU0FBTztBQUNUO0FBRU8sU0FBUyxhQUFhLFFBQWdCLFFBQXlCO0FBQ3BFLFFBQU0sVUFBTSxnQ0FBUywyQkFBUSxNQUFNLE9BQUcsMkJBQVEsTUFBTSxDQUFDO0FBQ3JELFNBQU8sUUFBUSxNQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxXQUFXLElBQUksS0FBSyxLQUFDLDhCQUFXLEdBQUc7QUFDekU7OztBRDJDTyxJQUFNLGVBQU4sTUFBbUI7QUFBQSxFQU94QixZQUNtQkMsTUFDQSxVQUErQixDQUFDLEdBQ2pEO0FBRmlCLGVBQUFBO0FBQ0E7QUFBQSxFQUNoQjtBQUFBLEVBRmdCO0FBQUEsRUFDQTtBQUFBLEVBUlgsVUFBVSxvQkFBSSxJQUFnQztBQUFBLEVBQzlDLFlBQVksb0JBQUksSUFBNEI7QUFBQSxFQUM1QyxVQUFVLG9CQUFJLElBQWlDO0FBQUEsRUFDL0Msb0JBQW9DO0FBQUEsRUFDcEMsc0JBQW9DO0FBQUEsRUFPNUMsa0JBQXNEO0FBQ3BELFVBQU0sT0FBTyxLQUFLLGVBQWUsS0FBSztBQUN0QyxVQUFNLG1CQUFtQixPQUFPLEtBQUssMkJBQTJCLElBQUksSUFBSSxDQUFDO0FBQ3pFLFVBQU0sYUFBYSxTQUFTO0FBQzVCLFdBQU87QUFBQSxNQUNMLGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWMsUUFBUSxhQUFhO0FBQUEsTUFDbkMsaUJBQWlCLFFBQVEsaUJBQWlCLGVBQWU7QUFBQSxNQUN6RCxvQkFBb0IsUUFBUSxpQkFBaUIsa0JBQWtCO0FBQUEsTUFDL0Qsa0JBQWtCLFFBQVEsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQzNELFlBQVksUUFBUSxpQkFBaUIsVUFBVTtBQUFBLE1BQy9DO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLFdBQVcsS0FBeUIsU0FBbUQ7QUFDckYsVUFBTSxLQUFLLGVBQWUsUUFBUSxJQUFJLGtCQUFrQjtBQUN4RCxVQUFNLFdBQVcsaUJBQWlCLEtBQUssUUFBUSxJQUFJO0FBQ25ELFVBQU0sT0FBTyxRQUFRLFFBQVEsZ0JBQWdCLFFBQVE7QUFFckQsUUFBSSxTQUFTLGNBQWM7QUFDekIsWUFBTSxJQUFJO0FBQUEsUUFDUixHQUFHLElBQUk7QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLFFBQUksQ0FBQyxTQUFTLFNBQVMsT0FBTyxHQUFHO0FBQy9CLFlBQU0sSUFBSSxNQUFNLGlEQUFpRDtBQUFBLElBQ25FO0FBRUEsVUFBTSxTQUFTLFFBQVEsUUFBUTtBQUMvQixVQUFNQyxXQUFVLGlCQUFpQixRQUFRLFFBQVEsVUFBVTtBQUMzRCxVQUFNLE1BQU0sVUFBVSxJQUFJLElBQUksRUFBRTtBQUNoQyxTQUFLLFFBQVEsSUFBSSxLQUFLLEVBQUUsS0FBSyxTQUFTLElBQUksSUFBSSxJQUFJLE1BQU0sTUFBTSxVQUFVLFNBQUFBLFNBQVEsQ0FBQztBQUNqRixTQUFLLElBQUksUUFBUSx3QkFBd0IsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUNqRixXQUFPLEtBQUssVUFBVSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE1BQU0sWUFBWSxLQUF5QixTQUE0RDtBQUNyRyxVQUFNLFVBQVUsTUFBTSxLQUFLLHFCQUFxQixLQUFLLFNBQVMsUUFBUSxVQUFVLFFBQVEsV0FBVyxlQUFlO0FBQUEsTUFDaEgsZ0JBQWdCLFFBQVE7QUFBQSxNQUN4QixRQUFRLFFBQVE7QUFBQSxNQUNoQixhQUFhLFFBQVEsZ0JBQWdCO0FBQUEsTUFDckMsa0JBQWtCLFFBQVEscUJBQXFCO0FBQUEsSUFDakQsQ0FBQztBQUNELFdBQU8sS0FBSyxTQUFTLE9BQU87QUFBQSxFQUM5QjtBQUFBLEVBRUEsTUFBTSxXQUFXLEtBQXlCLFNBQTBEO0FBQ2xHLFVBQU0sVUFBVSxNQUFNLEtBQUsscUJBQXFCLEtBQUssUUFBUSxRQUFRLFVBQVUsUUFBUSxXQUFXLGNBQWM7QUFBQSxNQUM5RyxnQkFBZ0IsUUFBUTtBQUFBLE1BQ3hCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFFBQVEsUUFBUTtBQUFBLElBQ2xCLENBQUM7QUFDRCxXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDN0I7QUFBQSxFQUVBLGFBQWEsS0FBeUIsU0FBcUQ7QUFDekYsVUFBTSxLQUFLLGVBQWUsUUFBUSxJQUFJLGtCQUFrQjtBQUN4RCxTQUFLLFFBQVEsYUFBYSxhQUFhLFNBQVM7QUFDOUMsWUFBTSxJQUFJLE1BQU0sOERBQThEO0FBQUEsSUFDaEY7QUFDQSxTQUFLLFFBQVEsV0FBVyxhQUFhLFNBQVM7QUFDNUMsWUFBTSxJQUFJLE1BQU0sbUVBQW1FO0FBQUEsSUFDckY7QUFDQSxVQUFNLGFBQWEsaUJBQWlCLEtBQUssUUFBUSxVQUFVO0FBQzNELFVBQU0sT0FBTyxRQUFRLFFBQVEsQ0FBQztBQUM5QixVQUFNLE1BQU0sRUFBRSxHQUFHLFFBQVEsS0FBSyxHQUFJLFFBQVEsT0FBTyxDQUFDLEVBQUc7QUFDckQsVUFBTSxZQUFRLGtDQUFNLFlBQVksTUFBTTtBQUFBLE1BQ3BDLEtBQUssSUFBSTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLE9BQU8sQ0FBQyxRQUFRLFFBQVEsTUFBTTtBQUFBLElBQ2hDLENBQUM7QUFDRCxVQUFNLE1BQU0sVUFBVSxJQUFJLElBQUksRUFBRTtBQUNoQyxVQUFNLFNBQThCO0FBQUEsTUFDbEM7QUFBQSxNQUNBLFNBQVMsSUFBSTtBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLG9CQUFJLElBQUk7QUFBQSxJQUNuQjtBQUNBLFNBQUssUUFBUSxJQUFJLEtBQUssTUFBTTtBQUU1QixVQUFNLGFBQVMsc0NBQWdCLEVBQUUsT0FBTyxNQUFNLE9BQU8sQ0FBQztBQUN0RCxXQUFPLEdBQUcsUUFBUSxDQUFDLFNBQVMsS0FBSyxpQkFBaUIsUUFBUSxJQUFJLENBQUM7QUFDL0QsVUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLFVBQVU7QUFDakMsV0FBSyxJQUFJLFFBQVEsaUJBQWlCLElBQUksRUFBRSxJQUFJLEVBQUUsV0FBVyxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ3hFLENBQUM7QUFDRCxVQUFNLEdBQUcsUUFBUSxDQUFDLE1BQU0sV0FBVztBQUNqQyxXQUFLLElBQUksUUFBUSxpQkFBaUIsSUFBSSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsTUFBTSxPQUFPLENBQUM7QUFDekUsV0FBSyxRQUFRLE9BQU8sR0FBRztBQUN2QixpQkFBVyxXQUFXLE9BQU8sUUFBUSxPQUFPLEdBQUc7QUFDN0MscUJBQWEsUUFBUSxLQUFLO0FBQzFCLGdCQUFRLE9BQU8sSUFBSSxNQUFNLHNDQUFzQyxDQUFDO0FBQUEsTUFDbEU7QUFDQSxhQUFPLFFBQVEsTUFBTTtBQUFBLElBQ3ZCLENBQUM7QUFDRCxVQUFNLEdBQUcsU0FBUyxDQUFDLFVBQVU7QUFDM0IsV0FBSyxJQUFJLFNBQVMsaUJBQWlCLElBQUksRUFBRSxJQUFJLEVBQUUsV0FBVyxLQUFLO0FBQy9ELFdBQUssUUFBUSxPQUFPLEdBQUc7QUFDdkIsaUJBQVcsV0FBVyxPQUFPLFFBQVEsT0FBTyxHQUFHO0FBQzdDLHFCQUFhLFFBQVEsS0FBSztBQUMxQixnQkFBUSxPQUFPLEtBQUs7QUFBQSxNQUN0QjtBQUNBLGFBQU8sUUFBUSxNQUFNO0FBQUEsSUFDdkIsQ0FBQztBQUVELFNBQUssSUFBSSxRQUFRLDBCQUEwQixJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLE1BQU0sS0FBSyxXQUFXLENBQUM7QUFDekYsV0FBTyxLQUFLLFVBQVUsSUFBSSxJQUFJLElBQUksTUFBTSxPQUFPLEVBQUU7QUFBQSxFQUNuRDtBQUFBLEVBRUEsYUFBYSxTQUF1QjtBQUNsQyxlQUFXLENBQUMsS0FBSyxRQUFRLEtBQUssQ0FBQyxHQUFHLEtBQUssU0FBUyxHQUFHO0FBQ2pELFVBQUksU0FBUyxZQUFZLFFBQVM7QUFDbEMsV0FBSyxLQUFLLGdCQUFnQixRQUFRLEVBQUUsUUFBUSxNQUFNLEtBQUssVUFBVSxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQzlFO0FBQ0EsZUFBVyxDQUFDLEtBQUssTUFBTSxLQUFLLENBQUMsR0FBRyxLQUFLLE9BQU8sR0FBRztBQUM3QyxVQUFJLE9BQU8sWUFBWSxRQUFTO0FBQ2hDLFdBQUssV0FBVyxNQUFNO0FBQ3RCLFdBQUssUUFBUSxPQUFPLEdBQUc7QUFBQSxJQUN6QjtBQUNBLGVBQVcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsS0FBSyxPQUFPLEdBQUc7QUFDMUMsVUFBSSxJQUFJLFlBQVksUUFBUztBQUM3QixXQUFLLGFBQWEsSUFBSSxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQzVDLFdBQUssUUFBUSxPQUFPLEdBQUc7QUFBQSxJQUN6QjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLGFBQW1CO0FBQ2pCLFVBQU0sV0FBVyxvQkFBSSxJQUFJO0FBQUEsTUFDdkIsR0FBRyxDQUFDLEdBQUcsS0FBSyxRQUFRLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLEtBQUssT0FBTztBQUFBLE1BQ3hELEdBQUcsQ0FBQyxHQUFHLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxLQUFLLE9BQU87QUFBQSxNQUMxRCxHQUFHLENBQUMsR0FBRyxLQUFLLFFBQVEsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsS0FBSyxPQUFPO0FBQUEsSUFDMUQsQ0FBQztBQUNELGVBQVcsTUFBTSxTQUFVLE1BQUssYUFBYSxFQUFFO0FBQUEsRUFDakQ7QUFBQSxFQUVBLE1BQU0sYUFDSixTQUNBLE1BQ0EsSUFDQSxRQUNBLEtBQ2U7QUFDZixRQUFJLFNBQVMsU0FBUztBQUNwQixVQUFJLFdBQVcsWUFBYSxRQUFPLEtBQUssZUFBZSxTQUFTLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQztBQUN0RixVQUFJLFdBQVcsT0FBUSxRQUFPLEtBQUssZUFBZSxTQUFTLElBQUksUUFBUSxDQUFDLENBQUM7QUFDekUsVUFBSSxXQUFXLE9BQVEsUUFBTyxLQUFLLGVBQWUsU0FBUyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQ3pFLFVBQUksV0FBVyxVQUFXLFFBQU8sS0FBSyxvQkFBb0IsU0FBUyxFQUFFO0FBQUEsSUFDdkU7QUFDQSxRQUFJLFNBQVMsUUFBUTtBQUNuQixVQUFJLFdBQVcsWUFBYSxRQUFPLEtBQUssZUFBZSxTQUFTLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQztBQUN0RixVQUFJLFdBQVcsYUFBYyxRQUFPLEtBQUssZUFBZSxTQUFTLElBQUksY0FBYyxDQUFDLEdBQUcsQ0FBQztBQUN4RixVQUFJLFdBQVcsVUFBVyxRQUFPLEtBQUssb0JBQW9CLFNBQVMsRUFBRTtBQUFBLElBQ3ZFO0FBQ0EsVUFBTSxJQUFJLE1BQU0sa0JBQWtCLElBQUksWUFBWSxNQUFNLEVBQUU7QUFBQSxFQUM1RDtBQUFBLEVBRUEsTUFBTSxXQUNKLFNBQ0EsVUFDQSxRQUNBLFNBQ0EsV0FDa0I7QUFDbEIsUUFBSSxXQUFXLE9BQVEsUUFBTyxLQUFLLFdBQVcsU0FBUyxVQUFVLE9BQU87QUFDeEUsUUFBSSxXQUFXLFVBQVcsUUFBTyxLQUFLLGNBQWMsU0FBUyxVQUFVLFNBQVMsU0FBUztBQUN6RixRQUFJLFdBQVcsT0FBUSxRQUFPLEtBQUssZUFBZSxTQUFTLFFBQVE7QUFDbkUsVUFBTSxJQUFJLE1BQU0saUNBQWlDLE1BQU0sRUFBRTtBQUFBLEVBQzNEO0FBQUEsRUFFUSxVQUFVLFNBQWlCLElBQVksT0FBTyxLQUFLLFVBQVUsU0FBUyxFQUFFLEVBQUUsTUFBdUI7QUFDdkcsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLENBQUMsUUFBUSxTQUFTLGNBQ3pCLEtBQUssY0FBYyxTQUFTLElBQUksUUFBUSxTQUFTLFNBQVM7QUFBQSxNQUM1RCxTQUFTLE1BQU0sS0FBSyxjQUFjLFNBQVMsRUFBRTtBQUFBLElBQy9DO0FBQUEsRUFDRjtBQUFBLEVBRVEsU0FBUyxVQUEwQztBQUN6RCxXQUFPO0FBQUEsTUFDTCxJQUFJLFNBQVM7QUFBQSxNQUNiLFVBQVUsU0FBUztBQUFBLE1BQ25CLFdBQVcsQ0FBQyxXQUFXLEtBQUssZUFBZSxTQUFTLFNBQVMsU0FBUyxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUM7QUFBQSxNQUMvRixNQUFNLE1BQU0sS0FBSyxlQUFlLFNBQVMsU0FBUyxTQUFTLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxNQUN6RSxNQUFNLE1BQU0sS0FBSyxlQUFlLFNBQVMsU0FBUyxTQUFTLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxNQUN6RSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsU0FBUyxTQUFTLFNBQVMsRUFBRTtBQUFBLElBQ3ZFO0FBQUEsRUFDRjtBQUFBLEVBRVEsUUFBUSxVQUF5QztBQUN2RCxXQUFPO0FBQUEsTUFDTCxJQUFJLFNBQVM7QUFBQSxNQUNiLFdBQVcsQ0FBQyxXQUFXLEtBQUssZUFBZSxTQUFTLFNBQVMsU0FBUyxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUM7QUFBQSxNQUMvRixZQUFZLENBQUMsWUFBWSxLQUFLLGVBQWUsU0FBUyxTQUFTLFNBQVMsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDO0FBQUEsTUFDbkcsU0FBUyxNQUFNLEtBQUssb0JBQW9CLFNBQVMsU0FBUyxTQUFTLEVBQUU7QUFBQSxJQUN2RTtBQUFBLEVBQ0Y7QUFBQSxFQUVRLFVBQVUsU0FBaUIsSUFBWSxLQUE4QjtBQUMzRSxXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU0sQ0FBQyxZQUFZLEtBQUssV0FBVyxTQUFTLElBQUksT0FBTztBQUFBLE1BQ3ZELFNBQVMsQ0FBQyxTQUFTLGNBQWMsS0FBSyxjQUFjLFNBQVMsSUFBSSxTQUFTLFNBQVM7QUFBQSxNQUNuRixNQUFNLE1BQU0sS0FBSyxlQUFlLFNBQVMsRUFBRTtBQUFBLElBQzdDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxjQUNKLFNBQ0EsSUFDQSxRQUNBLFNBQ0EsWUFDa0I7QUFDbEIsVUFBTSxNQUFNLEtBQUssVUFBVSxTQUFTLEVBQUU7QUFDdEMsVUFBTSxTQUFTQyxVQUFTLElBQUksT0FBTztBQUNuQyxVQUFNLEtBQUssUUFBUTtBQUNuQixRQUFJLE9BQU8sT0FBTyxZQUFZO0FBQzVCLGFBQU8sTUFBTSxHQUFHLEtBQUssSUFBSSxTQUFTLFFBQVEsT0FBTztBQUFBLElBQ25EO0FBQ0EsVUFBTSxXQUFXLFNBQVMsTUFBTTtBQUNoQyxRQUFJLE9BQU8sYUFBYSxZQUFZO0FBQ2xDLGFBQU8sTUFBTSxTQUFTLEtBQUssSUFBSSxTQUFTLE9BQU87QUFBQSxJQUNqRDtBQUNBLFVBQU0sSUFBSSxNQUFNLGlCQUFpQixPQUFPLElBQUksRUFBRSx3QkFBd0IsTUFBTSxJQUFJO0FBQUEsRUFDbEY7QUFBQSxFQUVBLE1BQU0sY0FBYyxTQUFpQixJQUEyQjtBQUM5RCxVQUFNLE1BQU0sVUFBVSxTQUFTLEVBQUU7QUFDakMsVUFBTSxNQUFNLEtBQUssUUFBUSxJQUFJLEdBQUc7QUFDaEMsUUFBSSxDQUFDLElBQUs7QUFDVixVQUFNLGFBQWEsSUFBSSxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQzdDLFNBQUssUUFBUSxPQUFPLEdBQUc7QUFBQSxFQUN6QjtBQUFBLEVBRUEsTUFBYyxxQkFDWixLQUNBLE1BQ0EsVUFDQSxTQUNBLFNBQ3lCO0FBQ3pCLFVBQU0sU0FBUyxXQUFXLEtBQUssVUFBVSxJQUFJLElBQUksUUFBUSxFQUFFLFVBQVUsS0FBSyxlQUFlLElBQUk7QUFDN0YsVUFBTSxLQUFLQSxVQUFTLE1BQU0sSUFBSSxPQUFPO0FBQ3JDLFFBQUksT0FBTyxPQUFPLFlBQVk7QUFDNUIsWUFBTSxRQUFRLFdBQVcsaUJBQWlCLElBQUksRUFBRSxJQUFJLFFBQVEsS0FBSztBQUNqRSxZQUFNLElBQUksTUFBTSxHQUFHLEtBQUssbUJBQW1CLE9BQU8sSUFBSTtBQUFBLElBQ3hEO0FBRUEsVUFBTSxlQUFlLE9BQU8sUUFBUSxtQkFBbUIsV0FDbkQsK0JBQWMsT0FBTyxRQUFRLGNBQWMsSUFDM0MsK0JBQWMsaUJBQWlCO0FBQ25DLFVBQU0scUJBQXFCLHNCQUFzQixZQUFZO0FBQzdELFVBQU0sUUFBUSxNQUFNLEdBQUcsS0FBSyxRQUFRO0FBQUEsTUFDbEMsR0FBRztBQUFBLE1BQ0gsZ0JBQWdCLFlBQVksWUFBWTtBQUFBLE1BQ3hDLHFCQUFxQixpQkFBaUIsWUFBWTtBQUFBLE1BQ2xEO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxLQUFLLE9BQU9BLFVBQVMsS0FBSyxHQUFHLE9BQU8sV0FBVyxPQUFPQSxVQUFTLEtBQUssR0FBRyxFQUFFLFFBQUksK0JBQVc7QUFDOUYsVUFBTSxXQUFXLE9BQU9BLFVBQVMsS0FBSyxHQUFHLGFBQWEsV0FBVyxPQUFPQSxVQUFTLEtBQUssR0FBRyxRQUFRLElBQUk7QUFDckcsVUFBTSxXQUEyQjtBQUFBLE1BQy9CLEtBQUssWUFBWSxJQUFJLElBQUksRUFBRTtBQUFBLE1BQzNCLFNBQVMsSUFBSTtBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0JBQWdCLFlBQVksWUFBWTtBQUFBLE1BQ3hDO0FBQUEsTUFDQSxpQkFBaUIsQ0FBQztBQUFBLE1BQ2xCLFdBQVc7QUFBQSxJQUNiO0FBQ0EsU0FBSyxVQUFVLElBQUksU0FBUyxLQUFLLFFBQVE7QUFDekMsUUFBSSxvQkFBb0IsWUFBWSxHQUFHO0FBQ3JDLFdBQUsscUJBQXFCLFVBQVUsWUFBWTtBQUNoRCxXQUFLLGdCQUFnQixVQUFVLGNBQWMsU0FBUztBQUFBLElBQ3hEO0FBQ0EsU0FBSyxJQUFJLFFBQVEsa0JBQWtCLElBQUksSUFBSSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7QUFBQSxNQUN6RCxVQUFVLFlBQVk7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBSVEsZUFBZSxVQUFtQztBQUN4RCxRQUFJLEtBQUssa0JBQW1CLFFBQU8sS0FBSztBQUN4QyxRQUFJLEtBQUssdUJBQXVCLENBQUMsU0FBVSxRQUFPO0FBQ2xELFVBQU0saUJBQWlCLEtBQUssUUFBUTtBQUNwQyxRQUFJLENBQUMsa0JBQWtCLEtBQUMsNEJBQVcsY0FBYyxHQUFHO0FBQ2xELFlBQU0sUUFBUSxJQUFJLE1BQU0sc0NBQXNDO0FBQzlELFdBQUssc0JBQXNCO0FBQzNCLFVBQUksU0FBVSxPQUFNO0FBQ3BCLGFBQU87QUFBQSxJQUNUO0FBQ0EsUUFBSTtBQUNGLFdBQUssb0JBQW9CLFFBQVEsY0FBYztBQUMvQyxXQUFLLHNCQUFzQjtBQUMzQixXQUFLLElBQUksUUFBUSw4QkFBOEIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUN2RSxhQUFPLEtBQUs7QUFBQSxJQUNkLFNBQVMsT0FBTztBQUNkLFdBQUssc0JBQXNCLGlCQUFpQixRQUFRLFFBQVEsSUFBSSxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQ25GLFdBQUssSUFBSSxTQUFTLHNDQUFzQyxLQUFLLG1CQUFtQjtBQUNoRixVQUFJLFNBQVUsT0FBTSxLQUFLO0FBQ3pCLGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUFBLEVBRVEsMkJBQTJCLE1BQXdDO0FBQ3pFLFVBQU0sa0JBQWtCQSxVQUFTLElBQUksR0FBRztBQUN4QyxRQUFJLE9BQU8sb0JBQW9CLFdBQVksUUFBTyxDQUFDO0FBQ25ELFFBQUk7QUFDRixZQUFNLGVBQWUsZ0JBQWdCLEtBQUssSUFBSTtBQUM5QyxhQUFPQSxVQUFTLFlBQVksS0FBSyxDQUFDO0FBQUEsSUFDcEMsU0FBUyxPQUFPO0FBQ2QsV0FBSyxJQUFJLFFBQVEsK0NBQStDLEtBQUs7QUFDckUsYUFBTyxDQUFDO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsZUFDWixTQUNBLElBQ0EsUUFDQSxNQUNlO0FBQ2YsVUFBTSxXQUFXLEtBQUssWUFBWSxTQUFTLEVBQUU7QUFDN0MsVUFBTSxLQUFLQSxVQUFTLFNBQVMsS0FBSyxJQUFJLE1BQU07QUFDNUMsUUFBSSxPQUFPLE9BQU8sWUFBWTtBQUM1QixZQUFNLEdBQUcsTUFBTSxTQUFTLE9BQU8sSUFBSTtBQUNuQztBQUFBLElBQ0Y7QUFDQSxRQUFJLFNBQVMsYUFBYSxNQUFNO0FBQzlCLFlBQU0sTUFBTSwrQkFBYyxPQUFPLFNBQVMsUUFBUTtBQUNsRCxVQUFJLE9BQU8sQ0FBQyxJQUFJLFlBQVksR0FBRztBQUM3QixZQUFJLFdBQVcsWUFBYSxLQUFJLFVBQVUsS0FBSyxDQUFDLENBQXVCO0FBQUEsaUJBQzlELFdBQVcsT0FBUSxLQUFJLEtBQUs7QUFBQSxpQkFDNUIsV0FBVyxPQUFRLEtBQUksS0FBSztBQUFBLGlCQUM1QixXQUFXLGFBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDbkU7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUNBLFVBQU0sSUFBSSxNQUFNLFVBQVUsU0FBUyxJQUFJLElBQUksT0FBTyxJQUFJLEVBQUUsdUJBQXVCLE1BQU0sSUFBSTtBQUFBLEVBQzNGO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixTQUFpQixJQUEyQjtBQUM1RSxVQUFNLE1BQU0sWUFBWSxTQUFTLEVBQUU7QUFDbkMsVUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDdkMsUUFBSSxDQUFDLFNBQVU7QUFDZixVQUFNLEtBQUssZ0JBQWdCLFFBQVE7QUFDbkMsU0FBSyxVQUFVLE9BQU8sR0FBRztBQUFBLEVBQzNCO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixVQUF5QztBQUNyRSxRQUFJLFNBQVMsVUFBVztBQUN4QixhQUFTLFlBQVk7QUFDckIsZUFBVyxXQUFXLFNBQVMsZ0JBQWdCLE9BQU8sQ0FBQyxHQUFHO0FBQ3hELFVBQUk7QUFDRixnQkFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQUM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxhQUFhLFNBQVMsT0FBTyxXQUFXLENBQUMsQ0FBQztBQUNoRCxRQUFJLFNBQVMsYUFBYSxNQUFNO0FBQzlCLFlBQU0sTUFBTSwrQkFBYyxPQUFPLFNBQVMsUUFBUTtBQUNsRCxVQUFJLE9BQU8sQ0FBQyxJQUFJLFlBQVksRUFBRyxLQUFJLE1BQU07QUFBQSxJQUMzQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHFCQUFxQixVQUEwQixjQUE0QztBQUNqRyxVQUFNLEtBQUssQ0FBQyxPQUFlLGFBQTJDO0FBQ3BFLG1CQUFhLEdBQUcsT0FBZ0IsUUFBaUI7QUFDakQsZUFBUyxnQkFBZ0IsS0FBSyxNQUFNLGFBQWEsSUFBSSxPQUFnQixRQUFpQixDQUFDO0FBQUEsSUFDekY7QUFDQSxVQUFNLGFBQWEsTUFBTSxLQUFLLGdCQUFnQixVQUFVLGNBQWMsUUFBUTtBQUM5RSxVQUFNLFlBQVksQ0FBQyxZQUFxQixLQUFLLGtCQUFrQixVQUFVLGNBQWMsU0FBUyxFQUFFLFFBQVEsQ0FBQztBQUMzRyxVQUFNLGlCQUFpQixDQUFDLFlBQ3RCLEtBQUssa0JBQWtCLFVBQVUsY0FBYyxjQUFjLEVBQUUsUUFBUSxDQUFDO0FBQzFFLFVBQU0sb0JBQW9CLE1BQU07QUFDOUIsV0FBSyxJQUFJLFFBQVEsb0JBQW9CLFNBQVMsSUFBSSxJQUFJLFNBQVMsT0FBTyxJQUFJLFNBQVMsRUFBRSxpQkFBaUI7QUFDdEcsV0FBSyxLQUFLLG9CQUFvQixTQUFTLFNBQVMsU0FBUyxFQUFFO0FBQUEsSUFDN0Q7QUFFQSxPQUFHLFFBQVEsVUFBVTtBQUNyQixPQUFHLFVBQVUsVUFBVTtBQUN2QixPQUFHLHFCQUFxQixVQUFVO0FBQ2xDLE9BQUcscUJBQXFCLFVBQVU7QUFDbEMsT0FBRyxZQUFZLFVBQVU7QUFDekIsT0FBRyxjQUFjLFVBQVU7QUFDM0IsT0FBRyxZQUFZLFVBQVU7QUFDekIsT0FBRyxXQUFXLFVBQVU7QUFDeEIsT0FBRyxRQUFRLE1BQU0sZUFBZSxJQUFJLENBQUM7QUFDckMsT0FBRyxRQUFRLE1BQU0sZUFBZSxLQUFLLENBQUM7QUFDdEMsT0FBRyxTQUFTLE1BQU0sVUFBVSxJQUFJLENBQUM7QUFDakMsT0FBRyxRQUFRLE1BQU0sVUFBVSxLQUFLLENBQUM7QUFDakMsT0FBRyxTQUFTLGlCQUFpQjtBQUM3QixPQUFHLFVBQVUsaUJBQWlCO0FBQUEsRUFDaEM7QUFBQSxFQUVRLGdCQUNOLFVBQ0EsY0FDQSxRQUNNO0FBQ04sVUFBTSxRQUFRLGtCQUFrQixjQUFjLE1BQU07QUFDcEQsUUFBSSxDQUFDLE1BQU87QUFDWixTQUFLLEtBQUssMEJBQTBCLFVBQVUsQ0FBQyxjQUFjLGVBQWUsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUNuRixLQUFLLENBQUMsWUFBWTtBQUNqQixVQUFJLENBQUMsU0FBUztBQUNaLGVBQU8sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBLENBQUMsbUJBQW1CLHFCQUFxQjtBQUFBLFVBQ3pDLENBQUMsTUFBTSxRQUFRLEtBQUs7QUFBQSxRQUN0QjtBQUFBLE1BQ0Y7QUFDQSxhQUFPO0FBQUEsSUFDVCxDQUFDLEVBQ0EsTUFBTSxDQUFDLFVBQVUsS0FBSyxJQUFJLFFBQVEsVUFBVSxTQUFTLElBQUksdUJBQXVCLEtBQUssQ0FBQztBQUFBLEVBQzNGO0FBQUEsRUFFUSxrQkFDTixVQUNBLGNBQ0EsUUFDQSxPQUNNO0FBQ04sVUFBTSxRQUFRLGtCQUFrQixjQUFjLE1BQU07QUFDcEQsUUFBSSxDQUFDLE1BQU87QUFDWixVQUFNLFVBQVUsRUFBRSxHQUFHLE9BQU8sR0FBRyxNQUFNO0FBQ3JDLFNBQUssS0FBSywwQkFBMEIsVUFBVSxDQUFDLHNCQUFzQixlQUFlLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFDN0YsTUFBTSxDQUFDLFVBQVUsS0FBSyxJQUFJLFFBQVEsVUFBVSxTQUFTLElBQUkseUJBQXlCLEtBQUssQ0FBQztBQUFBLEVBQzdGO0FBQUEsRUFFQSxNQUFjLDBCQUNaLFVBQ0EsU0FDQSxNQUNrQjtBQUNsQixVQUFNLFNBQVNBLFVBQVMsU0FBUyxLQUFLO0FBQ3RDLGVBQVcsVUFBVSxTQUFTO0FBQzVCLFlBQU0sS0FBSyxTQUFTLE1BQU07QUFDMUIsVUFBSSxPQUFPLE9BQU8sV0FBWTtBQUM5QixZQUFNLEdBQUcsTUFBTSxTQUFTLE9BQU8sSUFBSTtBQUNuQyxhQUFPO0FBQUEsSUFDVDtBQUNBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFQSxNQUFjLFdBQVcsU0FBaUIsSUFBWSxTQUFpQztBQUNyRixVQUFNLFNBQVMsS0FBSyxVQUFVLFNBQVMsRUFBRTtBQUN6QyxXQUFPLE1BQU0sTUFBTSxNQUFNLEdBQUcsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUFBLENBQUk7QUFBQSxFQUN6RDtBQUFBLEVBRUEsTUFBYyxjQUNaLFNBQ0EsSUFDQSxTQUNBLFlBQVksS0FDTTtBQUNsQixVQUFNLFNBQVMsS0FBSyxVQUFVLFNBQVMsRUFBRTtBQUN6QyxVQUFNLGdCQUFZLCtCQUFXO0FBQzdCLFVBQU0sVUFBVSxFQUFFLElBQUksV0FBVyxRQUFRO0FBQ3pDLFdBQU8sTUFBTSxJQUFJLFFBQVEsQ0FBQ0MsVUFBUyxXQUFXO0FBQzVDLFlBQU0sUUFBUSxXQUFXLE1BQU07QUFDN0IsZUFBTyxRQUFRLE9BQU8sU0FBUztBQUMvQixlQUFPLElBQUksTUFBTSxvQ0FBb0MsT0FBTyxJQUFJLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDdkUsR0FBRyxTQUFTO0FBQ1osYUFBTyxRQUFRLElBQUksV0FBVyxFQUFFLFNBQUFBLFVBQVMsUUFBUSxNQUFNLENBQUM7QUFDeEQsYUFBTyxNQUFNLE1BQU0sTUFBTSxHQUFHLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxDQUFJO0FBQUEsSUFDekQsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMsZUFBZSxTQUFpQixJQUEyQjtBQUN2RSxVQUFNLE1BQU0sVUFBVSxTQUFTLEVBQUU7QUFDakMsVUFBTSxTQUFTLEtBQUssUUFBUSxJQUFJLEdBQUc7QUFDbkMsUUFBSSxDQUFDLE9BQVE7QUFDYixTQUFLLFdBQVcsTUFBTTtBQUN0QixTQUFLLFFBQVEsT0FBTyxHQUFHO0FBQUEsRUFDekI7QUFBQSxFQUVRLFdBQVcsUUFBbUM7QUFDcEQsUUFBSSxPQUFPLE1BQU0sT0FBUTtBQUN6QixXQUFPLE1BQU0sS0FBSztBQUNsQixVQUFNLFFBQVEsV0FBVyxNQUFNO0FBQzdCLFVBQUksQ0FBQyxPQUFPLE1BQU0sT0FBUSxRQUFPLE1BQU0sS0FBSyxTQUFTO0FBQUEsSUFDdkQsR0FBRyxJQUFJO0FBQ1AsVUFBTSxRQUFRO0FBQUEsRUFDaEI7QUFBQSxFQUVRLGlCQUFpQixRQUE2QixNQUFvQjtBQUN4RSxRQUFJO0FBQ0osUUFBSTtBQUNGLGdCQUFVLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDM0IsUUFBUTtBQUNOLFdBQUssSUFBSSxRQUFRLGlCQUFpQixPQUFPLE9BQU8sSUFBSSxPQUFPLEVBQUUsSUFBSSxJQUFJO0FBQ3JFO0FBQUEsSUFDRjtBQUNBLFFBQUksT0FBTyxRQUFRLE9BQU8sU0FBVTtBQUNwQyxVQUFNLFVBQVUsT0FBTyxRQUFRLElBQUksUUFBUSxFQUFFO0FBQzdDLFFBQUksQ0FBQyxRQUFTO0FBQ2QsV0FBTyxRQUFRLE9BQU8sUUFBUSxFQUFFO0FBQ2hDLGlCQUFhLFFBQVEsS0FBSztBQUMxQixRQUFJLFFBQVEsT0FBTztBQUNqQixjQUFRLE9BQU8sSUFBSSxNQUFNLE9BQU8sUUFBUSxLQUFLLENBQUMsQ0FBQztBQUFBLElBQ2pELE9BQU87QUFDTCxjQUFRLFFBQVEsUUFBUSxNQUFNO0FBQUEsSUFDaEM7QUFBQSxFQUNGO0FBQUEsRUFFUSxVQUFVLFNBQWlCLElBQWdDO0FBQ2pFLFVBQU0sTUFBTSxLQUFLLFFBQVEsSUFBSSxVQUFVLFNBQVMsRUFBRSxDQUFDO0FBQ25ELFFBQUksQ0FBQyxJQUFLLE9BQU0sSUFBSSxNQUFNLGdDQUFnQyxPQUFPLElBQUksRUFBRSxFQUFFO0FBQ3pFLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxZQUFZLFNBQWlCLElBQTRCO0FBQy9ELFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxZQUFZLFNBQVMsRUFBRSxDQUFDO0FBQzVELFFBQUksQ0FBQyxTQUFVLE9BQU0sSUFBSSxNQUFNLGtDQUFrQyxPQUFPLElBQUksRUFBRSxFQUFFO0FBQ2hGLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxVQUFVLFNBQWlCLElBQWlDO0FBQ2xFLFVBQU0sU0FBUyxLQUFLLFFBQVEsSUFBSSxVQUFVLFNBQVMsRUFBRSxDQUFDO0FBQ3RELFFBQUksQ0FBQyxPQUFRLE9BQU0sSUFBSSxNQUFNLGlDQUFpQyxPQUFPLElBQUksRUFBRSxFQUFFO0FBQzdFLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxTQUFTLGlCQUFpQixLQUF5QixNQUFzQjtBQUN2RSxTQUFPLHVCQUF1QixJQUFJLEtBQUssSUFBSTtBQUM3QztBQUVBLFNBQVMsZ0JBQWdCLE1BQWdDO0FBQ3ZELE1BQUksS0FBSyxTQUFTLE9BQU8sRUFBRyxRQUFPO0FBQ25DLE1BQUksS0FBSyxTQUFTLFFBQVEsRUFBRyxRQUFPO0FBQ3BDLE1BQUksS0FBSyxTQUFTLFlBQVksRUFBRyxRQUFPO0FBQ3hDLFFBQU0sSUFBSSxNQUFNLDZEQUE2RDtBQUMvRTtBQUVBLFNBQVMsaUJBQWlCLFFBQWlCLFlBQXlDO0FBQ2xGLE1BQUksQ0FBQyxXQUFZLFFBQU9ELFVBQVMsTUFBTSxHQUFHLFdBQVc7QUFDckQsUUFBTSxXQUFXQSxVQUFTLE1BQU0sSUFBSSxVQUFVO0FBQzlDLE1BQUksYUFBYSxPQUFXLE9BQU0sSUFBSSxNQUFNLHVDQUF1QyxVQUFVLEVBQUU7QUFDL0YsU0FBTztBQUNUO0FBRUEsU0FBUyxlQUFlLE9BQWUsT0FBdUI7QUFDNUQsTUFBSSxPQUFPLFVBQVUsWUFBWSxDQUFDLG9CQUFvQixLQUFLLEtBQUssR0FBRztBQUNqRSxVQUFNLElBQUksTUFBTSxHQUFHLEtBQUssbUVBQW1FO0FBQUEsRUFDN0Y7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLFVBQVUsU0FBaUIsVUFBMEI7QUFDNUQsU0FBTyxHQUFHLE9BQU8sSUFBSSxRQUFRO0FBQy9CO0FBRUEsU0FBUyxZQUFZLFNBQWlCLElBQW9CO0FBQ3hELFNBQU8sR0FBRyxPQUFPLElBQUksRUFBRTtBQUN6QjtBQUVBLFNBQVMsVUFBVSxTQUFpQixJQUFvQjtBQUN0RCxTQUFPLEdBQUcsT0FBTyxJQUFJLEVBQUU7QUFDekI7QUFFQSxTQUFTQSxVQUFTLE9BQWdEO0FBQ2hFLFNBQU8sU0FBUyxPQUFPLFVBQVUsV0FBVyxRQUFtQztBQUNqRjtBQUVBLGVBQWUsYUFBYSxRQUFpQixRQUFnQixNQUFnQztBQUMzRixRQUFNLEtBQUtBLFVBQVMsTUFBTSxJQUFJLE1BQU07QUFDcEMsTUFBSSxPQUFPLE9BQU8sV0FBWSxPQUFNLEdBQUcsTUFBTSxRQUFRLElBQUk7QUFDM0Q7QUFFQSxTQUFTLGtCQUFrQixjQUFzQyxRQUFnRDtBQUMvRyxNQUFJLGtCQUFrQixZQUFZLEVBQUcsUUFBTztBQUM1QyxRQUFNLFNBQVMsaUJBQXFDLGNBQWMsV0FBVztBQUM3RSxRQUFNLGdCQUFnQixpQkFBcUMsY0FBYyxrQkFBa0I7QUFDM0YsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBLFVBQVUsWUFBWSxZQUFZO0FBQUEsSUFDbEMsZUFBZSxpQkFBaUIsWUFBWTtBQUFBLElBQzVDO0FBQUEsSUFDQTtBQUFBLElBQ0EsU0FBUyxpQkFBMEIsY0FBYyxXQUFXLEtBQUs7QUFBQSxJQUNqRSxTQUFTLGlCQUEwQixjQUFjLFdBQVcsS0FBSztBQUFBLElBQ2pFLFdBQVcsaUJBQTBCLGNBQWMsYUFBYSxLQUFLO0FBQUEsSUFDckUsV0FBVyxpQkFBMEIsY0FBYyxhQUFhLEtBQUs7QUFBQSxJQUNyRSxZQUFZLGlCQUEwQixjQUFjLGNBQWMsS0FBSztBQUFBLEVBQ3pFO0FBQ0Y7QUFFQSxTQUFTLHNCQUFzQixjQUF3RTtBQUNyRyxNQUFJLENBQUMsZ0JBQWdCLGtCQUFrQixZQUFZLEVBQUcsUUFBTztBQUM3RCxRQUFNLEtBQUtBLFVBQVMsWUFBWSxHQUFHO0FBQ25DLE1BQUksT0FBTyxPQUFPLFdBQVksUUFBTztBQUNyQyxNQUFJO0FBQ0YsVUFBTSxTQUFTLEdBQUcsS0FBSyxZQUFZO0FBQ25DLFdBQU8sT0FBTyxTQUFTLE1BQU0sSUFBSSxTQUFTO0FBQUEsRUFDNUMsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxTQUFTLG9CQUNQLGNBQ3dDO0FBQ3hDLE1BQUksQ0FBQyxnQkFBZ0Isa0JBQWtCLFlBQVksRUFBRyxRQUFPO0FBQzdELFNBQU8sT0FBT0EsVUFBUyxZQUFZLEdBQUcsT0FBTyxjQUMzQyxPQUFPQSxVQUFTLFlBQVksR0FBRyxRQUFRO0FBQzNDO0FBRUEsU0FBUyxrQkFBa0IsY0FBa0U7QUFDM0YsUUFBTSxLQUFLQSxVQUFTLFlBQVksR0FBRztBQUNuQyxNQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU87QUFDckMsTUFBSTtBQUNGLFdBQU8sUUFBUSxHQUFHLEtBQUssWUFBWSxDQUFDO0FBQUEsRUFDdEMsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxTQUFTLFlBQVksY0FBd0U7QUFDM0YsUUFBTSxLQUFLQSxVQUFTLFlBQVksR0FBRztBQUNuQyxTQUFPLE9BQU8sT0FBTyxXQUFXLEtBQUs7QUFDdkM7QUFFQSxTQUFTLGlCQUFpQixjQUF3RTtBQUNoRyxRQUFNRSxlQUFjRixVQUFTQSxVQUFTLFlBQVksR0FBRyxXQUFXO0FBQ2hFLFFBQU0sS0FBS0UsY0FBYTtBQUN4QixTQUFPLE9BQU8sT0FBTyxXQUFXLEtBQUs7QUFDdkM7QUFFQSxTQUFTLGlCQUFvQixjQUFzQyxRQUEwQjtBQUMzRixRQUFNLEtBQUtGLFVBQVMsWUFBWSxJQUFJLE1BQU07QUFDMUMsTUFBSSxPQUFPLE9BQU8sV0FBWSxRQUFPO0FBQ3JDLE1BQUk7QUFDRixXQUFPLEdBQUcsS0FBSyxZQUFZO0FBQUEsRUFDN0IsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7OztBRWx0Qk8sSUFBTSxnQ0FDWDtBQXNDRixJQUFNLGlCQUFpQjtBQUN2QixJQUFNLGNBQWM7QUFHYixTQUFTLG9CQUFvQixPQUF1QjtBQUN6RCxRQUFNLE1BQU0sTUFBTSxLQUFLO0FBQ3ZCLE1BQUksQ0FBQyxJQUFLLE9BQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUVuRCxRQUFNLE1BQU0sK0NBQStDLEtBQUssR0FBRztBQUNuRSxNQUFJLElBQUssUUFBTyxrQkFBa0IsSUFBSSxDQUFDLENBQUM7QUFFeEMsTUFBSSxnQkFBZ0IsS0FBSyxHQUFHLEdBQUc7QUFDN0IsVUFBTSxNQUFNLElBQUksSUFBSSxHQUFHO0FBQ3ZCLFFBQUksSUFBSSxhQUFhLGFBQWMsT0FBTSxJQUFJLE1BQU0sNENBQTRDO0FBQy9GLFVBQU0sUUFBUSxJQUFJLFNBQVMsUUFBUSxjQUFjLEVBQUUsRUFBRSxNQUFNLEdBQUc7QUFDOUQsUUFBSSxNQUFNLFNBQVMsRUFBRyxPQUFNLElBQUksTUFBTSxtREFBbUQ7QUFDekYsV0FBTyxrQkFBa0IsR0FBRyxNQUFNLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEVBQUU7QUFBQSxFQUNwRDtBQUVBLFNBQU8sa0JBQWtCLEdBQUc7QUFDOUI7QUFFTyxTQUFTLHVCQUF1QixPQUFvQztBQUN6RSxRQUFNLFdBQVc7QUFDakIsTUFBSSxDQUFDLFlBQVksU0FBUyxrQkFBa0IsS0FBSyxDQUFDLE1BQU0sUUFBUSxTQUFTLE9BQU8sR0FBRztBQUNqRixVQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFBQSxFQUNwRDtBQUNBLFFBQU0sVUFBVSxTQUFTLFFBQVEsSUFBSSxtQkFBbUI7QUFDeEQsVUFBUSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxLQUFLLGNBQWMsRUFBRSxTQUFTLElBQUksQ0FBQztBQUNyRSxTQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsSUFDZixhQUFhLE9BQU8sU0FBUyxnQkFBZ0IsV0FBVyxTQUFTLGNBQWM7QUFBQSxJQUMvRTtBQUFBLEVBQ0Y7QUFDRjtBQUVPLFNBQVMsb0JBQ2QsU0FDQSxjQUFnRCxDQUFDLGlCQUFpQixLQUFLLE1BQU0sS0FBSyxPQUFPLElBQUksWUFBWSxHQUNwRztBQUNMLFFBQU0sV0FBVyxDQUFDLEdBQUcsT0FBTztBQUM1QixXQUFTLElBQUksU0FBUyxTQUFTLEdBQUcsSUFBSSxHQUFHLEtBQUssR0FBRztBQUMvQyxVQUFNLElBQUksWUFBWSxJQUFJLENBQUM7QUFDM0IsUUFBSSxDQUFDLE9BQU8sVUFBVSxDQUFDLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRztBQUMxQyxZQUFNLElBQUksTUFBTSxnQ0FBZ0MsQ0FBQyxtQ0FBbUMsQ0FBQyxFQUFFO0FBQUEsSUFDekY7QUFDQSxLQUFDLFNBQVMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ3hEO0FBQ0EsU0FBTztBQUNUO0FBRU8sU0FBUyxvQkFBb0IsT0FBaUM7QUFDbkUsUUFBTSxRQUFRO0FBQ2QsTUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFNBQVUsT0FBTSxJQUFJLE1BQU0sMkJBQTJCO0FBQ3BGLFFBQU0sT0FBTyxvQkFBb0IsT0FBTyxNQUFNLFFBQVEsTUFBTSxVQUFVLGNBQWMsRUFBRSxDQUFDO0FBQ3ZGLFFBQU0sV0FBVyxNQUFNO0FBQ3ZCLE1BQUksQ0FBQyxVQUFVLE1BQU0sQ0FBQyxTQUFTLFFBQVEsQ0FBQyxTQUFTLFNBQVM7QUFDeEQsVUFBTSxJQUFJLE1BQU0sbUJBQW1CLElBQUksNkJBQTZCO0FBQUEsRUFDdEU7QUFDQSxNQUFJLG9CQUFvQixTQUFTLFVBQVUsTUFBTSxNQUFNO0FBQ3JELFVBQU0sSUFBSSxNQUFNLGVBQWUsU0FBUyxFQUFFLDBDQUEwQztBQUFBLEVBQ3RGO0FBQ0EsTUFBSSxDQUFDLGdCQUFnQixPQUFPLE1BQU0scUJBQXFCLEVBQUUsQ0FBQyxHQUFHO0FBQzNELFVBQU0sSUFBSSxNQUFNLGVBQWUsU0FBUyxFQUFFLHNDQUFzQztBQUFBLEVBQ2xGO0FBQ0EsU0FBTztBQUFBLElBQ0wsSUFBSSxTQUFTO0FBQUEsSUFDYjtBQUFBLElBQ0E7QUFBQSxJQUNBLG1CQUFtQixPQUFPLE1BQU0saUJBQWlCO0FBQUEsSUFDakQsWUFBWSxPQUFPLE1BQU0sZUFBZSxXQUFXLE1BQU0sYUFBYTtBQUFBLElBQ3RFLFlBQVksT0FBTyxNQUFNLGVBQWUsV0FBVyxNQUFNLGFBQWE7QUFBQSxJQUN0RSxXQUFXLHdCQUF5QixNQUFrQyxTQUFTO0FBQUEsSUFDL0UsWUFBWSxrQkFBa0IsTUFBTSxVQUFVO0FBQUEsSUFDOUMsV0FBVyxrQkFBa0IsTUFBTSxTQUFTO0FBQUEsRUFDOUM7QUFDRjtBQUVPLFNBQVMsZ0JBQWdCLE9BQWdDO0FBQzlELE1BQUksQ0FBQyxnQkFBZ0IsTUFBTSxpQkFBaUIsR0FBRztBQUM3QyxVQUFNLElBQUksTUFBTSxlQUFlLE1BQU0sRUFBRSxxQ0FBcUM7QUFBQSxFQUM5RTtBQUNBLFNBQU8sK0JBQStCLE1BQU0sSUFBSSxXQUFXLE1BQU0saUJBQWlCO0FBQ3BGO0FBaURPLFNBQVMsZ0JBQWdCLE9BQXdCO0FBQ3RELFNBQU8sWUFBWSxLQUFLLEtBQUs7QUFDL0I7QUFFQSxTQUFTLGtCQUFrQixPQUF1QjtBQUNoRCxRQUFNLE9BQU8sTUFBTSxLQUFLLEVBQUUsUUFBUSxXQUFXLEVBQUUsRUFBRSxRQUFRLGNBQWMsRUFBRTtBQUN6RSxNQUFJLENBQUMsZUFBZSxLQUFLLElBQUksRUFBRyxPQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFDeEYsU0FBTztBQUNUO0FBRUEsU0FBUyx3QkFBd0IsT0FBa0Q7QUFDakYsTUFBSSxVQUFVLE9BQVcsUUFBTztBQUNoQyxNQUFJLENBQUMsTUFBTSxRQUFRLEtBQUssRUFBRyxPQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFDbkYsUUFBTSxVQUFVLG9CQUFJLElBQXdCLENBQUMsVUFBVSxTQUFTLE9BQU8sQ0FBQztBQUN4RSxRQUFNLFlBQVksTUFBTSxLQUFLLElBQUksSUFBSSxNQUFNLElBQUksQ0FBQyxVQUFVO0FBQ3hELFFBQUksT0FBTyxVQUFVLFlBQVksQ0FBQyxRQUFRLElBQUksS0FBMkIsR0FBRztBQUMxRSxZQUFNLElBQUksTUFBTSwrQkFBK0IsT0FBTyxLQUFLLENBQUMsRUFBRTtBQUFBLElBQ2hFO0FBQ0EsV0FBTztBQUFBLEVBQ1QsQ0FBQyxDQUFDLENBQUM7QUFDSCxTQUFPLFVBQVUsU0FBUyxJQUFJLFlBQVk7QUFDNUM7QUFFQSxTQUFTLGtCQUFrQixPQUFvQztBQUM3RCxNQUFJLE9BQU8sVUFBVSxZQUFZLENBQUMsTUFBTSxLQUFLLEVBQUcsUUFBTztBQUN2RCxRQUFNLE1BQU0sSUFBSSxJQUFJLEtBQUs7QUFDekIsTUFBSSxJQUFJLGFBQWEsWUFBWSxJQUFJLGFBQWEsYUFBYyxRQUFPO0FBQ3ZFLFNBQU8sSUFBSSxTQUFTO0FBQ3RCOzs7QUN6TUEsSUFBQUcsbUJBQTBGO0FBQzFGLElBQUFDLHNCQUF1QztBQUN2QyxJQUFBQyxrQkFBbUQ7QUFDbkQsdUJBQXFGO0FBQ3JGLElBQUFDLG9CQUEwQztBQUcxQyxJQUFNLHVCQUF1QjtBQUM3QixJQUFNLHlCQUF5QjtBQUMvQixJQUFNLDBCQUEwQjtBQUNoQyxJQUFNLDJCQUEyQjtBQUNqQyxJQUFNLHlCQUF5QjtBQUMvQixJQUFNLHVCQUF1QjtBQTJFN0IsSUFBTSxhQUFxQztBQUFBLEVBQ3pDLFNBQVM7QUFBQSxFQUNULE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFBQSxFQUNULFFBQVE7QUFBQSxFQUNSLFFBQVE7QUFBQSxFQUNSLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFBQSxFQUNULFNBQVM7QUFBQSxFQUNULFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFDWjtBQUVBLElBQUksZUFBOEI7QUFDbEMsSUFBSSxhQUFtQztBQUN2QyxJQUFJLGdCQUErQztBQUNuRCxJQUFNLGlCQUFpQixvQkFBSSxJQUFrQztBQUM3RCxJQUFNLGlCQUFpQixvQkFBSSxJQUF5QjtBQUU3QyxTQUFTLDBCQUNkLE1BQ007QUFDTixNQUFJLFFBQVEsSUFBSSx1QkFBdUIsSUFBSztBQUM1QyxRQUFNLE9BQU8sVUFBVSxRQUFRLElBQUkseUJBQXlCLElBQUk7QUFDaEUsdUJBQXFCO0FBQUEsSUFDbkIsR0FBRztBQUFBLElBQ0g7QUFBQSxJQUNBLE1BQU07QUFBQSxJQUNOLGdCQUFnQixRQUFRLElBQUksaUNBQWlDO0FBQUEsRUFDL0QsQ0FBQztBQUNIO0FBRU8sU0FBUyxxQkFBcUIsTUFBb0M7QUFDdkUsTUFBSSxhQUFjO0FBQ2xCLGtCQUFnQjtBQUNoQiw4QkFBNEIsS0FBSyxHQUFHO0FBRXBDLFFBQU0sYUFBUywrQkFBYSxDQUFDLEtBQUssUUFBUTtBQUN4QyxzQkFBa0IsS0FBSyxHQUFHLEVBQUUsTUFBTSxDQUFDLFVBQVU7QUFDM0MsV0FBSyxJQUFJLFNBQVMsNkJBQTZCLEVBQUUsU0FBUyxNQUFNLFFBQVEsQ0FBQztBQUN6RSxlQUFTLEtBQUssS0FBSywyQkFBMkIsMkJBQTJCO0FBQUEsSUFDM0UsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNELFNBQU8sR0FBRyxXQUFXLENBQUMsS0FBSyxRQUFRLFNBQVM7QUFDMUMsa0JBQWMsS0FBSyxRQUFrQixJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVU7QUFDMUQsV0FBSyxJQUFJLFFBQVEsdUNBQXVDLEVBQUUsU0FBUyxNQUFNLFFBQVEsQ0FBQztBQUNsRixhQUFPLFFBQVE7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0QsU0FBTyxHQUFHLFNBQVMsQ0FBQyxVQUFVO0FBQzVCLFNBQUssSUFBSSxTQUFTLDRCQUE0QixFQUFFLFNBQVMsTUFBTSxRQUFRLENBQUM7QUFBQSxFQUMxRSxDQUFDO0FBQ0QsU0FBTyxPQUFPLEtBQUssTUFBTSxLQUFLLE1BQU0sTUFBTTtBQUN4QyxTQUFLLElBQUksUUFBUSx5Q0FBeUMsS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUc7QUFBQSxFQUNyRixDQUFDO0FBQ0QsaUJBQWU7QUFDZixNQUFJLEtBQUssZ0JBQWdCO0FBQ3ZCLGVBQVcsV0FBVyxDQUFDLEtBQUssTUFBTyxHQUFLLEdBQUc7QUFDekMsWUFBTSxRQUFRLFdBQVcseUJBQXlCLE9BQU87QUFDekQsWUFBTSxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLDRCQUE0QkMsTUFBa0I7QUFDckQsMkJBQVEsbUJBQW1CLHVCQUF1QjtBQUNsRCwyQkFBUSxtQkFBbUIsd0JBQXdCO0FBQ25ELDJCQUFRLG1CQUFtQixzQkFBc0I7QUFDakQsMkJBQVEsbUJBQW1CLG9CQUFvQjtBQUUvQywyQkFBUSxHQUFHLHlCQUF5QixDQUFDLE9BQU8sWUFBWTtBQUN0RCxRQUFJLENBQUMsc0JBQXNCLE1BQU0sTUFBTSxFQUFHO0FBQzFDLFVBQU0sV0FBV0MsVUFBUyxPQUFPO0FBQ2pDLFVBQU0sS0FBSyxPQUFPLFVBQVUsT0FBTyxXQUFXLFNBQVMsS0FBSztBQUM1RCxVQUFNLFVBQVUsZUFBZSxJQUFJLEVBQUU7QUFDckMsUUFBSSxDQUFDLFFBQVM7QUFDZCxtQkFBZSxPQUFPLEVBQUU7QUFDeEIsaUJBQWEsUUFBUSxLQUFLO0FBQzFCLFFBQUksVUFBVSxPQUFPLE1BQU07QUFDekIsY0FBUSxRQUFRLFNBQVMsS0FBSztBQUFBLElBQ2hDLE9BQU87QUFDTCxjQUFRLE9BQU8sSUFBSSxNQUFNLE9BQU8sVUFBVSxVQUFVLFdBQVcsU0FBUyxRQUFRLHVCQUF1QixDQUFDO0FBQUEsSUFDMUc7QUFBQSxFQUNGLENBQUM7QUFFRCwyQkFBUSxHQUFHLDBCQUEwQixDQUFDLE9BQU8sWUFBWTtBQUN2RCxRQUFJLENBQUMsc0JBQXNCLE1BQU0sTUFBTSxFQUFHO0FBQzFDLHFCQUFpQixFQUFFLE1BQU0sb0JBQW9CLFFBQVEsQ0FBQztBQUFBLEVBQ3hELENBQUM7QUFFRCwyQkFBUSxHQUFHLHdCQUF3QixDQUFDLE9BQU8sVUFBVSxZQUFZO0FBQy9ELFFBQUksQ0FBQyxzQkFBc0IsTUFBTSxNQUFNLEVBQUc7QUFDMUMsUUFBSSxPQUFPLGFBQWEsU0FBVTtBQUNsQyxxQkFBaUIsRUFBRSxNQUFNLGtCQUFrQixVQUFVLFFBQVEsQ0FBQztBQUFBLEVBQ2hFLENBQUM7QUFFRCwyQkFBUSxHQUFHLHNCQUFzQixDQUFDLE9BQU8sVUFBVTtBQUNqRCxRQUFJLENBQUMsc0JBQXNCLE1BQU0sTUFBTSxFQUFHO0FBQzFDLHFCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLE1BQU0sQ0FBQztBQUFBLEVBQ2xFLENBQUM7QUFFRCxVQUFRLEtBQUssUUFBUSxNQUFNO0FBQ3pCLGVBQVcsV0FBVyxlQUFlLE9BQU8sR0FBRztBQUM3QyxtQkFBYSxRQUFRLEtBQUs7QUFDMUIsY0FBUSxPQUFPLElBQUksTUFBTSxtQ0FBbUMsQ0FBQztBQUFBLElBQy9EO0FBQ0EsbUJBQWUsTUFBTTtBQUNyQixlQUFXLFVBQVUsZUFBZ0IsUUFBTyxNQUFNO0FBQ2xELG1CQUFlLE1BQU07QUFDckIsUUFBSTtBQUNGLFVBQUksY0FBYyxDQUFDLFdBQVcsWUFBWSxZQUFZLEdBQUc7QUFDdkQsbUJBQVcsWUFBWSxNQUFNLEVBQUUscUJBQXFCLE1BQU0sQ0FBQztBQUFBLE1BQzdEO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZCxNQUFBRCxLQUFJLFFBQVEsa0NBQWtDLEVBQUUsU0FBUyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBQUEsSUFDMUU7QUFBQSxFQUNGLENBQUM7QUFDSDtBQUVBLGVBQWUsa0JBQWtCLEtBQXNCLEtBQW9DO0FBQ3pGLFFBQU0sVUFBVSxlQUFlO0FBQy9CLFFBQU0sTUFBTSxXQUFXLEdBQUc7QUFDMUIsTUFBSSxDQUFDLEtBQUs7QUFDUixhQUFTLEtBQUssS0FBSyxpQkFBaUIsMkJBQTJCO0FBQy9EO0FBQUEsRUFDRjtBQUVBLE1BQUksSUFBSSxhQUFhLDhCQUE4QjtBQUNqRCxhQUFTLEtBQUssS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDO0FBQy9CO0FBQUEsRUFDRjtBQUVBLE1BQUksSUFBSSxhQUFhLDhCQUE4QjtBQUNqRCxRQUFJLElBQUksV0FBVyxRQUFRO0FBQ3pCLGVBQVMsS0FBSyxLQUFLLHdCQUF3QiwyQkFBMkI7QUFDdEU7QUFBQSxJQUNGO0FBQ0EsVUFBTSxPQUFPQyxVQUFTLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFDN0MsVUFBTSxTQUFTLE9BQU8sTUFBTSxXQUFXLFdBQVcsS0FBSyxTQUFTO0FBQ2hFLFVBQU0sT0FBTyxNQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksS0FBSyxPQUFPLENBQUM7QUFDdEQsUUFBSTtBQUNGLFlBQU0sUUFBUSxNQUFNLGlCQUFpQixRQUFRLElBQUk7QUFDakQsZUFBUyxLQUFLLEtBQUssRUFBRSxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDeEMsU0FBUyxPQUFPO0FBQ2QsZUFBUyxLQUFLLEtBQUs7QUFBQSxRQUNqQixJQUFJO0FBQUEsUUFDSixPQUFPLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFBQSxNQUM5RCxDQUFDO0FBQUEsSUFDSDtBQUNBO0FBQUEsRUFDRjtBQUVBLE1BQUksSUFBSSxhQUFhLGlDQUFpQztBQUNwRCxRQUFJLElBQUksV0FBVyxTQUFTLElBQUksV0FBVyxRQUFRO0FBQ2pELGVBQVMsS0FBSyxLQUFLLHdCQUF3QiwyQkFBMkI7QUFDdEU7QUFBQSxJQUNGO0FBQ0EsVUFBTSxTQUFTLG9CQUFvQixNQUFNLG9CQUFvQixPQUFPLENBQUM7QUFDckUsZUFBVyxLQUFLLEtBQUssT0FBTyxLQUFLLE1BQU0sR0FBRyxXQUFXLEtBQUssR0FBRyxJQUFJLFdBQVcsTUFBTTtBQUNsRjtBQUFBLEVBQ0Y7QUFFQSxNQUFJLElBQUksV0FBVyxTQUFTLElBQUksV0FBVyxRQUFRO0FBQ2pELGFBQVMsS0FBSyxLQUFLLHdCQUF3QiwyQkFBMkI7QUFDdEU7QUFBQSxFQUNGO0FBRUEsTUFBSSxJQUFJLGFBQWEsT0FBTyxJQUFJLGFBQWEsZUFBZTtBQUMxRCxVQUFNLE9BQU8sTUFBTSxpQkFBaUIsT0FBTztBQUMzQyxlQUFXLEtBQUssS0FBSyxPQUFPLEtBQUssSUFBSSxHQUFHLFdBQVcsT0FBTyxHQUFHLElBQUksV0FBVyxNQUFNO0FBQ2xGO0FBQUEsRUFDRjtBQUVBLFFBQU0sT0FBTyxZQUFZLElBQUksUUFBUTtBQUNyQyxNQUFJLENBQUMsTUFBTTtBQUNULGFBQVMsS0FBSyxLQUFLLGVBQWUsMkJBQTJCO0FBQzdEO0FBQUEsRUFDRjtBQUNBLFFBQU0sY0FBVSw4QkFBYSxJQUFJO0FBQ2pDLGFBQVcsS0FBSyxLQUFLLFNBQVMsU0FBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLE1BQU07QUFDckU7QUFFQSxlQUFlLGNBQWMsS0FBc0IsUUFBZ0IsTUFBNkI7QUFDOUYsUUFBTSxNQUFNLFdBQVcsR0FBRztBQUMxQixNQUFJLENBQUMsSUFBSyxPQUFNLElBQUksTUFBTSxtQkFBbUI7QUFDN0MsTUFBSSxJQUFJLGFBQWEsNkJBQTZCLElBQUksYUFBYSwrQkFBK0I7QUFDaEcsV0FBTyxRQUFRO0FBQ2Y7QUFBQSxFQUNGO0FBQ0EsUUFBTSxLQUFLLGdCQUFnQixLQUFLLFFBQVEsSUFBSTtBQUM1QyxNQUFJLElBQUksYUFBYSwrQkFBK0I7QUFDbEQsbUJBQWUsSUFBSSxFQUFFO0FBQ3JCLE9BQUcsUUFBUSxNQUFNLGVBQWUsT0FBTyxFQUFFLENBQUM7QUFDMUMsT0FBRyxTQUFTLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDN0I7QUFBQSxFQUNGO0FBRUEsUUFBTSxPQUFPLE1BQU0sb0JBQW9CO0FBQ3ZDLFFBQU0sRUFBRSxPQUFPLE1BQU0sSUFBSSxJQUFJLG9DQUFtQjtBQUNoRCxPQUFLLFlBQVksWUFBWSxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQzlELCtCQUE2QixPQUFPLEVBQUU7QUFDeEM7QUFFQSxlQUFlLGlCQUFpQixTQUFrRDtBQUNoRixRQUFNLGdCQUFZLHdCQUFLLFlBQVksR0FBRyxZQUFZO0FBQ2xELE1BQUksT0FBTyxzQkFBa0IsOEJBQWEsV0FBVyxNQUFNLENBQUM7QUFDNUQsUUFBTSxPQUFPO0FBQ2IsTUFBSSxLQUFLLFNBQVMsU0FBUyxHQUFHO0FBQzVCLFdBQU8sS0FBSyxRQUFRLFdBQVcsR0FBRyxJQUFJO0FBQUEsVUFBYTtBQUFBLEVBQ3JELE9BQU87QUFDTCxXQUFPLEdBQUcsSUFBSTtBQUFBLEVBQUssSUFBSTtBQUFBLEVBQ3pCO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxrQkFBa0IsTUFBc0I7QUFDL0MsU0FBTyxLQUFLO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxRQUFRLFFBQWdCLFNBQWlCLFdBQW1CO0FBQzNELFlBQU0sYUFBYSxtQkFBbUIsb0JBQW9CLE9BQU8sQ0FBQztBQUNsRSxpQkFBVyxJQUFJLGFBQWEsaUNBQWlDO0FBQzdELGlCQUFXLElBQUksYUFBYSxpQ0FBaUM7QUFDN0QsaUJBQVcsSUFBSSxlQUFlLDBDQUEwQztBQUN4RSxhQUFPLEdBQUcsTUFBTSxHQUFHLG9CQUFvQixvQkFBb0IsVUFBVSxDQUFDLENBQUMsR0FBRyxNQUFNO0FBQUEsSUFDbEY7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLG1CQUFtQixTQUFzQztBQUNoRSxRQUFNLGFBQWEsb0JBQUksSUFBb0I7QUFDM0MsYUFBVyxRQUFRLFFBQVEsTUFBTSxHQUFHLEdBQUc7QUFDckMsVUFBTSxVQUFVLEtBQUssS0FBSztBQUMxQixRQUFJLENBQUMsUUFBUztBQUNkLFVBQU0sQ0FBQyxNQUFNLEdBQUcsSUFBSSxJQUFJLFFBQVEsTUFBTSxLQUFLO0FBQzNDLFFBQUksQ0FBQyxLQUFNO0FBQ1gsZUFBVyxJQUFJLE1BQU0sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQ3JDO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxvQkFBb0IsWUFBeUM7QUFDcEUsU0FBTyxDQUFDLEdBQUcsV0FBVyxRQUFRLENBQUMsRUFDNUIsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLE1BQU8sUUFBUSxHQUFHLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSyxFQUMxRCxLQUFLLElBQUk7QUFDZDtBQUVBLFNBQVMsb0JBQW9CLE9BQXVCO0FBQ2xELFNBQU8sTUFDSixRQUFRLFdBQVcsR0FBRyxFQUN0QixRQUFRLFVBQVUsR0FBRyxFQUNyQixRQUFRLFNBQVMsR0FBRyxFQUNwQixRQUFRLFNBQVMsR0FBRyxFQUNwQixRQUFRLFVBQVUsR0FBRztBQUMxQjtBQUVBLFNBQVMsb0JBQW9CLE9BQXVCO0FBQ2xELFNBQU8sTUFDSixRQUFRLE1BQU0sT0FBTyxFQUNyQixRQUFRLE1BQU0sUUFBUTtBQUMzQjtBQUVBLGVBQWUsb0JBQW9CLFNBQXdEO0FBQ3pGLFFBQU0sb0JBQW9CO0FBQzFCLFFBQU0sQ0FBQyxVQUFVLG9CQUFvQixtQkFBbUIsYUFBYSxlQUFlLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxJQUN4RyxpQkFBaUIsWUFBWSxDQUFDLENBQUM7QUFBQSxJQUMvQixpQkFBaUIsZUFBZSxDQUFDLENBQUM7QUFBQSxJQUNsQyxpQkFBaUIsaUJBQWlCLENBQUMsQ0FBQztBQUFBLElBQ3BDLGlCQUFpQixlQUFlLENBQUMsQ0FBQztBQUFBLElBQ2xDLGlCQUFpQixtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsRUFDeEMsQ0FBQztBQUNELE1BQUksUUFBUSxlQUFnQix5QkFBd0I7QUFDcEQsU0FBTztBQUFBLElBQ0wsVUFBVSxjQUFjLFFBQVE7QUFBQSxJQUNoQyxvQkFBb0IsT0FBTyx1QkFBdUIsV0FBVyxxQkFBcUIsMEJBQTBCO0FBQUEsSUFDNUc7QUFBQSxJQUNBO0FBQUEsSUFDQSxpQkFBaUIsb0JBQW9CO0FBQUEsSUFDckMsVUFBVSxRQUFRO0FBQUEsSUFDbEIsTUFBTSxRQUFRO0FBQUEsRUFDaEI7QUFDRjtBQUVBLGVBQWUsc0JBQThDO0FBQzNELE1BQUksY0FBYyxDQUFDLFdBQVcsWUFBWSxZQUFZLEVBQUcsUUFBTztBQUNoRSxRQUFNLFVBQVUsZUFBZTtBQUMvQixRQUFNLFdBQVcsTUFBTSxzQkFBc0IsT0FBTztBQUNwRCxRQUFNLGdCQUFnQixTQUFTO0FBQy9CLE1BQUksQ0FBQyxlQUFlLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksTUFBTSxvREFBb0Q7QUFBQSxFQUN0RTtBQUVBLFFBQU0sT0FBTyxJQUFJLDZCQUFZO0FBQUEsSUFDM0IsZ0JBQWdCO0FBQUEsTUFDZCxTQUFTLGNBQWMsU0FBUztBQUFBLE1BQ2hDLGtCQUFrQjtBQUFBLE1BQ2xCLGlCQUFpQjtBQUFBLE1BQ2pCLFlBQVk7QUFBQSxNQUNaLFVBQVUsY0FBYyxTQUFTO0FBQUEsSUFDbkM7QUFBQSxFQUNGLENBQUM7QUFDRCxRQUFNLGFBQWEsc0JBQXNCLElBQUk7QUFDN0MsZ0JBQWMsZUFBZSxZQUFZLFNBQVMsT0FBTyxXQUFXO0FBQ3BFLFFBQU0sVUFBVSxTQUFTLDJCQUEyQixLQUFLLFdBQVcsS0FBSyxTQUFTLGFBQWEsT0FBTztBQUN0RyxXQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFFBQU0sS0FBSyxZQUFZLFFBQVEsYUFBYTtBQUM1QyxlQUFhLEVBQUUsTUFBTSxhQUFhLEtBQUssWUFBWTtBQUNuRCxPQUFLLFlBQVksS0FBSyxhQUFhLE1BQU07QUFDdkMsUUFBSSxZQUFZLGdCQUFnQixLQUFLLFlBQWEsY0FBYTtBQUFBLEVBQ2pFLENBQUM7QUFDRCxVQUFRLElBQUksUUFBUSxnQ0FBZ0MsRUFBRSxlQUFlLEtBQUssWUFBWSxHQUFHLENBQUM7QUFDMUYsU0FBTztBQUNUO0FBRUEsZUFBZSxzQkFBc0IsU0FBK0Q7QUFDbEcsUUFBTSxVQUFVLEtBQUssSUFBSTtBQUN6QixTQUFPLEtBQUssSUFBSSxJQUFJLFVBQVUsS0FBUTtBQUNwQyxVQUFNLFdBQVcsUUFBUSxrQkFBa0I7QUFDM0MsUUFDRSxVQUFVLGVBQWUsbUJBQ3hCLFNBQVMsY0FBYyxTQUFTLDJCQUNqQztBQUNBLGFBQU87QUFBQSxJQUNUO0FBQ0EsVUFBTSxNQUFNLEdBQUc7QUFBQSxFQUNqQjtBQUNBLFFBQU0sSUFBSSxNQUFNLDZDQUE2QztBQUMvRDtBQUVBLFNBQVMsaUJBQWlCLFFBQWdCLE1BQW1DO0FBQzNFLHFCQUFtQixNQUFNO0FBQ3pCLFNBQU8sb0JBQW9CLEVBQUUsS0FBSyxDQUFDLFNBQVM7QUFDMUMsVUFBTSxTQUFLLGdDQUFXO0FBQ3RCLFdBQU8sSUFBSSxRQUFRLENBQUNDLFVBQVMsV0FBVztBQUN0QyxZQUFNLFFBQVEsV0FBVyxNQUFNO0FBQzdCLHVCQUFlLE9BQU8sRUFBRTtBQUN4QixlQUFPLElBQUksTUFBTSxtREFBbUQsTUFBTSxFQUFFLENBQUM7QUFBQSxNQUMvRSxHQUFHLElBQU07QUFDVCxxQkFBZSxJQUFJLElBQUksRUFBRSxTQUFBQSxVQUFTLFFBQVEsTUFBTSxDQUFDO0FBQ2pELFdBQUssWUFBWSxLQUFLLHdCQUF3QixFQUFFLElBQUksUUFBUSxLQUFLLENBQUM7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0g7QUFFQSxTQUFTLDZCQUE2QixNQUFnQyxJQUErQjtBQUNuRyxNQUFJLFNBQVM7QUFDYixRQUFNLFFBQVEsTUFBTTtBQUNsQixRQUFJLE9BQVE7QUFDWixhQUFTO0FBQ1QsUUFBSTtBQUNGLFdBQUssWUFBWSxJQUFJO0FBQUEsSUFDdkIsUUFBUTtBQUFBLElBQUM7QUFDVCxRQUFJO0FBQ0YsV0FBSyxNQUFNO0FBQUEsSUFDYixRQUFRO0FBQUEsSUFBQztBQUNULE9BQUcsTUFBTTtBQUFBLEVBQ1g7QUFDQSxPQUFLLE1BQU07QUFDWCxPQUFLLEdBQUcsV0FBVyxDQUFDLFVBQVU7QUFDNUIsUUFBSSxPQUFRO0FBQ1osUUFBSSxNQUFNLFFBQVEsTUFBTTtBQUN0QixZQUFNO0FBQ047QUFBQSxJQUNGO0FBQ0EsUUFBSSxPQUFPLE1BQU0sU0FBUyxVQUFVO0FBQ2xDLFNBQUcsU0FBUyxNQUFNLElBQUk7QUFBQSxJQUN4QjtBQUFBLEVBQ0YsQ0FBQztBQUNELE9BQUssR0FBRyxTQUFTLEtBQUs7QUFDdEIsS0FBRyxPQUFPLENBQUMsU0FBUztBQUNsQixRQUFJLE9BQVE7QUFDWixTQUFLLFlBQVksSUFBSTtBQUFBLEVBQ3ZCLENBQUM7QUFDRCxLQUFHLFFBQVEsS0FBSztBQUNsQjtBQUVBLFNBQVMsaUJBQWlCLFNBQXdCO0FBQ2hELGFBQVcsVUFBVSxDQUFDLEdBQUcsY0FBYyxHQUFHO0FBQ3hDLFFBQUk7QUFDRixhQUFPLFNBQVMsT0FBTztBQUFBLElBQ3pCLFFBQVE7QUFDTixhQUFPLE1BQU07QUFDYixxQkFBZSxPQUFPLE1BQU07QUFBQSxJQUM5QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsb0JBQW9CLE9BQTZCO0FBQ3hELFNBQU87QUFBQTtBQUFBLHlCQUVnQixTQUFTLEtBQUssQ0FBQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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T0FBTyxVQUFVLFlBQVksT0FBTyxTQUFTLEtBQUssQ0FBQyxHQUFHO0FBQ2pGLFVBQU0sSUFBSSxNQUFNLDREQUE0RDtBQUFBLEVBQzlFO0FBQ0EsTUFBSSxPQUFPLFFBQVEsS0FBSyxPQUFPLFNBQVMsR0FBRztBQUN6QyxVQUFNLElBQUksTUFBTSw4Q0FBOEM7QUFBQSxFQUNoRTtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfZWxlY3Ryb24iLCAiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfY2hpbGRfcHJvY2VzcyIsICJpbXBvcnRfbm9kZV9jcnlwdG8iLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfbm9kZV9vcyIsICJpbXBvcnRfZnMiLCAiaW1wb3J0X3Byb21pc2VzIiwgInN5c1BhdGgiLCAicHJlc29sdmUiLCAiYmFzZW5hbWUiLCAicGpvaW4iLCAicHJlbGF0aXZlIiwgInBzZXAiLCAiaW1wb3J0X3Byb21pc2VzIiwgIm9zVHlwZSIsICJmc193YXRjaCIsICJyYXdFbWl0dGVyIiwgImxpc3RlbmVyIiwgImJhc2VuYW1lIiwgImRpcm5hbWUiLCAibmV3U3RhdHMiLCAiY2xvc2VyIiwgImZzcmVhbHBhdGgiLCAicmVzb2x2ZSIsICJyZWFscGF0aCIsICJzdGF0cyIsICJyZWxhdGl2ZSIsICJET1VCTEVfU0xBU0hfUkUiLCAidGVzdFN0cmluZyIsICJwYXRoIiwgInN0YXRzIiwgInN0YXRjYiIsICJub3ciLCAic3RhdCIsICJpbXBvcnRfbm9kZV9wYXRoIiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfbm9kZV9mcyIsICJpbXBvcnRfbm9kZV9wYXRoIiwgInVzZXJSb290IiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaW1wb3J0X2VsZWN0cm9uIiwgImltcG9ydF9ub2RlX2NoaWxkX3Byb2Nlc3MiLCAiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJsb2ciLCAiZXhwb3J0cyIsICJhc1JlY29yZCIsICJyZXNvbHZlIiwgIndlYkNvbnRlbnRzIiwgImltcG9ydF9lbGVjdHJvbiIsICJpbXBvcnRfbm9kZV9jcnlwdG8iLCAiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJsb2ciLCAiYXNSZWNvcmQiLCAicmVzb2x2ZSIsICJpc1BhdGhJbnNpZGUiLCAiZXhwb3J0cyIsICJpbmZlck1hY0FwcFJvb3QiLCAicGxhdGZvcm0iLCAic3RhdCIsICJhc1JlY29yZCIsICJhc3NlcnRCcmlkZ2VJZCIsICJpc1dpbmRvd0Rlc3Ryb3llZCIsICJ3aW5kb3dJZEZvciIsICJtYWtlV2luZG93TGlrZUZvclZpZXciXQp9Cg==
