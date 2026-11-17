"""Search: what the box in the Stream finds, and which words of an article matched."""

import re

from django.contrib.postgres.search import SearchQuery
from django.db import connection
from django.db.models import Q

from reader.models import SEARCH_LANGUAGE, SEARCHED_CHARACTERS, Item

_WORD = re.compile(r"[^\W_]+")
# A quoted phrase, an exclusion (-word) or an alternative (OR): the owner is writing a query.
_OPERATORS = re.compile(r'"|(^|\s)-\w|\bor\b', re.IGNORECASE)


def matching(typed: str) -> tuple[Q, Q | None]:
    """What the search box finds: the first choice, and what to fall back on if that finds
    nothing.

    The words typed are looked for together, in that order, in the title or the text: "movement
    of data" finds the article that says so, not every article with both words somewhere. Only
    if none does are articles with all the words, anywhere, shown instead. Words match in any
    form ("protocols" finds "protocol"); the last may still be being typed, so it also matches
    as the start of a word, never as the middle of one. A feed is found by its own name.
    """
    words = _WORD.findall(typed)
    if _OPERATORS.search(typed) or not words:
        # Phrases, OR and -exclusions, as written. Anything typed is accepted without error.
        written = SearchQuery(typed, search_type="websearch", config=SEARCH_LANGUAGE)
        return Q(search=written), None

    def all_words(joined_by: str) -> Q:
        terms = joined_by.join([*words[:-1], f"{words[-1]}:*"])
        return Q(search=SearchQuery(terms, search_type="raw", config=SEARCH_LANGUAGE))

    # A word half typed is not yet a form the text search knows, so titles are also matched
    # letter by letter from the start of each word.
    in_title, in_feed = Q(), Q()
    for word in words:
        in_title &= Q(title__iregex=rf"\m{word}")
        in_feed &= Q(feed__title__iregex=rf"\m{word}")
    return all_words(" <-> ") | in_feed, all_words(" & ") | in_title | in_feed


_TERM = re.compile(r"(-?)([^\W_]+)")


def found_words(item: Item, typed: str) -> list[list[str]]:
    """For each word searched for, in order, the words in this item's text that match it.

    Postgres reduces words to a stem to compare them ("movements" and "movement" are both
    "movement"), so only it can say which of an article's words a search word stands for. The
    browser marks these words where they appear; it never has to know about stems.
    """
    written = bool(_OPERATORS.search(typed))
    terms = [
        word.lower()
        for minus, word in _TERM.findall(typed)
        if not minus and not (written and word.lower() == "or")
    ]
    if not terms:
        return []
    text = f"{item.title}\n{item.body[:SEARCHED_CHARACTERS]}\n{item.said[:SEARCHED_CHARACTERS]}"
    with connection.cursor() as cursor:
        cursor.execute("SELECT DISTINCT lower(token) FROM ts_parse('default', %s)", [text])
        words = {row[0] for row in cursor.fetchall() if _WORD.fullmatch(row[0])}
        # A word with no stem of its own (a stop word such as "of") stands for itself.
        cursor.execute(
            "SELECT word, coalesce((ts_lexize('english_stem', word))[1], word) "
            "FROM unnest(%s::text[]) AS word",
            [sorted(words | set(terms))],
        )
        stem = dict(cursor.fetchall())

    def matches(word: str, term: str, started: bool) -> bool:
        if stem[word] == stem[term]:
            return True
        # The last word may still be being typed: it matches as the start of a word.
        return started and (stem[word].startswith(stem[term]) or word.startswith(term))

    last = len(terms) - 1
    return [
        sorted(word for word in words if matches(word, term, started=n == last and not written))
        for n, term in enumerate(terms)
    ]
