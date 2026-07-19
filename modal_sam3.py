"""
modal_sam3.py — SquareRate SAM 3.1 serverless inference worker.

Deploys Meta's gated `facebook/sam3.1` open-vocabulary segmentation engine to
Modal as a warm-start GPU web endpoint. It is the inference half of the
SquareRate scan pipeline: the frontend (see `lib/types.ts` — the JobDoc carries
`jobId`, `lat`, `lng`, `surfaceType`, `polygonCoords`) hands off a satellite
crop, the surface-type text prompt, and pixel-space bounding boxes; this worker
returns a single binary black/white mask isolating the target surface.

Data contract (matches the app's scan payload):
    {
      "jobId":       str,               # opaque; echoed back for traceability
      "image_url":   str,               # https URL to the 640x640 source crop
                                        # (or "image_b64": base64 PNG/JPEG)
      "prompt":      str | list[str],   # surface text prompt(s), e.g. "roof"
      "boxes":       [[x1, y1, x2, y2], ...],  # pixel corners in the 640 frame
      "frame_size":  int (optional, default 640)
    }

Response:
    {
      "jobId":  str,
      "mask_png_b64": str,   # base64 PNG, white = target surface, black = bg
      "width":  int,
      "height": int
    }

Deploy:
    modal secret create HF_TOKEN HF_TOKEN=hf_xxx   # gated Meta repo access
    modal deploy modal_sam3.py
"""

from __future__ import annotations

import base64
import contextlib
import io
import os

import modal

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
APP_NAME = "squarerate-sam3"
MODEL_REPO = "facebook/sam3.1"
# Checkpoint filename inside the gated repo (see sam3.model_builder
# .download_ckpt_from_hf: version "sam3.1" -> "sam3.1_multiplex.pt").
CKPT_FILENAME = "sam3.1_multiplex.pt"
# Where the gated weights are baked into the image at build time so warm
# containers never pay a download / cold-start penalty.
MODEL_CACHE = "/models/sam3.1"
DEFAULT_FRAME = 640
# Systematic overestimate: grow the final mask outward by this many pixels
# (elliptical structuring element) before encoding. For surface-area estimation
# it's safer to slightly over- than under-cover the target. Tunable; set to 0 to
# disable. Note the real-world margin scales with the crop's meters-per-pixel,
# so a fixed pixel radius covers more ground on wider (lower-zoom) crops.
DILATE_PX = 6

# ---------------------------------------------------------------------------
# Build-time weight fetch
# ---------------------------------------------------------------------------
# Defined BEFORE the image so it can be passed to `.run_function` by reference.
# Modal serializes build functions by module + qualname and rejects lambdas, so
# this must be a proper top-level function.
def _download_weights() -> None:
    """Fetch gated `facebook/sam3.1` weights at build time into MODEL_CACHE.

    Runs inside the image build (`.run_function`) with the HF_TOKEN secret
    mounted, so the download happens once and is committed to the image layer.
    """
    import os as _os

    from huggingface_hub import snapshot_download

    token = _os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError(
            "HF_TOKEN secret not found. Create it with:\n"
            "  modal secret create HF_TOKEN HF_TOKEN=hf_xxx"
        )

    _os.makedirs(MODEL_CACHE, exist_ok=True)
    snapshot_download(
        repo_id=MODEL_REPO,
        local_dir=MODEL_CACHE,
        token=token,
        # Skip nothing — we want the full predictor checkpoint + config resident.
    )


# ---------------------------------------------------------------------------
# Image build
# ---------------------------------------------------------------------------
# CUDA-enabled debian_slim: torch/torchvision ship their own CUDA runtime
# wheels, so we only need a matching driver on the Modal GPU host (provided).
sam3_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget")
    .pip_install(
        "torch",
        "torchvision",
        "opencv-python",
        "numpy<2",  # SAM 3 / torch stack is built against the NumPy 1.x ABI.
        "pillow",
        "huggingface_hub",
        # SAM 3's core imports (sam3/sam/rope.py) need einops, but the package
        # only declares it under its optional `notebooks` extra — add it here.
        "einops",
        # model_builder eagerly imports the training data pipeline (via
        # SAM3InteractiveImagePredictor -> ... -> coco_json_loaders) AND the
        # video/multiplex predictor modules, even for pure image inference.
        # These deps are all imported at module-load time but are only declared
        # in SAM 3's optional extras, so add the batch here to avoid a
        # deploy-per-missing-module crawl.
        "pycocotools",
        "psutil",
        "hydra-core",
        "omegaconf",
        "scipy",
        "pandas",
        # SAM 3 imports `pkg_resources` at module load; setuptools >=81 dropped
        # it, so pin to a version that still ships it or the model crash-loops.
        "setuptools<80",
        # Required for @modal.fastapi_endpoint (no longer auto-installed).
        "fastapi[standard]",
        # Official Meta SAM 3 repository (the SAM 3 / 3.1 model code lives here).
        "git+https://github.com/facebookresearch/sam3.git",
    )
    # Bake the gated weights into the image layer using the HF_TOKEN secret so
    # they are resident on disk before the first request ever lands.
    .run_function(
        _download_weights,
        secrets=[modal.Secret.from_name("HF_TOKEN")],
    )
)

app = modal.App(APP_NAME, image=sam3_image)


# ---------------------------------------------------------------------------
# Inference class (warm-start optimized)
# ---------------------------------------------------------------------------
@app.cls(
    gpu="A10G",  # mid-tier: ample VRAM for SAM 3.1 image inference, cheap warm.
    image=sam3_image,
    secrets=[modal.Secret.from_name("HF_TOKEN")],
    scaledown_window=300,  # keep warm 5 min after last request.
    max_containers=4,
    timeout=600,  # allow cold GPU boot + model load + inference to finish.
    # min_containers=1,  # uncomment to keep one warm 24/7 (kills cold starts,
    #                      # but you pay for idle GPU time).
)
class Sam3Predictor:
    @modal.enter()
    def load(self) -> None:
        """Load the SAM 3.1 image model + processor into GPU memory once.

        Runs on container init (warm start) so per-request latency is just the
        forward pass, not a model load. Uses the still-image inference path
        (`build_sam3_image_model` + `Sam3Processor`) — the `build_sam3_predictor`
        entrypoint is a *video* predictor and is the wrong tool for a single
        satellite crop.
        """
        import torch

        from sam3 import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # Ampere+ perf: TF32 matmuls, bf16 autocast for the whole session.
        if self.device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

        ckpt_path = os.path.join(MODEL_CACHE, CKPT_FILENAME)

        # Load the gated SAM 3.1 checkpoint straight from the baked-in layer
        # (load_from_HF=False → no network at boot). `_load_checkpoint` inside
        # the builder extracts the detector (grounding + segmentation) weights,
        # which is exactly the image-segmentation stack we need. bpe_path=None
        # lets the builder resolve the tokenizer vocab shipped in the package.
        self.model = build_sam3_image_model(
            bpe_path=None,
            device=self.device,
            eval_mode=True,
            checkpoint_path=ckpt_path,
            load_from_HF=False,
        )
        self.processor = Sam3Processor(self.model, confidence_threshold=0.5)

    # ---- helpers ---------------------------------------------------------
    @staticmethod
    def _load_image(image_url: str | None, image_b64: str | None):
        """Return a PIL RGB image from a URL or base64 blob."""
        from PIL import Image

        if image_b64:
            raw = base64.b64decode(image_b64)
        elif image_url:
            import urllib.request

            with urllib.request.urlopen(image_url, timeout=30) as resp:
                raw = resp.read()
        else:
            raise ValueError("Provide either 'image_url' or 'image_b64'.")

        return Image.open(io.BytesIO(raw)).convert("RGB")

    @staticmethod
    def _scale_boxes(boxes, frame_size: int, w: int, h: int):
        """Scale incoming `[x1,y1,x2,y2]` corners from the upstream 640x640
        frame into actual image pixels, clamped to bounds and corner-order
        normalized. Returns a list of `(x1, y1, x2, y2)` float tuples.
        """
        sx = w / float(frame_size)
        sy = h / float(frame_size)
        out = []
        for b in boxes:
            x1, y1, x2, y2 = (float(v) for v in b)
            xlo, xhi = sorted((x1, x2))
            ylo, yhi = sorted((y1, y2))
            out.append(
                (
                    max(0.0, xlo * sx),
                    max(0.0, ylo * sy),
                    min(float(w), xhi * sx),
                    min(float(h), yhi * sy),
                )
            )
        return out

    @staticmethod
    def _to_norm_cxcywh(box_xyxy, w: int, h: int):
        """Convert a pixel `[x1,y1,x2,y2]` box into SAM 3's native spatial
        schema: normalized `[center_x, center_y, width, height]` in [0, 1].
        """
        x1, y1, x2, y2 = box_xyxy
        return [
            ((x1 + x2) / 2.0) / w,
            ((y1 + y2) / 2.0) / h,
            (x2 - x1) / w,
            (y2 - y1) / h,
        ]

    @staticmethod
    def _boxes_intersect(mask_bool, box_xyxy) -> bool:
        """True if the mask has any foreground pixel inside `box_xyxy`."""
        x1, y1, x2, y2 = (int(round(v)) for v in box_xyxy)
        sub = mask_bool[y1:y2, x1:x2]
        return bool(sub.any())

    # ---- inference -------------------------------------------------------
    @modal.method()
    def segment(
        self,
        image_url: str | None,
        image_b64: str | None,
        prompt,
        boxes,
        frame_size: int = DEFAULT_FRAME,
    ) -> dict:
        import numpy as np
        import torch

        image = self._load_image(image_url, image_b64)
        w, h = image.size

        prompts = [prompt] if isinstance(prompt, str) else list(prompt or [])
        if not prompts:
            raise ValueError("At least one text prompt is required.")

        # Coordinate correction: 640-frame corners -> image-pixel xyxy (kept for
        # the spatial-barrier filter) and -> normalized cxcywh (fed to SAM 3).
        px_boxes = self._scale_boxes(boxes or [], frame_size, w, h)

        union = np.zeros((h, w), dtype=bool)

        autocast = (
            torch.autocast("cuda", dtype=torch.bfloat16)
            if self.device == "cuda"
            else contextlib.nullcontext()
        )

        with torch.inference_mode(), autocast:
            state = self.processor.set_image(image)

            for text in prompts:
                self.processor.reset_all_prompts(state)

                # Open-vocabulary text prompt for the surface class...
                out = self.processor.set_text_prompt(state=state, prompt=text)

                # ...simultaneously constrained by the user's boxes in SAM 3's
                # native normalized cxcywh schema. Feeding positive geometric
                # prompts enforces the spatial barrier at prompt time.
                for b in px_boxes:
                    out = self.processor.add_geometric_prompt(
                        state=state,
                        box=self._to_norm_cxcywh(b, w, h),
                        label=True,
                    )

                # Per-instance masks (resized to the source resolution).
                inst_masks = _extract_masks(out if out is not None else state, (h, w))

                # Spatial barrier: keep only instances that actually intersect
                # one of the user's boundary boxes, then union them in.
                for m in inst_masks:
                    if not px_boxes or any(
                        self._boxes_intersect(m, b) for b in px_boxes
                    ):
                        union |= m

        # Grow the merged layer outward for a deliberate slight overestimate,
        # then encode as a binary black/white PNG (white = surface).
        union = _dilate_mask(union, DILATE_PX)
        png_b64 = _encode_mask_png(union)

        return {
            "mask_png_b64": png_b64,
            "width": int(w),
            "height": int(h),
        }


# ---------------------------------------------------------------------------
# Module-level mask helpers (importable / testable, no GPU state)
# ---------------------------------------------------------------------------
def _dilate_mask(mask_bool, radius_px: int):
    """Expand a boolean mask outward by `radius_px` using an elliptical kernel.

    Rounder than a box kernel (less corner blockiness). Returns the input
    unchanged when radius <= 0 or the mask is empty.
    """
    import numpy as np

    if radius_px <= 0:
        return mask_bool
    arr = np.asarray(mask_bool)
    if not arr.any():
        return arr

    import cv2

    k = 2 * int(radius_px) + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    dilated = cv2.dilate(arr.astype("uint8"), kernel, iterations=1)
    return dilated.astype(bool)


def _read_masks_field(result):
    """Pull the `masks` payload out of a SAM 3 output dict / inference state.

    The processor returns (or mutates into) a mapping carrying `masks`,
    `boxes`, and `scores`. We read defensively via mapping access first, then
    attribute access, so minor container-type changes don't break us.
    """
    for key in ("masks", "pred_masks"):
        try:
            val = result[key]
            if val is not None:
                return val
        except (TypeError, KeyError, IndexError):
            pass
        val = getattr(result, key, None)
        if val is not None:
            return val
    return None


def _extract_masks(result, shape):
    """Coerce a SAM 3 output into a list of boolean HxW masks at `shape`.

    Handles bool / integer / probability / logit mask tensors, and resizes any
    mask that isn't already at the source (H, W) using nearest-neighbour.
    """
    import numpy as np
    import torch
    from PIL import Image

    target_h, target_w = shape

    def _to_bool(arr):
        if isinstance(arr, torch.Tensor):
            arr = arr.detach().cpu().float().numpy()
        arr = np.squeeze(np.asarray(arr))
        if arr.dtype == bool:
            b = arr
        elif np.issubdtype(arr.dtype, np.integer):
            b = arr > 0
        else:
            # Floats: probabilities live in [0,1] (threshold 0.5); anything
            # outside that range is treated as logits (threshold 0.0).
            thr = 0.5 if (arr.min() >= 0.0 and arr.max() <= 1.0) else 0.0
            b = arr > thr
        if b.shape != (target_h, target_w):
            b = (
                np.asarray(
                    Image.fromarray(b.astype("uint8") * 255).resize(
                        (target_w, target_h), Image.NEAREST
                    )
                )
                > 127
            )
        return b

    masks = _read_masks_field(result)
    if masks is None:
        return []

    if isinstance(masks, torch.Tensor):
        masks = masks.detach().cpu().numpy()
    masks = np.asarray(masks)

    if masks.size == 0:
        return []

    out = []
    if masks.ndim == 2:
        out.append(_to_bool(masks))
    else:  # (N, H, W) or (N, 1, H, W)
        flat = masks.reshape(-1, masks.shape[-2], masks.shape[-1])
        for i in range(flat.shape[0]):
            out.append(_to_bool(flat[i]))
    return out


def _encode_mask_png(mask_bool) -> str:
    """Encode a boolean HxW mask as a base64 PNG (white fg, black bg)."""
    import numpy as np
    from PIL import Image

    arr = (np.asarray(mask_bool).astype("uint8")) * 255
    img = Image.fromarray(arr, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ---------------------------------------------------------------------------
# Web endpoint
# ---------------------------------------------------------------------------
@app.function(image=sam3_image, timeout=600)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
def scan(payload: dict) -> dict:
    """Secure POST endpoint consumed by the SquareRate scan pipeline.

    Protected by Modal proxy auth: callers must send valid `Modal-Key` /
    `Modal-Secret` headers (from a Proxy Auth Token created in the Modal
    dashboard). Unauthorized requests are rejected at Modal's edge before any
    GPU container starts, so abuse costs nothing.

    Ingests the job payload, runs SAM 3.1 with the surface text prompt bounded
    by the user's boxes, and returns a single binary mask PNG.
    """
    job_id = payload.get("jobId", "")
    image_url = payload.get("image_url")
    image_b64 = payload.get("image_b64")
    prompt = payload.get("prompt")
    boxes = payload.get("boxes", [])
    frame_size = int(payload.get("frame_size", DEFAULT_FRAME))

    if prompt is None:
        return {"jobId": job_id, "error": "Missing 'prompt'."}
    if not image_url and not image_b64:
        return {"jobId": job_id, "error": "Missing 'image_url' or 'image_b64'."}

    result = Sam3Predictor().segment.remote(
        image_url=image_url,
        image_b64=image_b64,
        prompt=prompt,
        boxes=boxes,
        frame_size=frame_size,
    )
    result["jobId"] = job_id
    return result
