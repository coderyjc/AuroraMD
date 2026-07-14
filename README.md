# Loop Book

Loop Book 是一个本地优先的 Markdown 桌面阅读器，用来阅读按章节拆分的 Markdown 书稿，并在阅读过程中完成高亮、批注、章节版本隔离和面向 AI 工作流的批注导出。

它适合处理本地书稿、AI 生成的长文档、课程讲义、研究笔记等内容：原始 Markdown 文件保留在原目录，应用只维护索引、版本快照、批注、阅读进度和阅读器设置。

## 功能

- 在首页 gallery 中以书籍卡片管理本地 Markdown 书稿；末尾导入卡片支持拖入文件夹或点击选择文件夹。
- 导入包含 `.md` 文件的本地文件夹，并按文件生成章节；原始文件保留在原处。
- gallery 书籍卡片支持右键菜单：重命名、在资源管理器打开、同步文件夹、版本管理和删除本地索引。
- 首页批注工作台支持按书籍、章节、状态筛选，批量选择、批量导出和批量标记；点击批注先打开详情模态框，再手动跳转到阅读位置。
- 阅读 Markdown 内容，支持相对路径图片在 Tauri 桌面环境中显示。
- 自动提取章节标题和大纲，支持章节列表和大纲跳转。
- 选中文本后创建跨行高亮批注，保存渲染文本锚点、上下文、标题路径、颜色和评论。
- 按章节维护内容快照，原始 Markdown 变更后会生成新的章节版本。
- 版本管理支持选择两个章节版本做 Diff，对新增、删除、修改进行分组展示，并检查旧批注是否仍能定位到目标版本。
- 保存阅读进度，重新打开书籍时恢复最近阅读位置。
- 支持拖拽调整章节顺序。
- 阅读器左栏、正文区、右栏宽度可拖拽调整；左栏内“大纲/章节”的分隔位置也可拖拽调整。
- 阅读器设置包含主题、字体、字号、行距、正文宽度、页边距、段落间距和聚焦模式。
- 聚焦模式开启后，鼠标悬浮正文元素时仅当前元素及相邻元素正常显示，其余上下文淡化；悬浮正文空白处时整体淡化。
- 首页设置支持主题选择、快捷键录制、本地备份和恢复。
- 汇总全书批注，并按多种模板导出 Markdown：
  - 阅读笔记
  - AI 修改包
  - 问题清单
  - 全书批注索引
- 在没有自定义右键功能的区域禁用默认右键菜单，避免误弹系统菜单。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- Markdown 渲染：markdown-it
- 图标：lucide-react
- 后端：Rust
- 本地存储：SQLite（rusqlite bundled）

## 目录结构

```text
.
|-- src/                  # React 前端
|   |-- App.tsx           # 应用状态、页面编排和主要交互流程
|   |-- api.ts            # Tauri invoke API 封装
|   |-- constants.ts      # 默认设置、快捷键、高亮颜色等常量
|   |-- markdown.ts       # Markdown 渲染、批注标记、标题路径工具
|   |-- styles.css        # 应用样式
|   |-- types.ts          # 前后端共享的 TypeScript 类型
|   |-- components/
|   |   |-- home/         # 首页批注工作台、设置、搜索、书籍菜单等组件
|   |   `-- reader/       # 阅读器批注卡片、导出、排序、设置等组件
|   `-- utils/            # 章节、批注、快捷键、版本 Diff 等前端工具函数
|-- src-tauri/            # Tauri/Rust 后端
|   |-- src/lib.rs        # Tauri commands 和业务编排
|   |-- src/domain.rs     # 后端数据模型和 DTO
|   |-- src/db.rs         # SQLite 初始化与迁移
|   |-- src/exporter.rs   # 批注导出模板渲染
|   |-- src/utils.rs      # 文件扫描、hash、时间、ID、大纲等工具
|   |-- src/main.rs       # 桌面入口
|   |-- Cargo.toml        # Rust 依赖
|   `-- tauri.conf.json   # Tauri 应用配置
|-- index.html
|-- package.json
|-- tsconfig.json
`-- vite.config.ts
```

## 代码分层说明

当前代码按“命令编排、领域模型、基础设施、展示组件、工具函数”拆分：

- `src/App.tsx` 负责应用级状态、页面路由式切换、Tauri API 调用和事件编排。
- `src/components/home/` 放首页相关 UI，包括批注工作台、书籍右键菜单、搜索、批量导出、版本管理和主页设置。
- `src/components/reader/` 放阅读器相关 UI，包括章节排序弹窗、批注创建/详情弹窗、导出弹窗、阅读器设置和顶部通知。
- `src/utils/` 放前端纯工具函数，避免把章节名、批注状态、快捷键解析、版本 Diff 等逻辑散落在组件里。
- `src-tauri/src/domain.rs` 定义 Rust 侧统一数据结构，尽量让命令函数只处理流程，不重复写 DTO。
- `src-tauri/src/db.rs` 负责数据库建表与迁移，避免 schema 逻辑继续堆在 `lib.rs`。
- `src-tauri/src/exporter.rs` 专注导出 Markdown/AI 包模板，后续新增导出格式优先改这里。
- `src-tauri/src/utils.rs` 放后端通用工具，例如扫描 `.md`、计算 hash、生成 ID、解析大纲和数据库错误格式化。

后续新增功能时，优先沿用这个边界：UI 组件不直接写复杂业务规则，命令层不直接堆模板字符串，数据库 schema 变更集中放在 `db.rs`。

## 环境要求

- Node.js 和 npm
- Rust 工具链
- Tauri 2 所需的系统依赖

Windows 下还需要可用的 WebView2 Runtime。Tauri 的完整系统依赖可参考官方安装文档。

## 安装依赖

```powershell
npm.cmd install
```

## 本地开发

启动 Tauri 桌面开发环境：

```powershell
npm.cmd run tauri dev
```

前端开发服务器默认运行在：

```text
http://127.0.0.1:1420
```

也可以只启动 Vite 前端：

```powershell
npm.cmd run dev
```

## 构建

构建前端和 Tauri 桌面包：

```powershell
npm.cmd run tauri -- build
```

当前 Tauri 配置的默认 Windows 打包目标是 NSIS。构建完成后，常见输出位置包括：

```text
src-tauri/target/release/loop-book.exe
src-tauri/target/release/bundle/nsis/Loop Book_0.3.0_x64-setup.exe
```

## 数据存储

应用会在系统应用数据目录下创建本地 SQLite 数据库：

```text
loop-book.sqlite3
```

数据库中保存：

- 书籍和章节索引
- 章节内容快照和版本号
- 批注、高亮、评论和上下文
- 阅读进度
- 阅读器设置、首页主题、快捷键和聚焦模式开关

导入的 Markdown 文件不会被移动或复制，仍保留在原始文件夹中。

## 常用脚本

```text
npm.cmd run dev          # 启动 Vite 开发服务器
npm.cmd run build        # TypeScript 检查并构建前端
npm.cmd run preview      # 预览前端构建结果
npm.cmd run tauri dev    # 启动 Tauri 开发环境
npm.cmd run tauri -- build
                          # 构建桌面应用安装包
```

## 版本控制建议

建议提交源码、配置文件和锁文件：

- `package-lock.json`
- `src-tauri/Cargo.lock`

不要提交：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- 本地数据库、日志、缓存和 IDE 临时文件

## 开发踩坑记录

下面这些是当前会话中已经踩到或确认过的环境坑，后续维护时优先排查这些点。

### PowerShell 与命令行

- PowerShell 终端里直接 `Get-Content README.md`、`Get-Content src/App.tsx` 时，中文可能显示成乱码。这通常是终端输出编码问题，不代表文件内容已经损坏。不要把终端里的乱码文案复制回源码；需要确认内容时，优先用编辑器、浏览器页面、`rg -n "中文关键词" 文件名` 或构建结果验证。
- 在当前 Codex/PowerShell 环境中，带正则 alternation 的命令要小心，例如 `rg -n "foo|bar" ...` 可能被外层命令解析误拆。更稳的写法是用单引号：`rg -n 'foo|bar' src\App.tsx src\styles.css`，或者拆成多次 `rg`。
- 不要在复杂命令里随手串联大量 `|`、`;`、`&&`。这个环境会按 shell 控制符拆命令段，容易让参数被误判。排查时尽量一条命令做一件事。
- `README*` 这类通配路径在 Windows/PowerShell + `rg` 组合里可能被当成非法路径。查 README 时用 `rg -n '关键词' README.md`，或者 `rg -n '关键词' . -g 'README*'`。

### 本地开发服务器

- `npm.cmd run dev` 是长时间运行的 Vite 服务。命令超时不一定是失败；如果输出里出现 `VITE ready` 和 `http://127.0.0.1:1420/`，说明服务已经启动。
- 在受限沙箱里用 `Start-Process` 启动后台进程，可能返回成功但进程没有真正留下来，也不会写出日志。需要验证时先前台运行看输出；如果必须后台常驻，再用已授权/提权的方式启动。
- `Invoke-WebRequest http://127.0.0.1:1420` 失败通常只说明 Vite 没起来或还没监听端口，不一定是前端代码问题。可以同时检查 `dev-server.log` 和端口监听。
- `Get-NetTCPConnection -LocalPort 1420` 没有输出或返回非零状态，表示当前没有监听者；这不是异常栈，可以当作“服务未启动”的信号。

### 网络与依赖

- 当前执行环境的网络是受限的。已经安装好 `node_modules` 时，`npm.cmd run build`、`cargo check`、`cargo test`、`npm.cmd run tauri -- build` 都不需要联网。
- 如果后续需要 `npm.cmd install`、下载 Rust/Tauri 依赖、访问 registry 或联网查文档，遇到 DNS、registry、连接失败时，先按权限流程申请联网/提权，不要立刻判断为项目代码问题。
- Tauri 打包会再次触发前端构建，所以看到 `npm.cmd run build` 输出两次是正常现象。

### Git 与差异查看

- 先用 `git rev-parse --is-inside-work-tree` 判断当前目录是不是 Git 工作区。不要默认 `git status` 一定可用。
- 如果当前目录不是 Git 仓库，`git diff -- src\App.tsx src\styles.css` 可能退化成 no-index 文件对比，把两个文件互相比出一大坨无意义 diff。此时应改用编辑器、`rg` 定位，或先确认仓库状态。

### 打包与验证

- 后续完成功能或修复后，默认直接执行 `npm.cmd run tauri -- build`，构建可测试的桌面 exe。用户优先打开下面这个 release 文件验证，不再只停留在前端构建或 dev server：

```text
src-tauri/target/release/loop-book.exe
```

- 常规验证顺序建议：
  1. `npm.cmd run build`
  2. `cargo check`（在 `src-tauri/` 下）
  3. `cargo test`（在 `src-tauri/` 下）
  4. `npm.cmd run tauri -- build`
- 当前 v0.3.0 功能更新后已通过：
  - `npm.cmd run build`
  - `cargo check`
  - `cargo test`
- Windows 安装包输出位置通常是：

```text
src-tauri/target/release/bundle/nsis/Loop Book_0.3.0_x64-setup.exe
```
- 如果 `cargo check` 或 Tauri 打包时报错，提示去读取另一个旧目录下的 `target/.../permissions/...app_hide.toml`，通常是 Tauri/Rust 构建缓存里残留了旧绝对路径。排查时可以临时使用独立 target 目录：

```powershell
$env:CARGO_TARGET_DIR='E:\code\github\annotaloop\src-tauri\target-codex-check'
cargo check
```

清理临时目录前先确认路径仍在当前工作区内，必要时把只读属性归一化后再删，避免误删工作区外文件或被 Windows 文件属性拦住。

## v0.3.0 功能摘要

- 首页保留 gallery 视图并移除列表视图；导入 Markdown 文件夹变成 gallery 末尾卡片，支持拖入文件夹或点击选择文件夹。
- 首页新增主题设置，快捷键编辑改为点击输入框后录制用户实际按键。
- 首页批注工作台点击批注时先打开详情模态框，用户可在详情底部点击“跳转到对应位置”。
- 首页 gallery 书籍卡片右键菜单支持重命名、在资源管理器打开、同步文件夹、版本管理和删除本地索引；删除前会弹出确认窗口。
- 同步文件夹支持检测新增章节、缺失章节、内容变更和疑似改名；内容变更会继续按章节生成 v2/v3 版本快照。
- 章节版本管理支持按书选择章节、查看版本列表、给版本添加别名、删除非当前版本，并可选择两个版本进行 Diff 对比。
- 版本 Diff 展示新增、删除、修改块，并检查批注在目标版本中是否仍能定位。
- 批注锚点升级为渲染文本偏移，支持跨行高亮批注。
- 阅读器左栏/正文/右栏宽度可拖拽调整，左栏内“大纲/章节”分隔位置也可拖拽调整。
- 阅读器设置新增聚焦模式，开启后正文悬浮区域及相邻元素保持正常显示，其余上下文淡化。
- 导出功能增加任务目标：润色这一章、根据批注重写、扩展段落、生成问题清单、生成二次创作指令；导出 Markdown 会自动包含给 AI 的系统说明。
- 首页设置与阅读器设置分离：主页设置使用模态框，包含主题、快捷键绑定和本地备份/恢复；阅读器设置继续保留字体、行距、边距、主题、聚焦模式等阅读体验设置。
- 新增默认快捷键：`Ctrl+K` 搜索、`N` 下一章、`P` 上一章、`H` 添加高亮、`E` 导出、`[`/`]` 收起展开左右栏。
- 本地备份/恢复支持导出和恢复 SQLite 数据库备份文件。
- 增加右键菜单、模态框、搜索框、侧栏/弹窗、聚焦模式等轻量 UI 动画，并在无自定义右键功能区域禁用默认菜单。
