from fastapi import FastAPI
from pydantic import BaseModel
from agents.orchestrator import OrchestratorAgent

app = FastAPI(title="Document Analyzer API")

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    response: str

orchestrator = OrchestratorAgent()

@app.post("/query", response_model=QueryResponse)
async def query_document(request: QueryRequest):
    result = await orchestrator.process_query(request.query)
    return QueryResponse(response=result)
