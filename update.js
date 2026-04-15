const fs = require('fs');

// 模拟获取今日比赛数据（实际使用时可接入真实API）
function fetchTodayMatches() {
    return new Promise((resolve) => {
        const today = new Date().toISOString().split('T')[0];
        resolve({
            date: today,
            league: '韩K联',
            matches: [{
                homeTeam: '蔚山现代',
                awayTeam: '首尔FC',
                homeElo: 1860,
                awayElo: 1790,
                date: `${today} 18:00`,
                league: '韩K联 第8轮',
                homeLambda: 1.56,
                awayLambda: 1.12,
                factors: [
                    { name: '近期状态', contribution: 0.12 },
                    { name: '主场优势', contribution: 0.08 },
                    { name: '历史交锋', contribution: 0.03 },
                    { name: '伤停影响', contribution: -0.05 }
                ]
            }]
        });
    });
}

async function main() {
    console.log('开始更新预测数据...');
    const matchData = await fetchTodayMatches();
    fs.writeFileSync('data.json', JSON.stringify(matchData, null, 2));
    console.log('✅ data.json 更新成功');
}

main().catch(console.error);
