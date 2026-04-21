# fileviewer

基于 Web 的文件浏览器与查看器，界面现代美观。通过浏览器浏览本地目录、查看多种格式的文件，还可选择性地管理文件。

## 功能特性

### 文件浏览
- **多根目录** — 可同时挂载多个目录，并为每个目录设置自定义显示名称
- **两种视图模式** — 瀑布流（Masonry 网格）和详细列表视图
- **目录树** 侧边栏，快速导航
- **排序** — 按名称、大小、修改时间或类型排序（升序/降序），对所有视图（含目录树）均生效
- **正则过滤** — 按文件名正则表达式过滤当前目录
- **框选** — 拖拽框选多个文件，也支持 Shift+点击 和 Ctrl+点击

### 文件查看器
- **文本** — 通过 CodeMirror 支持 50+ 种语言的语法高亮；写入模式下支持内联编辑，Ctrl+S 保存
- **图片** — 缩略图网格、原图平移/缩放查看器、左右对比滑动查看器
- **表格数据** — Parquet、CSV、JSON、JSONL，基于 Polars，支持 SQL `WHERE` 过滤、排序、Schema 浏览和图片列预览
- **压缩包** — 浏览 zip、tar、tar.gz、tar.bz2、tar.xz、7z；随机访问预览（zip/7z）；解压到当前目录或子文件夹；创建压缩包（可设压缩级别和密码）
- **视频与音频** — HTTP 范围请求流式播放
- **Markdown** — 渲染预览，可切换到源码模式
- **十六进制转储** — 分页十六进制查看器，适用于二进制文件

### 文件管理（写入模式）
- 创建、重命名、删除文件和目录
- 拖放文件到浏览区域或通过文件选择器上传
- 复制/移动，支持冲突处理：覆盖、跳过或保留两者
- 剪切/复制/粘贴，带剪贴板状态指示
- 将文件和目录压缩为压缩包
- 将图片直接复制到系统剪贴板
- 批量操作通过 Server-Sent Events 实时显示进度

### 键盘快捷键
| 快捷键 | 操作 |
|--------|------|
| Ctrl+A | 全选可见文件 |
| Ctrl+C | 复制选中文件 |
| Ctrl+X | 剪切选中文件 |
| Ctrl+V | 粘贴剪贴板 |
| Delete | 删除选中文件 |
| F5 | 刷新 |
| ←/→ | 图片查看器中切换上/下一张图片 |

### 其他
- **身份认证** — 可选的用户名/密码登录，使用 HttpOnly Session Cookie
- **国际化** — 支持英语、简体中文、繁体中文、日语
- **主题** — 浅色/深色模式，可自定义主题颜色

## 安装

```bash
pip install fileviewer
```

## 快速开始

```bash
# 浏览当前目录
fileviewer

# 浏览指定目录
fileviewer /path/to/dir

# 浏览多个目录并设置显示名称
fileviewer /data /projects --name 数据 项目

# 启用写入模式
fileviewer /path/to/dir --write

# 启用登录认证
fileviewer /path/to/dir --user admin --password secret

# 自定义主机与端口
fileviewer /path/to/dir --host 0.0.0.0 --port 9000

# 不自动打开浏览器
fileviewer /path/to/dir --no-browser
```

## 命令行选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `paths` | `.` | 要浏览的一个或多个根目录 |
| `--name NAME [NAME ...]` | 目录名 | 各根目录的显示名称（按顺序对应各路径） |
| `--host HOST` | `127.0.0.1` | 绑定的主机地址 |
| `--port PORT` | `8001` | 监听端口 |
| `--write` | 关闭 | 启用文件写入操作 |
| `--user USER` | — | 认证用户名 |
| `--password PASS` | — | 认证密码 |
| `--no-browser` | 关闭 | 启动时不自动打开浏览器 |

## 技术栈

**后端：** Python 3.11+、FastAPI、Uvicorn、Polars、Pillow

**前端：** Vue 3、Vuetify 3、Pinia、CodeMirror 6、Vite

## 开发

```bash
# 后端（运行在 8001 端口）
pip install -e .
fileviewer . --port 8001 --write

# 前端（运行在 5173 端口，/api 请求自动代理到后端）
cd frontend
pnpm install
pnpm dev
```

构建生产版本：

```bash
cd frontend
pnpm build      # 输出到 fileviewer/static/
cd ..
pip install .
```

## 安全说明

- 所有路径均经过校验，严格限制在配置的根目录范围内，无法进行目录穿越攻击。
- 写入操作默认关闭，需通过 `--write` 显式启用。
- 认证 Token 存储在 HttpOnly、SameSite 的 Cookie 中。

## 许可证

详见 [LICENSE](LICENSE)。