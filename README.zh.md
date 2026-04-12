# fileviewer

基于 Web 的文件浏览器与查看器，界面现代美观。通过浏览器浏览本地目录、查看多种格式的文件，还可选择性地管理文件。

## 功能特性

- **多根目录浏览** — 可同时挂载多个目录，并为每个目录设置自定义显示名称
- **丰富的文件查看器**
  - 文本文件，带语法高亮（通过 CodeMirror 支持 50+ 种语言）
  - 图片，支持缩略图网格与原图查看
  - 表格数据：Parquet、CSV、JSON、JSONL — 基于 Polars 并支持 SQL 过滤
  - 视频与音频流式播放（支持 HTTP 范围请求）
  - Markdown 渲染
  - 二进制文件的十六进制转储
- **文件管理**（可选写入模式）
  - 创建、重命名、删除文件和目录
  - 拖放文件到浏览区域或通过文件选择器上传
  - 复制 / 移动，支持冲突处理（覆盖 / 跳过 / 保留两者）
  - 通过 Server-Sent Events 实时显示批量操作进度
- **身份认证** — 可选的用户名/密码登录，使用安全的 Session Token
- **国际化** — 支持中文和英文界面

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
fileviewer /data --name 数据 /projects --name 项目

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
| `--name NAME` | 目录名 | 前一个路径的显示名称 |
| `--host HOST` | `127.0.0.1` | 绑定的主机地址 |
| `--port PORT` | `8000` | 监听端口 |
| `--write` | 关闭 | 启用文件写入操作 |
| `--user USER` | — | 认证用户名 |
| `--password PASS` | — | 认证密码 |
| `--no-browser` | 关闭 | 启动时不自动打开浏览器 |

## 技术栈

**后端：** Python 3.10+、FastAPI、Uvicorn、Polars、Pillow、httpx

**前端：** Vue 3、Vuetify 3、Pinia、CodeMirror 6、Vite

## 开发

```bash
# 后端（运行在 8001 端口）
uvicorn fileviewer.server:app --reload --port 8001

# 前端（运行在 5173 端口，/api 请求自动代理到后端）
cd frontend
npm install
npm run dev
```

构建生产：

```bash
cd frontend
npm run build   # 输出到 fileviewer/static/
cd ..
pip install .
```

## 安全说明

- 所有路径均经过校验，严格限制在配置的根目录范围内，无法进行目录穿越攻击。
- 写入操作默认关闭，需通过 `--write` 显式启用。
- 认证 Token 存储在 HttpOnly、SameSite 的 Cookie 中。

## 许可证

详见 [LICENSE](LICENSE)。
