"""
download_qwen_gguf.py
Downloads Qwen2.5-Coder-7B-Instruct in GGUF Q4_K_M format.
Single file ~4.4GB. No quantization step needed.

Q4_K_M = 4-bit quantization, medium quality variant
Best balance of speed/quality/VRAM for RTX 3050 6GB.

Usage:
    python download_qwen_gguf.py
"""

import os
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("downloader")

# ── Config ────────────────────────────────────────────────────────────
REPO_ID   = "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF"
FILENAME  = "qwen2.5-coder-7b-instruct-q4_k_m.gguf"
OUTPUT_DIR = r"C:\Users\NIHAL 2\PycharmProjects\MajorProject\qwen25_coder_7b_gguf"
# ── Download ──────────────────────────────────────────────────────────

def download():
    output_path = Path(OUTPUT_DIR)
    output_path.mkdir(parents=True, exist_ok=True)

    dest = output_path / FILENAME
    if dest.exists():
        size_gb = dest.stat().st_size / (1024**3)
        logger.info(f"File already exists ({size_gb:.1f}GB): {dest}")
        logger.info("Delete it and re-run if you want to re-download.")
        return

    logger.info(f"Downloading: {REPO_ID}/{FILENAME}")
    logger.info(f"Saving to:   {dest}")
    logger.info("This is ~4.4GB — will take a few minutes...")

    try:
        from huggingface_hub import hf_hub_download

        hf_hub_download(
            repo_id=REPO_ID,
            filename=FILENAME,
            local_dir=OUTPUT_DIR,
            local_dir_use_symlinks=False,
        )

        size_gb = dest.stat().st_size / (1024**3)
        logger.info(f"\n✅ Download complete → {dest} ({size_gb:.1f}GB)")
        logger.info(f"Model path for llm.py: {dest}")

    except ImportError:
        logger.error("huggingface_hub not installed. Run: pip install huggingface_hub")
        raise
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise


if __name__ == "__main__":
    download()