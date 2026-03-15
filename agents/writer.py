import re
from agents.client import client, NVIDIA_MODEL

async def write_report(topic: str, findings: list[dict]):
    """
    Takes the topic and all research findings,
    compiles them into a clean structured report.
    Streams the report back token by token.
    """

    # Build context from all findings
    context = ""
    for finding in findings:
        context += f"\n\n## Query: {finding['query']}\n"

        # Add search snippets
        for r in finding.get("results", []):
            context += f"\nSource: {r['title']} ({r['url']})\n{r['content']}\n"

        # Add scraped content
        for s in finding.get("scraped", []):
            context += f"\nDeep content from {s['url']}:\n{s['content']}\n"

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert research analyst and writer. "
                "Given raw research findings, compile a clear, comprehensive, well-structured report. "
                "Format the report with these sections:\n"
                "1. Executive Summary (3-4 sentences)\n"
                "2. Key Findings (bullet points)\n"
                "3. Detailed Analysis (paragraphs)\n"
                "4. Sources (list the URLs used)\n\n"
                "Write in a professional but readable tone. "
                "Only use information from the provided findings — do not make things up."
            )
        },
        {
            "role": "user",
            "content": f"Topic: {topic}\n\nResearch Findings:\n{context}"
        }
    ]

    # Stream the report
    completion = await client.chat.completions.create(
        model=NVIDIA_MODEL,
        messages=messages,
        temperature=0.4,
        max_tokens=2048,
        stream=True,
    )

    # Use a buffer to handle <think>...</think> tags that may be split
    # across multiple chunks before stripping and yielding clean tokens.
    buffer = ""
    inside_think = False

    async for chunk in completion:
        token = chunk.choices[0].delta.content
        if not token:
            continue

        buffer += token

        # Process the buffer in a loop until no more complete tags remain
        while True:
            if inside_think:
                end = buffer.find("</think>")
                if end == -1:
                    # End tag not yet arrived — keep buffering
                    break
                # Discard everything up to and including </think>
                buffer = buffer[end + len("</think>"):]
                inside_think = False
            else:
                start = buffer.find("<think>")
                if start == -1:
                    # No opening tag — yield whatever is safely before any
                    # partial tag that may be forming at the tail
                    safe = buffer[:-len("<think>")]  # hold back potential partial
                    if len(buffer) >= len("<think>"):
                        yield buffer[: len(buffer) - len("<think>") + 1]
                        buffer = buffer[len(buffer) - len("<think>") + 1 :]
                    break
                # Yield everything before the opening tag, then enter think mode
                if start > 0:
                    yield buffer[:start]
                buffer = buffer[start + len("<think>"):]
                inside_think = True

    # Flush any remaining content in the buffer
    if buffer and not inside_think:
        yield buffer