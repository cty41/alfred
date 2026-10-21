---
name: knowledge-maintenance
description: "Use when querying, ingesting, superseding, or linting the cross-system project knowledge index (OKF-lite bundle)"
---

# Knowledge Maintenance (OKF-lite)

维护 `.agents/knowledge/` 的知识索引 bundle，使其能导航到当前设计、活跃计划、代码和测试。

## Quick Reference

| 操作 | 入口 |
|---|---|
| 查询 | `.agents/knowledge/index.md`（从根索引渐进读取） |
| 影响检测 | `python <skills-checkout>/tools/okf-lite/catalog_impact.py report --worktree --repo-root <project>` |
| 同步 scope | `python <skills-checkout>/tools/okf-lite/catalog_impact.py sync --worktree --scope <scope> --write --repo-root <project>` |
| 校验 | `python <skills-checkout>/tools/okf-lite/validate_bundle.py --repo-root <project>` |
| 工具测试 | `python -m unittest discover <skills-checkout>/tools/okf-lite -p "test_*.py"` |

## 工具定位（OKF 工具链）

- OKF 工具**不在项目仓库内**：默认使用全局 skills 仓 checkout 的 `tools/okf-lite/`（`<skills-checkout>` 即该仓的本地路径）。不要假设项目里有 `tools/okf-lite/`。
- bundle 根目录始终显式指定：`--repo-root <project>` + `--bundle <project>/.agents/knowledge`（或 `OKF_BUNDLE` 环境变量），避免在错误目录执行。
- 项目若自带 OKF 工具链并在自身 `AGENTS.md` 中映射命令（如 tactics 的 `Tools/okf/*`），以项目的工具与命令为准，忽略本章默认路径。

## When to use

- 查询或更新跨系统当前状态。
- 代码、资产、测试或权威文档变化后同步受影响 scope。
- 摄取外部资料、替代旧概念、修复 index/frontmatter/link。
- 清理文档与计划时维护可发现性和历史关系。

## 真相源边界

- 当前设计：`.agents/docs/` 中的主题权威文档；`brainstorm.md` 只是临时灵感，不是事实源。
- 当前任务：仅指 `.agents/plans/` 中仍需执行的活跃计划。
- 当前行为：代码、资产和测试。
- 知识索引（OKF-lite）：摘要、关系、验证 revision 和导航。

计划完成后，结果必须从实现与权威 docs 推导；不要继续引用已删除计划作为当前事实。索引自身的历史概念不要物理删除，应使用 `superseded` 或 `archived` 状态保留关系。

## Workflow

### 1. 渐进查询

从根 index 开始，只读取相关子 index 和概念页，再按 `repo_paths` 回到真相源。不要先加载整个 bundle。

### 2. 检测影响

对工作区变更先运行：

```powershell
python <skills-checkout>/tools/okf-lite/catalog_impact.py report --worktree --repo-root <project>
```

只处理本任务实际影响的 scope；不要同步工作区中他人的无关修改。scope 词汇由本项目在 AGENTS.md 中映射（默认集合见本仓 README）。

### 3. 更新概念与关系

- active scope 唯一；
- frontmatter 的路径、状态、revision 和 fingerprint 有效；
- 关系同时写成正文 Markdown 链接；
- 新概念加入子 index，目录加入父 index；
- 替代旧概念时填写 `superseded_by`，归档完成切片时使用 `archived`。

### 4. 记录并同步

在根 `log.md` 记录 Creation、Update、Deprecation 或 Lint。更新正文后，对实际受影响 scope 分别执行：

```powershell
python <skills-checkout>/tools/okf-lite/catalog_impact.py sync --worktree --scope <scope> --write --repo-root <project>
```

### 5. 校验

```powershell
python -m unittest discover <skills-checkout>/tools/okf-lite -p "test_*.py"
python <skills-checkout>/tools/okf-lite/validate_bundle.py --repo-root <project>
```

## Anti-patterns

| 错误 | 正确 |
|---|---|
| 扫描整个知识库后再找主题 | index → 子 index → 概念页渐进读取 |
| 把索引当实现真相源 | 回到 repo_paths 指向的实现与测试 |
| 复制完整设计/计划 | 摘要并链接权威来源 |
| 已完成计划继续作为当前依据 | 从 docs、代码、资产、测试重建当前结论 |
| 将 brainstorm 灵感写成当前状态 | 先核对并迁入设计、缺口或计划 |
| 删除过时索引概念 | 标记 superseded/archived 并保留关系 |
| 同步所有报告 scope | 只同步本任务影响的 scope |

## Checklist

- [ ] 已从 index 渐进读取并复核真相源。
- [ ] active `catalog_scope` 唯一。
- [ ] repo_paths、正文链接、index 与 log 已同步。
- [ ] 已完成计划不再作为当前事实来源。
- [ ] 影响检测、scope sync、validator 和单元测试通过。