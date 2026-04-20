import asyncio
from collections import defaultdict
from typing import Callable, Any


class EventBus:
    def __init__(self):
        self._async_handlers: dict[str, list[tuple[Callable, str]]] = defaultdict(list)
        self._sync_handlers:  dict[str, list[tuple[Callable, str]]] = defaultdict(list)

    def subscribe(self, event: str, handler: Callable, plugin_id: str) -> None:
        self._async_handlers[event].append((handler, plugin_id))

    def subscribe_sync(self, event: str, handler: Callable, plugin_id: str) -> None:
        self._sync_handlers[event].append((handler, plugin_id))

    async def publish(self, event: str, payload: Any = None) -> None:
        for handler, _ in list(self._sync_handlers.get(event, [])):
            try:
                handler(payload)
            except Exception:
                pass
        coros = []
        for handler, _ in list(self._async_handlers.get(event, [])):
            result = handler(payload)
            if asyncio.iscoroutine(result):
                coros.append(result)
        if coros:
            await asyncio.gather(*coros, return_exceptions=True)

    def unsubscribe_plugin(self, plugin_id: str) -> None:
        for d in (self._async_handlers, self._sync_handlers):
            for event in list(d.keys()):
                d[event] = [(h, pid) for h, pid in d[event] if pid != plugin_id]
