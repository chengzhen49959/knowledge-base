import math
from typing import Protocol
from uuid import uuid4

from supabase import Client

from app.pipeline.models import ConceptMatch, SourceMetadata


class ConceptStore(Protocol):
    def add_source(self, metadata: SourceMetadata, summary: str) -> str: ...

    def find_similar(self, embedding: list[float], top_k: int = 1) -> list[ConceptMatch]: ...

    def insert_concept(self, name: str, description: str, embedding: list[float]) -> str: ...

    def update_concept(self, concept_id: str, description: str, embedding: list[float]) -> None: ...

    def link_source(self, concept_id: str, source_id: str, description: str) -> None: ...


class SupabaseConceptStore:
    def __init__(self, client: Client):
        self.client = client

    def add_source(self, metadata: SourceMetadata, summary: str) -> str:
        response = (
            self.client.table("sources")
            .insert(
                {
                    "title": metadata.title,
                    "source_type": metadata.source_type,
                    "origin": metadata.origin,
                    "summary": summary,
                    "metadata": metadata.model_dump(),
                }
            )
            .execute()
        )
        return response.data[0]["id"]

    def find_similar(self, embedding: list[float], top_k: int = 1) -> list[ConceptMatch]:
        response = self.client.rpc(
            "match_concepts",
            {"query_embedding": embedding, "match_count": top_k},
        ).execute()
        return [ConceptMatch(**row) for row in response.data]

    def insert_concept(self, name: str, description: str, embedding: list[float]) -> str:
        response = (
            self.client.table("concepts")
            .insert({"name": name, "description": description, "embedding": embedding})
            .execute()
        )
        return response.data[0]["id"]

    def update_concept(self, concept_id: str, description: str, embedding: list[float]) -> None:
        (
            self.client.table("concepts")
            .update({"description": description, "embedding": embedding})
            .eq("id", concept_id)
            .execute()
        )

    def link_source(self, concept_id: str, source_id: str, description: str) -> None:
        (
            self.client.table("concept_sources")
            .insert(
                {
                    "concept_id": concept_id,
                    "source_id": source_id,
                    "description": description,
                }
            )
            .execute()
        )

    def list_concepts(self) -> list[dict]:
        response = (
            self.client.table("concepts")
            .select("id, name, description, created_at, updated_at, concept_sources(count)")
            .order("updated_at", desc=True)
            .execute()
        )
        return [
            {
                **{k: row[k] for k in ("id", "name", "description", "created_at", "updated_at")},
                "source_count": row["concept_sources"][0]["count"] if row["concept_sources"] else 0,
            }
            for row in response.data
        ]

    def get_concept(self, concept_id: str) -> dict | None:
        response = (
            self.client.table("concepts")
            .select(
                "id, name, description, created_at, updated_at,"
                " concept_sources(description, created_at,"
                "  sources(id, title, source_type, origin, summary, created_at))"
            )
            .eq("id", concept_id)
            .execute()
        )
        if not response.data:
            return None
        row = response.data[0]
        return {
            **{k: row[k] for k in ("id", "name", "description", "created_at", "updated_at")},
            "sources": [
                {**link["sources"], "concept_description": link["description"]}
                for link in row["concept_sources"]
            ],
        }

    def list_sources(self) -> list[dict]:
        response = (
            self.client.table("sources")
            .select(
                "id, title, source_type, origin, summary, created_at, concept_sources(count)"
            )
            .order("created_at", desc=True)
            .execute()
        )
        return [
            {
                **{
                    k: row[k]
                    for k in ("id", "title", "source_type", "origin", "summary", "created_at")
                },
                "concept_count": row["concept_sources"][0]["count"] if row["concept_sources"] else 0,
            }
            for row in response.data
        ]

    def get_source(self, source_id: str) -> dict | None:
        response = (
            self.client.table("sources")
            .select(
                "id, title, source_type, origin, summary, created_at,"
                " concept_sources(concepts(id, name, description))"
            )
            .eq("id", source_id)
            .execute()
        )
        if not response.data:
            return None
        row = response.data[0]
        return {
            **{
                k: row[k]
                for k in ("id", "title", "source_type", "origin", "summary", "created_at")
            },
            "concepts": [link["concepts"] for link in row["concept_sources"]],
        }


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


class InMemoryConceptStore:
    def __init__(self):
        self.sources: dict[str, dict] = {}
        self.concepts: dict[str, dict] = {}
        self.concept_sources: list[dict] = []

    def add_source(self, metadata: SourceMetadata, summary: str) -> str:
        source_id = str(uuid4())
        self.sources[source_id] = {"metadata": metadata, "summary": summary}
        return source_id

    def find_similar(self, embedding: list[float], top_k: int = 1) -> list[ConceptMatch]:
        matches = [
            ConceptMatch(
                id=concept_id,
                name=concept["name"],
                description=concept["description"],
                similarity=cosine_similarity(embedding, concept["embedding"]),
            )
            for concept_id, concept in self.concepts.items()
        ]
        matches.sort(key=lambda match: match.similarity, reverse=True)
        return matches[:top_k]

    def insert_concept(self, name: str, description: str, embedding: list[float]) -> str:
        concept_id = str(uuid4())
        self.concepts[concept_id] = {
            "name": name,
            "description": description,
            "embedding": embedding,
        }
        return concept_id

    def update_concept(self, concept_id: str, description: str, embedding: list[float]) -> None:
        self.concepts[concept_id]["description"] = description
        self.concepts[concept_id]["embedding"] = embedding

    def link_source(self, concept_id: str, source_id: str, description: str) -> None:
        self.concept_sources.append(
            {
                "concept_id": concept_id,
                "source_id": source_id,
                "description": description,
            }
        )
