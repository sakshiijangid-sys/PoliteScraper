function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  return `£${Number(value).toFixed(2)}`;
}

function renderBookRows(books) {
  return books.map((book) => `
    <tr>
      <td>${escapeHtml(book.title)}</td>
      <td>${money(book.price)}</td>
      <td>${escapeHtml(book.rating)}</td>
      <td><a href="${escapeHtml(book.url)}">${escapeHtml(book.url)}</a></td>
    </tr>`).join("");
}

function renderOrderRows(orders) {
  return orders.map((order) => `
    <tr>
      <td>${escapeHtml(order.id)}</td>
      <td>${escapeHtml(order.product)}</td>
      <td>${money(order.amount)}</td>
      <td>${escapeHtml(order.ordered_at)}</td>
    </tr>`).join("");
}

function buildReportHtml(report, date = new Date()) {
  const dateText = date.toISOString().slice(0, 10);
  const useBooks = report.bookstore.totalBooks > 0;
  const totals = useBooks
    ? `
      <div class="total"><span>Total books</span><strong>${report.bookstore.totalBooks}</strong></div>
      <div class="total"><span>Average price</span><strong>${money(report.bookstore.averagePrice)}</strong></div>`
    : `
      <div class="total"><span>Total orders</span><strong>${report.shop.totalOrders}</strong></div>
      <div class="total"><span>Total revenue</span><strong>${money(report.shop.totalRevenue)}</strong></div>`;
  const topRows = useBooks
    ? report.bookstore.topExpensiveBooks.map((book) => `
      <tr><td>${escapeHtml(book.title)}</td><td>${money(book.price)}</td></tr>`).join("")
    : report.shop.topProducts.map((product) => `
      <tr><td>${escapeHtml(product.product)}</td><td>${money(product.revenue)}</td></tr>`).join("");
  const detailRows = useBooks
    ? renderBookRows(report.bookstore.topExpensiveBooks.length < report.bookstore.totalBooks
      ? report.bookstore.allBooks || []
      : report.bookstore.topExpensiveBooks)
    : renderOrderRows(report.shop.allOrders || []);
  const detailHeader = useBooks
    ? "<th>Title</th><th>Price</th><th>Rating</th><th>URL</th>"
    : "<th>ID</th><th>Product</th><th>Amount</th><th>Ordered at</th>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Report ${escapeHtml(dateText)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { color: #1f2933; font-family: Arial, sans-serif; font-size: 10pt; margin: 0; }
    h1 { color: #0f4c5c; margin: 0 0 16px; }
    h2 { color: #0f4c5c; font-size: 14pt; margin: 22px 0 8px; }
    .totals { display: flex; gap: 12px; margin-bottom: 18px; }
    .total { border: 1px solid #b8c4ce; padding: 10px 14px; width: 180px; }
    .total span, .total strong { display: block; }
    .total span { color: #52606d; font-size: 9pt; }
    .total strong { font-size: 16pt; margin-top: 4px; }
    table { border-collapse: collapse; margin: 0 0 16px; width: 100%; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #cbd5df; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #e6f0f2; color: #0f4c5c; }
    tr { break-inside: avoid; }
    a { color: #0f4c5c; overflow-wrap: anywhere; }
    .long-table { page-break-before: always; }
  </style>
</head>
<body>
  <h1>Report for ${escapeHtml(dateText)}</h1>
  <div class="totals">${totals}
  </div>
  <h2>Top 5 ${useBooks ? "most expensive books" : "products by revenue"}</h2>
  <table>
    <thead><tr><th>${useBooks ? "Title" : "Product"}</th><th>${useBooks ? "Price" : "Revenue"}</th></tr></thead>
    <tbody>${topRows}</tbody>
  </table>
  <h2 class="long-table">${useBooks ? "All books" : "All orders"}</h2>
  <table>
    <thead><tr>${detailHeader}</tr></thead>
    <tbody>${detailRows}</tbody>
  </table>
</body>
</html>`;
}

module.exports = { buildReportHtml };