from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AnalysisEvent, AnalysisRecord
from .schemas import ProjectAnalysis


def save_analysis(
    session: Session,
    analysis: ProjectAnalysis,
    *,
    installation_id: str | None,
    provider: str,
    model: str,
    status: str = "complete",
    failure_code: str | None = None,
    user_id: str | None = None,
) -> AnalysisRecord:
    record = AnalysisRecord(
        id=analysis.id,
        installation_id=installation_id,
        # Signed-in requests are scoped to the account (D037/Phase 9) so the
        # analysis follows the user across browsers/devices; installation_id
        # is still recorded too (harmless, useful for diagnostics) but no
        # longer the scoping key once user_id is present — see get/list/
        # delete/duplicate below, which all prefer user_id when set.
        user_id=user_id,
        created_at=analysis.created_at,
        updated_at=analysis.created_at,
        source_title=analysis.source.title,
        source_platform=analysis.source.platform,
        source_description=analysis.source.description,
        analysis_json=analysis.model_dump(mode="json", by_alias=True),
        schema_version=1,
        provider=provider,
        model=model,
        status=status,
        failure_code=failure_code,
    )
    session.merge(record)
    session.commit()
    return record


def _scope(stmt, *, installation_id: str | None, user_id: str | None):
    """Shared scoping rule (D037): a signed-in caller (user_id present) is
    scoped to their account only, regardless of which browser/installation
    they're currently on. An anonymous caller (no user_id) is scoped to
    installation_id exactly as before Phase 9. The two are mutually
    exclusive per request — main.py never passes both as active scoping
    keys, only whichever one the current request is actually authenticated
    or anonymous-identified by.
    """
    if user_id:
        return stmt.where(AnalysisRecord.user_id == user_id)
    if installation_id:
        return stmt.where(AnalysisRecord.installation_id == installation_id)
    return stmt


def get_analysis(
    session: Session, analysis_id: str, *, installation_id: str | None, user_id: str | None = None
) -> AnalysisRecord | None:
    stmt = select(AnalysisRecord).where(AnalysisRecord.id == analysis_id)
    stmt = _scope(stmt, installation_id=installation_id, user_id=user_id)
    return session.execute(stmt).scalar_one_or_none()


def list_analyses(
    session: Session, *, installation_id: str | None, user_id: str | None = None
) -> list[AnalysisRecord]:
    stmt = select(AnalysisRecord).order_by(AnalysisRecord.created_at.desc())
    stmt = _scope(stmt, installation_id=installation_id, user_id=user_id)
    return list(session.execute(stmt).scalars().all())


def delete_analysis(
    session: Session, analysis_id: str, *, installation_id: str | None, user_id: str | None = None
) -> bool:
    record = get_analysis(session, analysis_id, installation_id=installation_id, user_id=user_id)
    if record is None:
        return False
    session.delete(record)
    session.commit()
    return True


def duplicate_analysis(
    session: Session,
    analysis_id: str,
    *,
    installation_id: str | None,
    new_id: str,
    user_id: str | None = None,
) -> AnalysisRecord | None:
    source = get_analysis(session, analysis_id, installation_id=installation_id, user_id=user_id)
    if source is None:
        return None

    now = datetime.now(timezone.utc)
    payload = dict(source.analysis_json)
    payload["id"] = new_id
    payload["createdAt"] = now.isoformat()

    original_title = None
    if isinstance(payload.get("source"), dict):
        original_title = payload["source"].get("title")
    new_title = f"{original_title} (copy)" if original_title else None
    if isinstance(payload.get("source"), dict):
        payload["source"] = {**payload["source"], "title": new_title}

    copy_record = AnalysisRecord(
        id=new_id,
        installation_id=installation_id,
        user_id=user_id,
        created_at=now,
        updated_at=now,
        source_title=new_title,
        source_platform=source.source_platform,
        source_description=source.source_description,
        analysis_json=payload,
        schema_version=source.schema_version,
        provider=source.provider,
        model=source.model,
        status=source.status,
        failure_code=source.failure_code,
    )
    session.add(copy_record)
    session.commit()
    session.refresh(copy_record)
    return copy_record


def record_to_project_analysis(record: AnalysisRecord) -> ProjectAnalysis:
    return ProjectAnalysis.model_validate(record.analysis_json)


def log_event(
    session: Session,
    *,
    analysis_id: str | None,
    installation_id: str | None,
    event_type: str,
    provider: str,
    model: str,
    status_code: int,
    error_code: str | None,
    latency_ms: int,
) -> AnalysisEvent:
    event = AnalysisEvent(
        analysis_id=analysis_id,
        installation_id=installation_id,
        event_type=event_type,
        provider=provider,
        model=model,
        status_code=status_code,
        error_code=error_code,
        latency_ms=latency_ms,
    )
    session.add(event)
    session.commit()
    return event
