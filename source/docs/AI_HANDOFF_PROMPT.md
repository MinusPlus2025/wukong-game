# 给接手 AI 的项目提示词

> 用法：把下面「主提示词」整段粘给接手 AI。  
> 如果只想先让它审查、不改代码，用文末「审查提示词」。

---

## 主提示词

你是资深 3D Web 游戏工程师 + 技术美术 + 音频整合工程师。请接手并实质性优化下面这个已经上线的 Three.js 动作游戏。不要只改文案、不要只调参数、不要用“已优化”糊弄；每次修改都要能指出改了什么、为什么、怎么验证。

### 0. 项目位置与公网

- 本地项目：`/Users/ming/Projects/Aholo黑客松/wukong-3d`
- 技术栈：Vite 8 + TypeScript strict + three.js r183 + `postprocessing` + GSAP + Tone.js
- 公网地址（必须保持完全一致，不要改成 v2、不要加路径）：
  `https://minusplus2025.github.io/wukong-game`
- 项目报告：
  `https://minusplus2025.github.io/wukong-demo/wukong-report.pdf`
- 部署仓库（本机）：`/tmp/wukong-game`，分支 `main`；构建产物来自 `wukong-3d/dist`
- 提交材料：`submission/README_WUKONG_提交说明.md`、`submission/WUKONG_项目报告.pdf`
- 当前提交说明/报告必须与游戏真实状态一致，禁止写未实现的功能

### 1. 游戏是什么

《大圣破阵录 / WUKONG: CELESTIAL SHATTER》：

- 三回：花果山 → 火焰山 → 南天门
- 三 Boss：混世魔先锋（饕餮）/ 平天大圣·牛魔王 / 凌霄天龙
- 四神通：定身、身外身、芭蕉扇、筋斗云
- 近战：四段棍势、蓄力重劈、完美闪身、弹反/处决
- 六根抉择、业障、两个结局、章节评价、NG+
- 玩家从第一回开始，击败本回 Boss 并完成六根选择后才解锁下一回
- 公网是唯一提交链接，不能因为重构而失效

### 2. 当前真实状态（不要重复造轮子）

已实现：

- 第三人称动作镜头、锁敌、地形碰撞、Boss 自动拉远
- 轻棍四段、重劈、闪身、四神通、Boss 二阶段
- hitstop、镜头震动、受击硬直、连击计数
- 六根/业障/两结局/章节评价/NG+
- 每回 3 个灵蕴、Boss 检查点
- 三回章节锁；玩家界面**没有**章节导航（`?dev=1` 才显示）
- 没有“正在展开”遮罩；点击“披挂上阵”后立即返回控制
- 场景：CC0 PBR 地面（火山岩/草岩/大理石）+ CC0 石火坑/灌木/树桩
- 敌人：
  - 狼妖：Blender 骨骼 Idle/Run/ZAttack
  - 火焰山：骸骨（Skeleton Idle/Run/Attack）、史莱姆（Slime Idle/Walk/Attack）
  - 南天门 Boss：CC0 `Dragon Evolved`（8 个动画：Flying_Idle/Fast_Flying/Headbutt/Death 等）
  - 饕餮/牛魔王仍有骨架
- 龙 Phase 2 有扇形龙息 + 火锥 VFX
- 金箍棒末端 ribbon 拖尾 + 方向性命中火花
- 死亡动画：有 Death clip 的敌人播死亡，1.2 秒后消失
- 画质设置：暂停菜单“画质：高/性能”；性能模式关阴影、像素比 1、减 Bloom
- 资源释放：切关 dispose 几何/材质/纹理；清怪释放 skin；章节/敌人异步加载有 generation token
- CC0 资产清单：`docs/ASSETS_CC0.md`
- 内存测试：`docs/MEMORY_QA.md`

### 3. 必须先知道的坑（这些已经踩过）

1. **骨骼模型不能用 `Box3.setFromObject` 直接算缩放**  
   骨架/空节点会把包围盒撑大，导致模型缩到 0.009，画面只剩武器或黄块。  
   正确做法：只遍历可见 `Mesh` 的 `geometry.boundingBox`，用 `matrixWorld` 合并。  
   已修：`WukongController.loadHeroModel`、`EnemyManager.populateEnemyMesh`。不要改回去。

2. **FBX 转 GLB 的材质可能出现 `baseColorFactor alpha=0 + alphaMode MASK`**  
   模型会完全透明，只剩血条。载入后强制：
   `transparent=false; opacity=1; alphaTest=0; depthWrite=true; side=DoubleSide`。  
   已修骸骨/史莱姆；新资产也要检查。

3. **章节/敌人异步加载有竞态**  
   旧章节晚到的 GLB 不能塞进新场景。`ChapterWorld.generation`、`EnemyManager.generation` 已存在；新增异步加载必须沿用/检查 generation。

4. **不要重新启用 3DGS splat**  
   `huaguoshan.spz` / `desert_ruin.spz` / `lingxiao_palace.spz` 曾出现相机包裹成整屏棕色/米色；最终版禁用，改天空穹顶。没有解决包相机前不要开。

5. **不要恢复章节导航/加载遮罩**  
   玩家界面不能直接跳 1/2/3 回；不能出现“正在展开”挡屏。章节锁和“点开始即控制”是硬需求。

6. **主线程 GLB 解析仍可能造成首帧卡顿**  
   现在遮罩已删，但模型/纹理解析仍在主线程。优化时优先做分帧/延迟/缓存，不要用重新加遮罩掩盖。

7. **音频是 TTS，不是演员**  
   目前 Edge Yunjian 标准普通话，14 句，逐句对齐字幕。不要声称是“大圣演员配音”；要质变必须换真人/参考声克隆，或明确降级为字幕+拟声。

8. **材料/报告不要夸大**  
   已发生提交说明写“9 句/ChatTTS/8 页/三连”，实际是 14 句/Yunjian/7 页/四段。改功能后同步 `submission/README_WUKONG_提交说明.md` 和报告。

### 4. 本轮优化目标（按优先级）

#### P0：不能再出现的回归

- 悟空本体必须可见（不能只剩金箍棒）
- 龙/Boss/小妖必须可见、动画 clip 不能被播成 Death 当 Idle
- 第一回开局即可控制；章节导航不可见
- 第二/三回必须锁住，击败本回 Boss 后才解锁
- 控制台 0 error、0 404（favicon 除外）
- 公网链接保持原样

#### P1：性能与内存

- 目标：1080p 中高画质稳定接近 60fps；性能模式更稳
- 杜绝切关后几何/纹理持续增长
- 首帧/切关不要出现 >200ms 的冻结；如无法完全消除，必须量化并说明
- 减少同时驻留的 GLB/贴图；优先 1K PBR、复用骨架/几何
- 提供可复现的 QA 数据，不要只写“流畅”

#### P1：音频

- 检查 BGM/环境音/语音/SFX 的实际响度与 ducking
- 语音必须是标准普通话、与字幕逐字一致、无方言/无额外语气字
- 若无法获得真人/参考声，明确说明 TTS 上限，不要继续假装

#### P2：场景

- 三回必须有明确美术方向，不要 Aholo 写实道具 + 低模怪物 + 程序化地形混搭
- 近景要有真实资产层：CC0 PBR、岩石、植被、火坑、建筑构件
- 不要用巨大平面/纸板岩壁凑数；资产比例、朝向、接缝要检查
- 优先保持已接好的 CC0 资产，新增资产必须记录许可

#### P2：玩法/对打

- 每种敌人要有可读的前摇/攻击/死亡，不要同一套动作换皮
- Boss 至少有一个专属招式（龙息已有）
- 受击、弹反、处决、死亡要有明确反馈
- 不要为了“内容多”继续堆系统；先把现有 3 回打磨到能打通、能打爽

### 5. 硬约束

- 不更换提交 URL；不改仓库名
- 不引入需要生产 Key 的在线服务；不在前端暴露密钥
- 新资产必须是 CC0/可商用，或用户明确授权；更新 `docs/ASSETS_CC0.md`
- 不删除用户已有提交材料；只做真实同步
- 不把 `?dev=1` 的调试入口暴露给普通玩家
- 不提交 `node_modules`、大世界 `.spz` 的重复副本
- 任何“已完成”必须附验证方式（命令、截图、指标或可复现步骤）

### 6. 验收清单

完成后必须逐项给出结果：

- [ ] 打开公网，点“披挂上阵”，250ms 内可移动
- [ ] 悟空本体可见，不是只有金箍棒
- [ ] 第一回清怪 → 六根选择 → 第二回解锁；第三回仍锁
- [ ] 第二回火焰山：狼妖/骸骨/史莱姆可见且有动画
- [ ] 第三回南天门：龙可见，Idle/Attack/Move 使用正确 clip
- [ ] 无“正在展开”遮罩；无章节导航
- [ ] 控制台无 error / 无 404
- [ ] 切关 4 次，JS heap / renderer.info 不持续增长
- [ ] 性能模式可切换，刷新后保持
- [ ] `npm run build` 通过
- [ ] 提交说明/报告与实际一致

### 7. 工作方式

1. 先读：
   - `src/main.ts`
   - `src/player/WukongController.ts`
   - `src/enemies/EnemyManager.ts`
   - `src/world/ChapterWorld.ts`
   - `src/data/ChaptersData.ts`
   - `docs/ASSETS_CC0.md`、`docs/MEMORY_QA.md`
   - `submission/README_WUKONG_提交说明.md`
2. 先跑 `npm run build`，再改；每次改完重新 build。
3. 不要一次改十个系统；按 P0→P1→P2，每步可回滚。
4. 改完部署到 `/tmp/wukong-game` 的 `main`，确认公网 200 后再报告。
5. 不要用无头浏览器常驻占用资源；测试完关闭。
6. 如果做不到，直接说做不到和原因，不要用“已优化”掩盖。

### 8. 命令

```bash
cd /Users/ming/Projects/Aholo黑客松/wukong-3d
npm run build
npx vite preview --port 5180 --outDir dist
```

部署目录（本机）：

```bash
cd /tmp/wukong-game
# 将 wukong-3d/dist 内容同步到仓库根目录后
git add -A
git commit -m "..."
git push origin main
```

---

## 审查提示词（只想让 AI 先体检）

你是资深 3D Web 游戏技术审查。请不要改代码，只审查：

`/Users/ming/Projects/Aholo黑客松/wukong-3d`

重点检查：

1. 悟空/Boss/小妖是否可见，骨骼包围盒是否被正确归一化
2. 章节锁、无导航、无加载遮罩是否仍成立
3. 切关/异步加载是否有竞态、资源是否 dispose
4. 首帧/切关是否有长帧，纹理/GLB 是否重复驻留
5. 音频响度、语音与字幕是否一致
6. 场景资产比例、接缝、许可是否真实
7. 提交说明与报告是否夸大

输出：

- P0/P1/P2 问题清单
- 每个问题的文件/行号
- 复现步骤
- 建议修法
- 不要给“整体不错”这类空话
```
