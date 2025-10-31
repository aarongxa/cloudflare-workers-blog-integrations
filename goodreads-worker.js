// Goodreads RSS Feed Worker
// Fetches currently reading books and caches them in KV

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Parse Goodreads RSS feed
async function parseGoodreadsRSS(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  
  if (items.length === 0) {
    return { current: null };
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
    
    const title = getField('title');
    const author = getField('author_name');
    const cover = getField('book_large_image_url');
    const link = getField('link');
    
    return {
      title,
      author,
      cover,
      link,
    };
  });
  
  // Return only the first book (most recently added to currently-reading)
  return {
    current: books[0] || null,
  };
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    
    try {
      // Check cache first (cache for 1 hour)
      const cached = await env.GOODREADS_CACHE.get('books', 'json');
      if (cached && cached.timestamp && Date.now() - cached.timestamp < 3600000) {
        return new Response(JSON.stringify(cached.data), { headers: CORS_HEADERS });
      }
      
      // Fetch fresh data from Goodreads RSS
      const userId = env.GOODREADS_USER_ID;
      const rssUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=currently-reading`;
      
      const response = await fetch(rssUrl);
      const xml = await response.text();
      
      const books = await parseGoodreadsRSS(xml);
      
      // Only write to KV if the actual book changed (title + author)
      const existingBooks = cached?.data || null;
      const bookChanged = !existingBooks?.current || 
                          books.current?.title !== existingBooks?.current?.title ||
                          books.current?.author !== existingBooks?.current?.author;
      
      if (bookChanged || !existingBooks) {
        // Cache the result only if book changed or no cache exists
        const cacheData = {
          data: books,
          timestamp: Date.now(),
        };
        
        await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
        
        console.log('Goodreads cache updated via fetch - book changed', {
          oldBook: existingBooks?.current?.title || 'none',
          newBook: books.current?.title || 'none',
        });
      } else {
        console.log('Goodreads book unchanged in fetch, skipping KV write');
      }
      
      return new Response(JSON.stringify(books), { headers: CORS_HEADERS });
      
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Goodreads data', message: error.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
  
  // Scheduled event to keep cache warm
  async scheduled(event, env, ctx) {
    try {
      // Get existing cached data to compare
      const existingCache = await env.GOODREADS_CACHE.get('books', 'json');
      const existingBooks = existingCache?.data || null;
      
      const userId = env.GOODREADS_USER_ID;
      const rssUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=currently-reading`;
      
      const response = await fetch(rssUrl);
      const xml = await response.text();
      
      const books = await parseGoodreadsRSS(xml);
      
      // Only write to KV if the actual BOOK changed (title + author comparison)
      // This ignores changes in cover URLs, links, or other metadata
      const bookChanged = !existingBooks?.current || 
                          books.current?.title !== existingBooks.current?.title ||
                          books.current?.author !== existingBooks.current?.author;
      
      if (!bookChanged && existingBooks) {
        console.log('Goodreads book unchanged (same title/author), skipping KV write', {
          title: books.current?.title,
          author: books.current?.author,
        });
        return;
      }
      
      const cacheData = {
        data: books,
        timestamp: Date.now(),
      };
      
      await env.GOODREADS_CACHE.put('books', JSON.stringify(cacheData));
      
      console.log('Goodreads cache updated via cron - book changed', {
        oldBook: existingBooks?.current?.title || 'none',
        newBook: books.current?.title || 'none',
        author: books.current?.author,
      });
    } catch (error) {
      console.error('Failed to update Goodreads cache:', error);
    }
  },
};

