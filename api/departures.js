import crypto from 'crypto';

const PTV_BASE_URL = 'https://timetableapi.ptv.vic.gov.au';
const BURNLEY_STOP_ID = 1030;
const GLEN_WAVERLEY_DIRECTION_ID = 6;
const GLEN_WAVERLEY_ROUTE_ID = 7;

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
    return res.status(500).json({
      error: 'PTV API credentials not configured',
    });
  }

  try {
    const path = `/v3/departures/route_type/0/stop/${BURNLEY_STOP_ID}/route/${GLEN_WAVERLEY_ROUTE_ID}?direction_id=${GLEN_WAVERLEY_DIRECTION_ID}&max_results=10&expand=run`;
    const data = await fetchPTV(path, devId, apiKey);

    const departures = data.departures
      ?.filter(d => d.direction_id === GLEN_WAVERLEY_DIRECTION_ID)
      .map(d => {
        const scheduled = new Date(d.scheduled_departure_utc);
        const estimated = d.estimated_departure_utc ? new Date(d.estimated_departure_utc) : null;
        return {
          scheduled: scheduled.toISOString(),
          estimated: estimated?.toISOString() || null,
          isRealTime: !!estimated,
          platform: d.platform_number,
        };
      })
      .slice(0, 6) || [];

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      station: 'Burnley',
      line: 'Glen Waverley',
      direction: 'Outbound',
      departures,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch departure data',
      message: error.message,
    });
  }
}
