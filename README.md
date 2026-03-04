# Document Analyzer API

## Setup
1. Create a `.env` file in the root directory and add your OpenAI Key:
   `OPENAI_API_KEY=your-api-key-here`
2. Activate your virtual environment: `source venv/bin/activate`
3. Run the API: `uvicorn main:app --reload --port 8000`

## Endpoints
POST `/query`
```json
{
  "query": "Hello"
}
```
