const fs = require('fs');
const fetch = require('node-fetch');

// ========== 配置区 ==========
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';

const LEAGUE_IDS = {
  KLeague: 292,    // 韩K联
  JLeague: 98,     // 日职联
  EPL: 39,         // 英超
  LaLiga: 140,     // 西甲
  Bundesliga: 78   // 德甲
};

let TARGET_LEAGUE = 'KLeague';

const ELO_DB = {
  '蔚山现代': 1860, '首尔FC': 1790, '浦项制铁': 1820, '全北现代': 1840,
  '川崎前锋': 1830, '横滨水手': 1810, '神户胜利船': 1790, '广岛三箭': 1760,
  '曼城': 2100, '阿森纳': 2060, '利物浦': 2040, '切尔西': 1950,
  '皇马': 2080, '巴萨': 2030, '马竞': 1980,
  '拜仁': 2070, '多特': 1950, '莱比锡': 1900
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
  return ELO_DB[teamName] || 1750;
}

// ========== 获取比赛数据 ==========
async function fetchFixtures(leagueId, season, date) {
  if (!FOOTBALL_API_KEY) return [];
  const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&date=${date}`;
  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': FOOTBALL_API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
  });
  const data = await res.json();
  return data.response || [];
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
  console.log(`正在获取 ${TARGET_LEAGUE} ${today} 比赛...`);

  let fixtures = [];
  if (FOOTBALL_API_KEY) {
    const leagueId = LEAGUE_IDS[TARGET_LEAGUE];
    fixtures = await fetchFixtures(leagueId, 2026, today);
  }

  // ★★★ 关键：即使API无数据，也生成包含新字段的测试数据 ★★★
  if (fixtures.length === 0) {
    console.log('今日无比赛或API未配置，使用测试数据（含赔率模拟）');
    fixtures = [{
      teams: { home: { name: '蔚山现代' }, away: { name: '首尔FC' } },
      fixture: { date: new Date().toISOString() },
      league: { name: '韩K联', round: '测试数据' }
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

    let odds = null;
    if (ODDS_API_KEY) {
      odds = await fetchOdds(homeTeam, awayTeam);
    }

    // 模拟赔率（确保新字段存在）
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

  const output = { date: today, league: TARGET_LEAGUE, matches };
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`✅ 已生成 ${matches.length} 场比赛预测`);
}

main().catch(console.error);
