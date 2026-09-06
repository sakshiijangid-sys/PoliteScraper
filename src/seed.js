const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const booksPath = path.join(__dirname, "..", "output", "books.json");
const databasePath = path.join(__dirname, "..", "report.db");
const ratingValues = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
};

const books = JSON.parse(fs.readFileSync(booksPath, "utf8"));
const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    rating REAL NOT NULL,
    url TEXT NOT NULL UNIQUE
  )
`);

const insertBook = database.prepare(`
  INSERT INTO books (title, price, rating, url)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    title = excluded.title,
    price = excluded.price,
    rating = excluded.rating
`);

for (const book of books) {
  insertBook.run(
    book.title,
    book.ptice_gbp,
    ratingValues[book.rating_text] ?? 0,
    book.product_url
  );
}

const result = database.prepare("SELECT COUNT(*) AS count FROM books").get();
console.log(`seeded ${result.count} books`);
database.close();