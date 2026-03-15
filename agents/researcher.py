from tools.search import search_web
from tools.scraper import scrape_page

async def research_query(query: str, scrape_top: int = 2) -> dict:
    """
    For a given search query:
    1. Search the web with Tavily
    2. Scrape the top N results for deeper content
    3. Return combined findings

    Returns a dict with query, search results, and scraped content.
    """
    print(f"  [Researcher] Searching: {query}")

    # Step 1 — Search
    results = search_web(query, max_results=5)

    if not results:
        return {"query": query, "results": [], "scraped": []}

    # Step 2 — Scrape top results for deeper content
    scraped = []
    for result in results[:scrape_top]:
        print(f"  [Researcher] Scraping: {result['url']}")
        content = scrape_page(result["url"])
        scraped.append({
            "url": result["url"],
            "title": result["title"],
            "content": content
        })

    return {
        "query": query,
        "results": results,       # all search snippets
        "scraped": scraped        # deep content from top pages
    }