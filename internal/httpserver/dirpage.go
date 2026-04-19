package httpserver

import (
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type dirEntry struct {
	Name    string
	Path    string
	Link    string
	Size    string
	IsDir   bool
	ModTime string
}

type breadcrumbItem struct {
	Name string
	Path string
	Link string
}

var dirListingTmpl = template.Must(template.New("dir").Parse(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>共享文件</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#181818;color:#e6e6e6;min-height:100vh;display:flex;flex-direction:column}
.header{background:#222;padding:16px 24px;border-bottom:.5px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.brand{display:flex;flex-direction:column;gap:4px}
.brand h1{font-size:16px;font-weight:600;color:#00b96b}
.brand p{font-size:12px;color:#999}
.badge{font-size:12px;color:#aaa;background:rgba(255,255,255,.06);padding:4px 10px;border-radius:999px}
.breadcrumb{padding:10px 24px;background:#222;border-bottom:.5px solid rgba(255,255,255,.08);font-size:13px;display:flex;gap:6px;flex-wrap:wrap}
.breadcrumb a{color:#00b96b;text-decoration:none}
.breadcrumb a:hover{text-decoration:underline}
.sep{color:#555}
.toolbar{padding:10px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:.5px solid rgba(255,255,255,.08);gap:12px;flex-wrap:wrap}
.sel-info{font-size:13px;color:#aaa}
.toolbar-actions{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:none;border-radius:6px;font-size:13px;cursor:pointer;transition:all .15s;text-decoration:none}
.btn-primary{background:#00b96b;color:#fff}
.btn-primary:hover{background:#00a85e}
.btn-primary:disabled{background:#3a3a3a;color:#777;cursor:not-allowed}
.btn-ghost{background:rgba(255,255,255,.06);color:#ddd}
.btn-ghost:hover{background:rgba(255,255,255,.1)}
.wrap{flex:1;overflow:auto}
table{width:100%;border-collapse:collapse}
thead th{padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#888;border-bottom:.5px solid rgba(255,255,255,.08);position:sticky;top:0;background:#181818;z-index:1}
tbody tr{transition:background .1s}
tbody tr:hover{background:rgba(255,255,255,.03)}
tbody td{padding:10px 16px;font-size:13px;border-bottom:.5px solid rgba(255,255,255,.04);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.name-cell{display:flex;align-items:center;gap:8px;min-width:0}
.name-cell a{color:#e6e6e6;text-decoration:none;overflow:hidden;text-overflow:ellipsis}
.name-cell a:hover{color:#00b96b}
.icon{font-size:16px;flex-shrink:0}
.dir-icon{color:#faad14}
.file-icon{color:#666}
.cb{width:15px;height:15px;accent-color:#00b96b;cursor:pointer}
.empty{padding:56px 24px;text-align:center;color:#777;font-size:13px}
.footer{padding:10px 24px;text-align:center;font-size:11px;color:#666;border-top:.5px solid rgba(255,255,255,.06)}
@media(max-width:640px){.header,.breadcrumb,.toolbar{padding:10px 14px}thead th,tbody td{padding:8px 10px;font-size:12px}.hide-m{display:none}}
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <h1>共享文件</h1>
    <p>仅提供文件浏览与下载，不包含管理端信息。</p>
  </div>
  <span class="badge">共 {{.TotalFiles}} 个文件 · {{.TotalSize}}</span>
</div>
<div class="breadcrumb">
  <a href="{{.Link}}">根目录</a>{{range .Breadcrumbs}}<span class="sep">/</span><a href="{{.Link}}">{{.Name}}</a>{{end}}
</div>
<form id="dlForm" method="POST" action="/__devtools_api/download" style="display:none"></form>
<div class="toolbar">
  <div class="toolbar-actions">
    {{if .ParentLink}}<a class="btn btn-ghost" href="{{.ParentLink}}">返回上一级</a>{{end}}
  </div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div class="sel-info" id="selInfo">未选择项目</div>
    <div class="toolbar-actions">
      <button type="button" class="btn btn-ghost" onclick="toggleAll()">全选</button>
      <button type="button" class="btn btn-primary" id="dlBtn" disabled onclick="downloadSelected()">下载选中</button>
    </div>
  </div>
</div>
<div class="wrap">
{{if .Entries}}
<table>
<thead><tr>
  <th style="width:36px"><input type="checkbox" class="cb" id="cbAll" onchange="toggleAllCb(this.checked)"></th>
  <th>名称</th>
  <th style="width:100px" class="hide-m">大小</th>
  <th style="width:160px" class="hide-m">修改时间</th>
</tr></thead>
<tbody>
{{range .Entries}}
<tr>
  <td><input type="checkbox" class="cb file-cb" data-path="{{.Path}}" onchange="updateSel()"></td>
  <td><div class="name-cell">{{if .IsDir}}<span class="icon dir-icon">&#128193;</span><a href="{{.Link}}">{{.Name}}</a>{{else}}<span class="icon file-icon">&#128196;</span><span>{{.Name}}</span>{{end}}</div></td>
  <td class="hide-m">{{if not .IsDir}}{{.Size}}{{end}}</td>
  <td class="hide-m">{{.ModTime}}</td>
</tr>
{{end}}
</tbody>
</table>
{{else}}
<div class="empty">当前目录为空</div>
{{end}}
</div>
<div class="footer">DevTools Local Server</div>
<script>
function getFileCheckboxes(){return Array.prototype.slice.call(document.querySelectorAll('.file-cb'));}
function updateSel(){
  var cbs=getFileCheckboxes(),checked=document.querySelectorAll('.file-cb:checked');
  document.getElementById('selInfo').textContent=checked.length>0?'已选 '+checked.length+' 个项目':'未选择项目';
  document.getElementById('dlBtn').disabled=checked.length===0;
  var cbAll=document.getElementById('cbAll');
  cbAll.checked=cbs.length>0&&checked.length===cbs.length;
  cbAll.indeterminate=checked.length>0&&checked.length<cbs.length;
}
function toggleAll(){
  var cbs=getFileCheckboxes(),allChecked=cbs.length>0&&document.querySelectorAll('.file-cb:checked').length===cbs.length;
  cbs.forEach(function(cb){cb.checked=!allChecked});updateSel();
}
function toggleAllCb(v){getFileCheckboxes().forEach(function(cb){cb.checked=v});updateSel()}
function downloadSelected(){
  var form=document.getElementById('dlForm');form.innerHTML='';
  document.querySelectorAll('.file-cb:checked').forEach(function(cb){
    var i=document.createElement('input');i.type='hidden';i.name='files';i.value=cb.dataset.path;form.appendChild(i);
  });
  if(form.children.length>0){form.submit();}
}
</script>
</body>
</html>`))

func customFileServerHandler(root string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := filepath.Clean(r.URL.Path)
		fullPath := safeJoin(root, cleanPath)

		if !withinRoot(fullPath, root) {
			http.NotFound(w, r)
			return
		}

		info, err := os.Stat(fullPath)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		if !info.IsDir() {
			http.ServeFile(w, r, fullPath)
			return
		}

		indexPath := filepath.Join(fullPath, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}

		renderDirListing(w, root, cleanPath)
	})
}

func renderDirListing(w http.ResponseWriter, root, urlPath string) {
	target := safeJoin(root, urlPath)
	entries, err := os.ReadDir(target)
	if err != nil {
		http.Error(w, "无法读取目录", http.StatusInternalServerError)
		return
	}

	sort.Slice(entries, func(i, j int) bool {
		iDir, jDir := entries[i].IsDir(), entries[j].IsDir()
		if iDir != jDir {
			return iDir
		}
		return entries[i].Name() < entries[j].Name()
	})

	var breadcrumbs []breadcrumbItem
	parts := strings.Split(strings.Trim(urlPath, "/"), "/")
	for i, p := range parts {
		if p == "" {
			continue
		}
		breadcrumbs = append(breadcrumbs, breadcrumbItem{
			Name: p,
			Path: "/" + strings.Join(parts[:i+1], "/"),
			Link: "./" + strings.Join(parts[:i+1], "/") + "/",
		})
	}

	parentLink := ""
	if len(parts) > 0 {
		parentLink = "../"
	}

	var dirEntries []dirEntry
	totalFiles := 0
	var totalBytes int64
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		relPath := filepath.ToSlash(filepath.Join(strings.Trim(urlPath, "/"), e.Name()))
		link := relPath
		if e.IsDir() {
			link = "./" + e.Name() + "/"
		}
		dirEntries = append(dirEntries, dirEntry{
			Name:    e.Name(),
			Path:    relPath,
			Link:    link,
			Size:    humanSize(info.Size()),
			IsDir:   e.IsDir(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
		})
		if !e.IsDir() {
			totalFiles++
			totalBytes += info.Size()
		}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = dirListingTmpl.Execute(w, map[string]interface{}{
		"Link":        "/",
		"ParentLink":  parentLink,
		"Entries":     dirEntries,
		"Breadcrumbs": breadcrumbs,
		"TotalFiles":  totalFiles,
		"TotalSize":   humanSize(totalBytes),
	})
}

func humanSize(b int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}
