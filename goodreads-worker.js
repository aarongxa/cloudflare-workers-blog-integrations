// Goodreads RSS Feed Worker
// Fetches currently reading books and caches them in KV

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Cache duration: 1 hour
const CACHE_TTL_MS = 3600000;

// Parse Goodreads RSS feed
function parseGoodreadsRSS(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  
  if (items.length === 0) {
    return { current: null, previous: null };
  }
  
  const books = items.map(item => {
    // Helper to extract field with or without CDATA
    const getField = (field) => {
      // Try CDATA format first: <field><![CDATA[value]]></field>
      let match = item.match(new RegExp(`<${field}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${field}>`));
      if (match) return match[1].trim();
      
      // Try without CDATA: <field>value</field>
      match = item.match(new RegExp(`<${field}>([^<]*)<\\/${field}>`));
      return match ? match[1].trim() : '';
    };
    
    return {
      title: getField('title'),
      author: getField('author_name'),
      cover: getField('book_large_image_url'),
      link: getField('link'),
    };
  });
  
  return {
    current: books[0] || null,
    previous: books[1] || null,
  };
}

// Check if the book has changed (comparing title + author)
function hasBookChanged(newBooks, existingBooks) {
  if (!existingBooks?.current) return true;
  if (!newBooks?.current) return false; // Don't treat null as a "change" - likely an error
  
  return newBooks.current.title !== existingBooks.current.title ||
         newBooks.current.author !== existingBooks.current.author;
}

// Fetch RSS feed from Goodreads
async function fetchGoodreadsRSS(userId) {
  const rssUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=currently-reading`;
  
  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodreadsWorker/1.0)',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Goodreads RSS returned ${response.status}`);
  }
  
  return response.text();
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    
    try {
      // Check cache first
      const cached = await env.GOODREADS_CACHE.get('books', 'json');
      const cacheValid = cached?.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_MS);
      
      if (cacheValid) {
        return new Response(JSON.stringify(cached.data), { headers: CORS_HEADERS });
      }
      
      // Fetch fresh data from Goodreads RSS
      const userId = env.GOODREADS_USER_ID;
      
      let books;
      try {
        const xml = await fetchGoodreadsRSS(userId);
        books = parseGoodreadsRSS(xml);
      } catch (fetchError) {
        // If fetch fails but we have cached data, return stale cache
        if (cached?.data) {
          console.log('Fetch failed, returning stale cache:', fetchError.message);
          return new Response(JSON.stringify(cached.data), { headers: CORS_HEADERS });
        }
        throw fetchError;
      }
      
      // Only write to KV if the actual book changed (title + author)
      // This prevents overwriting good data with null on temporary errors
      const existingBooks = cached?.data || null;
      const bookChanged = hasBookChanged(books, existingBooks);
      
      if (bookChanged) {
        const cacheData = {
          data: books,
          timestamp: Date.now(),
        };
        
        await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
        
        console.log('Goodreads cache updated - book changed', {
          old: existingBooks?.current?.title || 'none',
          new: books.current?.title || 'none',
        });
      } else if (!cached) {
        // No existing cache, save even if null
        const cacheData = {
          data: books,
          timestamp: Date.now(),
        };
        await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
        console.log('Goodreads cache initialized');
      } else {
        // Just update timestamp to extend cache TTL
        const cacheData = {
          data: existingBooks,
          timestamp: Date.now(),
        };
        await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
        console.log('Goodreads cache TTL extended, book unchanged');
      }
      
      return new Response(JSON.stringify(books), { headers: CORS_HEADERS });
      
    } catch (error) {
      console.error('Error in fetch handler:', error.message);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Goodreads data', message: error.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
  
  // Scheduled event to keep cache warm
  async scheduled(event, env, ctx) {
    try {
      const existingCache = await env.GOODREADS_CACHE.get('books', 'json');
      const existingBooks = existingCache?.data || null;
      
      const userId = env.GOODREADS_USER_ID;
      
      let xml;
      try {
        xml = await fetchGoodreadsRSS(userId);
      } catch (fetchError) {
        console.error('Scheduled fetch failed:', fetchError.message);
        // Don't update cache on fetch failure - keep existing data
        return;
      }
      
      const books = parseGoodreadsRSS(xml);
      
      // Only write to KV if the actual book changed
      const bookChanged = hasBookChanged(books, existingBooks);
      
      if (!bookChanged && existingBooks) {
        console.log('Scheduled: Book unchanged, skipping KV write', {
          title: books.current?.title,
        });
        return;
      }
      
      const cacheData = {
        data: books,
        timestamp: Date.now(),
      };
      
      await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
      
      console.log('Scheduled: Goodreads cache updated', {
        old: existingBooks?.current?.title || 'none',
        new: books.current?.title || 'none',
      });
    } catch (error) {
      console.error('Scheduled handler failed:', error);
    }
  },
};
