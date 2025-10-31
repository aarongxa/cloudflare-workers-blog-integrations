# Cloudflare Workers for Blog Integrations

Display your currently reading book from Goodreads and your currently playing Spotify track on your blog or website. These Cloudflare Workers handle the API calls, caching, and data formatting so your frontend stays fast and simple.

## What This Does

This project provides two serverless workers that run on Cloudflare's edge network:

**Goodreads Worker** - Shows what book you're currently reading
- Fetches data from your Goodreads RSS feed every 30 minutes
- Caches the results in Cloudflare KV storage
- Only updates when you start reading a different book
- Returns JSON with book title, author, cover image, and Goodreads link

**Spotify Worker** - Shows what music you're currently listening to
- Connects to the Spotify API every 2 minutes
- Displays currently playing track (or last played if nothing is active)
- Supports both music tracks and podcast episodes
- Returns JSON with track title, artist, album art, and Spotify link

Both workers use smart caching to minimize API calls and stay within Cloudflare's free tier limits (1,000 KV writes/day). They only write to storage when your data actually changes.

## Live Example

You can see these workers in action on my blog: [aarongxa.com](https://aarongxa.com)

The sidebar shows my current Spotify track with a live equalizer animation when music is playing, and displays the book I'm currently reading from Goodreads.

## Why Use Cloudflare Workers?

Instead of making API calls directly from your frontend JavaScript:
- **Faster page loads** - Your blog doesn't wait for external APIs
- **Better caching** - Data is cached at the edge, close to your visitors
- **Hide API credentials** - Secrets stay server-side, not exposed in client code
- **Free tier friendly** - Smart caching keeps you within limits
- **Always available** - Even if Goodreads or Spotify have issues, cached data serves

## Prerequisites

Before you start, you'll need:

1. **Cloudflare account** - Free tier works perfectly
2. **Wrangler CLI** installed - `npm install -g wrangler`
3. **Goodreads account** with a reading list
4. **Spotify account** (Premium not required)
5. **Node.js** installed for the Spotify token script

## Setup Guide

### Step 1: Create KV Namespaces

Cloudflare KV (Key-Value) storage holds your cached data. Create two namespaces:

```bash
cd workers-cloudflare
wrangler kv namespace create "GOODREADS_CACHE"
wrangler kv namespace create "SPOTIFY_CACHE"
```

You'll get back namespace IDs. Save these - you'll need them in the next steps.

Example output:
```
{ binding = "GOODREADS_CACHE", id = "abc123..." }
{ binding = "SPOTIFY_CACHE", id = "xyz789..." }
```

### Step 2: Deploy the Goodreads Worker

The Goodreads worker is simpler because it just reads from your public RSS feed.

1. **Copy the example config file:**
   ```bash
   cp wrangler-goodreads.toml.example wrangler-goodreads.toml
   ```

2. **Update `wrangler-goodreads.toml`:**
   - Replace `YOUR_GOODREADS_KV_NAMESPACE_ID` with the KV namespace ID from step 1
   - Replace `YOUR_GOODREADS_USER_ID` with your Goodreads user ID
     - Find it in your profile URL: `https://www.goodreads.com/user/show/YOUR_ID`

3. **Deploy:**
   ```bash
   wrangler deploy --config wrangler-goodreads.toml
   ```

4. **Test it:**
   ```bash
   curl https://goodreads-api.YOUR_SUBDOMAIN.workers.dev
   ```

You should see JSON with your current book details.

### Step 3: Set Up the Spotify Worker

Spotify requires OAuth authentication, which means a few more steps.

#### Get Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create an App"
4. Give it a name (like "My Blog Integration")
5. Set the Redirect URI to: `http://127.0.0.1:8888/callback`
   - Important: Use `127.0.0.1`, not `localhost`
6. Save and copy your Client ID and Client Secret

#### Generate a Refresh Token

Spotify access tokens expire after an hour. A refresh token lets your worker get new access tokens automatically.

1. **Copy the example token script:**
   ```bash
   cp get-spotify-token.js.example get-spotify-token.js
   ```

2. **Install dependencies:**
   ```bash
   npm install express request
   ```

3. **Update `get-spotify-token.js`:**
   - Replace `YOUR_SPOTIFY_CLIENT_ID` with your Spotify Client ID
   - Replace `YOUR_SPOTIFY_CLIENT_SECRET` with your Spotify Client Secret

4. **Run the token script:**
   ```bash
   node get-spotify-token.js
   ```

5. **Authorize the app:**
   - Open `http://localhost:8888/login` in your browser
   - Log in to Spotify and authorize the app
   - You'll see a page with your refresh token - copy it

#### Deploy the Spotify Worker

1. **Copy the example config file:**
   ```bash
   cp wrangler-spotify.toml.example wrangler-spotify.toml
   ```

2. **Update `wrangler-spotify.toml`:**
   - Replace `YOUR_SPOTIFY_KV_NAMESPACE_ID` with the Spotify KV namespace ID from step 1
   - Replace `YOUR_SPOTIFY_CLIENT_ID` with your Spotify Client ID

3. **Set secrets** (these stay encrypted on Cloudflare):
   ```bash
   echo "YOUR_CLIENT_SECRET" | wrangler secret put SPOTIFY_CLIENT_SECRET --config wrangler-spotify.toml
   echo "YOUR_REFRESH_TOKEN" | wrangler secret put SPOTIFY_REFRESH_TOKEN --config wrangler-spotify.toml
   ```

4. **Deploy:**
   ```bash
   wrangler deploy --config wrangler-spotify.toml
   ```

5. **Test it:**
   ```bash
   curl https://spotify-api.YOUR_SUBDOMAIN.workers.dev
   ```

If you're listening to music, you'll see JSON with the track details.

### Step 4: Connect to Your Frontend

Update your website's JavaScript to use your new worker endpoints.

**Example for Goodreads (JavaScript):**
```javascript
const GOODREADS_API_ENDPOINT = 'https://goodreads-api.YOUR_SUBDOMAIN.workers.dev';

async function fetchCurrentBook() {
  const response = await fetch(GOODREADS_API_ENDPOINT);
  const book = await response.json();
  
  // Display book.title, book.author, book.imageUrl, etc.
  document.getElementById('current-book').innerHTML = `
    <a href="${book.link}">
      <img src="${book.imageUrl}" alt="${book.title}">
      <p>${book.title} by ${book.author}</p>
    </a>
  `;
}
```

**Example for Spotify (JavaScript):**
```javascript
const SPOTIFY_API_ENDPOINT = 'https://spotify-api.YOUR_SUBDOMAIN.workers.dev';

async function fetchNowPlaying() {
  const response = await fetch(SPOTIFY_API_ENDPOINT);
  const track = await response.json();
  
  if (track && track.isPlaying) {
    document.getElementById('now-playing').innerHTML = `
      <img src="${track.albumArt}" alt="${track.title}">
      <p>🎵 ${track.title} by ${track.artist}</p>
    `;
  }
}

// Refresh every 30 seconds
setInterval(fetchNowPlaying, 30000);
```

## Project Structure

```
workers-cloudflare/
├── goodreads-worker.js              # Goodreads integration worker
├── spotify-worker.js                # Spotify integration worker
├── wrangler-goodreads.toml.example  # Template for Goodreads config
├── wrangler-spotify.toml.example    # Template for Spotify config
├── get-spotify-token.js.example     # Template for Spotify token helper
├── check-kv-writes.sh               # Optional: Script to monitor KV writes
├── package.json                     # Node dependencies for token script
├── .gitignore                       # Git ignore rules
├── LICENSE                          # MIT License
└── README.md                        # This file
```

**Important:** Copy the `.example` files before use:
- `cp wrangler-goodreads.toml.example wrangler-goodreads.toml`
- `cp wrangler-spotify.toml.example wrangler-spotify.toml`
- `cp get-spotify-token.js.example get-spotify-token.js`

The actual config files are gitignored to keep your credentials safe.

## How the Caching Works

Both workers use the same smart caching pattern:

1. **Check the cache first** - If data was fetched recently, return it immediately
2. **Fetch fresh data** - Call the Goodreads or Spotify API
3. **Compare with cached data** - Check if anything actually changed
4. **Write only if different** - Skip the KV write if data is the same
5. **Log the decision** - Track what happened for monitoring

This pattern keeps KV writes low while still providing up-to-date data.

### Goodreads Caching
- Updates every 30 minutes (48 checks per day)
- Only writes when book title or author changes
- Ignores metadata like cover URLs or ratings
- Typical writes: 1-2 per week (when you finish a book)

### Spotify Caching
- Updates every 2 minutes (720 checks per day)
- Writes when track changes or playback state changes (play/pause)
- Compares track ID and playing status
- Typical writes: 200-300 per day (depending on listening habits)

## API Response Format

### Goodreads Worker Response

```json
{
  "title": "Project Hail Mary",
  "author": "Andy Weir",
  "imageUrl": "https://images.gr-assets.com/books/...",
  "link": "https://www.goodreads.com/book/show/...",
  "rating": 5,
  "dateAdded": "2025-10-15"
}
```

Returns `null` if no currently reading book is found.

### Spotify Worker Response

```json
{
  "isPlaying": true,
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "album": "A Night at the Opera",
  "albumArt": "https://i.scdn.co/image/...",
  "songUrl": "https://open.spotify.com/track/...",
  "trackId": "4u7EnebtmKWzUH433cf5Qv",
  "type": "track"
}
```

The `type` field can be `"track"` (music) or `"episode"` (podcast).

## Monitoring and Debugging

### Check Worker Logs

Watch live logs as your workers run:

```bash
# Goodreads worker
wrangler tail goodreads-api

# Spotify worker  
wrangler tail spotify-api
```

### View KV Usage

Monitor your KV operations in the Cloudflare dashboard:
1. Go to Workers & Pages
2. Click on your worker name
3. Go to the Analytics tab
4. Scroll to KV Operations

You'll see read/write counts and can verify you're staying within limits.

### Common Log Messages

**Good signs (expected behavior):**
- `"Book unchanged (same title/author), skipping KV write"` - Caching working
- `"Track unchanged, skipping KV write"` - No new music, cache reused
- `"Successfully fetched currently reading book"` - Fresh data obtained

**Things to investigate:**
- `"Failed to parse Goodreads RSS feed"` - Check RSS feed URL
- `"Failed to get access token"` - Spotify refresh token might be expired
- `"KV put() limit exceeded"` - Too many writes, check cache logic

## Troubleshooting

### Goodreads Issues

**Problem:** Worker returns `null` but I'm reading a book
- Check that your "Currently Reading" shelf is public on Goodreads
- Verify the RSS feed URL includes your correct user ID
- Make sure you've marked a book as "currently-reading"

**Problem:** Book cover images don't load
- Goodreads cover URLs can change - this is normal
- The worker will pick up new URLs on the next update (30 minutes)

### Spotify Issues

**Problem:** 401 Unauthorized error
- Your refresh token expired - generate a new one
- Check that Client ID matches between token script and worker
- Verify secrets were set correctly with `wrangler secret list`

**Problem:** Always shows last played, never "now playing"
- Make sure Spotify is actively playing (not paused)
- Check that your Spotify account has activity
- The worker checks every 2 minutes, so there's a short delay

**Problem:** CORS errors in browser
- Workers include CORS headers by default
- Check browser console for specific error
- Verify worker URL is correct in your JavaScript

## Cost and Limits

These workers run entirely on Cloudflare's free tier:

| Resource | Free Tier Limit | Typical Usage | Headroom |
|----------|-----------------|---------------|----------|
| Requests | 100,000/day | ~1,000/day | 99% free |
| KV Writes | 1,000/day | ~220/day | 78% free |
| KV Reads | 100,000/day | ~2,000/day | 98% free |
| CPU Time | 10ms/request | ~2ms average | 80% free |

The smart caching logic keeps you well within limits, even if your blog gets significant traffic.

## Customization Ideas

Once you have the basics working, you can extend these workers:

- **Historical tracking** - Store your reading history in KV
- **Multiple books** - Show your "Want to Read" list
- **Listening statistics** - Track your most-played artists
- **Podcast support** - The Spotify worker already handles podcasts
- **Social sharing** - Generate preview images of what you're reading/listening to
- **Webhooks** - Notify other services when you start a new book or track

## Security Notes

- **Never commit secrets** - Use `wrangler secret put` for API credentials
- **Keep tokens secure** - Refresh tokens are sensitive, treat them like passwords
- **Public RSS feeds** - The Goodreads worker only works with public reading lists
- **CORS is open** - Workers allow all origins by default (fine for public data)

## Updates and Maintenance

### Updating Workers

Made changes to the code? Deploy updates:

```bash
# Deploy updated worker
wrangler deploy --config wrangler-spotify.toml

# Watch logs to verify
wrangler tail spotify-api
```

### Rotating Spotify Credentials

If you need to regenerate your Spotify refresh token:

1. Run `get-spotify-token.js` again to get a new token
2. Update the secret: `echo "NEW_TOKEN" | wrangler secret put SPOTIFY_REFRESH_TOKEN --config wrangler-spotify.toml`
3. The worker will use the new token on the next request

### Monitoring for Issues

Set up monitoring to catch problems early:
- Check Cloudflare email notifications for worker errors
- Review KV usage weekly to catch any spikes
- Watch for increased response times in analytics

## Contributing

Found a bug or have an improvement? Contributions are welcome:

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Test with your own Cloudflare account
5. Submit a pull request

## License

This project is open source and available under the MIT License. Feel free to use it, modify it, or learn from it for your own projects.

## Questions or Issues?

- **Workers not deploying?** Check the [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- **Spotify auth problems?** See [Spotify API documentation](https://developer.spotify.com/documentation/web-api)
- **Found a bug?** Open an issue on GitHub

## Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless platform
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) - Music data
- [Goodreads RSS](https://www.goodreads.com/api) - Reading data

Inspired by the desire to share what I'm reading and listening to without slowing down my blog or exposing API credentials.
