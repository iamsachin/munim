"""Background jobs for the reader. Run by the worker: `manage.py procrastinate worker`."""

from procrastinate import JobContext
from procrastinate.contrib.django import app
from procrastinate.exceptions import UniqueViolation
from procrastinate.jobs import Status

from reader import ask, digest, feeds, hackernews, images, links, watches, x, youtube
from reader.models import Item

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


@app.task
def keep_pictures(item_id: int) -> None:
    """When the owner saves an item: fetch its pictures, so that what was saved is whole. Run
    again, it fetches only what is still missing."""
    item = Item.objects.filter(pk=item_id).first()
    if item is not None:
        images.keep(item)


@app.task
def read_links(item_id: int) -> None:
    """When an item is opened: look at some of the pages it links to, for their titles. Run
    again, it fetches only what is still unknown."""
    links.read(item_id)


@app.task
def answer_ask(ask_id: int) -> None:
    """When the owner asks something: put the question to the model. Run again after a crash,
    it leaves a question that already has its answer alone."""
    ask.answer(ask_id)


@app.periodic(cron="0 * * * *")
@app.task(queueing_lock="write_digests", lock="write_digests")
def write_digests(timestamp: int) -> None:
    """Every hour, and when Digest is switched on: write the digests that are due. Hourly,
    because seven o'clock is on the owner's clock, and so that one missed is written late
    rather than never. Run again, it leaves a digest that is already written alone."""
    digest.write_due()


# Hourly, not with every poll: a topic is judged by a model, which is paid for.
@app.periodic(cron="12 * * * *")
@app.task(queueing_lock="match_watches", lock="match_watches")
def match_watches(timestamp: int) -> None:
    """Every hour, and when a topic is added or switched on: each watch that is on looks at
    the items that have arrived since it last looked, and the ones switched on for X are
    looked for there, once a day each. Run again, it finds nothing new and asks X nothing."""
    watches.check_all()
    x.look_all()


@app.periodic(cron="*/5 * * * *")
@app.task(queueing_lock="recover_jobs", lock="recover_jobs", pass_context=True)
async def recover_jobs(context: JobContext, timestamp: int) -> None:
    """Every five minutes: a job whose worker died while running it (a restart, a crash, the
    power) is put back to be run again. Left alone it stays "running" for ever, and because a
    task never runs twice at once, nothing of its kind could ever start behind it. Every task
    here is safe to run again."""
    jobs = context.app.job_manager
    for job in await jobs.get_stalled_jobs():
        try:
            await jobs.retry_job(job)
        except UniqueViolation:
            # A later run of the same task is already waiting, and will do the same work: the
            # one left behind is cleared out of its way.
            await jobs.finish_job(job, Status.FAILED, delete_job=True)
    # Jobs that failed are kept to be looked at, but not for ever.
    await jobs.delete_old_jobs(nb_hours=24 * 7, include_failed=True)
