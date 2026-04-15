const fs = require('fs');
const fetch = require('node-fetch');

const API_KEY = process.env.FOOTBALL_API_KEY || '';
const LEAGUE_IDS = {
  JLeague: 98,
  KLeague: 292,
  EPL: 39,
  LaLiga: 140,
  Bundesliga: 78
};
const TARGET_LEAGUE = 'KLeague'; // 可改为你想要的联赛

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
  const base = { '蔚山现代': 1860, '首尔FC': 1790, '浦项制铁': 1820, '全北现代': 1840 };
  return base[teamName] || 1750;
}

async function fetchTodayFixtures() {
  const today = new Date().toISOString().split('T')[0];
  const leagueId = LEAGUE_IDS[TARGET_LEAGUE];
  const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&date=${today}`;

  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
  });
  const data = await res.json();
  return data.response || [];
}

async function main() {
  console.log(`正在获取 ${TARGET_LEAGUE} 今日比赛...`);

  let fixtures = [];
  if (API_KEY) {
    fixtures = await fetchTodayFixtures();
  }

  if (fixtures.length === 0) {
    console.log('今日无比赛或API未配置，使用默认示例');
    fixtures = [{
      teams: { home: { name: '蔚山现代' }, away: { name: '首尔FC' } },
      fixture: { date: new Date().toISOString() }
    }];
  }

  const matches = fixtures.map(f => {
    const homeTeam = f.teams.home.name;
    const awayTeam = f.teams.away.name;
    const homeElo = getElo(homeTeam);
    const awayElo = getElo(awayTeam);
    const eloDiff = homeElo - awayElo;

    const homeLambda = Math.min(2.2, Math.max(0.6, 1.50 + eloDiff / 400));
    const awayLambda = Math.min(2.2, Math.max(0.6, 1.20 - eloDiff / 500));

    const probs = computeProbs(homeLambda, awayLambda);
    const factors = [
      { name: 'Elo 优势', contribution: eloDiff > 0 ? 0.08 : -0.05 },
      { name: '主场加持', contribution: 0.06 },
      { name: '近期状态', contribution: 0.03 }
    ];

    return {
      homeTeam, awayTeam,
      homeElo, awayElo,
      date: new Date(f.fixture.date).toLocaleString('zh-CN', { timeZone: 'Asia/Seoul' }),
      league: TARGET_LEAGUE,
      homeLambda, awayLambda,
      factors,
      ...probs
    };
  });

  const output = {
    date: new Date().toISOString().split('T')[0],
    league: TARGET_LEAGUE,
    matches
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`✅ 已生成 ${matches.length} 场比赛预测`);
}

main().catch(console.error);
