

// Spotify Now Playing Worker
// Fetches currently playing track and caches in KV

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
// Must include additional_types=episode to get podcast episodes
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode';
const RECENTLY_PLAYED_ENDPOINT = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';
const KV_KEY = 'current_track';
const KV_TTL = 300; // 300 seconds expiration
const SCHEDULE_INTERVAL = 120000; // 120 seconds (2 minutes) to match cron interval
const FETCH_CACHE_TTL = 30000; // 30 seconds cache for fetch handler

// Helper function for structured logging
function log(level, message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  
  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

// Get access token using refresh token
async function getAccessToken(env) {
  log('info', 'Fetching Spotify access token');
  
  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });
  
  if (!response.ok) {
    log('error', 'Failed to get access token', { status: response.status });
    throw new Error(`Failed to get access token: ${response.status}`);
  }
  
  log('info', 'Successfully obtained access token');
  return response.json();
}

// Fetch currently playing track
async function getNowPlaying(accessToken) {
  log('info', 'Fetching currently playing track from Spotify API');
  
  const response = await fetch(NOW_PLAYING_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (response.status === 204) {
    log('info', 'No track currently playing (204)');
    return null; // Nothing playing
  }
  
  if (response.status !== 200) {
    log('error', 'Spotify API error when fetching now playing', { status: response.status });
    throw new Error(`Spotify API error: ${response.status}`);
  }
  
  // Read response as text first so we can inspect it before parsing
  const responseText = await response.text();
  if (!responseText || responseText.trim() === '') {
    log('warn', 'API returned 200 but empty response body');
    return null;
  }
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    log('error', 'Failed to parse API response as JSON', {
      error: parseError.message,
      response_preview: responseText.substring(0, 200),
    });
    throw new Error('Invalid JSON response from Spotify API');
  }
  
  // Log the full response structure for debugging (including the raw JSON string)
  log('info', 'Raw Spotify API response', {
    hasItem: !!data.item,
    currently_playing_type: data.currently_playing_type,
    is_playing: data.is_playing,
    device: data.device?.name || data.device?.type,
    item_keys: data.item ? Object.keys(data.item) : null,
    item_type: data.item?.type,
    item_name: data.item?.name,
    item_show: !!data.item?.show,
    item_show_name: data.item?.show?.name,
    full_response_keys: Object.keys(data),
    raw_response_preview: JSON.stringify(data).substring(0, 500), // First 500 chars
  });
  
  if (!data.item) {
    log('warn', 'API returned 200 but no track item', {
      response_keys: Object.keys(data),
      currently_playing_type: data.currently_playing_type,
    });
    return null;
  }
  
  const item = data.item;
  // Use currently_playing_type from root level, fallback to item.type
  const currentlyPlayingType = data.currently_playing_type || item.type;
  const isEpisode = currentlyPlayingType === 'episode';
  
  // Log the raw structure for debugging
  log('info', 'Processing playback item', {
    currently_playing_type: data.currently_playing_type,
    item_type: item.type,
    isEpisode: isEpisode,
    hasShow: !!item.show,
    hasArtists: !!item.artists,
    showName: item.show?.name,
    artists: item.artists?.map(a => a.name),
  });
  
  // Handle both music tracks and podcast episodes
  let artist, album, albumArt;
  
  if (isEpisode) {
    // Podcast episode structure
    artist = item.show?.name || 'Unknown Podcast';
    album = item.show?.name || 'Unknown Show';
    // Episodes might have images directly or in show.images
    albumArt = item.images?.[0]?.url || 
               item.show?.images?.[0]?.url || 
               (item.show?.images && item.show.images.length > 0 
                 ? item.show.images[item.show.images.length - 1]?.url 
                 : '') || 
               '';
  } else {
    // Music track structure
    artist = item.artists && item.artists.length > 0
      ? item.artists.map(a => a.name).join(', ')
      : 'Unknown Artist';
    album = item.album?.name || 'Unknown Album';
    albumArt = item.album?.images?.[0]?.url || '';
  }
  
  const track = {
    isPlaying: data.is_playing,
    title: item.name || 'Unknown Title',
    artist: artist,
    album: album,
    albumArt: albumArt,
    songUrl: item.external_urls?.spotify || '',
    trackId: item.id, // For comparison
    type: currentlyPlayingType || 'track', // 'track' or 'episode'
  };
  
  log('info', 'Successfully fetched currently playing item', {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    isPlaying: track.isPlaying,
    type: track.type,
  });
  
  return track;
}

// Fetch recently played track
async function getRecentlyPlayed(accessToken) {
  log('info', 'Fetching recently played track from Spotify API');
  
  const response = await fetch(RECENTLY_PLAYED_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (response.status !== 200) {
    log('error', 'Failed to fetch recently played', { status: response.status });
    return null;
  }
  
  const data = await response.json();
  const item = data.items[0]?.track || data.items[0]?.episode; // Support both tracks and episodes
  
  if (!item) {
    log('warn', 'No recently played items found');
    return null;
  }
  
  const isEpisode = item.type === 'episode' || !item.artists; // Fallback detection
  
  const trackData = {
    isPlaying: false,
    title: item.name,
    artist: isEpisode
      ? (item.show?.name || 'Unknown Podcast')
      : (item.artists?.map(a => a.name).join(', ') || 'Unknown Artist'),
    album: isEpisode
      ? (item.show?.name || 'Unknown Show')
      : (item.album?.name || 'Unknown Album'),
    albumArt: isEpisode
      ? (item.images?.[0]?.url || item.show?.images?.[0]?.url || '')
      : (item.album?.images?.[0]?.url || ''),
    songUrl: item.external_urls?.spotify || '',
    trackId: item.id, // For comparison
    type: item.type || (isEpisode ? 'episode' : 'track'),
  };
  
  log('info', 'Successfully fetched recently played item', {
    trackId: trackData.trackId,
    title: trackData.title,
    artist: trackData.artist,
    type: trackData.type,
  });
  
  return trackData;
}

// Compare two track objects for equality
function tracksEqual(track1, track2) {
  if (!track1 && !track2) return true;
  if (!track1 || !track2) return false;
  
  // Use trackId for reliable comparison if available
  if (track1.trackId && track2.trackId) {
    return track1.trackId === track2.trackId && 
           track1.isPlaying === track2.isPlaying;
  }
  
  // Fallback to JSON comparison
  return JSON.stringify(track1) === JSON.stringify(track2);
}

export default {
  async fetch(request, env) {
    log('info', 'Received fetch request', {
      method: request.method,
      url: request.url,
    });
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      log('info', 'Handling CORS preflight request');
      return new Response(null, { headers: CORS_HEADERS });
    }
    
    try {
      // Check cache first (cache for 30 seconds)
      const cached = await env.MY_KV_NAMESPACE.get(KV_KEY, 'json');
      if (cached && cached.timestamp && Date.now() - cached.timestamp < FETCH_CACHE_TTL) {
        const age = Date.now() - cached.timestamp;
        log('info', 'Returning cached track data', {
          ageMs: age,
          trackId: cached.data?.trackId,
        });
        return new Response(JSON.stringify(cached.data), { headers: CORS_HEADERS });
      }
      
      log('info', 'Cache expired or missing, fetching fresh data');
      
      // Get fresh access token
      const { access_token } = await getAccessToken(env);
      
      // Try to get currently playing
      let track = await getNowPlaying(access_token);
      
      // If nothing playing, get recently played
      if (!track) {
        log('info', 'No currently playing track, fetching recently played');
        track = await getRecentlyPlayed(access_token);
      }
      
      // Only write to KV if track changed (reduces unnecessary writes)
      const existingTrack = cached?.data || null;
      if (!tracksEqual(track, existingTrack)) {
        const cacheData = {
          data: track,
          timestamp: Date.now(),
          lastRun: Date.now(), // Include lastRun for scheduled handler
        };
        
        await env.MY_KV_NAMESPACE.put(KV_KEY, JSON.stringify(cacheData), {
          expirationTtl: KV_TTL,
        });
        
        log('info', 'Cached track data via fetch handler', {
          trackId: track?.trackId,
          ttl: KV_TTL,
          changed: true,
        });
      } else {
        log('info', 'Track unchanged in fetch handler, skipping KV write', {
          trackId: track?.trackId,
        });
      }
      
      return new Response(JSON.stringify(track), { headers: CORS_HEADERS });
      
    } catch (error) {
      log('error', 'Error in fetch handler', {
        error: error.message,
        stack: error.stack,
      });
      
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Spotify data', message: error.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
  
  // Scheduled event to refresh track data every 2 minutes (120 seconds)
  // Cron runs every 2 minutes (*/2 * * * *) and we enforce 120-second intervals via timestamp check
  async scheduled(event, env, ctx) {
    log('info', 'Scheduled handler triggered', {
      cron: event.cron,
      scheduledTime: event.scheduledTime,
    });
    
    try {
      // Read existing track data from KV (contains lastRun timestamp)
      const existingData = await env.MY_KV_NAMESPACE.get(KV_KEY, 'json');
      const now = Date.now();
      
      // Check if we should run (enforce 90-second interval using lastRun from cache)
      const lastRun = existingData?.lastRun;
      if (lastRun) {
        const timeSinceLastRun = now - lastRun;
        if (timeSinceLastRun < SCHEDULE_INTERVAL) {
          // Skip this run, too soon
          log('info', 'Skipping scheduled run - interval not reached', {
            timeSinceLastRunMs: timeSinceLastRun,
            requiredIntervalMs: SCHEDULE_INTERVAL,
          });
          return;
        }
      }
      
      log('info', 'Proceeding with scheduled run');
      
      const existingTrack = existingData?.data || null;
      
      if (existingTrack) {
        log('info', 'Found existing track in KV', {
          trackId: existingTrack.trackId,
          title: existingTrack.title,
          isPlaying: existingTrack.isPlaying,
        });
      } else {
        log('info', 'No existing track data in KV');
      }
      
      // Get fresh access token
      const { access_token } = await getAccessToken(env);
      
      // Fetch latest currently playing track
      let newTrack = null;
      try {
        newTrack = await getNowPlaying(access_token);
        
        // If nothing playing, always check recently played to get the latest track
        // This ensures we update when a new track starts even if it's not currently "playing"
        if (!newTrack) {
          log('info', 'No track currently playing, fetching recently played track');
          const recentlyPlayed = await getRecentlyPlayed(access_token);
          
          // Use recently played if available, otherwise keep existing (if exists)
          if (recentlyPlayed) {
            newTrack = recentlyPlayed;
            log('info', 'Using recently played track', {
              trackId: newTrack.trackId,
              title: newTrack.title,
            });
          } else if (existingTrack) {
            // No recently played and nothing currently playing, keep existing
            // Only update lastRun timestamp if track changed or if we need to track runs
            log('info', 'No recently played track found, keeping existing track data', {
              existingTrackId: existingTrack.trackId,
            });
            // Skip write - track unchanged, no KV write needed
            return;
          } else {
            // No data at all
            log('info', 'No track data available (no current, no recently played, no existing)');
            // Skip write - no data to store
            return;
          }
        }
      } catch (apiError) {
        // API failure - log and skip write (no KV operations to avoid hitting limits)
        log('error', 'Spotify API error in scheduled handler', {
          error: apiError.message,
          stack: apiError.stack,
          existingTrackAvailable: !!existingTrack,
        });
        // Don't write anything - skip to avoid KV writes on errors
        return;
      }
      
      // Compare new track with stored track
      if (tracksEqual(newTrack, existingTrack)) {
        // Track hasn't changed, skip write to minimize KV operations
        log('info', 'Track unchanged, skipping KV write', {
          trackId: newTrack?.trackId,
          title: newTrack?.title,
        });
        // No KV write needed - track unchanged
        return;
      }
      
      // Track changed or no data existed - write to KV (only write when data changes)
      const cacheData = {
        data: newTrack,
        timestamp: now,
        lastRun: now, // Include lastRun timestamp in same write
      };
      
      await env.MY_KV_NAMESPACE.put(KV_KEY, JSON.stringify(cacheData), {
        expirationTtl: KV_TTL,
      });
      
      const changeInfo = existingTrack ? {
        oldTrackId: existingTrack.trackId,
        oldTitle: existingTrack.title,
        newTrackId: newTrack?.trackId,
        newTitle: newTrack?.title,
        wasPlaying: existingTrack.isPlaying,
        isNowPlaying: newTrack?.isPlaying,
      } : {
        action: 'initial_write',
        newTrackId: newTrack?.trackId,
        newTitle: newTrack?.title,
      };
      
      log('info', 'Spotify cache updated via scheduled handler', {
        ...changeInfo,
        ttl: KV_TTL,
      });
    } catch (error) {
      log('error', 'Failed to update Spotify cache in scheduled handler', {
        error: error.message,
        stack: error.stack,
      });
      // Don't throw - scheduled handlers should not throw errors
    }
  },
};

