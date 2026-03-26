# CodeSense — LLM-Based Intelligent Code Debugger and Analyzer

> A fully local, GPU-accelerated AI coding assistant. No cloud API. No data leaves your machine.

CodeSense runs **Qwen2.5-Coder-7B-Instruct** entirely on your local GPU via llama-cpp-python. It generates code, debugs bugs with a side-by-side diff panel, and answers coding questions — all with interactive React Flow diagrams, step-by-step explanations, complexity analysis, and test cases.

---

## Table of Contents

- [How It Works](#how-it-works)
- [System Architecture](#system-architecture)
- [Three Modes](#three-modes)
- [Prerequisites](#prerequisites)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install CUDA and GPU Drivers](#2-install-cuda-and-gpu-drivers)
  - [3. Set Up Python Backend](#3-set-up-python-backend)
  - [4. Download the Qwen Model](#4-download-the-qwen-model)
  - [5. Update Model Path in Config](#5-update-model-path-in-config)
  - [6. Install Docker Desktop](#6-install-docker-desktop)
  - [7. Start Redis and Frontend with Docker Compose](#7-start-redis-and-frontend-with-docker-compose)
  - [8. Run the Backend Server](#8-run-the-backend-server)
  - [9. Open the App](#9-open-the-app)
- [Project Structure](#project-structure)
- [Configuration Reference](#configuration-reference)
- [Output Options](#output-options)
- [Session Management](#session-management)
- [Voice Input](#voice-input)
- [Troubleshooting](#troubleshooting)

---

## How It Works

CodeSense uses a **two-pass LLM pipeline** for Generate and Debug modes:

```
User Prompt
    │
    ▼
detect_mode()          ← scored keyword matching → generate | debug | chat
    │
    ▼
Redis session history  ← injects last 4 exchanges as context prefix
    │
    ▼
Pass 1 (650–700 tokens)
  ├── METADATA section  → language, algorithm name
  └── CODE section      → complete working / corrected code
    │
    ▼
Pass 2 (1200 tokens)   ← text sections FIRST to guarantee completion
  ├── ANNOTATED CODE    → step-by-step explanation (mode-specific depth)
  ├── COMPLEXITY        → time and space with reasoning
  ├── TEST CASES        → concrete inputs and expected outputs
  └── VISUALIZATION     → React Flow JSON (four-layer fallback if incomplete)
    │
    ▼
visualizer.py          ← Layer 1: LLM JSON
                          Layer 2: Python AST (Python only)
                          Layer 3: Universal regex (all languages)
                          Layer 4: Minimal 3-node fallback (never crashes)
    │
    ▼
FastAPI response       ← JSON with all 6 sections, respects output options
    │
    ▼
React frontend         ← renders code, diff, diagram, steps, complexity, tests
```

**Chat mode** is single-pass — lightweight, no two-pass overhead.

**SSE streaming** emits progress at each stage (detecting → generating → parsing → rendering → done) so the frontend shows a live pipeline status with elapsed timer.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────────┐      ┌──────────────────────┐    │
│  │  React Frontend  │      │       Redis           │    │
│  │  (nginx:80)      │      │  Session Store        │    │
│  │  React 19        │      │  port 6379            │    │
│  │  @xyflow/react   │      │  TTL: 1hr, max 4      │    │
│  │  framer-motion   │      │  exchanges/session    │    │
│  └────────┬─────────┘      └──────────────────────┘    │
│           │ REST + SSE                                  │
└───────────┼─────────────────────────────────────────────┘
            │ port 8000
┌───────────▼─────────────────────────────────────────────┐
│              FastAPI Backend (bare-metal)                 │
│                                                          │
│  app.py         ← main API, mode detection, pipeline     │
│  llm.py         ← Qwen2.5-Coder-7B GGUF singleton       │
│  parser.py      ← ===SECTION=== extractor               │
│  visualizer.py  ← 4-layer React Flow JSON builder       │
│                                                          │
│  ThreadPoolExecutor (1 worker)                           │
│  └── LLM inference runs here (non-blocking)             │
│  └── Whisper transcription runs here                     │
│                                                          │
│  GPU: NVIDIA RTX (min 6GB VRAM)                         │
│  Model: Qwen2.5-Coder-7B-Instruct Q4_K_M GGUF          │
└──────────────────────────────────────────────────────────┘
```

---

## Three Modes

### Generate Mode
Ask the system to write code for you.

- **Outputs**: metadata, complete code, 5-step detailed explanation, complexity, test cases, React Flow diagram
- **Explanation depth**: thorough — assumes user is seeing this code for the first time
- **Example prompts**: `generate a code for merge sort in python`, `write a binary search in java`, `implement dijkstra's algorithm in c++`

### Debug Mode
Paste broken code and ask the system to fix it.

- **Outputs**: mandatory diff panel (side-by-side Before/After), fixed code, 5-step bug analysis (location → root cause → incorrect behavior → fix → why fix works) + brief summary, complexity, test cases, React Flow diagram
- **Explanation depth**: concise — assumes user already knows the code
- **Example prompts**: `fix this code`, `there's a bug in my function`, `debug this`, paste code and say `fix`
- **Diff extraction**: automatically extracts original code from backtick fences, indented blocks, or keyword-based scanning

### Chat Mode
Ask coding questions conversationally.

- **Outputs**: plain text answer with optional structured sections (test cases, complexity, step-by-step) based on relevance
- **Output options panel**: hidden in Chat Mode
- **No code generation or diff**: lightweight single-pass
- **Example prompts**: `what is dynamic programming?`, `explain the difference between BFS and DFS`, `when should I use a hash map vs a tree?`

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Windows | 10 / 11 | Linux also supported |
| Python | 3.10+ | For backend |
| Node.js | 18+ | For frontend dev (Docker handles prod) |
| NVIDIA GPU | 6GB VRAM | RTX 3050 6GB tested; more VRAM = faster |
| CUDA Toolkit | 12.1+ | Must match your GPU driver |
| Docker Desktop | Latest | For Redis + frontend containers |
| Git | Any | For cloning |

> **No NVIDIA GPU?** The model can run on CPU but inference will be extremely slow (10–15 minutes per request). Not recommended for regular use.

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/codesense.git
cd codesense
```

Your project structure should look like:

```
codesense/
├── backend/
│   ├── app.py
│   ├── llm.py
│   ├── parser.py
│   ├── visualizer.py
│   └── qwen_install.py      ← model downloader script
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

---

### 2. Install CUDA and GPU Drivers

> Skip this if you already have CUDA 12.1+ installed.

**Windows:**

1. Download and install the latest NVIDIA driver from: https://www.nvidia.com/Download/index.aspx
2. Download CUDA Toolkit 12.1+ from: https://developer.nvidia.com/cuda-downloads
3. Verify installation:
   ```bash
   nvidia-smi
   nvcc --version
   ```

**Ubuntu/Linux:**

```bash
# Add NVIDIA package repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get install -y cuda-toolkit-12-1

# Verify
nvidia-smi
nvcc --version
```

---

### 3. Set Up Python Backend

**Create a virtual environment:**

```bash
cd codesense

# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

**Install Python dependencies:**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**Install llama-cpp-python with CUDA support:**

> This is a separate step because it requires the CUDA-specific wheel.

```bash
# Windows (CUDA 12.1)
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121

# Linux (CUDA 12.1)
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python

# If you have CUDA 12.2+, replace cu121 with cu122 in the URL above
```

Verify the install worked:
```bash
python -c "from llama_cpp import Llama; print('llama-cpp-python OK')"
```

---

### 4. Download the Qwen Model

The model file is **not included** in this repository (it is ~4.5GB). Run the provided installer script to download it:

```bash
cd backend
python qwen_install.py
```

This script will:
- Create a `qwen25_coder_7b_gguf/` folder inside `backend/`
- Download `qwen2.5-coder-7b-instruct-q4_k_m.gguf` from Hugging Face (~4.5GB)
- Show download progress
- Print the full path to the downloaded model file

> **Note:** You need a Hugging Face account and `huggingface_hub` installed. The script handles this automatically. Alternatively, download manually from:
> https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF

**Expected output:**
```
Downloading qwen2.5-coder-7b-instruct-q4_k_m.gguf...
Download complete.
Model saved to: C:\...\codesense\backend\qwen25_coder_7b_gguf\qwen2.5-coder-7b-instruct-q4_k_m.gguf
```

---

### 5. Update Model Path in Config

Open `backend/llm.py` and update the `_DEFAULT_MODEL_PATH` to the path printed by `qwen_install.py`:

```python
# backend/llm.py  — line ~20

# Change this:
_DEFAULT_MODEL_PATH = r"C:\Users\NIHAL 2\PycharmProjects\MajorProject\..."

# To the path on YOUR machine, for example:
_DEFAULT_MODEL_PATH = r"C:\Users\YourName\codesense\backend\qwen25_coder_7b_gguf\qwen2.5-coder-7b-instruct-q4_k_m.gguf"

# Linux example:
_DEFAULT_MODEL_PATH = "/home/yourname/codesense/backend/qwen25_coder_7b_gguf/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
```

> **Tip:** You can also set the `MODEL_PATH` environment variable instead of editing the file:
> ```bash
> # Windows PowerShell
> $env:MODEL_PATH = "C:\path\to\your\model.gguf"
>
> # Linux / macOS
> export MODEL_PATH="/path/to/your/model.gguf"
> ```

---

### 6. Install Docker Desktop

> Skip this if Docker Desktop is already installed.

**Windows / macOS:**
1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop/
2. Run the installer and follow the prompts
3. Start Docker Desktop and wait for it to say "Docker is running"
4. Verify:
   ```bash
   docker --version
   docker compose version
   ```

**Ubuntu/Linux:**
```bash
# Install Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (avoid needing sudo)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt-get install docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

### 7. Start Redis and Frontend with Docker Compose

From the project root (where `docker-compose.yml` lives):

```bash
docker compose up -d
```

This starts:
- **Redis** container on port `6379` — handles session memory
- **Frontend** container on port `80` — serves the React app via nginx

Check both are running:
```bash
docker compose ps
```

Expected output:
```
NAME             STATUS
llm_redis        running
llm_frontend     running
```

> **If you get a "No such container" error** when restarting, run:
> ```bash
> docker compose down
> docker compose up -d
> ```
> This clears stale container state.

---

### 8. Run the Backend Server

Make sure your Python virtual environment is active, then from the project root:

```bash
# Windows
venv\Scripts\activate
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Linux / macOS
source venv/bin/activate
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**First startup will be slow** — the Qwen model loads into GPU VRAM on the first request (~20–30 seconds). Subsequent requests reuse the loaded model.

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Loading Qwen2.5-Coder-7B GGUF from: /path/to/model.gguf   ← on first request
INFO:     Model loaded on GPU. Ready for inference.
```

Health check (in another terminal):
```bash
curl http://localhost:8000/api/health
# Expected: {"status":"ok","model_loaded":true,"redis":true}
```

---

### 9. Open the App

Open your browser and go to:

```
http://localhost
```

You should see the CodeSense interface with:
- **Model Ready ✓** badge in the top-left panel
- **System Prompt** textarea ready for input
- **Output Options** checkboxes below the textarea

---

## Project Structure

```
codesense/
│
├── backend/
│   ├── app.py              Main FastAPI app. Contains:
│   │                         - detect_mode()        keyword-based mode classifier
│   │                         - _run_two_pass()       two-pass LLM pipeline
│   │                         - _extract_original_code()  diff extraction
│   │                         - _resolve_language()   fingerprint-based language detection
│   │                         - _build_context_prefix()   Redis session injection
│   │                         - All API endpoints (/api/generate, /api/status, etc.)
│   │
│   ├── llm.py              Qwen2.5-Coder-7B singleton loader.
│   │                         - Loads GGUF model once, caches in _MODEL global
│   │                         - n_gpu_layers=-1 (full GPU offload)
│   │                         - temperature=0.0 (deterministic output)
│   │
│   ├── parser.py           Structured output parser.
│   │                         - Extracts ===SECTION=== delimited blocks
│   │                         - Strips ### markdown heading artifacts
│   │                         - Cleans backtick fences from code sections
│   │
│   ├── visualizer.py       Four-layer React Flow JSON builder.
│   │                         - Layer 1: parse LLM JSON from ===VISUALIZATION===
│   │                         - Layer 2: Python AST walker (Python only)
│   │                         - Layer 3: Universal regex (all languages)
│   │                         - Layer 4: Minimal 3-node fallback
│   │
│   └── qwen_install.py     Model downloader. Run once before first launch.
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 Root component. All global state, SSE logic.
│   │   ├── services/api.js         All backend fetch calls.
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── Header.jsx      App title bar with mode pill decorations.
│   │       │   └── PromptPanel.jsx Left panel: textarea, mic, options, submit.
│   │       ├── ui/
│   │       │   ├── StatusPanel.jsx  SSE pipeline progress tracker.
│   │       │   ├── ResultCard.jsx   Collapsible section wrapper.
│   │       │   └── DiffPanel.jsx    Side-by-side diff (Debug mode only).
│   │       ├── analysis/
│   │       │   ├── CodeBlock.jsx           Syntax-highlighted code panel.
│   │       │   ├── MarkdownPanel.jsx       Step-by-step explanation renderer.
│   │       │   ├── MetadataCard.jsx        Language/mode/algorithm/time badges.
│   │       │   ├── PerformanceMetricsCard.jsx  Time + space complexity.
│   │       │   └── ChatResponsePanel.jsx   Chat mode result renderer.
│   │       └── diagram/
│   │           └── ReactFlowDiagram.jsx    Interactive flowchart canvas.
│   │
│   ├── Dockerfile          nginx production build
│   └── package.json        React 19, @xyflow/react, framer-motion, etc.
│
├── docker-compose.yml      Orchestrates frontend (port 80) + Redis (port 6379)
└── requirements.txt        Python backend dependencies
```

---

## Configuration Reference

### Environment Variables (Backend)

| Variable | Default | Description |
|---|---|---|
| `MODEL_PATH` | hardcoded in `llm.py` | Full path to the `.gguf` model file |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |

Set them before running the backend:
```bash
# Windows PowerShell
$env:MODEL_PATH = "C:\path\to\qwen2.5-coder-7b-instruct-q4_k_m.gguf"
$env:REDIS_HOST = "localhost"

# Linux / macOS
export MODEL_PATH="/path/to/qwen2.5-coder-7b-instruct-q4_k_m.gguf"
export REDIS_HOST="localhost"
```

### Environment Variables (Frontend)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL |

Set at Docker build time or in `frontend/.env`:
```
VITE_API_URL=http://localhost:8000
```

### Session Settings (backend/app.py)

| Constant | Default | Description |
|---|---|---|
| `MAX_HISTORY` | `4` | Max exchanges stored per session in Redis |
| `SESSION_TTL` | `3600` | Session expiry in seconds (1 hour) |
| `PASS1_TOKENS` | `700 / 650` | Max tokens for Pass 1 (generate / debug) |
| `PASS2_TOKENS` | `1200` | Max tokens for Pass 2 (both modes) |
| `CHAT_TOKENS` | `700` | Max tokens for Chat mode |

---

## Output Options

Six sections can be toggled on/off in the left panel before submitting:

| Option | Generate Mode | Debug Mode |
|---|---|---|
| **Show Metadata** | Language, algorithm name, process time | Language, target function, process time |
| **Show Code** | Generated code block | Fixed code block + diff panel |
| **Show Diagram** | React Flow diagram of algorithm | React Flow diagram of fixed code |
| **Show Step-by-Step** | 5-step detailed walkthrough | 5-step bug analysis + summary |
| **Show Complexity** | Time and space with reasoning | Time and space with reasoning |
| **Show Test Cases** | 3 concrete test cases | 3 test cases validating the fix |

> The Output Options panel is **hidden in Chat Mode** — Chat always returns whatever sections are relevant.

---

## Session Management

CodeSense remembers your recent work within a session:

- **Session ID** is generated once and saved in your browser's `localStorage` under `codesense_session_id`
- Persists across **page reloads** — context is not lost when you refresh
- **Redis** stores up to 4 recent exchanges (prompt summary + first 600 chars of code)
- Each new request injects the history as a context prefix so the model understands what you were working on
- The **"Using conversation context"** green badge appears when history is being injected
- Click **New Session** to clear history and start fresh

---

## Voice Input

1. Click the **microphone button** in the prompt panel
2. Speak your prompt clearly (recording auto-stops after 10 seconds)
3. Click the mic button again to stop early
4. The system transcribes using **Whisper small** (CPU, int8 quantized, ~1–3 seconds)
5. Transcribed text populates the textarea — review and submit

> Voice input requires microphone permission in your browser. On first use, click "Allow" when the browser asks.

---

## Troubleshooting

### `redis-cli` not found on Windows
Redis CLI may not be in your PATH. Navigate to the Redis install directory:
```powershell
cd "C:\Program Files\Redis"
.\redis-cli.exe ping
.\redis-cli.exe keys "session:*"
```
Or use Docker:
```bash
docker exec -it llm_redis redis-cli ping
docker exec -it llm_redis redis-cli keys "session:*"
```

### Model not loading / CUDA out of memory
- Check VRAM with `nvidia-smi` — you need at least 6GB free
- Close other GPU-intensive applications
- Verify llama-cpp-python was installed with CUDA: `python -c "from llama_cpp import Llama; print(Llama.__doc__)"`

### Backend shows `[SESSION] No history — fresh context` every request
- Verify Redis is running: `docker compose ps`
- Check backend logs for `Redis write failed` warnings
- Confirm `REDIS_HOST=localhost` and port 6379 is not blocked

### Docker Compose error: `No such container`
Stale container state — run:
```bash
docker compose down
docker compose up -d
```

### Frontend shows "Backend Offline"
- Ensure the backend is running on port 8000
- Check CORS is not blocked — the backend allows all origins by default
- Try: `curl http://localhost:8000/api/health`

### `###` symbols appearing in output
Update to the latest `parser.py` — the `strip_markdown_headings()` function removes these artifacts.

### Diagram shows "Simplified diagram" warning
The LLM JSON was invalid or incomplete. The system automatically fell back to Python AST or regex-based diagram. This is expected behavior — the diagram is still valid and useful.

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| LLM | Qwen2.5-Coder-7B-Instruct (Q4_K_M GGUF) |
| Inference engine | llama-cpp-python (CUDA backend) |
| Backend | FastAPI + Python 3.10+ |
| Speech-to-text | faster-whisper (small, CPU, int8) |
| Session store | Redis 7+ |
| Frontend | React 19, Vite, TailwindCSS v4 |
| Diagrams | @xyflow/react (React Flow) |
| Animations | framer-motion |
| Syntax highlighting | react-syntax-highlighter (vscDarkPlus) |
| Icons | lucide-react |
| Containerization | Docker + Docker Compose |
| Web server | nginx (frontend production) |

---

## License

This project was developed as a Major Project for the Bachelor of Technology in Computer Science and Engineering at Gokaraju Rangaraju Institute of Engineering and Technology (GRIET), Hyderabad, 2025–2026.

- Yerra Nihal (22241A05R8)

**Guide:** Dr. K. Butchiraju, Professor & Dean of T&P, Department of CSE
