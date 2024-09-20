const { chromium } = require("playwright");
const { createObjectCsvWriter } = require("csv-writer");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to Stack Overflow...");
  await page.goto("https://stackoverflow.com/questions", {
    waitUntil: "domcontentloaded",
    timeout: 600000,
  });

  try {
    const cookieModalSelector = "#onetrust-accept-btn-handler";
    await page.waitForSelector(cookieModalSelector, { timeout: 5000 });
    await page.click(cookieModalSelector);
    console.log("Accepted cookie consent.");
  } catch (error) {
    console.log("No cookie consent modal appeared.");
  }

  // Filter by JavaScript
  await page.click('a[href*="/questions?tab=Newest"]');
  await page.click('button[aria-controls="uql-form"]');
  await page.fill(
    'input[role="combobox"][placeholder="e.g. javascript or python"]',
    "javascript"
  );
  await page.click('button[data-se-uql-target="applyButton"]');
  await page.waitForSelector(".s-post-summary", { timeout: 10000 });

  // Select page size
  await page.click('a.s-pagination--item[href*="pagesize=50"]');
  await page.waitForSelector(".s-post-summary", { timeout: 10000 });

  const allQuestions = [];

  for (let pageNumber = 1; pageNumber <= 2; pageNumber++) {
    console.log(`Extracting questions from page ${pageNumber}...`);
    const extractedQuestions = await extractQuestions(page);
    allQuestions.push(...extractedQuestions);

    if (pageNumber < 2) {
      // Navigate to the next page only if not the last one
      await page.click(`a.s-pagination--item[href*="page=${pageNumber + 1}"]`);
      await page.waitForSelector(".s-post-summary", { timeout: 10000 });
    }
  }

  const questionsData = allQuestions.slice(0, 100);

  const csvWriter = createObjectCsvWriter({
    path: "questions.csv",
    header: [
      { id: "title", title: "Title" },
      { id: "tags", title: "Tags" },
      { id: "votes", title: "Votes" },
      { id: "timestamp", title: "Timestamp" },
      { id: "userId", title: "User ID" },
    ],
  });

  await csvWriter.writeRecords(questionsData);
  console.log(
    `Extracted ${questionsData.length} questions. Data saved to questions.csv`
  );

  let isSorted = true;
  for (let i = 1; i < questionsData.length; i++) {
    if (new Date(questionsData[i - 1].timestamp) < new Date(questionsData[i].timestamp)) {
      isSorted = false;
      break;
    }
  }

  const allTagsPresent = questionsData.every(q => q.tags.includes('javascript'));

  console.log(`Validation: Questions sorted by newest - ${isSorted}`);
  console.log(`Validation: All questions have 'javascript' tag - ${allTagsPresent}`);

  await browser.close(); 
})();

async function extractQuestions(page) {
  return await page.evaluate(() => {
    const questions = [];
    const questionElements = document.querySelectorAll(".s-post-summary");
    questionElements.forEach((questionElement) => {
      const titleElement = questionElement.querySelector(
        "h3.s-post-summary--content-title a"
      );
      const tags = Array.from(
        questionElement.querySelectorAll(".s-post-summary--meta-tags a")
      ).map((tag) => tag.innerText.trim());
      const votesElement = questionElement.querySelector(
        ".s-post-summary--stats-item__emphasized .s-post-summary--stats-item-number"
      );
      const timestampElement = questionElement.querySelector(
        ".s-user-card--time span[title]"
      );

      questions.push({
        title: titleElement ? titleElement.innerText.trim() : "No title",
        tags: tags.join(", "),
        votes: votesElement ? votesElement.innerText.trim() : "0",
        timestamp: timestampElement
          ? timestampElement.getAttribute("title")
          : "No timestamp",
        userId:
          questionElement
            .querySelector(".s-user-card--avatar")
            ?.getAttribute("data-user-id") || "Unknown",
      });
    });
    return questions;
  });
}
