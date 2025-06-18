import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  recipient: text("recipient").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  traceId: text("trace_id").notNull(),
  spanId: text("span_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const traces = pgTable("traces", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull().unique(),
  rootSpanId: text("root_span_id").notNull(),
  status: text("status").notNull().default("active"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const spans = pgTable("spans", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  spanId: text("span_id").notNull().unique(),
  parentSpanId: text("parent_span_id"),
  operationName: text("operation_name").notNull(),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull().default("success"),
  duration: integer("duration").notNull(), // in milliseconds
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  tags: text("tags"), // JSON string
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  amount: true,
  currency: true,
  recipient: true,
  description: true,
}).extend({
  currency: z.string().default("USD"),
});

export const insertTraceSchema = createInsertSchema(traces).pick({
  traceId: true,
  rootSpanId: true,
});

export const insertSpanSchema = createInsertSchema(spans).pick({
  traceId: true,
  spanId: true,
  parentSpanId: true,
  operationName: true,
  serviceName: true,
  status: true,
  duration: true,
  startTime: true,
  endTime: true,
  tags: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Trace = typeof traces.$inferSelect;

export type InsertSpan = z.infer<typeof insertSpanSchema>;
export type Span = typeof spans.$inferSelect;
