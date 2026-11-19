export interface EnemySpawnSpec {
  id: string;
  name: string;
  title?: string;
  isBoss: boolean;
  hp: number;
  atk: number;
  scale: number;
  pos: [number, number];
  modelCandidates: string[];
  color: number;
}

export interface ChapterConfig {
  index: number;
  code: string;
  title: string;
  subtitle: string;
  introPoem: string;
  objectiveHint: string;
  skyColor: number;
  fogColor: number;
  groundColorA: number;
  groundColorB: number;
  splatWorldUrl: string;
  landmarkModel: string;
  landmarkPos: [number, number];
  hasFireBarrier?: boolean;
  peaches: Array<[number, number]>;
  enemies: EnemySpawnSpec[];
}

export const WUKONG_CHAPTERS: ChapterConfig[] = [
  {
    index: 0,
    code: '第一回',
    title: '花果山 · 水帘寻针',
    subtitle: 'CHAPTER I · MOUNT HUAGUO & DRAGON PILLAR',
    introPoem: '海外有一国土，名曰傲来国。山顶一仙石迸裂，化作灵明石猴；今妖氛侵山，当往水帘龙渊拔取定海神针！',
    objectiveHint: '击败巡山妖卒与「混世魔先锋」，夺回花果山灵脉',
    skyColor: 0x05080a,
    fogColor: 0x0a1718,
    groundColorA: 0x081614,
    groundColorB: 0x16302a,
    splatWorldUrl: 'worlds/huaguoshan.spz',
    landmarkModel: 'models/jingubang-pillar.glb',
    landmarkPos: [0, -24],
    peaches: [
      [-10, 6],
      [11, 4],
      [-6, -10],
    ],
    enemies: [
      {
        id: 'wolf-1',
        name: '牛妖力士',
        isBoss: false,
        hp: 120,
        atk: 12,
        scale: 1.35,
        pos: [-6, 5],
        modelCandidates: ['models/bullking-animated.glb'],
        color: 0x6f7d8c,
      },
      {
        id: 'wolf-2',
        name: '黑风牛妖',
        isBoss: false,
        hp: 140,
        atk: 14,
        scale: 1.45,
        pos: [6, 3],
        modelCandidates: ['models/bullking-animated.glb'],
        color: 0x7c6858,
      },
      {
        id: 'boss-hunshi',
        name: '混世魔先锋',
        title: '水帘洞妖统领',
        isBoss: true,
        hp: 520,
        atk: 24,
        scale: 2.65,
        pos: [0, -10],
        modelCandidates: ['models/bullking-animated.glb', 'models/taotie-boss.glb'],
        color: 0x4fc3a1,
      },
    ],
  },
  {
    index: 1,
    code: '第二回',
    title: '火焰山 · 芭蕉熄火',
    subtitle: 'CHAPTER II · FLAMING MOUNTAINS',
    introPoem: '八百里火焰，寸草不生；铜头铁脑，亦化汁水！唯施展「[3] 芭蕉宝扇」飓风神通，方能扇灭三昧火墙、直捣魔巢！',
    objectiveHint: '按 [3] 挥动芭蕉扇扑灭前方三昧火墙，击败镇山「赤炎统领」',
    skyColor: 0x260c08,
    fogColor: 0x3a140c,
    groundColorA: 0x3b1710,
    groundColorB: 0x7a2f18,
    splatWorldUrl: 'worlds/desert_ruin.spz',
    landmarkModel: 'models/zhulong-dragon.glb',
    landmarkPos: [0, -25],
    hasFireBarrier: true,
    peaches: [
      [-11, 8],
      [11, 8],
      [0, -6],
    ],
    enemies: [
      {
        id: 'flame-1',
        name: '赤火牛卒',
        isBoss: false,
        hp: 160,
        atk: 16,
        scale: 1.4,
        pos: [-8, 5],
        modelCandidates: ['models/bullking-animated.glb'],
        color: 0xd95338,
      },
      {
        id: 'flame-2',
        name: '熔岩牛妖',
        isBoss: false,
        hp: 180,
        atk: 18,
        scale: 1.5,
        pos: [8, 5],
        modelCandidates: ['models/bullking-animated.glb'],
        color: 0xe67332,
      },
      {
        id: 'boss-flame',
        name: '火焰山赤炎魔将',
        title: '八百里熔岩之主',
        isBoss: true,
        hp: 760,
        atk: 28,
        scale: 2.95,
        pos: [0, -17],
        modelCandidates: ['models/zhulong-dragon.glb', 'models/taotie-boss.glb'],
        color: 0xff6433,
      },
    ],
  },
  {
    index: 2,
    code: '第三回',
    title: '南天门 · 凌霄破阵',
    subtitle: 'FINAL CHAPTER · CELESTIAL GATE SHOWDOWN',
    introPoem: '金箍棒指凌霄殿，踏碎南天万里云！驾筋斗云穿南天玉阙，迎战二阶段狂暴法相「平天大圣·牛魔王」！',
    objectiveHint: '决战南天门终极妖圣「平天大圣·牛魔王」（半血将进入法天象地狂暴二阶段！）',
    skyColor: 0x0b1024,
    fogColor: 0x141d38,
    groundColorA: 0x222940,
    groundColorB: 0x454e6b,
    splatWorldUrl: 'worlds/lingxiao_palace.spz',
    landmarkModel: 'models/nantian-gate.glb',
    landmarkPos: [0, -24],
    peaches: [
      [-12, 5],
      [12, 5],
      [-9, -12],
      [9, -12],
    ],
    enemies: [
      {
        id: 'guard-1',
        name: '镇天金甲卫',
        isBoss: false,
        hp: 200,
        atk: 18,
        scale: 1.5,
        pos: [-9, -2],
        modelCandidates: ['models/baize-beast.glb'],
        color: 0xe8c574,
      },
      {
        id: 'boss-bullking',
        name: '平天大圣 · 牛魔王',
        title: '混元法天象地 · 终极妖圣',
        isBoss: true,
        hp: 1150,
        atk: 34,
        scale: 3.4,
        pos: [0, -16],
        modelCandidates: ['models/bullking-animated.glb', 'models/bullking-rigged.glb', 'models/bullking-tpose.glb', 'models/taotie-boss.glb'],
        color: 0xff4733,
      },
    ],
  },
];
