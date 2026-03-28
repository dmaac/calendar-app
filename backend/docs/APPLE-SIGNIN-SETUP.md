# Apple Sign In Configuration Guide

This guide explains how to obtain and configure Apple Sign In credentials for Fitsi IA.

## Overview

Apple Sign In requires 4 credentials:
- **APPLE_CLIENT_ID**: Your app's Bundle ID (e.g., `com.fitsi.app`)
- **APPLE_TEAM_ID**: Your Apple Developer Team ID (10-character alphanumeric)
- **APPLE_KEY_ID**: Your Key ID from the private key you create
- **APPLE_PRIVATE_KEY**: The EC P-8 private key in PEM format

## Step-by-Step Setup

### 1. Get Your Team ID

1. Go to [Apple Developer Account](https://developer.apple.com/account)
2. Click "Membership" in the left sidebar
3. Copy your **Team ID** (10 characters, e.g., `ABC1234567`)

### 2. Create a Service ID

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
2. Click the **+** button to create a new identifier
3. Select **Services IDs** and click **Continue**
4. Fill in:
   - **Description**: "Fitsi IA API"
   - **Identifier (Bundle ID)**: `com.fitsi.app` (must match your app's Bundle ID)
5. Check **Sign In with Apple**
6. Click **Continue** → **Register**

### 3. Create a Private Key

1. Go to [Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click the **+** button
3. Select **Sign in with Apple** and click **Continue**
4. Fill in **Key Name**: "Fitsi Backend Key"
5. Click **Register**
6. **Download the key file** (`.p8`) — this is your **APPLE_PRIVATE_KEY**
7. Note the **Key ID** displayed on the page

### 4. Extract Key ID

The Key ID is shown in the list after download. Save it (8 characters, e.g., `ABC1234D7`).

### 5. Format the Private Key

1. Open the downloaded `.p8` file in a text editor
2. Copy the entire content (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
3. This is your `APPLE_PRIVATE_KEY` value

### 6. Update `.env`

In `backend/.env`, set:

```bash
APPLE_CLIENT_ID=com.fitsi.app
APPLE_TEAM_ID=ABC1234567
APPLE_KEY_ID=ABC1234D7
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgYxl...
-----END PRIVATE KEY-----
```

**Important**:
- The private key must be on **one line** in `.env` (use `\n` for newlines) or in a multiline string
- Never commit the actual key to git — add `.env` to `.gitignore`

## Verification

### Test Apple Token Verification

```bash
# In the backend repo:
python3 -c "
from app.core.config import settings
from app.services.oauth_service import verify_apple_token
import asyncio

async def test():
    # This will fail with 'Invalid token' (expected, since we don't have a real token)
    result = await verify_apple_token('test_token')
    if result is None:
        print('✅ Apple OAuth service initialized correctly')
    else:
        print('❌ Unexpected result')

asyncio.run(test())
"
```

### Test Backend Startup

```bash
cd backend
python3 -c "from app.main import app; print('✅ Backend starts successfully')"
```

## Troubleshooting

### Error: "aud claim does not match..."
- Ensure `APPLE_CLIENT_ID` matches your Service ID (Bundle ID)
- The client ID must be the **Service ID**, not the App ID

### Error: "Invalid key format"
- Ensure the private key is a valid EC P-8 key (should start with `-----BEGIN PRIVATE KEY-----`)
- Check that newlines are properly escaped if stored in `.env`

### Error: "KeyError: apple_client_id"
- Verify `.env` file has `APPLE_CLIENT_ID=...` set
- Restart the backend after updating `.env`

## Security Best Practices

1. **Never commit private keys** — use `.env` and add to `.gitignore`
2. **Rotate keys periodically** — create new keys in Apple Developer Account and retire old ones
3. **Restrict key access** — only share `.env` securely (use HashiCorp Vault, AWS Secrets Manager, or Supabase Secrets in production)
4. **Monitor key usage** — check Apple Developer Account activity logs for unusual access

## Backend Integration

### How it Works

1. **Mobile app** calls Apple Sign In, receives `identity_token` (a JWT signed by Apple)
2. **Mobile app** sends `identity_token` to `POST /api/auth/apple` with optional name
3. **Backend** verifies the JWT:
   - Fetches Apple's public JWKS from `https://appleid.apple.com/auth/keys`
   - Validates signature and claims (exp, aud)
   - Extracts `sub` (unique Apple user ID)
4. **Backend** creates or updates user record in database
5. **Backend** returns access token + refresh token

### Rate Limiting

The `/api/auth/apple` endpoint is rate-limited to **10 requests per minute** per IP address to prevent brute-force attacks.

### Testing

Run the verification script:

```bash
cd backend
python3 scripts/test_apple_oauth.py
```

This will check:
- Configuration is set
- Backend can initialize OAuth services
- Database is accessible
- Apple auth endpoint is registered

## References

- [Apple Developer: Sign In with Apple](https://developer.apple.com/sign-in-with-apple/)
- [Apple Sign In with HTTP/Web Flows](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js)
- [JWT Validation](https://developer.apple.com/documentation/sign_in_with_apple/fetch_apple_s_public_key_for_verifying_token_signature)
- [JWKS Best Practices](https://tools.ietf.org/html/rfc7517)
