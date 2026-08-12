# Termii Plugin Market

官方与社区插件目录。应用内「设置 → 插件 → 市场」读取本仓库发布的
`catalog.json` 展示、安装与更新插件（经 Cloudflare Pages 托管，程序
不直接读本仓库）。

## 仓库结构

```
├── catalog.json        # 插件目录（程序读取的唯一事实源）
├── packages/           # 插件发布产物（tar.gz + minisign 签名）
│   ├── official/       #   官方插件
│   └── community/      #   社区插件（作者可自托管，不必须放在这里）
└── README.md
```

## 上架插件

1. 用 [`plugin-template`](https://github.com/Termii-App/plugin-template) 开发插件
2. 构建出 `tar.gz` 包（可选附带 minisign 签名，签名需要官方信任根公钥）
3. 向本仓库提交 PR：
   - 在 `catalog.json` 的 `plugins` 数组加一条（schema 见文件头注释）
   - `downloadUrl` 可指向**你自己的托管**（GitHub Releases、任意 https 静态托管），
     不必把包提交进本仓库
4. 维护者审核合并后自动发布

## 插件包要求

- `plugin.json` 的 `id` 为 kebab-case（`[a-z0-9-]{1,64}`），也是安装后的目录名
- `apiVersion` 不得超过宿主当前支持版本（`3`）
- 未签名包可安装（走信任确认弹窗）；带签名但验签失败会被拒绝

## 官方插件

| 插件 | 说明 |
| --- | --- |
| `termii-docker` | Docker 容器管理（侧栏视图、日志跟随、registry 凭据） |
| `termii-tunnels` | 端口转发规则（规则库自 v3 起由本插件持有） |
| `termii-snippets` | 命令片段库（经服务总线供 BatchTasks 等复用） |
| `termii-batch` | 多主机并行任务 |

官方插件源码在 [`Termii-App/termii`](https://github.com/Termii-App/termii) 的
`plugins/official/`，本仓库 `packages/official/` 只放发布产物。
