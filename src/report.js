const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const database = new DatabaseSync(path.join(__dirname, "..", "report.db"));

database.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    product TEXT NOT NULL,
    amount REAL NOT NULL,
    ordered_at TEXT NOT NULL
  )
`);

function getReportData() {
  const shop = {
    totalOrders: database
      .prepare("SELECT COUNT(*) AS total_orders FROM orders")
      .get().total_orders,
    totalRevenue: database
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM orders")
      .get().total_revenue,
    topProducts: database
      .prepare(`
        SELECT product, SUM(amount) AS revenue
        FROM orders
        GROUP BY product
        ORDER BY revenue DESC
        LIMIT 5
      `)
      .all(),
    ordersPerDay: database
      .prepare(`
        SELECT date(ordered_at) AS day, COUNT(*) AS orders
        FROM orders
        WHERE date(ordered_at) >= date('now', '-6 days')
        GROUP BY day
        ORDER BY day
      `)
      .all(),
  };

  const bookstore = {
    totalBooks: database
      .prepare("SELECT COUNT(*) AS total_books FROM books")
      .get().total_books,
    averagePrice: database
      .prepare("SELECT AVG(price) AS average_price FROM books")
      .get().average_price,
    topExpensiveBooks: database
      .prepare(`
        SELECT id, title, price, rating, url
        FROM books
        ORDER BY price DESC
        LIMIT 5
      `)
      .all(),
    booksPerRating: database
      .prepare(`
        SELECT rating, COUNT(*) AS books
        FROM books
        GROUP BY rating
        ORDER BY rating
      `)
      .all(),
  };

  return { shop, bookstore };
}

module.exports = { getReportData };