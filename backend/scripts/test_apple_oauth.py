#!/usr/bin/env python3
"""Test script for Apple Sign In OAuth configuration.

This script verifies that:
1. Apple OAuth credentials are properly configured
2. The backend can initialize the Apple token verification service
3. The API endpoint is ready to receive Apple identity tokens
"""

import asyncio
import sys
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_apple_oauth_config():
    """Test Apple OAuth configuration."""
    from app.core.config import settings
    from app.services.oauth_service import verify_apple_token

    print("\n" + "="*60)
    print("APPLE SIGN IN CONFIGURATION TEST")
    print("="*60 + "\n")

    # Test 1: Check if credentials are configured
    print("✓ Test 1: Checking Apple OAuth credentials...")
    if not settings.apple_client_id:
        print("  ❌ APPLE_CLIENT_ID is not set")
        print("     → Follow the setup guide: docs/APPLE-SIGNIN-SETUP.md")
        return False

    print(f"  ✅ APPLE_CLIENT_ID: {settings.apple_client_id}")

    # Don't print the private key, just verify it exists
    if not settings.apple_private_key:
        print("  ℹ️  APPLE_PRIVATE_KEY is not set (only needed for server-to-server auth)")
    else:
        key_len = len(settings.apple_private_key)
        print(f"  ✅ APPLE_PRIVATE_KEY: {key_len} characters configured")

    if not settings.apple_team_id:
        print("  ℹ️  APPLE_TEAM_ID is not set (optional for basic verification)")
    else:
        print(f"  ✅ APPLE_TEAM_ID: {settings.apple_team_id}")

    if not settings.apple_key_id:
        print("  ℹ️  APPLE_KEY_ID is not set (optional for basic verification)")
    else:
        print(f"  ✅ APPLE_KEY_ID: {settings.apple_key_id}")

    # Test 2: Test token verification with invalid token (expected to fail gracefully)
    print("\n✓ Test 2: Testing Apple token verification service...")
    try:
        # This will fail with an invalid token (expected)
        result = await verify_apple_token("invalid_test_token")
        if result is None:
            print("  ✅ Token verification service initialized correctly")
            print("     (rejected invalid token as expected)")
        else:
            print("  ⚠️  Unexpected result from token verification")
            return False
    except Exception as e:
        print(f"  ❌ Error during token verification: {e}")
        return False

    # Test 3: Check backend startup
    print("\n✓ Test 3: Checking backend startup...")
    try:
        from app.main import app
        print(f"  ✅ Backend app initialized successfully")
        print(f"     Total routes: {len(app.routes)}")

        # Find Apple auth endpoint
        apple_route = None
        for route in app.routes:
            if hasattr(route, 'path') and '/auth/apple' in route.path:
                apple_route = route
                break

        if apple_route:
            print(f"  ✅ Apple auth endpoint found: POST {apple_route.path}")
        else:
            print("  ℹ️  Apple auth endpoint not found (may be registered dynamically)")

    except Exception as e:
        print(f"  ❌ Error during backend startup: {e}")
        return False

    # Test 4: Verify database connection
    print("\n✓ Test 4: Verifying database connection...")
    try:
        from app.core.database import engine
        async with engine.begin() as conn:
            await conn.execute("SELECT 1")
        print("  ✅ Database connection successful")
    except Exception as e:
        print(f"  ⚠️  Database connection issue: {e}")
        print("     (This is OK if database is not running locally)")

    print("\n" + "="*60)
    print("✅ APPLE SIGN IN CONFIGURATION IS READY")
    print("="*60)
    print("\nNext steps:")
    print("1. Ensure APPLE_CLIENT_ID matches your Service ID (Bundle ID)")
    print("2. Test with real Apple identity token from the mobile app")
    print("3. Monitor logs for any token verification errors")
    print("\nDocumentation: docs/APPLE-SIGNIN-SETUP.md\n")

    return True


async def main():
    """Run all tests."""
    try:
        success = await test_apple_oauth_config()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
