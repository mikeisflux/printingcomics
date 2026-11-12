import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # Launch headless browser
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Listen to console messages and errors
        page.on("console", lambda msg: print(f"CONSOLE {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGEERROR: {err}"))
        
        print("Navigating to local HTML file...")
        try:
            await page.goto("file:///Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html")
            # Wait a few seconds for Babel to compile and mount the app
            await asyncio.sleep(5)
        except Exception as e:
            print(f"Navigation error: {e}")
            
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
