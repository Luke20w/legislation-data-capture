const pupeteer = require("puppeteer");
const crawler = require("crawler-request");
const fs = require("fs");
const FlexSearch = require("flexsearch");

// Import the bills array from file
const bills = require("./bills.json");

// Create search index and import the saved index from file
var searchIndex = new FlexSearch("score");
searchIndex.import(require("./search-index.json"));

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
    // Get the name of the bill
    const name = await page.$eval(
      "tr:nth-child(" + (i + 2) + ") > td[class=legislationCell] > a > span",
      (span) => {
        return span.innerText;
      }
    );

    // Get the status of the bill
    const status = await page.$eval(
      "tr:nth-child(" + (i + 2) + ") > td[class=statusCell] > span",
      (span) => {
        return span.innerText;
      }
    );

    // Check if the bill is newly introduced or reported
    if (status == "As Introduced" || status.includes("As Reported")) {
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

        // Convert the pdf to a string
        const rawContent = await crawler(pdfLink).then(
          (response) => response.text
        );

        // Split the raw content into an array of its lines
        const rawLines = rawContent.split(/\r\n|\r|\n/);

        // Filter the lines array to remove bloat from the original pdf
        const lines = rawLines.filter((line) => {
          return !(
            !isNaN(line) ||
            line.includes("As Introduced") ||
            line.includes("Page ") ||
            line.includes(name)
          );
        });

        // Put the array of lines back together into one string
        var content = "";
        for (const line of lines) {
          content += line + "\n";
        }

        // Split the filtered content into seperate sections
        var sections = content.split("Sec. ");
        for (i = 0; i < sections.length; i++) {
          const sectionWords = sections[i].split(" ");
          sections[i] = {
            name: "Sec." + " " + sectionWords[0],
            content: "Sec. " + sections[i],
          };
        }

        // Add the bill object to the array
        bills.push({ name: name, title: title, sections: sections });

        // Add each section to the search index
        for (s = 0; s < bills[bills.length - 1].sections.length; s++) {
          console.log(
            "Adding Bill index " +
              (bills.length - 1) +
              ", Section index " +
              s +
              " to the search index..."
          );
          searchIndex.add(
            { bill: bills.length - 1, section: s },
            bills[bills.length - 1].sections[s].content
          );
        }

        // Go back to the table page
        await page.goBack();
      }
    } else {
      // Remove any bills in the array that have been passed
      const index = bills.findIndex((bill) => bill.name === name);
      if (index != -1) {
        bills.splice(index);
      }
    }
  }

  // Save the bills array to file
  fs.writeFileSync("./bills.json", JSON.stringify(bills, null, 2), "utf-8");

  // Save the search index to file
  fs.writeFileSync(
    "./search-index.json",
    JSON.stringify(searchIndex.export(), null, 2),
    "utf-8"
  );

  // Close the browser
  console.log("closing browser...");
  browser.close();
}

function search(query) {
  const resultsIDs = searchIndex.search(query);
  var results = [];
  for (i = 0; i < resultsIDs.length; i++) {
    results.push(bills[resultsIDs[i].bill].sections[resultsIDs[i].section]);
  }
  return results;
}

console.log(search("graduation requirements"));
