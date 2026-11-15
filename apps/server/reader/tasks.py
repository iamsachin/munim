"""Background jobs for the reader. Run by the worker: `manage.py procrastinate worker`."""

from procrastinate import JobContext
from procrastinate.contrib.django import app

from reader import feeds, hackernews, youtube

POLL_EVERY = "*/15 * * * *"


# The two locks: if the worker was down, missed runs do not pile up; and a slow run is never
# overlapped by the next one.
@app.periodic(cron=POLL_EVERY)
@app.task(queueing_lock="poll_feeds", lock="poll_feeds")
def poll_feeds(timestamp: int) -> None:
    """Every fifteen minutes: fetch every feed again."""
    feeds.refresh_all()


@app.periodic(cron=POLL_EVERY)
@app.task(queueing_lock="poll_hacker_news", lock="poll_hacker_news")
def poll_hacker_news(timestamp: int) -> None:
    """Every fifteen minutes, and when it is switched on: fetch the Hacker News front page."""
    hackernews.refresh()


# Hourly, not every quarter: each pass costs Google allowance (see reader/youtube.py).
@app.periodic(cron="7 * * * *")
@app.task(queueing_lock="poll_youtube", lock="poll_youtube")
def poll_youtube(timestamp: int) -> None:
    """Every hour, and when it is connected: fetch new videos from subscribed channels."""
    youtube.refresh()


@app.periodic(cron="*/5 * * * *")
@app.task(queueing_lock="recover_jobs", lock="recover_jobs", pass_context=True)
async def recover_jobs(context: JobContext, timestamp: int) -> None:
    """Every five minutes: a job whose worker died while running it (a restart, a crash, the
    power) is put back to be run again. Left alone it stays "running" for ever, and because a
    task never runs twice at once, nothing of its kind could ever start behind it. Every task
    here is safe to run again."""
    jobs = context.app.job_manager
    for job in await jobs.get_stalled_jobs():
        await jobs.retry_job(job)
