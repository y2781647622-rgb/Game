# 深渊厨房 V6 · Abyss Kitchen

深渊厨房是一款单文件浏览器游戏。白天进入深渊狩猎、收集食材，晚上经营餐厅，用营业收入升级武器和店铺。

## 开始游戏

下载仓库后，用浏览器打开根目录的 [index.html](index.html)。游戏界面、绘图、音效和逻辑均包含在这一文件中，可离线游玩。

- **键盘和鼠标**：WASD 移动，鼠标瞄准并按住左键攻击，空格闪避。
- **触摸屏**：用左侧摇杆移动，右侧按钮攻击和闪避，系统自动瞄准附近敌人。

## V6 更新

- **武器词条**。每把武器有一个附魔槽，七类词条各有三档数值。重铸消耗 1 枚精英核心和 200G。
- **公会金融**。每次贷款 3,000G，欠款上限 9,000G，日息 3%。香料期货每份 800G，三天后有 75% 的概率收回 1,100G。
- **触屏操作**。狩猎界面增加虚拟摇杆、攻击和闪避按钮，以及自动瞄准。
- **经济和成长**。下调房租与周目成本增幅，经营负债利息每天最多 200G，放慢武器专精成长。

## 截图与模拟结果

[狩猎准备](docs/v6/screenshots/v6-prep.png) · [黑市](docs/v6/screenshots/v6-market.png) · [营业结算](docs/v6/screenshots/v6-report.png) · [触屏狩猎](docs/v6/screenshots/v6-touch.png)

固定随机种子的 [60 天模拟报告](docs/v6/v6-sim-report.json) 记录了每日经济和成长数据。第 10 天房租占收入 9.9%，第 7 天武器专精满级，60 天内出现 0 个负债日。第 50 天金币为 4,953G，第 60 天为 35,118G，此时 25 个一次性消费项目已完成 24 个。后期金币积累过快，仍需真人试玩验证经济节奏。

## 开发与验证

使用 Node.js 22 或更高版本，在仓库根目录运行：

```sh
node tools/v6/_test_v6.js index.html
node tools/v6/_sim_v6.js index.html
```

模拟脚本在当前目录生成 `v6-sim-report.json`。[回归测试](tools/v6/regression/) 目录中的 R1、R2、V3、V4、V5 脚本也可传入根目录的 `index.html` 作为测试目标。

[浏览器验证脚本](tools/v6/_browser_v6.js) 使用 Chrome Headless 检查词条、黑市、营业结算与模拟触控。若 Chrome 位于其他位置，设置环境变量 `CHROME_PATH`。可用第二个参数指定截图输出目录，默认写入系统临时目录。

```sh
node tools/v6/_browser_v6.js index.html
```

[V5 快照](tools/v6/abyss-kitchen-v5.html) 是 [V6 生成脚本](tools/v6/_apply_v6.py) 的输入。使用 Python 3 在 `tools/v6` 目录运行 `python _apply_v6.py`，会在该目录生成 `abyss-kitchen-v6.html`。仓库的游戏入口为根目录的 `index.html`。
