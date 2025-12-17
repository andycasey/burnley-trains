import crypto from 'crypto';

const PTV_BASE_URL = 'https://timetableapi.ptv.vic.gov.au';

// Train station stop IDs (Glen Waverley line)
const STOPS = {
  train: { mountWaverley: 1137, syndal: 1190, glenWaverley: 1078 },
  bus: {
    mountWaverley733: 19051,
    syndal703: 16517,
    syndal737: 11385,
    glenWaverley: 11119,
  }
};

const BUS_TRAVEL_TIMES = { 733: 17, 703: 13, 737: 15, 742: 12 };
const TRAIN_TRAVEL = { mountWaverley: 0, syndal: 3, glenWaverley: 6 };
const MIN_TRANSFER = 3;

function signRequest(path, devId, apiKey) {
  const url = path + (path.includes('?') ? '&' : '?') + `devid=${devId}`;
  const sig = crypto.createHmac('sha1', apiKey).update(url).digest('hex').toUpperCase();
  return `${PTV_BASE_URL}${url}&signature=${sig}`;
}

async function fetchPTV(path, devId, apiKey) {
  const res = await fetch(signRequest(path, devId, apiKey));
  if (!res.ok) throw new Error(`PTV API error: ${res.status}`);
  return res.json();
}

function findNextBus(departures, trainArrival, minMins) {
  const minTime = new Date(trainArrival.getTime() + minMins * 60000);
  return departures
    .map(d => ({ ...d, time: new Date(d.estimated_departure_utc || d.scheduled_departure_utc) }))
    .filter(d => d.time >= minTime)
    .sort((a, b) => a.time - b.time)[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const devId = process.env.PTV_DEVID;
  const apiKey = process.env.PTV_KEY;
  if (!devId || !apiKey) return res.status(500).json({ error: 'Credentials not configured' });

  try {
    const [trains, mt733, syn703, syn737, gw] = await Promise.all([
      fetchPTV(`/v3/departures/route_type/0/stop/${STOPS.train.mountWaverley}?max_results=5&expand=route`, devId, apiKey),
      fetchPTV(`/v3/departures/route_type/2/stop/${STOPS.bus.mountWaverley733}?max_results=10&expand=route`, devId, apiKey),
      fetchPTV(`/v3/departures/route_type/2/stop/${STOPS.bus.syndal703}?max_results=10&expand=route`, devId, apiKey),
      fetchPTV(`/v3/departures/route_type/2/stop/${STOPS.bus.syndal737}?max_results=10&expand=route`, devId, apiKey),
      fetchPTV(`/v3/departures/route_type/2/stop/${STOPS.bus.glenWaverley}?max_results=10&expand=route`, devId, apiKey),
    ]);

    const outbound = trains.departures
      .filter(d => d.direction_id === 6)
      .map(d => ({ ...d, time: new Date(d.estimated_departure_utc || d.scheduled_departure_utc) }))
      .sort((a, b) => a.time - b.time);

    const nextTrain = outbound[0];
    if (!nextTrain) return res.status(200).json({ error: 'No trains', timestamp: new Date().toISOString() });

    const arrivals = {
      mountWaverley: nextTrain.time,
      syndal: new Date(nextTrain.time.getTime() + TRAIN_TRAVEL.syndal * 60000),
      glenWaverley: new Date(nextTrain.time.getTime() + TRAIN_TRAVEL.glenWaverley * 60000),
    };

    const options = [];

    // Mt Waverley 733
    const b733 = findNextBus(mt733.departures.filter(d => mt733.routes?.[d.route_id]?.route_number === '733'), arrivals.mountWaverley, MIN_TRANSFER);
    if (b733) {
      const arr = new Date(b733.time.getTime() + BUS_TRAVEL_TIMES[733] * 60000);
      options.push({ station: 'Mount Waverley', trainArrival: arrivals.mountWaverley.toISOString(),
        bus: { route: '733', departure: b733.time.toISOString(), travelTime: BUS_TRAVEL_TIMES[733] },
        arrivalAtMonash: arr.toISOString(), totalMinutes: Math.round((arr - new Date()) / 60000) });
    }

    // Syndal 703
    const b703 = findNextBus(syn703.departures.filter(d => syn703.routes?.[d.route_id]?.route_number === '703'), arrivals.syndal, MIN_TRANSFER);
    if (b703) {
      const arr = new Date(b703.time.getTime() + BUS_TRAVEL_TIMES[703] * 60000);
      options.push({ station: 'Syndal', trainArrival: arrivals.syndal.toISOString(),
        bus: { route: '703', departure: b703.time.toISOString(), travelTime: BUS_TRAVEL_TIMES[703] },
        arrivalAtMonash: arr.toISOString(), totalMinutes: Math.round((arr - new Date()) / 60000) });
    }

    // Syndal 737
    const b737s = findNextBus(syn737.departures.filter(d => syn737.routes?.[d.route_id]?.route_number === '737'), arrivals.syndal, MIN_TRANSFER);
    if (b737s) {
      const arr = new Date(b737s.time.getTime() + BUS_TRAVEL_TIMES[737] * 60000);
      options.push({ station: 'Syndal', trainArrival: arrivals.syndal.toISOString(),
        bus: { route: '737', departure: b737s.time.toISOString(), travelTime: BUS_TRAVEL_TIMES[737] },
        arrivalAtMonash: arr.toISOString(), totalMinutes: Math.round((arr - new Date()) / 60000) });
    }

    // Glen Waverley 742, 737
    for (const route of ['742', '737']) {
      const bus = findNextBus(gw.departures.filter(d => gw.routes?.[d.route_id]?.route_number === route), arrivals.glenWaverley, MIN_TRANSFER);
      if (bus) {
        const travel = BUS_TRAVEL_TIMES[route];
        const arr = new Date(bus.time.getTime() + travel * 60000);
        options.push({ station: 'Glen Waverley', trainArrival: arrivals.glenWaverley.toISOString(),
          bus: { route, departure: bus.time.toISOString(), travelTime: travel },
          arrivalAtMonash: arr.toISOString(), totalMinutes: Math.round((arr - new Date()) / 60000) });
      }
    }

    options.sort((a, b) => new Date(a.arrivalAtMonash) - new Date(b.arrivalAtMonash));

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      nextTrain: {
        atMountWaverley: arrivals.mountWaverley.toISOString(),
        atSyndal: arrivals.syndal.toISOString(),
        atGlenWaverley: arrivals.glenWaverley.toISOString(),
      },
      recommendation: options[0] || null,
      allOptions: options,
    });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Failed to fetch data', message: err.message });
  }
}
