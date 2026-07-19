from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException

# In-memory fixed-window limiter keyed by installation id (D004: no auth, so
# this is the only identity available). Adequate for a single-process
# anonymous MVP; it resets on restart and does not coordinate across
# multiple worker processes — documented as a known limitation in
# the backlog, revisit with a shared store (e.g. Redis) before
# running more than one API worker.
_WINDOW_SECONDS = 3600
_MAX_REQUESTS_PER_WINDOW = 20

_requests: dict[str, deque[float]] = defaultdict(deque)


def enforce_rate_limit(installation_id: str | None) -> None:
    key = installation_id or "anonymous"
    now = time.monotonic()
    bucket = _requests[key]

    while bucket and now - bucket[0] > _WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= _MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": f"Too many analyses from this browser. Limit is {_MAX_REQUESTS_PER_WINDOW} per hour.",
            },
        )

    bucket.append(now)
