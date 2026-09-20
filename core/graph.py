"""
Relationship graph for the environment model.

This is the core differentiator of Entropy.
Instead of treating entities as isolated items (like a disk analyzer),
we model them as a connected graph with typed, evidence-based relationships.

Each relationship has:
- A source entity and a target entity
- A type (what kind of relationship)
- An observability level (how confident we are)
- Evidence (why we believe this relationship exists)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from core.entities import Entity, ScanResult


class RelationshipType(str, Enum):
    """Types of relationships between entities."""
    CONTAINS = "contains"                    # Project contains Git repo, dep env, etc.
    USES_RUNTIME = "uses_runtime"            # Project uses a specific runtime version
    RUNS_FROM = "runs_from"                  # Process runs from a project directory
    RUNS_ON = "runs_on"                      # Process uses a specific runtime
    BIND_MOUNTS = "bind_mounts"              # Docker container mounts a project path
    USES_IMAGE = "uses_image"                # Docker container uses an image
    MOUNTS_VOLUME = "mounts_volume"          # Docker container mounts a volume
    SHARES_REMOTE = "shares_remote"          # Two projects share the same git remote
    ASSOCIATED_WITH = "associated_with"      # General association (weaker)


class Observability(str, Enum):
    """How confident we are that a relationship exists.

    DIRECTLY_OBSERVABLE: Verified from existing metadata. No inference.
    STRONGLY_INFERABLE:  Very likely based on path matching, config files, etc.
    WEAKLY_INFERABLE:    Possible but ambiguous. Multiple interpretations.
    """
    DIRECTLY_OBSERVABLE = "directly_observable"
    STRONGLY_INFERABLE = "strongly_inferable"
    WEAKLY_INFERABLE = "weakly_inferable"


@dataclass
class Relationship:
    """A typed, evidence-based connection between two entities."""
    source_id: str
    target_id: str
    rel_type: RelationshipType
    observability: Observability
    evidence: str = ""   # Human-readable explanation of why this relationship exists


@dataclass
class EnvironmentGraph:
    """The complete relationship graph of the scanned environment.

    Contains all entities (indexed by ID) and all discovered relationships.
    This is what collectors populate and what the analysis engine queries.
    """
    entities: dict[str, Entity] = field(default_factory=dict)
    relationships: list[Relationship] = field(default_factory=list)

    # Preserve the scan metadata
    scan_timestamp: float = 0.0
    scan_duration_seconds: float = 0.0
    scan_root: str = ""
    hostname: Optional[str] = None
    docker_available: bool = False
    errors: list[str] = field(default_factory=list)

    def add_entity(self, entity: Entity) -> None:
        """Add an entity to the graph."""
        self.entities[entity.entity_id] = entity

    def add_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: RelationshipType,
        observability: Observability,
        evidence: str = "",
    ) -> None:
        """Add a relationship between two entities."""
        self.relationships.append(Relationship(
            source_id=source_id,
            target_id=target_id,
            rel_type=rel_type,
            observability=observability,
            evidence=evidence,
        ))

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Look up an entity by ID."""
        return self.entities.get(entity_id)

    def get_relationships_from(self, entity_id: str) -> list[Relationship]:
        """Get all relationships where entity_id is the source."""
        return [r for r in self.relationships if r.source_id == entity_id]

    def get_relationships_to(self, entity_id: str) -> list[Relationship]:
        """Get all relationships where entity_id is the target."""
        return [r for r in self.relationships if r.target_id == entity_id]

    def get_related_entities(self, entity_id: str) -> list[tuple[Relationship, Entity]]:
        """Get all entities connected to the given entity (in either direction)."""
        results = []
        for r in self.relationships:
            if r.source_id == entity_id:
                target = self.entities.get(r.target_id)
                if target:
                    results.append((r, target))
            elif r.target_id == entity_id:
                source = self.entities.get(r.source_id)
                if source:
                    results.append((r, source))
        return results

    def entities_of_type(self, entity_type: type) -> list[Entity]:
        """Get all entities of a specific type."""
        return [e for e in self.entities.values() if isinstance(e, entity_type)]
