import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assessmentEmailsTable = pgTable("assessment_emails", {
  sid: text("sid").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const insertAssessmentEmailSchema = createInsertSchema(
  assessmentEmailsTable,
).omit({ createdAt: true, updatedAt: true, sentAt: true });

export type InsertAssessmentEmail = z.infer<typeof insertAssessmentEmailSchema>;
export type AssessmentEmail = typeof assessmentEmailsTable.$inferSelect;
