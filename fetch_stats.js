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
    // Backfill mode — loop from start date to yesterday (in TCT)
    console.log(`Backfilling from ${BACKFILL_FROM}...`);
    const start = new Date(BACKFILL_FROM);
    
    // Get today in TCT
    const now = new Date();
    const tctNow = new Date(now.getTime() - (4 * 60 * 60 * 1000));
    const end = new Date(tctNow);
    end.setDate(end.getDate() - 1);
    
    let current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      
      // Calculate midnight to midnight in UTC for this TCT date
      const midnightTCT = new Date(current);
      midnightTCT.setHours(0, 0, 0, 0);
      const fromTs = Math.floor(midnightTCT.getTime() / 1000 - 86400 + (4 * 60 * 60));
      const toTs = Math.floor(midnightTCT.getTime() / 1000 + (4 * 60 * 60));
      
      console.log(`Fetching ${dateStr}...`);
      const snapshot = await fetchDay(dateStr, fromTs, toTs, allMembers);
      if (snapshot) {
        fs.writeFileSync(`data/${dateStr}.json`, JSON.stringify(snapshot, null, 2));
        console.log(`Saved data/${dateStr}.json`);
      }
      await sleep(1000);
      current.setDate(current.getDate() + 1);
    }
    console.log('Backfill complete!');
  } else {
    // Normal daily mode — fetch Torn City Time calendar day (midnight to midnight TCT)
    // TCT is UTC-4, so we adjust the time calculations accordingly
    const now = new Date();
    
    // Convert current time to TCT (UTC-4)
    const tctNow = new Date(now.getTime() - (4 * 60 * 60 * 1000));
    
    // Get today's midnight in TCT
    const todayMidnightTCT = new Date(tctNow);
    todayMidnightTCT.setHours(0, 0, 0, 0);
    
    // Calculate timestamps for midnight TCT yesterday to midnight TCT today
    // We need to convert back to UTC for the API call
    const fromTs = Math.floor(todayMidnightTCT.getTime() / 1000 - 86400 + (4 * 60 * 60));
    const toTs = Math.floor(todayMidnightTCT.getTime() / 1000 + (4 * 60 * 60));
    
    // Format date as YYYY-MM-DD in TCT
    const dateStr = tctNow.toISOString().slice(0, 10);
    
    console.log(`Fetching TCT day: ${dateStr}`);
    console.log(`Time window: ${new Date(fromTs * 1000).toISOString()} to ${new Date(toTs * 1000).toISOString()} UTC`);
    
    const snapshot = await fetchDay(dateStr, fromTs, toTs, allMembers);
    if (snapshot) {
      fs.writeFileSync(`data/${dateStr}.json`, JSON.stringify(snapshot, null, 2));
      console.log(`Saved data/${dateStr}.json`);
    }
  }
}

run();
