from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
from agents.orchestrator import OrchestratorAgent
import subprocess
import os
import shutil

import sys
import asyncio

app = FastAPI(title="Document Analyzer API")

# Add CORS so React frontend can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    history: List[Dict[str, str]] = []

orchestrator = OrchestratorAgent()

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Uploads a PDF and processes it using PageIndex."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    # Save to the PageIndex folder
    target_path = os.path.join("PageIndex", file.filename)
    try:
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Run the PageIndex script
    # We use asyncio.create_subprocess_exec so we don't block the FastAPI event loop
    print(f"Starting PDF processing for {file.filename}...")
    try:
        # Use unbuffered python execution (-u) so stdout is flushed immediately
        cmd = [
            sys.executable, "-u", "run_pageindex.py", 
            "--pdf_path", file.filename, 
            "--if-add-node-id", "yes", 
            "--if-add-node-summary", "yes", 
            "--if-add-node-text", "yes", 
            "--model", "gpt-5-mini"
        ]
        
        # Ensure we pass the API keys down to the subprocess
        env = os.environ.copy()
        if "OPENAI_API_KEY" in env and "CHATGPT_API_KEY" not in env:
            env["CHATGPT_API_KEY"] = env["OPENAI_API_KEY"]
            
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd="PageIndex",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env
        )
        
        # Stream logs line-by-line asynchronously
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            # decode bytes to string and print
            print(f"[PageIndex] {line.decode('utf-8', errors='replace').strip()}")
            
        return_code = await process.wait()
        
        if return_code != 0:
            print(f"Error parsing PDF, exit code: {return_code}")
            raise HTTPException(status_code=500, detail="Failed to parse PDF.")
            
        print("PDF processing complete. Reloading document tree into Orchestrator...")
            
        # Reinitialize orchestrator to reload the newly generated JSON tree
        # Find the actual generated json file
        json_filename = file.filename.replace('.pdf', '_structure.json')
        expected_json_path = os.path.join("PageIndex", "results", json_filename)
        
        # Point the worker to the new JSON file
        global orchestrator
        orchestrator.worker.json_path = expected_json_path
        orchestrator.worker.document_tree = orchestrator.worker._load_document_tree()
            
        return {"status": "success", "message": f"Successfully parsed {file.filename}"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_document(request: QueryRequest):
    """
    Streams the agent's thought process and final answer using Server-Sent Events (SSE).
    """
    async def sse_generator():
        try:
            async for chunk in orchestrator.process_query_stream(request.query, request.history):
                # SSE format requires "data: <json>\n\n"
                yield f"data: {chunk}\n\n"
        except Exception as e:
            yield f"data: {{\"type\": \"error\", \"content\": \"{str(e)}\"}}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
