# OKF-lite

OKF-lite 是 Tactics 仓库 `Tools/okf` 工具包的通用精简移植,用于维护跨系统项目知识索引 bundle(默认 `<repo>/.agents/knowledge`),纯标准库实现,无第三方依赖。

## 能力

- `validate_bundle.py` — 校验 bundle:根 index 渐进导航、概念 frontmatter(type/title/description/timestamp/status/catalog_scope/repo_paths/verified_revision/source_fingerprint)、active scope 唯一性、superseded/archived 语义、正文链接与 repo_paths 存在性、catalog-scopes.yaml 映射。
- `catalog_impact.py` — `report --worktree` 按 git 工作区改动找出受影响 scope;`sync --worktree --scope X --write` 计算 source fingerprint 并写回概念 frontmatter 与根 log.md。

## 命令

```
python validate_bundle.py [--repo-root DIR] [--bundle PATH] [--allow-missing-repo-prefix PREFIX]
python catalog_impact.py --repo-root DIR report --worktree [--format text|json] [--strict-unmapped]
python catalog_impact.py --repo-root DIR sync --worktree --scope <scope> [--scope ...] [--write]
```

- bundle 根目录默认 `<repo>/.agents/knowledge`,`--bundle` 或环境变量 `OKF_BUNDLE` 覆盖。
- scope 词汇完全由各仓库 `catalog-scopes.yaml` 定义,工具不内置任何项目专属 scope 列表。

## 与完整版(Tools/okf)的差异

- 去除 tactics/Unity/godot 特指:删除 `Assets/Tactics` 等固定路径、`.meta` 硬编码(改为 catalog 可配置 `companion_suffixes`)、游戏化 type 词汇(`Game System`/`Operational Playbook` 等 → 通用 `EVIDENCE_REQUIRED_TYPES`)。
- 根 index frontmatter 的 `tactics_profile` 字段更名为 `profile`(取值仍为 0.1/0.2,决定 verified_revision 或 source_fingerprint)。
- 指纹命名空间改为 `okf-lite-source-v1`(与原版指纹不可比,换用后需重新 sync)。
- 依赖 PyYAML 移除,由 `okf_yaml.py` 提供精简 YAML 子集解析;`requirements.txt` 删除。
- source_fingerprint 依赖仓库为 git 仓库(git diff/ls-files)。

## 降级项

- 报告与 sync 能力完整保留,无功能降级;仅 YAML loader 支持有限子集(锚点/别名/块标量/多文档流会明确报错)。