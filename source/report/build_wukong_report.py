from PIL import Image, ImageDraw, ImageFont, ImageOps
W,H=1600,2263
BG=(6,10,16); PANEL=(11,17,25); GOLD=(255,209,102); JADE=(114,239,221); WHITE=(238,244,251); DIM=(148,163,184); LINE=(42,52,66)
FB="/System/Library/Fonts/STHeiti Medium.ttc"; FM="/System/Library/Fonts/Hiragino Sans GB.ttc"
def bold(s): return ImageFont.truetype(FB,s)
def body(s): return ImageFont.truetype(FM,s)
def wrap(d,text,font,maxw):
    lines=[]
    for para in text.split("\n"):
        cur=""
        for ch in para:
            if d.textlength(cur+ch,font=font)<=maxw: cur+=ch
            else:
                if cur: lines.append(cur)
                cur=ch
        lines.append(cur)
    return lines
def para(d,xy,text,font,fill=WHITE,maxw=1200,lh=1.65):
    x,y=xy
    for line in wrap(d,text,font,maxw):
        d.text((x,y),line,font=font,fill=fill); y+=int(font.size*lh)
    return y
def kicker(d,xy,text): d.text(xy,text,font=body(22),fill=GOLD)
def heading(d,xy,text,size=78): d.text(xy,text,font=bold(size),fill=WHITE)
def rule(d,xy,w): d.line([xy[0],xy[1],xy[0]+w,xy[1]],fill=LINE,width=2)
def fit(path,size): return ImageOps.fit(Image.open(path).convert("RGB"),size,method=Image.LANCZOS,centering=(0.5,0.5))
def paste(base,im,box,r=18):
    im=im.resize((box[2]-box[0],box[3]-box[1]),Image.LANCZOS)
    mask=Image.new("L",im.size,0); ImageDraw.Draw(mask).rounded_rectangle([0,0,im.size[0]-1,im.size[1]-1],radius=r,fill=255)
    base.paste(im,(box[0],box[1]),mask)
def newpage():
    im=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(im); d.rectangle([0,0,W,10],fill=GOLD); return im,d
def footer(d,p):
    d.text((140,H-86),"大圣破阵录 / WUKONG: CELESTIAL SHATTER  ·  Aholo Lux3D 2026",font=body(19),fill=(90,104,122))
    d.text((W-200,H-86),f"{p:02d} / 07",font=body(19),fill=(90,104,122))
pages=[]

# cover
im,d=newpage(); hero=fit("report/assets/qa-chapter-0.png",(W,1320)); im.paste(hero,(0,0))
ov=Image.new("RGBA",(W,H),(0,0,0,0)); od=ImageDraw.Draw(ov)
for y in range(700,H):
    a=int(255*(y-700)/(H-700)); od.rectangle([0,y,W,y+1],fill=(6,10,16,min(255,a)))
im=Image.alpha_composite(im.convert("RGBA"),ov).convert("RGB"); d=ImageDraw.Draw(im)
kicker(d,(140,1440),"AHOLO LUX3D · 3D AI NEW SPECIES AWARD 2026")
d.text((140,1490),"大圣破阵录",font=bold(132),fill=WHITE)
d.text((140,1660),"WUKONG · CELESTIAL SHATTER",font=bold(52),fill=GOLD)
para(d,(140,1775),"3D AI 花果山动作游戏：三回、三 Boss、四神通。\n以读招、闪避、弹反与六根抉择为核心的三回动作原型。",body(30),DIM,1180)
d.text((140,2070),"3 CHAPTERS · 3 BOSSES · 6 ROOTS · 2 ENDINGS · 14 VOICE LINES",font=body(20),fill=JADE)
footer(d,1); pages.append(im)

# game
im,d=newpage(); kicker(d,(140,150),"01 / GAME"); heading(d,(140,210),"不是看模型，\n是打一场花果山。",82); rule(d,(140,410),1320)
img=fit("report/assets/wukong-combat.png",(1260,560)); paste(im,img,(140,470,1400,1030),20)
para(d,(140,1080),"三回：花果山 · 火焰山 · 南天门。上图为此前战斗实机，本轮画面见第6页。",body(28),DIM,1320)
cards=[("3","回目"),("3","Boss"),("4","神通"),("14","配音")]
for i,(a,b) in enumerate(cards):
    x=140+i*330; d.text((x,1240),a,font=bold(64),fill=GOLD); d.text((x,1330),b,font=body(24),fill=DIM)
para(d,(140,1440),"玩家不是“点开看”，而是：四段棍势、蓄力重劈、幻影闪身、定身/分身/芭蕉扇/筋斗云，\n把 Boss 打进法天象地二阶段。",body(27),JADE,1320)
lock=fit("report/assets/wukong-lock.png",(520,300)); paste(im,lock,(140,1600,660,1900),12)
d.text((700,1605),"GAME FEEL / UX",font=bold(30),fill=GOLD)
para(d,(700,1655),"锁敌：Q / Tab / 中键锁定，菱形标记，Boss 镜头拉远。\n硬直：小怪受击打断前摇；连击计数，每层 +1.5% 伤害。\n镜头：地形碰撞防穿地；锁定 FOV 46，近 Boss 自动拉远。\n重玩：9 灵蕴 / S·A·B / NG+ / Boss 检查点。",body(23),WHITE,680)
footer(d,2); pages.append(im)

# combat loop
im,d=newpage(); kicker(d,(140,150),"02 / COMBAT LOOP"); heading(d,(140,210),"四个动作，\n撑起整场战斗。",82); rule(d,(140,400),1320)
rows=[("01","四段棍势 / 蓄力重劈 / 龙息","左键四段，右键消耗棍势重劈；命中触发 hitstop、镜头震动、伤害数字。"),
      ("02","幻影闪身","Shift 闪避；在红光预警窗口内闪避触发完美闪身：子弹时间 + 棍势。"),
      ("03","四神通","[1] 定身 [2] 身外身 [3] 芭蕉扇 [4] 筋斗云；各有音效；语音按实际战斗事件触发。"),
      ("04","Boss 二阶段","半血进入“法天象地”：体型放大、红光、狂暴；语音“法天象地！”+ 咆哮。")]
for i,(n,t,b) in enumerate(rows):
    y=450+i*190; d.text((140,y),n,font=bold(48),fill=GOLD); d.text((225,y+4),t,font=bold(34),fill=WHITE); para(d,(225,y+58),b,body(25),DIM,1050)
    if i<3: d.line([140,y+140,1400,y+140],fill=LINE,width=1)
img=fit("report/assets/qa-chapter-2.png",(1260,430)); paste(im,img,(140,1260,1400,1690),18)
choice=fit("report/assets/wukong-root-choice.png",(500,310)); paste(im,choice,(140,1740,640,2050),14)
d.text((700,1745),"抉择 · 六根与业障",font=bold(34),fill=GOLD)
para(d,(700,1805),"Boss 死后不是直接下一关：必须选「超度」或「吞噬」。\n超度回血、降业障；吞噬永久增伤、涨业障。\n三根之后按业障走两个结局——金箍落下，或成为新的妖王。",body(24),WHITE,680)
footer(d,3); pages.append(im)

# audio
im,d=newpage(); kicker(d,(140,150),"03 / AUDIO & VOICE"); heading(d,(140,210),"重新做声音：\n给读招与台词留空间。",80); rule(d,(140,410),1320)
para(d,(140,470),"旧版是合成古琴/箫，音色薄；新版重新做三层：三回原创循环配乐、分章环境声、妖王入场动机与转阶段节奏层、金属/低频音效、Edge Yunjian 男声配音；全部走 Tone.js 总线实时混音。",body(27),DIM,1320)
wave=fit("report/assets/wukong-voice-wave.png",(1260,330)); paste(im,wave,(140,700,1400,1030),16)
para(d,(140,1080),"配音 14 句：俺老孙来也 / 吃俺一棒 / 碎 / 闪 / 定 / 风来 / 法天象地 / 妖怪哪里逃 / 俺老孙去也 / 选根 / 两结局 / 妖王受死 / 残血。\n改用 经音高与共鸣处理的 Edge Yunjian 普通话男声，字幕文案与既有 14 个音频键对应；逐字听辨尚待人工验收。14 句按战况处理节奏、音高和停顿，棍击叠加六类触敌声；单路语音，按实际时长压低 BGM/环境音。TTS 不等于演员表演。",body(26),WHITE,1320)
para(d,(140,1280),"音效：棍身金属泛音、布袍/空气 whoosh、地面裂开的棕噪声、铜锣/鼓、Boss 低频咆哮、芭蕉扇风墙。\n配乐：花果山拨弦与溪林、火焰山低鼓与炉火、南天门编钟与高空风声；入场有独立动机，转阶段叠加同拍节奏。",body(25),JADE,1320)
footer(d,4); pages.append(im)

# stack
im,d=newpage(); kicker(d,(140,150),"04 / AHOLO STACK"); heading(d,(140,210),"模型、世界、动作、声音，\n都在同一条链路里。",74); rule(d,(140,410),1320)
nodes=[("LUX3D","悟空/牛魔王/狼妖/金箍棒\n真实 taskId + 绑定/重定向"),("SPATIALGEN","花果山/火焰山/南天门\n3DGS 实验；最终因包相机停用，改天空穹顶"),("VIEWER","Three.js + 后处理\n第三人称动作镜头"),("TONE.JS","实时配乐 + 音效 + 配音\nTone.js 总线混音")]
for i,(t,b) in enumerate(nodes):
    x=140+i*330; d.rounded_rectangle([x,480,x+290,760],radius=16,fill=PANEL,outline=(GOLD if i==0 else LINE),width=2)
    d.text((x+22,505),t,font=bold(28),fill=WHITE); para(d,(x+22,560),b,body(21),DIM,250,lh=1.8)
    if i<3: d.text((x+298,600),"→",font=bold(32),fill=GOLD)
rows=[("齐天大圣 · T-Pose","8258546"),("悟空绑定","8270067"),("悟空动作重定向","8271499"),("牛魔王 · T-Pose","8258552"),("狼妖先锋","8270069"),("定海神针","8270072"),("花果山 3DGS","3FO4K4REIA5U")]
for i,(a,b) in enumerate(rows):
    y=850+i*58; d.text((140,y),a,font=body(24),fill=WHITE); d.text((1000,y),b,font=body(24),fill=JADE); d.line([140,y+44,1400,y+44],fill=LINE,width=1)
para(d,(140,1500),"环境写实道具（Aholo 生成并压缩进场景）：苔石 8440876 / 石灯 8440884 / 石狮 8442701 / 竹丛 8440880 / 山门 8440888 / 桃枝 8442823。",body(21),JADE,1320)
para(d,(140,1320),"关键技术修复：开局“敌人未生成即判定通关”的竞态；音频预加载阻塞开局；Boss 距离/镜头/场景遮挡。",body(26),JADE,1320)
footer(d,5); pages.append(im)


# process / asset iteration
im,d=newpage(); kicker(d,(140,150),"06 / ENVIRONMENT"); heading(d,(140,210),"从可见，走向可读。",74); rule(d,(140,350),1320)
for i in range(3):
    x=140+i*440
    paste(im,fit(f"report/assets/qa-chapter-{i}.png",(420,260)),(x,420,x+420,680),12)
    d.text((x,710),["花果山 · 水帘苔岩","火焰山 · 立体火墙","南天门 · 龙息决战"][i],font=bold(25),fill=GOLD)
para(d,(140,820),"人物：按待机姿态的可见蒙皮顶点校准悟空、狼妖与 Boss 尺度；不将骨架空节点计入包围盒。修复金箍棒拖尾在短轨迹/消退时越界。牛魔王通用命名动画经过姿态检查后单独映射。",body(27),WHITE,1320)
para(d,(140,1080),"战斗：前摇锁定朝向、预警扇区对应攻击方向、落击后提供恢复窗口。狼妖短前摇，骸骨慢挥击，史莱姆压缩起跳；牛魔王冲锋、饕餮地面爆发、天龙扇形龙息。重劈落棍时同步结算命中和音效，接地时产生震波。",body(27),JADE,1320)
para(d,(140,1350),"场景：保留既有 Aholo 道具与 CC0 地表/植被；缩小遮挡主路的道具。花果山使用倒角石道与弯曲草叶，火焰山裂隙贴合地形，南天门使用有厚度的大理石铺装。三回仍存在资产风格差异，尚未通过外部审美评估。",body(27),WHITE,1320)
para(d,(140,1630),"工程：停用并移除 Spark 运行时导入；第一回复用标题页场景；道具分帧加载、章内共享解析与 GPU 资源。释放粒子、Sprite、骨骼、灵蕴、分身、残影、命中与龙息特效；旧章节异步结果不能回流。",body(26),DIM,1320)
footer(d,6); pages.append(im)

# exploration / replay
im,d=newpage(); kicker(d,(140,150),"07 / EXPLORATION · REPLAY"); heading(d,(140,210),"不是一关打一遍。\n每一回都有东西可找。",74); rule(d,(140,410),1320)
img=fit("report/assets/qa-chapter-0.png",(760,420)); paste(im,img,(140,460,900,880),14)
d.text((940,465),"9 灵蕴 · 3 回",font=bold(38),fill=GOLD)
para(d,(940,530),"每回 3 个隐藏灵蕴，共 9 个：\n放在主路外，靠近才发青光；\n每个带碎片叙事，3/6/9 个给永久强化。",body(22),WHITE,460)
d.text((940,760),"S / A / B",font=bold(38),fill=GOLD)
para(d,(940,825),"Boss 结算按时间、受伤、灵蕴给评价；\n死亡有 Boss 检查点，不重打小怪。",body(22),WHITE,460)
para(d,(140,960),"三回身份：花果山=识破/弹反；火焰山=火墙/扇灭；南天门=天钟定身。",body(24),JADE,1320)
para(d,(140,1050),"章节进度：清怪并击败 Boss，完成六根选择后解锁下一回；普通界面无跳关导航。\n重玩目标：S 评价 / 全灵蕴 / 妖形收集 / NG+（敌人 +35% 血、+16% 伤害）。\n不是靠随机掉落，而是让同一关的路线、节奏、风险不同。",body(23),DIM,1320)
para(d,(140,1220),"QA：Apple M4 Pro / Chrome / 1920×1080 内部测试：开始响应低于 250ms，普通入口键鼠自动化打通三回，达成新妖王结局。四段轻棍新增横扫、反撩、探棍、回身扫轨迹。精确数据和脚本见 docs/qa。\n边界：冷加载仍见最长 1056ms 主线程长任务；不保证其他设备 60fps。尚无独立玩家完整通关、审美和听感验收；获奖竞争力未验证。",body(21),DIM,1320)

for i,url in enumerate(['https://minusplus2025.github.io/wukong-game', 'https://minusplus2025.github.io/wukong-demo/wukong-report.pdf', 'https://github.com/MinusPlus2025/wukong-game/tree/main/source']):
    d.text((140,1670+i*75),url,font=body(24),fill=JADE)
footer(d,7); pages.append(im)

out="submission/WUKONG_项目报告.pdf"
pages[0].save(out,"PDF",resolution=150.0,save_all=True,append_images=pages[1:],creationDate=None,modDate=None)
print("pages",len(pages),"->",out)
