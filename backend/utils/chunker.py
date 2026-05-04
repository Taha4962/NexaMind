"""
NexaMind Backend — Text Chunking Utility

Splits extracted document text into overlapping chunks suitable
for embedding and vector storage. Uses a heuristic word_count * 1.3
approximation for token estimation.
"""

import logging
import re

logger = logging.getLogger("nexamind.utils.chunker")

def estimate_tokens(text: str) -> int:
    """
    Estimate the number of tokens in a string.
    Uses the common approximation of 1 token ≈ 0.75 words,
    which means words * 1.3 ≈ tokens.
    """
    if not text:
        return 0
    words = text.split()
    return int(len(words) * 1.3)

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    Split text into chunks of approximately `chunk_size` tokens,
    with an `overlap` of tokens between consecutive chunks.

    Args:
        text: The full text to chunk.
        chunk_size: Maximum estimated tokens per chunk.
        overlap: Estimated tokens to overlap.

    Returns:
        List of text chunks.
    """
    if not text.strip():
        return []

    # Clean up excessive whitespace
    text = re.sub(r'\n+', '\n', text)
    text = re.sub(r' +', ' ', text)

    # Split roughly by sentences to avoid breaking in the middle of a sentence
    # This is a naive split by period-space.
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        sentence_tokens = estimate_tokens(sentence)

        if current_length + sentence_tokens > chunk_size and current_chunk:
            # Finalize the current chunk
            chunk_text_str = " ".join(current_chunk)
            if len(chunk_text_str) >= 50: # Filter out chunks shorter than 50 chars
                chunks.append(chunk_text_str)

            # Start new chunk with overlap
            overlap_chunk = []
            overlap_length = 0
            for prev_sentence in reversed(current_chunk):
                prev_tokens = estimate_tokens(prev_sentence)
                if overlap_length + prev_tokens <= overlap:
                    overlap_chunk.insert(0, prev_sentence)
                    overlap_length += prev_tokens
                else:
                    break
            
            current_chunk = overlap_chunk + [sentence]
            current_length = overlap_length + sentence_tokens
        else:
            current_chunk.append(sentence)
            current_length += sentence_tokens

    # Add the last chunk
    if current_chunk:
        chunk_text_str = " ".join(current_chunk)
        if len(chunk_text_str) >= 50:
            chunks.append(chunk_text_str)

    return chunks
