/**
 * 景点预约知识库 — 全国热门景点预约信息
 *
 * 数据结构：
 *   - 景点名精确匹配（支持别名模糊匹配）
 *   - 包含预约时间要求、放票时间、旺季策略、购票渠道
 *
 * 维护策略：
 *   - 手动维护核心景点
 *   - 后续可通过脚本从去哪儿/小红书定期更新
 */

/** 预约知识库条目 */
export interface ReservationEntry {
  /** 官方预约/购票 URL */
  officialUrl: string;
  /** 预约平台描述（如"官方小程序「故宫博物院」"/"官网"） */
  platform: string;
  /** 需提前几天预约（0 = 当天可约，-1 = 不确定） */
  advanceDays: number;
  /** 每日放票时间（如 "20:00"），空表示全天可约 */
  releaseTime?: string;
  /** 旺季月份（1-12），空表示全年同策 */
  peakSeasonMonths?: number[];
  /** 旺季需更多提前天数（覆盖 advanceDays），空表示全年一致 */
  peakAdvanceDays?: number;
  /** 预约提示 */
  tips: string;
  /** 备选购票渠道 */
  altChannels?: Array<{
    platform: string;
    url: string;
  }>;
}

// ─── 知识库数据 ──────────────────────────────────────────

const DB: Record<string, ReservationEntry> = {
  // ─── 北京 ────────────────────────────────────────
  故宫博物院: {
    officialUrl: "https://www.dpm.org.cn/visit/ticket.html",
    platform: "官方小程序「故宫博物院」",
    advanceDays: 7,
    releaseTime: "20:00",
    peakSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 7,
    tips: "实名制，刷身份证入园。每日20:00放第7天票，旺季秒光建议准点抢。周一闭馆（法定节假日除外）",
    altChannels: [
      { platform: "美团", url: "https://www.meituan.com/" },
      { platform: "携程", url: "https://www.ctrip.com/" },
    ],
  },
  国家博物馆: {
    officialUrl: "https://www.chnmuseum.cn/",
    platform: "官方公众号/小程序「国家博物馆」",
    advanceDays: 7,
    releaseTime: "17:00",
    tips: "免费但必须预约，分上午(9:00-12:30)/下午(12:30-16:30)场次。周一闭馆",
  },
  八达岭长城: {
    officialUrl: "https://www.badaling.cn/",
    platform: "官方公众号「八达岭长城」",
    advanceDays: 7,
    releaseTime: "20:00",
    tips: "旺季限流，建议提前购买缆车票。每日20:00放第7天票",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  颐和园: {
    officialUrl: "https://www.summerpalace-china.com/",
    platform: "官方公众号「颐和园」",
    advanceDays: 1,
    tips: "旺季(4-10月)建议提前1天预约，淡季通常当天可约",
    peakSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 3,
  },
  天坛公园: {
    officialUrl: "https://www.tiantanpark.com/",
    platform: "官方公众号「天坛」",
    advanceDays: 1,
    tips: "联票含祈年殿、回音壁等景点，旺季建议提前预约",
    peakSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 3,
  },
  圆明园遗址公园: {
    officialUrl: "https://www.yuanmingyuanpark.com/",
    platform: "官方公众号「圆明园遗址公园」",
    advanceDays: 1,
    tips: "含西洋楼遗址区需另购门票，建议提前网上购买",
  },
  毛主席纪念堂: {
    officialUrl: "https://www.cpcmch.com/",
    platform: "官方公众号「毛主席纪念堂」",
    advanceDays: 1,
    releaseTime: "00:00",
    tips: "免费但必须预约，上午开放(8:00-12:00)。需携带身份证，着装得体",
  },
  恭王府: {
    officialUrl: "https://www.pmc.org.cn/",
    platform: "官方公众号「恭王府博物馆」",
    advanceDays: 7,
    releaseTime: "20:00",
    tips: "每日20:00放第7天票，旺季建议抢票。周一闭馆",
  },
  雍和宫: {
    officialUrl: "https://www.yonghegong.cn/",
    platform: "官方公众号「雍和宫」",
    advanceDays: 1,
    tips: "需实名购票，节假日人流量大建议提前预约",
    peakSeasonMonths: [1, 2, 4, 5, 9, 10],
    peakAdvanceDays: 3,
  },
  慕田峪长城: {
    officialUrl: "https://www.mutianyugreatwall.com/",
    platform: "官方公众号「慕田峪长城」",
    advanceDays: 1,
    tips: "缆车/索道建议提前网上购买，现场排队较长",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  中国人民革命军事博物馆: {
    officialUrl: "https://www.jb.mil.cn/",
    platform: "官方公众号「军事博物馆」",
    advanceDays: 7,
    tips: "免费预约，周一闭馆",
  },
  中国科学技术馆: {
    officialUrl: "https://www.cstm.org.cn/",
    platform: "官方公众号「中国科学技术馆」",
    advanceDays: 7,
    releaseTime: "0:00",
    tips: "每日0:00放第7天票，热门亲子景点旺季需抢票",
  },

  // ─── 上海 ────────────────────────────────────────
  上海博物馆: {
    officialUrl: "https://www.shanghaimuseum.net/",
    platform: "官方公众号「上海博物馆」",
    advanceDays: 7,
    tips: "免费但需预约，特展需另购票。人民广场馆和东馆可选",
  },
  上海迪士尼乐园: {
    officialUrl: "https://www.shanghaidisneyresort.com/",
    platform: "官方App「上海迪士尼度假区」",
    advanceDays: 0,
    tips: "无需预约，购票即可入园。建议提前在App购票，旺季票价浮动。可购买早享卡",
    altChannels: [
      { platform: "携程", url: "https://www.ctrip.com/" },
      { platform: "飞猪", url: "https://www.fliggy.com/" },
    ],
  },
  东方明珠广播电视塔: {
    officialUrl: "https://www.orientalpearltower.com/",
    platform: "官方公众号「东方明珠」",
    advanceDays: 1,
    tips: "不同球体套票价格不同，建议提前网上购买享优惠",
    altChannels: [
      { platform: "美团", url: "https://www.meituan.com/" },
      { platform: "携程", url: "https://www.ctrip.com/" },
    ],
  },
  上海科技馆: {
    officialUrl: "https://www.sstm.org.cn/",
    platform: "官方公众号「上海科技馆」",
    advanceDays: 3,
    tips: "热门亲子景点，节假日建议提前预约",
  },
  上海自然博物馆: {
    officialUrl: "https://www.snhm.org.cn/",
    platform: "官方公众号「上海自然博物馆」",
    advanceDays: 3,
    tips: "热门亲子景点，节假日人流量大建议提前预约",
  },

  // ─── 西安 ────────────────────────────────────────
  秦始皇帝陵博物院: {
    officialUrl: "https://www.bmy.com.cn/",
    platform: "官方公众号「秦始皇帝陵博物院」",
    advanceDays: 7,
    releaseTime: "0:00",
    tips: "每日0:00放第7天票，旺季秒光。含兵马俑一/二/三号坑和铜车马展厅",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  陕西历史博物馆: {
    officialUrl: "https://www.sxhm.com/",
    platform: "官方公众号「陕西历史博物馆」",
    advanceDays: 5,
    releaseTime: "0:00",
    tips: "免费票极难抢，也可购买珍宝馆/壁画馆门票(有票概率更高)。周一闭馆",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  华清宫: {
    officialUrl: "https://www.hqc.cn/",
    platform: "官方公众号「华清宫景区」",
    advanceDays: 1,
    tips: "含长恨歌演出需另购票，演出票建议提前购买",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  西安城墙: {
    officialUrl: "https://www.xacitywall.com/",
    platform: "官方公众号「遇见城墙」",
    advanceDays: 0,
    tips: "现场可购票，旺季建议网上购买享优惠。含自行车租赁",
  },
  大雁塔: {
    officialUrl: "https://www.xianbt.com/",
    platform: "官方公众号「大慈恩寺」",
    advanceDays: 0,
    tips: "大慈恩寺门票含大雁塔登塔需另购票。广场音乐喷泉免费",
  },

  // ─── 南京 ────────────────────────────────────────
  中山陵: {
    officialUrl: "https://www.zschina.org/",
    platform: "官方公众号「钟山风景区」",
    advanceDays: 7,
    tips: "免费但必须预约，周一闭馆（祭堂）。每日限流，旺季建议提前抢约",
  },
  南京博物院: {
    officialUrl: "https://www.njmuseum.com/",
    platform: "官方小程序「南京博物院」",
    advanceDays: 7,
    releaseTime: "0:00",
    tips: "免费但必须预约，每日0:00放第7天票。民国馆很出片。周一闭馆",
  },
  总统府: {
    officialUrl: "https://www.njztf.cn/",
    platform: "官方公众号「南京总统府」",
    advanceDays: 3,
    tips: "旺季建议提前购票，周一闭馆（部分展厅）",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  明孝陵: {
    officialUrl: "https://www.zschina.org/",
    platform: "官方公众号「钟山风景区」",
    advanceDays: 1,
    tips: "含在钟山风景区联票中，最美石象路秋季极佳",
  },
  侵华日军南京大屠杀遇难同胞纪念馆: {
    officialUrl: "https://www.nj1937.org/",
    platform: "官方公众号「侵华日军南京大屠杀遇难同胞纪念馆」",
    advanceDays: 7,
    tips: "免费但必须预约，实名制。周一闭馆。注意着装得体",
  },

  // ─── 杭州 ────────────────────────────────────────
  灵隐寺: {
    officialUrl: "https://www.lingyinsi.com/",
    platform: "官方公众号「杭州灵隐寺」",
    advanceDays: 0,
    tips: "需先购飞来峰门票再购灵隐寺门票。节假日人流量极大",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  雷峰塔: {
    officialUrl: "https://www.leifengta.com/",
    platform: "官方公众号「雷峰塔景区」",
    advanceDays: 0,
    tips: "现场可购票，网上购买通常有优惠。含电梯登塔",
  },
  西溪国家湿地公园: {
    officialUrl: "https://www.xixiwetland.com.cn/",
    platform: "官方公众号「西溪湿地」",
    advanceDays: 1,
    tips: "含船票的套票更划算，建议提前网上购买",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  千岛湖: {
    officialUrl: "https://www.1000islandlake.com/",
    platform: "官方公众号「千岛湖旅游」",
    advanceDays: 1,
    tips: "游船票建议提前购买，旺季可能限流",
  },
  良渚古城遗址公园: {
    officialUrl: "https://www.lzpark.cn/",
    platform: "官方公众号「良渚古城」",
    advanceDays: 1,
    tips: "建议提前预约，含观光车票",
  },

  // ─── 成都 ────────────────────────────────────────
  成都大熊猫繁育研究基地: {
    officialUrl: "https://www.panda.org.cn/",
    platform: "官方公众号「成都大熊猫繁育研究基地」",
    advanceDays: 3,
    releaseTime: "0:00",
    tips: "每日0:00放第3天票。建议上午早去（7:30开门），熊猫上午活跃。南门进近幼年熊猫",
    peakSeasonMonths: [1, 2, 4, 5, 7, 8, 10],
    peakAdvanceDays: 5,
  },
  三星堆博物馆: {
    officialUrl: "https://www.sxd.cn/",
    platform: "官方公众号「三星堆博物馆」",
    advanceDays: 5,
    releaseTime: "20:00",
    tips: "每日20:00放第5天票，新馆非常火爆建议提前抢票。周一闭馆",
    peakSeasonMonths: [1, 2, 4, 5, 7, 8, 10],
    peakAdvanceDays: 7,
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  都江堰: {
    officialUrl: "https://www.djy517.com/",
    platform: "官方公众号「都江堰景区」",
    advanceDays: 0,
    tips: "现场可购票，建议提前网上购买享优惠",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  武侯祠: {
    officialUrl: "https://www.wuhouci.net.cn/",
    platform: "官方公众号「成都武侯祠博物馆」",
    advanceDays: 0,
    tips: "现场可购票，网上购买有优惠。含锦里古街",
  },

  // ─── 重庆 ────────────────────────────────────────
  洪崖洞: {
    officialUrl: "https://www.hongyadong.com/",
    platform: "官方公众号「洪崖洞」",
    advanceDays: 0,
    tips: "免费但需预约领取入场码，节假日人流极大可能限流",
  },
  磁器口古镇: {
    officialUrl: "https://www.ciqikou.com/",
    platform: "官方公众号「磁器口古镇」",
    advanceDays: 0,
    tips: "免费开放，无需预约。节假日人流极大",
  },

  // ─── 广州 ────────────────────────────────────────
  长隆野生动物世界: {
    officialUrl: "https://www.chimelong.com/",
    platform: "官方App「长隆旅游」",
    advanceDays: 1,
    tips: "建议提前在App购票享优惠，含小火车和空中缆车",
    altChannels: [
      { platform: "美团", url: "https://www.meituan.com/" },
      { platform: "携程", url: "https://www.ctrip.com/" },
    ],
  },
  陈家祠: {
    officialUrl: "https://www.gzchenjiaci.com/",
    platform: "官方公众号「广东民间工艺博物馆」",
    advanceDays: 1,
    tips: "建议提前预约，每日限流",
  },
  广州塔: {
    officialUrl: "https://www.cantontower.com/",
    platform: "官方公众号「广州塔」",
    advanceDays: 1,
    tips: "不同观光层价格不同，建议提前网上购买。摩天轮需另购票",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },

  // ─── 武汉 ────────────────────────────────────────
  黄鹤楼: {
    officialUrl: "https://www.cnhhl.com/",
    platform: "官方公众号「黄鹤楼」",
    advanceDays: 0,
    tips: "现场可购票，网上购买有优惠。夜场需另购票",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  湖北省博物馆: {
    officialUrl: "https://www.hbww.org/",
    platform: "官方公众号「湖北省博物馆」",
    advanceDays: 7,
    tips: "免费但必须预约，越王勾践剑和曾侯乙编钟是镇馆之宝。周一闭馆",
  },

  // ─── 厦门 ────────────────────────────────────────
  鼓浪屿: {
    officialUrl: "https://www.gly.cn/",
    platform: "官方公众号「鼓浪屿」/小程序「厦门轮渡+」",
    advanceDays: 10,
    releaseTime: "0:00",
    tips: "需提前购买轮渡票（游客走邮轮中心厦鼓码头→三丘田/内厝澳码头），每日0:00放第10天票",
    peakSeasonMonths: [1, 2, 5, 7, 8, 10],
    peakAdvanceDays: 15,
  },

  // ─── 桂林 ────────────────────────────────────────
  漓江游船: {
    officialUrl: "https://www.lijiangriver.com/",
    platform: "官方公众号「漓江景区」",
    advanceDays: 1,
    tips: "建议提前1天以上购票选座，旺季可能满员",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },

  // ─── 丽江 ────────────────────────────────────────
  玉龙雪山: {
    officialUrl: "https://www.yulongxs.com/",
    platform: "官方公众号「玉龙雪山」",
    advanceDays: 1,
    tips: "大索道票非常紧张建议提前抢，含索道+环保车套票。注意高原反应",
    peakSeasonMonths: [1, 2, 7, 8, 10],
    peakAdvanceDays: 3,
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  丽江古城: {
    officialUrl: "https://www.ljgc.cn/",
    platform: "官方公众号「丽江古城」",
    advanceDays: 0,
    tips: "免费进入，但需缴纳古城维护费（50元/人）。部分查验点抽查",
  },

  // ─── 拉萨 ────────────────────────────────────────
  布达拉宫: {
    officialUrl: "https://www.potalapalace.cn/",
    platform: "官方公众号「布达拉宫」",
    advanceDays: 7,
    tips: "旺季(5-10月)必须提前预约，每日限流。需提前1小时到达。注意高原反应",
    peakSeasonMonths: [5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 10,
  },
  大昭寺: {
    officialUrl: "https://www.jokhang.cn/",
    platform: "现场购票",
    advanceDays: 0,
    tips: "目前现场排队购票，旺季可能需等1-2小时。注意着装得体",
  },

  // ─── 其他热门景点 ──────────────────────────────────
  泰山: {
    officialUrl: "https://www.mount-tai.com.cn/",
    platform: "官方公众号「泰山景区」",
    advanceDays: 0,
    tips: "建议提前网上购票。夜爬需关注景区开放时间。含红门/天外村/桃花源三条路线",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  黄山: {
    officialUrl: "https://www.huangshan.com.cn/",
    platform: "官方公众号「黄山」",
    advanceDays: 1,
    tips: "含门票+索道建议提前网上购买。西海大峡谷需额外时间。山上住宿需提前预订",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  张家界国家森林公园: {
    officialUrl: "https://www.zjjpark.com/",
    platform: "官方公众号「张家界旅游」",
    advanceDays: 0,
    tips: "建议网上购票，含多日票。天门山需另购票",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  九寨沟: {
    officialUrl: "https://www.jiuzhai.com/",
    platform: "官方公众号「九寨沟」",
    advanceDays: 1,
    tips: "旺季限流必须提前购票，每日14:00后不可入园",
    peakSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 3,
  },
  莫高窟: {
    officialUrl: "https://www.mogaoku.net/",
    platform: "官方公众号「莫高窟参观预约网」",
    advanceDays: 30,
    tips: "旺季必须提前30天预约！A类票含数字中心+8个窟，B类票含4个窟(现场购)。建议选A类票",
    peakSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    peakAdvanceDays: 30,
  },
  少林寺: {
    officialUrl: "https://www.shaolin.org.cn/",
    platform: "官方公众号「少林寺景区」",
    advanceDays: 0,
    tips: "现场可购票，网上有优惠。含武术表演",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  乐山大佛: {
    officialUrl: "https://www.lsdf517.cn/",
    platform: "官方公众号「乐山大佛景区」",
    advanceDays: 1,
    tips: "旺季限流建议提前预约。可选择登山观佛或乘船观佛",
  },
  峨眉山: {
    officialUrl: "https://www.ems517.com/",
    platform: "官方公众号「峨眉山景区」",
    advanceDays: 1,
    tips: "含门票+索道+观光车套票建议提前购买。金顶住宿紧张需提前预订",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  乌镇: {
    officialUrl: "https://www.wuzhen.com.cn/",
    platform: "官方公众号「乌镇景区」",
    advanceDays: 0,
    tips: "西栅景区需购票，东栅景区部分免费。建议购买东西栅联票",
    altChannels: [{ platform: "携程", url: "https://www.ctrip.com/" }],
  },
  周庄: {
    officialUrl: "https://www.zhouzhuang.net/",
    platform: "官方公众号「周庄旅游」",
    advanceDays: 0,
    tips: "建议提前网上购买享优惠。早7:30前/晚20:00后免票进入",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  平遥古城: {
    officialUrl: "https://www.pingyaocity.com/",
    platform: "官方公众号「平遥古城景区」",
    advanceDays: 0,
    tips: "进城免费，景点通票需购买。含22个景点，3天有效",
  },
  苏州博物馆: {
    officialUrl: "https://www.szmuseum.com/",
    platform: "官方公众号「苏州博物馆」",
    advanceDays: 7,
    tips: "免费但必须预约，本馆(贝聿铭设计)和西馆可选。周一闭馆",
  },
  拙政园: {
    officialUrl: "https://www.szzzy.cn/",
    platform: "官方公众号「拙政园」",
    advanceDays: 1,
    tips: "旺季建议提前网上购票，每日限流",
    peakSeasonMonths: [3, 4, 5, 9, 10, 11],
    peakAdvanceDays: 3,
  },
  西湖: {
    officialUrl: "https://www.xihu54.com/",
    platform: "官方公众号「杭州西湖风景名胜区」",
    advanceDays: 0,
    tips: "免费开放，无需预约。部分收费景点（雷峰塔/三潭印月）需单独购票",
  },
  外滩: {
    officialUrl: "https://www.thebund.cn/",
    platform: "无需预约",
    advanceDays: 0,
    tips: "免费开放，无需预约。建议晚上前往观赏灯光秀",
  },
  "鼓浪屿(轮渡)": {
    officialUrl: "https://www.gly.cn/",
    platform: "小程序「厦门轮渡+」",
    advanceDays: 10,
    releaseTime: "0:00",
    tips: "游客走邮轮中心厦鼓码头，每日0:00放第10天票。节假日非常紧张",
    peakSeasonMonths: [1, 2, 5, 7, 8, 10],
    peakAdvanceDays: 15,
  },
  秦始皇兵马俑: {
    officialUrl: "https://www.bmy.com.cn/",
    platform: "官方公众号「秦始皇帝陵博物院」",
    advanceDays: 7,
    releaseTime: "0:00",
    tips: "每日0:00放第7天票，旺季秒光。含兵马俑一/二/三号坑和铜车马展厅",
    altChannels: [{ platform: "美团", url: "https://www.meituan.com/" }],
  },
  中国国家图书馆: {
    officialUrl: "https://www.nlc.cn/",
    platform: "官方公众号「国家图书馆」",
    advanceDays: 1,
    tips: "免费但需预约入馆",
  },
};

// ─── 别名映射（用于模糊匹配） ──────────────────────────────

/** 景点别名 → 知识库标准名 */
const ALIAS_MAP: Record<string, string> = {
  故宫: "故宫博物院",
  紫禁城: "故宫博物院",
  国博: "国家博物馆",
  中国国博: "国家博物馆",
  长城: "八达岭长城",
  万里长城: "八达岭长城",
  颐和园: "颐和园",
  夏宫: "颐和园",
  天坛: "天坛公园",
  兵马俑: "秦始皇兵马俑",
  秦兵马俑: "秦始皇兵马俑",
  迪士尼: "上海迪士尼乐园",
  上海迪士尼: "上海迪士尼乐园",
  迪士尼乐园: "上海迪士尼乐园",
  熊猫基地: "成都大熊猫繁育研究基地",
  大熊猫基地: "成都大熊猫繁育研究基地",
  三星堆: "三星堆博物馆",
  武侯祠: "武侯祠",
  锦里: "武侯祠",
  大雁塔: "大雁塔",
  明城墙: "西安城墙",
  西安明城墙: "西安城墙",
  城墙: "西安城墙",
  中山陵: "中山陵",
  南京大屠杀纪念馆: "侵华日军南京大屠杀遇难同胞纪念馆",
  江东门纪念馆: "侵华日军南京大屠杀遇难同胞纪念馆",
  西湖: "西湖",
  灵隐寺: "灵隐寺",
  西湖湿地: "西溪国家湿地公园",
  西溪湿地: "西溪国家湿地公园",
  洪崖洞: "洪崖洞",
  磁器口: "磁器口古镇",
  长隆: "长隆野生动物世界",
  长隆动物园: "长隆野生动物世界",
  广州塔: "广州塔",
  小蛮腰: "广州塔",
  黄鹤楼: "黄鹤楼",
  省博: "湖北省博物馆",
  黄鹤楼公园: "黄鹤楼",
  鼓浪屿: "鼓浪屿(轮渡)",
  玉龙雪山: "玉龙雪山",
  丽江古城: "丽江古城",
  大研古城: "丽江古城",
  布达拉宫: "布达拉宫",
  大昭寺: "大昭寺",
  泰山: "泰山",
  黄山: "黄山",
  张家界: "张家界国家森林公园",
  九寨沟: "九寨沟",
  莫高窟: "莫高窟",
  敦煌石窟: "莫高窟",
  少林寺: "少林寺",
  乐山大佛: "乐山大佛",
  峨眉山: "峨眉山",
  乌镇: "乌镇",
  周庄: "周庄",
  平遥: "平遥古城",
  平遥古城: "平遥古城",
  苏博: "苏州博物馆",
  苏州博物馆: "苏州博物馆",
  拙政园: "拙政园",
  外滩: "外滩",
  东方明珠: "东方明珠广播电视塔",
  上海科技馆: "上海科技馆",
  上海自然博物馆: "上海自然博物馆",
  千岛湖: "千岛湖",
  良渚: "良渚古城遗址公园",
  良渚古城: "良渚古城遗址公园",
  都江堰: "都江堰",
  华清宫: "华清宫",
  华清池: "华清宫",
  雷峰塔: "雷峰塔",
  总统府: "总统府",
  南京总统府: "总统府",
  明孝陵: "明孝陵",
  恭王府: "恭王府",
  和珅府: "恭王府",
  雍和宫: "雍和宫",
  慕田峪: "慕田峪长城",
  军博: "中国人民革命军事博物馆",
  军事博物馆: "中国人民革命军事博物馆",
  科技馆: "中国科学技术馆",
  中国科技馆: "中国科学技术馆",
};

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 精确查询预约信息
 */
export function lookupReservation(nameZh: string): ReservationEntry | undefined {
  return DB[nameZh];
}

/**
 * 模糊查询（支持别名、去后缀、部分匹配）
 */
export function fuzzyLookupReservation(nameZh: string): ReservationEntry | undefined {
  // 1. 精确匹配
  if (DB[nameZh]) return DB[nameZh];

  // 2. 别名匹配
  if (ALIAS_MAP[nameZh]) return DB[ALIAS_MAP[nameZh]];

  // 3. 去通用后缀后匹配
  const stripped = nameZh.replace(
    /(风景区|风景名胜区|旅游区|景区|公园|博物馆|纪念馆|名胜区|遗址公园|国家级|全国重点|文物保护单位)$/g,
    "",
  );
  if (stripped !== nameZh) {
    if (DB[stripped]) return DB[stripped];
    if (ALIAS_MAP[stripped]) return DB[ALIAS_MAP[stripped]];
  }

  // 4. 包含匹配（知识库名包含查询名，或查询名包含知识库名）
  for (const key of Object.keys(DB)) {
    if (key.includes(nameZh) || nameZh.includes(key)) return DB[key];
  }

  // 5. 别名表的包含匹配
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (alias.includes(nameZh) || nameZh.includes(alias)) return DB[canonical];
  }

  return undefined;
}

/**
 * 导出全部条目（供 action-link-service 批量使用）
 */
export function getAllReservationEntries(): Readonly<Record<string, ReservationEntry>> {
  return DB;
}

/**
 * 获取所有预约 URL 映射（向后兼容 action-link-service 的 RESERVATION_URLS 用法）
 */
export function getReservationUrlMap(): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const [name, entry] of Object.entries(DB)) {
    map[name] = entry.officialUrl;
  }
  return map;
}
