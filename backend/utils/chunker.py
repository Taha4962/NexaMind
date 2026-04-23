"""
NexaMind Backend — Text Chunking Utility

Splits extracted document text into overlapping chunks suitable
for embedding and vector storage. Uses recursive character-based
splitting with configurable chunk size and overlap.
"""

import logging

logger = logging.getLogger("nexamind.utils.chunker")

# ── Default Chunking Parameters ──
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200
SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    separators: list[str] = SEPARATORS,
) -> list[str]:
    """
    Split text into overlapping chunks using recursive character splitting.

    Attempts to split on paragraph boundaries first, then sentences,
    then words, ensuring each chunk stays within the size limit while
    maintaining semantic coherence.

    Args:
        text: The full text to split into chunks.
        chunk_size: Maximum character count per chunk.
        chunk_overlap: Number of overlapping characters between chunks.
        separators: Ordered list of separator strings to split on.

    Returns:
        List of text chunks with overlap.
    """
    raise NotImplementedError(
        "Text chunking — will implement recursive character-based splitting "
        "that respects paragraph and sentence boundaries, maintains configurable "
        "overlap between chunks for context continuity, and handles edge cases "
        "like very long paragraphs and empty chunks."
    )
