from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.urls import path

from munim.api import api

# The admin has no sign-in form of its own: its form would be a second place to guess the
# passphrase, outside the rate limit. Sign in to Munim first; the admin then uses that session.
admin.site.login = login_required(admin.site.login, login_url="/sign-in")  # type: ignore[method-assign]

urlpatterns = [
    path("api/", api.urls),
    path("admin/", admin.site.urls),
]
