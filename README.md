# Mon-Commute - Melbourne Commute Dashboard

A mobile-friendly web app for commuting between home and Monash University via Melbourne's public transport network.

**Live app**: https://mon-commute.vercel.app

## Features

The app has three tabs:

### T - Train Departures
Shows the next Glen Waverley line trains departing from **Burnley Station** (outbound). Displays:
- Scheduled and real-time departure times
- Platform numbers
- Delay indicators (on time / +X mins late)

### S - Switch Advisor
Helps decide which station to get off at when traveling from Burnley to Monash University. Analyzes:
- **Mount Waverley** → 733 bus
- **Syndal** → 703 or 737 bus
- **Glen Waverley** → 742 or 737 bus

Recommends the option with the earliest arrival at Monash Clayton, accounting for a 3-minute transfer buffer.

### B - Bus Departures
Shows the next **733 buses** from **Woodside Ave/Clayton Rd** heading towards Mount Waverley (Box Hill direction).

## Smart Defaults

- **Morning (before 12pm)**: Opens to Train tab
- **Afternoon (12pm onwards)**: Opens to Bus tab

## How It Works

The app fetches real-time data from the PTV (Public Transport Victoria) Timetable API. When real-time tracking is available, you'll see actual predicted times; otherwise it falls back to scheduled times.

Data refreshes automatically every 30 seconds, and when you switch back to the app after it's been in the background.

## Setup

### 1. Get PTV API Credentials

To use the PTV Timetable API, you need a Developer ID and API Key.

- **API Documentation**: https://timetableapi.ptv.vic.gov.au/swagger/ui/index
- **Data Vic listing**: https://discover.data.vic.gov.au/dataset/ptv-timetable-api

Try emailing `APIKeyRequest@ptv.vic.gov.au` with:
- Your name and email
- Brief description of your intended use

You'll receive:
- **Developer ID** (devid) - a numeric ID
- **API Key** (key) - a UUID string

### 2. Deploy to Vercel

#### Option A: Deploy via GitHub

1. Create a GitHub repository and push this code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/mon-commute.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) and sign in with GitHub

3. Click "Import Project" and select your repository

4. Add environment variables:
   - `PTV_DEVID` = your developer ID
   - `PTV_KEY` = your API key

5. Click "Deploy"

#### Option B: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Add environment variables:
   ```bash
   vercel env add PTV_DEVID
   vercel env add PTV_KEY
   ```

4. Redeploy to pick up the environment variables:
   ```bash
   vercel --prod
   ```

### 3. Local Development

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your credentials

3. Run the local server:
   ```bash
   node server.mjs
   ```

4. Open http://localhost:3001

## Configuration

### Stop IDs

The app uses these PTV stop IDs:

| Location | Type | Stop ID | Name |
|----------|------|---------|------|
| Burnley | Train | 1030 | Burnley Station |
| Mount Waverley | Train | 1137 | Mount Waverley Station |
| Syndal | Train | 1190 | Syndal Station |
| Glen Waverley | Train | 1078 | Glen Waverley Station |
| Mount Waverley | Bus | 19051 | Mt Waverley SC/Stephensons Rd |
| Syndal | Bus | 16517 | Syndal Station/Blackburn Rd (703) |
| Syndal | Bus | 11385 | Syndal Station/Coleman Pde (737) |
| Glen Waverley | Bus | 11119 | Glen Waverley Station/Railway Pde |
| Clayton | Bus | 22752 | Woodside Ave/Clayton Rd |

### Bus Travel Times to Monash Clayton

| Route | From | Estimated Time |
|-------|------|----------------|
| 733 | Mount Waverley | ~17 mins |
| 703 | Syndal | ~13 mins |
| 737 | Syndal/Glen Waverley | ~15 mins |
| 742 | Glen Waverley | ~12 mins |

## Troubleshooting

### "PTV API credentials not configured"
Make sure you've added `PTV_DEVID` and `PTV_KEY` as environment variables in Vercel.

### No trains or buses showing
- The app filters for outbound trains on the Glen Waverley line (direction_id 6)
- Check that it's during operating hours (trains/buses may not run late at night)

### Stop IDs need updating
If bus stops have changed, update the stop IDs in `api/departures.js` and `api/switch.js`. You can find stop IDs using the PTV API:
- Search: `/v3/search/{term}?route_types=2`
- Stops on route: `/v3/stops/route/{route_id}/route_type/{route_type}`

## Files

```
├── index.html          # Frontend UI with tabbed interface
├── api/
│   ├── departures.js   # Train & bus departures API
│   └── switch.js       # Transfer advisor API
├── server.mjs          # Local development server
├── vercel.json         # Vercel routing configuration
├── package.json        # Project metadata
├── .env.example        # Environment variables template
└── .gitignore          # Git ignore rules
```

## API Endpoints

### GET /api/departures
Returns train departures from Burnley and bus departures from Woodside Ave/Clayton Rd.

### GET /api/switch
Returns transfer recommendations for traveling from Burnley to Monash Clayton, analyzing all station/bus combinations.

## License

MIT
