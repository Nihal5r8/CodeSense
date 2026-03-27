# llm.py
# Qwen2.5-Coder-7B-Instruct GGUF loader and inference engine
# Uses llama-cpp-python with CUDA acceleration (cublas backend)
# Optimized for RTX 3050 6GB
#
# Why GGUF + llama-cpp over GPTQ + auto-gptq on Windows:
#   - llama-cpp-python has proper pre-built Windows CUDA wheels
#   - No source compilation needed
#   - Faster generation: ~25-40s vs ~120s with GPTQ fallback kernels
#   - Single .gguf file instead of multiple weight shards
#   - n_gpu_layers=-1 offloads ALL layers to GPU, zero CPU involvement

import os
import logging

logger = logging.getLogger("llm")

# ---------------------------------------------------------------------
# GLOBAL CACHE (MODEL LOADS ONLY ONCE)
# ---------------------------------------------------------------------
_MODEL = None

# ---------------------------------------------------------------------
# MODEL PATH
# Points to the single .gguf file downloaded by download_qwen_gguf.py
# Set env var MODEL_PATH to override.
# ---------------------------------------------------------------------
_DEFAULT_MODEL_PATH = r"C:\Users\NIHAL 2\PycharmProjects\MajorProject\qwen25_coder_7b_gguf\qwen2.5-coder-7b-instruct-q4_k_m.gguf"
MODEL_PATH = os.environ.get("MODEL_PATH", _DEFAULT_MODEL_PATH)


# ---------------------------------------------------------------------
# MODEL LOADER
# n_gpu_layers=-1  → offload ALL transformer layers to GPU (fastest)
# n_ctx=4096       → context window (fits our longest prompts)
# n_batch=512      → prompt processing batch size
# verbose=False    → suppress llama.cpp internal logs
# ---------------------------------------------------------------------
def load_model():
    global _MODEL

    if _MODEL is not None:
        return _MODEL

    logger.info(f"Loading Qwen2.5-Coder-7B GGUF from: {MODEL_PATH}")
    logger.info("This happens only once.")

    try:
        from llama_cpp import Llama
    except ImportError:
        raise ImportError(
            "llama-cpp-python not installed.\n"
            "Run: pip install llama-cpp-python --extra-index-url "
            "https://abetlen.github.io/llama-cpp-python/whl/cu121"
        )

    _MODEL = Llama(
        model_path=MODEL_PATH,
        n_gpu_layers=-1,        # Offload ALL layers to GPU — zero CPU for inference
        n_ctx=4096,             # Context window — enough for our longest prompts
        n_batch=512,            # Batch size for prompt processing
        n_threads=4,            # CPU threads for non-GPU ops (tokenization etc.)
        verbose=False,          # Suppress llama.cpp internal logs
    )

    logger.info("Model loaded on GPU. Ready for inference.")
    return _MODEL


# ---------------------------------------------------------------------
# TEXT GENERATION
# Uses llama-cpp create_chat_completion which handles Qwen's ChatML
# template automatically — no manual [INST] wrapping needed.
#
# temperature=0  → fully deterministic (equivalent to do_sample=False)
# repeat_penalty → prevents repetition loops
# max_tokens     → equivalent to max_new_tokens in transformers
# ---------------------------------------------------------------------
def generate_response(
    prompt: str,
    max_new_tokens: int = 800,
    max_time: float = 120.0,   # kept for API compatibility, not used by llama-cpp
) -> str:

    model = load_model()

    response = model.create_chat_completion(
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=max_new_tokens,
        temperature=0.0,        # Fully deterministic
        repeat_penalty=1.05,    # Prevent repetition loops
        stop=["<|im_end|>", "<|endoftext|>"],  # Qwen stop tokens
    )

    text = response["choices"][0]["message"]["content"]
    return text.strip()


# ---------------------------------------------------------------------
# GPU MEMORY CLEANUP (no-op for llama-cpp, kept for API compatibility)
# ---------------------------------------------------------------------
def clear_gpu_cache():
    pass


# ---------------------------------------------------------------------
# SMOKE TEST
# Usage: python backend/llm.py
# ---------------------------------------------------------------------
if __name__ == "__main__":
    import time
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger.info("Running smoke test...")
    t = time.time()
    result = generate_response("Write a Python function to add two numbers.", max_new_tokens=100)
    elapsed = round(time.time() - t, 1)
    logger.info(f"Generated in {elapsed}s")
    logger.info(f"Model response:\n{result}")