import os
import re
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY")
)

NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"

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

    inside_think = False
    async for chunk in completion:
        token = chunk.choices[0].delta.content
        if token:
            if "<think>" in token:
                inside_think = True
            if "</think>" in token:
                inside_think = False
                continue
            if not inside_think:
                yield token