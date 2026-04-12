import httpx

client = httpx.AsyncClient(
    headers={"User-Agent": "Mozilla/5.0"},
    follow_redirects=True,
    timeout=10,
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
)
