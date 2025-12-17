import crypto from 'crypto';

const PTV_BASE_URL = 'https://timetableapi.ptv.vic.gov.au';

// Train: Burnley to Glen Waverley
const BURNLEY_STOP_ID = 1030;
const GLEN_WAVERLEY_DIRECTION_ID = 6;
const GLEN_WAVERLEY_ROUTE_ID = 7;

// Bus: Woodside Ave/Clayton Rd - 733 to Box Hill (via Mt Waverley)
const BUS_STOP_ID = 22752;
const BUS_ROUTE_733 = 13271;

function signRequest(requestPath, devId, apiKey) {
  const url = requestPath + (requestPath.includes('?') ? '&' : '?') + `devid=${devId}`;
  const signature = crypto.createHmac('sha1', apiKey).update(url).digest('hex').toUpperCase();
  return `${PTV_BASE_URL}${url}&signature=${signature}`;
}

async function fetchPTV(path, devId, apiKey) {
  const signedUrl = signRequest(path, devId, apiKey);
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`PTV API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const devId = process.env.PTV_DEVID;
  const apiKey = process.env.PTV_KEY;

  if (!devId || !apiKey) {
    return res.status(500).json({ error: 'PTV API credentials not configured' });
  }

  try {
    // Fetch both train and bus data in parallel
    const [trainData, busData] = await Promise.all([
      fetchPTV(`/v3/departures/route_type/0/stop/${BURNLEY_STOP_ID}/route/${GLEN_WAVERLEY_ROUTE_ID}?direction_id=${GLEN_WAVERLEY_DIRECTION_ID}&max_results=10&expand=run`, devId, apiKey),
      fetchPTV(`/v3/departures/route_type/2/stop/${BUS_STOP_ID}?max_results=10&expand=route&expand=direction`, devId, apiKey),
    ]);

    // Process train departures
    const trains = trainData.departures
      ?.filter(d => d.direction_id === GLEN_WAVERLEY_DIRECTION_ID)
      .map(d => ({
        scheduled: new Date(d.scheduled_departure_utc).toISOString(),
        estimated: d.estimated_departure_utc ? new Date(d.estimated_departure_utc).toISOString() : null,
        isRealTime: !!d.estimated_departure_utc,
        platform: d.platform_number,
      }))
      .slice(0, 6) || [];

    // Process bus departures - filter for 733 to Box Hill (via Mt Waverley)
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

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      trains: {
        station: 'Burnley',
        line: 'Glen Waverley',
        departures: trains,
      },
      buses: {
        stop: 'Woodside Ave/Clayton Rd',
        departures: buses,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch departure data',
      message: error.message,
    });
  }
}
