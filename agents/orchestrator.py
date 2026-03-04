from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from agents.worker import WorkerAgent
import os
import json
from typing import AsyncGenerator, List, Dict
from dotenv import load_dotenv

load_dotenv()

class OrchestratorAgent:
    def __init__(self):
        # Initialize LLM for evaluating the route
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        self.worker = WorkerAgent()
        
        # Prompt to classify the user's intent
        self.routing_prompt = PromptTemplate.from_template(
            "You are a routing agent for an API. Evaluate the following user query: '{query}'\n"
            "If it is a general conversational message (e.g., 'Hello', 'How are you', 'Who are you'), "
            "respond with 'CONVERSATIONAL'.\n"
            "If it asks for information that might be extracted from a document, "
            "respond with 'DOCUMENT'.\n"
            "Respond ONLY with 'CONVERSATIONAL' or 'DOCUMENT'."
        )

    async def process_query_stream(self, query: str, history: List[Dict] = []) -> AsyncGenerator[str, None]:
        """
        Evaluates the query and routes it either to a direct greeting or to the Worker Agent.
        Yields JSON strings for SSE streaming.
        """
        yield json.dumps({"type": "status", "content": "Analyzing query intent..."})
        
        route_chain = self.routing_prompt | self.llm
        route_response = await route_chain.ainvoke({"query": query})
        route = route_response.content.strip().upper()

        if route == "CONVERSATIONAL":
            yield json.dumps({"type": "status", "content": "Generating conversational response..."})
            conv_prompt = PromptTemplate.from_template(
                "You are a helpful document analyzer assistant. Respond conversationally "
                "to the following user message: '{query}'"
            )
            conv_chain = conv_prompt | self.llm
            response = await conv_chain.ainvoke({"query": query})
            yield json.dumps({"type": "answer", "content": response.content})
            
        else:
            # Route to the Worker Agent for document retrieval
            async for chunk in self.worker.search_and_answer_stream(query, history):
                yield chunk
