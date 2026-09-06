const path = require("node:path");
const { renderReportPdf } = require("./pdf");

async function main() {
  const reportsDirectory = path.join(__dirname, "..", "reports");
  await renderReportPdf(path.join(reportsDirectory, "test.pdf"));
  console.log("Created reports/test.pdf");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});