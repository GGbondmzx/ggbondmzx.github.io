# -*- coding: utf-8 -*-
"""
server.py — 个人网站管理后台服务器（Python 标准库，零依赖）

用法:
    python admin/server.py

启动后访问:
    http://127.0.0.1:8787/admin/

默认密码 admin123（请在后台「数据与安全」中修改）。
保存内容时会自动:
    1. 备份到 admin/backups/
    2. 更新 admin/content.json
    3. 重新生成 index.html / news / love / demo 页面
"""
import base64
import hashlib
import hmac
import json
import os
import shutil
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
PUBLIC_DIR = os.path.join(HERE, "public")
BACKUP_DIR = os.path.join(HERE, "backups")
CONTENT_PATH = os.path.join(HERE, "content.json")
CONFIG_PATH = os.path.join(HERE, "config.json")

sys.path.insert(0, HERE)
from lib import builder  # noqa: E402

# ---------------------------------------------------------------- 配置

DEFAULT_CONFIG = {
    "host": "127.0.0.1",
    "port": 8787,
    "password": "admin123",
    "secret": "",
    "max_backups": 50,
    "allowed_extensions": [".jpg", ".jpeg", ".png", ".gif", ".webp",
                           ".svg", ".pdf", ".avif"],
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    changed = False
    if not cfg.get("secret"):
        cfg["secret"] = base64.urlsafe_b64encode(os.urandom(32)).decode()
        changed = True
    if changed:
        save_config(cfg)
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


CONFIG = load_config()

# ---------------------------------------------------------------- 令牌

def make_token(expires_in=7 * 24 * 3600):
    payload = {"exp": int(time.time()) + expires_in}
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(CONFIG["secret"].encode(), body.encode(),
                   hashlib.sha256).hexdigest()
    return body + "." + sig


def verify_token(token):
    try:
        body, sig = token.split(".", 1)
    except (ValueError, AttributeError):
        return False
    expect = hmac.new(CONFIG["secret"].encode(), body.encode(),
                      hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expect):
        return False
    padded = body + "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return False
    return int(payload.get("exp", 0)) > int(time.time())


# ---------------------------------------------------------------- 备份

MANAGED_FILES = ["index.html", "news/index.html",
                 "love/index.html", "demo/index.html"]


def create_backup():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(BACKUP_DIR, stamp)
    os.makedirs(dest, exist_ok=True)
    if os.path.exists(CONTENT_PATH):
        shutil.copy2(CONTENT_PATH, os.path.join(dest, "content.json"))
    for rel in MANAGED_FILES:
        src = os.path.join(ROOT, rel.replace("/", os.sep))
        if os.path.exists(src):
            d = os.path.join(dest, os.path.dirname(rel))
            os.makedirs(d, exist_ok=True)
            shutil.copy2(src, os.path.join(d, os.path.basename(rel)))
    return stamp


def prune_backups():
    if not os.path.isdir(BACKUP_DIR):
        return
    entries = sorted(
        [d for d in os.listdir(BACKUP_DIR)
         if os.path.isdir(os.path.join(BACKUP_DIR, d))])
    limit = int(CONFIG.get("max_backups", 50))
    while len(entries) > limit:
        shutil.rmtree(os.path.join(BACKUP_DIR, entries.pop(0)),
                      ignore_errors=True)


def list_backups():
    if not os.path.isdir(BACKUP_DIR):
        return []
    out = []
    for name in sorted(os.listdir(BACKUP_DIR), reverse=True):
        p = os.path.join(BACKUP_DIR, name)
        if not os.path.isdir(p):
            continue
        has_content = os.path.exists(os.path.join(p, "content.json"))
        out.append({"id": name, "has_content": has_content})
    return out


def restore_backup(backup_id):
    src = os.path.join(BACKUP_DIR, backup_id)
    if not os.path.isdir(src):
        raise RuntimeError("备份不存在")
    if os.path.exists(os.path.join(src, "content.json")):
        shutil.copy2(os.path.join(src, "content.json"), CONTENT_PATH)
    for rel in MANAGED_FILES:
        f = os.path.join(src, os.path.dirname(rel), os.path.basename(rel))
        if os.path.exists(f):
            target = os.path.join(ROOT, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(f, target)


# ---------------------------------------------------------------- 素材扫描

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif")
SCAN_DIRS = ["assets", "love/uploads", "blog/uploads"]


def scan_assets():
    groups = {}
    for top in SCAN_DIRS:
        base = os.path.join(ROOT, top.replace("/", os.sep))
        if not os.path.isdir(base):
            continue
        files = []
        for dirpath, _dirs, names in os.walk(base):
            for name in names:
                if name.lower().endswith(IMAGE_EXTS):
                    rel = os.path.relpath(os.path.join(dirpath, name), ROOT)
                    files.append(rel.replace(os.sep, "/"))
        files.sort()
        groups[top] = files
    return groups


# ---------------------------------------------------------------- 上传

def safe_upload(directory, filename, data_b64):
    filename = os.path.basename(filename or "")
    if not filename:
        raise RuntimeError("文件名不能为空")
    ext = os.path.splitext(filename)[1].lower()
    allowed = [e.lower() for e in CONFIG.get("allowed_extensions", [])]
    if ext not in allowed:
        raise RuntimeError("不允许的文件类型: {}（可在 config.json 中配置）".format(ext))

    directory = (directory or "assets").replace("\\", "/").lstrip("/")
    parts = [p for p in directory.split("/") if p not in ("", ".", "..")]
    target_dir = os.path.join(ROOT, *parts) if parts else ROOT
    if not os.path.abspath(target_dir).startswith(os.path.abspath(ROOT)):
        raise RuntimeError("非法目录")
    os.makedirs(target_dir, exist_ok=True)

    target = os.path.join(target_dir, filename)
    if os.path.exists(target):
        stem, e = os.path.splitext(filename)
        target = os.path.join(target_dir, "{}-{}{}".format(
            stem, int(time.time()), e))

    raw = base64.b64decode(data_b64, validate=True)
    with open(target, "wb") as f:
        f.write(raw)
    return "/" + os.path.relpath(target, ROOT).replace(os.sep, "/")


# ---------------------------------------------------------------- 素材删除

def delete_asset(rel):
    """删除素材文件，仅限 SCAN_DIRS 目录内的文件。"""
    rel = (rel or "").replace("\\", "/").lstrip("/")
    parts = [p for p in rel.split("/") if p not in ("", ".", "..")]
    rel_clean = "/".join(parts)
    if not any(rel_clean.startswith(d + "/") for d in SCAN_DIRS):
        raise RuntimeError("该路径不在允许管理的目录内")
    target = os.path.abspath(os.path.join(ROOT, *parts))
    if not target.startswith(os.path.abspath(ROOT)) or not os.path.isfile(target):
        raise RuntimeError("文件不存在")
    os.remove(target)
    return "/" + rel_clean


# ---------------------------------------------------------------- HTTP 处理

MIME = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".pdf": "application/pdf",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp4": "video/mp4",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "SiteAdmin/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---- 响应工具 ----
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        ext = os.path.splitext(path)[1].lower()
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_json({"error": "文件不存在"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def require_auth(self):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer ") and verify_token(auth[7:]):
            return True
        self.send_json({"error": "未登录或登录已过期"}, 401)
        return False

    # ---- 路由 ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith("/admin/api/"):
            return self.handle_api_get(path[len("/admin/api"):])
        if path in ("/admin", "/admin/"):
            return self.send_file(os.path.join(PUBLIC_DIR, "index.html"))
        if path.startswith("/admin/"):
            rel = path[len("/admin/"):]
            target = os.path.abspath(os.path.join(PUBLIC_DIR, rel))
            if target.startswith(os.path.abspath(PUBLIC_DIR)) and os.path.isfile(target):
                return self.send_file(target)
            return self.send_json({"error": "Not found"}, 404)
        return self.serve_site(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith("/admin/api/"):
            return self.handle_api_post(path[len("/admin/api"):])
        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith("/admin/api/"):
            return self.handle_api_put(path[len("/admin/api"):])
        self.send_json({"error": "Not found"}, 404)

    def serve_site(self, path):
        if path == "/":
            target = os.path.join(ROOT, "index.html")
        else:
            rel = path.lstrip("/")
            target = os.path.abspath(os.path.join(ROOT, rel))
            if os.path.isdir(target):
                target = os.path.join(target, "index.html")
        if not target.startswith(os.path.abspath(ROOT)) or not os.path.isfile(target):
            nf = os.path.join(ROOT, "404.html")
            if os.path.exists(nf):
                self.send_response(404)
                return self.send_file(nf)
            return self.send_json({"error": "Not found"}, 404)
        self.send_file(target)

    # ---- API GET ----
    def handle_api_get(self, path):
        if path == "/ping":
            return self.send_json({"ok": True})
        if not self.require_auth():
            return
        if path == "/content":
            with open(CONTENT_PATH, "r", encoding="utf-8") as f:
                return self.send_json(json.load(f))
        if path == "/assets":
            return self.send_json({"groups": scan_assets()})
        if path == "/backups":
            return self.send_json({"items": list_backups()})
        if path == "/meta":
            return self.send_json({
                "site_root": ROOT,
                "content_path": CONTENT_PATH,
                "managed_files": MANAGED_FILES,
            })
        self.send_json({"error": "未知接口"}, 404)

    # ---- API POST ----
    def handle_api_post(self, path):
        try:
            body = self.read_body()
        except Exception:
            return self.send_json({"error": "请求体不是合法 JSON"}, 400)

        if path == "/login":
            password = str(body.get("password", ""))
            if hmac.compare_digest(password, str(CONFIG.get("password", ""))):
                return self.send_json({"token": make_token()})
            return self.send_json({"error": "密码错误"}, 401)

        if not self.require_auth():
            return

        if path == "/upload":
            try:
                url = safe_upload(body.get("dir", "assets"),
                                  body.get("filename", ""),
                                  body.get("data", ""))
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json({"url": url})

        if path == "/assets/delete":
            try:
                delete_asset(str(body.get("path", "")))
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json({"ok": True})

        if path == "/preview":
            content = body.get("content")
            if not isinstance(content, dict):
                return self.send_json({"error": "内容格式错误"}, 400)
            try:
                html = builder.render_preview(
                    content, ROOT, str(body.get("module", "")))
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json({"html": html})

        if path == "/backups/restore":
            try:
                restore_backup(str(body.get("id", "")))
            except Exception as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json({"ok": True})

        if path == "/password":
            old = str(body.get("old_password", ""))
            new = str(body.get("new_password", ""))
            if not hmac.compare_digest(old, str(CONFIG.get("password", ""))):
                return self.send_json({"error": "原密码错误"}, 400)
            if len(new) < 4:
                return self.send_json({"error": "新密码至少 4 位"}, 400)
            CONFIG["password"] = new
            save_config(CONFIG)
            return self.send_json({"ok": True})

        self.send_json({"error": "未知接口"}, 404)

    # ---- API PUT ----
    def handle_api_put(self, path):
        if not self.require_auth():
            return
        try:
            body = self.read_body()
        except Exception:
            return self.send_json({"error": "请求体不是合法 JSON"}, 400)

        if path == "/content":
            if not isinstance(body, dict):
                return self.send_json({"error": "内容格式错误"}, 400)
            try:
                backup_id = create_backup()
                tmp = CONTENT_PATH + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(body, f, ensure_ascii=False, indent=2)
                os.replace(tmp, CONTENT_PATH)
                changed = builder.build_site(body, ROOT)
                prune_backups()
            except Exception as e:
                traceback.print_exc()
                return self.send_json({"error": "保存失败: {}".format(e)}, 500)
            return self.send_json({
                "ok": True, "backup": backup_id, "changed": changed})
        self.send_json({"error": "未知接口"}, 404)


def main():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    host = CONFIG.get("host", "127.0.0.1")
    port = int(CONFIG.get("port", 8787))
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = "http://{}:{}/admin/".format(host, port)
    print("=" * 58)
    print("  个人网站管理后台已启动")
    print("  后台地址 : " + url)
    print("  网站预览 : http://{}:{}/".format(host, port))
    print("  默认密码 : admin123（登录后请及时修改）")
    print("  按 Ctrl+C 停止服务")
    print("=" * 58)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")


if __name__ == "__main__":
    main()
