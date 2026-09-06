const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  createReportRecord,
  deleteReportRecord,
  getReportRecord,
  updateReportPath,
} = require("./report");
const { renderReportPdf } = require("./pdf");

const PORT = 3000;
const REPORTS_DIRECTORY = path.join(__dirname, "..", "reports");

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function createReport(response) {
  let report;
  try {
    report = createReportRecord("", new Date().toISOString());
    const reportPath = path.join(REPORTS_DIRECTORY, `${report.id}.pdf`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await renderReportPdf(reportPath);
    report = updateReportPath(report.id, `reports/${report.id}.pdf`);
    sendJson(response, 201, { id: report.id, file: report.file });
  } catch (error) {
    if (report) {
      deleteReportRecord(report.id);
    }
    console.error(error);
    sendJson(response, 500, { error: "Could not generate report" });
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/reports") {
    createReport(response);
    return;
  }

  const reportMatch = requestUrl.pathname.match(/^\/reports\/(\d+)(\/file)?$/);
  if (request.method === "GET" && reportMatch) {
    const report = getReportRecord(Number(reportMatch[1]));
    if (!report) {
      sendJson(response, 404, { error: "Report not found" });
      return;
    }

    if (reportMatch[2] === "/file" || requestUrl.searchParams.has("file")) {
      const filePath = path.resolve(__dirname, "..", report.path);
      if (!filePath.startsWith(`${path.resolve(REPORTS_DIRECTORY)}${path.sep}`) || !fs.existsSync(filePath)) {
        sendJson(response, 404, { error: "Report file not found" });
        return;
      }
      response.writeHead(200, { "Content-Type": "application/pdf" });
      fs.createReadStream(filePath).pipe(response);
      return;
    }

    sendJson(response, 200, report);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Health server listening on http://localhost:${PORT}`);
});