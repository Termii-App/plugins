# Termii 插件开发指南

面向第三方插件作者的开发文档（当前实现为插件系统 v3，`apiVersion = 3`）。
可直接运行的完整示例见
[`Termii-App/plugin-template`](https://github.com/Termii-App/plugin-template) 仓库
（`hello/` 入门模板 + `sidecar-sysinfo/` 原生能力模板）。
插件系统 v3（`apiVersion = 3`）的宿主 API、类型面与打包脚手架统一由 SDK 包
[`@termii/plugin-sdk`](https://github.com/Termii-App/plugin-sdk) 提供
（git 依赖安装：`npm i -D github:Termii-App/plugin-sdk`），**不要再抄宿主源码**。

## 1. 插件包结构

一个外部插件就是一个目录，至少包含两个文件：

```
my-plugin/
├── plugin.json   # 清单
└── main.js       # 入口（单文件 ES module，由打包脚手架生成）
```

可选：`main.css`（插件样式，宿主自动注入，见 [§3.5](#35-打包共享-react--lucide-打包脚手架)）。
安装方式：设置 → 插件 → 从磁盘安装（选择该目录），或从 URL 安装
（[§7](#7-签名与分发)）。Termii 会把它拷贝到应用数据目录下的 `plugins/<id>/`，
首次启用前需要用户在设置页确认信任（能力模型见 [§6](#6-生命周期信任与官方插件)）。

### plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "做什么用的一句话。",
  "author": "you",
  "minAppVersion": "0.3.6",
  "apiVersion": 3,
  "capabilities": ["process"],
  "main": "main.js",
  "contributes": {
    "views": [{ "id": "my-plugin.panel", "labelKey": "panelTitle" }],
    "commands": [{ "id": "my-plugin.sayHi", "title": "Say Hi" }],
    "settingsSections": [{ "id": "my-plugin.settings", "labelKey": "settingsTitle" }],
    "themes": [{ "id": "my-plugin.night", "label": "Night" }],
    "trayItems": [{ "id": "my-plugin.quick", "label": "Quick Action" }]
  }
}
```

- `id`：全局唯一，kebab-case（`[a-z0-9-]{1,64}`），同时是安装目录名。
- `minAppVersion`：宿主版本下限（semver 比较），不满足则拒绝加载。
- `apiVersion`：可选，声明插件需要的宿主 API 版本，缺省按 `1` 处理
  （向后兼容）；契约细节见 [§2](#2-apiversion-契约)。
- `capabilities`：能力声明（见 [§6.1](#61-能力声明capabilities)）。
  缺省 `[]` = 纯 JS 白名单（L0）；声明 `process` 或 `sidecar` 任一进入 L1。
- `main`：入口文件名，相对插件目录，缺省 `main.js`。
- `contributes`：声明式贡献点摘要，用于设置页的信任提示展示；
  真正的注册发生在 `activate()` 里通过代码完成。
- `sidecar`：可选，声明随包分发的原生二进制，见 [§5](#5-sidecar-原生能力桥)。

### main.js

入口是 ES module，默认导出一个插件对象。写法从 SDK import
`definePlugin` 包住 manifest + activate：

```js
import { definePlugin } from "@termii/plugin-sdk";

export default definePlugin({
  manifest, // 与 plugin.json 同形（loader 会校验 id 一致）
  activate(ctx) {
    // 注册贡献点、订阅事件……
    // 所有注册都返回清理函数，插件被禁用时宿主统一回放，无需手动管理
  },
  deactivate() {
    // 可选：额外的清理（定时器、自建的连接等）
  },
});
```

`definePlugin` 的说明见 [§3.2](#32-defineplugin)，完整可运行的源码见
[`Termii-App/plugin-template`](https://github.com/Termii-App/plugin-template)
的 `hello/src/main.jsx`。

## 2. apiVersion 契约

宿主把插件的 API 面按大版本推进；`apiVersion` 是插件声明的"我需要的最小
宿主 API 版本"，宿主据此决定能否安全加载：

- `PluginContext.apiVersion`：宿主支持版本，**当前为 `3`**
  （宿主内部常量 `SUPPORTED_API_VERSION`）。
- **当前 API 面（v3）包含**：`ctx.process` / `hosts.execStream`（流式进程）、
  `ctx.sessions` / `terminal.writePane`（终端会话原语）、
  `ctx.plugins`（插件服务总线）、`capabilities`（能力声明）、
  official bundled 机制、签名分发与 URL 安装。
- `manifest.apiVersion`：可选。**缺省视为 `1`**（不写该字段的插件向后兼容，
  继续可以安装运行）。
- 声明值 **`> 3` → 拒绝加载**，设置页弹 toast「插件 `<name>` 需要更新的
  Termii 版本」（描述里带出「插件声明 apiVersion X，当前应用支持 3」），
  插件不会被激活，其余插件不受影响。
- 声明值 `≤ 3`（含缺省）→ 正常加载，向后兼容。
- 设置页的插件列表会展示每个插件声明的 apiVersion（缺省显示 1）。
- SDK 的类型面与宿主 `types.ts` **手工同步**（取舍记录见
  [`plugin-sdk` 仓库 README](https://github.com/Termii-App/plugin-sdk)
  「类型同步」）：写插件时以 SDK 导出的类型为准，两者不应分叉。

```jsonc
// 模板 hello-world 的声明（plugin-template 仓库 hello/plugin.json）
{
  "id": "hello-world",
  "apiVersion": 2 // ← 可声明 2 或 3；宿主均接受（≤ SUPPORTED_API_VERSION）
}
```

## 3. 使用 SDK 开发（@termii/plugin-sdk）

[`@termii/plugin-sdk`](https://github.com/Termii-App/plugin-sdk) 是独立仓库
（不发 npm，经 git 依赖安装），给插件作者提供：
宿主 API 类型面、`definePlugin()`、`validateManifest()` 与 esbuild 打包脚手架。
它不 import 宿主任何源码，独立可编译；类型面由宿主侧 CD 自动生成同步。
包内结构见 [plugin-sdk 仓库 README](https://github.com/Termii-App/plugin-sdk)。

### 3.1 安装 / 引用

```bash
# 插件项目内安装（git 依赖；prepare 自动构建 dist，dist 也已提交）
npm i -D github:Termii-App/plugin-sdk

# 插件代码里引用（打包时脚手架会把它 alias 到 SDK 源码，无需本地链接）
```

```ts
import { definePlugin, validateManifest, type PluginContext } from "@termii/plugin-sdk";
```

### 3.2 definePlugin

`definePlugin(plugin)` 原样返回插件对象，不做任何运行时包装；作用是
**类型收窄**——让 TypeScript 以 `PluginContext` 为上下文检查
`activate(ctx)` 的实现，并作为打包脚手架的入口约定：

```ts
import { definePlugin, type PluginContext } from "@termii/plugin-sdk";

export default definePlugin({
  manifest: {
    id: "my-plugin",
    name: "My Plugin",
    version: "0.1.0",
    apiVersion: 3, // 缺省按 1 处理；> 宿主支持版本会被 loader 拒绝
    capabilities: ["process"], // L1：信任弹窗会列出并警示
  },
  activate(ctx: PluginContext) {
    // …注册贡献点、订阅事件……
  },
});
```

`.jsx` 模板（[`plugin-template`](https://github.com/Termii-App/plugin-template)
仓库的 `hello/`）只用运行时导入
`import { definePlugin } from "@termii/plugin-sdk"`——esbuild 的 JSX 解析
不支持 TS 语法，`.tsx` 模板里再补 `import type` 即可获得完整类型上下文。

### 3.3 validateManifest

手写清单校验（零依赖，不引入 zod）。错误为中文，逐条收集；`ok: true` 时
返回**规范化后的 manifest**（`apiVersion` 缺省已按 1 填入）：

```ts
import { validateManifest } from "@termii/plugin-sdk";

const result = validateManifest(raw);
if (result.ok) {
  // result.manifest：可直接使用的 PluginManifest
} else {
  console.error(result.errors.join("\n"));
}
```

校验规则摘要（详见 [`plugin-sdk` 仓库 README](https://github.com/Termii-App/plugin-sdk)）：`id` 必填且匹配
`/^[a-z0-9-]+$/`（≤64 字符）；`name`/`version` 必填非空；`apiVersion`
可选数字（缺省 1）；`capabilities` 可选字符串数组（如 `["process"]`）；
`sidecar.binaries` 键须形如 `<os>-<arch>`；`contributes`
浅校验对象数组，元素级字段由宿主 loader 校验。

### 3.4 类型从 SDK import，不要抄宿主源码

宿主私有不开源；插件作者一律从 SDK import 类型（不复制宿主源码），
import（类型面由宿主侧自动生成同步，见 [plugin-sdk 仓库](https://github.com/Termii-App/plugin-sdk)）：

```ts
import type {
  PluginContext,
  PluginManifest,
  TermiiPlugin,
  PluginForwardInfo, // tunnels.list 的返回元素（含 hostId）
  SnippetSummary,    // 服务总线里 termii-snippets 的 "snippets" 服务返回元素
  ProcessHandle,     // ctx.process.spawn / hosts.execStream 的句柄
} from "@termii/plugin-sdk";
```

宿主侧类型只是生成源，不 copy 进插件；SDK 类型面由宿主 main 分支 push 时
自动同步（sync-sdk-types CD），若发现 SDK 与宿主签名分叉，以宿主实现为准
并检查同步流程。

### 3.5 打包：共享 React / lucide（打包脚手架）

宿主通过 `window.__termii.shared` 暴露共享的 `React` / `ReactDOM` / `lucide`。
插件打包时脚手架默认把 `react`、`react/jsx-runtime`、`react-dom`、
`lucide-react` alias 到 SDK 包的 `shims/`（运行时从共享实例取），并把
`@termii/plugin-sdk` alias 到 SDK 包的 `src/index.ts`（含生成的
host-types.ts）——**否则每个插件都会各自打包一份 React**（上下文冲突、
体积膨胀）：

```bash
# 等价于 plugin-template 的 hello/build.sh
npx termii-plugin-sdk build src/main.jsx --outfile main.js --minify
```

- 产物是单文件 ES module（`--format=esm`），`.js` 文件按 JSX 解析。
- 传 `--external react --external lucide-react` 会把共享包改回 external；
  `--external @termii/plugin-sdk` 同理。
- **i18next / react-i18next 不提供 shim，必须自带**：插件自己 `npm i`
  i18next 并随 esbuild 打进 bundle（官方插件 termii-docker 的
  `src/i18n.ts` 即此模式：副作用 import 初始化插件自身 i18n 实例）。
- esbuild 缺失时脚手架给出友好报错（先在插件项目 `npm install`）。
- 其他选项见 `npx termii-plugin-sdk --help`。

**main.css 约定（v3）**：插件目录根放 `main.css` 时，宿主
`plugin_read_bundle` 会把它的内容随主脚本一起返回（`{ source, css }`），
loader 注入一个 `<style data-plugin-css>` 节点；插件去激活 / 卸载时该
节点被移除。样式只作用于插件自身视图（可结合宿主暴露的主题 CSS 变量）。

## 4. Host API（`ctx`）

`activate(ctx)` 收到的 `ctx` 是插件与宿主之间的唯一边界，类型从 SDK
import（§3.4）。以下按 API 面分节；`ctx.apiVersion` 恒等于宿主支持版本（当前 3）。

### 4.1 贡献点注册（`ctx.ui.*`）

| 方法 | 效果 |
| --- | --- |
| `registerView({ id, icon, labelKey, ns?, component })` | 侧栏条目 + 主区视图，自动获得 ⌘1..9 快捷键与命令面板入口 |
| `registerCommand({ id, group, title, sub?, icon, run })` | ⌘K 命令面板条目 |
| `registerSettingsSection({ id, icon, labelKey, ns?, component })` | 设置页新分类 |
| `registerShortcut({ id, combo, run })` | 全局快捷键，`combo` 形如 `"Mod+Shift+D"`（Mod = ⌘/Ctrl）；内置快捷键优先命中 |
| `registerTheme({ id, label, dark, vars, previewBg?, previewFg? })` | 应用主题，出现在设置 → 外观 |
| `registerTrayItem({ id, label, run })` | 系统托盘右键菜单固定区条目 |

**id 前缀规则**：外部插件注册的任何贡献点 id 必须以 `<pluginId>.` 开头
（如 `my-plugin.panel`），否则注册被拒绝；官方插件（`manifest.official`，
见 §6.3）与内置插件使用核心 id，不受此限。

**主题 vars**：键必须是 CSS 自定义属性（`--` 开头），宿主注入
`:root[data-theme="<id>"] { … }`。常用 token：`--bg`、`--fg`、`--accent`、
`--green`、`--red` 等，完整表见宿主内置主题块。
键值会经消毒（不允许 `{}`、`;`、`</style`），违规声明被静默丢弃。

**视图/设置分区的文案**：`labelKey` 默认在 `views` / `settings` 命名空间
解析；插件应通过 `ctx.i18n.addBundle` 注册自己的文案并用 `ns` 指过去：

```js
ctx.i18n.addBundle("zh-CN", "ignored", { panelTitle: "我的面板" });
ctx.i18n.addBundle("en-US", "ignored", { panelTitle: "My Panel" });
ctx.ui.registerView({
  id: "my-plugin.panel",
  icon: Package, // lucide 图标组件
  labelKey: "panelTitle",
  ns: "plugin-my-plugin", // 命名空间会被强制改写为 plugin-<id>
  component: MyPanel,
});
```

### 4.2 其他 UI 能力（`ctx.ui.toast` / `ctx.ui.modal` / `ctx.ui.navigate`）

- `ctx.ui.toast.success/error/info({ title, description? })` — 通知。
- `ctx.ui.modal.confirm({ title, body?, confirmText?, cancelText?, danger? })`
  → `Promise<boolean>`；`ctx.ui.modal.alert({ title, body? })`。
- `ctx.ui.navigate(viewId)` — 切换主区视图（核心 id 或插件视图 id）。

持续进度型 toast 与表单弹窗（内置 Tunnels 狗粮在用）：

- `ctx.ui.toast.running({ title, description? })` → `string`（toast id）——
  创建一条**不自动消失**的持续 toast（如「启动中…」）；结束时用 `update`
  切成 success / error 并设置自动消失时长。
- `ctx.ui.toast.update(id, { kind?, title?, description?, duration? })` —
  局部更新一条 toast；`kind` 为 `"success" | "error" | "info" | "running"`。

```js
const id = ctx.ui.toast.running({ title: "正在启动隧道…" });
try {
  await ctx.tunnels.start(hostId, spec);
  ctx.ui.toast.update(id, { kind: "success", title: "隧道已启动", duration: 3000 });
} catch (e) {
  ctx.ui.toast.update(id, { kind: "error", title: "启动失败", description: String(e) });
}
```

- `ctx.ui.modal.openForm({ title: ReactNode, body: ReactNode, footer? })` —
  打开一个表单弹窗（body 为任意 ReactNode，弹窗栈的顶层入口）。
- `ctx.ui.modal.close()` — 关闭当前最顶层弹窗（表单保存/取消时调用）。

`openForm` 的 `footer` 槽位：传 `null` 时宿主渲染一个空的
`.dlg-footer` 容器，body 组件可经 `ModalFooter` portal 把按钮/状态行渲染
进底部（官方 Docker 插件的对话框模式；宿主不提供 `prompt` 等原始对话框）。

### 4.3 终端（`ctx.terminal.*`）

- `getActivePane()` → `{ paneId, kind, backendId } | null`
  （kind 为 `local` / `ssh` / `serial`；预览等非终端 pane 返回 null）。
- `writeActive(text)` → `Promise<boolean>` — 向活跃 pane 写入并聚焦。
- `focusActive()`。
- `onOutput((chunk, pane) => …)` — 订阅活跃 pane 输出流，切换 pane 自动跟随；
  返回退订函数。

- `writePane(paneId, text)` → `Promise<boolean>` — 向**指定** pane 写入
  文本（pane 不在当前活跃 tab 也能写），返回 false 表示 pane 不存在或写入失败。

### 4.4 主机（`ctx.hosts.*`）

- `list()` → 主机只读投影数组（**不含任何凭证字段**）。
- `connect(hostId)` → `Promise<sessionId>`。
- `exec(hostId, command, { timeoutSecs? })` → `{ stdout, stderr, exitCode }`。
- `disconnect(hostId)`。

（Tunnels / BatchTasks 狗粮）：

- `reconnect(hostId)` → `Promise<sessionId>` — 重建主机 transport
  （复用现有配置），返回新的 sessionId。
- `execLocal(command, { timeoutSecs? })` →
  `{ stdout, stderr, exitCode }` — 在宿主本机执行 shell 命令（临时 PTY）。

```js
const res = await ctx.hosts.execLocal("uname -a", { timeoutSecs: 15 });
if (res.exitCode === 0) ctx.ui.toast.success({ title: res.stdout.trim() });
```

- `execStream(hostId, command)` → `Promise<ProcessHandle>` — 在主机 SSH
  transport 上以 exec 通道**流式**执行命令（见 [§4.11](#411-流式进程ctxprocess--hostsexecstream)）。

### 4.5 隧道（`ctx.tunnels.*`）

端口转发投影，内置 Tunnels 视图狗粮使用，外部插件同等可用：

| 方法 | 说明 |
| --- | --- |
| `list(hostId?)` | 列出转发；缺省 hostId 返回所有主机的转发，给 hostId 则只返回该主机名下条目。元素为 `PluginForwardInfo`（`ForwardInfo & { hostId }`，**带主机归属**） |
| `start(hostId, spec)` | 启动一条转发（自动确保 SSH transport 在线），返回 `ForwardInfo` |
| `stop(hostId, forwardId)` | 停止指定转发 |
| `probeRemote(hostId, bindHost)` | 探测远端 sshd 是否会在 `-R` 转发时尊重 bindHost（启动 -R 前调用） |
| `applyRemoteConfig(hostId)` | 把远端 GatewayPorts 翻成 clientspecified 并 reload sshd（需 NOPASSWD sudo） |
| `onChanged(cb)` | 订阅某主机隧道增删变更，回调参数是 hostId；返回退订函数 |
| `saveRule(rule)` | 保存（新增或更新）一条隧道规则到宿主 Tunnels 规则库（`TunnelRule`，与宿主规则库类型同形）。只落库不启动；启动仍走 `tunnels.start`。官方 Docker 插件「从容器端口创建隧道规则」用 |

```js
const spec = {
  kind: "local",
  bindHost: "127.0.0.1",
  bindPort: 4000,
  targetHost: "localhost",
  targetPort: 22,
};
await ctx.tunnels.start(hostId, spec);
const all = await ctx.tunnels.list(); // PluginForwardInfo[]（含 hostId）
```

### 4.6 隧道规则库（已迁出为官方插件 termii-tunnels）

Tunnels 已迁出为官方插件 `termii-tunnels`，**宿主不再持有隧道规则
存储**：规则数据落在 `settings.pluginSettings["termii-tunnels"]["tunnels"]`
（经 `ctx.storage` 读写，旧配置由宿主一次性迁移）。`ctx.tunnels.saveRule`
仍可用——宿主经插件服务总线（[§4.13](#413-插件服务总线ctxpluginsv3)）转发
给该插件的 `"tunnels"` 服务（目标插件未启用时 reject）：

```ts
await ctx.tunnels.saveRule(rule); // 新增或更新一条规则（只落库，不启动）
```

### 4.7 片段库（已迁出为官方插件 termii-snippets）

Snippets 已迁出为官方插件 `termii-snippets`，**宿主不再提供
`ctx.snippets` 投影**。需要片段数据时经服务总线调用（见 [§4.13](#413-插件服务总线ctxpluginsv3)）：

```ts
const list = await ctx.plugins.invoke<SnippetSummary[]>(
  "termii-snippets",
  "snippets",
  "list"
);
// SnippetSummary { id, name, group?, command, variables: string[] }
//   variables：命令模板里的 `{{name}}` 占位符名，保留首次出现顺序
```

### 4.8 对话框与受限文件写（`ctx.dialog` / `ctx.fs`）

用于"导出结果到本地文件"一类的流程（BatchTasks 导出执行结果）：

```ts
dialog: {
  pickSavePath(opts?: { defaultName?: string }): Promise<string | null>;
  pickFile(opts?: { extensions?: string[] }): Promise<string | null>;
};
fs: { writeText(path: string, content: string): Promise<void> };
```

- `pickFile`：弹「打开文件」对话框，`extensions` 是可选扩展名白名单
  （不含前导点、小写，如 `["tar"]`）；取消返回 null。官方 Docker 插件的
  load image 对话框用。

**安全约束**：`ctx.fs.writeText` **不做任意路径写**——只允许写入**本次
会话内经 `ctx.dialog.pickSavePath` 返回的路径**（宿主在 context 内记录
已授权路径集合），防止插件乱写文件系统。取消对话框（返回 `null`）或
未授权路径都会抛错：

```js
const path = await ctx.dialog.pickSavePath({ defaultName: "batch-result.txt" });
if (!path) return; // 用户取消
await ctx.fs.writeText(path, content); // 仅此路径可写
```

### 4.9 存储（`ctx.storage.*`）

持久化 KV，落在 `config.json` 的 `settings.pluginSettings.<pluginId>`，
随宿主配置同步落盘：

```js
const token = ctx.storage.get("token", "");
ctx.storage.set("token", "…");
```

### 4.10 事件（`ctx.events.listen`）

订阅 Tauri 事件，事件名必须在白名单前缀内：
`pty://` `sshch://` `serial://` `ssh://` `transfer://` `tray://`
`fs-progress://` `forward://` + **`proc://`（流式进程
chunk/exit 事件）**。白名单外的订阅会被拒绝并打印错误。

### 4.11 流式进程（`ctx.process` / `hosts.execStream`，v3）

`execLocal` / `hosts.exec` 是一次性的（等进程退出拿全部输出），撑不起
日志 follow / 拉取进度 / 事件流。流式原语（本地进程与 SSH exec 通道同构）
返回同一个 `ProcessHandle`：

```ts
process: {
  spawn(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string,string> }):
    Promise<ProcessHandle>;
}
hosts: {
  execStream(hostId: string, command: string): Promise<ProcessHandle>;
}
interface ProcessHandle {
  readonly id: string;
  write(data: string): Promise<void>;          // 本地进程 stdin；SSH 通道同构
  kill(): Promise<void>;                       // 本地 kill 子进程；SSH 关闭 exec 通道
  onData(cb: (chunk: ProcChunk) => void): Disposer;
  onExit(cb: (info: { code: number | null; error?: string }) => void): Disposer;
}
interface ProcChunk { seq: number; data: string; stream: "stdout" | "stderr"; }
```

要点：

- `process.spawn` 以 **argv 方式**拉起本地进程（不做 shell 展开；需要 shell
  语义时显式 `spawn("/bin/sh", ["-c", cmd])`）。
- chunk 带 **stdout/stderr 分流**（`stream` 字段）——构建进度通常在 stderr。
- `kill()` 语义：本地终止子进程；SSH 关闭 exec 通道（远端进程收到 EOF）。
- **能力门禁（L1）**：`spawn` 与 `execStream` 都要求用户授予 `process`
  能力（见 §6.1），未授予即明确报错，插件其余功能可用。
- **孤儿防护**：插件去激活时，宿主强制回收其名下全部进程
  （`process_kill_by_plugin`），无需插件自行清理。

```js
const handle = await ctx.process.spawn("docker", ["logs", "-f", id], {
  cwd: "/",
});
const offData = handle.onData(({ data, stream }) => {
  if (stream === "stderr") logPanel.append(data, "err");
});
const offExit = handle.onExit(({ code, error }) => {
  offData(); offExit();
  if (code !== 0) ctx.ui.toast.error({ title: `进程退出 ${code ?? error}` });
});
```

取消语义：旧 docker.rs 的 `LOG_CANCELS` + `*_stop(opId)` 在插件内变成
`handle.kill()` + AbortController，模式一一对应。

### 4.12 终端会话创建原语（`ctx.sessions`，v3）

一键连数据库、开运维会话、Docker exec 借道都从这里开终端 tab：

```ts
sessions: {
  openLocalTab(): Promise<string | null>;        // 返回 paneId
  openHostTab(hostId: string): Promise<string | null>;
  focus(paneId: string): void;
}
```

`terminal.writePane`（§4.3）配合实现「借道」——官方 Docker 插件的
「在终端中持续跟随」模式：开 tab 后向 pane 注入 `docker exec -it …`：

```js
const paneId = await ctx.sessions.openLocalTab();
if (paneId) await ctx.terminal.writePane(paneId, `docker exec -it ${id} bash\n`);
```

### 4.13 插件服务总线（`ctx.plugins`，v3）

跨插件调用（D8）：Snippets 之于 BatchTasks 这类「功能复用功能」不能再
import，经注册表路由，调用方与被调方故障隔离：

```ts
plugins: {
  expose(service: string, handler: (method: string, params: unknown) => unknown): Disposer;
  invoke<T>(pluginId: string, service: string, method: string, params?: unknown): Promise<T>;
}
```

- `expose`：注册本插件的一个服务；返回 Disposer（去激活时自动摘除）。
- `invoke`：只允许调用**已启用（active）**插件；目标未启用 / 未 expose 该
  服务 → reject 明确错误；handler 抛错 → reject（不中断调用方）。

```ts
// 消费方（BatchTasks 的现网写法）
const list = await ctx.plugins.invoke<SnippetSummary[]>("termii-snippets", "snippets", "list");

// 提供方（termii-snippets 内部）
ctx.plugins.expose("snippets", (method, params) => {
  if (method === "list") return listSnippets();
  throw new Error(`unknown method: ${method}`);
});
```

### 4.14 凭证保险库（`ctx.vault`，v3）

keyring 投影（官方 Docker 插件的 registry 登录凭据用；KeyVault 狗粮化
的预留投影）：

```ts
vault: {
  get(id: string): Promise<string | null>;
  set(id: string, secret: string): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**无能力门禁**：`vault` 与 `hosts` / `tunnels` / `sessions` 同属核心服务
投影，不参与 capabilities 声明（`process` / `sidecar` 才需要 L1）。

### 4.15 文件传输（`ctx.sftp`，v3）

同步形态的文件传输投影（无进度回调；内部使用主机的**文件** SSH 会话，
与 `hosts.exec` 的 terminal 会话分离）：

```ts
sftp: {
  upload(hostId: string, localPath: string, remotePath: string): Promise<void>;
  download(hostId: string, remotePath: string, localPath: string): Promise<void>;
}
```

错误消息透传 sftp 命令的原始错误。官方 Docker 插件的远端 export / load
回传腿用（save/load 本地/远端默认走 `docker save -o` / `docker load -i`，
不经 SFTP）。

### 4.16 apiVersion

`ctx.apiVersion` 是宿主支持版本（当前 `3`），恒等于
`SUPPORTED_API_VERSION`；插件可读它做能力判断（示例见
[`plugin-template`](https://github.com/Termii-App/plugin-template) 的 `hello/src/main.jsx` 的 activate）。

## 5. sidecar 原生能力桥

### 5.1 定位

sidecar 让插件把"需要原生能力"的部分（系统调用、新协议、重计算）放进一个
随包分发的**本地二进制**，宿主以子进程托管，插件经 `ctx.sidecar.call` 调用。
**它是信任模型的升级而非替代**：普通外部插件仍是纯 JS；声明 sidecar 的
插件需要用户**单独确认**「允许运行原生代码」（见 §5.4）。

### 5.2 manifest schema

```jsonc
{
  "id": "sysinfo",
  "apiVersion": 3,
  "capabilities": ["sidecar"], // 声明 sidecar 隐含 process（L1）
  "sidecar": {
    // 按平台选二进制；键为 <os>-<arch>，值为插件包内相对路径
    "binaries": {
      "darwin-aarch64": "bin/sysinfo-darwin-aarch64",
      "darwin-x86_64":  "bin/sysinfo-darwin-x86_64",
      "windows-x86_64": "bin/sysinfo-windows-x86_64.exe"
    },
    "args": [] // 可选，固定启动参数
  }
}
```

当前平台无对应二进制 → 插件**可加载**，但 `ctx.sidecar.call` 返回明确错误
（见 §5.5 错误分支）。

### 5.3 进程生命周期与协议

- **生命周期**：宿主激活插件时拉起子进程（`sidecar_spawn`），
  去激活 / 卸载 / 应用退出时回收（`sidecar_kill`）；进程表为
  `HashMap<String, Child>`（Mutex）。
- **孤儿防护**：子进程 stderr 转发到宿主日志；退出码非 0 时标记该插件
  sidecar 不可用并通知前端。
- **协议**：stdio 上 **NDJSON 编码的 JSON-RPC 2.0**，一行一条请求/响应：
  - 请求 `{"jsonrpc":"2.0","id":<u64>,"method":"...","params":{...}}`
  - 响应 `{"jsonrpc":"2.0","id":<u64>,"result":...}`
    或 `{"jsonrpc":"2.0","id":<u64>,"error":{"code":..,"message":".."}}`
  - **id 由宿主递增分配**，按 id 关联应答；超时（**默认 10s**，call 可传）
    reject。
- **健康信号**：二进制侧**不回应 keepalive**——宿主以进程存活为健康信号，
  崩溃即整插件报错。

### 5.4 安全门控（能力模型）

v3 起 sidecar 的门控并入能力模型（§6.1），不再有独立的 `trustedSidecars`
字段（persist 迁移兼容旧数据）：

- `capabilities` 声明 `sidecar`（隐含 `process`）→ 插件进入 **L1**，信任
  弹窗逐项列出能力并警示「将以你的用户权限执行任意命令」；确认状态存
  `settings.trustedCapabilities[pluginId]`。
- **未确认 → `sidecar_spawn` 拒绝，进程不拉起**；插件其余部分
  （纯 JS 贡献点）仍可用。
- 官方插件自动授予（§6.3），无需弹窗。

### 5.5 `ctx.sidecar.call` 用法与错误分支

```ts
// 返回二进制回应的 result（Rust 侧 JSON 反序列化后透传）
const info = await ctx.sidecar.call("getSystemInfo", { extra: true }); // params 可选
const slow = await ctx.sidecar.call("heavyJob", { n: 1e6 }, 30_000);  // timeoutMs 可选，默认 10000
```

错误分支（各自抛明确错误，插件应捕获并展示）：

| 场景 | 行为 |
| --- | --- |
| manifest 未声明 `sidecar` | 报「插件未声明 sidecar」 |
| 已声明但未获用户确认（L1 未授予） | 报「sidecar 未获确认，进程未拉起」 |
| 当前平台无对应二进制 | 报「当前平台无可用二进制」 |
| 进程退出 / 崩溃 | 整插件报错，`call` reject |

### 5.6 示例插件

[`plugin-template`](https://github.com/Termii-App/plugin-template) 的 `sidecar-sysinfo/` 是一个可运行的 sidecar 示例：极简
二进制实现 `getSystemInfo` 方法，插件视图调用 `ctx.sidecar.call("getSystemInfo")`
并渲染。构建/安装说明见该模板 README。

## 6. 生命周期、信任与官方插件

### 6.1 能力声明（capabilities）

信任从能力声明模型（D4）出发：

- **L0（默认）**：`capabilities: []`（或省略）——纯 JS + Host API 白名单，
  现有信任确认即可。
- **L1**：声明 `process` 或 `sidecar` 任一 → 信任弹窗**逐项列出能力**并
  警示「将以你的用户权限执行任意命令」；`sidecar` 隐含 `process`。
- `ctx.process.spawn` / `hosts.execStream` / `sidecar_spawn` 未获授予 →
  明确错误，插件其余功能可用。
- 官方插件自动授予（§6.3）。

### 6.2 第三方插件

- **信任**：从磁盘 / URL 安装的外部插件默认「未信任」，需要用户在
  设置 → 插件 中确认后才激活。`contributes` 摘要 + 能力列表就是给用户看的。
- **启用/禁用**：随时可切换，状态持久化。禁用时宿主回放所有注册返回的
  Disposer，**强制回收其全部进程**（`process_kill_by_plugin`）与 sidecar，
  并调用插件的 `deactivate()`。
- **去激活兜底**：若插件的视图正被显示，切回连接视图；若其主题正在使用，
  回落到 dark；其 main.css 注入的 `<style>` 一并移除。
- **故障隔离**：单个插件加载/激活失败只记录日志，不影响宿主与其他插件。
- **卸载**：设置页一键移除目录与持久化状态（`pluginSettings` 里的数据保留，
  重装后可恢复）。

### 6.3 官方插件（bundled）

- 官方插件随安装包预装（bundled 资源目录），启动时 loader 按版本号同步到
  `app_data_dir/plugins/<id>/`（新版覆盖旧版）。
- `manifest.official: true` 的注入来源有二：bundled 同步时由宿主写入；
  **市场安装**时随官方签名包自带的 `plugin.json` 声明带入（安装路径
  `install_from_bytes_job` 验签通过即保留；无签名 / 验签失败一律剥离，
  `strip_official_flag`，第三方伪造无效）。
- 自动信任（豁免信任弹窗）、**可禁用、不可卸载**；设置页显示「内置组件」
  徽标。
- dev 模式回退：debug 构建直接从仓库 `plugins/official/` 加载（跳过验签，
  见 §7），改插件源码后需重新构建其 main.js。
- 官方插件与第三方**同一 API 面**：官方插件包内不得 import 宿主内部模块
  （`src/lib`、`src/stores` 等），验收时以 grep 证明。

## 7. 签名与分发

### 7.1 信任根

插件签名复用 **Tauri updater 的 minisign 信任根**：公钥即宿主
`tauri.conf.json` 的 `plugins.updater.pubkey`，私钥
`~/.tauri/termii.key`（带密码，永不进仓库）。签名文件与 updater 的
signature 字段同格式（`tauri signer sign` 输出）。

### 7.2 官方插件（发布流程强制）

官方插件发布时必须带签名（**release 构建 bundled 同步时强制验签**，
缺失 / 失效会被跳过并报错；debug 放行）：

```bash
# 1. 构建插件产物（main.js / main.css）
npx termii-plugin-sdk build src/index.ts --outfile main.js --minify

# 2. 生成签名清单（manifest.txt + manifest.txt.sig；私钥带密码，持钥者执行）
bash scripts/sign-official-plugins.sh            # 签名 plugins/official/ 下全部
bash scripts/sign-official-plugins.sh plugins/official/termii-docker  # 只签指定插件
```

- `manifest.txt`：规范化 sha256 清单（每行 `"<hex>  <relative-path>"`，
  路径相对插件目录、字典序、UTF-8、行尾 `\n`）。
- `manifest.txt.sig`：minisign 对 manifest.txt 内容的签名。
- 当前 bundled 插件**未带签名文件**（dev 路径不受影响），发布前需执行上表。
- 市场发布（catalog + tar.gz + 包级签名）走 §7.4 的 `publish-plugins.sh`。

### 7.4 官方插件市场发布

官方插件默认从市场安装（catalog 条目带 `official: true`，包内
`plugin.json` 也声明 `official: true`）。发布走自动化链路：

```
Termii-App/termii Actions（release-plugins，手动触发）
  构建 main.js → minisign 签名 tar.gz → 生成 catalog.json → 推 Termii-App/plugins
    └── plugins 仓库 check（schema + 官方包验签）→ deploy → Cloudflare Pages
         └── https://plugins.termii.meowdream.cn/catalog.json
```

- 本地等效命令：`bash scripts/publish-plugins.sh --push`（构建 → 签名 →
  打包 → 生成 catalog.json → 同步并推送；私钥与密码经
  `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 提供）。
- CI 等效：GitHub Actions 手动触发 `release-plugins` workflow（secrets 见
  该 workflow 头部注释）。
- 官方包验签通过后，宿主保留 `official: true`（§6.3）——自动信任、
  核心命名空间豁免、可禁用不可卸载，与 bundled 时代行为一致。
- 市场 UI：设置 → 插件 → 插件市场（官方条目带「官方」徽标）。

### 7.3 第三方插件（分发）

- **从 URL 安装**：设置 → 插件 → 从 URL 安装。前端 fetch 字节后经
  `plugin_install_from_bytes` 落盘（tar.gz，目录根 = 插件目录），带
  minisign 签名则验签（**签名失效 → 拒绝安装**），无签名可装（走信任弹窗）。
- **目录 JSON**：`catalog.json` 的唯一事实源是组织仓库
  [`Termii-App/plugins`](https://github.com/Termii-App/plugins)（条目含
  名称 / 版本 / 描述 / 下载 URL / 可选签名 / official 标记）；main 分支
  推送后经 GitHub Actions 自动部署到
  `https://plugins.termii.meowdream.cn/catalog.json`（Cloudflare Pages，
  与官网同 CDN，下载流量不走 GitHub）。应用内读取地址见
  应用内读取地址见宿主 `catalog.ts` 的 `CATALOG_URL`。
- **更新检查**：已装插件的更新检查是**手动的**（catalog 条目 vs 已装版本，
  复用 update.ts 的版本比较）；**不做**插件市场 UI / 自动更新 / 付费 / 评论。

## 8. 调试

- dev 下 `npm run tauri dev`，插件加载/激活的报错打在 webview 控制台
  （`插件 <id> …` 前缀）；debug 构建跳过 bundled 验签，直接加载仓库
  `plugins/official/`。
- 生产构建的 CSP 允许 `script-src blob:`，外部插件经 Blob URL 加载；
  插件内不允许远程脚本/样式，网络请求请走 `ctx.hosts.exec` 或页面 fetch
  （受 `connect-src` 限制）。
