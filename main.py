import asyncio
import json
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.orchestrator import plan_research
from agents.researcher import research_query
from agents.writer import write_report

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ResearchRequest(BaseModel):
    topic: str

@app.post("/research")
async def research(req: ResearchRequest):
    async def event_stream():
        try:
            topic = req.topic.strip()

            yield f"data: {json.dumps({'type': 'status', 'payload': 'Planning research queries...'})}\n\n"
            queries = await plan_research(topic)
            yield f"data: {json.dumps({'type': 'queries', 'payload': queries})}\n\n"

            yield f"data: {json.dumps({'type': 'status', 'payload': f'Researching {len(queries)} queries in parallel...'})}\n\n"
            tasks = [research_query(q) for q in queries]
            findings = await asyncio.gather(*tasks)

            yield f"data: {json.dumps({'type': 'status', 'payload': 'Writing report...'})}\n\n"
            async for token in write_report(topic, list(findings)):
                yield f"data: {json.dumps({'type': 'token', 'payload': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'payload': ''})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'payload': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.get("/health")
async def health():
    return {"status": "ok"}