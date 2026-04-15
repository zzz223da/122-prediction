const fs = require('fs');
const fetch = require('node-fetch');

// ========== 配置区 ==========
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';

// 所有主流联赛ID列表
const LEAGUE_IDS = [
  // 亚洲
  292,  // 韩K联
  98,   // 日职联
  89,   // J2联赛
  90,   // J3联赛
  307,  // 中超
  308,  // 沙特联
  309,  // 卡塔尔联
  310,  // 阿联酋联
  // 欧洲五大联赛
  39,   // 英超
  140,  // 西甲
  78,   // 德甲
  135,  // 意甲
  61,   // 法甲
  // 欧洲其他主流
  88,   // 荷甲
  94,   // 葡超
  144,  // 比甲
  203,  // 土超
  179,  // 苏超
  106,  // 俄超
  119,  // 丹麦超
  103,  // 瑞典超
  113,  // 挪威超
  128,  // 波兰超
  345,  // 捷克甲
  271,  // 匈牙利甲
  283,  // 克罗地亚甲
  173,  // 希腊超
  283,  // 塞尔维亚超
  332,  // 斯洛伐克超
  365,  // 斯洛文尼亚甲
  207,  // 瑞士超
  218,  // 奥地利甲
  // 南北美洲
  71,   // 巴甲
  128,  // 阿甲
  262,  // 墨超
  253,  // 美职联
  // 杯赛
  2,    // 欧冠
  3,    // 欧联杯
  848,  // 亚冠
  531,  // 欧超杯
  4,    // 欧洲杯
  1,    // 世界杯
  5,    // 欧国联
  13,   // 南美解放者杯
  11,   // 南俱杯
  6,    // 非洲杯
  10,   // 亚洲杯
  9,    // 美洲杯
  15,   // 世俱杯
];

// 联赛名称映射（根据需要自动获取，这里只做备选）
const LEAGUE_NAMES = {};

// Elo 简易数据库（可自行扩展）
const ELO_DB = {
  '蔚山现代': 1860, '首尔FC': 1790, '浦项制铁': 1820, '全北现代': 1840,
  '川崎前锋': 1830, '横滨水手': 1810, '神户胜利船': 1790, '广岛三箭': 1760,
  '曼城': 2100, '阿森纳': 2060, '利物浦': 2040, '切尔西': 1950, '曼联': 1980, '热刺': 1920,
  '皇马': 2080, '巴萨': 2030, '马竞': 1980, '塞维利亚': 1850, '皇家社会': 1830,
  '拜仁': 2070, '多特': 1950, '莱比锡': 1900, '勒沃库森': 1920, '法兰克福': 1830,
  '国米': 2000, 'AC米兰': 1920, '尤文': 1940, '那不勒斯': 1880, '罗马': 1830, '拉齐奥': 1810,
  '巴黎': 2000, '马赛': 1820, '里昂': 1800, '摩纳哥': 1830, '里尔': 1780,
  '阿贾克斯': 1850, 'PSV': 1830, '费耶诺德': 1800,
  '本菲卡': 1880, '波尔图': 1850, '葡萄牙体育': 1830,
  '布鲁日': 1780, '安德莱赫特': 1750, '亨克': 1730,
  '加拉塔萨雷': 1800, '费内巴切': 1780, '贝西克塔斯': 1750,
  '凯尔特人': 1750, '流浪者': 1720,
  '泽尼特': 1850, '莫斯科中央陆军': 1780, '莫斯科斯巴达': 1750,
  '哥本哈根': 1720, '中日德兰': 1680,
  '马尔默': 1700, '埃尔夫斯堡': 1650,
  '博德闪耀': 1720, '莫尔德': 1680,
  '顿涅茨克矿工': 1850, '基辅迪纳摩': 1780,
  '萨尔茨堡红牛': 1820, '格拉茨风暴': 1700,
  '布拉格斯拉维亚': 1750, '布拉格斯巴达': 1730,
  '萨格勒布迪纳摩': 1750,
  '贝尔格莱德红星': 1750, '贝尔格莱德游击': 1680,
  '奥林匹亚科斯': 1780, '帕纳辛奈科斯': 1730, 'AEK雅典': 1700,
  '巴塞尔': 1720, '年轻人': 1700,
  '弗拉门戈': 1850, '帕尔梅拉斯': 1830, '圣保罗': 1780, '科林蒂安': 1750,
  '河床': 1820, '博卡青年': 1800,
  '蒙特雷': 1750, '老虎': 1720, '美洲': 1780,
  '洛杉矶FC': 1750, '迈阿密国际': 1720, '哥伦布机员': 1700
};

// ========== 工具函数 ==========
function factorial(n) {
  if (n <= 1) return 1;
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

function poisson(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function computeProbs(homeLambda, awayLambda, max = 6) {
  let home = 0, draw = 0, away = 0;
  const scores = [];
  for (let i = 0; i <= max; i++) {
    for (let j = 0; j <= max; j++) {
      const p = poisson(i, homeLambda) * poisson(j, awayLambda);
      scores.push({ home: i, away: j, prob: p });
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  scores.sort((a, b) => b.prob - a.prob);
  return {
    homeWin: home, draw, awayWin: away,
    bestScore: `${scores[0].home}-${scores[0].away} (${(scores[0].prob*100).toFixed(1)}%)`,
    secondScore: `${scores[1].home}-${scores[1].away} (${(scores[1].prob*100).toFixed(1)}%)`,
    thirdScore: `${scores[2].home}-${scores[2].away} (${(scores[2].prob*100).toFixed(1)}%)`
  };
}

function getElo(teamName) {
  // 尝试精确匹配
  if (ELO_DB[teamName]) return ELO_DB[teamName];
  // 尝试部分匹配
  for (const key in ELO_DB) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return ELO_DB[key];
    }
  }
  return 1750;
}

// ========== 获取单日所有联赛比赛 ==========
async function fetchAllFixtures(date) {
  let allFixtures = [];
  for (const leagueId of LEAGUE_IDS) {
    if (!FOOTBALL_API_KEY) continue;
    
    const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&date=${date}`;
    try {
      const res = await fetch(url, {
        headers: { 'x-rapidapi-key': FOOTBALL_API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
      });
      const data = await res.json();
      const fixtures = data.response || [];
      allFixtures = allFixtures.concat(fixtures);
      console.log(`联赛 ${leagueId}: ${fixtures.length} 场比赛`);
    } catch (err) {
      console.error(`联赛 ${leagueId} 获取失败:`, err.message);
    }
  }
  return allFixtures;
}

// ========== 获取赔率 ==========
async function fetchOdds(homeTeam, awayTeam) {
  if (!ODDS_API_KEY) return null;
  const sport = 'soccer';
  const region = 'uk';
  const market = 'h2h';
  const url = `https://api.odds-api.io/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=${region}&markets=${market}&dateFormat=iso`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.data) return null;
    for (const game of data.data) {
      if (game.home_team && game.away_team &&
          (game.home_team.toLowerCase().includes(homeTeam.toLowerCase()) ||
           homeTeam.toLowerCase().includes(game.home_team.toLowerCase())) &&
          (game.away_team.toLowerCase().includes(awayTeam.toLowerCase()) ||
           awayTeam.toLowerCase().includes(game.away_team.toLowerCase()))) {
        const bookmaker = game.bookmakers?.[0];
        if (bookmaker) {
          const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
          if (h2hMarket) {
            const homeOutcome = h2hMarket.outcomes?.find(o => o.name === game.home_team);
            const awayOutcome = h2hMarket.outcomes?.find(o => o.name === game.away_team);
            const drawOutcome = h2hMarket.outcomes?.find(o => o.name === 'Draw');
            if (homeOutcome && awayOutcome && drawOutcome) {
              return { home: homeOutcome.price, draw: drawOutcome.price, away: awayOutcome.price };
            }
          }
        }
      }
    }
    return null;
  } catch (err) {
    console.error('Odds-API 请求失败:', err.message);
    return null;
  }
}

// ========== 赔率转概率 ==========
function oddsToProb(homeOdds, drawOdds, awayOdds) {
  const homeProb = 1 / homeOdds;
  const drawProb = 1 / drawOdds;
  const awayProb = 1 / awayOdds;
  const total = homeProb + drawProb + awayProb;
  return { home: homeProb / total, draw: drawProb / total, away: awayProb / total };
}

// ========== 主函数 ==========
async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`正在获取 ${today} 所有联赛比赛...`);

  let fixtures = [];
  if (FOOTBALL_API_KEY) {
    fixtures = await fetchAllFixtures(today);
  }

  if (fixtures.length === 0) {
    console.log('今日无比赛或API未配置，使用测试数据');
    fixtures = [{
      teams: { home: { name: '蔚山现代' }, away: { name: '首尔FC' } },
      fixture: { date: new Date().toISOString() },
      league: { id: 292, name: '韩K联', round: '测试数据' }
    }];
  }

  const matches = await Promise.all(fixtures.map(async (f) => {
    const homeTeam = f.teams.home.name;
    const awayTeam = f.teams.away.name;
    const homeElo = getElo(homeTeam);
    const awayElo = getElo(awayTeam);
    const eloDiff = homeElo - awayElo;

    let homeLambda = 1.50 + eloDiff / 400;
    let awayLambda = 1.20 - eloDiff / 500;
    homeLambda = Math.min(2.5, Math.max(0.5, homeLambda));
    awayLambda = Math.min(2.5, Math.max(0.5, awayLambda));

    const modelProbs = computeProbs(homeLambda, awayLambda);

    // 获取赔率
    let odds = null;
    if (ODDS_API_KEY) {
      odds = await fetchOdds(homeTeam, awayTeam);
    }

    let homeOdds = 2.10, drawOdds = 3.20, awayOdds = 3.50;
    let marketProbs = { home: 0.45, draw: 0.30, away: 0.25 };
    if (odds) {
      homeOdds = odds.home;
      drawOdds = odds.draw;
      awayOdds = odds.away;
      marketProbs = oddsToProb(homeOdds, drawOdds, awayOdds);
    }

    const homeDiff = Math.abs(modelProbs.homeWin - marketProbs.home);
    const isHighValue = homeDiff > 0.08;

    return {
      homeTeam, awayTeam, homeElo, awayElo,
      date: new Date(f.fixture.date).toLocaleString('zh-CN', { timeZone: 'Asia/Seoul' }),
      league: f.league.name, round: f.league.round,
      homeLambda, awayLambda,
      modelProbs: { home: modelProbs.homeWin, draw: modelProbs.draw, away: modelProbs.awayWin },
      marketProbs,
      finalProbs: { home: modelProbs.homeWin, draw: modelProbs.draw, away: modelProbs.awayWin },
      bestScore: modelProbs.bestScore,
      secondScore: modelProbs.secondScore,
      thirdScore: modelProbs.thirdScore,
      odds: { home: homeOdds, draw: drawOdds, away: awayOdds },
      isHighValue,
      factors: [
        { name: 'Elo 优势', contribution: eloDiff / 400 },
        { name: '主场加持', contribution: 0.08 },
        { name: '市场分歧', contribution: homeDiff }
      ]
    };
  }));

  const output = { date: today, matches };
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`✅ 总共生成 ${matches.length} 场比赛预测`);
}

main().catch(console.error);
