const fs = require('fs');

const API_KEY = process.env.TORN_API_KEY;
const BASE = 'https://api.torn.com';
const BACKFILL_FROM = process.env.BACKFILL_FROM || null;

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchDay(date, fromTs, toTs, allMembers) {
  const attacks = await fetchJSON(
    `${BASE}/faction/?selections=attacks&from=${fromTs}&to=${toTs}&key=${API_KEY}`
  );

  if (attacks.error) {
    console.error(`API error for ${date}:`, attacks.error.error);
    return null;
  }

  const members = {};
  for (const [id, m] of Object.entries(allMembers)) {
    members[id] = { name: m.name, respect: 0, hits: 0, assists: 0, losses: 0 };
  }

  const HIT_RESULTS = ['Attacked','Hospitalized','Mugged','Arrested','Escape','Timeout','Special'];

  for (const atk of Object.values(attacks.attacks || {})) {
    const id = String(atk.attacker_id);
    if (!members[id]) members[id] = { name: atk.attacker_name, respect: 0, hits: 0, assists: 0, losses: 0 };
    if (HIT_RESULTS.includes(atk.result)) {
      members[id].hits++;
      members[id].respect += atk.respect_gain || 0;
    } else if (atk.result === 'Assist') {
      members[id].assists++;
    } else if (['Lost','Stalemate','Interrupted'].includes(atk.result)) {
      members[id].losses++;
    }
  }

  return {
    date,
    members: Object.entries(members).map(([id, m]) => ({ id, ...m }))
  };
}

async function run() {
  const basic = await fetchJSON(`${BASE}/faction/?selections=basic&key=${API_KEY}`);
  if (basic.error) { console.error('API error:', basic.error.error); process.exit(1); }

  const allMembers = basic.members || {};
  fs.mkdirSync('data', { recursive: true });

  if (BACKFILL_FROM) {
    // Backfill mode — loop from start date to yesterday
    console.log(`Backfilling from ${BACKFILL_FROM}...`);
    const start = new Date(BACKFILL_FROM);
    const end = new Date();
    end.setDate(end.getDate() - 1);

    let current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const fromTs = Math.floor(current.getTime() / 1000);
      const toTs = fromTs + 86399;

      console.log(`Fetching ${dateStr}...`);
      const snapshot = await fetchDay(dateStr, fromTs, toTs, allMembers);
      if (snapshot) {
        fs.writeFileSync(`data/${dateStr}.json`, JSON.stringify(snapshot, null, 2));
        console.log(`Saved data/${dateStr}.json`);
      }

      await sleep(1000); // avoid hitting API rate limit
      current.setDate(current.getDate() + 1);
    }
    console.log('Backfill complete!');
  } else {
    // Normal daily mode — just fetch last 24 hours
    const today = new Date().toISOString().slice(0, 10);
    const fromTs = Math.floor(Date.now() / 1000) - 86400;
    const toTs = Math.floor(Date.now() / 1000);
    const snapshot = await fetchDay(today, fromTs, toTs, allMembers);
    if (snapshot) {
      fs.writeFileSync(`data/${today}.json`, JSON.stringify(snapshot, null, 2));
      console.log(`Saved data/${today}.json`);
    }
  }
}

run();
