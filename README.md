<div align="center">
  <img src="logo.svg" alt="Exics AI Logo" width="120" />
  
  <h1 align="center">
    <img src="https://readme-typing-svg.herokuapp.com/?font=Inter&weight=700&size=32&pause=1000&color=000000&center=true&vCenter=true&width=1000&lines=Exics+AI+-+RAG-Based+Technical+Documentation+Assistant;Exics+AI+-+Medical+Document+Analysis+Pipeline;Exics+AI+-+Agentic+Research+Companion" alt="Exics AI - RAG-Based Technical Documentation Assistant" />
  </h1>

  <p align="center">
    <strong>Advanced Medical & Technical Document Analysis Pipeline</strong>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/LangGraph-1C1C1C?style=for-the-badge&logo=langchain&logoColor=white" alt="LangGraph" />
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Qdrant-D32F2F?style=for-the-badge&logo=database&logoColor=white" alt="Qdrant" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  </p>
</div>

<br />

## 🌟 Project Overview

**Exics AI** is a state-of-the-art Retrieval-Augmented Generation (RAG) platform designed to ingest, process, and query complex technical and medical documents. By combining a **FastAPI** backend with a dynamic **LangGraph** orchestrator and a sleek **React** frontend, Exics AI ensures that users can converse with their data without context-bleeding or hallucination.

### Key Features
- **Document-Aware Memory**: Strict per-chat document scoping ensures context doesn't bleed across different research sessions.
- **LangGraph Agentic RAG**: Complex query analysis, document retrieval, and answer generation are handled robustly via a cyclic directed graph.
- **Real-Time UI**: TanStack Start + Tailwind frontend providing an app-like experience for uploading and chatting with PDFs.
- **Persistent Vector Store**: High-performance semantic search powered by Qdrant and local SentenceTransformers.

---

## 🏗 System Architecture

```mermaid
graph TD
    %% Styling
    classDef frontend fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef backend fill:#1e293b,stroke:#10b981,stroke-width:2px,color:#fff;
    classDef external fill:#0f172a,stroke:#eab308,stroke-width:2px,color:#fff;
    
    subgraph Frontend [UI Layer - React & TanStack Start]
        UI[User Interface]:::frontend
        Chat[Chat Interface]:::frontend
        DocUp[Document Upload]:::frontend
    end

    subgraph Backend [API Layer - FastAPI]
        API[FastAPI Endpoints]:::backend
        Ingest[Document Ingestion]:::backend
        Auth[Auth Service]:::backend
        
        subgraph Orchestrator [LangGraph RAG Agent]
            QA[Query Analysis]:::backend
            Ret[Retrieval Node]:::backend
            Gen[Generation Node]:::backend
            Fallback[Web Search Fallback]:::backend
        end
    end

    subgraph Infrastructure [Data Storage & External Services]
        Supabase[(Supabase - Relational DB)]:::external
        Qdrant[(Qdrant - Vector DB)]:::external
        LLM[LLM APIs / Groq / OpenAI]:::external
    end

    %% Flow connections
    DocUp -->|PDF / Doc| Ingest
    Chat -->|Query Context| API
    UI --> Auth

    Ingest -->|Text Chunks| Qdrant
    API --> QA
    QA -->|Determine intent| Ret
    QA -->|Not in docs| Fallback
    Ret -->|Fetch similar vectors| Qdrant
    Ret --> Gen
    Fallback --> Gen
    Gen -->|Response & Sources| Chat
    Gen --> LLM

    Auth -.-> Supabase
```

---

## 📂 Project Structure

| Directory / Component | Description | Technologies |
| :--- | :--- | :--- |
| **`/src`** | Modern frontend UI allowing users to upload documents and chat with context. | React, TanStack Start, Tailwind, shadcn/ui |
| **`/backend/api`** | RESTful API endpoints for ingestion, query, and history management. | FastAPI |
| **`/backend/graph`** | Stateful workflow orchestrator routing queries through RAG steps. | LangGraph, Langchain |
| **`/backend/services`**| Handlers for specific business logic: embeddings, vector DB, auth. | PyPDF2, SentenceTransformers |
| **`Qdrant`** | High-performance vector database to store and search document embeddings. | Qdrant Client |
| **`Supabase`** | PostgreSQL database for robust relational storage of users, chats, docs. | Supabase Client |

---

## 🚀 Setup Instructions

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & npm (or bun)
- **Supabase Account** (for PostgreSQL)
- **Qdrant** (Local or Cloud)

### Environment Variables
Create a `.env` file in the `/backend` directory:
```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Database URL
DATABASE_URL=your_postgres_connection_string

# Qdrant
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_key

# LLM Providers (Add what you plan to use)
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
```

### Running the Application

#### 1. Start the Backend
```bash
cd backend
python -m venv venv
# Activate venv:
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### 2. Start the Frontend
```bash
# In the root directory
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

---

## 🔌 Example API Requests & Responses

### 1. Upload a Document for Ingestion
**Request:**
```http
POST /api/v1/ingest/upload
Content-Type: multipart/form-data

file: <document.pdf>
chat_id: "uuid-of-current-chat"
```
**Response:**
```json
{
  "status": "success",
  "document_id": "doc-uuid-1234",
  "chunks_processed": 45
}
```

### 2. Query the RAG Pipeline
**Request:**
```http
POST /api/v1/query
Content-Type: application/json

{
  "message": "What are the side effects mentioned in the study?",
  "chat_id": "uuid-of-current-chat",
  "doc_ids": ["doc-uuid-1234"]
}
```
**Response:**
```json
{
  "reply": "Based on the uploaded document, the primary side effects observed were mild nausea and headaches in 12% of the participants.",
  "sources": [
    {
      "page": 4,
      "snippet": "...side effects observed were mild nausea..."
    }
  ]
}
```

---

## 🧠 Thought Process & Write-Up

### Architecture & Workflow Reasoning
The decision to use **LangGraph** instead of standard Langchain sequential chains was driven by the need for stateful and resilient pipelines. In medical research, if a retrieval step returns poor context, an agentic graph can fallback to web search or re-phrase the query, rather than hallucinating an answer. **FastAPI** was selected for its asynchronous capabilities, making it ideal for streaming LLM responses and handling concurrent I/O operations (DB writes, Embedding generation).

### Chunking & Embedding Strategy Choices
- **Strategy**: I utilized the `RecursiveCharacterTextSplitter` with a chunk size of `1000` tokens and an overlap of `200` tokens. 
- **Reasoning**: Medical documents often contain long, complex paragraphs. A 1000-chunk size ensures that sufficient context is retained for the LLM to understand medical concepts without truncating sentences halfway. The 200 overlap prevents crucial boundary information from being lost between chunks.
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (or similar dense models via HuggingFace) provide a highly efficient balance between embedding quality and local computational speed, drastically reducing external API latency.

### Design Decisions & Tradeoffs
1. **Per-Chat Document Scoping**: Instead of querying a massive global vector store, documents are linked via junction tables (`chat_documents`) to specific sessions. *Tradeoff*: This requires passing `doc_ids` constantly and limits cross-document synthesis across distinct chat sessions, but guarantees absolute accuracy and prevents context-bleeding.
2. **Local vs API Embeddings**: Utilizing local `sentence-transformers` saves cost and ensures data privacy (crucial for medical data), but shifts the compute burden to the hosting server.
3. **Database**: Supabase provides immediate out-of-the-box Auth and PostgreSQL. Qdrant is specifically optimized for vector operations. Keeping relational data and vector data separate ensures we use the best tool for each specific job.

### Future Improvements
- **Hybrid Search**: Implementing Sparse-Dense hybrid search (e.g., BM25 + Vector) in Qdrant to better handle exact keyword matches (like specific drug names or gene sequences).
- **Advanced OCR**: Integrating Vision LLMs or advanced Tesseract pipelines to ingest charts and tables from medical PDFs.
- **Streaming UI**: Polishing the frontend to handle Server-Sent Events (SSE) for word-by-word streaming of LLM responses, improving perceived latency.

<br />

<div align="center">
  <i>Built with dedication for Exics AI.</i>
</div>
