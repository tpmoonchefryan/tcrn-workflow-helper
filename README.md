# TCRN Workflow Helper

TCRN Workflow 的 Skill 载荷。本仓库只分发 `skill/tcrn-workflow-helper/`：一份
`SKILL.md` 与 `references/` 下的指导文档，供 Claude Code 与 Codex 两个宿主读取。

引擎本身在 [tcrn-workflow](https://github.com/tpmoonchefryan/tcrn-workflow)，不由
本仓库安装。本仓库不再携带引导器、发布归档、SBOM 或发版门；它是一份文档载荷，
不是一条发布链路。

## 安装

用 `skills` 安装器把 Skill 复制进两个宿主：

```sh
npx skills add tpmoonchefryan/tcrn-workflow-helper \
  --skill tcrn-workflow-helper \
  --global --agent claude-code --agent codex --copy --yes
```

`--copy` 是刻意的：宿主里必须是一份普通目录，符号链接不是有效的已安装副本。
安装器只放置文件，它不是信任根。

## 引擎版本对齐

**引擎版本对齐由工作区设置 `engine.requiredVersion` 承担，不由本仓库承担。**
容器用这个键声明它的记录是在哪一版引擎的契约下写的；不满足该声明的引擎按名拒绝，
并同时报出要求版本与运行版本，而不是把版本落后表现成链损坏。设置的读写与追问方式见
`skill/tcrn-workflow-helper/references/platform-layout.md` 与
`skill/tcrn-workflow-helper/references/first-run-wizard.md`。

## 仓库内容

| 路径 | 内容 |
| --- | --- |
| `skill/tcrn-workflow-helper/SKILL.md` | Skill 根，带 `name` 与 `description` frontmatter |
| `skill/tcrn-workflow-helper/references/` | 指导文档载荷 |
| `skill/tcrn-workflow-helper/agents/openai.yaml` | 多宿主包装器的宿主元数据 |
| `skill/tcrn-workflow-helper/scripts/create-skill-archive.mjs` | 生成确定性归档清单 |

## 完整文档

架构、命令参考、判据与门在 TCRN Workflow 仓库的
[GitHub Wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)。本仓库不单独维护 Wiki。

## 许可

Apache-2.0，见 [LICENSE](./LICENSE)。
