import asyncio
from playwright.async_api import async_playwright

async def test_nav():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        errors = []
        page.on("pageerror", lambda err: errors.append(err.message))
        
        # Navigate to the local file
        url = "file:///Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html"
        print("Navigating to page...")
        await page.goto(url)
        await page.wait_for_timeout(2000)
        
        # Try clicking on different nav elements
        nav_texts = ["Services", "Apply", "Login"]
        for text in nav_texts:
            print(f"Clicking on '{text}'...")
            try:
                # Find element containing text
                elem = page.locator(f"text={text}")
                await elem.click()
                await page.wait_for_timeout(1000)
                print(f"Current page URL: {page.url}")
            except Exception as e:
                print(f"Failed to click '{text}': {e}")
                
        if errors:
            print("\n!!! PAGE ERRORS DETECTED !!!")
            for err in errors:
                print("-", err)
        else:
            print("\nNo runtime errors detected during navigation.")
            
        await browser.close()

if __name__ == '__main__':
    asyncio.run(test_nav())
