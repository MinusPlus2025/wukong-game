# 大圣破阵录 — 源代码

可玩 Demo: https://minusplus2025.github.io/wukong-game/
报告: https://minusplus2025.github.io/wukong-demo/wukong-report.pdf

## 运行
本目录是源代码；大模型/3DGS 资产太大，不重复放两份，使用仓库根目录的 `models/` 与 `worlds/`：

```bash
npm install
mkdir -p public
ln -s ../../models public/models
ln -s ../../worlds public/worlds
npm run dev -- --port 5181
```

打开 http://localhost:5181/ 。

## 结构
- `src/main.ts` 游戏主循环 / 战斗 / 六根选择
- `src/player/WukongController.ts` 悟空控制器
- `src/enemies/EnemyManager.ts` 敌人与 Boss
- `src/world/ChapterWorld.ts` 三回世界 / 3DGS / 场景细节
- `src/audio/WukongAudio.ts` Tone.js 配乐 / 音效 / 配音
- `src/data/ChaptersData.ts` 章节与任务数据
- `aholo_evidence/wukong_manifest.json` Aholo Lux3D taskId 证据

## 说明
- 不包含生产 Key；Aholo 生成在本地缓存资产中完成。
- `models/` 为压缩版 GLB（Meshopt + WebP），`worlds/` 为 `.spz` 3DGS。
