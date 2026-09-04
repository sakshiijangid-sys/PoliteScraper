const { z } = require("zod");

const bookRecordSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_text: z.string().min(1),
  ptice_gbp: z.number().nonnegative(),
  availability_text: z.string().min(1),
  rating_text: z.string().min(1).nullable(),
  description: z.string().min(1).nullable().optional(),
  source_page: z.string().url(),
  fetched_at: z.string().datetime(),
}).strict();

module.exports = { bookRecordSchema };
