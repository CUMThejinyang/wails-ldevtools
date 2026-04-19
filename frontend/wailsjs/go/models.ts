export namespace cleaner {
	
	export class FolderConfig {
	    id: string;
	    name: string;
	    path: string;
	    patterns: string[];
	    recursive: boolean;
	    deleteEmptyDirs: boolean;
	    deleteFolder: boolean;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FolderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.patterns = source["patterns"];
	        this.recursive = source["recursive"];
	        this.deleteEmptyDirs = source["deleteEmptyDirs"];
	        this.deleteFolder = source["deleteFolder"];
	        this.enabled = source["enabled"];
	    }
	}
	export class PreviewItem {
	    folderId: string;
	    folderName: string;
	    filePath: string;
	    size: number;
	    isDir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PreviewItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folderId = source["folderId"];
	        this.folderName = source["folderName"];
	        this.filePath = source["filePath"];
	        this.size = source["size"];
	        this.isDir = source["isDir"];
	    }
	}
	export class Settings {
	    folders: FolderConfig[];
	    threadCount: number;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = this.convertValues(source["folders"], FolderConfig);
	        this.threadCount = source["threadCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace envreg {
	
	export class BackupMeta {
	    id: string;
	    timestamp: number;
	    note?: string;
	    userCount: number;
	    systemCount: number;
	    corrupt?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BackupMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = source["timestamp"];
	        this.note = source["note"];
	        this.userCount = source["userCount"];
	        this.systemCount = source["systemCount"];
	        this.corrupt = source["corrupt"];
	    }
	}
	export class EnvEntry {
	    name: string;
	    value: string;
	    type: string;
	    scope: string;
	
	    static createFrom(source: any = {}) {
	        return new EnvEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.type = source["type"];
	        this.scope = source["scope"];
	    }
	}
	export class BackupSnapshot {
	    timestamp: number;
	    note?: string;
	    user: EnvEntry[];
	    system: EnvEntry[];
	
	    static createFrom(source: any = {}) {
	        return new BackupSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.note = source["note"];
	        this.user = this.convertValues(source["user"], EnvEntry);
	        this.system = this.convertValues(source["system"], EnvEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OperationResult {
	    ok: boolean;
	    cancelled?: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new OperationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.cancelled = source["cancelled"];
	        this.error = source["error"];
	    }
	}
	export class BatchSaveResult {
	    user: OperationResult;
	    system: OperationResult;
	
	    static createFrom(source: any = {}) {
	        return new BatchSaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user = this.convertValues(source["user"], OperationResult);
	        this.system = this.convertValues(source["system"], OperationResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EnvChange {
	    name: string;
	    value: string;
	    type: string;
	    scope: string;
	    delete: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EnvChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.type = source["type"];
	        this.scope = source["scope"];
	        this.delete = source["delete"];
	    }
	}
	
	export class ImportError {
	    line: number;
	    raw: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.line = source["line"];
	        this.raw = source["raw"];
	        this.reason = source["reason"];
	    }
	}
	export class ImportPreview {
	    changes: EnvChange[];
	    errors: ImportError[];
	
	    static createFrom(source: any = {}) {
	        return new ImportPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.changes = this.convertValues(source["changes"], EnvChange);
	        this.errors = this.convertValues(source["errors"], ImportError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PathSegment {
	    raw: string;
	    expanded: string;
	    scope: string;
	    exists: boolean;
	    isDir: boolean;
	    duplicateOf: number;
	
	    static createFrom(source: any = {}) {
	        return new PathSegment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.raw = source["raw"];
	        this.expanded = source["expanded"];
	        this.scope = source["scope"];
	        this.exists = source["exists"];
	        this.isDir = source["isDir"];
	        this.duplicateOf = source["duplicateOf"];
	    }
	}
	export class PathValidation {
	    path: string;
	    expandedValue: string;
	    exists: boolean;
	    isDir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PathValidation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.expandedValue = source["expandedValue"];
	        this.exists = source["exists"];
	        this.isDir = source["isDir"];
	    }
	}

}

export namespace httpserver {
	
	export class Config {
	    root: string;
	    port: number;
	    bindLocal: boolean;
	    spaMode: boolean;
	    singleFile: boolean;
	    indexName: string;
	    authEnabled: boolean;
	    authUser: string;
	    authPass: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.port = source["port"];
	        this.bindLocal = source["bindLocal"];
	        this.spaMode = source["spaMode"];
	        this.singleFile = source["singleFile"];
	        this.indexName = source["indexName"];
	        this.authEnabled = source["authEnabled"];
	        this.authUser = source["authUser"];
	        this.authPass = source["authPass"];
	    }
	}
	export class FileItem {
	    name: string;
	    path: string;
	    size: number;
	    isDir: boolean;
	    modTime: string;
	
	    static createFrom(source: any = {}) {
	        return new FileItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.isDir = source["isDir"];
	        this.modTime = source["modTime"];
	    }
	}
	export class LogEntry {
	    time: string;
	    remoteAddr: string;
	    method: string;
	    path: string;
	    status: number;
	    bytes: number;
	    durationMs: number;
	    userAgent: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.remoteAddr = source["remoteAddr"];
	        this.method = source["method"];
	        this.path = source["path"];
	        this.status = source["status"];
	        this.bytes = source["bytes"];
	        this.durationMs = source["durationMs"];
	        this.userAgent = source["userAgent"];
	    }
	}
	export class Stats {
	    totalRequests: number;
	    totalBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalRequests = source["totalRequests"];
	        this.totalBytes = source["totalBytes"];
	    }
	}
	export class ServerStatus {
	    running: boolean;
	    root: string;
	    port: number;
	    bindLocal: boolean;
	    mode: string;
	    authEnabled: boolean;
	    startedAt: string;
	    stats: Stats;
	    urls: string[];
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.root = source["root"];
	        this.port = source["port"];
	        this.bindLocal = source["bindLocal"];
	        this.mode = source["mode"];
	        this.authEnabled = source["authEnabled"];
	        this.startedAt = source["startedAt"];
	        this.stats = this.convertValues(source["stats"], Stats);
	        this.urls = source["urls"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class PortViewerPrefs {
	    pollInterval: number;
	    protocol: string;
	    family: string;
	    states: string[];
	
	    static createFrom(source: any = {}) {
	        return new PortViewerPrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pollInterval = source["pollInterval"];
	        this.protocol = source["protocol"];
	        this.family = source["family"];
	        this.states = source["states"];
	    }
	}

}

export namespace procutil {
	
	export class PortEntryWithProc {
	    protocol: string;
	    family: string;
	    localAddr: string;
	    localPort: number;
	    remoteAddr: string;
	    remotePort: number;
	    state: string;
	    pid: number;
	    processName: string;
	    exePath: string;
	
	    static createFrom(source: any = {}) {
	        return new PortEntryWithProc(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.protocol = source["protocol"];
	        this.family = source["family"];
	        this.localAddr = source["localAddr"];
	        this.localPort = source["localPort"];
	        this.remoteAddr = source["remoteAddr"];
	        this.remotePort = source["remotePort"];
	        this.state = source["state"];
	        this.pid = source["pid"];
	        this.processName = source["processName"];
	        this.exePath = source["exePath"];
	    }
	}

}

export namespace syncer {
	
	export class Config {
	    src: string;
	    dst: string;
	    conflict: string;
	    recursive: boolean;
	    patterns: string[];
	    threadCount: number;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.src = source["src"];
	        this.dst = source["dst"];
	        this.conflict = source["conflict"];
	        this.recursive = source["recursive"];
	        this.patterns = source["patterns"];
	        this.threadCount = source["threadCount"];
	    }
	}
	export class PreviewItem {
	    relativePath: string;
	    srcPath: string;
	    dstPath: string;
	    size: number;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PreviewItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.relativePath = source["relativePath"];
	        this.srcPath = source["srcPath"];
	        this.dstPath = source["dstPath"];
	        this.size = source["size"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}

}

