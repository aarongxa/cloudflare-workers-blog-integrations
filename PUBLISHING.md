# Publishing This Repository to GitHub

This guide helps you publish this directory as a standalone public GitHub repository.

## Files Ready for Public Repo

The following files are safe to publish:
- `goodreads-worker.js` - Worker code (no secrets)
- `spotify-worker.js` - Worker code (no secrets)
- `wrangler-goodreads.toml.example` - Template config
- `wrangler-spotify.toml.example` - Template config
- `get-spotify-token.js.example` - Template token script
- `check-kv-writes.sh` - Monitoring script
- `package.json` - Dependencies
- `README.md` - Documentation
- `SETUP.md` - Quick start guide
- `LICENSE` - MIT License
- `.gitignore` - Git ignore rules

## Files That Are Gitignored (Protected)

These files contain your personal credentials and will NOT be committed:
- `wrangler-goodreads.toml` - Contains your KV namespace ID and user ID
- `wrangler-spotify.toml` - Contains your KV namespace ID and client ID
- `get-spotify-token.js` - Contains your Spotify client secret
- `node_modules/` - Dependencies (can be reinstalled)
- `.wrangler/` - Local build cache

## Steps to Publish

### 1. Initialize Git Repository

```bash
cd workers-cloudflare

# Initialize git repo
git init

# Verify .gitignore is working (should NOT show sensitive files)
git status
```

You should see the example files and worker code, but NOT the actual config files.

### 2. Create Initial Commit

```bash
# Add all safe files
git add .

# Verify what will be committed
git status

# Create initial commit
git commit -m "Initial commit: Cloudflare Workers for Goodreads and Spotify integrations"
```

### 3. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `cloudflare-workers-blog-integrations` (or your preferred name)
3. Description: "Cloudflare Workers for displaying Goodreads and Spotify data on your blog"
4. Set to **Public**
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

### 4. Push to GitHub

```bash
# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/cloudflare-workers-blog-integrations.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### 5. Verify Everything is Public

1. Visit your new repository on GitHub
2. Check that:
   - README.md is visible
   - LICENSE is visible
   - All worker code files are visible
   - Example config files (.example) are visible
   - Actual config files (wrangler-*.toml without .example) are NOT visible
   - get-spotify-token.js (without .example) is NOT visible

### 6. Update README Links

After publishing, update any links in README.md that reference your blog or GitHub:
- Update the "Live Example" link if needed
- Add the GitHub repository URL to the README

## Security Checklist

Before publishing, verify:

- [ ] No actual credentials in any committed files
- [ ] `.gitignore` includes all sensitive files
- [ ] Example files use placeholder values (YOUR_*, etc.)
- [ ] README explains users need to copy example files
- [ ] LICENSE file is included
- [ ] No personal KV namespace IDs or user IDs committed

## After Publishing

Once published, users can:

1. Clone your repository
2. Copy the `.example` files to create their own configs
3. Follow the setup guide in README.md
4. Use their own credentials

## Future Updates

When making changes:

```bash
# Make your changes
# ...

# Check what will be committed
git status

# Only commit safe files (sensitive files are auto-ignored)
git add .
git commit -m "Description of changes"
git push
```

The `.gitignore` will automatically prevent sensitive files from being committed.

