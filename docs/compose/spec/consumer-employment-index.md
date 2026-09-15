---
feature: consumer-employment-index
status: delivered
updated: 2026-09-14
branch: main
commits: none (uncommitted; commit not requested)
---

# 消费就业感知指数（CEPI）v2

## Report

**What was built** — 消费就业感知指数（CEPI）v2：三维度九指标、双轨评分（Z-score + 2019基准绝对水平）、就业优先加权。解决v1的「Z-score相对论陷阱」——边际改善但绝对水平仍差的场景不会被误报为「偏强」。包含SQLite数据库、命令行录入/计算/仪表盘生成脚本、自包含HTML仪表盘（含方法论介绍和数据准确性反思）。

**Verification** — 全部命令测试通过：`init`（9指标3表）、`add`（6个月月频+10周周频样本数据）、`calc`（双轨评分正确区分青年失业率「边际改善但绝对仍差」→中性52.5 vs 新能源渗透率「真实改善」→强82.8）、`dashboard`（HTML含方法论和局限性板块）。

**Journey log** —
1. v1用六个活动量指标做等权Z-score，用户指出「数据偏强但实际还在底部」的背离。
2. 分析出三个根因：Z-score相对论陷阱、活动量≠体感压力、K型分化被平均数掩盖。
3. v2改为九指标三维度（就业40%/消费30%/财富30%），双轨评分解决边际vs绝对问题。
4. 用户否决百度指数，改用智联CIER；要求HTML带方法论介绍和数据准确性反思。

## [S1] Problem

v1 使用六个「活动量」指标（票房、汽车、快递等）做等权Z-score合成，存在两个致命缺陷：
1. **Z-score相对论陷阱**：只测「边际在改善」，不测「绝对水平在哪」。如果过去一年本来就很差，轻微反弹就会显示「偏强」，但实际体感仍在底部。
2. **测的是GDP微观代理变量，不是老百姓的钱包厚度**：活动量上升可能靠低价单、爆款拉动、新能源替代燃油，掩盖K型分化和工资/房价/就业的真实痛感。

需要重新设计为「体感压力指标」体系：测的是「人在不在熬」，不是「经济在不在转」。

## [S2] Design

### 设计原则

1. **测压力，不测活动量**：优先选择能反映就业痛感、消费降级、财富缩水的指标
2. **双轨评分**：每个指标同时计算边际分（Z-score）和绝对水平分（vs 2019基准），各占50%
3. **三维度加权**：就业压力40%、消费质量30%、财富效应30%
4. **区分K型分化**：用结构指标（新能源渗透率、核心CPI）而非总量指标

### 指标清单（9个，三维度）

**就业压力维度（权重40%）**

| # | 指标 | 频率 | 来源 | 逆向? | 2019基准 |
|---|---|---|---|---|---|
| 1 | 城镇调查失业率（%） | 月 | 统计局 | 是（高=差） | ~5.0% |
| 2 | 16-24岁青年失业率（%） | 月 | 统计局 | 是（高=差） | ~12% |
| 3 | CIER就业景气指数 | 月 | 智联招聘 zhaopin.com | 否（高=好） | ~1.9 |

**消费质量维度（权重30%）**

| # | 指标 | 频率 | 来源 | 逆向? | 2019基准 |
|---|---|---|---|---|---|
| 4 | 电影场均人次（人/场） | 周 | 猫眼专业版 | 否 | 待标定 |
| 5 | 新能源乘用车渗透率（%） | 周/月 | 乘联会 | 否 | ~5% |
| 6 | 核心CPI同比（%） | 月 | 统计局 | 否 | ~1.5% |

**财富效应维度（权重30%）**

| # | 指标 | 频率 | 来源 | 逆向? | 2019基准 |
|---|---|---|---|---|---|
| 7 | 70城二手房价环比（%） | 月 | 统计局 | 否 | ~0% |
| 8 | 贝壳北上广挂牌量（套） | 周 | 贝壳App | 是（高=差） | 待标定 |
| 9 | 居民存款/贷款增速差（pct） | 月 | 央行 | 是（高=差，说明不敢借钱） | 待标定 |

### 双轨评分方法

对每个指标 $i$，计算两个分量：

**边际分（Z-score）**：
$$Z_i = \frac{x_i - \mu_i^{rolling}}{\sigma_i^{rolling}}$$
- 窗口：月频指标用过去12个月，周频用过去52周
- 截断到 $[-3, +3]$
- 逆向指标先取负号

**绝对水平分（vs 2019基准）**：
$$A_i = \frac{x_i - B_i}{|B_i|} \times 100$$
- $B_i$ 为2019年基准值（需要手动标定）
- 逆向指标：$A_i = \frac{B_i - x_i}{|B_i|} \times 100$
- 截断到 $[-100, +100]$，然后线性映射到 $[0, 100]$：$S_i^{abs} = 50 + A_i / 2$

**双轨合成**：
$$S_i = 0.5 \times (50 + 10 \times Z_i) + 0.5 \times S_i^{abs}$$

**维度合成**：
$$D_k = \frac{1}{n_k} \sum_{i \in \text{dim}_k} S_i$$

**CEPI**：
$$\text{CEPI} = 0.40 \times D_{\text{就业}} + 0.30 \times D_{\text{消费}} + 0.30 \times D_{\text{财富}}$$

### 数据模型（SQLite）

数据库路径：`research/consumer-index/cepi.db`

```sql
-- 指标定义表
CREATE TABLE IF NOT EXISTS indicator_meta (
    name TEXT PRIMARY KEY,             -- e.g. 'youth_unemployment'
    display_name TEXT NOT NULL,        -- 中文名
    dimension TEXT NOT NULL,           -- 'employment'/'consumption'/'wealth'
    unit TEXT NOT NULL,
    freq TEXT NOT NULL,                -- 'weekly'/'monthly'
    reverse INTEGER NOT NULL DEFAULT 0, -- 0=正向, 1=逆向
    baseline_2019 REAL,                -- 2019基准值，可为NULL（待标定）
    source TEXT NOT NULL
);

-- 数据点表
CREATE TABLE IF NOT EXISTS indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    value REAL NOT NULL,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(indicator_name, period_start)
);

-- 快照表
CREATE TABLE IF NOT EXISTS index_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE NOT NULL,
    cepi_score REAL NOT NULL,
    dimension_scores TEXT NOT NULL,    -- JSON: {"employment": 45.2, ...}
    indicator_scores TEXT NOT NULL,    -- JSON: {"youth_unemployment": {"z": 0.5, "abs": 62, "final": 56}, ...}
    raw_values TEXT NOT NULL,
    note TEXT,
    UNIQUE(snapshot_date)
);
```

### CEPI解读

| 区间 | 含义 | 对应体感 |
|---|---|---|
| 0-25 | 严重承压 | 大面积裁员、不敢消费、资产缩水 |
| 25-40 | 明显偏弱 | 就业难、消费降级、房价下跌 |
| 40-55 | 底部摸底 | 边际改善但绝对水平仍差 |
| 55-70 | 温和复苏 | 就业改善、消费回暖、房价企稳 |
| 70-100 | 明显改善 | 全面复苏信号 |

### HTML仪表盘

生成 `research/consumer-index/dashboard.html`，包含：
- CEPI当前读数 + 三维度分项读数
- 双轨分解：每个指标的边际分和绝对水平分
- 趋势图（过去52周/12个月）
- K型分化提示：哪些维度在改善、哪些在恶化
- 数据来源和更新日期

## [S3] Out of Scope

- 不做自动数据抓取（全部手动录入）
- 不做预测或因果推断
- 不连接券商或交易系统
- 不提供投资建议
- 不使用百度指数作为数据源

## Tasks

- [x] T1: 重建SQLite数据库（v2表结构） — acceptance: `cepi.db`包含`indicator_meta`、`indicators`、`index_snapshots`三张表，9个指标已预置（covers: S2.数据模型）
- [x] T2: 更新数据录入脚本 — acceptance: 支持9个新指标，含2019基准值参数（covers: S2.数据录入; depends: T1）
- [x] T3: 实现双轨评分计算 — acceptance: 对每个指标同时计算Z-score和绝对水平分，按维度加权合成CEPI（covers: S2.双轨评分; depends: T1）
- [x] T4: 更新HTML仪表盘 — acceptance: 显示三维度分项、双轨分解、K型分化提示（covers: S2.HTML仪表盘; depends: T3）
- [x] T5: 验证 — acceptance: 用模拟数据验证双轨评分正确性，确认绝对水平分能区分「从底部改善」和「已在高位」（covers: S2全部; depends: T2, T3, T4）
