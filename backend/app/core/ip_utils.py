"""Secure client IP extraction with trusted proxy validation.

SEC: Centralised utility so all IP-dependent features (rate limiting, audit
logging, brute-force protection) use the same trustworthy extraction logic.

Rules:
 1. If TRUSTED_PROXY_IPS is configured and the direct connection IP matches,
    use the **rightmost** IP in X-Forwarded-For (the one appended by our trusted
    proxy). This is secure because only the rightmost entry was added by infra
    we control — earlier entries can be spoofed by the client.
 2. If the direct connection IP is NOT a trusted proxy, ignore X-Forwarded-For
    entirely and return the direct connection IP (request.client.host).
 3. If TRUSTED_PROXY_IPS is empty (not configured), always use
    request.client.host to avoid any X-Forwarded-For spoofing.
"""
import ipaddress
import logging
from typing import Optional, Sequence

from fastapi import Request

logger = logging.getLogger(__name__)

_trusted_networks: Optional[list[ipaddress.IPv4Network | ipaddress.IPv6Network]] = None


def _get_trusted_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    """Parse and cache the trusted proxy list from settings."""
    global _trusted_networks
    if _trusted_networks is not None:
        return _trusted_networks

    from app.core.config import settings

    networks = []
    for entry in settings.trusted_proxy_ips:
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning("Invalid trusted proxy IP/CIDR ignored: %s", entry)
    _trusted_networks = networks
    return _trusted_networks


def _is_trusted_proxy(ip_str: str) -> bool:
    """Check if the given IP matches any configured trusted proxy."""
    networks = _get_trusted_networks()
    if not networks:
        return False
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in networks)
    except ValueError:
        return False


def get_client_ip(request: Request) -> str:
    """Extract the real client IP from the request, safely.

    Only trusts X-Forwarded-For when the direct peer is a known proxy.
    When trusted, uses the **rightmost** IP (appended by our proxy).
    """
    direct_ip = request.client.host if request.client else "unknown"

    if direct_ip == "unknown":
        return direct_ip

    # Only consider X-Forwarded-For if the direct connection comes from
    # a trusted proxy (load balancer, CDN, etc.)
    if _is_trusted_proxy(direct_ip):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Use the rightmost IP — the one added by our trusted proxy.
            # Earlier IPs in the chain could be spoofed by the client.
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[-1]

    return direct_ip
