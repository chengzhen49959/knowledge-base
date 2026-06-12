import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth import CurrentUser, get_current_user
from app.pipeline.extractor import is_url
from app.pipeline.ingest import ingest_source
from app.pipeline.models import SourceMetadata
from app.pipeline.store import SupabaseConceptStore
from app.supabase_client import get_supabase

router = APIRouter(prefix="/api", tags=["knowledge"])


def get_store() -> SupabaseConceptStore:
    return SupabaseConceptStore(get_supabase())


@router.post("/ingest")
async def ingest(
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
    user: CurrentUser = Depends(get_current_user),
    store: SupabaseConceptStore = Depends(get_store),
) -> dict:
    """Ingest one source (an uploaded file or a URL) into the knowledge base.

    Runs the full pipeline synchronously — extraction, embedding, dedup — so the
    request takes tens of seconds for a typical paper.
    """
    if (file is None) == (url is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide exactly one of: file, url"
        )

    if url is not None:
        if not is_url(url):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "URL must start with http:// or https://"
            )
        result = await ingest_source(url, store)
    else:
        # The upload lands in a temp file, so derive title/type from the original
        # name — the extractor still picks its strategy from the kept suffix.
        original = Path(file.filename or "upload")
        metadata = SourceMetadata(
            title=original.stem,
            source_type=original.suffix.lstrip(".") or "file",
            origin=original.name,
        )
        with tempfile.NamedTemporaryFile(suffix=original.suffix, delete=True) as tmp:
            tmp.write(await file.read())
            tmp.flush()
            result = await ingest_source(Path(tmp.name), store, metadata)

    return {
        "source_id": result.source_id,
        "summary": result.summary,
        "parts": result.parts,
        "input_bytes": result.input_bytes,
        "timings": {k: round(v, 2) for k, v in result.timings.items()},
        "created": result.created,
        "merged": result.merged,
    }


@router.get("/concepts")
def list_concepts(
    user: CurrentUser = Depends(get_current_user),
    store: SupabaseConceptStore = Depends(get_store),
) -> list[dict]:
    return store.list_concepts()


@router.get("/concepts/{concept_id}")
def get_concept(
    concept_id: str,
    user: CurrentUser = Depends(get_current_user),
    store: SupabaseConceptStore = Depends(get_store),
) -> dict:
    concept = store.get_concept(concept_id)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concept not found")
    return concept


@router.get("/sources")
def list_sources(
    user: CurrentUser = Depends(get_current_user),
    store: SupabaseConceptStore = Depends(get_store),
) -> list[dict]:
    return store.list_sources()


@router.get("/sources/{source_id}")
def get_source(
    source_id: str,
    user: CurrentUser = Depends(get_current_user),
    store: SupabaseConceptStore = Depends(get_store),
) -> dict:
    source = store.get_source(source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    return source
