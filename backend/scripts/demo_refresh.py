"""One-shot: reset Kafé Cendana then re-seed with realistic demo data.

Use this between demo sessions — wipes test conversations / bookings /
revenue / loyalty entries from the previous run, then re-fills with the
canonical seed (33 settled bills across 7 days, 4 bookings for today,
3 sample inbox conversations) so the dashboard stays believable.

Run:
  cd backend
  .venv\\Scripts\\python.exe scripts\\demo_refresh.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Each step is its own self-contained script with a `main()` entrypoint.
# We import + call so a single command runs both phases in this process.
import reset_demo  # noqa: E402
import seed_realistic_demo  # noqa: E402


def main() -> None:
    print("=" * 60)
    print("DEMO REFRESH — reset + seed realistic data")
    print("=" * 60)
    print()

    print(">>> Phase 1/2 — RESET")
    reset_demo.main()

    print()
    print(">>> Phase 2/2 — SEED")
    seed_realistic_demo.main()

    print()
    print("=" * 60)
    print("Demo refresh complete. Refresh dashboard in your browser.")
    print("=" * 60)


if __name__ == "__main__":
    main()
