# 大圣破阵录 · ElevenLabs 音频制作规格

版本：v2（单 Boss 垂直切片）  
用途：配音 / 音效 / 配乐外包制作与验收  
交付目录：`wukong-3d/audio-incoming/`

---

## 0. 总目标

做出“3D 动作游戏”的音频质感，而不是 TTS + 库存音效：

- 配音：低沉、干、粗粝、有压迫感；不要播音腔、不要动画嗓。
- 音效：短、干、重；每一下都能听出材质（木棍/金属/肉/石）。
- 配乐：暗、留白、可循环；给音效和台词让路，不要满编制。

---

## 1. 通用交付规范

| 项目 | 要求 |
|---|---|
| 格式 | WAV，48kHz / 24bit |
| 配音 | 干声；不要混响、延迟、压缩、限幅 |
| 音效 | 单次触发；干声；不要音乐、不要长混响 |
| 配乐 | 可无缝循环；不要淡出、不要母带限幅 |
| 峰值 | 不超过 **-3 dBFS** |
| 命名 | 严格按本文文件名，全部小写、下划线 |
| 目录 | `audio-incoming/voice/`、`sfx/`、`bgm/` |
| 授权 | 必须原创、CC0，或你拥有商用/公开展示授权 |

> 不要自己归一化到 0dB，也不要加“电影感”混响；这些由游戏内 Tone.js 总线统一做。

---

## 2. 配音 Voice

### 2.1 入口

ElevenLabs 左侧：

1. **Voice Creation** → **Voice Design**（需要套餐支持）
2. 生成并保存自定义音色
3. 回到 **Text to Speech** 逐句生成

如果 Voice Design 不可用：直接在 **Text to Speech** 的 Voice Library 筛选 `Chinese / Mandarin / Male / Deep / Narration`。

### 2.2 Voice Design 描述词

粘贴到 **Voice description**：

```text
A native Mandarin Chinese male, age 40–45, deep chest resonance, dry and slightly raspy texture, battle-worn mythic warrior. Low pitch, slow deliberate delivery, restrained anger, mocking confidence, weary. Close-mic, very little breathiness. Not an announcer, not a news anchor, not anime, not cute, not a heroic trailer voice. Natural Mandarin pronunciation with no English accent.
```

### 2.3 Voice Design 试听文本

粘贴到 **Sample text**（必须用中文，不要用英文）：

```text
俺老孙乃花果山水帘洞美猴王。妖王，受死。这一根，你拿得动吗？
```

生成 3–4 个候选，按以下标准选：

- 音高最低、最干、最不“播音”
- 中文发音自然，无外国口音
- 不要年轻偶像、不要卡通、不要明亮
- 保存为 `Wukong_Deep_01`

### 2.4 Text to Speech 参数

- Model：**Eleven Multilingual v2**
- Stability：**40%**
- Similarity：**85%**
- Style：**55%**
- Speed：**0.92**
- Speaker Boost：**开**
- 输出：**WAV 44.1kHz / 24bit**
- 每句单独生成，不要整段一次生成

不同台词的微调：

| 文件 | 台词 | Stability | Style | Speed | 表演 |
|---|---|---:|---:|---:|---|
| `start.wav` | 俺老孙来也。 | 45 | 50 | 0.92 | 低沉、带一点笑，不喊 |
| `combo.wav` | 吃俺一棒！ | 30 | 70 | 1.00 | 短、狠、爆 |
| `heavy.wav` | 碎！ | 25 | 75 | 1.00 | 单字爆破，胸腔共鸣 |
| `dodge.wav` | 闪。 | 50 | 30 | 1.05 | 极短、气声 |
| `ding.wav` | 定！ | 35 | 65 | 0.95 | 命令式，收住 |
| `fan.wav` | 风来！ | 40 | 60 | 1.00 | 呼气感，像唤风 |
| `phase.wav` | 法天象地！ | 30 | 75 | 0.90 | 低吼，拖长“地” |
| `victory.wav` | 妖怪，哪里逃！ | 35 | 65 | 0.95 | 嘲讽、上扬 |
| `death.wav` | 俺老孙……去也…… | 55 | 40 | 0.85 | 渐弱、疲惫、不煽情 |
| `choice.wav` | 这一根，你拿得动吗？ | 50 | 50 | 0.88 | 低声、危险、慢 |
| `ending-good.wav` | 金箍落下，你渡了自己。 | 50 | 45 | 0.90 | 平静、释然 |
| `ending-bad.wav` | 你成了新的妖王。 | 45 | 50 | 0.90 | 冷、压低、不狂笑 |
| `boss-intro.wav` | 妖王，受死！ | 30 | 70 | 0.95 | 挑战、短 |
| `low-hp.wav` | 俺老孙，还撑得住…… | 55 | 45 | 0.88 | 喘、咬牙 |

### 2.5 如果中文有口音

按顺序处理：

1. 重新生成，Sample text 换成更长的中文：
   ```text
   俺老孙乃花果山水帘洞美猴王。妖王，受死。这一根，你拿得动吗？
   ```
2. 描述词末尾加：
   ```text
   Must sound like a native Mandarin speaker from mainland China; no English or Cantonese accent.
   ```
3. 仍不行：回退到 Voice Library 的 `Chinese / Mandarin / Male / Deep / Narration` 现成音色；Voice Design 不是必须。

---

## 3. 音效 SFX

### 3.1 入口与参数

左侧 **Sound Effects**：

- 每条单独生成
- Duration 按表中时长
- Prompt Influence：**0.6–0.8**
- 输出：**WAV**
- 生成 2–3 个版本，选“干、短、无音乐”的
- 不要加混响；不要生成连续环境声

### 3.2 提示词

| 文件 | 时长 | Prompt |
|---|---:|---|
| `staff_whoosh_light_01.wav` | 0.5s | A light wooden staff swinging fast through air, close, dry whoosh, single pass, no music, no reverb. |
| `staff_whoosh_heavy_01.wav` | 0.8s | A heavy wooden staff swinging with weight, low air pressure, close, dry, single heavy whoosh, no music, no reverb. |
| `staff_impact_flesh_01.wav` | 0.4s | Heavy wooden staff hitting a demon's body, dull thud with a short wet crunch, close, dry, no music, no reverb. |
| `staff_impact_armor_01.wav` | 0.45s | Heavy staff striking bronze armor, sharp metal clang with a low body, close, dry, no music, no reverb. |
| `parry_metal_01.wav` | 0.35s | A staff parrying a blade, bright metallic ring with a short scrape, close, dry, no music, no reverb. |
| `parry_success_01.wav` | 0.6s | Perfect parry impact, sharp bronze clang and a short magical shimmer tail, close, dry, no music, no long reverb. |
| `gong_hit_01.wav` | 2.0s | Large ancient Chinese bronze gong, single deep hit, dark and slightly detuned, natural tail, no music. |
| `taiko_hit_01.wav` | 0.8s | Deep Japanese taiko drum single hit, tight low thump, close, dry, no music. |
| `boss_roar_01.wav` | 1.8s | A huge demonic bull king roar, low, distorted, throaty, close, no music, no reverb. |
| `boss_slam_01.wav` | 1.2s | Massive stone-shattering ground slam, deep impact and debris, close, dry, no music, no long reverb. |
| `footstep_stone_01.wav` | 0.3s | Armored boot on ancient stone, single step, close, dry, no music. |
| `ui_confirm_01.wav` | 0.2s | Minimal dark UI confirm, short bronze tick, no music. |

---

## 4. 配乐 Music

### 4.1 入口与参数

左侧 **Music**：

- 三首分开生成
- Instrumental / no vocals / no lyrics
- 不要淡出
- 输出 WAV 或高质量 MP3；优先 WAV
- 如果只能生成 30–60s，也可以；我来做循环点

### 4.2 提示词

#### 探索 / 花果山

```text
Dark cinematic Chinese mythic ambient, 60 BPM, D minor. Low sub drone, sparse guqin single notes, distant bone flute, faraway bronze gong every 8 bars, very sparse low taiko, wind and forest room tone. Restrained, mysterious, lonely, not epic trailer, not heroic fanfare. Instrumental only, no vocals, no lyrics. Seamless loop, no fade out, 90 seconds.
```

文件：`bgm_explore.wav`

#### Boss 战

```text
Dark Chinese mythic boss battle score, 104 BPM, D minor. Deep taiko pattern, low bowed strings, distorted erhu motif, bronze gong accents, industrial sub bass pulse, male choir whispers without words. Aggressive but spacious, leaves room for hit SFX. Not generic epic trailer, not EDM. Instrumental only, no vocals, no lyrics. Seamless loop, no fade out, 90 seconds.
```

文件：`bgm_boss.wav`

#### Boss 二阶段 / 濒死

```text
Same dark Chinese boss motif, 122 BPM, more dissonant. Faster taiko, snapped low strings, alarm-like brass stabs, distorted erhu, sub bass heartbeat, gong hits on phase changes. Chaotic but readable, not wall-of-noise. Instrumental only, no vocals, no lyrics. Seamless loop, no fade out, 75 seconds.
```

文件：`bgm_boss_phase2.wav`

### 4.3 结构建议

- 0–8s：只留低频/环境，给入场字幕
- 8–32s：主节奏进入，留中高频给音效
- 32–64s：加一层弦乐/唢呐/失真二胡
- 64–90s：回到骨架，方便循环
- 不要在结尾做长混响/淡出

---

## 5. 交付目录

```text
wukong-3d/audio-incoming/
  bgm/
    bgm_explore.wav
    bgm_boss.wav
    bgm_boss_phase2.wav
  voice/
    start.wav
    combo.wav
    heavy.wav
    dodge.wav
    ding.wav
    fan.wav
    phase.wav
    victory.wav
    death.wav
    choice.wav
    ending-good.wav
    ending-bad.wav
    boss-intro.wav
    low-hp.wav
  sfx/
    staff_whoosh_light_01.wav
    staff_whoosh_heavy_01.wav
    staff_impact_flesh_01.wav
    staff_impact_armor_01.wav
    parry_metal_01.wav
    parry_success_01.wav
    gong_hit_01.wav
    taiko_hit_01.wav
    boss_roar_01.wav
    boss_slam_01.wav
    footstep_stone_01.wav
    ui_confirm_01.wav
```

---

## 6. 验收标准

- [ ] 配音 14 句齐全，文件名正确，干声，无爆音
- [ ] 每句中文发音自然，无英文/粤语口音
- [ ] SFX 12 条齐全，单次触发，无音乐/长混响
- [ ] BGM 3 首，可循环，无淡出
- [ ] 全部 48kHz/24bit WAV，峰值 ≤ -3dBFS
- [ ] 附授权说明：原创 / CC0 / 已获商用与公开展示授权

---

## 7. 授权与署名

- 配音：ElevenLabs Voice Design / TTS 输出，需确认你的套餐允许商用与公开展示。
- 音效 / 配乐：原创或 CC0；如使用第三方，提供来源与许可证。
- 游戏内会署名；报告和源码 `ATTRIBUTION.md` 会同步更新。

---

## 8. 交付后我会做什么

- 接入 `src/audio/WukongAudio.ts`
- BGM 循环点、Boss 二/三阶段切换
- 台词字幕、BGM ducking
- 弹反/处决/重击音效分层
- 总线 EQ/压缩/短混响统一
- 更新报告、源码说明和提交包
