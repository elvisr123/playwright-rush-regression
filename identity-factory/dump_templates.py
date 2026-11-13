"""Print SOURCE_TEMPLATES as JSON on stdout.

Exists so the TypeScript side can read the per-source structural fields —
the manager columns in particular — without duplicating them in a second
place that could drift. Same stdout-is-only-JSON contract as
generate_identity.py: anything else must go to stderr.

Unlike generate_identity.py this writes nothing and allocates nothing: no
name is consumed from the dedupe pool, no row is saved to the SQLite mirror
or the Excel audit log. Safe to call as often as you like.
"""

from __future__ import annotations

import json
import sys

from source_templates import SOURCE_TEMPLATES


def main() -> None:
    # --user-id-tiers: print {source: [prefix tiers]} instead (see
    # user_payload.user_id_prefix_tiers) - read by tests/helpers/userIdAllocator.ts.
    if "--user-id-tiers" in sys.argv[1:]:
        from user_payload import SOURCES, user_id_prefix_tiers

        print(json.dumps({key: user_id_prefix_tiers(key) for key in SOURCES}))
        return
    print(json.dumps(SOURCE_TEMPLATES))


if __name__ == "__main__":
    main()
