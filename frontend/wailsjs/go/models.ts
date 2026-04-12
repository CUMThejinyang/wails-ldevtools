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

