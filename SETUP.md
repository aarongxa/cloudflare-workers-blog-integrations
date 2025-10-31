# Quick Setup Guide

This guide helps you get started quickly. For detailed instructions, see [README.md](README.md).

## Prerequisites

- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`
- Node.js installed
- Goodreads account (public reading list)
- Spotify account

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/workers-cloudflare.git
cd workers-cloudflare
npm install
```

### 2. Create KV Namespaces

```bash
wrangler kv namespace create "GOODREADS_CACHE"
wrangler kv namespace create "SPOTIFY_CACHE"
```

Save the namespace IDs from the output.

### 3. Set Up Goodreads Worker

```bash
# Copy template
cp wrangler-goodreads.toml.example wrangler-goodreads.toml

# Edit wrangler-goodreads.toml:
# - Replace YOUR_GOODREADS_KV_NAMESPACE_ID
# - Replace YOUR_GOODREADS_USER_ID

# Deploy
wrangler deploy --config wrangler-goodreads.toml
```

### 4. Set Up Spotify Worker

```bash
# Copy templates
cp wrangler-spotify.toml.example wrangler-spotify.toml
cp get-spotify-token.js.example get-spotify-token.js

# Get Spotify credentials from https://developer.spotify.com/dashboard
# Edit get-spotify-token.js with your CLIENT_ID and CLIENT_SECRET

# Generate refresh token
node get-spotify-token.js
# Visit http://127.0.0.1:8888/login and copy the refresh token

# Edit wrangler-spotify.toml:
# - Replace YOUR_SPOTIFY_KV_NAMESPACE_ID
# - Replace YOUR_SPOTIFY_CLIENT_ID

# Set secrets
echo "YOUR_CLIENT_SECRET" | wrangler secret put SPOTIFY_CLIENT_SECRET --config wrangler-spotify.toml
echo "YOUR_REFRESH_TOKEN" | wrangler secret put SPOTIFY_REFRESH_TOKEN --config wrangler-spotify.toml

# Deploy
wrangler deploy --config wrangler-spotify.toml
```

### 5. Test Your Workers

```bash
# Test Goodreads
curl https://goodreads-api.YOUR_SUBDOMAIN.workers.dev

# Test Spotify
curl https://spotify-api.YOUR_SUBDOMAIN.workers.dev
```

### 6. Integrate with Your Website

Update your frontend JavaScript to use the worker endpoints:

```javascript
const GOODREADS_API = 'https://goodreads-api.YOUR_SUBDOMAIN.workers.dev';
const SPOTIFY_API = 'https://spotify-api.YOUR_SUBDOMAIN.workers.dev';
```

See the README.md for complete frontend integration examples.

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check the API response formats
- Set up monitoring with `wrangler tail`
- Customize the workers for your needs

## Troubleshooting

- **401 errors**: Check your credentials are correct
- **KV errors**: Verify namespace IDs match
- **CORS errors**: Workers include CORS headers by default
- **Need help?**: Open an issue on GitHub

