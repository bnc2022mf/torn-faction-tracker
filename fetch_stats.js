const fs = require('fs');

const API_KEY = process.env.TORN_API_KEY;
const BASE = 'https://api.torn.com';

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);

  const basic = await fetchJSON(`${BASE}/faction/?selections=basic&key=${API_KEY}`);

  const fromTimestamp = Math.floor(Date.now() / 1000) - 86400;
  const attacks = await fetchJSON(
    `${BASE}/faction/?selections=attacks&from=${fromTimestamp}&key=${API_KEY}`
  );

  const members = {};
  for (const [id, m] of Object.entries(basic.members || {})) {
    members[id] = { name: m.name, respect: 0, hits: 0, assists: 0, losses: 0 };
  }

  for (const atk of Object.values(attacks.attacks || {})) {
    const id = String(atk.attacker_id);
    if (!members[id]) members[id] = { name: atk.attacker_name, respect: 0, hits: 0, assists: 0, losses: 0 };
    if (atk.result === 'Hospitalize' || atk.result === 'Mug' || atk.result === 'Leave') {
      members[id].hits++;
      members[id].respect += atk.respect_gain || 0;
    } else if (atk.result === 'Assist') {
      members[id].assists++;
    } else if (atk.result === 'Lost' || atk.result === 'Stalemate') {
      members[id].losses++;
    }
  }

  const snapshot = { date: today, members: Object.entries(members).map(([id, m]) => ({ id, ...m })) };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(`data/${today}.json`, JSON.stringify(snapshot, null, 2));
  console.log(`Saved data/${today}.json`);
}

run();
