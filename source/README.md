# 大圣破阵录 — 源代码 / Developer Notes

可玩 Demo: https://minusplus2025.github.io/wukong-game/
项目报告: https://minusplus2025.github.io/wukong-demo/wukong-report.pdf

浏览器 3D 动作垂直切片：三回、三 Boss、四神通、六根抉择与两结局。

## 运行

本目录是源代码；大模型与 3DGS 资产不重复放两份，使用仓库根目录的 `models/`、`models/live-opt/`、`worlds/`：

```bash
npm install
mkdir -p public
ln -s ../../models public/models
ln -s ../../models/live-opt public/models/live-opt
ln -s ../../worlds public/worlds
npm run dev -- --port 5181
```

打开 http://localhost:5181/ 。

## 操作

- WASD 移动，鼠标/方向观察
- 左键 / J：轻棍三连
- 右键 / K：蓄力重劈（消耗棍势）
- Shift：幻影闪身；红光窗口内触发完美闪身/子弹时间
- Q / Tab / 中键：锁定 / 解除锁定
- 1 定身、2 身外身、3 芭蕉扇、4 筋斗云
- R 饮酒、Space 腾跃、Esc 暂停、M 静音

## 已实现

- 第三人称动作镜头：锁敌、目标菱形标记、Boss 自动拉远、地形碰撞、锁定/重劈动态 FOV
- 战斗：轻棍三连、重劈、完美闪身、四神通、Boss 二阶段
- 打击反馈：hitstop、镜头震动、敌人受击硬直、小怪打断前摇、连击计数/增伤、玩家受击红闪
- 叙事：三回三 Boss、六根掉落、超度/吞噬、业障、两个结局
- 场景：Aholo SpatialGen 3DGS 花果山、石道祭坛、Aholo 写实苔石/石灯/石狮/竹丛/山门/桃枝
- 音频：Tone.js 总线；Edge Neural 中文男声 14 句；真实东方鼓乐 BGM；金属棍风/重击/锣鼓/咆哮
- UX：章节加载过场、低帧自适应降载、暂停菜单、声音开关、字幕

## 结构

- `src/main.ts` 主循环 / 战斗判定 / 锁敌 / 六根 / 暂停 / HUD
- `src/player/WukongController.ts` 悟空控制器、武器 socket、技能
- `src/enemies/EnemyManager.ts` 敌人/Boss AI、受击硬直、阶段
- `src/world/ChapterWorld.ts` 三回世界、3DGS、Aholo 道具加载、场景细节
- `src/audio/WukongAudio.ts` Tone.js 配乐/音效/配音、BGM ducking
- `src/data/ChaptersData.ts` 章节、敌人与任务数据
- `aholo_evidence/` Aholo taskId 证据

## 音频署名

- Music: “Asian Drums” — Kevin MacLeod (incompetech.com), CC BY 4.0.
- Voice: Edge Neural TTS (`zh-CN-YunjianNeural`), post-processed with EQ/compression/reverb.
- SFX: procedural Tone.js layers.

## 说明

- 不包含生产 Key；Aholo 生成在本地缓存资产中完成。
- `models/` 为压缩版 GLB（Meshopt + WebP），`worlds/` 为 `.spz` 3DGS。
- 公开仓库的 `models/live-opt/` 是接入场景的 6 个 Aholo 写实道具。
