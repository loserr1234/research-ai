import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# Single shared AsyncOpenAI client for all agents
client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY"),
)

NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"
