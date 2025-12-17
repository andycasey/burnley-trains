import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim();
  });
}

const PTV_DEVID = process.env.PTV_DEVID;
const PTV_KEY = process.env.PTV_KEY;
const BASE_URL = 'https://timetableapi.ptv.vic.gov.au';

// Train config
const BURNLEY_STOP_ID = 1030;
const GLEN_WAVERLEY_DIRECTION_ID = 6;
const GLEN_WAVERLEY_ROUTE_ID = 7;

// Bus config
const BUS_STOP_ID = 22752;

function signRequest(path) {
  const url = path + (path.includes('?') ? '&' : '?') + `devid=${PTV_DEVID}`;
  const sig = crypto.createHmac('sha1', PTV_KEY).update(url).digest('hex').toUpperCase();
  return `${BASE_URL}${url}&signature=${sig}`;
}

async function fetchPTV(path) {
  const res = await fetch(signRequest(path));
  return res.json();
}

async function handleAPI(res) {
  try {
    const [trainData, busData] = await Promise.all([
      fetchPTV(`/v3/departures/route_type/0/stop/${BURNLEY_STOP_ID}/route/${GLEN_WAVERLEY_ROUTE_ID}?direction_id=${GLEN_WAVERLEY_DIRECTION_ID}&max_results=10&expand=run`),
      fetchPTV(`/v3/departures/route_type/2/stop/${BUS_STOP_ID}?max_results=10&expand=route&expand=direction`),
    ]);

    const trains = trainData.departures
      ?.filter(d => d.direction_id === GLEN_WAVERLEY_DIRECTION_ID)
      .map(d => ({
        scheduled: new Date(d.scheduled_departure_utc).toISOString(),
        estimated: d.estimated_departure_utc ? new Date(d.estimated_departure_utc).toISOString() : null,
        isRealTime: !!d.estimated_departure_utc,
        platform: d.platform_number,
      }))
      .slice(0, 6) || [];

    const buses = busData.departures
      ?.filter(d => {
        const route = busData.routes?.[d.route_id];
        const dir = busData.directions?.[d.direction_id];
        return route?.route_number === '733' && dir?.direction_name === 'Box Hill';
      })
      .map(d => ({
        scheduled: new Date(d.scheduled_departure_utc).toISOString(),
        estimated: d.estimated_departure_utc ? new Date(d.estimated_departure_utc).toISOString() : null,
        isRealTime: !!d.estimated_departure_utc,
        route: '733',
        destination: 'Box Hill via Mt Waverley',
      }))
      .slice(0, 4) || [];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      timestamp: new Date().toISOString(),
      trains: { station: 'Burnley', line: 'Glen Waverley', departures: trains },
      buses: { stop: 'Woodside Ave/Clayton Rd', departures: buses },
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/api/departures') return handleAPI(res);

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3001, () => console.log('Server running at http://localhost:3001'));
