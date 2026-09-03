<div align="center">

# TCRN Workflow Helper

### 你只手工核对一个文件，一次。之后它替你拒绝其余所有东西

**单文件、零依赖的引导器。在发行包的任何一行代码运行之前，先证明它就是当初发布的那一份。**

简体中文 · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue) ![deps](https://img.shields.io/badge/dependencies-0-success) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational) ![network](https://img.shields.io/badge/network-none-important) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue)

[先核对这一个文件](#先核对这一个文件) · [它解决什么](#它解决什么) · [给谁用](#给谁用) · [它强制什么](#它强制什么) · [三分钟上手](#三分钟上手) · [当前状态](#当前状态) · [完整文档](#完整文档)

</div>

---

## 先核对这一个文件

引导器是你唯一需要相信的东西，所以在相信它说的任何话之前，先核对它本身。一条命令，一次比对：

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

这个摘要在三个地方公布：这里、`SECURITY.md`、以及 GitHub 的发布说明。**算出来的不一致就停下**，不要运行任何东西，也不要「先试试看」。不一致说明这套机制正在起作用。

## 它解决什么

一个技能或工作流从仓库下载下来，没有任何东西能证明你即将运行的字节，就是有人真正审阅过的那些字节。

TCRN Workflow Helper 把这个问题收敛成一次手工核对。你核对完引导器之后，接受哪些发行字节这件事就由密码学决定，不再由你判断。没有 `--force`，因为没有这个选项。

## 给谁用

| | |
| --- | --- |
| **适合** | 你要在自己的机器上运行 TCRN Workflow，并且希望在任何代码执行之前先确认字节。你接受一次手工核对换来之后的全自动拒绝。 |
| **不适合** | 你不需要发行字节的来源保证，或者你愿意直接运行下载到的任何东西。 |

## 它强制什么

| 保证 | 怎么做到的 |
| --- | --- |
| **可复现的产物** | 技能归档、源码归档、SBOM 都是确定性的。干净克隆的 CI 从零重建它们，并断言摘要与已提交的一致。任何人都能重建字节自行核对。 |
| **精确的发行身份** | 受理的 Workflow 版本由仓库地址、版本号、提交、树对象、以及带注解的标签对象共同钉住，对着真实的 Git 检出核验。Git 对象 id 本身是内容哈希，所以这个绑定自证。 |
| **钉死的发行字节** | 受理的归档与来源证明摘要被编译进引导器自身。任何其它归档都会失败，返回 `IDENTITY_MISMATCH`。 |
| **防回滚** | GitHub 不可变发布：标签不能移动，资产不能替换。旧版本同样过不了钉死摘要的比对，因为每个引导器只接受一份归档。 |
| **敌意归档防护** | 路径穿越、绝对路径、控制字符、非 NFC 路径、重复与大小写冲突的路径、链接、特殊文件、逐条摘要篡改、条目与字节上限，全部在解包之前拒绝。 |
| **不碰活动目录** | 安装、更新、重装、卸载只在一次性的 `tcrn-helper-test-*` 根目录里进行。任何含有 `.claude` 或 `.codex` 路径段的位置，不论大小写，在探测文件系统之前就被拒绝，返回 `LIVE_LOCATION_FORBIDDEN`。 |
| **事务化的生命周期** | 每一次改动都是暂存并记日志的事务，崩溃恢复由真实的 `SIGKILL` 注入证明。失败的操作留下逐字节相同的原状态，零残留。 |

## 三分钟上手

```sh
# 跑完整证明套件（离线；预计 10 到 20 分钟，其中包含真实的 SIGKILL 故障注入）
npm test

# 在任何东西执行之前，先校验一个发行包
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>

# 只读校验安装器放到技能目录里的那份副本
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <技能目录/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# 解析出唯一一个受理的 Workflow 检出（有歧义、有符号链接、工作树不干净都会拒绝）
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-检出路径>
```

成功时输出一条规范格式的 JSON 收据（`TRUST_VALIDATED`、`ROOT_RESOLVED`、`NETWORK_PLAN_APPROVED`、`INSTALL_COMPLETED`、`UNINSTALL_COMPLETED`）。失败时输出一个稳定的原因码。没有中间状态。

## 当前状态

- `1.0.1` 是首个受理版本，精确支持 TCRN Workflow `v1.0.1`。
- 引导器是单个文件，零依赖，不联网，不发遥测。
- 网络操作只做规划不执行：`plan-network` 打印一份静态计划，本身不发出任何请求。

## 完整文档

架构、命令参考、判据与门、已知限制在 TCRN Workflow 仓库的 [Wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)。本仓库不单独维护 Wiki。

本仓库内的文档：[贡献指南](./CONTRIBUTING.md) · [安全策略](./SECURITY.md) · [行为准则](./CODE_OF_CONDUCT.md) · [发版流程](./RELEASING.md)

## 许可

Apache-2.0。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
