"""Console timing instrumentation for the verification pipeline.

Wraps a node/helper function so every call logs how long it took and, where possible,
which triplet it ran on - so a slow /verify-graph request can be traced to a specific
edge and a specific step (evaluator vs corrector vs resolver vs hinter) instead of just
being "slow" as a whole.
"""
import functools
import inspect
import logging
import time

logger = logging.getLogger(__name__)

def _label(args, kwargs) -> str:
    """Best-effort (subject, predicate, object) string for the call being timed."""
    state = args[0] if args else kwargs.get("state")
    triplet = None
    if isinstance(state, dict):
        triplet = state.get("current_triplet")
    elif kwargs.get("triplet") is not None:
        triplet = kwargs["triplet"]
    elif len(args) >= 3 and isinstance(args[2], dict):
        triplet = args[2]  # check_triplet(source_text, existing_graph, triplet)
    if isinstance(triplet, dict):
        return f"({triplet.get('subject')}, {triplet.get('predicate')}, {triplet.get('object')})"
    return ""


def log_timing(func):
    """Log `func_name label took N.NNs` to the console around a sync or async call."""
    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            label = _label(args, kwargs)
            start = time.perf_counter()
            logger.info(f"-> {func.__name__} {label} started")
            try:
                return await func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                logger.info(f"<- {func.__name__} {label} took {elapsed:.2f}s")
        return async_wrapper

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        label = _label(args, kwargs)
        start = time.perf_counter()
        logger.info(f"-> {func.__name__} {label} started")
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = time.perf_counter() - start
            logger.info(f"<- {func.__name__} {label} took {elapsed:.2f}s")
    return sync_wrapper
