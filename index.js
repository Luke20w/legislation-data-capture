const pupeteer = require("puppeteer");
const crawler = require("crawler-request");
const fs = require("fs");

const bills = require("./bills.json");

async function scrapeNewBills() {
  // Open the Ohio legislature page in a headless browser
  const browser = await pupeteer.launch({
    headless: true,
    executablePath:
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();
  const url =
    "https://www.legislature.ohio.gov/legislation/search?generalAssemblies=133&pageSize=500&sort=Number&start=1&subjects=21";
  await page.goto(url);
  console.log("browser opened...");

  // Get the total number of bills in the table
  const rowCount = await page.$$eval("tr", (trs) => trs.length - 1);

  for (i = 0; i < rowCount; i++) {
    // Get the status of the bill
    const status = await page.$eval(
      "tr:nth-child(" + (i + 2) + ") > td[class=statusCell] > span",
      (span) => {
        return span.innerText;
      }
    );

    // Check if the bill is newly introduced or reported
    if (status == "As Introduced" || status.includes("As Reported")) {
      // Get the name of the bill
      const name = await page.$eval(
        "tr:nth-child(" + (i + 2) + ") > td[class=legislationCell] > a > span",
        (span) => {
          return span.innerText;
        }
      );

      // Get the title of the bill
      const title = await page.$eval(
        "tr:nth-child(" + (i + 2) + ") > td[class=titleCell] > span",
        (span) => {
          return span.innerText;
        }
      );

      // Check if the bill is not already in the array
      if (!bills.some((bill) => bill.name === name)) {
        console.log("Parsing " + name + "...");

        // Go to the bill page cooresponding to the index
        await page.click(
          "tr:nth-child(" + (i + 2) + ") > td[class=legislationCell] > a"
        );

        // Wait for the pdf link button to load in
        await page.waitFor(".linkButton");

        // Get the link to the bill pdf
        const pdfLink = await page.$eval(".linkButton", (a) => a.href);

        // Convert the pdf to a string and add it to the array of bills
        crawler(pdfLink).then((response) => {
          bills.push({ name: name, title: title, content: response.text });
        });

        // Go back to the table page
        await page.goBack();
      }
    }
  }

  // Saves the bills array to the bills.json file
  fs.writeFileSync("./bills.json", JSON.stringify(bills, null, 2), "utf-8");

  console.log("closing browser...");
  browser.close();
}

scrapeNewBills();
