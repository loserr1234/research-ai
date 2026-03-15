import os
import json
import re
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY")
)

NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"

async def plan_research(topic: str) -> list[str]:
    """
    Takes a research topic and breaks it into
    4-5 specific search queries to cover all angles.
    Returns a list of search query strings.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are a research planner. "
                "Given a research topic, generate exactly 4 specific search queries "
                "that together would give comprehensive coverage of the topic. "
                "Return ONLY a JSON array of strings. No explanation, no markdown, just the array. "
                "Example: [\"query 1\", \"query 2\", \"query 3\", \"query 4\"]"
            )
        },
        {
            "role": "user",
            "content": f"Research topic: {topic}"
        }
    ]

    try:
        completion = await client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=512,
        )
        content = completion.choices[0].message.content
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        queries = json.loads(content)
        if isinstance(queries, list):
            return [str(q) for q in queries[:5]]
        return [topic]
    except Exception as e:
        print(f"Orchestrator error: {e}")
        return [topic]