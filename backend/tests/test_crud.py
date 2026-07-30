from datetime import timedelta

from app import crud
from app.models import Share, now_utc


def test_create_share_persists_and_returns_raw_token(db_session):
    share, manage_token = crud.create_share(db_session, content="# hello")

    assert share.id is not None
    assert share.slug
    assert manage_token
    assert crud.get_share(db_session, share.slug).content == "# hello"


def test_create_share_hashes_manage_token(db_session):
    share, manage_token = crud.create_share(db_session, content="x")

    assert share.manage_token_hash != manage_token
    assert crud.verify_manage_token(share, manage_token) is True
    assert crud.verify_manage_token(share, "nope") is False


def test_create_share_without_password_is_public(db_session):
    share, _ = crud.create_share(db_session, content="x")
    assert share.password_hash is None


def test_create_share_with_password_hashes_it(db_session):
    share, _ = crud.create_share(db_session, content="x", password="s3cret")

    assert share.password_hash is not None
    assert crud.verify_password(share, "s3cret") is True
    assert crud.verify_password(share, "wrong") is False


def test_create_share_with_expiry_sets_future_expires_at(db_session):
    share, _ = crud.create_share(db_session, content="x", expires_in_seconds=3600)

    assert share.expires_at is not None
    assert share.expires_at > now_utc()
    assert crud.is_expired(share) is False


def test_create_share_without_expiry_never_expires(db_session):
    share, _ = crud.create_share(db_session, content="x")
    assert share.expires_at is None
    assert crud.is_expired(share) is False


def test_is_expired_true_when_expiry_in_past(db_session):
    share, _ = crud.create_share(db_session, content="x")
    share.expires_at = now_utc() - timedelta(seconds=1)
    assert crud.is_expired(share) is True


def test_get_share_returns_none_for_unknown_slug(db_session):
    assert crud.get_share(db_session, "does-not-exist") is None


def test_update_share_changes_content_and_bumps_updated_at(db_session):
    share, _ = crud.create_share(db_session, content="old")
    original_updated_at = share.updated_at

    crud.update_share(db_session, share, content="new")

    assert share.content == "new"
    assert share.updated_at > original_updated_at


def test_update_share_can_clear_password(db_session):
    share, _ = crud.create_share(db_session, content="x", password="pw")
    crud.update_share(db_session, share, password=None)
    assert share.password_hash is None


def test_update_share_can_clear_expiry(db_session):
    share, _ = crud.create_share(db_session, content="x", expires_in_seconds=3600)
    crud.update_share(db_session, share, expires_in_seconds=None)
    assert share.expires_at is None


def test_update_share_leaves_unspecified_fields_untouched(db_session):
    share, _ = crud.create_share(db_session, content="keep", password="pw")
    crud.update_share(db_session, share, expires_in_seconds=60)

    assert share.content == "keep"
    assert crud.verify_password(share, "pw") is True


def test_delete_share_removes_it(db_session):
    share, _ = crud.create_share(db_session, content="x")
    slug = share.slug
    crud.delete_share(db_session, share)
    assert crud.get_share(db_session, slug) is None


def test_count_shares_counts_all_shares(db_session):
    assert crud.count_shares(db_session) == 0

    crud.create_share(db_session, content="a")
    crud.create_share(db_session, content="b")

    assert crud.count_shares(db_session) == 2
