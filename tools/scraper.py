import httpx
from bs4 import BeautifulSoup

def scrape_page(url: str, max_chars: int = 3000) -> str:
    """
    Fetch and extract clean text from a webpage.
    Strips all HTML tags, scripts, and styles.
    Returns plain text capped at max_chars.
    """
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        response = httpx.get(url, headers=headers, timeout=10, follow_redirects=True)
        if response.status_code != 200:
            return f"Failed to fetch page (status {response.status_code})"

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove scripts, styles, nav, footer — we only want main content
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        # Get clean text
        text = soup.get_text(separator=" ", strip=True)

        # Collapse multiple spaces/newlines
        import re
        text = re.sub(r'\s+', ' ', text).strip()

        return text[:max_chars]

    except Exception as e:
        return f"Scraping error: {e}"