# 大圣破阵录 — 源代码 / Developer Notes

可玩 Demo: https://minusplus2025.github.io/wukong-game
项目报告: https://minusplus2025.github.io/wukong-demo/wukong-report.pdf

浏览器 3D 动作垂直切片：三回、三 Boss、四神通、六根抉择与两结局。

## 运行

本目录是源代码；大模型与 3DGS 资产不重复放两份，使用仓库根目录的 `models/`、`models/live-opt/`、`worlds/`：

```bash
npm install
mkdir -p public
ln -s ../../models public/models
ln -s ../../textures public/textures
npm run dev -- --port 5181
```

打开 http://localhost:5181/ 。

## 操作

- WASD 移动，鼠标/方向观察
- 左键 / J：轻棍四段
- 右键 / K：蓄力重劈（消耗棍势）
- Shift：幻影闪身；红光窗口内触发完美闪身/子弹时间
- 章节：清怪并击败本回 Boss、完成六根选择才解锁下一回，不能直接跳关
- Q / Tab / 中键：锁定 / 解除锁定
- F：弹反 / 破防后处决
- E：横扫千军 / 妖形招式
- V：切换已收集妖形
- G：南天门天钟镇妖
- 1 定身、2 身外身、3 芭蕉扇、4 筋斗云
- R 饮酒、Space 腾跃、Esc 暂停、M 静音

## 已实现

- 第三人称动作镜头：锁敌、目标菱形标记、Boss 自动拉远、地形碰撞、锁定/重劈动态 FOV
- 战斗：轻棍四段、重劈、完美闪身、四神通、Boss 二阶段
- 打击反馈：hitstop、镜头震动、敌人受击硬直、小怪打断前摇、连击计数/增伤、玩家受击红闪
- 叙事：三回三 Boss、六根掉落、超度/吞噬、业障、两个结局
- 探索：每回 3 个隐藏灵蕴（共 9 个）、碎片叙事、永久强化
- 重玩：S/A/B 章节评价、Boss 检查点、NG+
- 回目差异：花果山识破、火焰山火墙/扇灭、南天门天钟镇妖
- 场景：天空穹顶 + Aholo 写实苔石/石灯/石狮/竹丛/山门/桃枝；3DGS 因包相机问题在最终版停用
- 音频：Tone.js 总线；Edge Yunjian 中文男声 14 句；三回独立主题与环境、入场动机与转阶段节奏层；金属棍风/重击/锣鼓/咆哮
- UX：无加载遮罩、无强制 Boss 入场冻结、章节锁、高/性能画质切换、暂停菜单、声音开关、字幕

## 结构

- `src/main.ts` 主循环 / 战斗判定 / 锁敌 / 六根 / 暂停 / HUD
- `src/player/WukongController.ts` 悟空控制器、武器 socket、技能
- `src/enemies/EnemyManager.ts` 敌人/Boss AI、受击硬直、阶段
- `src/world/ChapterWorld.ts` 三回世界、3DGS、Aholo 道具加载、场景细节
- `src/audio/WukongAudio.ts` Tone.js 配乐/音效/配音、BGM ducking
- `src/data/ChaptersData.ts` 章节、敌人与任务数据
- `aholo_evidence/` Aholo taskId 证据

## 声音与场景
三回配乐由 `scripts/render_chapter_score.mjs` 离线生成。悟空使用 Edge Yunjian 普通话合成语音，14 句按战况处理。棍击按招式与触敌材质混音。
花果山采用倒角石道与立体草叶，火焰山采用贴地裂隙，南天门采用大理石板铺装。场景保留既有资产，详见 `docs/ASSETS_CC0.md`。

## 说明

- 不包含生产 Key；Aholo 生成在本地缓存资产中完成。
- `models/` 为压缩版 GLB（Meshopt + WebP），`worlds/` 为 `.spz` 3DGS。
- 公开仓库的 `models/live-opt/` 是接入场景的 6 个 Aholo 写实道具。

源码：https://github.com/MinusPlus2025/wukong-game/tree/main/source
