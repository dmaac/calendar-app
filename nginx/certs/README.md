# SSL Certificates

Place your SSL certificates here:

- `fullchain.pem` — Full certificate chain
- `privkey.pem` — Private key

## Using Let's Encrypt (recommended)

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d api.fitsiai.app

# Copy to this directory
sudo cp /etc/letsencrypt/live/api.fitsiai.app/fullchain.pem ./fullchain.pem
sudo cp /etc/letsencrypt/live/api.fitsiai.app/privkey.pem ./privkey.pem
```

## For local development / testing

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=localhost"
```

**IMPORTANT**: Never commit real certificates to version control.
