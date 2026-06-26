# Setup Guide

## Prerequisites

- Node.js 18+
- npm or yarn
- GitHub account
- Vercel account (free)
- Meta for Developers account (free)
- Instagram Business Account
- Facebook Page connected to Instagram

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

### Required Variables

#### `IG_PAGE_ACCESS_TOKEN`
1. Go to [Meta Developers](https://developers.facebook.com)
2. Create an app (Business type)
3. Add Instagram Graph API product
4. Generate page access token with these permissions:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_read_engagement`
5. Copy the token to `.env`

#### `IG_VERIFY_TOKEN`
Generate a random string (at least 16 characters):
```bash
openssl rand -base64 16
```

### Optional Variables

#### `GOOGLE_SHEETS_ID`
To use Google Sheets for keyword management:

1. Create a Google Sheet
2. Share it publicly (view-only)
3. Extract the sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
   ```
4. Add it to `.env`

The sheet should have columns:
- `keyword`: Keyword to match
- `message`: Message to send in DM
- `active`: true/false to enable/disable

## Webhook Configuration

1. In Meta Developer Dashboard:
   - Go to your app → Webhooks
   - Set webhook URL: `https://your-vercel-domain.vercel.app/api/webhook`
   - Callback verification token: (value of `IG_VERIFY_TOKEN`)

2. Subscribe to webhook fields:
   - `messages`
   - `messaging_postbacks`

3. In Instagram settings:
   - Allow webhook to receive messages

## Testing the Webhook

```bash
curl -X GET "http://localhost:3000/api/webhook?hub.verify_token=YOUR_TOKEN&hub.challenge=test_challenge"
```

Should return: `test_challenge`

## Local Development

```bash
npm run dev
```

The dev server runs on `http://localhost:3000`

## Deployment

```bash
npm run deploy
```

This pushes to Vercel production.
