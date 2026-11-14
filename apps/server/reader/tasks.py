"""Background jobs for the reader. Run by the worker: `manage.py procrastinate worker`."""

from procrastinate.contrib.django import app

from reader import feeds

POLL_EVERY = "*/15 * * * *"


# The two locks: if the worker was down, missed runs do not pile up; and a slow run is never
# overlapped by the next one.
@app.periodic(cron=POLL_EVERY)
@app.task(queueing_lock="poll_feeds", lock="poll_feeds")
def poll_feeds(timestamp: int) -> None:
    """Every fifteen minutes: fetch every feed again."""
    feeds.refresh_all()
