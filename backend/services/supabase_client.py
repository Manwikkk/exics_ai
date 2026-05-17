"""
Supabase client singleton.
"""

from __future__ import annotations

import logging
from supabase import create_client, Client

from backend.config import settings

logger = logging.getLogger("exics.supabase")

_client: Client | None = None


def init_supabase() -> Client:
    """Initialise and return the Supabase client (service-role key)."""
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.info("Supabase client initialised")
    return _client


def get_supabase() -> Client:
    """Return the initialised Supabase client."""
    if _client is None:
        return init_supabase()
    return _client
